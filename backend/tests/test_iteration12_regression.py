"""
RX Tech iteration 12 — pandas/numpy removal regression tests.

Covers:
- No pandas/numpy references anywhere in backend source or requirements.
- ERP import via openpyxl (xlsx), stdlib csv (CSV) and Drive link import.
- Re-import dedupe (0 inserted / all updated) even though index is non-unique.
- Garbage / .xls / multi-sheet handling.
- Export via xlsxwriter + csv.DictWriter (full + incremental).
- Startup robustness (ensure_sync_indexes is non-unique AND not awaited).
- Registration + OTP login + distributor dashboard + browse.
"""
import base64
import csv
import io
import os
import re
import time
from pathlib import Path

import openpyxl
import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://distro-import--1znvr854.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"
BACKEND_DIR = Path("/app/backend")
SAMPLE_XLSX = BACKEND_DIR / "tests" / "sample_nn_stock_report.xlsx"
DRIVE_URL = "https://docs.google.com/spreadsheets/d/1x_iAHuQBr-Gy9u0ic5J2Jq9USmdUbnQB/edit?usp=drive_link"


# ---------- auth helpers ----------
def _otp_login(email: str, portal: str = "distributor") -> str:
    r = requests.post(f"{API}/auth/send-otp", json={"email": email})
    r.raise_for_status()
    otp = r.json()["dev_otp"]
    r = requests.post(f"{API}/auth/verify-otp", json={"email": email, "otp": otp, "portal": portal})
    r.raise_for_status()
    return r.json()["token"]


@pytest.fixture(scope="module")
def owner_token():
    return _otp_login("owner@rxtech.com", "distributor")


@pytest.fixture(scope="module")
def owner_headers(owner_token):
    return {"Authorization": f"Bearer {owner_token}", "Content-Type": "application/json"}


# ============================================================
# 1. SOURCE / DEP CLEAN
# ============================================================
class TestSourceCleanliness:
    """pandas + numpy must be fully gone from backend sources & requirements."""

    def test_no_pandas_numpy_references_in_py(self):
        pat = re.compile(r"\b(pandas|numpy|pd\.|np\.)\b")
        hits = []
        for p in BACKEND_DIR.glob("*.py"):
            for i, line in enumerate(p.read_text().splitlines(), 1):
                if pat.search(line):
                    hits.append(f"{p.name}:{i}: {line.strip()}")
        assert not hits, "Found pandas/numpy references: " + "\n".join(hits)

    def test_requirements_no_pandas_numpy(self):
        req = (BACKEND_DIR / "requirements.txt").read_text().lower()
        for pkg in ("pandas", "numpy"):
            assert not re.search(rf"^{pkg}([=<>!]|$)", req, re.M), f"{pkg} still in requirements.txt"

    def test_server_imports_without_pandas_numpy(self):
        """Simulate a prod image without pandas/numpy and ensure import succeeds."""
        import subprocess
        p = subprocess.run(
            ["python", str(BACKEND_DIR / "tests" / "_test_import_no_pandas.py")],
            capture_output=True, text=True, cwd=str(BACKEND_DIR), timeout=60,
        )
        assert p.returncode == 0, f"import failed: {p.stdout}\n{p.stderr}"
        assert "OK:" in p.stdout


# ============================================================
# 2. STARTUP ROBUSTNESS
# ============================================================
class TestStartupRobustness:
    def test_ensure_sync_indexes_is_not_unique(self):
        txt = (BACKEND_DIR / "sync_engine.py").read_text()
        # must have create_index but not unique=True
        assert "create_index" in txt
        assert "unique=True" not in txt, "ensure_sync_indexes must create a NON-unique index"

    def test_startup_does_not_await_ensure_sync_indexes(self):
        """Parse startup() body and confirm it does NOT await ensure_sync_indexes
        directly — instead schedules it as a background task."""
        import ast
        tree = ast.parse((BACKEND_DIR / "server.py").read_text())
        startup = next(
            (n for n in tree.body
             if isinstance(n, ast.AsyncFunctionDef) and n.name == "startup"),
            None,
        )
        assert startup, "startup() function not found"
        # Walk top-level stmts of startup — no `await ensure_sync_indexes()` at this level
        for stmt in startup.body:
            if isinstance(stmt, ast.Expr) and isinstance(stmt.value, ast.Await):
                call = stmt.value.value
                if isinstance(call, ast.Call) and isinstance(call.func, ast.Name):
                    assert call.func.id != "ensure_sync_indexes", \
                        "startup must NOT await ensure_sync_indexes directly"
        # Must schedule it as a background task somewhere in the module
        src = ast.unparse(tree)
        assert "asyncio.create_task" in src and "ensure_sync_indexes" in src

    def test_backend_serves_immediately_after_restart(self):
        import subprocess
        subprocess.run(["sudo", "supervisorctl", "restart", "backend"], check=True, timeout=20)
        # poll for readiness
        deadline = time.time() + 20
        last = None
        while time.time() < deadline:
            try:
                r = requests.get(f"{API}/distributors", timeout=5)
                last = r.status_code
                if r.status_code == 200:
                    return
            except Exception as e:
                last = str(e)
            time.sleep(0.5)
        pytest.fail(f"backend did not come up after restart (last={last})")


# ============================================================
# 3. AUTH / REGISTRATION
# ============================================================
class TestRegistrationAndLogin:
    def test_register_pharmacy_then_verify_otp(self):
        email = f"test_pharm_{int(time.time())}@rxtech.io"
        r = requests.post(f"{API}/auth/register", json={
            "account_type": "pharmacy", "name": "Test Pharm", "email": email,
            "phone": "9999999999", "business_name": "Test Pharmacy",
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["role"] == "pharmacist"
        assert "dev_otp" in data
        v = requests.post(f"{API}/auth/verify-otp", json={
            "email": email, "otp": data["dev_otp"], "portal": "pharmacy"
        })
        assert v.status_code == 200, v.text
        assert v.json()["token"]

    def test_register_distributor_then_verify_otp(self):
        email = f"test_dist_{int(time.time())}@rxtech.io"
        r = requests.post(f"{API}/auth/register", json={
            "account_type": "distributor", "name": "Test Dist", "email": email,
            "phone": "9999999999", "business_name": "Test Distributor",
            "gst": "27AABCU9603R1ZX",
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["role"] == "owner"
        assert "distributor_id" in data
        v = requests.post(f"{API}/auth/verify-otp", json={
            "email": email, "otp": data["dev_otp"], "portal": "distributor"
        })
        assert v.status_code == 200, v.text

    def test_owner_can_reach_distributor_dashboard(self, owner_headers):
        r = requests.get(f"{API}/distributor/me/dashboard", headers=owner_headers)
        assert r.status_code == 200, r.text

    def test_sync_browse_glucose(self, owner_headers):
        r = requests.get(f"{API}/distributor/me/sync/browse",
                         params={"type": "product", "q": "GLUCOSE"}, headers=owner_headers)
        assert r.status_code == 200, r.text
        # could be 0 before import — just assert shape
        body = r.json()
        assert "rows" in body and "total" in body


# ============================================================
# 4. ERP IMPORT (openpyxl / stdlib csv / drive)
# ============================================================
def _b64_file(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode()


def _import_payload(path: Path, filename: str | None = None) -> dict:
    return {"source": "file", "file_base64": _b64_file(path), "filename": filename or path.name}


class TestErpImport:
    def test_a_xlsx_import_openpyxl(self, owner_headers, tmp_path):
        assert SAMPLE_XLSX.exists(), f"missing sample {SAMPLE_XLSX}"
        # clear first for a clean count
        requests.post(f"{API}/distributor/me/sync/clear", json={"type": "product"}, headers=owner_headers)
        r = requests.post(f"{API}/distributor/me/sync/import", headers=owner_headers,
                          json=_import_payload(SAMPLE_XLSX))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["summary"]["product"]["found"] >= 2300
        assert body["summary"]["product"]["inserted"] >= 2300

        # verify data correctness via browse
        br = requests.get(f"{API}/distributor/me/sync/browse",
                         params={"type": "product", "q": "GLUCOSE", "limit": 50},
                         headers=owner_headers).json()
        assert br["total"] >= 1
        row = br["rows"][0]
        # must contain mapped fields
        for f in ("code", "name", "pack", "mrp", "rate", "stock"):
            assert f in row, f"missing {f} in {row}"
        # numeric types (openpyxl returns native floats)
        assert isinstance(row["mrp"], (int, float))
        assert isinstance(row["stock"], (int, float))

    def test_b_reimport_dedupes(self, owner_headers):
        """Re-importing same file → 0 inserted / all updated (dedupe still works)."""
        r = requests.post(f"{API}/distributor/me/sync/import", headers=owner_headers,
                          json=_import_payload(SAMPLE_XLSX))
        assert r.status_code == 200, r.text
        s = r.json()["summary"]["product"]
        assert s["inserted"] == 0, f"expected 0 inserted on reimport, got {s}"
        assert s["updated"] == s["found"], f"all rows should update: {s}"

    def test_c_csv_import(self, owner_headers, tmp_path):
        csv_path = tmp_path / "small.csv"
        rows = [
            ["Item Code", "Item Name", "Pack", "MRP", "PTR", "Closing Stock"],
            ["T001", "TEST_Amox 500", "10 Caps", "100.00", "72.5", "42"],
            ["T002", "TEST_Para 650", "15 Tabs", "45.00", "30.0", "100"],
        ]
        with csv_path.open("w", newline="") as f:
            w = csv.writer(f); w.writerows(rows)
        r = requests.post(f"{API}/distributor/me/sync/import", headers=owner_headers,
                          json=_import_payload(csv_path))
        assert r.status_code == 200, r.text
        assert r.json()["summary"]["product"]["found"] >= 2

    def test_d_multi_sheet_xlsx(self, owner_headers, tmp_path):
        xp = tmp_path / "multi.xlsx"
        wb = openpyxl.Workbook()
        ws1 = wb.active; ws1.title = "Items"
        ws1.append(["Item Code", "Item Name", "Pack", "MRP", "PTR", "Stock"])
        ws1.append(["MX1", "TEST_MXItem1", "10 Tabs", 50, 35, 10])
        ws2 = wb.create_sheet("Parties")
        ws2.append(["Party Code", "Party Name", "City", "Phone", "GSTIN"])
        ws2.append(["PX1", "TEST_PX Party", "Mumbai", "9999999999", "27AABCU9603R1ZX"])
        wb.save(xp)
        r = requests.post(f"{API}/distributor/me/sync/import", headers=owner_headers,
                          json=_import_payload(xp))
        assert r.status_code == 200, r.text
        body = r.json()
        detected = {s["sheet"]: s.get("detected") for s in body["sheets"]}
        assert "product" in detected.values() or "party" in detected.values()

    def test_e_legacy_xls_returns_400(self, owner_headers):
        """A .xls filename must raise a clear 400, not 500."""
        r = requests.post(f"{API}/distributor/me/sync/import", headers=owner_headers,
                          json={"source": "file", "file_base64": base64.b64encode(b"fake").decode(),
                                "filename": "legacy.xls"})
        assert r.status_code == 400, r.text
        assert ".xlsx" in r.json()["detail"].lower() or "save as" in r.json()["detail"].lower()

    def test_f_garbage_returns_400(self, owner_headers):
        garbage = base64.b64encode(b"\x00\x01not a spreadsheet at all").decode()
        r = requests.post(f"{API}/distributor/me/sync/import", headers=owner_headers,
                          json={"source": "file", "file_base64": garbage, "filename": "x.xlsx"})
        assert r.status_code == 400, r.text

    def test_g_drive_sheets_import(self, owner_headers):
        r = requests.post(f"{API}/distributor/me/sync/import", headers=owner_headers,
                          json={"source": "drive", "drive_url": DRIVE_URL})
        assert r.status_code == 200, r.text
        found = r.json()["summary"]["product"]["found"]
        assert found >= 2300, f"expected ~2367 drive rows, got {found}"


# ============================================================
# 5. ERP EXPORT (xlsxwriter / stdlib csv)
# ============================================================
class TestErpExport:
    def test_full_csv_export(self, owner_headers):
        r = requests.post(f"{API}/distributor/me/sync/export", headers=owner_headers,
                          json={"mode": "full", "format": "csv"})
        assert r.status_code == 200, r.text
        body = r.json()
        raw = base64.b64decode(body["base64"]).decode("utf-8-sig")
        header = raw.splitlines()[0]
        assert header.startswith("Invoice No,Order Code,Date,Party Name"), header
        assert body["rows"] >= 1

    def test_full_xlsx_export(self, owner_headers):
        r = requests.post(f"{API}/distributor/me/sync/export", headers=owner_headers,
                          json={"mode": "full", "format": "xlsx"})
        assert r.status_code == 200, r.text
        body = r.json()
        data = base64.b64decode(body["base64"])
        wb = openpyxl.load_workbook(io.BytesIO(data))
        assert "Orders" in wb.sheetnames
        ws = wb["Orders"]
        headers = [c.value for c in ws[1]]
        assert headers[:4] == ["Invoice No", "Order Code", "Date", "Party Name"]
        # data rows exist
        assert ws.max_row >= 2

    def test_incremental_after_full_returns_400(self, owner_headers):
        # Export full then immediately incremental → 400 "No new orders"
        requests.post(f"{API}/distributor/me/sync/export", headers=owner_headers,
                      json={"mode": "full", "format": "csv"})
        r = requests.post(f"{API}/distributor/me/sync/export", headers=owner_headers,
                          json={"mode": "incremental", "format": "csv"})
        assert r.status_code == 400, r.text
        assert "no new" in r.json()["detail"].lower()
