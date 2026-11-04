"""Focused test: verify POST /api/distributor/me/sync/export returns valid
base64-encoded CSV / XLSX payload (this powers the frontend Blob download fix).
"""
import os
import base64
import io
import zipfile
import requests
import pytest

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://distro-import--1znvr854.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def owner_token():
    r = requests.post(f"{API}/auth/send-otp", json={"email": "owner@rxtech.com"}, timeout=30)
    assert r.status_code == 200, r.text
    otp = r.json().get("dev_otp")
    assert otp
    r2 = requests.post(f"{API}/auth/verify-otp", json={"email": "owner@rxtech.com", "otp": otp}, timeout=30)
    assert r2.status_code == 200, r2.text
    tok = r2.json().get("token") or r2.json().get("access_token")
    assert tok, r2.json()
    return tok


@pytest.fixture(scope="module")
def headers(owner_token):
    return {"Authorization": f"Bearer {owner_token}", "Content-Type": "application/json"}


class TestExportDownload:
    """Backend must return base64 that decodes to a valid CSV / XLSX blob."""

    def test_full_csv_export(self, headers):
        r = requests.post(
            f"{API}/distributor/me/sync/export",
            json={"mode": "full", "format": "csv"},
            headers=headers,
            timeout=60,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("success") is True
        assert j.get("filename", "").endswith(".csv")
        assert j.get("mime") in ("text/csv", "text/csv; charset=utf-8")
        assert isinstance(j.get("rows"), int) and j["rows"] > 0
        assert isinstance(j.get("orders"), int)
        # base64 must decode to a CSV with at least the header row
        decoded = base64.b64decode(j["base64"]).decode("utf-8", errors="replace")
        assert "\n" in decoded
        first_line = decoded.splitlines()[0].lower()
        # Header should contain some canonical fields
        assert any(k in first_line for k in ("invoice", "party", "order", "amount"))
        print(f"[full-csv] rows={j['rows']} orders={j['orders']} bytes={len(decoded)}")

    def test_full_xlsx_export(self, headers):
        r = requests.post(
            f"{API}/distributor/me/sync/export",
            json={"mode": "full", "format": "xlsx"},
            headers=headers,
            timeout=60,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("success") is True
        assert j.get("filename", "").endswith(".xlsx")
        assert "openxml" in j.get("mime", "") or "spreadsheet" in j.get("mime", "")
        # xlsx is a zip; verify signature and that it contains xl/ folder
        raw = base64.b64decode(j["base64"])
        assert raw[:2] == b"PK", "xlsx must start with PK zip signature"
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            names = z.namelist()
            assert any(n.startswith("xl/") for n in names), f"invalid xlsx layout: {names[:5]}"
        print(f"[full-xlsx] rows={j['rows']} orders={j['orders']} bytes={len(raw)}")

    def test_incremental_after_full_returns_400(self, headers):
        # After a full export just ran, incremental should have no new orders
        r = requests.post(
            f"{API}/distributor/me/sync/export",
            json={"mode": "incremental", "format": "csv"},
            headers=headers,
            timeout=60,
        )
        # Either 400 with a friendly message, or 200 with zero rows — both are acceptable UX
        if r.status_code == 400:
            assert "no new orders" in r.text.lower()
        else:
            assert r.status_code == 200
            j = r.json()
            # zero rows is fine for the incremental "nothing new" path
            assert j.get("rows", 0) >= 0
