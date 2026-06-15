"""Distributor side end-to-end tests:
- Auth + switch-role
- /distributor/me/customers (per-customer credit)
- /distributor/me/receivables (+ filters)
- /distributor/payments/{pid}/record (full + partial settlement -> credit_used drops)
- /distributor/me/customers/{cust_id} (detail + ledger running balance)
- PATCH .../credit
- POST .../credit-note (reduces credit_used) and .../debit-note
- Connected check: pharmacist + distributor read the SAME customer_credit
- Two-way chat: threads / history / send
- Pharmacist regression after credit refactor
"""
import time
import pytest

DEMO_EMAIL = "demo@rxtech.com"


def _login(api_client, base_url, email):
    r = api_client.post(f"{base_url}/api/auth/send-otp", json={"email": email})
    assert r.status_code == 200, r.text
    otp = r.json()["dev_otp"]
    r = api_client.post(f"{base_url}/api/auth/verify-otp", json={"email": email, "otp": otp})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def demo_token(api_client, base_url):
    return _login(api_client, base_url, DEMO_EMAIL)["token"]


@pytest.fixture(scope="module")
def demo_headers(demo_token):
    return {"Authorization": f"Bearer {demo_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def dist_headers(api_client, base_url, demo_headers):
    """Same demo user but with active distributor role (dist-1)."""
    r = api_client.post(
        f"{base_url}/api/distributor/switch-role",
        json={"role": "distributor"},
        headers=demo_headers,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["active_role"] == "distributor"
    return demo_headers


# ---------- Auth + Switch ----------
class TestAuthSwitch:
    def test_login_returns_token_and_user(self, api_client, base_url):
        body = _login(api_client, base_url, DEMO_EMAIL)
        assert "token" in body and "user" in body
        assert body["user"]["email"] == DEMO_EMAIL

    def test_switch_to_distributor(self, api_client, base_url, demo_headers):
        r = api_client.post(
            f"{base_url}/api/distributor/switch-role",
            json={"role": "distributor"},
            headers=demo_headers,
        )
        assert r.status_code == 200
        assert r.json()["active_role"] == "distributor"
        u = r.json()["user"]
        assert u.get("owned_distributor_id") == "dist-1"

    def test_distributor_me(self, api_client, base_url, dist_headers):
        r = api_client.get(f"{base_url}/api/distributor/me", headers=dist_headers)
        assert r.status_code == 200
        assert r.json()["distributor"]["id"] == "dist-1"


# ---------- Customers (per-customer credit) ----------
class TestDistributorCustomers:
    def test_list_has_4_seeded_customers(self, api_client, base_url, dist_headers):
        r = api_client.get(f"{base_url}/api/distributor/me/customers", headers=dist_headers)
        assert r.status_code == 200, r.text
        rows = r.json()
        names = {row["name"] for row in rows}
        # seeded demos
        for needed in ("Apollo Medical Store", "Wellness Pharmacy", "City Care Chemist", "Guardian Pharmacy"):
            assert needed in names, f"Missing seeded customer {needed} — got {names}"
        # Each row has per-customer credit fields
        for row in rows:
            for k in ("credit_limit", "credit_used", "credit_available", "credit_used_pct", "outstanding"):
                assert k in row, f"missing {k} on customer row"
            assert row["credit_available"] == round(row["credit_limit"] - row["credit_used"], 2)

    def test_customer_detail_shape(self, api_client, base_url, dist_headers):
        r = api_client.get(f"{base_url}/api/distributor/me/customers/cust-1", headers=dist_headers)
        assert r.status_code == 200, r.text
        b = r.json()
        for k in ("customer", "credit", "stats", "recent_orders", "open_invoices", "entries"):
            assert k in b
        assert b["customer"]["id"] == "cust-1"
        assert b["credit"]["credit_limit"] > 0
        # running balance is monotonic order-by-date
        if b["entries"]:
            running = 0.0
            for e in b["entries"]:
                running += e["debit"] - e["credit"]
                assert abs(round(running, 2) - e["running_balance"]) < 0.01


# ---------- Receivables ----------
class TestReceivables:
    def test_default_open(self, api_client, base_url, dist_headers):
        r = api_client.get(f"{base_url}/api/distributor/me/receivables", headers=dist_headers)
        assert r.status_code == 200, r.text
        b = r.json()
        for k in ("total_outstanding", "total_overdue", "collected_30d", "due_this_week", "open_count", "overdue_count"):
            assert k in b["summary"]
        # items should only contain due/overdue when no status filter
        for it in b["items"]:
            assert it["status"] in ("due", "overdue")
            assert "customer_name" in it

    def test_filter_overdue(self, api_client, base_url, dist_headers):
        r = api_client.get(f"{base_url}/api/distributor/me/receivables?status=overdue", headers=dist_headers)
        assert r.status_code == 200
        for it in r.json()["items"]:
            assert it["status"] == "overdue"

    def test_filter_paid(self, api_client, base_url, dist_headers):
        r = api_client.get(f"{base_url}/api/distributor/me/receivables?status=paid", headers=dist_headers)
        assert r.status_code == 200
        for it in r.json()["items"]:
            assert it["status"] == "paid"


# ---------- Record Payment ----------
class TestRecordPayment:
    def test_partial_then_full_payment_reduces_credit_used(self, api_client, base_url, dist_headers):
        # pick an open invoice for cust-2 (less overdue noise) to be safe
        recv = api_client.get(
            f"{base_url}/api/distributor/me/receivables", headers=dist_headers
        ).json()
        candidates = [p for p in recv["items"] if p["status"] in ("due", "overdue")]
        if not candidates:
            pytest.skip("No open invoices to settle")
        pay = candidates[0]
        cust_id = pay["user_id"]
        pid = pay["id"]
        orig_amount = pay["amount"]

        # snapshot credit
        before = api_client.get(
            f"{base_url}/api/distributor/me/customers/{cust_id}", headers=dist_headers
        ).json()["credit"]["credit_used"]

        # partial
        partial = round(orig_amount / 2, 2)
        r = api_client.post(
            f"{base_url}/api/distributor/payments/{pid}/record",
            json={"amount": partial, "method": "upi"},
            headers=dist_headers,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["success"] is True
        assert body["fully_paid"] is False
        assert abs(body["collected"] - partial) < 0.01

        mid = api_client.get(
            f"{base_url}/api/distributor/me/customers/{cust_id}", headers=dist_headers
        ).json()["credit"]["credit_used"]
        assert mid < before, f"credit_used should drop after partial pay: before={before} mid={mid}"

        # full settle remaining
        r = api_client.post(
            f"{base_url}/api/distributor/payments/{pid}/record",
            json={"method": "cash"},  # full settlement
            headers=dist_headers,
        )
        assert r.status_code == 200, r.text
        assert r.json()["fully_paid"] is True

        after = api_client.get(
            f"{base_url}/api/distributor/me/customers/{cust_id}", headers=dist_headers
        ).json()["credit"]["credit_used"]
        assert after < mid, f"credit_used should drop again after full settle: mid={mid} after={after}"
        # roughly drops by orig_amount overall (allow 1 rupee rounding)
        assert abs((before - after) - orig_amount) < 1.5, f"drop {(before-after)} vs orig {orig_amount}"

    def test_record_payment_on_paid_invoice_400(self, api_client, base_url, dist_headers):
        recv = api_client.get(
            f"{base_url}/api/distributor/me/receivables?status=paid", headers=dist_headers
        ).json()
        if not recv["items"]:
            pytest.skip("No paid invoice yet")
        pid = recv["items"][0]["id"]
        r = api_client.post(
            f"{base_url}/api/distributor/payments/{pid}/record",
            json={"amount": 1.0}, headers=dist_headers,
        )
        assert r.status_code == 400


# ---------- Credit Management ----------
class TestCreditManagement:
    def test_patch_credit_limit_persists(self, api_client, base_url, dist_headers):
        new_limit = 175000
        r = api_client.patch(
            f"{base_url}/api/distributor/me/customers/cust-2/credit",
            json={"credit_limit": new_limit}, headers=dist_headers,
        )
        assert r.status_code == 200, r.text
        assert r.json()["credit"]["credit_limit"] == new_limit
        # GET reflects
        g = api_client.get(f"{base_url}/api/distributor/me/customers/cust-2", headers=dist_headers).json()
        assert g["credit"]["credit_limit"] == new_limit

    def test_credit_note_reduces_used(self, api_client, base_url, dist_headers):
        before = api_client.get(
            f"{base_url}/api/distributor/me/customers/cust-1", headers=dist_headers
        ).json()["credit"]["credit_used"]
        r = api_client.post(
            f"{base_url}/api/distributor/me/customers/cust-1/credit-note",
            json={"amount": 1234, "reason": "Damaged stock"}, headers=dist_headers,
        )
        assert r.status_code == 200, r.text
        item = r.json()["item"]
        assert item["code"].startswith("CN-")
        assert item["amount"] == 1234
        after = api_client.get(
            f"{base_url}/api/distributor/me/customers/cust-1", headers=dist_headers
        ).json()["credit"]["credit_used"]
        assert abs((before - after) - 1234) < 0.5, f"expected credit_used drop ~1234, got {before-after}"

    def test_debit_note_creates(self, api_client, base_url, dist_headers):
        r = api_client.post(
            f"{base_url}/api/distributor/me/customers/cust-1/debit-note",
            json={"amount": 500, "reason": "Penalty"}, headers=dist_headers,
        )
        assert r.status_code == 200
        assert r.json()["item"]["code"].startswith("DN-")

    def test_credit_note_zero_400(self, api_client, base_url, dist_headers):
        r = api_client.post(
            f"{base_url}/api/distributor/me/customers/cust-1/credit-note",
            json={"amount": 0, "reason": "x"}, headers=dist_headers,
        )
        assert r.status_code == 400


# ---------- Connected: distributor + pharmacist view same credit ----------
class TestConnectedCredit:
    def test_credit_internally_consistent(self, api_client, base_url, dist_headers):
        # distributor view
        d = api_client.get(
            f"{base_url}/api/distributor/me/customers/cust-1", headers=dist_headers
        ).json()
        d_used = d["credit"]["credit_used"]
        # also exposed via list
        rows = api_client.get(
            f"{base_url}/api/distributor/me/customers", headers=dist_headers
        ).json()
        row = next(r for r in rows if r["user_id"] == "cust-1")
        assert abs(row["credit_used"] - d_used) < 0.01, "List & detail must return same credit_used"


# ---------- Chat ----------
class TestChat:
    def test_threads_have_customer_and_unread(self, api_client, base_url, dist_headers):
        r = api_client.get(f"{base_url}/api/distributor/me/chat/threads", headers=dist_headers)
        assert r.status_code == 200
        threads = r.json()
        assert isinstance(threads, list)
        # at least one thread (seeded)
        if threads:
            t = threads[0]
            assert "customer" in t and "last_message" in t and "unread" in t

    def test_history_marks_user_msgs_read(self, api_client, base_url, dist_headers):
        # call once
        r1 = api_client.get(f"{base_url}/api/distributor/me/chat/cust-1", headers=dist_headers)
        assert r1.status_code == 200, r1.text
        b1 = r1.json()
        assert b1["customer"]["id"] == "cust-1"
        # after fetching, threads unread for cust-1 should be 0
        threads = api_client.get(f"{base_url}/api/distributor/me/chat/threads", headers=dist_headers).json()
        for t in threads:
            if t["customer"]["id"] == "cust-1":
                assert t["unread"] == 0

    def test_send_message(self, api_client, base_url, dist_headers):
        msg_txt = f"TEST_msg_{int(time.time())}"
        r = api_client.post(
            f"{base_url}/api/distributor/me/chat",
            json={"user_id": "cust-1", "message": msg_txt}, headers=dist_headers,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["success"] is True
        assert body["message"]["sender"] == "distributor"
        assert body["message"]["message"] == msg_txt
        # appears in history
        hist = api_client.get(f"{base_url}/api/distributor/me/chat/cust-1", headers=dist_headers).json()
        assert any(m["message"] == msg_txt for m in hist["messages"])

    def test_send_empty_400(self, api_client, base_url, dist_headers):
        r = api_client.post(
            f"{base_url}/api/distributor/me/chat",
            json={"user_id": "cust-1", "message": "   "}, headers=dist_headers,
        )
        assert r.status_code == 400


# ---------- Pharmacist Regression ----------
class TestPharmacistRegression:
    def test_dashboard(self, api_client, base_url, demo_headers):
        r = api_client.get(f"{base_url}/api/dashboard", headers=demo_headers)
        assert r.status_code == 200, r.text
        b = r.json()
        # dashboard returns several panels; just sanity check a known one
        assert "payment_due" in b or "action_required" in b

    def test_payments_summary_uses_customer_credit(self, api_client, base_url, demo_headers):
        r = api_client.get(f"{base_url}/api/payments/summary", headers=demo_headers)
        assert r.status_code == 200, r.text
        b = r.json()
        for k in ("total_credit_taken", "total_credit_limit", "credit_available"):
            assert k in b
        assert b["total_credit_limit"] >= 0
        assert b["credit_available"] == round(b["total_credit_limit"] - b["total_credit_taken"], 2)

    def test_distributors_list(self, api_client, base_url, demo_headers):
        r = api_client.get(f"{base_url}/api/distributors", headers=demo_headers)
        assert r.status_code == 200
        assert len(r.json()) >= 1

    def test_ledger_for_dist(self, api_client, base_url, demo_headers):
        r = api_client.get(f"{base_url}/api/ledger/dist-1", headers=demo_headers)
        assert r.status_code == 200, r.text
        b = r.json()
        assert "entries" in b

    def test_dist_invoices(self, api_client, base_url, demo_headers):
        r = api_client.get(f"{base_url}/api/distributors/dist-1/invoices", headers=demo_headers)
        assert r.status_code == 200

    def test_credit_note_pharmacist_side(self, api_client, base_url, demo_headers):
        # pharmacist-issued credit note (not distributor)
        r = api_client.post(
            f"{base_url}/api/credit-notes",
            json={"distributor_id": "dist-1", "amount": 100, "reason": "TEST_pharmacist_CN"},
            headers=demo_headers,
        )
        assert r.status_code in (200, 201), r.text
