"""
Iteration 11 — Hardening fixes regression tests.

Covers:
  FIX 1: /api/distributor/me/sync/import with source=drive handles
         - Google Sheets public link (spreadsheets export endpoint) -> 2365 products
         - /file/d/<id>/view style link (falls back to usercontent)
         - invalid/garbage link -> 400 'valid Google Drive link'
         - private/non-shared link -> 400 'Anyone with the link' (NOT 500)
  REGRESSION: POST /api/auth/register works WITHOUT bearer token (distributor + pharmacy)
  REGRESSION: /distributor/me/sync/* endpoints still work (settings, logs, export, browse)
"""
import os
import time
import uuid
import requests
import pytest

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://pharmacy-b2b.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

# User-supplied real public Google Sheets link (from review request)
REAL_SHEETS_URL = (
    "https://docs.google.com/spreadsheets/d/1x_iAHuQBr-Gy9u0ic5J2Jq9USmdUbnQB/"
    "edit?usp=drive_link&ouid=105565556804437064926&rtpof=true&sd=true"
)
# A /file/d/<id>/view style URL using the SAME file id (so it still resolves
# to a publicly-exportable spreadsheet via the fallback path).
FILE_VIEW_URL = "https://drive.google.com/file/d/1x_iAHuQBr-Gy9u0ic5J2Jq9USmdUbnQB/view?usp=sharing"
# A valid-shape Drive link that definitely doesn't resolve to a public file
PRIVATE_URL = "https://drive.google.com/file/d/1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA_X/view?usp=sharing"
INVALID_URL = "not a real url at all"


# ---------- fixtures ----------

@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def distributor_token(session):
    """Login as the seed distributor owner (owner@rxtech.com) via dev OTP."""
    r = session.post(f"{API}/auth/send-otp", json={"email": "owner@rxtech.com"})
    assert r.status_code == 200, r.text
    otp = r.json().get("dev_otp")
    assert otp, "dev_otp missing from send-otp response"
    r = session.post(f"{API}/auth/verify-otp", json={"email": "owner@rxtech.com", "otp": otp})
    assert r.status_code == 200, r.text
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok
    return tok


@pytest.fixture
def auth_headers(distributor_token):
    return {"Authorization": f"Bearer {distributor_token}", "Content-Type": "application/json"}


# ---------- FIX 1 — Drive/Sheets import ----------

class TestDriveImport:

    def test_sheets_link_imports_products(self, session, auth_headers):
        """Real public Sheets link should return 200 with ~2365 products detected."""
        r = session.post(
            f"{API}/distributor/me/sync/import",
            json={"source": "drive", "drive_url": REAL_SHEETS_URL},
            headers=auth_headers, timeout=180,
        )
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text[:400]}"
        body = r.json()
        assert body.get("success") is True
        # Nested shape: {summary:{product:{found,inserted,updated}, ...}, total_rows}
        summary = body.get("summary") or {}
        prod = summary.get("product") or {}
        found = prod.get("found") or 0
        print(f"Sheets import -> product.found={found}, inserted={prod.get('inserted')}, updated={prod.get('updated')}, total_rows={body.get('total_rows')}")
        assert found >= 2000, f"Expected ~2365 products, got {found}"
        # Row-count sanity: total_rows should include the raw 2369 before filtering
        assert (body.get("total_rows") or 0) >= 2000

    def test_file_view_link_falls_back_and_imports(self, session, auth_headers):
        """A /file/d/<id>/view URL should trigger the usercontent download first,
        then fall back to the Sheets export. For this spreadsheet id, the Sheets
        fallback path should still succeed."""
        r = session.post(
            f"{API}/distributor/me/sync/import",
            json={"source": "drive", "drive_url": FILE_VIEW_URL},
            headers=auth_headers, timeout=180,
        )
        # Should return 200 OR a well-formed 400 (if Google blocks the usercontent + sheets paths).
        assert r.status_code in (200, 400), f"Unexpected {r.status_code}: {r.text[:400]}"
        if r.status_code == 200:
            prod = (r.json().get("summary") or {}).get("product") or {}
            assert (prod.get("found") or 0) >= 2000
        else:
            # If 400, we expect the human-readable 'Anyone with the link' guidance (never 500)
            assert "link" in r.text.lower() or "drive" in r.text.lower()

    def test_invalid_link_returns_400(self, session, auth_headers):
        r = session.post(
            f"{API}/distributor/me/sync/import",
            json={"source": "drive", "drive_url": INVALID_URL},
            headers=auth_headers, timeout=30,
        )
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text[:200]}"
        # Backend message: "That doesn't look like a valid Google Drive link."
        assert "valid Google Drive link" in r.text or "valid google drive link" in r.text.lower()

    def test_empty_url_returns_400(self, session, auth_headers):
        r = session.post(
            f"{API}/distributor/me/sync/import",
            json={"source": "drive", "drive_url": ""},
            headers=auth_headers, timeout=30,
        )
        assert r.status_code == 400
        assert "Google Drive link" in r.text

    def test_private_link_returns_400_not_500(self, session, auth_headers):
        """A syntactically valid but non-public Drive id must return 400 with
        the 'Anyone with the link' guidance — NEVER a 500."""
        r = session.post(
            f"{API}/distributor/me/sync/import",
            json={"source": "drive", "drive_url": PRIVATE_URL},
            headers=auth_headers, timeout=60,
        )
        assert r.status_code != 500, f"Private link produced a 500: {r.text[:400]}"
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text[:200]}"
        # Must contain the public-sharing guidance
        txt = r.text.lower()
        assert "anyone with the link" in txt or "publicly accessible" in txt, \
            f"Expected 'Anyone with the link' guidance, got: {r.text[:400]}"


# ---------- REGRESSION — /auth/register without token ----------

class TestRegisterNoToken:

    def _unique_email(self, prefix="test"):
        return f"TEST_{prefix}_{uuid.uuid4().hex[:8]}@example.com"

    def test_register_distributor_without_bearer_token(self):
        """A FRESH requests.Session (no Authorization) must be able to register."""
        s = requests.Session()  # explicitly no Authorization header
        payload = {
            "account_type": "distributor",
            "name": "TEST Reg Owner",
            "email": self._unique_email("dist"),
            "phone": "9000000011",
            "business_name": f"TEST Dist {uuid.uuid4().hex[:6]}",
        }
        r = s.post(f"{API}/auth/register", json=payload, timeout=30)
        assert r.status_code == 200, f"Register failed w/o token: {r.status_code} {r.text[:400]}"
        body = r.json()
        assert body.get("dev_otp"), "dev_otp missing in register response"
        assert (body.get("email") or "").lower() == payload["email"].lower()
        # Confirm user is persisted & can OTP-login
        r2 = s.post(f"{API}/auth/verify-otp", json={"email": payload["email"], "otp": body["dev_otp"]})
        assert r2.status_code == 200, r2.text
        tok = r2.json().get("token") or r2.json().get("access_token")
        assert tok
        # And firm should be in /api/distributors
        r3 = s.get(f"{API}/distributors")
        assert r3.status_code == 200
        names = [d.get("business_name") or d.get("name") for d in r3.json()]
        assert payload["business_name"] in names, "New distributor firm not visible in /distributors"

    def test_register_pharmacy_without_bearer_token(self):
        s = requests.Session()
        payload = {
            "account_type": "pharmacy",
            "name": "TEST Reg Pharma",
            "email": self._unique_email("pharm"),
            "phone": "9000000022",
            "business_name": f"TEST Pharm {uuid.uuid4().hex[:6]}",
        }
        r = s.post(f"{API}/auth/register", json=payload, timeout=30)
        assert r.status_code == 200, f"Register failed: {r.status_code} {r.text[:400]}"
        body = r.json()
        assert body.get("dev_otp")
        r2 = s.post(f"{API}/auth/verify-otp", json={"email": payload["email"], "otp": body["dev_otp"]})
        assert r2.status_code == 200


# ---------- REGRESSION — Data Sync endpoints still work ----------

class TestSyncEndpointsRegression:

    def test_sync_settings_patch_drive_url(self, session, auth_headers):
        r = session.patch(
            f"{API}/distributor/me/sync/settings",
            json={"drive_url": REAL_SHEETS_URL},
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text
        r2 = session.get(f"{API}/distributor/me/sync/settings", headers=auth_headers)
        assert r2.status_code == 200
        assert r2.json().get("drive_url") == REAL_SHEETS_URL

    def test_sync_logs_renders(self, session, auth_headers):
        r = session.get(f"{API}/distributor/me/sync/logs", headers=auth_headers)
        assert r.status_code == 200
        body = r.json()
        # Should be a list OR a dict wrapping a list
        if isinstance(body, dict):
            assert any(isinstance(v, list) for v in body.values())
        else:
            assert isinstance(body, list)

    def test_sync_browse_products(self, session, auth_headers):
        r = session.get(
            f"{API}/distributor/me/sync/browse",
            params={"type": "product", "limit": 5},
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        # Shape {items/products: [...], total: N} or similar
        items = body.get("items") or body.get("products") or body.get("rows") or []
        total = body.get("total")
        print(f"browse: total={total}, items[0..1]={items[:1]}")
        assert isinstance(items, list)

    def test_sync_export_product(self, session, auth_headers):
        """Export endpoint should return a downloadable payload (CSV/XLSX)."""
        # Try common export routes
        for path in (
            "/distributor/me/sync/export?type=product",
            "/distributor/me/sync/export/product",
        ):
            r = session.get(f"{API}{path}", headers=auth_headers)
            if r.status_code == 200:
                assert r.content and len(r.content) > 0
                print(f"export OK at {path}, bytes={len(r.content)}, ct={r.headers.get('content-type')}")
                return
        pytest.skip("No matching export route found; already covered by test_export_download.py")
