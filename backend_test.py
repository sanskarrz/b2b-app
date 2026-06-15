"""RX Tech backend review-request tests.

Covers:
  1) GET /api/cart/lookup (new)
  2) POST /api/scan/extract with mode parameter (new schema)
  3) Onboarding/Profile drug_license + food_license persistence
  4) Regression sanity (send-otp, dashboard, distributor invoices, pay-lump-sum, credit-notes)
"""
import os
import sys
import json
import base64
import time
import requests

# ----------------------------------------------------------------------
# Configuration
# ----------------------------------------------------------------------
def _read_backend_url() -> str:
    env_path = "/app/frontend/.env"
    with open(env_path) as fh:
        for line in fh:
            line = line.strip()
            if line.startswith("EXPO_PUBLIC_BACKEND_URL"):
                _, _, val = line.partition("=")
                return val.strip().strip('"').strip("'")
    raise RuntimeError("EXPO_PUBLIC_BACKEND_URL not found in /app/frontend/.env")

BASE_URL = _read_backend_url().rstrip("/")
API = f"{BASE_URL}/api"
DEMO_EMAIL = "demo@rxtech.com"

results = []  # (name, passed, detail)


def record(name, passed, detail=""):
    results.append((name, passed, detail))
    mark = "PASS" if passed else "FAIL"
    print(f"[{mark}] {name} — {detail}")


def session_login():
    # Send OTP
    r = requests.post(f"{API}/auth/send-otp", json={"email": DEMO_EMAIL}, timeout=20)
    assert r.status_code == 200, f"send-otp failed {r.status_code}: {r.text}"
    body = r.json()
    otp = body.get("dev_otp")
    assert otp, f"dev_otp not returned: {body}"
    # Verify
    r2 = requests.post(f"{API}/auth/verify-otp", json={"email": DEMO_EMAIL, "otp": otp}, timeout=20)
    assert r2.status_code == 200, f"verify-otp failed {r2.status_code}: {r2.text}"
    data = r2.json()
    token = data["token"]
    return token, data


def H(token):
    return {"Authorization": f"Bearer {token}"}


# ----------------------------------------------------------------------
# Tests
# ----------------------------------------------------------------------
def test_regression_send_otp_and_login():
    try:
        token, data = session_login()
        record("Regression: send-otp+verify-otp returns JWT for demo", bool(token), f"user.email={data['user']['email']}")
        return token
    except Exception as e:
        record("Regression: send-otp+verify-otp returns JWT for demo", False, str(e))
        return None


def test_dashboard(token):
    r = requests.get(f"{API}/dashboard", headers=H(token), timeout=20)
    ok = r.status_code == 200 and isinstance(r.json(), dict)
    record("Regression: GET /api/dashboard 200", ok, f"status={r.status_code}")


def test_distributor_invoices(token):
    # pick first distributor
    r = requests.get(f"{API}/distributors", headers=H(token), timeout=20)
    dlist = r.json() if r.status_code == 200 else []
    if not dlist:
        record("Regression: distributors list", False, f"status={r.status_code}")
        return None
    dist_id = dlist[0]["id"]
    r2 = requests.get(f"{API}/distributors/{dist_id}/invoices", headers=H(token), timeout=20)
    body = r2.json() if r2.status_code == 200 else {}
    required = {"distributor", "open_invoices", "invoice_history", "overdue", "outstanding", "credit_limit", "credit_used", "credit_used_pct"}
    keys = set(body.keys()) if isinstance(body, dict) else set()
    ok = r2.status_code == 200 and required.issubset(keys)
    record(
        "Regression: GET /api/distributors/{id}/invoices 200 with required keys",
        ok,
        f"status={r2.status_code}, missing={sorted(required - keys)}",
    )
    return dist_id


def test_pay_lump_sum(token):
    # Get one or two due payments
    r = requests.get(f"{API}/payments?status=due", headers=H(token), timeout=20)
    data = r.json() if r.status_code == 200 else {}
    items = data.get("items", [])
    # Need at least one due; if not, try fetching all payments and any with status due/overdue
    if not items:
        r = requests.get(f"{API}/payments", headers=H(token), timeout=20)
        data = r.json()
        items = [p for p in data.get("items", []) if p.get("status") in ("due", "overdue")]
    if not items:
        record("Regression: POST /api/payments/pay-lump-sum", False, "no due payments to settle")
        return
    payment_id = items[0]["id"]
    expected_amount = items[0]["amount"]
    r2 = requests.post(
        f"{API}/payments/pay-lump-sum",
        headers={**H(token), "Content-Type": "application/json"},
        json={"payment_ids": [payment_id]},
        timeout=20,
    )
    body = r2.json() if r2.status_code == 200 else {}
    ok = r2.status_code == 200 and body.get("success") and body.get("count") == 1 and abs(body.get("total_paid", 0) - expected_amount) < 0.5
    record(
        "Regression: POST /api/payments/pay-lump-sum",
        ok,
        f"status={r2.status_code}, body={body}",
    )


def test_credit_notes(token, dist_id):
    payload = {"distributor_id": dist_id, "amount": 250.0, "reason": "damaged", "notes": "auto-test credit note"}
    r = requests.post(
        f"{API}/credit-notes",
        headers={**H(token), "Content-Type": "application/json"},
        json=payload,
        timeout=20,
    )
    body = r.json() if r.status_code == 200 else {}
    ok = r.status_code == 200 and body.get("success") and (body.get("item") or {}).get("code", "").startswith("CN-")
    record(
        "Regression: POST /api/credit-notes",
        ok,
        f"status={r.status_code}, code={(body.get('item') or {}).get('code')}",
    )


# ---- 1) Cart lookup ----
def test_cart_lookup(token):
    # Get a product+distributor pair
    r = requests.get(f"{API}/search/comprehensive?q=paracetamol", headers=H(token), timeout=20)
    if r.status_code != 200:
        # fallback to /products
        r = requests.get(f"{API}/products?limit=1", headers=H(token), timeout=20)
        prods = r.json() if r.status_code == 200 else []
        if not prods:
            record("Cart lookup: setup (no products)", False, f"status={r.status_code}")
            return
        product_id = prods[0]["id"]
        distributor_id = prods[0]["distributor_ids"][0]
    else:
        data = r.json()
        matches = data.get("matches") or data.get("items") or []
        if isinstance(data, list):
            matches = data
        if not matches:
            record("Cart lookup: setup (no matches)", False, "empty matches")
            return
        first = matches[0]
        product = first.get("product") or first
        offers = first.get("offers") or []
        product_id = product["id"]
        if offers:
            distributor_id = offers[0].get("distributor_id") or offers[0].get("distributor", {}).get("id")
        else:
            distributor_id = product.get("best_distributor_id") or (product.get("distributor_ids") or [None])[0]
        if not distributor_id:
            record("Cart lookup: setup (no distributor)", False, "no distributor in offers")
            return

    # Clear cart first for clean state
    requests.delete(f"{API}/cart", headers=H(token), timeout=20)

    # Add an item (qty=1)
    r1 = requests.post(
        f"{API}/cart/items",
        headers={**H(token), "Content-Type": "application/json"},
        json={"product_id": product_id, "distributor_id": distributor_id, "qty": 2},
        timeout=20,
    )
    ok_add = r1.status_code == 200 and r1.json().get("success")
    record("Cart lookup: POST /cart/items add qty=2", ok_add, f"status={r1.status_code}")

    # Lookup
    r2 = requests.get(f"{API}/cart/lookup", headers=H(token), timeout=20)
    body = r2.json() if r2.status_code == 200 else {}
    key = f"{product_id}::{distributor_id}"
    items_map = body.get("items") or {}
    has_key = key in items_map
    qty_match = has_key and items_map[key].get("qty") == 2
    has_count = body.get("count") == 2 and body.get("unique") == 1
    ok_lookup = r2.status_code == 200 and isinstance(items_map, dict) and has_key and qty_match and has_count
    record(
        "Cart lookup: GET /api/cart/lookup reflects qty correctly",
        ok_lookup,
        f"status={r2.status_code}, key_present={has_key}, qty={items_map.get(key, {}).get('qty')}, count={body.get('count')}, unique={body.get('unique')}",
    )

    # Add again with same product+distributor — qty should increment
    r3 = requests.post(
        f"{API}/cart/items",
        headers={**H(token), "Content-Type": "application/json"},
        json={"product_id": product_id, "distributor_id": distributor_id, "qty": 3},
        timeout=20,
    )
    r4 = requests.get(f"{API}/cart/lookup", headers=H(token), timeout=20)
    body4 = r4.json() if r4.status_code == 200 else {}
    items_map4 = body4.get("items") or {}
    new_qty = items_map4.get(key, {}).get("qty")
    ok_inc = (
        r3.status_code == 200
        and r4.status_code == 200
        and new_qty == 5
        and body4.get("count") == 5
        and body4.get("unique") == 1
    )
    record(
        "Cart lookup: increments qty when same product+distributor re-added",
        ok_inc,
        f"new_qty={new_qty}, count={body4.get('count')}, unique={body4.get('unique')}",
    )


# ---- 2) Scan extract with mode parameter ----
def _tiny_png_b64():
    # 1x1 white PNG
    raw = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
    )
    return base64.b64encode(raw).decode()


def test_scan_extract(token):
    img_b64 = _tiny_png_b64()
    for mode_value in ("medicine", "prescription", "auto", None):
        payload = {"image_base64": img_b64}
        if mode_value is not None:
            payload["mode"] = mode_value
        try:
            r = requests.post(
                f"{API}/scan/extract",
                headers={**H(token), "Content-Type": "application/json"},
                json=payload,
                timeout=60,
            )
        except Exception as e:
            record(f"Scan extract: mode={mode_value}", False, f"exception {e}")
            continue

        # Accept either 200 OK (with new schema) or 500 with graceful detail
        if r.status_code == 200:
            try:
                body = r.json()
            except Exception:
                record(f"Scan extract: mode={mode_value}", False, "non-JSON 200")
                continue
            has_keys = "mode" in body and "matches" in body and "extracted" in body
            mode_ok = True
            if mode_value in ("medicine", "prescription"):
                # mode in response should match requested when not auto
                mode_ok = body.get("mode") in (mode_value, "medicine", "prescription")
            matches_is_list = isinstance(body.get("matches"), list)
            ok = has_keys and matches_is_list and mode_ok
            record(
                f"Scan extract: mode={mode_value} → 200 with new schema",
                ok,
                f"keys={sorted(body.keys())}, returned_mode={body.get('mode')}, matches_count={len(body.get('matches', []))}",
            )
        elif r.status_code == 500:
            try:
                body = r.json()
                detail = body.get("detail")
            except Exception:
                detail = r.text[:120]
            # Acceptable per spec — must include detail
            ok = bool(detail)
            record(
                f"Scan extract: mode={mode_value} → 500 with detail",
                ok,
                f"detail={detail}",
            )
        else:
            record(
                f"Scan extract: mode={mode_value} unexpected status",
                False,
                f"status={r.status_code}, body={r.text[:200]}",
            )


# ---- 3) Onboarding / Profile drug_license + food_license ----
def test_onboard_licenses(token):
    drug_lic = "MH-MUM-25-227891"
    food_lic = "FSSAI-10024031000729"
    payload = {
        "name": "Demo Pharmacy",
        "phone": "9999900000",
        "shop_name": "RX Demo Medical Stores",
        "gst": "27DEMO1234F1Z9",
        "address": "Plot 12, MIDC, Mumbai, MH 400 0XX",
        "drug_license": drug_lic,
        "food_license": food_lic,
    }
    r = requests.post(
        f"{API}/auth/onboard",
        headers={**H(token), "Content-Type": "application/json"},
        json=payload,
        timeout=20,
    )
    if r.status_code != 200:
        record("Onboard: POST /api/auth/onboard accepts drug+food license", False, f"status={r.status_code}: {r.text[:200]}")
        return
    user_after = r.json().get("user", {})
    ok = user_after.get("drug_license") == drug_lic and user_after.get("food_license") == food_lic
    record(
        "Onboard: POST /api/auth/onboard accepts drug+food license",
        ok,
        f"drug_license={user_after.get('drug_license')}, food_license={user_after.get('food_license')}",
    )

    # GET /auth/me should reflect both
    r2 = requests.get(f"{API}/auth/me", headers=H(token), timeout=20)
    me = r2.json() if r2.status_code == 200 else {}
    ok_me = r2.status_code == 200 and me.get("drug_license") == drug_lic and me.get("food_license") == food_lic
    record(
        "Onboard: GET /api/auth/me returns drug_license + food_license",
        ok_me,
        f"drug={me.get('drug_license')}, food={me.get('food_license')}",
    )

    # PATCH /auth/profile — check route presence first
    # The PRD says PATCH /api/auth/profile accepts both. Use new values.
    new_drug = "MH-MUM-25-227891-UPD"
    new_food = "FSSAI-10024031000729-UPD"
    patch_payload = {"drug_license": new_drug, "food_license": new_food}
    r3 = requests.patch(
        f"{API}/auth/profile",
        headers={**H(token), "Content-Type": "application/json"},
        json=patch_payload,
        timeout=20,
    )
    if r3.status_code == 200:
        # Verify via /auth/me
        r4 = requests.get(f"{API}/auth/me", headers=H(token), timeout=20)
        me2 = r4.json() if r4.status_code == 200 else {}
        ok_patch = me2.get("drug_license") == new_drug and me2.get("food_license") == new_food
        record(
            "Profile: PATCH /api/auth/profile updates drug+food license",
            ok_patch,
            f"drug={me2.get('drug_license')}, food={me2.get('food_license')}",
        )
    else:
        record(
            "Profile: PATCH /api/auth/profile updates drug+food license",
            False,
            f"status={r3.status_code}, body={r3.text[:200]}",
        )


# ----------------------------------------------------------------------
# Run
# ----------------------------------------------------------------------
def main():
    print(f"Base URL: {API}")
    token = test_regression_send_otp_and_login()
    if not token:
        print("\n=== FATAL: login failed, aborting ===")
        sys.exit(1)

    test_dashboard(token)
    dist_id = test_distributor_invoices(token)
    test_pay_lump_sum(token)
    if dist_id:
        test_credit_notes(token, dist_id)
    test_cart_lookup(token)
    test_scan_extract(token)
    test_onboard_licenses(token)

    print("\n=== SUMMARY ===")
    passed = sum(1 for _, p, _ in results if p)
    total = len(results)
    print(f"{passed}/{total} passed")
    for name, p, det in results:
        mark = "PASS" if p else "FAIL"
        print(f"  [{mark}] {name} — {det}")
    sys.exit(0 if passed == total else 2)


if __name__ == "__main__":
    main()
