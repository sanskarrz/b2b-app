"""RX Tech — Backend tests for the 14 client-requested distributor & pharmacist features.

Covers:
- AUTH & ROLE routing hooks (login, roles, api-keys 403 for manager)
- Feature 1: Cash OTP for delivery
- Feature 2/5: Disputes (pharmacist raise, distributor manage)
- Feature 3: Staff chat (staff <-> office)
- Feature 4/9/10: Field order taking (margin + cash discount + offer_pct)
- Feature 6: Blacklist customer blocks ordering
- Feature 7: Barcode auto-assign + lookup
- Feature 8: Area auto-assign (staff areas, deliveries, leads)
- Feature 11: Stock adjust (damage/expiry)
- Feature 12: Item detail (remaining_stock) + delivery photos
- Feature 13: Auto-accept when no overdue
- Feature 14: Auto bill generation
"""
import time
import pytest


OWNER_EMAIL = "owner@rxtech.com"
MANAGER_EMAIL = "manager@rxtech.com"
SALES_EMAIL = "sales@rxtech.com"
DELIVERY_EMAIL = "delivery@rxtech.com"
PHARMA_EMAIL = "demo@rxtech.com"
STAFF_PASSWORD = "Pass@123"
DIST_ID = "dist-1"


# ---------- auth helpers ----------
def _otp_login(api_client, base_url, email):
    r = api_client.post(f"{base_url}/api/auth/send-otp", json={"email": email})
    assert r.status_code == 200, r.text
    otp = r.json().get("dev_otp")
    assert otp
    r = api_client.post(f"{base_url}/api/auth/verify-otp", json={"email": email, "otp": otp})
    assert r.status_code == 200, r.text
    return r.json()


def _pwd_login(api_client, base_url, email):
    r = api_client.post(f"{base_url}/api/auth/login", json={"email": email, "password": STAFF_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()


def _h(auth):
    return {"Authorization": f"Bearer {auth['token']}", "Content-Type": "application/json"}


# ---------- session-scoped fixtures ----------
@pytest.fixture(scope="module")
def owner(api_client, base_url):
    return _otp_login(api_client, base_url, OWNER_EMAIL)


@pytest.fixture(scope="module")
def manager(api_client, base_url):
    return _pwd_login(api_client, base_url, MANAGER_EMAIL)


@pytest.fixture(scope="module")
def sales(api_client, base_url):
    return _pwd_login(api_client, base_url, SALES_EMAIL)


@pytest.fixture(scope="module")
def delivery(api_client, base_url):
    return _pwd_login(api_client, base_url, DELIVERY_EMAIL)


@pytest.fixture(scope="module")
def pharma(api_client, base_url):
    return _otp_login(api_client, base_url, PHARMA_EMAIL)


# ============================================================
# AUTH & ROLE
# ============================================================
class TestAuthAndRoles:
    def test_owner_login_role(self, owner):
        assert owner["user"]["role"] == "owner"

    def test_manager_login_role(self, manager):
        assert manager["user"]["role"] == "manager"

    def test_sales_login_role(self, sales):
        assert sales["user"]["role"] == "field_sales"

    def test_delivery_login_role(self, delivery):
        assert delivery["user"]["role"] == "delivery"

    def test_pharma_login_role(self, pharma):
        u = pharma["user"]
        # backend returns either single 'role' or roles[] for legacy demo user
        assert "pharmacist" in (u.get("roles") or [u.get("role")])


# ============================================================
# MANAGER PERMISSIONS
# ============================================================
class TestManagerPermissions:
    def test_manager_dashboard(self, api_client, base_url, manager):
        r = api_client.get(f"{base_url}/api/distributor/me/dashboard", headers=_h(manager))
        assert r.status_code == 200, r.text

    def test_manager_staff_list(self, api_client, base_url, manager):
        r = api_client.get(f"{base_url}/api/distributor/me/staff", headers=_h(manager))
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_manager_api_keys_forbidden(self, api_client, base_url, manager):
        r = api_client.get(f"{base_url}/api/distributor/me/api-keys", headers=_h(manager))
        assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"

    def test_owner_api_keys_ok(self, api_client, base_url, owner):
        r = api_client.get(f"{base_url}/api/distributor/me/api-keys", headers=_h(owner))
        assert r.status_code == 200, r.text


# ============================================================
# Feature 13: Settings (auto-accept)
# ============================================================
class TestSettings:
    def test_get_settings(self, api_client, base_url, manager):
        r = api_client.get(f"{base_url}/api/distributor/me/settings", headers=_h(manager))
        assert r.status_code == 200
        b = r.json()
        assert "auto_accept_no_overdue" in b

    def test_update_settings(self, api_client, base_url, manager):
        r = api_client.patch(f"{base_url}/api/distributor/me/settings",
                             json={"auto_accept_no_overdue": True, "cd_default_pct": 1.5},
                             headers=_h(manager))
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["auto_accept_no_overdue"] is True
        assert b["cd_default_pct"] == 1.5


# ============================================================
# Feature 2/5: Disputes / Query management
# ============================================================
class TestDisputes:
    created_id = None

    def test_invalid_type_400(self, api_client, base_url, pharma):
        r = api_client.post(f"{base_url}/api/disputes",
                            json={"distributor_id": DIST_ID, "type": "bogus", "title": "x"},
                            headers=_h(pharma))
        assert r.status_code == 400

    def test_pharma_create(self, api_client, base_url, pharma):
        r = api_client.post(f"{base_url}/api/disputes",
                            json={"distributor_id": DIST_ID, "type": "wrong_supply",
                                  "title": "TEST_wrong item", "description": "batch mismatch"},
                            headers=_h(pharma))
        assert r.status_code == 200, r.text
        d = r.json()["dispute"]
        assert d["type"] == "wrong_supply"
        assert d["status"] == "open"
        TestDisputes.created_id = d["id"]

    def test_pharma_list_own(self, api_client, base_url, pharma):
        r = api_client.get(f"{base_url}/api/disputes", headers=_h(pharma))
        assert r.status_code == 200
        assert any(x["id"] == TestDisputes.created_id for x in r.json())

    def test_distributor_list(self, api_client, base_url, manager):
        r = api_client.get(f"{base_url}/api/distributor/me/disputes", headers=_h(manager))
        assert r.status_code == 200
        b = r.json()
        assert "items" in b and "counts" in b
        assert any(x["id"] == TestDisputes.created_id for x in b["items"])

    def test_distributor_filter_by_type(self, api_client, base_url, manager):
        r = api_client.get(f"{base_url}/api/distributor/me/disputes?type=wrong_supply",
                           headers=_h(manager))
        assert r.status_code == 200
        assert all(x["type"] == "wrong_supply" for x in r.json()["items"])

    def test_distributor_resolve(self, api_client, base_url, manager):
        assert TestDisputes.created_id
        r = api_client.patch(f"{base_url}/api/distributor/me/disputes/{TestDisputes.created_id}",
                             json={"status": "resolved", "resolution": "TEST_replaced", "note": "done"},
                             headers=_h(manager))
        assert r.status_code == 200
        # verify persisted
        r2 = api_client.get(f"{base_url}/api/distributor/me/disputes?status=resolved",
                            headers=_h(manager))
        got = [x for x in r2.json()["items"] if x["id"] == TestDisputes.created_id]
        assert got and got[0]["status"] == "resolved"
        assert got[0]["resolution"] == "TEST_replaced"


# ============================================================
# Feature 3: Staff chat
# ============================================================
class TestStaffChat:
    def test_staff_send(self, api_client, base_url, sales):
        r = api_client.post(f"{base_url}/api/staff/chat",
                            json={"text": "TEST_hello office"}, headers=_h(sales))
        assert r.status_code == 200, r.text
        assert r.json()["message"]["sender"] == "staff"

    def test_staff_history(self, api_client, base_url, sales):
        r = api_client.get(f"{base_url}/api/staff/chat", headers=_h(sales))
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        assert any("TEST_hello office" in m.get("text", "") for m in r.json())

    def test_office_threads(self, api_client, base_url, manager):
        r = api_client.get(f"{base_url}/api/distributor/me/staff-chat/threads",
                           headers=_h(manager))
        assert r.status_code == 200
        threads = r.json()
        assert isinstance(threads, list) and len(threads) > 0
        assert any(t.get("last_text") for t in threads)

    def test_office_send(self, api_client, base_url, manager, sales):
        staff_id = sales["user"]["id"]
        r = api_client.post(f"{base_url}/api/distributor/me/staff-chat",
                            json={"staff_id": staff_id, "text": "TEST_office reply"},
                            headers=_h(manager))
        assert r.status_code == 200
        # staff can see
        h = api_client.get(f"{base_url}/api/distributor/me/staff-chat/{staff_id}",
                           headers=_h(manager))
        assert any("TEST_office reply" in m["text"] for m in h.json())


# ============================================================
# Feature 4/9/10: Field order taking
# ============================================================
class TestFieldOrder:
    picked_customer = None
    picked_product = None

    def test_field_customers(self, api_client, base_url, sales):
        r = api_client.get(f"{base_url}/api/field/customers", headers=_h(sales))
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list) and rows
        TestFieldOrder.picked_customer = rows[0]["id"]

    def test_field_products_has_margin(self, api_client, base_url, sales):
        r = api_client.get(f"{base_url}/api/field/products", headers=_h(sales))
        assert r.status_code == 200
        rows = r.json()
        assert rows
        p = rows[0]
        assert "margin_pct" in p and "margin_amt" in p
        TestFieldOrder.picked_product = p["product_id"]

    def test_place_field_order_with_cd(self, api_client, base_url, sales):
        assert TestFieldOrder.picked_customer and TestFieldOrder.picked_product
        # Use guardian (cust-4, no credit used) so credit check passes; but rely on picked
        payload = {
            "customer_id": "cust-4",
            "items": [{"product_id": TestFieldOrder.picked_product, "qty": 2}],
            "payment_method": "credit",
            "cash_discount_pct": 2.0,
            "extra_cd_pct": 1.0,
            "offer_pct": 0.5,
        }
        r = api_client.post(f"{base_url}/api/field/orders", json=payload, headers=_h(sales))
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["success"] is True
        br = b["breakdown"]
        assert abs(br["discount_pct"] - 3.5) < 0.01
        assert br["net"] < br["gross"]
        assert "est_margin" in b


# ============================================================
# Feature 6: Blacklist
# ============================================================
class TestBlacklist:
    def _get_pharma_dists(self, api_client, base_url, pharma):
        r = api_client.get(f"{base_url}/api/auth/me", headers=_h(pharma))
        return r.status_code

    def test_blacklist_and_block_order(self, api_client, base_url, manager, pharma):
        # pharma is a customer of dist-1 (cust-1 apollo). But demo user is 'demo@rxtech.com' — let's find their user id
        me = api_client.get(f"{base_url}/api/auth/me", headers=_h(pharma)).json()
        pharma_id = me["id"]
        # ensure they have a credit record via a quick order attempt using distributor listing
        # First blacklist
        r = api_client.patch(f"{base_url}/api/distributor/me/customers/{pharma_id}/blacklist",
                             json={"blacklisted": True, "reason": "TEST_bad debt"},
                             headers=_h(manager))
        assert r.status_code == 200, r.text
        assert r.json()["blacklisted"] is True

        # try placing an order as pharma to dist-1 → expect 403
        # discover a product for dist-1
        prods = api_client.get(f"{base_url}/api/products?distributor_id={DIST_ID}",
                               headers=_h(pharma))
        # tolerate different product-listing endpoints
        if prods.status_code != 200:
            prods = api_client.get(f"{base_url}/api/products", headers=_h(pharma))
        assert prods.status_code == 200, prods.text
        arr = prods.json() if isinstance(prods.json(), list) else prods.json().get("items", [])
        # find first product available for dist-1
        pid = None
        for p in arr:
            if DIST_ID in (p.get("distributor_ids") or []):
                pid = p["id"]
                break
        if not pid and arr:
            pid = arr[0]["id"]
        assert pid, "No product available to test blacklist"

        order_payload = {
            "distributor_id": DIST_ID,
            "items": [{"product_id": pid, "qty": 1}],
            "payment_method": "credit",
        }
        rr = api_client.post(f"{base_url}/api/orders", json=order_payload, headers=_h(pharma))
        assert rr.status_code == 403, f"Expected 403 blacklist block, got {rr.status_code}: {rr.text}"

        # cleanup: unblock
        api_client.patch(f"{base_url}/api/distributor/me/customers/{pharma_id}/blacklist",
                         json={"blacklisted": False}, headers=_h(manager))


# ============================================================
# Feature 7: Barcode
# ============================================================
class TestBarcode:
    def test_auto_barcode(self, api_client, base_url, manager):
        r = api_client.post(f"{base_url}/api/distributor/me/inventory/auto-barcode",
                            json={}, headers=_h(manager))
        assert r.status_code == 200, r.text
        assert "assigned" in r.json()

    def test_barcode_lookup(self, api_client, base_url, manager, sales):
        # first, find any product with a barcode
        rows = api_client.get(f"{base_url}/api/field/products", headers=_h(sales)).json()
        with_bc = [p for p in rows if p.get("barcode")]
        assert with_bc, "expected at least one product with a barcode after auto-assign"
        code = with_bc[0]["barcode"]
        r = api_client.get(f"{base_url}/api/products/barcode/{code}", headers=_h(sales))
        assert r.status_code == 200
        assert r.json()["barcode"] == code

    def test_set_barcode_conflict(self, api_client, base_url, manager, sales):
        rows = api_client.get(f"{base_url}/api/field/products", headers=_h(sales)).json()
        with_bc = [p for p in rows if p.get("barcode")]
        if len(with_bc) < 2:
            pytest.skip("Need >=2 barcoded products")
        pid = with_bc[1]["product_id"]
        existing_code = with_bc[0]["barcode"]
        r = api_client.post(f"{base_url}/api/distributor/me/inventory/{pid}/barcode",
                            json={"barcode": existing_code}, headers=_h(manager))
        assert r.status_code == 409


# ============================================================
# Feature 8: Area auto-assign
# ============================================================
class TestAreaAutoAssign:
    def test_set_staff_areas(self, api_client, base_url, manager, sales, delivery):
        for staff_id in (sales["user"]["id"], delivery["user"]["id"]):
            r = api_client.patch(f"{base_url}/api/distributor/me/staff/{staff_id}/areas",
                                 json={"areas": ["Andheri", "Bandra"]}, headers=_h(manager))
            assert r.status_code == 200, r.text
            assert r.json()["areas"] == ["Andheri", "Bandra"]

    def test_auto_assign_deliveries(self, api_client, base_url, manager):
        r = api_client.post(f"{base_url}/api/distributor/me/deliveries/auto-assign",
                            json={}, headers=_h(manager))
        assert r.status_code == 200
        b = r.json()
        assert "assigned" in b and "unmatched" in b

    def test_auto_assign_leads(self, api_client, base_url, manager):
        r = api_client.post(f"{base_url}/api/distributor/me/leads/auto-assign",
                            json={}, headers=_h(manager))
        assert r.status_code == 200
        b = r.json()
        assert "assigned" in b


# ============================================================
# Feature 11: Stock adjust
# ============================================================
class TestStockAdjust:
    def test_adjust_damage(self, api_client, base_url, manager, sales):
        rows = api_client.get(f"{base_url}/api/field/products", headers=_h(sales)).json()
        p = next((x for x in rows if (x.get("qty_available") or 0) > 5), rows[0])
        pid = p["product_id"]
        before = p.get("qty_available") or 0
        r = api_client.post(f"{base_url}/api/distributor/me/inventory/{pid}/adjust",
                            json={"delta": -2, "reason": "damage", "note": "TEST_broken pack"},
                            headers=_h(manager))
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["qty_available"] == max(0, before - 2)
        assert b["adjustment"]["reason"] == "damage"

    def test_adjust_bad_reason(self, api_client, base_url, manager, sales):
        rows = api_client.get(f"{base_url}/api/field/products", headers=_h(sales)).json()
        pid = rows[0]["product_id"]
        r = api_client.post(f"{base_url}/api/distributor/me/inventory/{pid}/adjust",
                            json={"delta": -1, "reason": "bogus"}, headers=_h(manager))
        assert r.status_code == 400


# ============================================================
# Feature 12: Item detail + photos
# ============================================================
class TestItemDetail:
    def test_order_detail_has_remaining_stock(self, api_client, base_url, manager):
        # find any distributor order
        orders = api_client.get(f"{base_url}/api/distributor/me/orders", headers=_h(manager))
        assert orders.status_code == 200
        arr = orders.json() if isinstance(orders.json(), list) else orders.json().get("items", [])
        if not arr:
            pytest.skip("No orders to inspect")
        oid = arr[0]["id"]
        r = api_client.get(f"{base_url}/api/distributor/me/orders/{oid}/detail",
                           headers=_h(manager))
        assert r.status_code == 200, r.text
        b = r.json()
        assert "items" in b and b["items"]
        assert "remaining_stock" in b["items"][0]

    def test_delivery_photos(self, api_client, base_url, manager):
        r = api_client.get(f"{base_url}/api/distributor/me/delivery-photos",
                           headers=_h(manager))
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ============================================================
# Feature 13: Auto-accept
# ============================================================
class TestAutoAccept:
    def test_auto_accept_no_overdue(self, api_client, base_url, manager, sales):
        # Ensure setting is on
        api_client.patch(f"{base_url}/api/distributor/me/settings",
                         json={"auto_accept_no_overdue": True}, headers=_h(manager))

        # Place a field order for cust-4 (no overdue per seed)
        rows = api_client.get(f"{base_url}/api/field/products", headers=_h(sales)).json()
        pid = rows[0]["product_id"]
        payload = {
            "customer_id": "cust-4",
            "items": [{"product_id": pid, "qty": 1}],
            "payment_method": "credit",
        }
        r = api_client.post(f"{base_url}/api/field/orders", json=payload, headers=_h(sales))
        assert r.status_code == 200, r.text
        order = r.json()["order"]
        assert order["status"] == "accepted", f"expected auto-accept, got {order['status']}"


# ============================================================
# Feature 14: Auto bill generation
# ============================================================
class TestAutoBills:
    def test_generate_bills(self, api_client, base_url, manager):
        r = api_client.post(f"{base_url}/api/distributor/me/bills/generate",
                            json={}, headers=_h(manager))
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["success"] is True
        assert "generated" in b
        assert isinstance(b["bills"], list)

    def test_list_bills(self, api_client, base_url, manager):
        r = api_client.get(f"{base_url}/api/distributor/me/bills", headers=_h(manager))
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ============================================================
# Feature 1: Cash OTP
# (kept last because it needs a dispatched cash order assigned to delivery)
# ============================================================
class TestCashOTP:
    def _find_delivery_cash_order(self, api_client, base_url, delivery):
        r = api_client.get(f"{base_url}/api/delivery/me/orders", headers=_h(delivery))
        if r.status_code != 200:
            return None
        arr = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
        for o in arr:
            if o.get("payment_method") == "cash":
                return o
        return None

    def test_cash_otp_flow(self, api_client, base_url, delivery, manager, sales):
        cash_order = self._find_delivery_cash_order(api_client, base_url, delivery)
        if not cash_order:
            # Build a cash order end-to-end
            prods = api_client.get(f"{base_url}/api/field/products", headers=_h(sales)).json()
            if not prods:
                pytest.skip("No products to build a cash order")
            payload = {
                "customer_id": "cust-4",
                "items": [{"product_id": prods[0]["product_id"], "qty": 1}],
                "payment_method": "cash",
            }
            resp = api_client.post(f"{base_url}/api/field/orders", json=payload, headers=_h(sales))
            assert resp.status_code == 200, resp.text
            oid = resp.json()["order"]["id"]
            # accept + dispatch via /distributor/orders/{id}/action
            for act in ("accept", "dispatch"):
                api_client.post(f"{base_url}/api/distributor/orders/{oid}/action",
                                json={"action": act}, headers=_h(manager))
            # assign to delivery rider
            api_client.patch(f"{base_url}/api/distributor/orders/{oid}/assign",
                             json={"delivery_user_id": delivery["user"]["id"]}, headers=_h(manager))
            time.sleep(0.3)
            cash_order = self._find_delivery_cash_order(api_client, base_url, delivery)

        if not cash_order:
            pytest.skip("Could not build a cash order assigned to delivery for OTP test")

        oid = cash_order["id"]
        r = api_client.post(f"{base_url}/api/delivery/orders/{oid}/cash-otp",
                            json={}, headers=_h(delivery))
        assert r.status_code == 200, r.text
        b = r.json()
        assert "otp" in b and len(b["otp"]) == 6

        # deliver without OTP → should fail
        r2 = api_client.post(f"{base_url}/api/delivery/orders/{oid}/deliver",
                             json={"photo_base64": "x", "lat": 0, "lng": 0}, headers=_h(delivery))
        assert r2.status_code in (400, 403, 409), f"expected OTP-required failure, got {r2.status_code}"

        # deliver with wrong OTP → should fail
        r3 = api_client.post(f"{base_url}/api/delivery/orders/{oid}/deliver",
                             json={"photo_base64": "x", "lat": 0, "lng": 0, "cash_otp": "000000"},
                             headers=_h(delivery))
        assert r3.status_code in (400, 403, 409)

        # deliver with correct OTP
        r4 = api_client.post(f"{base_url}/api/delivery/orders/{oid}/deliver",
                             json={"photo_base64": "x", "lat": 0, "lng": 0, "cash_otp": b["otp"]},
                             headers=_h(delivery))
        assert r4.status_code == 200, r4.text
