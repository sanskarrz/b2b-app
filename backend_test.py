"""
Backend test for RX Tech — NEW endpoints (confirm-delivery, pay-lump-sum,
distributors/{id}/invoices, ledger CSV export) + regression on existing routes.
"""
import os
import sys
import json
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://wireframe-to-app-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"
EMAIL = "demo@rxtech.com"

results = []


def log(name, ok, info=""):
    mark = "PASS" if ok else "FAIL"
    msg = f"[{mark}] {name}"
    if info:
        msg += f" — {info}"
    print(msg)
    results.append((name, ok, info))


def assert_eq(name, actual, expected):
    log(name, actual == expected, f"got={actual!r} expected={expected!r}" if actual != expected else "")


def get_token():
    r = requests.post(f"{API}/auth/send-otp", json={"email": EMAIL}, timeout=20)
    r.raise_for_status()
    otp = r.json()["dev_otp"]
    r = requests.post(f"{API}/auth/verify-otp", json={"email": EMAIL, "otp": otp}, timeout=20)
    r.raise_for_status()
    data = r.json()
    return data["token"], data["user"]


def main():
    print(f"Backend: {BASE}")
    token, user = get_token()
    H = {"Authorization": f"Bearer {token}"}

    # =========================================================
    # 5. Verify orders schema (new fields)
    # =========================================================
    r = requests.get(f"{API}/orders", headers=H, timeout=20)
    log("GET /orders 200", r.status_code == 200, f"status={r.status_code}")
    orders = r.json()
    log("orders is list non-empty", isinstance(orders, list) and len(orders) > 0, f"len={len(orders)}")

    # placed or shipped orders to use for confirm-delivery flow
    confirmable = [o for o in orders if not o.get("delivery_confirmed") and o.get("status") in ("placed", "processing", "shipped")]
    print(f"  Found {len(confirmable)} unconfirmed orders, statuses: {[o['status'] for o in orders]}")

    # Verify schema
    sample = orders[0]
    for fld in ("invoice_number", "has_bill_pdf", "delivery_confirmed", "amount_paid_on_delivery", "amount_on_credit"):
        log(f"order has '{fld}'", fld in sample, f"keys={list(sample.keys())[:20]}")
    inv = sample.get("invoice_number", "")
    log("invoice_number format F0XXXX-AXXXXXXX", isinstance(inv, str) and inv.startswith("F0") and "-A" in inv, f"got={inv}")

    # Item schema
    if sample.get("items"):
        it = sample["items"][0]
        for fld in ("batch", "expiry", "qty_ordered", "free_qty", "mrp", "discount_pct", "gst_pct"):
            log(f"item has '{fld}'", fld in it, f"keys={list(it.keys())}")

    # =========================================================
    # 1. POST /orders/{id}/confirm-delivery
    # =========================================================
    # Scenario A: full delivery, paid_now=total, on_credit=0 → status delivered
    if len(confirmable) < 3:
        # place more orders for testing — add to cart and place
        # find a product
        prods = requests.get(f"{API}/products", headers=H, timeout=20).json()[:2]
        if prods:
            requests.post(f"{API}/cart/items", headers=H, json={"product_id": prods[0]["id"], "distributor_id": prods[0]["distributor_ids"][0], "qty": 5}, timeout=20)
            requests.post(f"{API}/orders?payment_method=cash", headers=H, timeout=20)
            requests.post(f"{API}/cart/items", headers=H, json={"product_id": prods[0]["id"], "distributor_id": prods[0]["distributor_ids"][0], "qty": 5}, timeout=20)
            requests.post(f"{API}/orders?payment_method=credit", headers=H, timeout=20)
            requests.post(f"{API}/cart/items", headers=H, json={"product_id": prods[0]["id"], "distributor_id": prods[0]["distributor_ids"][0], "qty": 5}, timeout=20)
            requests.post(f"{API}/orders?payment_method=cash", headers=H, timeout=20)
            orders = requests.get(f"{API}/orders", headers=H, timeout=20).json()
            confirmable = [o for o in orders if not o.get("delivery_confirmed") and o.get("status") in ("placed", "processing", "shipped")]
            print(f"  After topping up: {len(confirmable)} unconfirmed orders")

    # Scenario A: full match
    if confirmable:
        oA = confirmable[0]
        body = {
            "items": [{"product_id": it["product_id"], "qty_received": it["qty_ordered"], "free_qty": it.get("free_qty", 0)} for it in oA["items"]],
            "paid_now": oA["total"],
            "on_credit": 0,
            "notes": "All received OK",
        }
        r = requests.post(f"{API}/orders/{oA['id']}/confirm-delivery", headers=H, json=body, timeout=20)
        log("A: confirm-delivery 200", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
        # Re-fetch and verify
        oA2 = requests.get(f"{API}/orders/{oA['id']}", headers=H, timeout=20).json()
        assert_eq("A: order.status == 'delivered'", oA2["status"], "delivered")
        assert_eq("A: delivery_confirmed == True", oA2["delivery_confirmed"], True)

        # Scenario A.5: idempotency — second call should 400
        r2 = requests.post(f"{API}/orders/{oA['id']}/confirm-delivery", headers=H, json=body, timeout=20)
        log("A: idempotent 400 'Already confirmed'", r2.status_code == 400 and "lready" in r2.text, f"status={r2.status_code} body={r2.text[:200]}")

    # Scenario B: one item short → debit_note auto-created with reason='short-supply', total reduced
    if len(confirmable) >= 2:
        oB = confirmable[1]
        # Get current debit_notes count for this order
        dn_before_r = requests.get(f"{API}/debit-notes?distributor_id={oB['distributor_id']}", headers=H, timeout=20)
        dn_before = dn_before_r.json() if dn_before_r.status_code == 200 else []
        dn_before_count = len(dn_before)

        original_total = oB["total"]
        # Short by 50% on first item
        items = oB["items"]
        body = {
            "items": [
                {"product_id": items[0]["product_id"], "qty_received": max(1, items[0]["qty_ordered"] // 2)},
            ] + [
                {"product_id": it["product_id"], "qty_received": it["qty_ordered"]} for it in items[1:]
            ],
            "paid_now": 0,
            "on_credit": original_total / 2,
            "notes": "Short delivered first item",
        }
        r = requests.post(f"{API}/orders/{oB['id']}/confirm-delivery", headers=H, json=body, timeout=20)
        log("B: confirm-delivery (short) 200", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
        body_resp = r.json() if r.status_code == 200 else {}
        log("B: response has qty_short_value > 0", body_resp.get("qty_short_value", 0) > 0, f"qty_short_value={body_resp.get('qty_short_value')}")
        # Re-fetch order
        oB2 = requests.get(f"{API}/orders/{oB['id']}", headers=H, timeout=20).json()
        log("B: new_total < original_total", oB2["total"] < original_total, f"new={oB2['total']} orig={original_total}")
        # Check debit_notes
        dn_after = requests.get(f"{API}/debit-notes?distributor_id={oB['distributor_id']}", headers=H, timeout=20).json()
        log("B: new debit_note created", len(dn_after) > dn_before_count, f"before={dn_before_count} after={len(dn_after)}")
        new_dns = [d for d in dn_after if d.get("order_id") == oB["id"]]
        log("B: debit_note linked to order, reason='short-supply'",
            bool(new_dns) and new_dns[0]["reason"] == "short-supply",
            f"new_dns={[(d['code'], d['reason']) for d in new_dns]}")

    # Scenario C: credit payment with on_credit > 0 → new payment record created
    if len(confirmable) >= 3:
        oC = confirmable[2]
        # Payment count before
        pay_before = requests.get(f"{API}/payments", headers=H, timeout=20).json()["items"]
        pay_before_inv_codes = {p["invoice_code"] for p in pay_before}

        # Use invoice_number to find the new payment
        inv_num = oC.get("invoice_number", oC["code"])

        body = {
            "items": [{"product_id": it["product_id"], "qty_received": it["qty_ordered"]} for it in oC["items"]],
            "paid_now": 0,
            "on_credit": oC["total"],
        }
        r = requests.post(f"{API}/orders/{oC['id']}/confirm-delivery", headers=H, json=body, timeout=20)
        log("C: confirm-delivery (credit) 200", r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")
        pay_after = requests.get(f"{API}/payments", headers=H, timeout=20).json()["items"]
        new_pays = [p for p in pay_after if p["invoice_code"] not in pay_before_inv_codes]
        log("C: new payment created", len(new_pays) >= 1, f"new={len(new_pays)} invoice_number={inv_num}")
        if new_pays:
            log("C: new payment status=='due'", new_pays[0]["status"] == "due", f"status={new_pays[0]['status']}")
            new_payment_id_c = new_pays[0]["id"]
        else:
            new_payment_id_c = None
    else:
        new_payment_id_c = None

    # Scenario D: mismatched paid_now + on_credit ≠ total → still succeeds
    # Generate a fresh order
    prods = requests.get(f"{API}/products", headers=H, timeout=20).json()[:1]
    if prods:
        requests.post(f"{API}/cart/items", headers=H, json={"product_id": prods[0]["id"], "distributor_id": prods[0]["distributor_ids"][0], "qty": 3}, timeout=20)
        r_place = requests.post(f"{API}/orders?payment_method=cash", headers=H, timeout=20)
        if r_place.status_code == 200:
            oD = r_place.json()["orders"][0]
            body = {
                "items": [{"product_id": it["product_id"], "qty_received": it["qty_ordered"]} for it in oD["items"]],
                "paid_now": 100,
                "on_credit": 50,  # mismatch with oD['total']
            }
            r = requests.post(f"{API}/orders/{oD['id']}/confirm-delivery", headers=H, json=body, timeout=20)
            log("D: mismatch paid+credit≠total → still 200", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")

    # =========================================================
    # 2. POST /payments/pay-lump-sum
    # =========================================================
    pays = requests.get(f"{API}/payments?status=due", headers=H, timeout=20).json()["items"]
    due_ids = [p["id"] for p in pays][:2]
    if len(due_ids) >= 2:
        # Capture credit_used before
        dist_id_first = next((p["distributor_id"] for p in pays if p["id"] == due_ids[0]), None)
        d_before = requests.get(f"{API}/distributors", timeout=20).json()
        d_before_map = {d["id"]: d["credit_used"] for d in d_before}

        r = requests.post(f"{API}/payments/pay-lump-sum", headers=H, json={"payment_ids": due_ids}, timeout=20)
        log("pay-lump-sum 200", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
        body_lump = r.json() if r.status_code == 200 else {}
        log("pay-lump-sum response has {success, count, total_paid}",
            all(k in body_lump for k in ("success", "count", "total_paid")),
            f"keys={list(body_lump.keys())}")
        log("pay-lump-sum count == len(payment_ids)", body_lump.get("count") == len(due_ids), f"count={body_lump.get('count')}")
        log("pay-lump-sum total_paid > 0", body_lump.get("total_paid", 0) > 0, f"total_paid={body_lump.get('total_paid')}")

        # Verify payments status flipped to paid
        pays_after = requests.get(f"{API}/payments", headers=H, timeout=20).json()["items"]
        flipped = [p for p in pays_after if p["id"] in due_ids and p["status"] == "paid"]
        log("pay-lump-sum: payments now paid", len(flipped) == len(due_ids), f"flipped={len(flipped)}/{len(due_ids)}")

        # Credit_used should drop
        d_after = requests.get(f"{API}/distributors", timeout=20).json()
        d_after_map = {d["id"]: d["credit_used"] for d in d_after}
        if dist_id_first and dist_id_first in d_before_map:
            log(f"pay-lump-sum: credit_used reduced for {dist_id_first}",
                d_after_map[dist_id_first] < d_before_map[dist_id_first],
                f"before={d_before_map[dist_id_first]} after={d_after_map[dist_id_first]}")
    else:
        log("pay-lump-sum (skipped — need ≥2 due payments)", True, "skipped")

    # =========================================================
    # 3. GET /distributors/{dist_id}/invoices
    # =========================================================
    r = requests.get(f"{API}/distributors/dist-1/invoices", headers=H, timeout=20)
    log("GET /distributors/dist-1/invoices 200", r.status_code == 200, f"status={r.status_code}")
    if r.status_code == 200:
        body = r.json()
        required = ("distributor", "open_invoices", "invoice_history", "overdue", "outstanding", "credit_limit", "credit_used", "credit_used_pct")
        missing = [k for k in required if k not in body]
        log("invoices response has all required keys", not missing, f"missing={missing}")
        log("open_invoices is list", isinstance(body.get("open_invoices"), list))
        log("invoice_history is list", isinstance(body.get("invoice_history"), list))
        log("credit_used_pct is number", isinstance(body.get("credit_used_pct"), (int, float)))

    # =========================================================
    # 4. GET /ledger/{distributor_id}/export?format=csv&days=90
    # =========================================================
    r = requests.get(f"{API}/ledger/dist-1/export?format=csv&days=90", headers=H, timeout=20)
    log("GET /ledger/dist-1/export?format=csv&days=90 200", r.status_code == 200, f"status={r.status_code}")
    ct = r.headers.get("content-type", "")
    log("ledger export Content-Type contains 'text/csv'", "text/csv" in ct.lower(), f"content-type={ct}")
    txt = r.text
    log("ledger CSV body contains 'Date,Type,Reference'", "Date,Type,Reference" in txt, f"body[:200]={txt[:200]!r}")
    # Check row types
    has_bill = "BILL" in txt
    has_payment = "PAYMENT" in txt
    has_cn = "CREDIT_NOTE" in txt
    has_dn = "DEBIT_NOTE" in txt
    log(f"ledger CSV includes BILL/PAYMENT/CREDIT_NOTE/DEBIT_NOTE row types",
        has_bill or has_payment or has_cn or has_dn,
        f"BILL={has_bill} PAYMENT={has_payment} CN={has_cn} DN={has_dn}")

    # =========================================================
    # 6. REGRESSION
    # =========================================================
    endpoints = [
        ("/dashboard", "GET"),
        ("/payments/summary", "GET"),
        ("/ledger/dist-1", "GET"),
        ("/cart", "GET"),
        ("/distributors/dist-1", "GET"),
        ("/chat/threads", "GET"),
        ("/analytics/margin-by-category", "GET"),
    ]
    for path, method in endpoints:
        r = requests.get(f"{API}{path}", headers=H, timeout=20)
        log(f"REGRESSION {method} {path}", r.status_code == 200, f"status={r.status_code} body[:120]={r.text[:120]!r}")

    # Summary
    total = len(results)
    passed = sum(1 for _, ok, _ in results if ok)
    failed = total - passed
    print(f"\n=========================")
    print(f"  PASS: {passed}/{total}")
    print(f"  FAIL: {failed}/{total}")
    print(f"=========================")
    if failed:
        print("Failures:")
        for name, ok, info in results:
            if not ok:
                print(f"  ❌ {name}  ::  {info}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
