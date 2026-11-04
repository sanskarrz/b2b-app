# Iteration 17 — Distributor panel change doc: payment activity, statement reconcile, field collections
# (submit/approve/reject/day-wise), owner ops roles, Set Parties, party matching, manual delivery ETA, pharmacy pay
import os
import sys
import uuid
import base64
from datetime import datetime, timedelta, timezone

import pytest
import requests
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
MDB = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
IST = timezone(timedelta(hours=5, minutes=30))


def _otp(email, portal):
    r = requests.post(f"{API}/auth/send-otp", json={"email": email, "portal": portal}, timeout=30)
    assert r.status_code == 200, r.text
    r = requests.post(f"{API}/auth/verify-otp", json={"email": email, "otp": r.json().get("dev_otp"), "portal": portal}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _pw(email):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": "Pass@123", "portal": "distributor"}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def H(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def owner():
    return _otp("owner@rxtech.com", "distributor")


@pytest.fixture(scope="module")
def sales():
    return _pw("sales@rxtech.com")


@pytest.fixture(scope="module")
def pharm():
    return _otp("demo@rxtech.com", "pharmacy")


def _cc(cust):
    return MDB.customer_credit.find_one({"distributor_id": "dist-1", "user_id": cust}, {"_id": 0}) or {}


# ---------- 1. Payment activity ----------
class TestPaymentActivity:
    def test_activity_shape(self, owner):
        r = requests.get(f"{API}/distributor/me/payment-activity", headers=H(owner), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert set(d["counts"]) == {"received", "partial", "pending"}
        t = d["totals"]
        assert abs(t["due"] - (t["received"] + t["balance"])) < 1
        assert isinstance(d["field_pending"], int)
        for b in d["items"][:50]:
            assert b["state"] in ("received", "partial", "pending")
            assert "customer_name" in b and "amount_total" in b and "last_mode" in b
            for e in b["events"]:
                assert e["mode"]

    def test_activity_filters(self, owner):
        r = requests.get(f"{API}/distributor/me/payment-activity?status=pending", headers=H(owner), timeout=30).json()
        assert all(b["state"] == "pending" for b in r["items"])
        r = requests.get(f"{API}/distributor/me/payment-activity?q=apollo", headers=H(owner), timeout=30).json()
        assert all("apollo" in b["customer_name"].lower() or "apollo" in b["bill_number"].lower() for b in r["items"])


# ---------- 4. Statement reconcile ----------
class TestStatement:
    @pytest.mark.parametrize("cust", ["cust-1", "cust-2", "cust-3", "cust-4"])
    def test_outstanding_reconciles(self, owner, cust):
        r = requests.get(f"{API}/distributor/me/customers/{cust}/statement", headers=H(owner), timeout=30)
        assert r.status_code == 200, r.text
        s = r.json()
        sm = s["summary"]
        assert abs(sm["outstanding"] - (sm["bills_due"] + sm["unbilled_orders"])) < 0.02
        assert abs(sm["outstanding"] - s["credit"]["credit_used"]) < 1, f"{cust}: outstanding {sm['outstanding']} vs credit_used {s['credit']['credit_used']}"
        assert abs(sum(b["balance"] for b in s["bills"]) - sm["bills_due"]) < 0.02
        if s["entries"]:
            assert abs(s["entries"][-1]["balance"] - sm["bills_due"]) < 0.05


# ---------- 8/9. Field collections ----------
class TestFieldCollections:
    created = []

    def test_validation(self, sales):
        r = requests.post(f"{API}/field/collections", headers=H(sales), json={"customer_id": "cust-1", "amount": 10, "mode": "upi"}, timeout=30)
        assert r.status_code == 400 and "reference" in r.json()["detail"].lower()
        r = requests.post(f"{API}/field/collections", headers=H(sales), json={"customer_id": "cust-1", "amount": 99999999, "mode": "cash"}, timeout=30)
        assert r.status_code == 400 and "due" in r.json()["detail"].lower()
        r = requests.post(f"{API}/field/collections", headers=H(sales), json={"customer_id": "cust-1", "amount": 0, "mode": "cash"}, timeout=30)
        assert r.status_code == 400

    def test_bills(self, sales):
        r = requests.get(f"{API}/field/customers/cust-1/bills", headers=H(sales), timeout=30)
        assert r.status_code == 200
        assert all(b["state"] != "received" for b in r.json())

    def test_submit_approve_allocates(self, sales, owner):
        bills = requests.get(f"{API}/field/customers/cust-2/bills", headers=H(sales), timeout=30).json()
        if not bills:
            pytest.skip("cust-2 has no open bills")
        target = sorted(bills, key=lambda b: b["due_date"] or "")[-1]  # newest bill (not oldest) to prove chosen-bill preference
        before_cc = _cc("cust-2").get("credit_used", 0)
        before_st = requests.get(f"{API}/distributor/me/customers/cust-2/statement", headers=H(owner), timeout=30).json()["summary"]
        r = requests.post(f"{API}/field/collections", headers=H(sales), json={
            "customer_id": "cust-2", "amount": 11, "mode": "upi", "reference": "TEST_UTR1", "remarks": "TEST_collection",
            "bill_ids": [target["bill_id"]]}, timeout=30)
        assert r.status_code == 200, r.text
        c = r.json()
        assert c["status"] == "pending_approval" and c["code"].startswith("COL-")
        TestFieldCollections.created.append(c["id"])
        mine = requests.get(f"{API}/field/collections", headers=H(sales), timeout=30).json()
        assert any(x["id"] == c["id"] for x in mine)
        lst = requests.get(f"{API}/distributor/me/field-collections?status=pending_approval", headers=H(owner), timeout=30).json()
        assert any(x["id"] == c["id"] for x in lst)
        r = requests.post(f"{API}/distributor/me/field-collections/{c['id']}/approve", headers=H(owner), timeout=30)
        assert r.status_code == 200, r.text
        a = r.json()
        assert a["allocations"][0]["bill_id"] == target["bill_id"] and a["allocations"][0]["amount"] == 11
        assert abs(_cc("cust-2")["credit_used"] - (before_cc - 11)) < 0.02
        after_st = requests.get(f"{API}/distributor/me/customers/cust-2/statement", headers=H(owner), timeout=30).json()["summary"]
        assert abs(after_st["outstanding"] - (before_st["outstanding"] - 11)) < 0.02
        # re-approve blocked
        r = requests.post(f"{API}/distributor/me/field-collections/{c['id']}/approve", headers=H(owner), timeout=30)
        assert r.status_code == 400
        mine = requests.get(f"{API}/field/collections", headers=H(sales), timeout=30).json()
        assert next(x for x in mine if x["id"] == c["id"])["status"] == "approved"

    def test_submit_reject(self, sales, owner):
        before_cc = _cc("cust-2").get("credit_used", 0)
        r = requests.post(f"{API}/field/collections", headers=H(sales), json={"customer_id": "cust-2", "amount": 7, "mode": "cash", "remarks": "TEST_reject"}, timeout=30)
        assert r.status_code == 200, r.text
        cid = r.json()["id"]
        TestFieldCollections.created.append(cid)
        r = requests.post(f"{API}/distributor/me/field-collections/{cid}/reject", headers=H(owner), json={"reason": "TEST_wrong"}, timeout=30)
        assert r.status_code == 200
        assert abs(_cc("cust-2").get("credit_used", 0) - before_cc) < 0.01
        r = requests.post(f"{API}/distributor/me/field-collections/{cid}/approve", headers=H(owner), timeout=30)
        assert r.status_code == 400

    def test_day_wise_statement(self, owner):
        r = requests.get(f"{API}/distributor/me/field-collections/statement", headers=H(owner), timeout=30)
        assert r.status_code == 200
        d = r.json()
        today = datetime.now(IST).strftime("%Y-%m-%d")
        row = next((x for x in d["rows"] if x["date"] == today and x["salesperson_id"] == "fs-1"), None)
        assert row, d["rows"][:3]
        assert row["approved"] >= 11 and row["rejected"] >= 7
        assert abs(row["collected"] - (row["approved"] + row["pending"] + row["rejected"])) < 0.02
        assert abs(row["difference"] - row["pending"]) < 0.02

    def test_sales_cannot_approve(self, sales):
        r = requests.get(f"{API}/distributor/me/field-collections", headers=H(sales), timeout=30)
        assert r.status_code == 403


def test_allocate_unit_exact_then_oldest():
    sys.path.insert(0, "/app/backend")
    import server  # noqa: F401  (server imports distributor_ops at the bottom)
    from distributor_ops import _allocate
    bills = [{"bill_id": "a", "bill_number": "A", "amount_open": 100, "due_date": "2025-01-01"},
             {"bill_id": "b", "bill_number": "B", "amount_open": 250, "due_date": "2025-02-01"},
             {"bill_id": "c", "bill_number": "C", "amount_open": 400, "due_date": "2025-03-01"}]
    assert [(b["bill_id"], a) for b, a in _allocate(bills, 250, [])] == [("b", 250)]
    assert [(b["bill_id"], a) for b, a in _allocate(bills, 300, [])] == [("a", 100), ("b", 200)]
    assert [(b["bill_id"], a) for b, a in _allocate(bills, 450, ["c"])] == [("c", 400), ("a", 50)]


# ---------- 5. Owner ops roles ----------
class TestOpsRoles:
    def test_ops_roles_flow(self, owner):
        try:
            r = requests.patch(f"{API}/distributor/me/ops-roles", headers=H(owner), json={"roles": ["field_sales", "delivery", "bogus"]}, timeout=30)
            assert r.status_code == 200 and r.json()["ops_roles"] == ["delivery", "field_sales"]
            assert requests.get(f"{API}/field/customers", headers=H(owner), timeout=30).status_code == 200
            r = requests.get(f"{API}/delivery/me/orders", headers=H(owner), timeout=30)
            assert r.status_code == 200, r.text
            staff = requests.get(f"{API}/distributor/me/staff?role=delivery", headers=H(owner), timeout=30).json()
            me = next((s for s in staff if s["role"] == "owner"), None)
            assert me, "owner not listed as delivery staff"
            o = MDB.orders.find_one({"distributor_id": "dist-1", "assigned_to": {"$ne": None}, "delivery_status": "assigned"}, {"_id": 0})
            if o:
                r = requests.patch(f"{API}/distributor/orders/{o['id']}/assign", headers=H(owner), json={"delivery_user_id": me["id"]}, timeout=30)
                ok = r.status_code
                ids = [x["id"] for x in requests.get(f"{API}/delivery/me/orders", headers=H(owner), timeout=30).json()]
                # restore original assignee
                MDB.orders.update_one({"id": o["id"]}, {"$set": {"assigned_to": o["assigned_to"], "assigned_to_name": o.get("assigned_to_name"), "delivery_status": o["delivery_status"]}})
                assert ok == 200, r.text
                assert o["id"] in ids
        finally:
            r = requests.patch(f"{API}/distributor/me/ops-roles", headers=H(owner), json={"roles": []}, timeout=30)
            assert r.json()["ops_roles"] == []
        assert requests.get(f"{API}/delivery/me/orders", headers=H(owner), timeout=30).status_code == 403

    def test_staff_cannot_set_ops_roles(self, sales):
        r = requests.patch(f"{API}/distributor/me/ops-roles", headers=H(sales), json={"roles": ["delivery"]}, timeout=30)
        assert r.status_code == 403


# ---------- 6. Set Parties ----------
class TestSetParties:
    def test_parties_filter(self, owner, sales):
        r = requests.get(f"{API}/distributor/me/staff/fs-1/parties", headers=H(owner), timeout=30)
        assert r.status_code == 200
        orig = r.json()
        assert "customers" in orig and "visible_count" in orig
        try:
            r = requests.patch(f"{API}/distributor/me/staff/fs-1/parties", headers=H(owner), json={"areas": ["Bhandup", "Mulund", "Thane"], "party_ids": []}, timeout=30)
            assert r.status_code == 200
            rows = requests.get(f"{API}/field/customers", headers=H(sales), timeout=30).json()
            ids = {x["id"] for x in rows}
            assert "cust-1" in ids and "cust-2" in ids and "cust-3" not in ids
            for x in rows:
                hay = f"{x.get('area') or ''} {x.get('address') or ''}".lower()
                assert any(a in hay for a in ("bhandup", "mulund", "thane")), x
            requests.patch(f"{API}/distributor/me/staff/fs-1/parties", headers=H(owner), json={"areas": ["Bhandup", "Mulund", "Thane"], "party_ids": ["cust-3"]}, timeout=30)
            ids = {x["id"] for x in requests.get(f"{API}/field/customers", headers=H(sales), timeout=30).json()}
            assert "cust-3" in ids
        finally:
            requests.patch(f"{API}/distributor/me/staff/fs-1/parties", headers=H(owner), json={"areas": orig["areas"], "party_ids": orig["party_ids"]}, timeout=30)

    def test_unknown_staff_404(self, owner):
        r = requests.patch(f"{API}/distributor/me/staff/nope-xyz/parties", headers=H(owner), json={"areas": []}, timeout=30)
        assert r.status_code == 404


# ---------- 7. Matching ----------
class TestMatching:
    def test_matching_and_link(self, owner):
        r = requests.get(f"{API}/distributor/me/sync/matching", headers=H(owner), timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert any("apollo" in p["name"].lower() and p["linked_user_id"] == "cust-1" for p in d["matched"])
        sg = next((p for p in d["exceptions"] if p["name"] == "Shree Ganesh Medical"), None)
        assert sg, "sample exception missing"
        try:
            r = requests.post(f"{API}/distributor/me/sync/link", headers=H(owner), json={"party_id": sg["id"], "user_id": "cust-4"}, timeout=30)
            assert r.status_code == 200
            d2 = requests.get(f"{API}/distributor/me/sync/matching", headers=H(owner), timeout=30).json()
            m = next(p for p in d2["matched"] if p["id"] == sg["id"])
            assert m["link_method"] == "manual" and m["linked_user_id"] == "cust-4"
            sd = requests.get(f"{API}/distributor/me/customers/cust-4/system-data", headers=H(owner), timeout=30).json()
            assert any(p["name"] == "Shree Ganesh Medical" for p in sd["parties"])
        finally:
            requests.post(f"{API}/distributor/me/sync/link", headers=H(owner), json={"party_id": sg["id"], "user_id": None}, timeout=30)
        r = requests.post(f"{API}/distributor/me/sync/link", headers=H(owner), json={"party_id": sg["id"], "user_id": "not-a-customer"}, timeout=30)
        assert r.status_code == 400

    def test_system_data_cust1(self, owner):
        r = requests.get(f"{API}/distributor/me/customers/cust-1/system-data", headers=H(owner), timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["parties"] and d["totals"]["purchases"] >= 15400 and d["totals"]["payments"] >= 15400
        assert isinstance(d["stock"], list)

    def test_import_party_csv_matched(self, owner):
        code = f"TESTP{uuid.uuid4().hex[:5]}"
        csv = f"Party Code,Party Name,City,Mobile\n{code},TEST_City Care Chemist,Mumbai,\n".encode()
        # name normalization strips 'chemist'; 'testcitycare' won't match → use real name variant
        csv = f"Party Code,Party Name,City,Mobile\n{code},City Care Chemists,Mumbai,\n".encode()
        try:
            r = requests.post(f"{API}/distributor/me/sync/import", headers=H(owner), json={
                "source": "upload", "filename": "TEST_parties.csv", "file_base64": base64.b64encode(csv).decode()}, timeout=60)
            assert r.status_code == 200, r.text
            assert "parties_matched" in r.json() and r.json()["parties_matched"] >= 1
            p = MDB.dist_parties.find_one({"distributor_id": "dist-1", "code": code}, {"_id": 0})
            assert p and p.get("linked_user_id") == "cust-3", p
        finally:
            MDB.dist_parties.delete_many({"distributor_id": "dist-1", "code": code})


# ---------- 10. Manual delivery time ----------
def _find_delivery(o, out):
    if isinstance(o, dict):
        if "label" in o and "serviceable" in o:
            out.append(o)
        for v in o.values():
            _find_delivery(v, out)
    elif isinstance(o, list):
        for v in o:
            _find_delivery(v, out)


class TestManualDelivery:
    def test_manual_eta(self, owner, pharm):
        orig = requests.get(f"{API}/distributor/me/delivery-slots", headers=H(owner), timeout=30).json()
        try:
            r = requests.put(f"{API}/distributor/me/delivery-slots", headers=H(owner), json={
                "localities": orig["localities"], "slots": orig["slots"], "manual_date": "2026-13-45", "manual_time": "10:30"}, timeout=30)
            assert r.status_code == 400
            tmr = (datetime.now(IST) + timedelta(days=1)).strftime("%Y-%m-%d")
            r = requests.put(f"{API}/distributor/me/delivery-slots", headers=H(owner), json={
                "localities": orig["localities"], "slots": orig["slots"], "manual_date": tmr, "manual_time": "10:30", "manual_note": "TEST_note"}, timeout=30)
            assert r.status_code == 200, r.text
            assert requests.get(f"{API}/distributor/me/delivery-slots", headers=H(owner), timeout=30).json()["manual_at"]
            found = []
            for q in ("para", "dolo", "crocin", "azi"):
                s = requests.get(f"{API}/retail/search?q={q}&distributor_id=dist-1", headers=H(pharm), timeout=30).json()
                _find_delivery(s, found)
                if found:
                    break
            assert found, "no delivery block in retail search"
            dl = found[0]
            assert dl["label"] == "Delivery by 10:30 AM, Tomorrow", dl
            assert (dl.get("updated_label") or "").startswith("Updated ")
        finally:
            requests.put(f"{API}/distributor/me/delivery-slots", headers=H(owner), json={
                "localities": orig["localities"], "slots": orig["slots"], "manual_note": orig.get("manual_note")}, timeout=30)


# ---------- Pharmacy pay reduces credit_used + notifies ----------
def test_pharmacy_pay_reduces_credit(pharm):
    me = requests.get(f"{API}/auth/me", headers=H(pharm), timeout=30).json()
    uid = (me.get("user") or me)["id"]
    p = {"id": f"TEST_pay_{uuid.uuid4().hex[:8]}", "user_id": uid, "distributor_id": "dist-1", "distributor_name": "ABC Pharma",
         "invoice_code": "TEST_INV-PAY", "amount": 5.0, "due_date": "2026-02-01", "status": "due", "days_to_due": 5}
    MDB.payments.insert_one({**p})
    cc0 = _cc(uid).get("credit_used", 0)
    MDB.customer_credit.update_one({"distributor_id": "dist-1", "user_id": uid}, {"$set": {"credit_used": cc0 + 5}})
    n0 = MDB.notifications.count_documents({"distributor_id": "dist-1", "title": "Payment received"})
    try:
        r = requests.post(f"{API}/payments/{p['id']}/pay", headers=H(pharm), timeout=30)
        assert r.status_code == 200
        assert abs(_cc(uid)["credit_used"] - cc0) < 0.02
        assert MDB.notifications.count_documents({"distributor_id": "dist-1", "title": "Payment received"}) == n0 + 1
    finally:  # restore demo data
        MDB.payments.delete_one({"id": p["id"]})
        MDB.notifications.delete_many({"distributor_id": "dist-1", "body": {"$regex": "TEST_INV-PAY"}})
        MDB.customer_credit.update_one({"distributor_id": "dist-1", "user_id": uid}, {"$set": {"credit_used": cc0}})
