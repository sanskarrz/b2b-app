# Iteration 23 — retest: duplicate return lines summed, GET /orders/{id} staff scoping, reopen -> return requested
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


def H(t):
    return {"Authorization": f"Bearer {t}"}


def _otp(email, portal):
    r = requests.post(f"{API}/auth/send-otp", json={"email": email, "portal": portal}, timeout=30)
    assert r.status_code == 200, r.text
    r = requests.post(f"{API}/auth/verify-otp", json={"email": email, "otp": r.json().get("dev_otp"), "portal": portal}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _pw(email):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": "Pass@123", "portal": "distributor"}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"], r.json()["user"]["id"]


@pytest.fixture(scope="module")
def demo():
    return _otp("demo@rxtech.com", "pharmacy")


@pytest.fixture(scope="module")
def owner():
    return _otp("owner@rxtech.com", "distributor")


@pytest.fixture(scope="module")
def dist_orders(owner):
    r = requests.get(f"{API}/distributor/me/orders", headers=H(owner), timeout=60)
    assert r.status_code == 200, r.text
    j = r.json()
    return j.get("items", j) if isinstance(j, dict) else j


def _returns_row(demo, did):
    j = requests.get(f"{API}/returns", headers=H(demo)).json()
    rows = j.get("items", j) if isinstance(j, dict) else j
    return next((x for x in rows if x.get("dispute_id") == did), None)


def _line(demo, need=2):
    rows = requests.get(f"{API}/retail/returnable-orders", headers=H(demo)).json()
    for o in rows:
        if o["distributor_id"] == "dist-1":
            for i in o["items"]:
                if i["returnable_qty"] >= need:
                    return o, i
    pytest.skip("no returnable line")


def _cleanup(owner, demo, did):
    requests.patch(f"{API}/distributor/me/disputes/{did}", headers=H(owner), json={"status": "rejected"})
    requests.post(f"{API}/disputes/{did}/unflag", headers=H(demo))


# ---- (2) duplicate lines summed + validated ----
class TestDuplicateLines:
    def test_duplicate_exceeding_rejected(self, demo):
        o, ln = _line(demo)
        q = ln["returnable_qty"]
        r = requests.post(f"{API}/retail/returns/flag", headers=H(demo), json={
            "order_id": o["order_id"], "category": "damaged_goods", "mode": "issue", "description": "TEST_dup23",
            "items": [{"line": ln["line"], "qty": q}, {"line": ln["line"], "qty": 1}]})
        assert r.status_code == 400, r.text
        assert "left to return" in r.json().get("detail", "")

    def test_duplicate_within_cap_merged(self, demo, owner):
        o, ln = _line(demo)
        r = requests.post(f"{API}/retail/returns/flag", headers=H(demo), json={
            "order_id": o["order_id"], "category": "damaged_goods", "mode": "issue", "description": "TEST_dup23ok",
            "items": [{"line": ln["line"], "qty": 1}, {"line": ln["line"], "qty": 1}, {"line": ln["line"], "qty": 0}]})
        assert r.status_code == 200, r.text
        did = r.json()["dispute"]["id"]
        try:
            ret = r.json()["return"]
            assert len(ret["items"]) == 1 and ret["items"][0]["qty"] == 2 and ret["qty"] == 2
            o2 = next(x for x in requests.get(f"{API}/retail/returnable-orders", headers=H(demo)).json() if x["order_id"] == o["order_id"])
            assert next(i for i in o2["items"] if i["line"] == ln["line"])["returnable_qty"] == ln["returnable_qty"] - 2
        finally:
            _cleanup(owner, demo, did)


# ---- (6) pharmacy reply reopening a returns query -> return back to requested ----
class TestReopenReturnStatus:
    def test_reopen_after_resolve_and_reject(self, demo, owner):
        o, ln = _line(demo, 1)
        r = requests.post(f"{API}/retail/returns/flag", headers=H(demo), json={
            "order_id": o["order_id"], "category": "damaged_goods", "mode": "issue", "description": "TEST_reopen23",
            "items": [{"line": ln["line"], "qty": 1}]})
        assert r.status_code == 200, r.text
        did = r.json()["dispute"]["id"]
        try:
            assert requests.patch(f"{API}/distributor/me/disputes/{did}", headers=H(owner), json={"status": "resolved", "resolution": "TEST"}).status_code == 200
            assert _returns_row(demo, did)["status"] == "approved"
            assert requests.post(f"{API}/disputes/{did}/reply", headers=H(demo), json={"text": "TEST_reopen1"}).status_code == 200
            assert _returns_row(demo, did)["status"] == "requested"
            assert requests.patch(f"{API}/distributor/me/disputes/{did}", headers=H(owner), json={"status": "rejected"}).status_code == 200
            assert _returns_row(demo, did)["status"] == "rejected"
            assert requests.post(f"{API}/disputes/{did}/reply", headers=H(demo), json={"text": "TEST_reopen2"}).status_code == 200
            assert _returns_row(demo, did)["status"] == "requested"
            d = next(x for x in requests.get(f"{API}/disputes", headers=H(demo)).json() if x["id"] == did)
            assert d["status"] == "open"
        finally:
            _cleanup(owner, demo, did)


# ---- (5) GET /orders/{id} staff scoping ----
class TestOrderScoping:
    def test_owner_manager_all(self, owner, dist_orders):
        mgr, _ = _pw("manager@rxtech.com")
        for o in dist_orders[:3]:
            assert requests.get(f"{API}/orders/{o['id']}", headers=H(owner)).status_code == 200
            assert requests.get(f"{API}/orders/{o['id']}", headers=H(mgr)).status_code == 200

    def test_delivery_only_assigned(self, dist_orders):
        tok, uid = _pw("delivery@rxtech.com")
        mine = [o for o in dist_orders if o.get("assigned_to") == uid]
        other = [o for o in dist_orders if o.get("assigned_to") != uid]
        assert other, "need an order not assigned to delivery@"
        for o in other[:5]:
            assert requests.get(f"{API}/orders/{o['id']}", headers=H(tok)).status_code == 404
        if mine:
            r = requests.get(f"{API}/orders/{mine[0]['id']}", headers=H(tok))
            assert r.status_code == 200 and r.json()["viewer"] == "distributor"

    def test_field_sales_only_taken(self, dist_orders):
        tok, uid = _pw("sales@rxtech.com")
        mine = [o for o in dist_orders if o.get("taken_by") == uid]
        other = [o for o in dist_orders if o.get("taken_by") != uid]
        for o in other[:5]:
            assert requests.get(f"{API}/orders/{o['id']}", headers=H(tok)).status_code == 404
        if mine:
            assert requests.get(f"{API}/orders/{mine[0]['id']}", headers=H(tok)).status_code == 200
        print(f"field_sales own orders: {len(mine)}")


# ---- edge: reopening a rejected return after the qty was re-flagged must not over-reserve ----
class TestReopenOverReserve:
    def test_reopen_rejected_after_reflag(self, demo, owner):
        o, ln = _line(demo, 1)
        q = ln["returnable_qty"]
        body = {"order_id": o["order_id"], "category": "damaged_goods", "mode": "issue", "description": "TEST_over23",
                "items": [{"line": ln["line"], "qty": q}]}
        r1 = requests.post(f"{API}/retail/returns/flag", headers=H(demo), json=body)
        assert r1.status_code == 200, r1.text
        d1 = r1.json()["dispute"]["id"]
        d2 = None
        try:
            assert requests.patch(f"{API}/distributor/me/disputes/{d1}", headers=H(owner), json={"status": "rejected"}).status_code == 200
            r2 = requests.post(f"{API}/retail/returns/flag", headers=H(demo), json=body)
            assert r2.status_code == 200, r2.text
            d2 = r2.json()["dispute"]["id"]
            rep = requests.post(f"{API}/disputes/{d1}/reply", headers=H(demo), json={"text": "TEST_reopen_over"})
            o2 = next(x for x in requests.get(f"{API}/retail/returnable-orders", headers=H(demo)).json() if x["order_id"] == o["order_id"])
            line = next(i for i in o2["items"] if i["line"] == ln["line"])
            print(f"reply={rep.status_code} received={line['received_qty']} returned={line['returned_qty']}")
            assert line["returned_qty"] <= line["received_qty"], "reopen over-reserved returned qty beyond received"
        finally:
            _cleanup(owner, demo, d1)
            if d2:
                _cleanup(owner, demo, d2)
