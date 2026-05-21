"""Backend integration tests for RX Tech – covers demo seeding, non-demo empty start, and full CRUD."""
import time
import pytest

# Two parallel users:
# - DEMO: gets pre-seeded data
# - FRESH: starts empty (real user)
DEMO_EMAIL = "demo@rxtech.com"
FRESH_EMAIL = f"fresh+{int(time.time())}@pharmacy.com"


def _login(api_client, base_url, email: str):
    r = api_client.post(f"{base_url}/api/auth/send-otp", json={"email": email})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("success") is True
    assert "dev_otp" in data and len(data["dev_otp"]) == 6
    otp = data["dev_otp"]

    r = api_client.post(f"{base_url}/api/auth/verify-otp", json={"email": email, "otp": otp})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j.get("success") is True
    assert "token" in j
    assert j["user"]["email"] == email
    return {"token": j["token"], "user": j["user"]}


@pytest.fixture(scope="module")
def demo_auth(api_client, base_url):
    return _login(api_client, base_url, DEMO_EMAIL)


@pytest.fixture(scope="module")
def demo_headers(demo_auth):
    return {"Authorization": f"Bearer {demo_auth['token']}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def fresh_auth(api_client, base_url):
    return _login(api_client, base_url, FRESH_EMAIL)


@pytest.fixture(scope="module")
def fresh_headers(fresh_auth):
    return {"Authorization": f"Bearer {fresh_auth['token']}", "Content-Type": "application/json"}


# ---------- Auth ----------
class TestAuth:
    def test_send_otp_invalid_email(self, api_client, base_url):
        r = api_client.post(f"{base_url}/api/auth/send-otp", json={"email": "not-an-email"})
        assert r.status_code == 422

    def test_verify_invalid_otp(self, api_client, base_url):
        email = f"badotp+{int(time.time())}@pharmacy.com"
        api_client.post(f"{base_url}/api/auth/send-otp", json={"email": email})
        r = api_client.post(f"{base_url}/api/auth/verify-otp", json={"email": email, "otp": "000000"})
        assert r.status_code == 400

    def test_me_without_token(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/auth/me")
        assert r.status_code in (401, 403)

    def test_me_with_token(self, api_client, base_url, fresh_headers, fresh_auth):
        r = api_client.get(f"{base_url}/api/auth/me", headers=fresh_headers)
        assert r.status_code == 200
        assert r.json()["email"] == fresh_auth["user"]["email"]

    def test_onboard_fresh_user(self, api_client, base_url, fresh_headers):
        payload = {"name": "Test Pharma Owner", "phone": "9876543210", "shop_name": "Test Stores", "gst": "27ABCDE1234F1Z5", "address": "Mumbai"}
        r = api_client.post(f"{base_url}/api/auth/onboard", json=payload, headers=fresh_headers)
        assert r.status_code == 200, r.text
        user = r.json()["user"]
        assert user["onboarded"] is True
        assert user["name"] == "Test Pharma Owner"


# ---------- DEMO USER: must have pre-seeded data ----------
class TestDemoSeed:
    def test_demo_has_seeded_orders(self, api_client, base_url, demo_headers):
        r = api_client.get(f"{base_url}/api/orders", headers=demo_headers)
        assert r.status_code == 200
        items = r.json()
        # At least the 4 seeded orders (could have more if previously tested)
        assert len(items) >= 4, f"Demo should have >=4 orders, got {len(items)}"

    def test_demo_has_seeded_payments(self, api_client, base_url, demo_headers):
        r = api_client.get(f"{base_url}/api/payments", headers=demo_headers)
        assert r.status_code == 200
        body = r.json()
        assert len(body["items"]) >= 4, f"Demo should have >=4 payments, got {len(body['items'])}"
        assert body["total_due"] > 0

    def test_demo_has_seeded_shortbook(self, api_client, base_url, demo_headers):
        r = api_client.get(f"{base_url}/api/shortbook", headers=demo_headers)
        assert r.status_code == 200
        body = r.json()
        assert body["count"] >= 8, f"Demo should have >=8 shortbook items, got {body['count']}"
        assert body["total"] > 0

    def test_demo_has_seeded_returns(self, api_client, base_url, demo_headers):
        r = api_client.get(f"{base_url}/api/returns", headers=demo_headers)
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 2, f"Demo should have >=2 returns, got {len(items)}"

    def test_demo_dashboard_populated(self, api_client, base_url, demo_headers):
        r = api_client.get(f"{base_url}/api/dashboard", headers=demo_headers)
        assert r.status_code == 200
        d = r.json()
        assert d["today_orders"]["count"] >= 1
        assert d["ai_insights"]["sku_count"] >= 1


# ---------- FRESH (NON-DEMO) USER: must start EMPTY ----------
class TestFreshUserEmpty:
    def test_fresh_orders_empty(self, api_client, base_url, fresh_headers):
        r = api_client.get(f"{base_url}/api/orders", headers=fresh_headers)
        assert r.status_code == 200
        assert r.json() == [], f"Fresh user should have 0 orders, got {len(r.json())}"

    def test_fresh_payments_empty(self, api_client, base_url, fresh_headers):
        r = api_client.get(f"{base_url}/api/payments", headers=fresh_headers)
        assert r.status_code == 200
        body = r.json()
        assert body["items"] == []
        assert body["total_due"] == 0
        assert body["total_overdue"] == 0

    def test_fresh_returns_empty(self, api_client, base_url, fresh_headers):
        r = api_client.get(f"{base_url}/api/returns", headers=fresh_headers)
        assert r.status_code == 200
        assert r.json() == []

    def test_fresh_shortbook_empty(self, api_client, base_url, fresh_headers):
        r = api_client.get(f"{base_url}/api/shortbook", headers=fresh_headers)
        assert r.status_code == 200
        body = r.json()
        assert body["items"] == []
        assert body["count"] == 0
        assert body["total"] == 0

    def test_fresh_dashboard_zero(self, api_client, base_url, fresh_headers):
        r = api_client.get(f"{base_url}/api/dashboard", headers=fresh_headers)
        assert r.status_code == 200
        d = r.json()
        assert d["today_orders"]["count"] == 0
        assert d["today_orders"]["total"] == 0
        assert d["payment_due"]["amount"] == 0
        assert d["ai_insights"]["sku_count"] == 0
        assert d["deliveries"] == []


# ---------- Catalog (global, works for both) ----------
class TestCatalog:
    def test_distributors_list(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/distributors")
        assert r.status_code == 200
        assert len(r.json()) >= 5

    def test_distributors_search(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/distributors", params={"q": "ABC"})
        assert r.status_code == 200
        assert any("ABC" in d["name"] for d in r.json())

    def test_distributor_detail(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/distributors/dist-1")
        assert r.status_code == 200
        body = r.json()
        assert body["distributor"]["id"] == "dist-1"
        assert len(body["products"]) > 0

    def test_distributor_404(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/distributors/nope")
        assert r.status_code == 404

    def test_products_list(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/products")
        assert r.status_code == 200
        assert len(r.json()) >= 10

    def test_products_search(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/products", params={"q": "para"})
        assert r.status_code == 200
        assert any("Paracetamol" in p["name"] for p in r.json())

    def test_product_detail(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/products/p-1")
        assert r.status_code == 200
        body = r.json()
        assert body["product"]["id"] == "p-1"
        assert len(body["distributors"]) >= 1


# ---------- Cart + Place Order for FRESH user (real flow) ----------
class TestFreshOrderFlow:
    cart_item_id = None

    def test_add_cart_item(self, api_client, base_url, fresh_headers):
        r = api_client.post(f"{base_url}/api/cart/items", json={"product_id": "p-1", "distributor_id": "dist-3", "qty": 5}, headers=fresh_headers)
        assert r.status_code == 200, r.text
        TestFreshOrderFlow.cart_item_id = r.json()["id"]

    def test_cart_enriched(self, api_client, base_url, fresh_headers):
        r = api_client.get(f"{base_url}/api/cart", headers=fresh_headers)
        assert r.status_code == 200
        body = r.json()
        assert body["count"] >= 1
        assert "product" in body["items"][0]
        assert body["total"] > 0

    def test_update_cart_qty(self, api_client, base_url, fresh_headers):
        r = api_client.patch(f"{base_url}/api/cart/items/{TestFreshOrderFlow.cart_item_id}", json={"qty": 10}, headers=fresh_headers)
        assert r.status_code == 200
        r2 = api_client.get(f"{base_url}/api/cart", headers=fresh_headers)
        item = next(i for i in r2.json()["items"] if i["id"] == TestFreshOrderFlow.cart_item_id)
        assert item["qty"] == 10

    def test_place_order_creates_real_order(self, api_client, base_url, fresh_headers):
        # add 2nd item for distributor grouping
        api_client.post(f"{base_url}/api/cart/items", json={"product_id": "p-2", "distributor_id": "dist-2", "qty": 3}, headers=fresh_headers)
        r = api_client.post(f"{base_url}/api/orders", headers=fresh_headers)
        assert r.status_code == 200, r.text
        orders = r.json()["orders"]
        assert len(orders) == 2  # grouped by distributor

        # Verify orders appear in listing
        listing = api_client.get(f"{base_url}/api/orders", headers=fresh_headers).json()
        assert len(listing) == 2, f"Fresh user should now have exactly 2 orders, got {len(listing)}"
        assert all(o["status"] == "placed" for o in listing)

        # Cart should be cleared
        cart = api_client.get(f"{base_url}/api/cart", headers=fresh_headers).json()
        assert cart["count"] == 0

    def test_place_order_empty_cart(self, api_client, base_url, fresh_headers):
        r = api_client.post(f"{base_url}/api/orders", headers=fresh_headers)
        assert r.status_code == 400


# ---------- Order details & filtering (use DEMO user since has multiple statuses) ----------
class TestOrders:
    def test_filter_orders_by_status(self, api_client, base_url, demo_headers):
        r = api_client.get(f"{base_url}/api/orders", params={"status": "delivered"}, headers=demo_headers)
        assert r.status_code == 200
        for o in r.json():
            assert o["status"] == "delivered"

    def test_get_order_detail(self, api_client, base_url, demo_headers):
        listing = api_client.get(f"{base_url}/api/orders", headers=demo_headers).json()
        oid = listing[0]["id"]
        r = api_client.get(f"{base_url}/api/orders/{oid}", headers=demo_headers)
        assert r.status_code == 200
        assert r.json()["id"] == oid


# ---------- Payments pay (use DEMO since has due payments) ----------
class TestPaymentsPay:
    def test_pay_invoice(self, api_client, base_url, demo_headers):
        listing = api_client.get(f"{base_url}/api/payments", headers=demo_headers).json()
        due_item = next((p for p in listing["items"] if p["status"] in ("due", "overdue")), None)
        assert due_item is not None, "Demo should have at least one due/overdue payment"
        r = api_client.post(f"{base_url}/api/payments/{due_item['id']}/pay", headers=demo_headers)
        assert r.status_code == 200
        after = api_client.get(f"{base_url}/api/payments", headers=demo_headers).json()
        target = next(p for p in after["items"] if p["id"] == due_item["id"])
        assert target["status"] == "paid"


# ---------- Returns CREATE (works for any user) ----------
class TestReturns:
    def test_create_return_for_fresh_user(self, api_client, base_url, fresh_headers):
        payload = {"product_name": "TEST_Item", "distributor_name": "ABC Pharma", "reason": "Damaged", "qty": 2, "amount": 100.0}
        r = api_client.post(f"{base_url}/api/returns", json=payload, headers=fresh_headers)
        assert r.status_code == 200
        item = r.json()["item"]
        assert item["status"] == "requested"
        listing = api_client.get(f"{base_url}/api/returns", headers=fresh_headers).json()
        assert any(x["id"] == item["id"] for x in listing)


# ---------- Shortbook order (DEMO user) ----------
class TestShortbook:
    def test_order_shortbook_item(self, api_client, base_url, demo_headers):
        sb = api_client.get(f"{base_url}/api/shortbook", headers=demo_headers).json()
        if sb["count"] == 0:
            pytest.skip("No shortbook items left for demo (test re-run)")
        sid = sb["items"][0]["id"]
        before_count = sb["count"]
        r = api_client.post(f"{base_url}/api/shortbook/{sid}/order", headers=demo_headers)
        assert r.status_code == 200
        after = api_client.get(f"{base_url}/api/shortbook", headers=demo_headers).json()
        assert after["count"] == before_count - 1
