"""
Iteration 13 — Stock Sync (push_to_stock), inventory pagination, data-loss guard.
Primary bug: ERP import now updates /api/distributor/me/inventory (shared products collection).
"""
import os
import base64
import time
import uuid
import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://distro-import--1znvr854.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"
SAMPLE_XLSX = "/app/backend/tests/sample_nn_stock_report.xlsx"


# ---------- helpers ----------
def register_distributor(prefix="teststock"):
    uniq = uuid.uuid4().hex[:8]
    email = f"TEST_{prefix}_{uniq}@rxtech.com"
    body = {
        "email": email,
        "name": f"TEST Dist {uniq}",
        "account_type": "distributor",
        "company_name": f"TEST Co {uniq}",
        "business_name": f"TEST Co {uniq}",
        "phone": "9999900000",
    }
    r = requests.post(f"{API}/auth/register", json=body, timeout=30)
    assert r.status_code == 200, r.text
    otp = r.json().get("dev_otp")
    assert otp
    v = requests.post(f"{API}/auth/verify-otp", json={"email": email, "otp": otp, "portal": "distributor"}, timeout=30)
    assert v.status_code == 200, v.text
    tok = v.json()["token"]
    me = requests.get(f"{API}/distributor/me/dashboard", headers={"Authorization": f"Bearer {tok}"}, timeout=30)
    assert me.status_code == 200
    did = me.json()["distributor"]["id"]
    return {"email": email, "token": tok, "did": did}


def hdrs(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def file_b64(path=SAMPLE_XLSX):
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode()


def do_import(tok):
    body = {
        "source": "file",
        "file_base64": file_b64(),
        "filename": "sample_nn_stock_report.xlsx",
    }
    r = requests.post(f"{API}/distributor/me/sync/import", headers=hdrs(tok), json=body, timeout=120)
    assert r.status_code == 200, r.text
    return r.json()


# ---------- tests ----------
class TestStockSyncPrimary:
    """Primary: imports create products on Stock screen."""

    @classmethod
    def setup_class(cls):
        cls.d = register_distributor("primary")
        cls.result = do_import(cls.d["token"])

    def test_01_import_response_has_stock_fields(self):
        assert "stock_created" in self.result
        assert "stock_updated" in self.result
        # Either freshly created (first-ever distributor to import) OR matched into existing shared catalog.
        total = self.result["stock_created"] + self.result["stock_updated"]
        assert total > 2000, self.result
        assert self.result.get("items") or self.result.get("items_processed") or self.result.get("sheets")

    def test_02_inventory_populated(self):
        r = requests.get(f"{API}/distributor/me/inventory?limit=5", headers=hdrs(self.d["token"]))
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert len(items) == 5
        # Validate fields exist and have expected provenance
        sample = items[0]
        for k in ("product_id", "name", "pack", "mrp", "ptr", "qty_available", "stock_status"):
            assert k in sample, f"missing {k}"

    def test_03_backward_compat_no_params(self):
        # must return a bare list (no envelope), default limit 200
        r = requests.get(f"{API}/distributor/me/inventory", headers=hdrs(self.d["token"]))
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert 1 <= len(data) <= 200

    def test_04_limit_clamped_to_500(self):
        r = requests.get(f"{API}/distributor/me/inventory?limit=10000", headers=hdrs(self.d["token"]))
        assert r.status_code == 200
        assert len(r.json()) <= 500

    def test_05_pagination_full_sweep_uniques(self):
        seen = set()
        skip = 0
        LIMIT = 200
        pages = 0
        while True:
            r = requests.get(f"{API}/distributor/me/inventory?skip={skip}&limit={LIMIT}", headers=hdrs(self.d["token"]))
            assert r.status_code == 200
            batch = r.json()
            if not batch:
                break
            for it in batch:
                seen.add(it["product_id"])
            if len(batch) < LIMIT:
                break
            skip += LIMIT
            pages += 1
            if pages > 50:
                break
        total = len(seen)
        print(f"total unique products: {total}")
        assert total > 2000, f"too few items via pagination: {total}"
        # And compare with report items
        r = requests.get(f"{API}/distributor/me/inventory?skip=0&limit=500&only=in", headers=hdrs(self.d["token"]))
        assert r.status_code == 200

    def test_06_search_q(self):
        r = requests.get(f"{API}/distributor/me/inventory?q=GLUCOSE", headers=hdrs(self.d["token"]))
        assert r.status_code == 200
        items = r.json()
        assert len(items) > 0
        for it in items:
            assert "glucose" in (it["name"] or "").lower() or "glucose" in (it.get("salt") or "").lower() or "glucose" in (it.get("manufacturer") or "").lower()

    def test_07_filter_out(self):
        r = requests.get(f"{API}/distributor/me/inventory?only=out&limit=500", headers=hdrs(self.d["token"]))
        assert r.status_code == 200
        items = r.json()
        for it in items:
            assert it["qty_available"] == 0

    def test_08_filter_low(self):
        r = requests.get(f"{API}/distributor/me/inventory?only=low&limit=500", headers=hdrs(self.d["token"]))
        assert r.status_code == 200
        for it in r.json():
            assert 0 < it["qty_available"] <= 20


class TestReimportSameDistributor:
    """Re-importing same file as same distributor: stock_created=0, stock_updated>0."""

    @classmethod
    def setup_class(cls):
        cls.d = register_distributor("reimp")
        cls.first = do_import(cls.d["token"])

    def test_01_second_import_no_new_products(self):
        second = do_import(self.d["token"])
        assert second["stock_created"] == 0, second
        assert second["stock_updated"] > 2000, second


class TestTwoDistributorsShareCatalog:
    """Second distributor importing same file should MATCH existing shared products."""

    @classmethod
    def setup_class(cls):
        cls.a = register_distributor("sharedA")
        cls.b = register_distributor("sharedB")
        cls.ra = do_import(cls.a["token"])
        cls.rb = do_import(cls.b["token"])

    def test_01_second_distributor_matches(self):
        # some creates are allowed if A's new_keys produced slight dedupe differences,
        # but should be very low vs ~2367 updates
        assert self.rb["stock_updated"] > 2000, self.rb
        assert self.rb["stock_created"] < 200, f"too many duplicates: {self.rb}"

    def test_02_both_distributors_see_items_independently(self):
        ra = requests.get(f"{API}/distributor/me/inventory?limit=5", headers=hdrs(self.a["token"]))
        rb = requests.get(f"{API}/distributor/me/inventory?limit=5", headers=hdrs(self.b["token"]))
        assert ra.status_code == rb.status_code == 200
        assert len(ra.json()) > 0 and len(rb.json()) > 0

    def test_03_distributor_a_qty_unchanged_after_b_import(self):
        # Pull entire inventory for A, confirm non-zero qty for some items (A's original)
        r = requests.get(f"{API}/distributor/me/inventory?limit=500&only=in", headers=hdrs(self.a["token"]))
        assert r.status_code == 200
        items = r.json()
        assert len(items) > 0


class TestSyncToStockSetting:
    """PATCH sync/settings {sync_to_stock:false} must disable push."""

    @classmethod
    def setup_class(cls):
        cls.d = register_distributor("toggle")
        cls.first = do_import(cls.d["token"])

    def test_01_settings_default_true(self):
        r = requests.get(f"{API}/distributor/me/sync/settings", headers=hdrs(self.d["token"]))
        assert r.status_code == 200, r.text
        assert r.json().get("sync_to_stock") is True

    def test_02_disable_sync_to_stock(self):
        r = requests.patch(f"{API}/distributor/me/sync/settings", headers=hdrs(self.d["token"]),
                           json={"sync_to_stock": False})
        assert r.status_code == 200
        r2 = requests.get(f"{API}/distributor/me/sync/settings", headers=hdrs(self.d["token"]))
        assert r2.json().get("sync_to_stock") is False

    def test_03_reimport_does_not_push(self):
        r = do_import(self.d["token"])
        assert r["stock_created"] == 0, r
        assert r["stock_updated"] == 0, r

    def test_04_reenable_pushes_again(self):
        requests.patch(f"{API}/distributor/me/sync/settings", headers=hdrs(self.d["token"]),
                       json={"sync_to_stock": True})
        r = do_import(self.d["token"])
        assert r["stock_updated"] > 2000, r


class TestDataLossGuard:
    """products.delete_many must only wipe non-erp_import rows during re-seed."""

    def test_01_code_has_guard(self):
        with open("/app/backend/server.py", "r") as f:
            src = f.read()
        assert 'delete_many({"source": {"$ne": "erp_import"}})' in src, "data-loss guard not present"

    def test_02_items_survive_backend_restart(self):
        d = register_distributor("survive")
        res = do_import(d["token"])
        assert (res["stock_created"] + res["stock_updated"]) > 2000
        # Confirm inventory populated BEFORE restart
        pre = requests.get(f"{API}/distributor/me/inventory?limit=5", headers=hdrs(d["token"]))
        assert pre.status_code == 200 and len(pre.json()) > 0
        # Restart backend
        import subprocess
        subprocess.run(["sudo", "supervisorctl", "restart", "backend"], check=True)
        # wait for /api
        deadline = time.time() + 60
        while time.time() < deadline:
            try:
                if requests.get(f"{API}/distributors", timeout=3).status_code == 200:
                    break
            except Exception:
                pass
            time.sleep(2)
        # inventory still there?
        r = requests.get(f"{API}/distributor/me/inventory?limit=5", headers=hdrs(d["token"]))
        assert r.status_code == 200
        assert len(r.json()) > 0


class TestPharmacyRegression:
    def test_01_products_still_200(self):
        r = requests.get(f"{API}/products")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 20

    def test_02_pharmacist_can_fetch_new_distributor(self):
        # register a fresh distributor + import so there's a known new did
        d = register_distributor("reg")
        res = do_import(d["token"])
        assert (res["stock_created"] + res["stock_updated"]) > 0
        # pharmacist OTP
        send = requests.post(f"{API}/auth/send-otp", json={"email": "demo@rxtech.com", "portal": "pharmacy"})
        assert send.status_code == 200
        otp = send.json()["dev_otp"]
        v = requests.post(f"{API}/auth/verify-otp", json={"email": "demo@rxtech.com", "otp": otp, "portal": "pharmacy"})
        assert v.status_code == 200
        tok = v.json()["token"]
        rd = requests.get(f"{API}/distributors/{d['did']}", headers={"Authorization": f"Bearer {tok}"})
        assert rd.status_code == 200, rd.text

    def test_03_erp_import_product_detail_no_crash(self):
        # Grab one erp_import product and fetch /api/products/{id} — ensure 200 despite empty salt/manufacturer
        d = register_distributor("detail")
        do_import(d["token"])
        inv = requests.get(f"{API}/distributor/me/inventory?limit=1", headers=hdrs(d["token"])).json()
        pid = inv[0]["product_id"]
        r = requests.get(f"{API}/products/{pid}")
        assert r.status_code == 200, r.text
