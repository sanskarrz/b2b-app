"""V4 feature tests: scan/extract, reports/analytics, reports/gst-invoices, reports/profit, auth/profile PATCH."""
import time
import base64
import pytest

DEMO_EMAIL = "demo@rxtech.com"


def _login(api_client, base_url, email):
    r = api_client.post(f"{base_url}/api/auth/send-otp", json={"email": email})
    assert r.status_code == 200
    otp = r.json()["dev_otp"]
    r = api_client.post(f"{base_url}/api/auth/verify-otp", json={"email": email, "otp": otp})
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="module")
def demo_headers(api_client, base_url):
    auth = _login(api_client, base_url, DEMO_EMAIL)
    return {"Authorization": f"Bearer {auth['token']}", "Content-Type": "application/json"}


# ---------- Scan/Extract ----------
class TestScanExtract:
    def test_scan_requires_auth(self, api_client, base_url):
        r = api_client.post(f"{base_url}/api/scan/extract", json={"image_base64": "abc"})
        assert r.status_code in (401, 403)

    def test_scan_with_invalid_image_returns_error(self, api_client, base_url, demo_headers):
        # 1x1 transparent PNG
        tiny_png = (
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
        )
        r = api_client.post(
            f"{base_url}/api/scan/extract",
            json={"image_base64": tiny_png},
            headers=demo_headers,
            timeout=60,
        )
        # Backend may return 500 (OCR error) or 200 with empty extracted
        assert r.status_code in (200, 400, 500)
        if r.status_code == 200:
            body = r.json()
            assert "extracted" in body
            assert "matches" in body


# ---------- Reports: Analytics ----------
class TestReportsAnalytics:
    def test_analytics_requires_auth(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/reports/analytics")
        assert r.status_code in (401, 403)

    def test_analytics_shape(self, api_client, base_url, demo_headers):
        r = api_client.get(f"{base_url}/api/reports/analytics", headers=demo_headers)
        assert r.status_code == 200, r.text
        b = r.json()
        assert "summary" in b
        s = b["summary"]
        for k in ("total_spend", "total_orders", "avg_order_value", "delivered_count"):
            assert k in s
        assert "top_distributors" in b and isinstance(b["top_distributors"], list)
        assert "by_month" in b and isinstance(b["by_month"], list)
        assert s["total_orders"] >= 4
        assert s["total_spend"] > 0


# ---------- Reports: GST Invoices ----------
class TestReportsGST:
    def test_gst_requires_auth(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/reports/gst-invoices")
        assert r.status_code in (401, 403)

    def test_gst_shape_and_demo_count(self, api_client, base_url, demo_headers):
        r = api_client.get(f"{base_url}/api/reports/gst-invoices", headers=demo_headers)
        assert r.status_code == 200, r.text
        b = r.json()
        assert "items" in b
        assert "total_taxable" in b
        assert "total_gst" in b
        assert "total_invoice" in b
        # Demo expected 7 payments
        assert len(b["items"]) >= 7, f"Expected >=7, got {len(b['items'])}"
        # Check item shape
        it = b["items"][0]
        for k in ("invoice_code", "distributor", "date", "taxable", "gst", "total", "status", "id"):
            assert k in it
        # totals should be approximately consistent: taxable + gst == total per item
        assert abs(it["taxable"] + it["gst"] - it["total"]) < 0.5


# ---------- Reports: Profit ----------
class TestReportsProfit:
    def test_profit_requires_auth(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/reports/profit")
        assert r.status_code in (401, 403)

    def test_profit_shape(self, api_client, base_url, demo_headers):
        r = api_client.get(f"{base_url}/api/reports/profit", headers=demo_headers)
        assert r.status_code == 200, r.text
        b = r.json()
        assert "summary" in b
        s = b["summary"]
        for k in ("total_value", "total_margin", "avg_margin_pct"):
            assert k in s
        assert "top_sku" in b and isinstance(b["top_sku"], list)
        if b["top_sku"]:
            row = b["top_sku"][0]
            for k in ("product_id", "name", "qty", "value", "margin", "margin_pct"):
                assert k in row


# ---------- Profile PATCH ----------
class TestProfileUpdate:
    def test_profile_requires_auth(self, api_client, base_url):
        r = api_client.patch(f"{base_url}/api/auth/profile", json={"name": "x"})
        assert r.status_code in (401, 403)

    def test_profile_update_persists(self, api_client, base_url, demo_headers):
        new_name = f"Demo Pharmacy {int(time.time())}"
        payload = {
            "name": new_name,
            "phone": "9999900000",
            "shop_name": "RX Demo Medical Stores",
            "gst": "27DEMO1234F1Z9",
            "address": "Demo Address",
        }
        r = api_client.patch(f"{base_url}/api/auth/profile", json=payload, headers=demo_headers)
        assert r.status_code == 200, r.text
        u = r.json()
        assert u["name"] == new_name
        # Verify via GET /me
        me = api_client.get(f"{base_url}/api/auth/me", headers=demo_headers).json()
        assert me["name"] == new_name
        assert me["shop_name"] == "RX Demo Medical Stores"
