"""
Iteration 14 - Focused re-verification of:
  * Column mapping values for the real N N ENTERPRISE report (header on row 4)
  * push_to_stock() refinements:
      - duplicate rows MERGED+SUMMED (JIN ALOEVERA, MP TRIPHLA, ROVAN KESHA)
      - gst_pct falls back to 12.0 default (NOT 0) since report has no GST col
      - margin_pct = round((mrp-ptr)/mrp*100, 1), NEVER using report GP%
      - stock_status derived from qty (out=0, low=1-20, in>20)
      - idempotency of re-import (no duplicate SKUs)
      - distributor isolation
      - multi-distributor safety on shared products
      - pagination full sweep uniques
      - sync_to_stock=false disables push
"""
import os, base64, uuid, time, pytest, requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://distro-import--1znvr854.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"
SAMPLE = "/app/backend/tests/sample_nn_stock_report.xlsx"


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _register_distributor(prefix="iter14"):
    uniq = uuid.uuid4().hex[:8]
    email = f"TEST_{prefix}_{uniq}@rxtech.com"
    r = requests.post(f"{API}/auth/register", json={
        "email": email, "name": f"TEST {uniq}", "account_type": "distributor",
        "business_name": f"TEST Co {uniq}", "phone": "9999900000",
    }, timeout=30)
    assert r.status_code == 200, r.text
    otp = r.json()["dev_otp"]
    v = requests.post(f"{API}/auth/verify-otp", json={
        "email": email, "otp": otp, "portal": "distributor",
    }, timeout=30)
    assert v.status_code == 200, v.text
    tok = v.json()["token"]
    me = requests.get(f"{API}/distributor/me/dashboard", headers=_hdr(tok), timeout=30).json()
    return {"email": email, "token": tok, "did": me["distributor"]["id"]}


def _import(tok):
    with open(SAMPLE, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    r = requests.post(f"{API}/distributor/me/sync/import",
                      headers=_hdr(tok),
                      json={"source": "file", "file_base64": b64,
                            "filename": "sample_nn_stock_report.xlsx"},
                      timeout=180)
    assert r.status_code == 200, r.text
    return r.json()


def _full_sweep(tok, only=None):
    out, skip, LIMIT = [], 0, 200
    while True:
        url = f"{API}/distributor/me/inventory?skip={skip}&limit={LIMIT}"
        if only:
            url += f"&only={only}"
        r = requests.get(url, headers=_hdr(tok), timeout=60)
        assert r.status_code == 200, r.text
        batch = r.json()
        if not batch:
            break
        out.extend(batch)
        if len(batch) < LIMIT:
            break
        skip += LIMIT
        if skip > 10000:
            break
    return out


# ============================================================
# A. Pure column-mapping unit tests (no HTTP)
# ============================================================
class TestColumnMapping:
    """Verify sync_engine maps the real distributor header correctly and parses VALUES."""

    @classmethod
    def setup_class(cls):
        import server  # noqa  must load first to avoid circular import
        from sync_engine import _read_grids, _detect, _map_row_headers, PRODUCT_IDX, _parse_products
        with open(SAMPLE, "rb") as f:
            content = f.read()
        cls.grids = _read_grids(content, "sample_nn_stock_report.xlsx")
        name = next(iter(cls.grids))
        cls.grid = cls.grids[name]
        cls.typ, cls.hdr, cls.mp = _detect(cls.grid)
        cls.records = _parse_products(cls.grid, cls.hdr, cls.mp, "did-x")
        cls._parse_products = _parse_products

    def test_01_detected_as_product(self):
        assert self.typ == "product", f"detected={self.typ}"

    def test_02_header_row_is_fourth(self):
        # 3 title rows then header -> index 3
        assert self.hdr == 3, f"header row detected at {self.hdr}"

    def test_03_all_9_columns_mapped(self):
        fields = set(self.mp.values())
        # 9 cols: code,name,pack,stock,mrp,stock_strip,rate,pts,gp_pct
        for f in ("code", "name", "pack", "stock", "mrp", "stock_strip", "rate", "pts", "gp_pct"):
            assert f in fields, f"missing {f} in mapping {fields}"

    def test_04_parsed_row_count(self):
        # Report has ~2367 real product rows after header + footer rows
        n = len(self.records)
        assert 2300 <= n <= 2400, f"parsed {n} rows"

    def test_05_specific_row_zincoheal(self):
        hit = [r for r in self.records if r.get("code") == "9679"]
        assert hit, "PCode 9679 ZINCOHEAL not found"
        r = hit[0]
        assert "ZINCOHEAL" in (r["name"] or "").upper(), r["name"]
        assert r["pack"] == "10X2", r["pack"]
        assert r["stock"] == 72, r["stock"]
        assert r["mrp"] == 129, r["mrp"]
        assert r["rate"] == 42, r["rate"]  # PTR column


# ============================================================
# B. End-to-end import + Stock-screen bridge for a fresh distributor
# ============================================================
class TestImportPipeline:
    @classmethod
    def setup_class(cls):
        cls.d = _register_distributor("pipe")
        cls.result = _import(cls.d["token"])
        cls.inventory = _full_sweep(cls.d["token"])

    def test_01_summary_found_2367(self):
        assert self.result["summary"]["product"]["found"] == 2367, self.result["summary"]

    def test_02_inventory_populated_2363(self):
        total = len(self.inventory)
        # After 4 merges of 2367 rows we expect ~2363 unique
        assert 2360 <= total <= 2367, f"got {total}"
        # No duplicate product_id across pages
        ids = [it["product_id"] for it in self.inventory]
        assert len(set(ids)) == len(ids), "duplicate product_id across pages"

    def test_03_zincoheal_in_inventory(self):
        r = requests.get(f"{API}/distributor/me/inventory?q=ZINCOHEAL&limit=50",
                         headers=_hdr(self.d["token"]), timeout=30)
        assert r.status_code == 200
        items = [i for i in r.json() if "ZINCOHEAL" in (i.get("name") or "").upper() and i.get("pack") == "10X2"]
        assert items, r.json()
        it = items[0]
        assert it["mrp"] == 129, it
        assert it["ptr"] == 42, it
        assert it["qty_available"] == 72, it
        assert it["stock_status"] in ("in_stock", "in"), it["stock_status"]

    def test_04_merge_jin_aloevera(self):
        """Duplicate name+pack rows must be merged + summed. JIN ALOEVERA 10+0=10."""
        matches = [i for i in self.inventory if "JIN ALOEVERA" in (i.get("name") or "").upper()]
        assert matches, "JIN ALOEVERA GEL not found"
        # Only ONE entry per distinct name+pack
        packs = {}
        for i in matches:
            packs.setdefault(i.get("pack"), []).append(i)
        for pk, lst in packs.items():
            assert len(lst) == 1, f"duplicate not merged for {pk}: {lst}"
        total_qty = sum(i["qty_available"] for i in matches)
        assert total_qty == 10, f"JIN ALOEVERA merged qty expected 10, got {total_qty} - {matches}"

    def test_05_merge_mp_triphla(self):
        matches = [i for i in self.inventory if "MP TRIPHLA" in (i.get("name") or "").upper()]
        assert matches, "MP TRIPHLA TAB not found"
        total_qty = sum(i["qty_available"] for i in matches)
        assert total_qty == 2, f"MP TRIPHLA merged qty expected 2, got {total_qty}"

    def test_06_merge_rovan_kesha(self):
        matches = [i for i in self.inventory if "ROVAN KESHA" in (i.get("name") or "").upper()]
        assert matches, "ROVAN KESHA TAIL not found"
        total_qty = sum(i["qty_available"] for i in matches)
        assert total_qty == 48, f"ROVAN KESHA merged qty expected 48, got {total_qty}"

    def test_07_margin_pct_computed_from_mrp_ptr(self):
        """margin_pct must equal round((mrp-ptr)/mrp*100,1).
        The report's GP% column (e.g. 99.98 across many rows) must NOT be used."""
        checked = 0
        for it in self.inventory[:600]:
            mrp = it.get("mrp") or 0
            ptr = it.get("ptr") or 0
            m = it.get("margin_pct")
            if mrp > 0 and ptr > 0 and m is not None:
                expected = round((mrp - ptr) / mrp * 100, 1)
                assert abs(m - expected) < 0.2, f"margin_pct wrong for {it['name']}: got {m}, expected {expected} (mrp={mrp}, ptr={ptr})"
                checked += 1
        assert checked > 50, f"too few rows checked ({checked})"
        # Also verify the exact bogus value 99.98 (and 99.9) from GP% did not leak in
        leaked = [i for i in self.inventory
                  if i.get("margin_pct") in (99.98, 99.9)
                  and i.get("mrp") and i.get("ptr")
                  and abs(i["margin_pct"] - round((i["mrp"] - i["ptr"]) / i["mrp"] * 100, 1)) > 0.2]
        assert not leaked, f"report GP% leaked into margin_pct for {len(leaked)} rows: {leaked[:3]}"

    def test_08_gst_pct_falls_back_to_12(self):
        """Report has no GST column -> gst_pct must be 12.0 (app default), NOT 0.
        Verifies CURRENT distributor's import does NOT write gst_pct=0 into prices[]
        (legacy rows from older import code may still have 0 — not in scope)."""
        # 1) Inventory endpoint applies the 12.0 fallback for THIS distributor.
        r = requests.get(f"{API}/distributor/me/inventory?limit=50",
                         headers=_hdr(self.d["token"]), timeout=30)
        assert r.status_code == 200
        rows = r.json()
        assert rows
        for it in rows:
            assert it.get("gst_pct") == 12.0, f"gst_pct wrong on {it['name']}: {it.get('gst_pct')}"
        # 2) Directly inspect the raw prices[] via /api/products search – find a
        #    product that has our distributor_id and assert OUR entry has no stored
        #    gst_pct=0 (either absent or 12).
        search_r = requests.get(f"{API}/products?q=ZINCOHEAL", timeout=30)
        assert search_r.status_code == 200
        products = search_r.json()
        checked = 0
        for p in products:
            prices = p.get("prices") or []
            mine = [pr for pr in prices if pr.get("distributor_id") == self.d["did"]]
            if not mine:
                continue
            checked += 1
            for pr in mine:
                gst = pr.get("gst_pct")
                assert gst in (None, 12, 12.0), f"stored gst_pct wrong for OUR import on {p['name']}: {gst}"
        assert checked >= 1, "no product with our distributor's prices entry found"

    def test_09_stock_status_counts(self):
        buckets = {"in_stock": 0, "in": 0, "low": 0, "out_of_stock": 0, "out": 0}
        for i in self.inventory:
            s = i.get("stock_status") or ""
            buckets[s] = buckets.get(s, 0) + 1
        out = buckets.get("out_of_stock", 0) + buckets.get("out", 0)
        low = buckets["low"]
        in_s = buckets.get("in_stock", 0) + buckets.get("in", 0)
        # From report: 868 out / 865 low / 630 in approx
        assert 800 <= out <= 900, f"out count off: {out}"
        assert 820 <= low <= 900, f"low count off: {low}"
        assert 580 <= in_s <= 680, f"in count off: {in_s}"

    def test_10_only_out_filter(self):
        out_rows = _full_sweep(self.d["token"], only="out")
        for it in out_rows:
            assert it["qty_available"] == 0, it
        # count matches
        zeros = [i for i in self.inventory if i["qty_available"] == 0]
        assert len(out_rows) == len(zeros), f"only=out mismatch {len(out_rows)} vs {len(zeros)}"

    def test_11_only_low_filter(self):
        lows = _full_sweep(self.d["token"], only="low")
        for it in lows:
            assert 0 < it["qty_available"] <= 20, it


# ============================================================
# C. Idempotency
# ============================================================
class TestIdempotency:
    @classmethod
    def setup_class(cls):
        cls.d = _register_distributor("idem")
        cls.first = _import(cls.d["token"])
        cls.second = _import(cls.d["token"])

    def test_01_second_no_new_products(self):
        assert self.second["stock_created"] == 0, self.second

    def test_02_sku_count_unchanged(self):
        inv = _full_sweep(self.d["token"])
        assert 2360 <= len(inv) <= 2367

    def test_03_qty_not_doubled(self):
        r = requests.get(f"{API}/distributor/me/inventory?q=ZINCOHEAL&limit=50",
                         headers=_hdr(self.d["token"]), timeout=30)
        items = [i for i in r.json() if "ZINCOHEAL" in (i.get("name") or "").upper() and i.get("pack") == "10X2"]
        assert items[0]["qty_available"] == 72, items[0]


# ============================================================
# D. Multi-distributor isolation + shared-product safety
# ============================================================
class TestMultiDistributorSafety:
    @classmethod
    def setup_class(cls):
        cls.a = _register_distributor("mdsA")
        cls.b = _register_distributor("mdsB")
        _import(cls.a["token"])
        # snapshot A inventory for comparison AFTER B imports
        _import(cls.b["token"])
        cls.inv_a = _full_sweep(cls.a["token"])
        cls.inv_b = _full_sweep(cls.b["token"])

    def test_01_both_have_items(self):
        assert len(self.inv_a) > 2000
        assert len(self.inv_b) > 2000

    def test_02_a_qty_still_72_for_zincoheal(self):
        """A's own qty must not be affected by B's import."""
        r = requests.get(f"{API}/distributor/me/inventory?q=ZINCOHEAL&limit=50",
                         headers=_hdr(self.a["token"]), timeout=30)
        items = [i for i in r.json() if "ZINCOHEAL" in (i.get("name") or "").upper() and i.get("pack") == "10X2"]
        assert items[0]["qty_available"] == 72, items[0]

    def test_03_shared_product_not_marked_out_by_zero_dist(self):
        """When product is shared, one distributor's zero stock must NOT mark the
        product-level stock_status as out_of_stock for the whole marketplace.
        Setup: find a product A has qty>20 in and both A+B supply it, then set B's
        qty to 0 via PATCH and verify product.stock_status is NOT out_of_stock."""
        # Pick a product A has qty>20 in, that B also has in its inventory
        a_in = [i for i in self.inv_a if i["qty_available"] > 20]
        b_ids = {i["product_id"] for i in self.inv_b}
        shared = [i for i in a_in if i["product_id"] in b_ids]
        assert shared, "no shared product with A qty>20 found"
        target = shared[0]
        pid = target["product_id"]
        # Zero out B's qty on this product
        patch = requests.patch(f"{API}/distributor/me/inventory/{pid}",
                               headers=_hdr(self.b["token"]),
                               json={"qty_available": 0}, timeout=30)
        assert patch.status_code == 200, patch.text
        # Confirm shared: product.distributor_ids should contain both A and B
        r = requests.get(f"{API}/products/{pid}", timeout=15)
        assert r.status_code == 200
        p = (r.json() or {}).get("product") or {}
        dids = set(p.get("distributor_ids") or [])
        assert {self.a["did"], self.b["did"]} <= dids, dids
        status = p.get("stock_status") or ""
        assert status not in ("out_of_stock", "out"), (
            f"shared product wrongly marked out: name={p.get('name')} status={status}")


# ============================================================
# E. sync_to_stock=false skips the Stock bridge
# ============================================================
class TestSyncToStockToggle:
    @classmethod
    def setup_class(cls):
        cls.d = _register_distributor("tog")

    def test_01_default_true(self):
        r = requests.get(f"{API}/distributor/me/sync/settings", headers=_hdr(self.d["token"]))
        assert r.status_code == 200
        assert r.json().get("sync_to_stock") is True

    def test_02_disable_then_import_zero_stock_changes(self):
        requests.patch(f"{API}/distributor/me/sync/settings",
                       headers=_hdr(self.d["token"]),
                       json={"sync_to_stock": False})
        r = _import(self.d["token"])
        assert r["stock_created"] == 0, r
        assert r["stock_updated"] == 0, r

    def test_03_reenable_pushes(self):
        requests.patch(f"{API}/distributor/me/sync/settings",
                       headers=_hdr(self.d["token"]),
                       json={"sync_to_stock": True})
        r = _import(self.d["token"])
        assert (r["stock_created"] + r["stock_updated"]) > 2000, r


# ============================================================
# F. Marketplace connectivity
# ============================================================
class TestMarketplaceConnectivity:
    def test_01_pharmacy_finds_zincoheal(self):
        # ensure product exists in catalogue by any distributor
        r = requests.get(f"{API}/products?q=ZINCOHEAL", timeout=30)
        assert r.status_code == 200
        items = r.json()
        matches = [i for i in items if "ZINCOHEAL" in (i.get("name") or "").upper()]
        assert matches, items[:3]
        # one of them should have mrp 129 and ptr 42
        assert any(i.get("mrp") == 129 for i in matches), matches[:3]
