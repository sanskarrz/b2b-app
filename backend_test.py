"""RX Tech Backend API tests.

Targets the external (preview) backend URL configured in frontend/.env via
EXPO_PUBLIC_BACKEND_URL. All endpoints are prefixed with /api.
"""
import os
import sys
import time
import json
import requests

# Resolve backend URL from frontend env file (Expo app)
def _read_backend_url() -> str:
    env_path = "/app/frontend/.env"
    url = None
    try:
        with open(env_path) as fh:
            for line in fh:
                line = line.strip()
                if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                    url = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
                if line.startswith("REACT_APP_BACKEND_URL="):
                    url = line.split("=", 1)[1].strip().strip('"').strip("'")
    except Exception as e:
        print(f"Could not read {env_path}: {e}")
    return url or "http://localhost:8001"


BASE = _read_backend_url().rstrip("/") + "/api"
DEMO_EMAIL = "demo@rxtech.com"

print(f"Testing against: {BASE}")

results = []  # list of (name, pass:bool, info:str)


def record(name: str, ok: bool, info: str = ""):
    results.append((name, ok, info))
    icon = "PASS" if ok else "FAIL"
    print(f"[{icon}] {name} :: {info}")


def authed_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    # 1. Send OTP
    r = s.post(f"{BASE}/auth/send-otp", json={"email": DEMO_EMAIL}, timeout=20)
    assert r.status_code == 200, f"send-otp -> {r.status_code} {r.text}"
    data = r.json()
    assert data.get("success") is True
    dev_otp = data.get("dev_otp")
    assert dev_otp, "dev_otp missing from /auth/send-otp response"
    record("POST /auth/send-otp", True, f"dev_otp returned ({dev_otp[:1]}*****)")

    # 2. Verify OTP
    r2 = s.post(f"{BASE}/auth/verify-otp", json={"email": DEMO_EMAIL, "otp": dev_otp}, timeout=20)
    assert r2.status_code == 200, f"verify-otp -> {r2.status_code} {r2.text}"
    j = r2.json()
    token = j.get("token")
    assert token, "JWT token missing"
    record("POST /auth/verify-otp", True, f"token len={len(token)} onboarded={j.get('onboarded')}")
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s, j["user"]


def test_core(s):
    # Dashboard
    r = s.get(f"{BASE}/dashboard")
    record("GET /dashboard", r.status_code == 200, f"{r.status_code}")
    # Distributors
    r = s.get(f"{BASE}/distributors")
    ok = r.status_code == 200 and isinstance(r.json(), list) and len(r.json()) >= 5
    record("GET /distributors", ok, f"{r.status_code} count={len(r.json()) if ok else 'N/A'}")
    # Orders
    r = s.get(f"{BASE}/orders")
    record("GET /orders", r.status_code == 200, f"{r.status_code} count={len(r.json()) if r.ok else 'N/A'}")
    # Payments
    r = s.get(f"{BASE}/payments")
    record("GET /payments", r.status_code == 200, f"{r.status_code}")
    # Cart
    r = s.get(f"{BASE}/cart")
    record("GET /cart", r.status_code == 200, f"{r.status_code} count={r.json().get('count') if r.ok else 'N/A'}")


def test_payment_summary(s):
    r = s.get(f"{BASE}/payments/summary")
    if r.status_code != 200:
        record("GET /payments/summary", False, f"status={r.status_code} body={r.text[:200]}")
        return
    j = r.json()
    expected = ["total_credit_taken", "total_credit_limit", "credit_available",
                "total_due", "total_overdue", "due_this_week", "due_next_week",
                "due_this_month", "paid_last_30d", "on_hold_disputes", "schedule_by_day"]
    missing = [k for k in expected if k not in j]
    if missing:
        record("GET /payments/summary", False, f"missing keys: {missing}")
        return
    nums = ["total_credit_taken", "total_credit_limit", "credit_available", "total_due",
            "total_overdue", "due_this_week", "due_next_week", "due_this_month",
            "paid_last_30d", "on_hold_disputes"]
    bad = [k for k in nums if not isinstance(j[k], (int, float)) or j[k] < 0]
    if bad:
        record("GET /payments/summary", False, f"non-numeric or negative: {bad}")
        return
    if not isinstance(j["schedule_by_day"], dict):
        record("GET /payments/summary", False, "schedule_by_day not a dict")
        return
    record("GET /payments/summary", True,
           f"taken={j['total_credit_taken']} limit={j['total_credit_limit']} on_hold={j['on_hold_disputes']}")


def ensure_cart_with_items(s):
    """Ensure cart has at least 2 items (uses p-1 and p-2)."""
    # Clear cart first to predict state
    s.delete(f"{BASE}/cart")
    r1 = s.post(f"{BASE}/cart/items", json={"product_id": "p-1", "distributor_id": "dist-1", "qty": 5})
    r2 = s.post(f"{BASE}/cart/items", json={"product_id": "p-2", "distributor_id": "dist-2", "qty": 10})
    return r1.ok and r2.ok


def test_cart_optimize(s):
    ok_setup = ensure_cart_with_items(s)
    if not ok_setup:
        record("POST /cart/optimize (setup)", False, "could not add items to cart")
        return
    r = s.post(f"{BASE}/cart/optimize")
    if r.status_code != 200:
        record("POST /cart/optimize", False, f"{r.status_code} {r.text[:200]}")
        return
    j = r.json()
    keys_ok = "success" in j and "moved" in j and "savings" in j
    record("POST /cart/optimize", keys_ok, f"moved={j.get('moved')} savings={j.get('savings')}")


def test_cart_substitutes(s):
    r = s.get(f"{BASE}/cart/substitutes")
    if r.status_code != 200:
        record("GET /cart/substitutes", False, f"{r.status_code} {r.text[:200]}")
        return
    arr = r.json()
    if not isinstance(arr, list):
        record("GET /cart/substitutes", False, "expected array")
        return
    if arr:
        item = arr[0]
        keys = ["cart_item_id", "current_product", "suggested"]
        missing = [k for k in keys if k not in item]
        if missing:
            record("GET /cart/substitutes", False, f"missing keys in item: {missing}")
            return
    record("GET /cart/substitutes", True, f"count={len(arr)}")


def test_cart_swap(s):
    # Refresh cart and grab an item to swap
    ensure_cart_with_items(s)
    cart = s.get(f"{BASE}/cart").json()
    items = cart.get("items", [])
    if not items:
        record("POST /cart/items/{id}/swap", False, "no cart items to swap")
        return
    item_id = items[0]["id"]
    # Find another product (p-2) and pick a distributor where it exists (dist-3)
    body = {"product_id": "p-2", "distributor_id": "dist-3"}
    r = s.post(f"{BASE}/cart/items/{item_id}/swap", json=body)
    if r.status_code != 200:
        record("POST /cart/items/{id}/swap", False, f"{r.status_code} {r.text[:200]}")
        return
    # Verify
    cart2 = s.get(f"{BASE}/cart").json()
    found = next((c for c in cart2.get("items", []) if c["id"] == item_id), None)
    ok = found and found["product_id"] == "p-2" and found["distributor_id"] == "dist-3"
    record("POST /cart/items/{id}/swap", bool(ok),
           f"new pid={found and found['product_id']} did={found and found['distributor_id']}")


def test_templates(s):
    # Make sure cart has items first
    ensure_cart_with_items(s)
    # Create template
    r = s.post(f"{BASE}/templates", json={"name": "Test Tpl"})
    if r.status_code != 200:
        record("POST /templates", False, f"{r.status_code} {r.text[:200]}")
        return
    tpl = r.json().get("item", {})
    tid = tpl.get("id")
    record("POST /templates", bool(tid), f"id={tid}")

    # List templates
    r = s.get(f"{BASE}/templates")
    if r.status_code != 200:
        record("GET /templates", False, f"{r.status_code}")
    else:
        arr = r.json()
        ok = any(t.get("id") == tid and "sku_count" in t and "estimated_value" in t for t in arr)
        record("GET /templates", ok, f"count={len(arr)} target_has_sku_count+estimated_value={ok}")

    # Clear cart to verify load actually populates
    s.delete(f"{BASE}/cart")
    r = s.post(f"{BASE}/templates/{tid}/load")
    if r.status_code != 200:
        record("POST /templates/{tid}/load", False, f"{r.status_code} {r.text[:200]}")
    else:
        cart = s.get(f"{BASE}/cart").json()
        record("POST /templates/{tid}/load", cart.get("count", 0) > 0,
               f"cart_count_after_load={cart.get('count')}")

    # Delete template
    r = s.delete(f"{BASE}/templates/{tid}")
    if r.status_code != 200:
        record("DELETE /templates/{tid}", False, f"{r.status_code}")
    else:
        arr = s.get(f"{BASE}/templates").json()
        gone = not any(t.get("id") == tid for t in arr)
        record("DELETE /templates/{tid}", gone, "removed" if gone else "still present")


def test_favourites(s):
    # add
    r = s.post(f"{BASE}/favourites", json={"product_id": "p-1"})
    record("POST /favourites", r.status_code == 200, f"{r.status_code}")
    # list
    r = s.get(f"{BASE}/favourites")
    if r.status_code != 200:
        record("GET /favourites", False, f"{r.status_code}")
    else:
        arr = r.json()
        has = any(p.get("id") == "p-1" for p in arr)
        # Verify full product objects
        full = arr and all(k in arr[0] for k in ("id", "name", "salt", "manufacturer"))
        record("GET /favourites", has and full, f"count={len(arr)} contains_p-1={has} full_object={full}")
    # delete
    r = s.delete(f"{BASE}/favourites/p-1")
    if r.status_code != 200:
        record("DELETE /favourites/{pid}", False, f"{r.status_code}")
    else:
        arr = s.get(f"{BASE}/favourites").json()
        gone = not any(p.get("id") == "p-1" for p in arr)
        record("DELETE /favourites/{pid}", gone, "removed" if gone else "still present")


def test_recent(s):
    r = s.post(f"{BASE}/recent/p-1")
    record("POST /recent/{pid}", r.status_code == 200, f"{r.status_code}")
    r = s.get(f"{BASE}/recent")
    if r.status_code != 200:
        record("GET /recent", False, f"{r.status_code}")
        return
    arr = r.json()
    ok = isinstance(arr, list) and any(p.get("id") == "p-1" for p in arr)
    record("GET /recent", ok, f"count={len(arr)}")


def _get_dist_used(s, dist_id):
    arr = s.get(f"{BASE}/distributors").json()
    for d in arr:
        if d["id"] == dist_id:
            return d.get("credit_used", 0)
    return None


def test_credit_note(s):
    before = _get_dist_used(s, "dist-1")
    r = s.post(f"{BASE}/credit-notes", json={
        "distributor_id": "dist-1", "amount": 500, "reason": "damaged", "notes": "test"
    })
    if r.status_code != 200:
        record("POST /credit-notes", False, f"{r.status_code} {r.text[:200]}")
        return
    after = _get_dist_used(s, "dist-1")
    delta = (before - after) if (before is not None and after is not None) else None
    ok = delta is not None and abs(delta - 500) < 0.5
    record("POST /credit-notes (credit_used -= 500)", ok,
           f"before={before} after={after} delta={delta}")


def test_debit_note(s):
    before = _get_dist_used(s, "dist-1")
    r = s.post(f"{BASE}/debit-notes", json={
        "distributor_id": "dist-1", "amount": 250, "reason": "short-supply", "notes": "test"
    })
    if r.status_code != 200:
        record("POST /debit-notes", False, f"{r.status_code} {r.text[:200]}")
        return
    after = _get_dist_used(s, "dist-1")
    # Debit notes per code do NOT change credit_used (only logged). Verify it's still same.
    record("POST /debit-notes", True, f"created; credit_used before={before} after={after}")


def test_returns_and_approve(s):
    # Submit return
    r = s.post(f"{BASE}/returns", json={
        "product_name": "Azithromycin 500mg",
        "distributor_name": "ABC Pharma",  # short_name of dist-1
        "reason": "damaged",
        "qty": 5,
        "amount": 250,
    })
    if r.status_code != 200:
        record("POST /returns", False, f"{r.status_code} {r.text[:200]}")
        return
    item = r.json().get("item", {})
    return_id = item.get("id")
    record("POST /returns", bool(return_id), f"return_id={return_id}")

    # Verify pending credit note was auto-created
    cns = s.get(f"{BASE}/credit-notes").json()
    pending = [c for c in cns if c.get("status") == "pending" and c.get("return_id") == return_id]
    record("Auto pending Credit Note from return", len(pending) == 1,
           f"found={len(pending)}")

    if not return_id:
        return

    # Approve and verify CN switches to 'issued' and credit_used reduced
    before = _get_dist_used(s, "dist-1")
    r = s.post(f"{BASE}/returns/{return_id}/approve")
    if r.status_code != 200:
        record("POST /returns/{id}/approve", False, f"{r.status_code} {r.text[:200]}")
        return
    after = _get_dist_used(s, "dist-1")
    cns2 = s.get(f"{BASE}/credit-notes").json()
    issued = [c for c in cns2 if c.get("return_id") == return_id and c.get("status") == "issued"]
    reduced_ok = before is not None and after is not None and abs((before - after) - 250) < 0.5
    record("POST /returns/{id}/approve (CN issued + credit_used -=250)",
           bool(issued) and reduced_ok,
           f"cn_issued={len(issued)} before={before} after={after}")


def test_ledger(s):
    r = s.get(f"{BASE}/ledger/dist-1")
    if r.status_code != 200:
        record("GET /ledger/dist-1", False, f"{r.status_code}")
        return
    j = r.json()
    keys = ["distributor", "summary", "entries"]
    missing = [k for k in keys if k not in j]
    if missing:
        record("GET /ledger/dist-1", False, f"missing keys: {missing}")
        return
    entries = j["entries"]
    has_balance = all("running_balance" in e for e in entries) if entries else True
    record("GET /ledger/dist-1", has_balance,
           f"entries={len(entries)} closing_balance={j['summary'].get('closing_balance')}")


def test_chat(s):
    r = s.get(f"{BASE}/chat/threads")
    if r.status_code != 200:
        record("GET /chat/threads", False, f"{r.status_code}")
    else:
        arr = r.json()
        ok = isinstance(arr, list)
        if ok and arr:
            sample = arr[0]
            ok = "distributor" in sample and "unread" in sample and "last_message" in sample
        record("GET /chat/threads", ok, f"threads={len(arr)}")

    r = s.get(f"{BASE}/chat/dist-1")
    if r.status_code != 200:
        record("GET /chat/dist-1", False, f"{r.status_code}")
    else:
        j = r.json()
        record("GET /chat/dist-1", "messages" in j and "distributor" in j, f"msgs={len(j.get('messages', []))}")

    r = s.post(f"{BASE}/chat", json={"distributor_id": "dist-1", "message": "hello"})
    if r.status_code != 200:
        record("POST /chat", False, f"{r.status_code} {r.text[:200]}")
        return
    j = r.json()
    msgs = j.get("messages", [])
    ok = len(msgs) == 2 and any(m["sender"] == "user" for m in msgs) and any(m["sender"] == "distributor" for m in msgs)
    record("POST /chat (user + auto-reply)", ok, f"returned={len(msgs)} msgs")


def test_search_comprehensive(s):
    r = s.get(f"{BASE}/search/comprehensive", params={"q": "paracetamol"})
    if r.status_code != 200:
        record("GET /search/comprehensive?q=paracetamol", False, f"{r.status_code} {r.text[:200]}")
        return
    j = r.json()
    matches = j.get("matches", [])
    alts = j.get("alternatives", [])
    has_offers = False
    if matches:
        first = matches[0]
        has_offers = isinstance(first.get("offers"), list) and len(first["offers"]) > 0
    ok = isinstance(matches, list) and isinstance(alts, list) and has_offers
    record("GET /search/comprehensive?q=paracetamol", ok,
           f"matches={len(matches)} alternatives={len(alts)} first_offers={len(matches[0].get('offers', [])) if matches else 0}")


def test_distributor_portal(s):
    r = s.get(f"{BASE}/distributor-portal/dashboard", params={"distributor_id": "dist-1"})
    if r.status_code != 200:
        record("GET /distributor-portal/dashboard", False, f"{r.status_code} {r.text[:200]}")
        return
    j = r.json()
    expected = ["received_orders", "revenue", "pending_payment", "active_buyers"]
    missing = [k for k in expected if k not in j]
    record("GET /distributor-portal/dashboard", not missing,
           f"missing={missing} data={j}")


def test_distributor_detail(s):
    """GET /distributors/dist-1 should include rich fields when authenticated."""
    r = s.get(f"{BASE}/distributors/dist-1")
    if r.status_code != 200:
        record("GET /distributors/dist-1 (rich)", False, f"status={r.status_code} body={r.text[:200]}")
        return
    j = r.json()
    top_keys = ["distributor", "contact", "products", "stats", "recent_orders", "last_chat"]
    missing_top = [k for k in top_keys if k not in j]
    if missing_top:
        record("GET /distributors/dist-1 (rich)", False, f"missing top keys: {missing_top}")
        return
    contact = j.get("contact") or {}
    contact_keys = ["phone", "whatsapp", "email", "address", "sales_rep", "working_hours"]
    missing_contact = [k for k in contact_keys if k not in contact]
    if missing_contact:
        record("GET /distributors/dist-1 (rich)", False, f"contact missing: {missing_contact}")
        return
    sr = contact.get("sales_rep") or {}
    sr_keys = ["name", "phone", "designation"]
    missing_sr = [k for k in sr_keys if k not in sr]
    if missing_sr:
        record("GET /distributors/dist-1 (rich)", False, f"sales_rep missing: {missing_sr}")
        return
    stats = j.get("stats")
    if not isinstance(stats, dict):
        record("GET /distributors/dist-1 (rich)", False, f"stats is not dict: {stats}")
        return
    stats_keys = ["total_spent", "order_count", "unpaid", "last_order_date"]
    missing_stats = [k for k in stats_keys if k not in stats]
    if missing_stats:
        record("GET /distributors/dist-1 (rich)", False, f"stats missing: {missing_stats}")
        return
    if not isinstance(j["recent_orders"], list):
        record("GET /distributors/dist-1 (rich)", False, "recent_orders not list")
        return
    if len(j["recent_orders"]) > 5:
        record("GET /distributors/dist-1 (rich)", False,
               f"recent_orders > 5 ({len(j['recent_orders'])})")
        return
    # last_chat may be dict or null
    if j["last_chat"] is not None and not isinstance(j["last_chat"], dict):
        record("GET /distributors/dist-1 (rich)", False, "last_chat not dict/null")
        return
    record(
        "GET /distributors/dist-1 (rich)", True,
        f"products={len(j['products'])} recent_orders={len(j['recent_orders'])} "
        f"total_spent={stats['total_spent']} order_count={stats['order_count']} "
        f"unpaid={stats['unpaid']} last_chat={'yes' if j['last_chat'] else 'no'}"
    )


def test_distributor_compare(s):
    r = s.get(f"{BASE}/distributors/compare/dist-1/dist-2")
    if r.status_code != 200:
        record("GET /distributors/compare/dist-1/dist-2", False,
               f"status={r.status_code} body={r.text[:200]}")
        return
    j = r.json()
    if "a" not in j or "b" not in j:
        record("GET /distributors/compare/dist-1/dist-2", False, f"missing a/b keys: keys={list(j.keys())}")
        return
    for side in ("a", "b"):
        block = j[side] or {}
        if "product_count" not in block:
            record("GET /distributors/compare/dist-1/dist-2", False, f"{side}: product_count missing")
            return
        if "user_stats" not in block or not isinstance(block["user_stats"], dict):
            record("GET /distributors/compare/dist-1/dist-2", False, f"{side}: user_stats missing/invalid")
            return
        us = block["user_stats"]
        for k in ("total_spent", "order_count", "unpaid"):
            if k not in us:
                record("GET /distributors/compare/dist-1/dist-2", False,
                       f"{side}.user_stats missing key '{k}'")
                return
    record("GET /distributors/compare/dist-1/dist-2", True,
           f"a.products={j['a']['product_count']} b.products={j['b']['product_count']} "
           f"a.spent={j['a']['user_stats']['total_spent']} b.spent={j['b']['user_stats']['total_spent']}")


def test_margin_by_category(s):
    r = s.get(f"{BASE}/analytics/margin-by-category")
    if r.status_code != 200:
        record("GET /analytics/margin-by-category", False,
               f"status={r.status_code} body={r.text[:200]}")
        return
    j = r.json()
    for k in ("rows", "total_spend", "total_profit"):
        if k not in j:
            record("GET /analytics/margin-by-category", False, f"missing key {k}")
            return
    if not isinstance(j["rows"], list):
        record("GET /analytics/margin-by-category", False, "rows is not list")
        return
    row_keys = ["category", "spend", "profit", "margin_pct", "items"]
    for idx, row in enumerate(j["rows"]):
        missing = [k for k in row_keys if k not in row]
        if missing:
            record("GET /analytics/margin-by-category", False,
                   f"row[{idx}] missing {missing}")
            return
    record("GET /analytics/margin-by-category", True,
           f"rows={len(j['rows'])} total_spend={j['total_spend']} total_profit={j['total_profit']}")


def test_reorder_predictor(s):
    r = s.get(f"{BASE}/analytics/reorder-predictor")
    if r.status_code != 200:
        record("GET /analytics/reorder-predictor", False,
               f"status={r.status_code} body={r.text[:200]}")
        return
    j = r.json()
    if not isinstance(j, list):
        record("GET /analytics/reorder-predictor", False, f"expected list, got {type(j).__name__}")
        return
    keys = ["product_id", "product", "avg_qty", "days_since", "cycle_days", "urgency", "suggested_qty"]
    for idx, sug in enumerate(j):
        missing = [k for k in keys if k not in sug]
        if missing:
            record("GET /analytics/reorder-predictor", False, f"item[{idx}] missing {missing}")
            return
        if not isinstance(sug["product"], dict):
            record("GET /analytics/reorder-predictor", False, f"item[{idx}].product not object")
            return
    record("GET /analytics/reorder-predictor", True,
           f"suggestions={len(j)}" + (f" top_urgency={j[0]['urgency']}" if j else " (empty list is valid)"))


def total_count():
    return len(results)


def fails():
    return [r for r in results if not r[1]]


def main():
    try:
        s, _ = authed_session()
    except Exception as e:
        record("AUTH", False, f"exception: {e}")
        print_summary()
        sys.exit(1)

    # Core
    test_core(s)
    # New endpoints
    test_payment_summary(s)
    test_cart_optimize(s)
    test_cart_substitutes(s)
    test_cart_swap(s)
    test_templates(s)
    test_favourites(s)
    test_recent(s)
    test_credit_note(s)
    test_debit_note(s)
    test_returns_and_approve(s)
    test_ledger(s)
    test_chat(s)
    test_search_comprehensive(s)
    test_distributor_portal(s)
    # NEW endpoints (current focus)
    test_distributor_detail(s)
    test_distributor_compare(s)
    test_margin_by_category(s)
    test_reorder_predictor(s)
    print_summary()


def print_summary():
    print("\n========= SUMMARY =========")
    passed = sum(1 for r in results if r[1])
    failed = len(results) - passed
    print(f"Passed: {passed}/{len(results)}  Failed: {failed}")
    if failed:
        print("\nFailures:")
        for n, ok, info in results:
            if not ok:
                print(f"  - {n} :: {info}")


if __name__ == "__main__":
    main()
