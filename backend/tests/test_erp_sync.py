"""ERP Data Sync — end-to-end backend tests.

Covers:
- POST /api/distributor/me/sync/import (file, CSV with TITLE row + duplicate data rows)
- Re-import same file → 0 inserted, N updated (dedupe)
- Party + Ledger detection
- GET /api/distributor/me/sync/data (counts + preview)
- Export full CSV/XLSX, incremental 400 when no new orders
- Settings GET/PATCH persistence
- Logs recorded
- Clear (type=all) deletes imported data only
- Role permissions: manager 200, field_sales 403
"""
import base64
import io
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://distro-import--1znvr854.preview.emergentagent.com").rstrip("/")


# ---------- Auth helpers ----------
def _password_login(email: str, password: str = "Pass@123") -> str:
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"password login for {email} failed: {r.status_code} {r.text}"
    return r.json()["token"]


def _otp_login(email: str) -> str:
    r = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"email": email}, timeout=30)
    assert r.status_code == 200, f"send-otp {email}: {r.status_code} {r.text}"
    dev_otp = r.json().get("dev_otp")
    assert dev_otp, f"no dev_otp for {email}: {r.text}"
    r2 = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"email": email, "otp": dev_otp}, timeout=30)
    assert r2.status_code == 200, f"verify-otp {email}: {r2.status_code} {r2.text}"
    return r2.json()["token"]


@pytest.fixture(scope="module")
def owner_headers():
    return {"Authorization": f"Bearer {_otp_login('owner@rxtech.com')}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def manager_headers():
    return {"Authorization": f"Bearer {_password_login('manager@rxtech.com')}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def sales_headers():
    return {"Authorization": f"Bearer {_password_login('sales@rxtech.com')}", "Content-Type": "application/json"}


# ---------- CSV builders ----------
def _b64(text: str) -> str:
    return base64.b64encode(text.encode("utf-8")).decode()


PRODUCT_CSV = (
    "TEST_ITEM MASTER EXPORT — Medica Ultimate\n"      # title row
    "Item Code,Item Name,Company,Pack,MRP,PTR,Stock,GST\n"
    "TESTP001,TEST_Paracetamol 500,TEST_Cipla,10x10,25.00,18.50,120,12\n"
    "TESTP001,TEST_Paracetamol 500,TEST_Cipla,10x10,25.00,18.50,120,12\n"    # duplicate row -> collapses
    "TESTP002,TEST_Amoxicillin 250,TEST_Sun,10x10,80.00,62.00,60,12\n"
    "TESTP003,TEST_Cetirizine 10,TEST_Zydus,10x10,15.00,10.50,200,12\n"
)

PARTY_CSV = (
    "TEST_PARTY MASTER EXPORT\n"
    "Party Code,Party Name,Address,City,Phone,GSTIN,Credit Limit,Balance\n"
    "TESTC001,TEST_Apollo Test Store,MG Road,Bengaluru,9999999901,29ABCDE1234F1Z5,50000,12000\n"
    "TESTC001,TEST_Apollo Test Store,MG Road,Bengaluru,9999999901,29ABCDE1234F1Z5,50000,12000\n"  # dup
    "TESTC002,TEST_Wellness Test,Brigade Rd,Bengaluru,9999999902,29ZYXWV9876K1Z5,80000,3000\n"
)

LEDGER_CSV = (
    "TEST_LEDGER EXPORT\n"
    "Voucher No,Date,Party Name,Voucher Type,Debit,Credit,Amount\n"
    "TESTV001,2026-01-05,TEST_Apollo Test Store,Sale,5000,0,5000\n"
    "TESTV001,2026-01-05,TEST_Apollo Test Store,Sale,5000,0,5000\n"  # dup
    "TESTV002,2026-01-06,TEST_Wellness Test,Receipt,0,3000,-3000\n"
)


# ============================================================
# 0. Sanity
# ============================================================
class TestSanity:
    def test_api_reachable(self):
        r = requests.get(f"{BASE_URL}/api/", timeout=15)
        assert r.status_code == 200


# ============================================================
# 1. Import (product) — dedupe + title-row detection
# ============================================================
class TestImportProduct:
    def test_import_product_csv_first_pass(self, owner_headers):
        # start clean so counts are predictable
        requests.post(f"{BASE_URL}/api/distributor/me/sync/clear",
                      json={"type": "all"}, headers=owner_headers, timeout=30)
        r = requests.post(
            f"{BASE_URL}/api/distributor/me/sync/import",
            json={"source": "file", "filename": "TEST_items.csv", "file_base64": _b64(PRODUCT_CSV)},
            headers=owner_headers, timeout=60,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["success"] is True
        prod = j["summary"]["product"]
        # 4 data rows -> 3 unique products (TESTP001 duplicated)
        assert prod["inserted"] == 3, f"expected 3 inserted, got {prod}"
        # party/ledger should not be detected
        assert j["summary"]["party"]["found"] == 0
        assert j["summary"]["ledger"]["found"] == 0
        # sheet detection
        assert any(s.get("detected") == "product" for s in j["sheets"])

    def test_import_product_csv_reimport_dedupe(self, owner_headers):
        r = requests.post(
            f"{BASE_URL}/api/distributor/me/sync/import",
            json={"source": "file", "filename": "TEST_items.csv", "file_base64": _b64(PRODUCT_CSV)},
            headers=owner_headers, timeout=60,
        )
        assert r.status_code == 200, r.text
        prod = r.json()["summary"]["product"]
        # nothing new — same content -> 0 inserted, updates allowed but modified may be 0
        assert prod["inserted"] == 0, f"re-import should insert 0, got {prod}"


# ============================================================
# 2. Party + Ledger detection
# ============================================================
class TestImportPartyLedger:
    def test_party_csv_detected(self, owner_headers):
        r = requests.post(
            f"{BASE_URL}/api/distributor/me/sync/import",
            json={"source": "file", "filename": "TEST_parties.csv", "file_base64": _b64(PARTY_CSV)},
            headers=owner_headers, timeout=60,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["summary"]["party"]["inserted"] == 2, j["summary"]
        assert j["summary"]["product"]["found"] == 0
        assert j["summary"]["ledger"]["found"] == 0

    def test_ledger_csv_detected(self, owner_headers):
        r = requests.post(
            f"{BASE_URL}/api/distributor/me/sync/import",
            json={"source": "file", "filename": "TEST_ledger.csv", "file_base64": _b64(LEDGER_CSV)},
            headers=owner_headers, timeout=60,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["summary"]["ledger"]["inserted"] == 2, j["summary"]
        assert j["summary"]["product"]["found"] == 0
        assert j["summary"]["party"]["found"] == 0


# ============================================================
# 3. Sync data snapshot
# ============================================================
class TestSyncData:
    def test_data_counts_and_preview(self, owner_headers):
        r = requests.get(f"{BASE_URL}/api/distributor/me/sync/data",
                         headers=owner_headers, timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["product"]["count"] >= 3
        assert j["party"]["count"] >= 2
        assert j["ledger"]["count"] >= 2
        assert isinstance(j["product"]["preview"], list) and len(j["product"]["preview"]) > 0
        # verify a preview row shape
        p = j["product"]["preview"][0]
        assert "name" in p and "distributor_id" in p and "dedupe_key" in p
        # ensure Mongo _id not leaking
        assert "_id" not in p


# ============================================================
# 4. Settings persistence
# ============================================================
class TestSettings:
    def test_patch_and_get_settings(self, owner_headers):
        payload = {"drive_url": "https://drive.google.com/file/d/TEST_ABC123/view",
                   "auto_sync": True, "interval_hours": 12}
        r = requests.patch(f"{BASE_URL}/api/distributor/me/sync/settings",
                           json=payload, headers=owner_headers, timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["drive_url"] == payload["drive_url"]
        assert j["auto_sync"] is True
        assert j["interval_hours"] == 12

        # GET should return the same
        r2 = requests.get(f"{BASE_URL}/api/distributor/me/sync/settings",
                          headers=owner_headers, timeout=30)
        assert r2.status_code == 200
        s = r2.json()
        assert s["drive_url"] == payload["drive_url"]
        assert s["auto_sync"] is True
        assert s["interval_hours"] == 12

    def test_interval_clamped(self, owner_headers):
        r = requests.patch(f"{BASE_URL}/api/distributor/me/sync/settings",
                           json={"interval_hours": 500}, headers=owner_headers, timeout=30)
        assert r.status_code == 200
        assert r.json()["interval_hours"] == 168  # upper bound


# ============================================================
# 5. Export full & incremental
# ============================================================
class TestExport:
    def test_export_full_csv(self, owner_headers):
        r = requests.post(f"{BASE_URL}/api/distributor/me/sync/export",
                          json={"mode": "full", "format": "csv"},
                          headers=owner_headers, timeout=60)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["success"] is True
        assert j["filename"].endswith(".csv")
        assert j["mime"] == "text/csv"
        assert j["rows"] > 0 and j["orders"] > 0
        raw = base64.b64decode(j["base64"])
        assert b"Invoice No" in raw and b"Party Name" in raw

    def test_export_full_xlsx(self, owner_headers):
        r = requests.post(f"{BASE_URL}/api/distributor/me/sync/export",
                          json={"mode": "full", "format": "xlsx"},
                          headers=owner_headers, timeout=60)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["filename"].endswith(".xlsx")
        assert "spreadsheetml" in j["mime"]
        raw = base64.b64decode(j["base64"])
        assert raw[:2] == b"PK", "xlsx should be a zip container"

    def test_export_incremental_no_new(self, owner_headers):
        r = requests.post(f"{BASE_URL}/api/distributor/me/sync/export",
                          json={"mode": "incremental", "format": "csv"},
                          headers=owner_headers, timeout=60)
        assert r.status_code == 400, r.text
        assert "No new orders" in r.text or "No new" in r.text


# ============================================================
# 6. Logs recorded
# ============================================================
class TestLogs:
    def test_logs_contain_import_and_export(self, owner_headers):
        r = requests.get(f"{BASE_URL}/api/distributor/me/sync/logs",
                         headers=owner_headers, timeout=30)
        assert r.status_code == 200
        logs = r.json()
        assert isinstance(logs, list) and len(logs) > 0
        directions = {l.get("direction") for l in logs}
        assert "import" in directions
        assert "export" in directions
        # cleanliness
        for l in logs[:5]:
            assert "_id" not in l


# ============================================================
# 7. Role permissions
# ============================================================
class TestRolePermissions:
    def test_manager_can_import(self, manager_headers):
        r = requests.post(
            f"{BASE_URL}/api/distributor/me/sync/import",
            json={"source": "file", "filename": "TEST_mgr.csv",
                  "file_base64": _b64(PRODUCT_CSV)},
            headers=manager_headers, timeout=60,
        )
        assert r.status_code == 200, r.text

    def test_field_sales_forbidden(self, sales_headers):
        r = requests.post(
            f"{BASE_URL}/api/distributor/me/sync/import",
            json={"source": "file", "filename": "TEST_sales.csv",
                  "file_base64": _b64(PRODUCT_CSV)},
            headers=sales_headers, timeout=60,
        )
        assert r.status_code == 403, r.text


# ============================================================
# 8. Clear — deletes imported data only, does NOT touch orders
# ============================================================
class TestClear:
    def test_clear_all(self, owner_headers):
        # snapshot orders count is implicit — we just re-verify export still works after clear
        r = requests.post(f"{BASE_URL}/api/distributor/me/sync/clear",
                          json={"type": "all"}, headers=owner_headers, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["success"] is True

        r2 = requests.get(f"{BASE_URL}/api/distributor/me/sync/data",
                          headers=owner_headers, timeout=30)
        assert r2.status_code == 200
        j = r2.json()
        assert j["product"]["count"] == 0
        assert j["party"]["count"] == 0
        assert j["ledger"]["count"] == 0

        # orders untouched -> full export still returns rows
        r3 = requests.post(f"{BASE_URL}/api/distributor/me/sync/export",
                           json={"mode": "full", "format": "csv"},
                           headers=owner_headers, timeout=60)
        assert r3.status_code == 200, r3.text
        assert r3.json()["rows"] > 0
