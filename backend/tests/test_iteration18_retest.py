# Iteration 18 — retest of iteration_17 fixes: Set Parties count, field collection caps/party checks,
# atomic approve + tagging + notifications, owner ops-role gate, cross-distributor parties 404, seed regression
import sys
import threading

import pytest
import requests

sys.path.insert(0, "/app/backend/tests")
from test_iteration17_distributor_ops import API, H, _otp, _pw, MDB  # noqa: E402


@pytest.fixture(scope="module")
def owner():
    return _otp("owner@rxtech.com", "distributor")


@pytest.fixture(scope="module")
def sales():
    return _pw("sales@rxtech.com")


@pytest.fixture(scope="module")
def created(owner):
    ids = []
    yield ids
    # cleanup: reject anything we created that is still pending (non-destructive)
    for cid in ids:
        requests.post(f"{API}/distributor/me/field-collections/{cid}/reject", headers=H(owner), json={"reason": "TEST_cleanup"})


def _collect(tok, cust, amount, created, **kw):
    r = requests.post(f"{API}/field/collections", headers=H(tok),
                      json={"customer_id": cust, "amount": amount, "mode": "cash", "remarks": "TEST_iter18", **kw}, timeout=30)
    if r.ok:
        created.append(r.json()["id"])
    return r


# ---------- Set Parties: backend in_area/hay consistent with what salesperson sees ----------
class TestSetParties:
    def test_visible_count_matches_field_customers(self, owner, sales):
        p = requests.get(f"{API}/distributor/me/staff/fs-1/parties", headers=H(owner)).json()
        assert p["areas"] == ["Bhandup", "Mulund", "Thane"]
        # replicate frontend inArea (uses hay)
        fe = [c for c in p["customers"] if any(a.lower() in (c.get("hay") or c.get("area") or "").lower() for a in p["areas"]) or c["id"] in p["party_ids"]]
        assert all("hay" in c for c in p["customers"])
        assert len(fe) == p["visible_count"]
        assert {c["id"] for c in fe} == {c["id"] for c in p["customers"] if c["in_area"] or c["assigned"]}
        seen = {c["id"] for c in requests.get(f"{API}/field/customers", headers=H(sales)).json()}
        assert {c["id"] for c in fe} == seen, f"modal {[c['id'] for c in fe]} vs sales {seen}"

    def test_other_distributor_staff_404(self):
        o2 = _otp("owner2@rxtech.com", "distributor")
        r = requests.get(f"{API}/distributor/me/staff/fs-1/parties", headers=H(o2))
        assert r.status_code == 404, r.text
        r2 = requests.patch(f"{API}/distributor/me/staff/fs-1/parties", headers=H(o2), json={"areas": ["X"], "party_ids": []})
        assert r2.status_code == 404


# ---------- Field collections: cap + party restriction ----------
class TestFieldCollectionRules:
    def test_cap_includes_pending(self, owner, sales, created):
        bills = requests.get(f"{API}/field/customers/cust-2/bills", headers=H(sales)).json()
        open_amt = sum(b["amount_open"] for b in bills)
        pend = sum(c["amount"] for c in requests.get(f"{API}/distributor/me/field-collections?status=pending_approval", headers=H(owner)).json()
                   if c["customer_id"] == "cust-2")
        left = round(open_amt - pend, 2)
        assert left > 1, f"nothing left to collect for cust-2 (open {open_amt}, pending {pend})"
        a = _collect(sales, "cust-2", left, created)
        assert a.status_code == 200, a.text
        b = _collect(sales, "cust-2", left, created)
        assert b.status_code == 400, b.text
        assert "due" in b.json()["detail"].lower()
        # reject the first one so dues free up again
        requests.post(f"{API}/distributor/me/field-collections/{a.json()['id']}/reject", headers=H(owner), json={"reason": "TEST_cap"})

    def test_out_of_party_bills_403(self, sales):
        r = requests.get(f"{API}/field/customers/cust-3/bills", headers=H(sales))
        assert r.status_code == 403, r.text

    def test_out_of_party_collect_403(self, sales, created):
        r = _collect(sales, "cust-3", 1, created)
        assert r.status_code == 403, r.text


# ---------- Approve atomic, tagging, notifications ----------
class TestApproveReject:
    def test_approve_tagging_and_notify(self, owner, sales, created):
        bills = requests.get(f"{API}/field/customers/cust-2/bills", headers=H(sales)).json()
        bill = bills[-1]
        c = _collect(sales, "cust-2", 1, created, bill_ids=[bill["bill_id"]]).json()
        r1 = requests.post(f"{API}/distributor/me/field-collections/{c['id']}/approve", headers=H(owner))
        assert r1.status_code == 200, r1.text
        assert [a["bill_id"] for a in r1.json()["allocations"]] == [bill["bill_id"]]
        r2 = requests.post(f"{API}/distributor/me/field-collections/{c['id']}/approve", headers=H(owner))
        assert r2.status_code == 400
        tagged = list(MDB.payments.find({"field_collection_id": c["id"]}, {"_id": 0, "invoice_code": 1, "collected_by_name": 1}))
        assert tagged and all(t["invoice_code"].replace("-PART", "") == bill["bill_number"] for t in tagged), tagged
        assert all(t["collected_by_name"] == "Amit Verma" for t in tagged)
        n = requests.get(f"{API}/notifications", headers=H(sales)).json()["items"]
        assert any(x["title"] == "Collection approved" and bill["bill_number"] in x["body"] for x in n[:10])

    def test_concurrent_approve_single_winner(self, owner, sales, created):
        c = _collect(sales, "cust-2", 1, created).json()
        res = []
        ts = [threading.Thread(target=lambda: res.append(requests.post(f"{API}/distributor/me/field-collections/{c['id']}/approve", headers=H(owner)).status_code)) for _ in range(4)]
        [t.start() for t in ts]
        [t.join() for t in ts]
        assert sorted(res) == [200, 400, 400, 400], res
        assert MDB.payments.count_documents({"field_collection_id": c["id"]}) >= 1

    def test_reject_notify_and_statement(self, owner, sales, created):
        c = _collect(sales, "cust-2", 1, created).json()  # cust-1 has no open bills left (settled by earlier runs)
        r = requests.post(f"{API}/distributor/me/field-collections/{c['id']}/reject", headers=H(owner), json={"reason": "TEST_nr"})
        assert r.status_code == 200
        n = requests.get(f"{API}/notifications", headers=H(sales)).json()["items"]
        assert any(x["title"] == "Collection not received" and "TEST_nr" in x["body"] for x in n[:10])
        st = requests.get(f"{API}/distributor/me/field-collections/statement?salesperson_id=fs-1", headers=H(owner)).json()
        assert st["rows"] and st["rows"][0]["rejected"] >= 1


# ---------- Owner ops role gate ----------
class TestOwnerOpsGate:
    def test_owner_needs_field_sales_role(self, owner, created):
        try:
            requests.patch(f"{API}/distributor/me/ops-roles", headers=H(owner), json={"roles": []})
            r = _collect(owner, "cust-2", 1, created)
            assert r.status_code == 403, r.text
            rb = requests.get(f"{API}/field/customers/cust-2/bills", headers=H(owner))
            assert rb.status_code == 403
            requests.patch(f"{API}/distributor/me/ops-roles", headers=H(owner), json={"roles": ["field_sales"]})
            r = _collect(owner, "cust-2", 1, created)
            assert r.status_code == 200, r.text
        finally:
            requests.patch(f"{API}/distributor/me/ops-roles", headers=H(owner), json={"roles": []})
        assert MDB.users.find_one({"id": "owner-1"})["ops_roles"] == []


# ---------- Seed regression ----------
class TestSeedRegression:
    def test_fs1_areas_and_cust_addresses(self):
        assert MDB.users.find_one({"id": "fs-1"})["areas"] == ["Bhandup", "Mulund", "Thane"]
        for cid, area in (("cust-1", "Bhandup"), ("cust-2", "Mulund"), ("cust-3", "Ghatkopar"), ("cust-4", "Kurla")):
            u = MDB.users.find_one({"id": cid})
            assert u["area"] == area and area in u["address"], (cid, u.get("area"), u.get("address"))
