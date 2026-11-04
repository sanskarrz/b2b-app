# Iteration 17 edge probes: concurrent approve, out-of-parties collection, pending over-collection
import os
import sys
import threading
sys.path.insert(0, "/app/backend/tests")
from test_iteration17_distributor_ops import API, H, _otp, _pw, _cc, MDB  # noqa
import requests

own, sal = _otp("owner@rxtech.com", "distributor"), _pw("sales@rxtech.com")
# 1. out of parties (cust-3 Ghatkopar not in fs-1 areas)
ids = {x["id"] for x in requests.get(f"{API}/field/customers", headers=H(sal)).json()}
print("cust-3 visible to sales:", "cust-3" in ids)
r = requests.get(f"{API}/field/customers/cust-3/bills", headers=H(sal))
print("bills for out-of-party cust-3:", r.status_code, len(r.json()) if r.ok else r.text)
# 2. concurrent approve
c = requests.post(f"{API}/field/collections", headers=H(sal), json={"customer_id": "cust-2", "amount": 3, "mode": "cash", "remarks": "TEST_race"}).json()
cc0 = _cc("cust-2")["credit_used"]
res = []
ts = [threading.Thread(target=lambda: res.append(requests.post(f"{API}/distributor/me/field-collections/{c['id']}/approve", headers=H(own)).status_code)) for _ in range(3)]
[t.start() for t in ts]
[t.join() for t in ts]
print("concurrent approve codes:", res, "credit_used drop:", round(cc0 - _cc("cust-2")["credit_used"], 2), "(expected 3)")
# 3. pending sum > dues
open_amt = sum(b["amount_open"] for b in requests.get(f"{API}/field/customers/cust-2/bills", headers=H(sal)).json())
a = requests.post(f"{API}/field/collections", headers=H(sal), json={"customer_id": "cust-2", "amount": open_amt, "mode": "cash", "remarks": "TEST_over1"})
b = requests.post(f"{API}/field/collections", headers=H(sal), json={"customer_id": "cust-2", "amount": open_amt, "mode": "cash", "remarks": "TEST_over2"})
print("two full-due pending collections accepted:", a.status_code, b.status_code)
for x in (a, b):
    if x.ok:
        requests.post(f"{API}/distributor/me/field-collections/{x.json()['id']}/reject", headers=H(own), json={"reason": "TEST_cleanup"})
# 4. owner without ops roles posting a collection
r = requests.get(f"{API}/field/customers/cust-2/bills", headers=H(own))
print("owner (no ops roles) field bills:", r.status_code)
