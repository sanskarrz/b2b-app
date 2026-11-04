"""
RX Tech — Distributor panel change requirements (Jun 2026).

1. Payment activity per retailer (Received / Partially Received / Pending)
4. Statement with bill-wise dues that reconcile with outstanding
5. Owner operational roles (field sales / delivery) on the same login
6. "Set Parties" — staff see retailers in their areas + explicitly assigned retailers
7. Imported party / ledger data auto-matched to app retailers (+ manual link, exceptions)
8. Salesperson payment collection → distributor approval → smart bill allocation
9. Day-wise salesperson collection statement
"""
import re
import uuid
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from server import (
    db, get_current_user, get_owned_distributor, staff_distributor, now_utc, iso, cc_get,
    notify, logger, distributor_record_payment, RecordPaymentReq, IST, hash_password,
)

ops_router = APIRouter(prefix="/api")
PAY_MODES = {"cash", "upi", "neft", "cheque", "card", "other"}


def _digits(s) -> str:
    return re.sub(r"\D", "", str(s or ""))[-10:]


def _nm(s) -> str:
    s = re.sub(r"[^a-z0-9]", "", str(s or "").lower())
    for w in ("medicalstores", "medicalstore", "medicals", "medical", "pharmacy", "chemists", "chemist", "drugstore", "stores", "store"):
        s = s.replace(w, "")
    return s


# ============================================================
# Bills (shared by payment activity, statement, field collections)
# ============================================================
async def dist_bills(did: str, user_id: Optional[str] = None) -> List[dict]:
    q = {"distributor_id": did}
    if user_id:
        q["user_id"] = user_id
    pays = await db.payments.find(q, {"_id": 0}).to_list(20000)
    by: dict = {}
    for p in pays:
        code = (p.get("invoice_code") or "").replace("-PART", "")
        b = by.setdefault((p["user_id"], code), {
            "bill_id": None, "bill_number": code, "user_id": p["user_id"], "amount_open": 0.0, "amount_paid": 0.0,
            "due_date": p.get("due_date"), "created_at": p.get("created_at") or p.get("due_date"), "events": [],
        })
        part = (p.get("invoice_code") or "").endswith("-PART")
        if part or p["status"] == "paid":
            b["amount_paid"] += p["amount"]
            b["events"].append({"amount": round(p["amount"], 2), "date": p.get("paid_at") or p.get("due_date"),
                                "mode": (p.get("pay_method") or "cash"), "by": p.get("collected_by_name")})
        else:
            b["amount_open"] += p["amount"]
        if not part:
            b["bill_id"] = p["id"]
            b["status_raw"] = p["status"]
            b["order_id"] = p.get("order_id")
    out = []
    for b in by.values():
        if not b["bill_id"]:
            continue
        b["amount_open"], b["amount_paid"] = round(b["amount_open"], 2), round(b["amount_paid"], 2)
        b["amount_total"] = round(b["amount_open"] + b["amount_paid"], 2)
        b["state"] = "received" if b["amount_open"] <= 0.005 else ("partial" if b["amount_paid"] > 0 else "pending")
        b["overdue"] = b.get("status_raw") == "overdue"
        b["events"].sort(key=lambda e: e["date"] or "", reverse=True)
        b["last_paid_at"] = b["events"][0]["date"] if b["events"] else None
        b["last_mode"] = b["events"][0]["mode"] if b["events"] else None
        out.append(b)
    out.sort(key=lambda b: b.get("due_date") or "", reverse=True)
    return out


async def _names(uids) -> dict:
    us = await db.users.find({"id": {"$in": list(set(uids))}}, {"_id": 0, "id": 1, "shop_name": 1, "name": 1, "email": 1, "phone": 1, "area": 1, "address": 1, "city": 1, "pincode": 1}).to_list(5000)
    return {u["id"]: u for u in us}


def _uname(u: dict) -> str:
    return u.get("shop_name") or u.get("name") or u.get("email") or "—"


@ops_router.get("/distributor/me/payment-activity")
async def payment_activity(status: Optional[str] = None, q: Optional[str] = None, user: dict = Depends(get_current_user)):
    d = await get_owned_distributor(user)
    bills = await dist_bills(d["id"])
    names = await _names([b["user_id"] for b in bills])
    for b in bills:
        b["customer_name"] = _uname(names.get(b["user_id"], {}))
    counts = {k: sum(1 for b in bills if b["state"] == k) for k in ("received", "partial", "pending")}
    totals = {"due": round(sum(b["amount_total"] for b in bills), 2), "received": round(sum(b["amount_paid"] for b in bills), 2),
              "balance": round(sum(b["amount_open"] for b in bills), 2)}
    if status in ("received", "partial", "pending"):
        bills = [b for b in bills if b["state"] == status]
    if q:
        ql = q.lower()
        bills = [b for b in bills if ql in b["customer_name"].lower() or ql in b["bill_number"].lower()]
    pend = await db.field_collections.count_documents({"distributor_id": d["id"], "status": "pending_approval"})
    return {"items": bills[:500], "counts": counts, "totals": totals, "field_pending": pend}


# ============================================================
# Statement — bill-wise dues, receipts, outstanding (reconciled)
# ============================================================
@ops_router.get("/distributor/me/customers/{cust_id}/statement")
async def statement(cust_id: str, user: dict = Depends(get_current_user)):
    d = await get_owned_distributor(user)
    cust = await db.users.find_one({"id": cust_id}, {"_id": 0})
    if not cust:
        raise HTTPException(404, "Customer not found")
    bills = await dist_bills(d["id"], cust_id)
    cc = await cc_get(d["id"], cust_id)
    cns = await db.credit_notes.find({"user_id": cust_id, "distributor_id": d["id"]}, {"_id": 0}).to_list(500)
    entries = []
    for b in bills:
        entries.append({"type": "bill", "ref": b["bill_number"], "label": f"Bill {b['bill_number']}", "date": b["created_at"] or b["due_date"],
                        "debit": b["amount_total"], "credit": 0})
        for e in b["events"]:
            entries.append({"type": "payment", "ref": b["bill_number"], "label": f"Payment received ({(e['mode'] or 'cash').upper()})",
                            "date": e["date"], "debit": 0, "credit": e["amount"]})
    entries.sort(key=lambda e: e["date"] or "")
    running = 0.0
    for e in entries:
        running += e["debit"] - e["credit"]
        e["balance"] = round(running, 2)
    billed = round(sum(b["amount_total"] for b in bills), 2)
    received = round(sum(b["amount_paid"] for b in bills), 2)
    bills_due = round(sum(b["amount_open"] for b in bills), 2)
    overdue = round(sum(b["amount_open"] for b in bills if b["overdue"]), 2)
    # Credit orders already charged to the credit line but not yet billed (bill is raised on delivery confirmation)
    codes = {b["bill_number"] for b in bills}
    unbilled = []
    async for o in db.orders.find({"distributor_id": d["id"], "user_id": cust_id, "payment_method": "credit",
                                   "status": {"$nin": ["cancelled", "rejected"]}}, {"_id": 0}):
        if (o.get("invoice_number") or o["code"]) not in codes and o["code"] not in codes:
            unbilled.append({"code": o["code"], "date": o["created_at"], "status": o.get("status"), "amount": round(o.get("total", 0), 2)})
    unbilled_total = round(sum(u["amount"] for u in unbilled), 2)
    outstanding = round(bills_due + unbilled_total, 2)
    return {
        "distributor": {"name": d.get("name") or d.get("short_name"), "short_name": d.get("short_name"), "gst": d.get("gst"),
                        "address": d.get("address") or d.get("location"), "phone": d.get("phone"), "location": d.get("location")},
        "customer": {"id": cust["id"], "name": _uname(cust), "contact_name": cust.get("name"), "phone": cust.get("phone"),
                     "address": cust.get("address"), "gst": cust.get("gst"), "drug_license": cust.get("drug_license")},
        "credit": {"credit_limit": cc.get("credit_limit", 0), "credit_used": round(cc.get("credit_used", 0), 2),
                   "credit_available": round(cc.get("credit_limit", 0) - cc.get("credit_used", 0), 2), "credit_days": cc.get("credit_days", 21)},
        "summary": {"total_billed": billed, "total_credited": received, "bills_due": bills_due, "unbilled_orders": unbilled_total,
                    "outstanding": outstanding, "overdue": overdue,
                    "closing_balance": outstanding, "entry_count": len(entries), "bill_count": len(bills)},
        "unbilled": unbilled,
        "bills": [{"bill_number": b["bill_number"], "date": b["created_at"], "due_date": b["due_date"], "amount": b["amount_total"],
                   "received": b["amount_paid"], "balance": b["amount_open"], "state": b["state"], "overdue": b["overdue"]} for b in bills],
        "credit_notes": [{"code": c.get("code"), "reason": c.get("reason"), "amount": c.get("amount"), "date": c.get("created_at")} for c in cns],
        "entries": entries, "generated_at": iso(now_utc()),
    }


async def statement_numbers(did: str, cust_id: str) -> dict:
    bills = await dist_bills(did, cust_id)
    codes = {b["bill_number"] for b in bills}
    bills_due = sum(b["amount_open"] for b in bills)
    unbilled = 0.0
    async for o in db.orders.find({"distributor_id": did, "user_id": cust_id, "payment_method": "credit",
                                   "status": {"$nin": ["cancelled", "rejected"]}}, {"_id": 0, "code": 1, "invoice_number": 1, "total": 1}):
        if (o.get("invoice_number") or o["code"]) not in codes and o["code"] not in codes:
            unbilled += o.get("total", 0) or 0
    return {"bills_due": round(bills_due, 2), "unbilled": round(unbilled, 2), "outstanding": round(bills_due + unbilled, 2)}


# ============================================================
# Owner operational roles
# ============================================================
class OpsRolesReq(BaseModel):
    roles: List[str]


@ops_router.patch("/distributor/me/ops-roles")
async def set_ops_roles(req: OpsRolesReq, user: dict = Depends(get_current_user)):
    if user.get("role") != "owner":
        raise HTTPException(403, "Only the owner can do this")
    roles = sorted({r for r in req.roles if r in ("field_sales", "delivery")})
    await db.users.update_one({"id": user["id"]}, {"$set": {"ops_roles": roles}})
    return {"success": True, "ops_roles": roles}


# ============================================================
# Set Parties — areas + explicitly assigned retailers per staff
# ============================================================
class PartiesReq(BaseModel):
    areas: List[str] = []
    party_ids: List[str] = []


async def _dist_customer_ids(did: str) -> List[str]:
    ids = {m["user_id"] for m in await db.mappings.find({"distributor_id": did, "status": "mapped"}, {"_id": 0, "user_id": 1}).to_list(5000)}
    ids |= {r["_id"] for r in await db.orders.aggregate([{"$match": {"distributor_id": did}}, {"$group": {"_id": "$user_id"}}]).to_list(5000)}
    return list(ids)


def _in_parties(u: dict, areas: List[str], party_ids: List[str]) -> bool:
    if u["id"] in party_ids:
        return True
    hay = " ".join(str(u.get(k) or "") for k in ("area", "address", "city", "pincode")).lower()
    return any(a.lower() in hay for a in areas if a)


async def staff_party_filter(user: dict):
    """Returns None (no restriction) or a predicate for retailers this staff member covers."""
    if user.get("role") not in ("field_sales", "delivery"):
        return None
    areas, pids = user.get("areas") or [], user.get("party_ids") or []
    if not areas and not pids:
        return None
    return lambda u: _in_parties(u, areas, pids)


@ops_router.patch("/distributor/me/staff/{staff_id}/parties")
async def set_parties(staff_id: str, req: PartiesReq, user: dict = Depends(get_current_user)):
    d = await staff_distributor(user, {"owner", "manager"})
    s = await db.users.find_one({"id": staff_id, "$or": [{"distributor_id": d["id"]}, {"owned_distributor_id": d["id"]}]}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Team member not found")
    areas = sorted({a.strip() for a in req.areas if a and a.strip()}, key=str.lower)
    await db.users.update_one({"id": staff_id}, {"$set": {"areas": areas, "party_ids": list(dict.fromkeys(req.party_ids))}})
    return {"success": True, "areas": areas, "party_ids": req.party_ids}


@ops_router.get("/distributor/me/staff/{staff_id}/parties")
async def get_parties(staff_id: str, user: dict = Depends(get_current_user)):
    d = await staff_distributor(user, {"owner", "manager"})
    s = await db.users.find_one({"id": staff_id, "$or": [{"distributor_id": d["id"]}, {"owned_distributor_id": d["id"]}]}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Team member not found")
    names = await _names(await _dist_customer_ids(d["id"]))
    areas, pids = s.get("areas") or [], s.get("party_ids") or []
    rows = [{"id": u["id"], "name": _uname(u), "area": u.get("area") or u.get("address"),
             "hay": " ".join(str(u.get(k) or "") for k in ("area", "address", "city", "pincode")),
             "assigned": u["id"] in pids, "in_area": _in_parties(u, areas, [])} for u in names.values()]
    rows.sort(key=lambda r: r["name"].lower())
    return {"areas": areas, "party_ids": pids, "customers": rows,
            "visible_count": sum(1 for r in rows if r["assigned"] or r["in_area"]) if (areas or pids) else len(rows)}


# ============================================================
# Field collections (salesperson → distributor approval)
# ============================================================
class FieldCollectReq(BaseModel):
    customer_id: str
    amount: float
    mode: str = "cash"
    reference: Optional[str] = None
    remarks: Optional[str] = None
    bill_ids: List[str] = []


def _field_user(user: dict):
    r = user.get("role")
    if r in ("field_sales", "manager") or (r == "owner" and "field_sales" in (user.get("ops_roles") or [])):
        return
    raise HTTPException(403, "Only sales team members can record collections")


async def _check_party(user: dict, cust_id: str):
    pf = await staff_party_filter(user)
    u = await db.users.find_one({"id": cust_id}, {"_id": 0})
    if not u or (pf and not pf(u)):
        raise HTTPException(403, "This retailer is not in your parties")


@ops_router.get("/field/customers/{cust_id}/bills")
async def field_customer_bills(cust_id: str, user: dict = Depends(get_current_user)):
    _field_user(user)
    d = await staff_distributor(user, {"owner", "manager", "field_sales"})
    await _check_party(user, cust_id)
    return [b for b in await dist_bills(d["id"], cust_id) if b["state"] != "received"]


@ops_router.post("/field/collections")
async def field_collect(req: FieldCollectReq, user: dict = Depends(get_current_user)):
    _field_user(user)
    d = await staff_distributor(user, {"owner", "manager", "field_sales"})
    if req.amount <= 0:
        raise HTTPException(400, "Enter the amount collected")
    if req.mode not in PAY_MODES:
        raise HTTPException(400, "Pick a payment mode")
    if req.mode != "cash" and not (req.reference or "").strip():
        raise HTTPException(400, "Add the UTR / cheque / reference number for non-cash payments")
    await _check_party(user, req.customer_id)
    cust = await db.users.find_one({"id": req.customer_id}, {"_id": 0})
    open_amt = sum(b["amount_open"] for b in await dist_bills(d["id"], req.customer_id))
    pend = sum(c["amount"] for c in await db.field_collections.find(
        {"distributor_id": d["id"], "customer_id": req.customer_id, "status": "pending_approval"}, {"_id": 0, "amount": 1}).to_list(500))
    if req.amount > open_amt - pend + 0.5:
        raise HTTPException(400, f"Amount is more than the retailer's open dues (₹{max(0, open_amt - pend):,.0f} left after pending collections)")
    doc = {"id": str(uuid.uuid4()), "code": f"COL-{uuid.uuid4().hex[:6].upper()}", "distributor_id": d["id"],
           "salesperson_id": user["id"], "salesperson_name": user.get("name") or user.get("email"),
           "customer_id": cust["id"], "customer_name": _uname(cust), "amount": round(req.amount, 2), "mode": req.mode,
           "reference": (req.reference or "").strip() or None, "remarks": (req.remarks or "").strip() or None,
           "bill_ids": req.bill_ids, "status": "pending_approval", "collected_at": iso(now_utc()), "allocations": []}
    await db.field_collections.insert_one({**doc})
    doc.pop("_id", None)
    await notify("Collection awaiting approval", f"{doc['salesperson_name']} collected ₹{doc['amount']:,.0f} ({req.mode.upper()}) from {doc['customer_name']}",
                 distributor_id=d["id"], kind="payment", link="/d/collections?tab=field")
    return doc


@ops_router.get("/field/collections")
async def my_collections(user: dict = Depends(get_current_user)):
    return await db.field_collections.find({"salesperson_id": user["id"]}, {"_id": 0}).sort("collected_at", -1).to_list(300)


@ops_router.get("/distributor/me/field-collections")
async def list_field_collections(status: Optional[str] = None, user: dict = Depends(get_current_user)):
    d = await staff_distributor(user, {"owner", "manager"})
    q = {"distributor_id": d["id"]}
    if status:
        q["status"] = status
    return await db.field_collections.find(q, {"_id": 0}).sort("collected_at", -1).to_list(500)


def _allocate(bills: List[dict], amount: float, preferred: List[str]) -> List[tuple]:
    """Smart bill matching: chosen bills first → a single bill with the exact
    amount → oldest due first. Returns [(bill, amount)]."""
    open_b = [b for b in bills if b["amount_open"] > 0.005]
    chosen = [b for b in open_b if b["bill_id"] in preferred]
    if not chosen:
        exact = [b for b in open_b if abs(b["amount_open"] - amount) < 0.5]
        if exact:
            return [(exact[0], amount)]
    rest = sorted([b for b in open_b if b not in chosen], key=lambda b: (b.get("due_date") or "", b["bill_number"]))
    out, left = [], amount
    for b in chosen + rest:
        if left <= 0.005:
            break
        take = min(left, b["amount_open"])
        out.append((b, round(take, 2)))
        left -= take
    return out


class DecideReq(BaseModel):
    reason: Optional[str] = None


@ops_router.post("/distributor/me/field-collections/{cid}/approve")
async def approve_collection(cid: str, user: dict = Depends(get_current_user)):
    d = await staff_distributor(user, {"owner", "manager"})
    c = await db.field_collections.find_one_and_update({"id": cid, "distributor_id": d["id"], "status": "pending_approval"},
                                                       {"$set": {"status": "processing"}}, projection={"_id": 0})
    if not c:
        raise HTTPException(400, "This collection is not awaiting approval")
    plan = _allocate(await dist_bills(d["id"], c["customer_id"]), c["amount"], c.get("bill_ids") or [])
    if not plan:
        await db.field_collections.update_one({"id": cid}, {"$set": {"status": "pending_approval"}})
        raise HTTPException(400, "The retailer has no open bills to settle")
    started = iso(now_utc())
    method = c["mode"] if c["mode"] in ("cash", "upi", "cheque", "neft") else "neft"
    allocs = []
    try:
        for b, amt in plan:
            await distributor_record_payment(b["bill_id"], RecordPaymentReq(amount=amt, method=method), user)
            allocs.append({"bill_id": b["bill_id"], "bill_number": b["bill_number"], "amount": amt})
    except Exception as e:
        # never leave it stuck in "processing" — back to the queue with what was settled so far
        await db.field_collections.update_one({"id": cid}, {"$set": {"status": "pending_approval" if not allocs else "approved",
                                                                     "allocations": allocs, "error": str(getattr(e, "detail", e))}})
        raise HTTPException(400, f"Could not settle all bills: {getattr(e, 'detail', e)}")
    # tag the receipts with who collected them
    codes = [a["bill_number"] for a in allocs]
    await db.payments.update_many({"distributor_id": d["id"], "user_id": c["customer_id"], "paid_at": {"$gte": started},
                                   "invoice_code": {"$in": codes + [x + "-PART" for x in codes]}},
                                  {"$set": {"collected_by_name": c["salesperson_name"], "field_collection_id": cid}})
    unalloc = round(c["amount"] - sum(a["amount"] for a in allocs), 2)
    await db.field_collections.update_one({"id": cid}, {"$set": {
        "status": "approved", "allocations": allocs, "unallocated": unalloc, "decided_at": iso(now_utc()), "decided_by": user.get("name")}})
    await notify("Collection approved", f"₹{c['amount']:,.0f} from {c['customer_name']} confirmed as received ({', '.join(codes)})",
                 user_id=c["salesperson_id"], kind="payment", link="/field/collect")
    return {"success": True, "allocations": allocs, "unallocated": unalloc}


@ops_router.post("/distributor/me/field-collections/{cid}/reject")
async def reject_collection(cid: str, req: DecideReq, user: dict = Depends(get_current_user)):
    d = await staff_distributor(user, {"owner", "manager"})
    res = await db.field_collections.update_one({"id": cid, "distributor_id": d["id"], "status": "pending_approval"},
                                                {"$set": {"status": "rejected", "reject_reason": (req.reason or None), "decided_at": iso(now_utc()), "decided_by": user.get("name")}})
    if not res.matched_count:
        raise HTTPException(400, "This collection is not awaiting approval")
    c = await db.field_collections.find_one({"id": cid}, {"_id": 0})
    await notify("Collection not received", f"₹{c['amount']:,.0f} from {c['customer_name']} was marked not received" + (f": {req.reason}" if req.reason else ""),
                 user_id=c["salesperson_id"], kind="payment", link="/field/collect")
    return {"success": True}


@ops_router.get("/distributor/me/field-collections/statement")
async def collection_statement(days: int = 14, salesperson_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    """Day-wise per salesperson: collected (submitted) / approved (received) / pending / rejected."""
    d = await staff_distributor(user, {"owner", "manager"})
    since = iso(now_utc() - timedelta(days=max(1, min(days, 90))))
    q = {"distributor_id": d["id"], "collected_at": {"$gte": since}}
    if salesperson_id:
        q["salesperson_id"] = salesperson_id
    rows = await db.field_collections.find(q, {"_id": 0}).to_list(5000)
    by: dict = {}
    for c in rows:
        day = datetime.fromisoformat(c["collected_at"].replace("Z", "+00:00")).astimezone(IST).strftime("%Y-%m-%d")
        k = (day, c["salesperson_id"])
        r = by.setdefault(k, {"date": day, "salesperson_id": c["salesperson_id"], "salesperson_name": c["salesperson_name"],
                              "collected": 0.0, "approved": 0.0, "pending": 0.0, "rejected": 0.0, "cash": 0.0, "online": 0.0, "count": 0})
        r["collected"] += c["amount"]
        r["count"] += 1
        r["cash" if c["mode"] == "cash" else "online"] += c["amount"]
        r[{"approved": "approved", "rejected": "rejected"}.get(c["status"], "pending")] += c["amount"]
    out = []
    for r in by.values():
        for k in ("collected", "approved", "pending", "rejected", "cash", "online"):
            r[k] = round(r[k], 2)
        r["difference"] = round(r["collected"] - r["approved"] - r["rejected"], 2)
        out.append(r)
    out.sort(key=lambda r: (r["date"], r["salesperson_name"]), reverse=True)
    tot = {k: round(sum(r[k] for r in out), 2) for k in ("collected", "approved", "pending", "rejected")}
    return {"rows": out, "totals": tot}


# ============================================================
# Imported data (Drive / files) ↔ app retailers
# ============================================================
async def match_parties(did: str) -> dict:
    uids = await _dist_customer_ids(did)
    users = list((await _names(uids)).values())
    full = {u["id"]: u for u in await db.users.find({"id": {"$in": uids}}, {"_id": 0, "id": 1, "gst": 1, "phone": 1, "shop_name": 1, "name": 1}).to_list(5000)}
    by_gst = {str(full[u["id"]].get("gst") or "").upper(): u["id"] for u in users if full.get(u["id"], {}).get("gst")}
    by_ph = {_digits(u.get("phone")): u["id"] for u in users if len(_digits(u.get("phone"))) == 10}
    by_nm = {_nm(_uname(u)): u["id"] for u in users if _nm(_uname(u))}
    matched = 0
    async for p in db.dist_parties.find({"distributor_id": did, "link_method": {"$ne": "manual"}}, {"_id": 0}):
        uid, how = None, None
        if p.get("gstin") and str(p["gstin"]).upper() in by_gst:
            uid, how = by_gst[str(p["gstin"]).upper()], "gst"
        elif len(_digits(p.get("phone"))) == 10 and _digits(p.get("phone")) in by_ph:
            uid, how = by_ph[_digits(p.get("phone"))], "phone"
        elif _nm(p.get("name")) in by_nm:
            uid, how = by_nm[_nm(p.get("name"))], "name"
        await db.dist_parties.update_one({"id": p["id"]}, {"$set": {"linked_user_id": uid, "link_method": how}})
        matched += 1 if uid else 0
    return {"matched": matched}


async def _party_links(did: str) -> dict:
    """normalized party name / code → user_id"""
    out = {}
    async for p in db.dist_parties.find({"distributor_id": did, "linked_user_id": {"$ne": None}}, {"_id": 0, "name": 1, "code": 1, "linked_user_id": 1}):
        out[_nm(p.get("name"))] = p["linked_user_id"]
        if p.get("code"):
            out[_nm(p["code"])] = p["linked_user_id"]
    return out


@ops_router.get("/distributor/me/sync/matching")
async def sync_matching(user: dict = Depends(get_current_user)):
    d = await get_owned_distributor(user)
    await match_parties(d["id"])
    parties = await db.dist_parties.find({"distributor_id": d["id"]}, {"_id": 0, "id": 1, "name": 1, "code": 1, "phone": 1, "gstin": 1, "area": 1, "city": 1, "linked_user_id": 1, "link_method": 1, "balance": 1}).to_list(5000)
    links = await _party_links(d["id"])
    ledger_unmatched = await db.dist_ledger.count_documents({"distributor_id": d["id"]})
    unmatched_rows = 0
    async for l in db.dist_ledger.find({"distributor_id": d["id"]}, {"_id": 0, "party": 1}):
        if _nm(l.get("party")) not in links:
            unmatched_rows += 1
    names = await _names([p["linked_user_id"] for p in parties if p.get("linked_user_id")])
    for p in parties:
        p["linked_name"] = _uname(names[p["linked_user_id"]]) if p.get("linked_user_id") in names else None
    custs = await _names(await _dist_customer_ids(d["id"]))
    return {"matched": [p for p in parties if p.get("linked_user_id")], "exceptions": [p for p in parties if not p.get("linked_user_id")],
            "ledger_rows": ledger_unmatched, "ledger_unmatched": unmatched_rows,
            "customers": sorted([{"id": u["id"], "name": _uname(u)} for u in custs.values()], key=lambda x: x["name"].lower())}


class LinkReq(BaseModel):
    party_id: str
    user_id: Optional[str] = None  # None = unlink


@ops_router.post("/distributor/me/sync/link")
async def sync_link(req: LinkReq, user: dict = Depends(get_current_user)):
    d = await get_owned_distributor(user)
    if req.user_id and req.user_id not in await _dist_customer_ids(d["id"]):
        raise HTTPException(400, "Pick one of your customers")
    res = await db.dist_parties.update_one({"id": req.party_id, "distributor_id": d["id"]},
                                           {"$set": {"linked_user_id": req.user_id, "link_method": "manual" if req.user_id else None}})
    if not res.matched_count:
        raise HTTPException(404, "Party not found")
    return {"success": True}


@ops_router.get("/distributor/me/customers/{cust_id}/system-data")
async def customer_system_data(cust_id: str, user: dict = Depends(get_current_user)):
    """Imported (Drive / file) data for this retailer: party master, purchases, payments + stock of items they buy."""
    d = await get_owned_distributor(user)
    await match_parties(d["id"])
    parties = await db.dist_parties.find({"distributor_id": d["id"], "linked_user_id": cust_id}, {"_id": 0}).to_list(20)
    keys = {_nm(p.get("name")) for p in parties} | {_nm(p.get("code")) for p in parties if p.get("code")}
    purchases, payments = [], []
    if keys:
        async for l in db.dist_ledger.find({"distributor_id": d["id"]}, {"_id": 0}):
            if _nm(l.get("party")) not in keys:
                continue
            t = (l.get("type") or "").lower()
            is_pay = (l.get("credit") or 0) > 0 or any(w in t for w in ("receipt", "payment", "rcpt", "collection"))
            (payments if is_pay else purchases).append({"date": l.get("date"), "voucher": l.get("voucher"), "type": l.get("type"),
                                                       "amount": abs(l.get("credit") or 0) if is_pay else abs(l.get("debit") or l.get("amount") or 0)})
    # stock of products this retailer orders from us
    pids = {}
    async for o in db.orders.find({"distributor_id": d["id"], "user_id": cust_id}, {"_id": 0, "items": 1}):
        for it in o.get("items") or []:
            pids[it["product_id"]] = pids.get(it["product_id"], 0) + (it.get("qty") or 0)
    stock = []
    for p in await db.products.find({"id": {"$in": list(pids)[:200]}}, {"_id": 0, "id": 1, "name": 1, "pack": 1, "prices": 1}).to_list(200):
        pr = next((x for x in p.get("prices") or [] if x["distributor_id"] == d["id"]), {})
        stock.append({"name": p["name"], "pack": p.get("pack"), "qty_available": pr.get("qty_available", 0), "ordered_qty": pids[p["id"]]})
    stock.sort(key=lambda s: -s["ordered_qty"])
    return {"parties": [{k: p.get(k) for k in ("name", "code", "phone", "gstin", "area", "city", "balance", "credit_limit", "link_method")} for p in parties],
            "purchases": purchases[-100:][::-1], "payments": payments[-100:][::-1], "stock": stock[:50],
            "totals": {"purchases": round(sum(x["amount"] for x in purchases), 2), "payments": round(sum(x["amount"] for x in payments), 2)}}


# ============================================================
# Demo accounts (2–3 per role) — idempotent
# ============================================================
async def seed_demo_logins():
    try:
        pw = hash_password("Pass@123")
        for i, (did, area) in enumerate([("dist-3", "Ghatkopar"), ("dist-5", "Andheri")], start=2):
            if not await db.users.find_one({"email": f"owner{i}@rxtech.com"}):
                await db.users.insert_one({"id": f"owner-{i}", "email": f"owner{i}@rxtech.com", "name": f"Demo Owner {i}", "role": "owner",
                                           "owned_distributor_id": did, "distributor_id": did, "onboarded": True, "active": True, "created_at": iso(now_utc())})
        staff = [("mgr-2", "manager2@rxtech.com", "Rohit Shah", "manager", ["Thane"]),
                 ("fs-3", "sales3@rxtech.com", "Sneha Patil", "field_sales", ["Andheri", "Kurla"]),
                 ("dl-3", "delivery3@rxtech.com", "Ravi Kumar", "delivery", ["Ghatkopar"])]
        for sid, em, nm, role, areas in staff:
            if not await db.users.find_one({"email": em}):
                await db.users.insert_one({"id": sid, "email": em, "name": nm, "role": role, "password_hash": pw, "distributor_id": "dist-1",
                                           "owned_distributor_id": None, "onboarded": True, "active": True, "must_change_password": False,
                                           "areas": areas, "created_by": "owner-1", "created_at": iso(now_utc())})
        await db.users.update_one({"id": "fs-1", "areas": {"$exists": False}}, {"$set": {"areas": ["Bhandup", "Mulund", "Thane"]}})
        await db.users.update_one({"id": "fs-2", "areas": {"$exists": False}}, {"$set": {"areas": ["Ghatkopar", "Kurla"]}})
        # cust-1..4 → loginable pharmacy demos with areas
        for cid, area in (("cust-1", "Bhandup"), ("cust-2", "Mulund"), ("cust-3", "Ghatkopar"), ("cust-4", "Kurla")):
            await db.users.update_one({"id": cid, "area": None}, {"$set": {"area": area}})
        # sample imported party / ledger rows for dist-1 so matching + exceptions can be seen
        if not await db.dist_parties.find_one({"distributor_id": "dist-1", "sample": True}):
            stamp = iso(now_utc())
            for code, name, ph in (("P001", "APOLLO MEDICAL STORE", None), ("P002", "Wellness Pharmacy", None), ("P009", "Shree Ganesh Medical", "9812345678")):
                await db.dist_parties.insert_one({"id": str(uuid.uuid4()), "distributor_id": "dist-1", "dedupe_key": code, "code": code, "name": name,
                                                  "phone": ph, "balance": 0, "credit_limit": 0, "created_at": stamp, "updated_at": stamp, "sample": True})
            for i, (party, typ, dr, cr) in enumerate((("APOLLO MEDICAL STORE", "Sales", 15400, 0), ("APOLLO MEDICAL STORE", "Receipt", 0, 15400),
                                                       ("Wellness Pharmacy", "Sales", 8200, 0), ("Shree Ganesh Medical", "Sales", 5100, 0))):
                await db.dist_ledger.insert_one({"id": str(uuid.uuid4()), "distributor_id": "dist-1", "dedupe_key": f"sample-{i}", "party": party,
                                                 "type": typ, "voucher": f"V-{1001 + i}", "date": (now_utc() - timedelta(days=10 - i)).strftime("%d-%m-%Y"),
                                                 "debit": dr, "credit": cr, "amount": dr - cr, "created_at": stamp, "updated_at": stamp, "sample": True})
        # one-time: credit_used = open bills + unbilled credit orders (makes every screen agree)
        if not await db.migrations.find_one({"id": "credit_reconcile_v1"}):
            async for cc in db.customer_credit.find({}, {"_id": 0, "distributor_id": 1, "user_id": 1}):
                s = await statement_numbers(cc["distributor_id"], cc["user_id"])
                await db.customer_credit.update_one({"distributor_id": cc["distributor_id"], "user_id": cc["user_id"]},
                                                    {"$set": {"credit_used": s["outstanding"]}})
            await db.migrations.insert_one({"id": "credit_reconcile_v1", "at": iso(now_utc())})
    except Exception as e:
        logger.warning(f"demo login seed skipped: {e}")
