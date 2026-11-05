# Iteration 15 — Retailer change requirements (mapping, credit, search/compare, schemes,
# notifications, disputes unflag, bills/returns, shortbook notes, ratings, slots, uploads)
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


def _login(email, portal):
    r = requests.post(f"{API}/auth/send-otp", json={"email": email, "portal": portal}, timeout=30)
    assert r.status_code == 200, r.text
    otp = r.json().get("dev_otp")
    r = requests.post(f"{API}/auth/verify-otp", json={"email": email, "otp": otp, "portal": portal}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def H(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def demo():
    return _login("demo@rxtech.com", "pharmacy")


@pytest.fixture(scope="module")
def owner():
    return _login("owner@rxtech.com", "distributor")


@pytest.fixture(scope="module")
def newph():
    email = f"test_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/register", json={
        "account_type": "pharmacy", "name": "TEST_Pharm", "email": email,
        "phone": "9" + uuid.uuid4().hex[:9].translate(str.maketrans("abcdef", "123456")),
        "business_name": "TEST_Shop Bhandup"}, timeout=30)
    assert r.status_code in (200, 201), r.text
    tok = _login(email, "pharmacy")
    me = requests.get(f"{API}/auth/me", headers=H(tok)).json()
    uid = (me.get("user") or me).get("id")
    return {"token": tok, "id": uid, "email": email}


@pytest.fixture(scope="module")
def dist1_product(owner):
    r = requests.get(f"{API}/distributor/me/inventory", headers=H(owner), params={"limit": 20})
    assert r.status_code == 200
    items = r.json()
    items = items.get("items", items) if isinstance(items, dict) else items
    it = next(i for i in items if (i.get("qty_available") or 0) > 20 and (i.get("ptr") or 0) > 0)
    return it


# ---------- Mapping flow ----------
class TestMappingFlow:
    def test_01_new_pharmacy_unmapped_list(self, newph):
        r = requests.get(f"{API}/retail/distributors", headers=H(newph["token"]), params={"tab": "unmapped"})
        assert r.status_code == 200
        d = r.json()
        assert any(x["id"] == "dist-1" for x in d["items"])
        assert d["has_location"] is False
        m = requests.get(f"{API}/retail/distributors", headers=H(newph["token"]), params={"tab": "mapped"}).json()
        assert m["items"] == []

    def test_02_set_location_and_distance_sorted(self, newph):
        r = requests.patch(f"{API}/auth/location", headers=H(newph["token"]), json={"lat": 19.147, "lng": 72.933, "area": "Bhandup West"})
        assert r.status_code == 200
        bad = requests.patch(f"{API}/auth/location", headers=H(newph["token"]), json={"lat": 200, "lng": 0})
        assert bad.status_code == 400
        d = requests.get(f"{API}/retail/distributors", headers=H(newph["token"]), params={"tab": "unmapped"}).json()
        assert d["has_location"] is True
        dk = [x["distance_km"] for x in d["items"] if x["distance_km"] is not None]
        assert dk == sorted(dk) and len(dk) > 0
        assert d["items"][0]["id"] == "dist-1"

    def test_03_credit_order_unmapped_400(self, newph, dist1_product):
        t = H(newph["token"])
        requests.delete(f"{API}/cart", headers=t)
        r = requests.post(f"{API}/cart/items", headers=t, json={"product_id": dist1_product["product_id"] if "product_id" in dist1_product else dist1_product["id"], "distributor_id": "dist-1", "qty": 2})
        assert r.status_code == 200
        cart = requests.get(f"{API}/cart", headers=t).json()
        assert cart["items"][0]["mapped"] is False
        r = requests.post(f"{API}/orders", headers=t, params={"payment_method": "credit"})
        assert r.status_code == 400 and "not mapped" in r.text

    def test_04_request_mapping_and_duplicate(self, newph):
        t = H(newph["token"])
        r = requests.post(f"{API}/retail/mappings", headers=t, json={"distributor_id": "dist-1", "note": "TEST_pls"})
        assert r.status_code == 200 and r.json()["status"] == "pending"
        r2 = requests.post(f"{API}/retail/mappings", headers=t, json={"distributor_id": "dist-1"})
        assert r2.status_code == 400
        r3 = requests.post(f"{API}/retail/mappings", headers=t, json={"distributor_id": "nope"})
        assert r3.status_code == 404

    def test_05_owner_sees_request_and_notification(self, owner, newph):
        rows = requests.get(f"{API}/distributor/me/mapping-requests", headers=H(owner)).json()
        row = next((x for x in rows if x["user_id"] == newph["id"]), None)
        assert row is not None and row["note"] == "TEST_pls"
        n = requests.get(f"{API}/distributor/me/notifications", headers=H(owner)).json()
        assert "unread" in n and any(x.get("kind") == "mapping" for x in n["items"])

    def test_06_approve_negative_then_ok(self, owner, newph):
        r = requests.post(f"{API}/distributor/me/mapping-requests/{newph['id']}/approve", headers=H(owner), json={"credit_limit": -5})
        assert r.status_code == 400
        r = requests.post(f"{API}/distributor/me/mapping-requests/{newph['id']}/approve", headers=H(owner), json={"credit_limit": 25000, "credit_days": 21})
        assert r.status_code == 200 and r.json()["status"] == "mapped"
        r = requests.post(f"{API}/distributor/me/mapping-requests/{newph['id']}/approve", headers=H(owner), json={"credit_limit": 1})
        assert r.status_code == 404

    def test_07_cart_mapped_with_credit_limit(self, newph):
        cart = requests.get(f"{API}/cart", headers=H(newph["token"])).json()
        it = cart["items"][0]
        assert it["mapped"] is True
        assert it["distributor"]["credit_limit"] == 25000
        n = requests.get(f"{API}/notifications", headers=H(newph["token"])).json()
        assert any("approved" in (x.get("title") or "").lower() for x in n["items"])

    def test_08_credit_order_deducts(self, newph, owner):
        t = H(newph["token"])
        cart = requests.get(f"{API}/cart", headers=t).json()
        total = cart["total"]
        r = requests.post(f"{API}/orders", headers=t, params={"payment_method": "credit"})
        assert r.status_code == 200, r.text
        d = requests.get(f"{API}/distributors/dist-1", headers=t).json()["distributor"]
        assert abs((d.get("credit_used") or 0) - total) < 1, d.get("credit_used")
        custs = requests.get(f"{API}/distributor/me/customers", headers=H(owner)).json()
        custs = custs.get("items", custs) if isinstance(custs, dict) else custs
        c = next((x for x in custs if x.get("id") == newph["id"] or x.get("user_id") == newph["id"]), None)
        assert c is not None, "new mapped customer missing from distributor customer list"
        assert abs((c.get("credit_used") or 0) - total) < 1
        n = requests.get(f"{API}/distributor/me/notifications", headers=H(owner)).json()
        assert any(x.get("kind") == "order" or "order" in (x.get("title") or "").lower() for x in n["items"])

    def test_09_pharmacy_unmap_blocked_with_outstanding(self, newph):
        r = requests.delete(f"{API}/retail/mappings/dist-1", headers=H(newph["token"]))
        assert r.status_code == 400 and "outstanding" in r.text.lower()

    def test_10_ratings_both_sides(self, newph, owner):
        r = requests.post(f"{API}/retail/distributors/dist-1/rating", headers=H(newph["token"]), json={"stars": 6})
        assert r.status_code == 400
        r = requests.post(f"{API}/retail/distributors/dist-1/rating", headers=H(newph["token"]), json={"stars": 4, "comment": "TEST_"})
        assert r.status_code == 200 and r.json()["count"] >= 1
        g = requests.get(f"{API}/retail/distributors/dist-1/rating", headers=H(newph["token"])).json()
        assert g["my_stars"] == 4 and g["mapping_status"] == "mapped"
        r = requests.post(f"{API}/distributor/me/customers/{newph['id']}/rating", headers=H(owner), json={"stars": 5})
        assert r.status_code == 200
        g = requests.get(f"{API}/distributor/me/customers/{newph['id']}/rating", headers=H(owner)).json()
        assert g["my_stars"] == 5 and g["stars_avg"] == 5
        cr = requests.get(f"{API}/retail/credit-rating", headers=H(newph["token"])).json()
        assert cr["stars_avg"] == 5 and "grade" in cr

    def test_11_distributor_unmap(self, owner, newph):
        r = requests.post(f"{API}/distributor/me/customers/{newph['id']}/unmap", headers=H(owner))
        assert r.status_code == 200
        r = requests.post(f"{API}/distributor/me/customers/{newph['id']}/unmap", headers=H(owner))
        assert r.status_code == 400
        m = requests.get(f"{API}/retail/distributors", headers=H(newph["token"]), params={"tab": "mapped"}).json()
        assert all(x["id"] != "dist-1" for x in m["items"])

    def test_12_reject_flow(self, owner, newph):
        t = H(newph["token"])
        assert requests.post(f"{API}/retail/mappings", headers=t, json={"distributor_id": "dist-1"}).status_code == 200
        r = requests.post(f"{API}/distributor/me/mapping-requests/{newph['id']}/reject", headers=H(owner), json={"reason": "TEST_no"})
        assert r.status_code == 200
        u = requests.get(f"{API}/retail/distributors", headers=t, params={"tab": "unmapped"}).json()
        row = next(x for x in u["items"] if x["id"] == "dist-1")
        assert row["mapping_status"] == "rejected" and row["reject_reason"] == "TEST_no"


# ---------- Search / Compare ----------
class TestSearchCompare:
    def test_search_tabs(self, demo):
        r = requests.get(f"{API}/retail/search", headers=H(demo), params={"q": "pa", "tab": "mapped"})
        assert r.status_code == 200
        d = r.json()
        assert d["counts"]["mapped"] > 0 and all(i["mapped"] for i in d["items"])
        it = d["items"][0]
        for k in ("ptr", "mrp", "pack", "qty_available", "scheme", "delivery", "margin_pct", "distributor_name"):
            assert k in it
        did = d["distributors"][0]["id"]
        f = requests.get(f"{API}/retail/search", headers=H(demo), params={"q": "pa", "tab": "mapped", "distributor_id": did}).json()
        assert f["items"] and all(i["distributor_id"] == did for i in f["items"])
        u = requests.get(f"{API}/retail/search", headers=H(demo), params={"q": "pa", "tab": "unmapped"}).json()
        assert all(not i["mapped"] for i in u["items"])
        short = requests.get(f"{API}/retail/search", headers=H(demo), params={"q": "p"}).json()
        assert short["items"] == []

    def test_compare_sorts(self, demo):
        d = requests.get(f"{API}/retail/search", headers=H(demo), params={"q": "pa", "tab": "mapped"}).json()
        pid = d["items"][0]["product_id"]
        c = requests.get(f"{API}/retail/compare/{pid}", headers=H(demo), params={"sort": "margin"}).json()
        m = [o["margin_pct"] for o in c["offers"]]
        assert m == sorted(m, reverse=True)
        p = requests.get(f"{API}/retail/compare/{pid}", headers=H(demo), params={"sort": "ptr"}).json()
        e = [o["effective_ptr"] for o in p["offers"]]
        assert e == sorted(e)
        s = requests.get(f"{API}/retail/compare/{pid}", headers=H(demo), params={"sort": "stock"}).json()
        q = [o["qty_available"] for o in s["offers"]]
        assert q == sorted(q, reverse=True)
        assert requests.get(f"{API}/retail/compare/{pid}", headers=H(demo), params={"sort": "delivery"}).status_code == 200
        assert requests.get(f"{API}/retail/compare/nope", headers=H(demo)).status_code == 404


# ---------- Schemes ----------
class TestSchemes:
    def test_scheme_types(self, owner, newph, dist1_product):
        pid = dist1_product.get("product_id") or dist1_product["id"]
        orig_scheme = dist1_product.get("scheme")
        url = f"{API}/distributor/me/inventory/{pid}"
        t = H(newph["token"])
        try:
            requests.delete(f"{API}/cart", headers=t)
            cases = [({"type": "free", "buy": 10, "free": 1}, "10+1"), ({"type": "percent", "pct": 5}, "5% off"),
                     ({"type": "rupee", "amount": 2}, "₹2 off"), ({"type": "custom", "text": "TEST_promo"}, "TEST_promo"),
                     ({"type": "slab", "slabs": [{"min_qty": 5, "buy": 5, "free": 1}, {"min_qty": 10, "buy": 10, "free": 3}]}, "5+1 / 10+3")]
            for det, lbl in cases:
                r = requests.patch(url, headers=H(owner), json={"scheme_detail": det})
                assert r.status_code == 200, r.text
                c = requests.get(f"{API}/retail/compare/{pid}", headers=t).json()
                o = next(x for x in c["offers"] if x["distributor_id"] == "dist-1")
                assert o["scheme"] == lbl, (det, o["scheme"])
            requests.post(f"{API}/cart/items", headers=t, json={"product_id": pid, "distributor_id": "dist-1", "qty": 10})
            it = requests.get(f"{API}/cart", headers=t).json()["items"][0]
            assert it["free_qty"] == 3
            requests.patch(url, headers=H(owner), json={"scheme_detail": {"type": "percent", "pct": 10}})
            it = requests.get(f"{API}/cart", headers=t).json()["items"][0]
            assert abs(it["unit_price"] - round(it["product"]["ptr"] * 0.9, 2)) < 0.02
            assert requests.patch(url, headers=H(owner), json={"scheme_detail": {"type": "bogus"}}).status_code == 400
            # malformed percent (missing pct) should be a 400, not a 500
            bad = requests.patch(url, headers=H(owner), json={"scheme_detail": {"type": "percent"}})
            assert bad.status_code == 400, f"missing pct -> {bad.status_code}"
        finally:
            requests.patch(url, headers=H(owner), json={"scheme_detail": {"type": "none"}})
            if orig_scheme:
                requests.patch(url, headers=H(owner), json={"scheme": orig_scheme})
            requests.delete(f"{API}/cart", headers=t)


# ---------- Disputes / Notes / Bills / Returns ----------
class TestQueries:
    def test_unflag_lifecycle(self, newph, owner):
        t = H(newph["token"])
        r = requests.post(f"{API}/disputes", headers=t, json={"distributor_id": "dist-1", "type": "wrong_supply", "title": "TEST_wrong"})
        assert r.status_code == 200
        d = r.json()["dispute"]
        assert d["category_label"] == "Wrong Supply" and d["flagged"] is True
        assert requests.post(f"{API}/disputes", headers=t, json={"distributor_id": "dist-1", "type": "zzz", "title": "x"}).status_code == 400
        assert requests.post(f"{API}/disputes/{d['id']}/unflag", headers=t).status_code == 400
        q = requests.get(f"{API}/distributor/me/disputes", headers=H(owner)).json()
        assert any(x["id"] == d["id"] for x in q["items"])
        assert requests.patch(f"{API}/distributor/me/disputes/{d['id']}", headers=H(owner), json={"status": "resolved", "resolution": "TEST_ok"}).status_code == 200
        r = requests.post(f"{API}/disputes/{d['id']}/unflag", headers=H(owner))
        assert r.status_code == 404  # only raiser
        r = requests.post(f"{API}/disputes/{d['id']}/unflag", headers=t)
        assert r.status_code == 200 and r.json()["status"] == "closed"
        mine = requests.get(f"{API}/disputes", headers=t).json()
        x = next(y for y in mine if y["id"] == d["id"])
        assert x["status"] == "closed" and x["flagged"] is False

    def test_notes_crud_and_query(self, newph):
        t = H(newph["token"])
        assert requests.post(f"{API}/shortbook/notes", headers=t, json={}).status_code == 400
        n = requests.post(f"{API}/shortbook/notes", headers=t, json={"text": "TEST_note", "product_name": "Dolo"}).json()
        assert any(x["id"] == n["id"] for x in requests.get(f"{API}/shortbook/notes", headers=t).json())
        r = requests.post(f"{API}/shortbook/notes/{n['id']}/query", headers=t, json={"distributor_id": "dist-1", "type": "no_supply", "title": "TEST_nosupply"})
        assert r.status_code == 200
        nn = next(x for x in requests.get(f"{API}/shortbook/notes", headers=t).json() if x["id"] == n["id"])
        assert nn["query_id"] == r.json()["dispute"]["id"]
        assert requests.delete(f"{API}/shortbook/notes/{n['id']}", headers=t).status_code == 200
        assert all(x["id"] != n["id"] for x in requests.get(f"{API}/shortbook/notes", headers=t).json())

    def test_bills_and_returns_flag(self, demo):
        orders = requests.get(f"{API}/retail/returnable-orders", headers=H(demo)).json()
        assert orders and all(o["suggested_mode"] == ("sellable" if o["payment_state"] == "paid" else "issue") for o in orders)
        oid = orders[0]["order_id"]
        assert requests.post(f"{API}/retail/returns/flag", headers=H(demo), json={"order_id": oid, "items": [], "category": "damaged_goods", "mode": "issue"}).status_code == 400
        assert requests.post(f"{API}/retail/returns/flag", headers=H(demo), json={"order_id": oid, "items": [{"line": 0, "qty": 1}], "category": "bad", "mode": "issue"}).status_code == 400
        assert requests.post(f"{API}/retail/returns/flag", headers=H(demo), json={"order_id": oid, "items": [{"line": 0, "qty": 99999}], "category": "damaged_goods", "mode": "issue"}).status_code == 400
        f = requests.get(f"{API}/retail/returnable-orders", headers=H(demo), params={"bill": orders[0]["bill_number"]}).json()
        assert f and f[0]["bill_number"] == orders[0]["bill_number"]


# ---------- Slots / Uploads ----------
class TestSlotsUploads:
    def test_delivery_slots(self, owner):
        cur = requests.get(f"{API}/distributor/me/delivery-slots", headers=H(owner)).json()
        assert "localities" in cur and "slots" in cur
        bad = requests.put(f"{API}/distributor/me/delivery-slots", headers=H(owner), json={"localities": cur["localities"], "slots": [{"cutoff": "25:00", "window": "x"}]})
        assert bad.status_code == 400
        ok = requests.put(f"{API}/distributor/me/delivery-slots", headers=H(owner), json={"localities": cur["localities"], "slots": cur["slots"]})
        assert ok.status_code == 200

    def test_upload_and_access(self, newph, demo):
        png = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082")
        r = requests.post(f"{API}/uploads", headers=H(newph["token"]), files={"file": ("t.png", png, "image/png")}, timeout=60)
        assert r.status_code == 200, r.text
        fid = r.json()["id"]
        g = requests.get(f"{API}/files/{fid}", params={"token": newph["token"]}, timeout=60)
        assert g.status_code == 200 and g.content[:4] == png[:4]
        assert requests.get(f"{API}/files/{fid}", params={"token": demo}).status_code == 404
        assert requests.get(f"{API}/files/{fid}").status_code == 401
