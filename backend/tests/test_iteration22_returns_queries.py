# Iteration 22 — order detail viewer, product-wise returns from delivered orders, query threads (replies + photos)
import os
import uuid
import base64
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")


def _otp_login(email, portal):
    r = requests.post(f"{API}/auth/send-otp", json={"email": email, "portal": portal}, timeout=30)
    assert r.status_code == 200, r.text
    r = requests.post(f"{API}/auth/verify-otp", json={"email": email, "otp": r.json().get("dev_otp"), "portal": portal}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def H(t):
    return {"Authorization": f"Bearer {t}"}


def _upload(tok):
    r = requests.post(f"{API}/uploads", headers=H(tok), files={"file": ("TEST_p.png", PNG, "image/png")}, timeout=60)
    assert r.status_code == 200, r.text
    return r.json()["id"]


@pytest.fixture(scope="module")
def demo():
    return _otp_login("demo@rxtech.com", "pharmacy")


@pytest.fixture(scope="module")
def owner():
    return _otp_login("owner@rxtech.com", "distributor")


@pytest.fixture(scope="module")
def owner2():
    return _otp_login("owner2@rxtech.com", "distributor")


@pytest.fixture(scope="module")
def manager():
    r = requests.post(f"{API}/auth/login", json={"email": "manager@rxtech.com", "password": "Pass@123", "portal": "distributor"}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def returnable(demo):
    r = requests.get(f"{API}/retail/returnable-orders", headers=H(demo), timeout=60)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def d1_order(returnable):
    o = next((o for o in returnable if o["distributor_id"] == "dist-1" and any(i["returnable_qty"] >= 2 for i in o["items"])), None)
    if not o:
        pytest.skip("No delivered dist-1 order with returnable qty")
    return o


# ---------- Order detail viewer ----------
class TestOrderDetail:
    def test_pharmacy_viewer(self, demo, d1_order):
        r = requests.get(f"{API}/orders/{d1_order['order_id']}", headers=H(demo))
        assert r.status_code == 200 and r.json()["viewer"] == "pharmacy"

    def test_owner_viewer(self, owner, d1_order):
        r = requests.get(f"{API}/orders/{d1_order['order_id']}", headers=H(owner))
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["viewer"] == "distributor" and j.get("customer_name") and j["items"]

    def test_manager_viewer(self, manager, d1_order):
        r = requests.get(f"{API}/orders/{d1_order['order_id']}", headers=H(manager))
        assert r.status_code == 200 and r.json()["viewer"] == "distributor"

    def test_other_distributor_404(self, owner2, d1_order):
        r = requests.get(f"{API}/orders/{d1_order['order_id']}", headers=H(owner2))
        assert r.status_code == 404

    def test_dist_order_list_ids_open(self, owner):
        r = requests.get(f"{API}/distributor/me/orders", headers=H(owner))
        assert r.status_code == 200
        rows = r.json()
        rows = rows.get("items", rows) if isinstance(rows, dict) else rows
        assert rows
        for o in rows[:3]:
            assert requests.get(f"{API}/orders/{o['id']}", headers=H(owner)).status_code == 200


# ---------- Returnable orders ----------
class TestReturnable:
    def test_only_delivered(self, demo, returnable):
        assert returnable
        all_o = requests.get(f"{API}/orders", headers=H(demo)).json()
        st = {o["id"]: o for o in all_o}
        for o in returnable:
            src = st.get(o["order_id"])
            assert src and (src["status"] == "delivered" or src.get("delivery_confirmed"))
            assert o["payment_state"] in ("paid", "partial", "unpaid")
            assert o["suggested_mode"] == ("sellable" if o["payment_state"] == "paid" else "issue")
            for i in o["items"]:
                assert i["returnable_qty"] == max(i["received_qty"] - i["returned_qty"], 0)

    def test_search(self, demo, d1_order):
        r = requests.get(f"{API}/retail/returnable-orders", headers=H(demo), params={"distributor": (d1_order["distributor_name"] or "")[:4]})
        assert any(o["order_id"] == d1_order["order_id"] for o in r.json())
        r = requests.get(f"{API}/retail/returnable-orders", headers=H(demo), params={"bill": d1_order["bill_number"] or d1_order["code"]})
        assert any(o["order_id"] == d1_order["order_id"] for o in r.json())
        r = requests.get(f"{API}/retail/returnable-orders", headers=H(demo), params={"bill": "ZZZ_NOPE_999"})
        assert r.json() == []


# ---------- Flag returns + query thread ----------
class TestReturnFlow:
    state: dict = {}

    def _line(self, d1_order):
        return next(i for i in d1_order["items"] if i["returnable_qty"] >= 2)

    def test_validation(self, demo, d1_order):
        ln = self._line(d1_order)
        base = {"order_id": d1_order["order_id"], "category": "damaged_goods", "mode": "issue"}
        assert requests.post(f"{API}/retail/returns/flag", headers=H(demo), json={**base, "items": []}).status_code == 400
        assert requests.post(f"{API}/retail/returns/flag", headers=H(demo), json={**base, "items": [{"line": ln["line"], "qty": ln["returnable_qty"] + 1}]}).status_code == 400
        assert requests.post(f"{API}/retail/returns/flag", headers=H(demo), json={**base, "category": "bogus", "items": [{"line": ln["line"], "qty": 1}]}).status_code == 400
        assert requests.post(f"{API}/retail/returns/flag", headers=H(demo), json={**base, "items": [{"line": 999, "qty": 1}]}).status_code == 400

    def test_duplicate_line_exceeds(self, demo, owner, d1_order):
        """Same line twice must not bypass the returnable cap."""
        ln = self._line(d1_order)
        q = ln["returnable_qty"]
        r = requests.post(f"{API}/retail/returns/flag", headers=H(demo), json={
            "order_id": d1_order["order_id"], "category": "damaged_goods", "mode": "issue",
            "description": "TEST_dup", "items": [{"line": ln["line"], "qty": q}, {"line": ln["line"], "qty": q}]})
        if r.status_code == 200:  # clean up: reject it so qty is restored
            did = r.json()["dispute"]["id"]
            requests.patch(f"{API}/distributor/me/disputes/{did}", headers=H(owner), json={"status": "rejected"})
            requests.post(f"{API}/disputes/{did}/unflag", headers=H(demo))
        assert r.status_code == 400, f"duplicate lines accepted: {r.text[:200]}"

    def test_non_delivered_400(self, demo):
        rows = requests.get(f"{API}/orders", headers=H(demo)).json()
        o = next((o for o in rows if o["status"] != "delivered" and not o.get("delivery_confirmed") and o.get("items")), None)
        if not o:
            pytest.skip("no non-delivered order")
        r = requests.post(f"{API}/retail/returns/flag", headers=H(demo), json={
            "order_id": o["id"], "category": "damaged_goods", "mode": "issue", "items": [{"line": 0, "qty": 1}]})
        assert r.status_code == 400

    def test_create(self, demo, d1_order):
        ln = self._line(d1_order)
        pid = _upload(demo)
        r = requests.post(f"{API}/retail/returns/flag", headers=H(demo), json={
            "order_id": d1_order["order_id"], "category": "damaged_goods", "mode": d1_order["suggested_mode"],
            "description": "TEST_return", "photo_file_ids": [pid], "items": [{"line": ln["line"], "qty": 1}]})
        assert r.status_code == 200, r.text
        j = r.json()
        d, ret = j["dispute"], j["return"]
        assert d["source"] == "returns" and d["order_id"] == d1_order["order_id"] and d["items"][0]["qty"] == 1
        assert ret["dispute_id"] == d["id"] and ret["status"] == "requested"
        TestReturnFlow.state.update(dispute=d["id"], line=ln["line"], before=ln["returnable_qty"])
        r2 = requests.get(f"{API}/retail/returnable-orders", headers=H(demo)).json()
        o2 = next(o for o in r2 if o["order_id"] == d1_order["order_id"])
        assert next(i for i in o2["items"] if i["line"] == ln["line"])["returnable_qty"] == ln["returnable_qty"] - 1

    def test_linked_order(self, demo, owner, d1_order):
        did = TestReturnFlow.state["dispute"]
        rows = requests.get(f"{API}/disputes", headers=H(demo)).json()
        assert next(x for x in rows if x["id"] == did)["linked_order_id"] == d1_order["order_id"]
        rows = requests.get(f"{API}/distributor/me/disputes", headers=H(owner)).json()["items"]
        assert next(x for x in rows if x["id"] == did)["linked_order_id"] == d1_order["order_id"]

    def test_dist_note_only_and_photo(self, owner, demo):
        did = TestReturnFlow.state["dispute"]
        assert requests.patch(f"{API}/distributor/me/disputes/{did}", headers=H(owner), json={}).status_code == 400
        r = requests.patch(f"{API}/distributor/me/disputes/{did}", headers=H(owner), json={"note": "TEST_note"})
        assert r.status_code == 200, r.text
        pid = _upload(owner)
        r = requests.patch(f"{API}/distributor/me/disputes/{did}", headers=H(owner), json={"note": "TEST_photo", "photo_file_ids": [pid]})
        assert r.status_code == 200
        d = next(x for x in requests.get(f"{API}/disputes", headers=H(demo)).json() if x["id"] == did)
        acts = [a for a in d["activities"] if a.get("by") == "distributor"]
        assert any(a["text"] == "TEST_note" and a.get("author") for a in acts)
        assert any(pid in (a.get("photo_file_ids") or []) for a in acts)
        assert d["status"] == "open"  # note alone doesn't change status
        f = requests.get(f"{API}/files/{pid}", headers=H(demo))
        assert f.status_code == 200 and f.content == PNG

    def test_pharmacy_reply(self, demo, owner):
        did = TestReturnFlow.state["dispute"]
        assert requests.post(f"{API}/disputes/{did}/reply", headers=H(demo), json={"text": "  "}).status_code == 400
        pid = _upload(demo)
        r = requests.post(f"{API}/disputes/{did}/reply", headers=H(demo), json={"text": "TEST_reply", "photo_file_ids": [pid]})
        assert r.status_code == 200
        assert requests.get(f"{API}/files/{pid}", headers=H(owner)).status_code == 200

    def test_resolve_sets_return_approved_and_reopen(self, demo, owner):
        did = TestReturnFlow.state["dispute"]
        assert requests.patch(f"{API}/distributor/me/disputes/{did}", headers=H(owner), json={"status": "in_progress"}).status_code == 200
        assert requests.patch(f"{API}/distributor/me/disputes/{did}", headers=H(owner), json={"status": "resolved", "resolution": "TEST ok"}).status_code == 200
        rets = requests.get(f"{API}/returns", headers=H(demo))
        if rets.status_code == 200:
            rows = rets.json()
            rows = rows.get("items", rows) if isinstance(rows, dict) else rows
            rr = next((x for x in rows if x.get("dispute_id") == did), None)
            assert rr and rr["status"] == "approved"
        r = requests.post(f"{API}/disputes/{did}/reply", headers=H(demo), json={"text": "TEST_not_ok"})
        assert r.status_code == 200
        d = next(x for x in requests.get(f"{API}/disputes", headers=H(demo)).json() if x["id"] == did)
        assert d["status"] == "open"

    def test_reject_restores_qty_and_close(self, demo, owner, d1_order):
        did = TestReturnFlow.state["dispute"]
        assert requests.patch(f"{API}/distributor/me/disputes/{did}", headers=H(owner), json={"status": "rejected"}).status_code == 200
        r2 = requests.get(f"{API}/retail/returnable-orders", headers=H(demo)).json()
        o2 = next(o for o in r2 if o["order_id"] == d1_order["order_id"])
        assert next(i for i in o2["items"] if i["line"] == TestReturnFlow.state["line"])["returnable_qty"] == TestReturnFlow.state["before"]
        assert requests.post(f"{API}/disputes/{did}/unflag", headers=H(demo)).status_code == 200
        assert requests.post(f"{API}/disputes/{did}/reply", headers=H(demo), json={"text": "x"}).status_code == 400
        assert requests.patch(f"{API}/distributor/me/disputes/{did}", headers=H(owner), json={"note": "x"}).status_code == 400

