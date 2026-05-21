"""Backend integration tests for RX Tech – full coverage of auth, catalog, cart, orders, payments, returns, shortbook."""
import time
import pytest

EMAIL = f"test+{int(time.time())}@pharmacy.com"


@pytest.fixture(scope="module")
def auth(api_client, base_url):
    # send OTP
    r = api_client.post(f"{base_url}/api/auth/send-otp", json={"email": EMAIL})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("success") is True
    assert "dev_otp" in data and len(data["dev_otp"]) == 6
    otp = data["dev_otp"]

    # verify OTP
    r = api_client.post(f"{base_url}/api/auth/verify-otp", json={"email": EMAIL, "otp": otp})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j.get("success") is True
    assert "token" in j
    assert j["user"]["email"] == EMAIL
    assert j["user"]["onboarded"] is False
    return {"token": j["token"], "user": j["user"]}


@pytest.fixture(scope="module")
def headers(auth):
    return {"Authorization": f"Bearer {auth['token']}", "Content-Type": "application/json"}


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

    def test_me_with_token(self, api_client, base_url, headers, auth):
        r = api_client.get(f"{base_url}/api/auth/me", headers=headers)
        assert r.status_code == 200
        assert r.json()["email"] == auth["user"]["email"]

    def test_onboard(self, api_client, base_url, headers):
        payload = {"name": "Test Pharma Owner", "phone": "9876543210", "shop_name": "Test Stores", "gst": "27ABCDE1234F1Z5", "address": "Mumbai"}
        r = api_client.post(f"{base_url}/api/auth/onboard", json=payload, headers=headers)
        assert r.status_code == 200, r.text
        user = r.json()["user"]
        assert user["onboarded"] is True
        assert user["name"] == "Test Pharma Owner"
        assert user["phone"] == "9876543210"
        # Verify persistence via /me
        r2 = api_client.get(f"{base_url}/api/auth/me", headers=headers)
        assert r2.json()["onboarded"] is True


# ---------- Dashboard ----------
class TestDashboard:
    def test_dashboard_requires_auth(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/dashboard")
        assert r.status_code in (401, 403)

    def test_dashboard_shape(self, api_client, base_url, headers):
        r = api_client.get(f"{base_url}/api/dashboard", headers=headers)
        assert r.status_code == 200
        d = r.json()
        for key in ("today_orders", "payment_due", "ai_insights", "deliveries", "action_required", "profit_opportunities"):
            assert key in d, f"missing {key}"
        assert isinstance(d["deliveries"], list)
        assert isinstance(d["profit_opportunities"], list)
        assert d["today_orders"]["count"] >= 0


# ---------- Distributors & Products ----------
class TestCatalog:
    def test_distributors_list(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/distributors")
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 5
        assert all("id" in d for d in items)

    def test_distributors_search(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/distributors", params={"q": "ABC"})
        assert r.status_code == 200
        items = r.json()
        assert any("ABC" in d["name"] for d in items)

    def test_distributor_detail(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/distributors/dist-1")
        assert r.status_code == 200
        body = r.json()
        assert "distributor" in body and "products" in body
        assert body["distributor"]["id"] == "dist-1"
        assert len(body["products"]) > 0

    def test_distributor_404(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/distributors/nope")
        assert r.status_code == 404

    def test_products_list(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/products")
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 10

    def test_products_search(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/products", params={"q": "para"})
        assert r.status_code == 200
        items = r.json()
        assert any("Paracetamol" in p["name"] for p in items)

    def test_product_detail(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/products/p-1")
        assert r.status_code == 200
        body = r.json()
        assert body["product"]["id"] == "p-1"
        assert isinstance(body["distributors"], list) and len(body["distributors"]) >= 1
        assert "substitutes" in body


# ---------- Cart ----------
class TestCart:
    cart_item_id = None

    def test_add_cart_item(self, api_client, base_url, headers):
        r = api_client.post(f"{base_url}/api/cart/items", json={"product_id": "p-1", "distributor_id": "dist-3", "qty": 5}, headers=headers)
        assert r.status_code == 200, r.text
        TestCart.cart_item_id = r.json()["id"]

    def test_get_cart_enriched(self, api_client, base_url, headers):
        r = api_client.get(f"{base_url}/api/cart", headers=headers)
        assert r.status_code == 200
        body = r.json()
        assert body["count"] >= 1
        assert "product" in body["items"][0]
        assert "distributor" in body["items"][0]
        assert body["total"] > 0

    def test_update_cart_qty(self, api_client, base_url, headers):
        r = api_client.patch(f"{base_url}/api/cart/items/{TestCart.cart_item_id}", json={"qty": 10}, headers=headers)
        assert r.status_code == 200
        # verify
        r2 = api_client.get(f"{base_url}/api/cart", headers=headers)
        item = next(i for i in r2.json()["items"] if i["id"] == TestCart.cart_item_id)
        assert item["qty"] == 10

    def test_add_second_item_then_place_order(self, api_client, base_url, headers):
        r = api_client.post(f"{base_url}/api/cart/items", json={"product_id": "p-2", "distributor_id": "dist-2", "qty": 3}, headers=headers)
        assert r.status_code == 200
        r2 = api_client.post(f"{base_url}/api/orders", headers=headers)
        assert r2.status_code == 200, r2.text
        orders = r2.json()["orders"]
        assert len(orders) == 2  # grouped by distributor
        # cart should be cleared
        r3 = api_client.get(f"{base_url}/api/cart", headers=headers)
        assert r3.json()["count"] == 0

    def test_place_order_empty_cart(self, api_client, base_url, headers):
        r = api_client.post(f"{base_url}/api/orders", headers=headers)
        assert r.status_code == 400


# ---------- Orders ----------
class TestOrders:
    def test_list_orders(self, api_client, base_url, headers):
        r = api_client.get(f"{base_url}/api/orders", headers=headers)
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 4

    def test_filter_orders_by_status(self, api_client, base_url, headers):
        r = api_client.get(f"{base_url}/api/orders", params={"status": "delivered"}, headers=headers)
        assert r.status_code == 200
        for o in r.json():
            assert o["status"] == "delivered"

    def test_get_order_detail(self, api_client, base_url, headers):
        listing = api_client.get(f"{base_url}/api/orders", headers=headers).json()
        oid = listing[0]["id"]
        r = api_client.get(f"{base_url}/api/orders/{oid}", headers=headers)
        assert r.status_code == 200
        assert r.json()["id"] == oid


# ---------- Payments ----------
class TestPayments:
    def test_list_payments(self, api_client, base_url, headers):
        r = api_client.get(f"{base_url}/api/payments", headers=headers)
        assert r.status_code == 200
        body = r.json()
        assert "items" in body and "total_due" in body and "total_overdue" in body
        assert body["total_due"] > 0

    def test_pay_invoice(self, api_client, base_url, headers):
        listing = api_client.get(f"{base_url}/api/payments", headers=headers).json()
        due_item = next((p for p in listing["items"] if p["status"] in ("due", "overdue")), None)
        assert due_item is not None
        r = api_client.post(f"{base_url}/api/payments/{due_item['id']}/pay", headers=headers)
        assert r.status_code == 200
        # verify status changed
        after = api_client.get(f"{base_url}/api/payments", headers=headers).json()
        target = next(p for p in after["items"] if p["id"] == due_item["id"])
        assert target["status"] == "paid"


# ---------- Returns ----------
class TestReturns:
    def test_list_returns(self, api_client, base_url, headers):
        r = api_client.get(f"{base_url}/api/returns", headers=headers)
        assert r.status_code == 200
        assert len(r.json()) >= 1

    def test_create_return(self, api_client, base_url, headers):
        payload = {"product_name": "TEST_Item", "distributor_name": "ABC Pharma", "reason": "Damaged", "qty": 2, "amount": 100.0}
        r = api_client.post(f"{base_url}/api/returns", json=payload, headers=headers)
        assert r.status_code == 200
        item = r.json()["item"]
        assert item["status"] == "requested"
        # verify persistence
        listing = api_client.get(f"{base_url}/api/returns", headers=headers).json()
        assert any(x["id"] == item["id"] for x in listing)


# ---------- Shortbook ----------
class TestShortbook:
    def test_list_shortbook(self, api_client, base_url, headers):
        r = api_client.get(f"{base_url}/api/shortbook", headers=headers)
        assert r.status_code == 200
        body = r.json()
        assert body["count"] >= 1
        assert body["total"] > 0

    def test_order_shortbook_item(self, api_client, base_url, headers):
        sb = api_client.get(f"{base_url}/api/shortbook", headers=headers).json()
        sid = sb["items"][0]["id"]
        before_count = sb["count"]
        r = api_client.post(f"{base_url}/api/shortbook/{sid}/order", headers=headers)
        assert r.status_code == 200
        # cart should now contain that item
        cart = api_client.get(f"{base_url}/api/cart", headers=headers).json()
        assert cart["count"] >= 1
        # shortbook count decreased
        after = api_client.get(f"{base_url}/api/shortbook", headers=headers).json()
        assert after["count"] == before_count - 1
