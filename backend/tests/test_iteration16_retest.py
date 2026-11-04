# Iteration 16 — retest of iteration_15 fixes: scheme validation 400s, mapping role guard,
# distributor rating guard, single query per shortbook note, credit_used after distributor unmap
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


def _login(email, portal):
    r = requests.post(f"{API}/auth/send-otp", json={"email": email, "portal": portal}, timeout=30)
    assert r.status_code == 200, r.text
    r = requests.post(f"{API}/auth/verify-otp", json={"email": email, "otp": r.json().get("dev_otp"), "portal": portal}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def H(t):
    return {"Authorization": f"Bearer {t}"}


def _new_pharmacy():
    email = f"test_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/register", json={
        "account_type": "pharmacy", "name": "TEST_Pharm16", "email": email,
        "phone": "9" + uuid.uuid4().hex[:9].translate(str.maketrans("abcdef", "123456")),
        "business_name": "TEST_Shop16"}, timeout=30)
    assert r.status_code in (200, 201), r.text
    tok = _login(email, "pharmacy")
    me = requests.get(f"{API}/auth/me", headers=H(tok)).json()
    return {"token": tok, "id": (me.get("user") or me).get("id"), "email": email}


@pytest.fixture(scope="module")
def owner():
    return _login("owner@rxtech.com", "distributor")


@pytest.fixture(scope="module")
def manager():
    r = requests.post(f"{API}/auth/login", json={"email": "manager@rxtech.com", "password": "Pass@123", "portal": "distributor"}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"manager login failed {r.status_code} {r.text[:120]}")
    return r.json()["token"]


@pytest.fixture(scope="module")
def product(owner):
    r = requests.get(f"{API}/distributor/me/inventory", headers=H(owner), params={"limit": 20})
    items = r.json()
    items = items.get("items", items) if isinstance(items, dict) else items
    return next(i for i in items if (i.get("qty_available") or 0) > 20 and (i.get("ptr") or 0) > 0)


# ---------- Scheme validation ----------
class TestSchemeValidation:
    BAD = [
        {"type": "percent"}, {"type": "percent", "pct": 0}, {"type": "percent", "pct": 150},
        {"type": "percent", "pct": "abc"}, {"type": "rupee"}, {"type": "rupee", "amount": -1},
        {"type": "free"}, {"type": "free", "buy": 10}, {"type": "free", "buy": "x", "free": 1},
        {"type": "slab", "slabs": []}, {"type": "slab"}, {"type": "slab", "slabs": [{"min_qty": 5}]},
        {"type": "custom"}, {"type": "custom", "text": "  "},
    ]

    def test_bad_schemes_400(self, owner, product):
        pid = product.get("product_id") or product["id"]
        url = f"{API}/distributor/me/inventory/{pid}"
        fails = []
        try:
            for det in self.BAD:
                r = requests.patch(url, headers=H(owner), json={"scheme_detail": det})
                if r.status_code != 400:
                    fails.append((det, r.status_code, r.text[:100]))
        finally:
            requests.patch(url, headers=H(owner), json={"scheme_detail": {"type": "none"}})
            if product.get("scheme"):
                requests.patch(url, headers=H(owner), json={"scheme": product["scheme"]})
        assert not fails, fails

    def test_malformed_slab_shapes(self, owner, product):
        # edge: slabs not list of dicts
        pid = product.get("product_id") or product["id"]
        url = f"{API}/distributor/me/inventory/{pid}"
        res = []
        try:
            for det in ({"type": "slab", "slabs": "abc"}, {"type": "slab", "slabs": ["x"]}):
                r = requests.patch(url, headers=H(owner), json={"scheme_detail": det})
                res.append((det, r.status_code))
        finally:
            requests.patch(url, headers=H(owner), json={"scheme_detail": {"type": "none"}})
            if product.get("scheme"):
                requests.patch(url, headers=H(owner), json={"scheme": product["scheme"]})
        assert all(c == 400 for _, c in res), res

    def test_valid_percent_and_none_200(self, owner, product):
        pid = product.get("product_id") or product["id"]
        url = f"{API}/distributor/me/inventory/{pid}"
        try:
            r = requests.patch(url, headers=H(owner), json={"scheme_detail": {"type": "percent", "pct": 7}})
            assert r.status_code == 200, r.text
            inv = requests.get(f"{API}/distributor/me/inventory", headers=H(owner), params={"q": product.get("name", "")[:20], "limit": 50}).json()
            inv = inv.get("items", inv) if isinstance(inv, dict) else inv
            row = next((i for i in inv if (i.get("product_id") or i.get("id")) == pid), None)
            if row is not None:
                assert row.get("scheme") == "7% off", row.get("scheme")
            r = requests.patch(url, headers=H(owner), json={"scheme_detail": {"type": "none"}})
            assert r.status_code == 200, r.text
        finally:
            requests.patch(url, headers=H(owner), json={"scheme_detail": {"type": "none"}})
            if product.get("scheme"):
                requests.patch(url, headers=H(owner), json={"scheme": product["scheme"]})


# ---------- Mapping / rating / query guards ----------
class TestGuards:
    def test_distributor_cannot_request_mapping(self, owner, manager):
        assert requests.post(f"{API}/retail/mappings", headers=H(owner), json={"distributor_id": "dist-2"}).status_code == 403
        assert requests.post(f"{API}/retail/mappings", headers=H(manager), json={"distributor_id": "dist-2"}).status_code == 403

    def test_rate_non_customer_400(self, owner):
        ph = _new_pharmacy()
        r = requests.post(f"{API}/distributor/me/customers/{ph['id']}/rating", headers=H(owner), json={"stars": 4})
        assert r.status_code == 400, r.text
        r = requests.post(f"{API}/distributor/me/customers/nonexistent-xyz/rating", headers=H(owner), json={"stars": 4})
        assert r.status_code == 400, r.text

    def test_second_query_from_note_400(self):
        ph = _new_pharmacy()
        t = H(ph["token"])
        n = requests.post(f"{API}/shortbook/notes", headers=t, json={"text": "TEST_note16"}).json()
        body = {"distributor_id": "dist-1", "type": "no_supply", "title": "TEST_q16"}
        r1 = requests.post(f"{API}/shortbook/notes/{n['id']}/query", headers=t, json=body)
        assert r1.status_code == 200, r1.text
        r2 = requests.post(f"{API}/shortbook/notes/{n['id']}/query", headers=t, json=body)
        assert r2.status_code == 400 and "already" in r2.text.lower(), r2.text
        requests.delete(f"{API}/shortbook/notes/{n['id']}", headers=t)

    def test_credit_used_visible_after_distributor_unmap(self, owner, product):
        ph = _new_pharmacy()
        t = H(ph["token"])
        pid = product.get("product_id") or product["id"]
        assert requests.post(f"{API}/retail/mappings", headers=t, json={"distributor_id": "dist-1"}).status_code == 200
        r = requests.post(f"{API}/distributor/me/mapping-requests/{ph['id']}/approve", headers=H(owner), json={"credit_limit": 20000, "credit_days": 15})
        assert r.status_code == 200, r.text
        requests.delete(f"{API}/cart", headers=t)
        assert requests.post(f"{API}/cart/items", headers=t, json={"product_id": pid, "distributor_id": "dist-1", "qty": 2}).status_code == 200
        total = requests.get(f"{API}/cart", headers=t).json()["total"]
        r = requests.post(f"{API}/orders", headers=t, params={"payment_method": "credit"})
        assert r.status_code == 200, r.text
        before = requests.get(f"{API}/distributors/dist-1", headers=t).json()["distributor"]
        assert before["credit_limit"] == 20000 and abs(before["credit_used"] - total) < 1
        r = requests.post(f"{API}/distributor/me/customers/{ph['id']}/unmap", headers=H(owner))
        print("dist unmap with outstanding ->", r.status_code, r.text[:150])
        assert r.status_code in (200, 400)
        after = requests.get(f"{API}/distributors/dist-1", headers=t).json()["distributor"]
        if r.status_code == 200:
            assert after["mapping_status"] == "unmapped"
            assert after["credit_limit"] == 0
            assert abs(after["credit_used"] - total) < 1, after["credit_used"]
            # pharmacy can't order on credit any more
            requests.post(f"{API}/cart/items", headers=t, json={"product_id": pid, "distributor_id": "dist-1", "qty": 1})
            r = requests.post(f"{API}/orders", headers=t, params={"payment_method": "credit"})
            assert r.status_code == 400
        requests.delete(f"{API}/cart", headers=t)
