"""
RX Tech — Client-requested distributor & pharmacist features.

Implements (demo-grade but real DB-backed):
 1. OTP for cash collection (delivery)
 2/5. Disputes / Query management (wrong supply, returns, credit, other)
 3. Salesman (staff) chat with office
 4. Salesman can take orders on behalf of a customer
 6. Blacklist customer (blocks ordering)
 7. Barcode lookup + auto-assign barcodes
 8. Area auto-assign (deliveries + leads)
 9. Margin on sell (surfaced in field order taking)
 10. Cash discount in order (existing CD + extra CD + offer %)
 11. Update stock with damage / expiry
 12. Item details: remaining stock + all delivery photos
 13. Auto-accept orders when customer has no overdue
 14. Area & time-wise auto bill generation
"""
import random
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Body
from pydantic import BaseModel

from server import (
    db, get_current_user, get_owned_distributor, staff_distributor, require_role,
    now_utc, iso, cc_get, cc_inc, is_blacklisted, maybe_auto_accept, notify,
)

feature_router = APIRouter(prefix="/api")

# Client issue categories (flag / query ticket) + legacy types kept for old data
ISSUE_CATEGORIES = {"damaged_goods", "wrong_supply", "extra_supply", "no_supply", "rate_scheme"}
DISPUTE_TYPES = ISSUE_CATEGORIES | {"return", "credit", "other"}
CATEGORY_LABELS = {
    "damaged_goods": "Damaged Goods", "wrong_supply": "Wrong Supply", "extra_supply": "Extra Supply",
    "no_supply": "No Supply", "rate_scheme": "Rate/Scheme Issue", "return": "Return", "credit": "Credit", "other": "Other",
}
STOCK_REASONS = {"damage", "expiry", "correction", "theft"}
STATUS_TEXT = {"open": "Open", "in_progress": "In progress", "resolved": "Resolved", "rejected": "Rejected"}


async def _dist_any(user: dict) -> dict:
    """Distributor for any staff role (owner/manager/field_sales/delivery)."""
    return await staff_distributor(user, {"owner", "manager", "field_sales", "delivery"})


async def _dist_manage(user: dict) -> dict:
    """Owner/manager only (operational management)."""
    return await staff_distributor(user, {"owner", "manager"})


def _gen_code(prefix: str) -> str:
    return f"{prefix}-{random.randint(10000, 99999)}"


# ============================================================
# 13. Distributor settings (auto-accept, default CD) + 6. blacklist
# ============================================================
class SettingsReq(BaseModel):
    auto_accept_no_overdue: Optional[bool] = None
    cd_default_pct: Optional[float] = None
    extra_cd_pct: Optional[float] = None


def _settings_out(d: dict) -> dict:
    s = d.get("settings") or {}
    return {
        "auto_accept_no_overdue": bool(s.get("auto_accept_no_overdue", False)),
        "cd_default_pct": float(s.get("cd_default_pct", 0)),
        "extra_cd_pct": float(s.get("extra_cd_pct", 0)),
    }


@feature_router.get("/distributor/me/settings")
async def get_settings(user: dict = Depends(get_current_user)):
    d = await _dist_any(user)
    return _settings_out(d)


@feature_router.patch("/distributor/me/settings")
async def update_settings(req: SettingsReq, user: dict = Depends(get_current_user)):
    d = await _dist_manage(user)
    s = d.get("settings") or {}
    if req.auto_accept_no_overdue is not None:
        s["auto_accept_no_overdue"] = bool(req.auto_accept_no_overdue)
    if req.cd_default_pct is not None:
        s["cd_default_pct"] = max(0.0, float(req.cd_default_pct))
    if req.extra_cd_pct is not None:
        s["extra_cd_pct"] = max(0.0, float(req.extra_cd_pct))
    await db.distributors.update_one({"id": d["id"]}, {"$set": {"settings": s}})
    d2 = await db.distributors.find_one({"id": d["id"]}, {"_id": 0})
    return _settings_out(d2)


class BlacklistReq(BaseModel):
    blacklisted: bool
    reason: Optional[str] = None


@feature_router.patch("/distributor/me/customers/{cust_id}/blacklist")
async def set_blacklist(cust_id: str, req: BlacklistReq, user: dict = Depends(get_current_user)):
    d = await _dist_manage(user)
    if not await db.users.find_one({"id": cust_id}, {"_id": 0}):
        raise HTTPException(404, "Customer not found")
    await cc_get(d["id"], cust_id)  # ensure record
    await db.customer_credit.update_one(
        {"distributor_id": d["id"], "user_id": cust_id},
        {"$set": {"blacklisted": bool(req.blacklisted), "blacklist_reason": (req.reason or None),
                  "blacklisted_at": iso(now_utc()) if req.blacklisted else None}},
    )
    return {"success": True, "blacklisted": bool(req.blacklisted)}


# ============================================================
# 1. Cash collection OTP (delivery)
# ============================================================
@feature_router.post("/delivery/orders/{order_id}/cash-otp")
async def gen_cash_otp(order_id: str, user: dict = Depends(get_current_user)):
    require_role(user, {"delivery"})
    o = await db.orders.find_one({"id": order_id, "assigned_to": user["id"]}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Delivery not found")
    if o.get("payment_method") != "cash":
        raise HTTPException(400, "This order is on credit — no cash OTP needed")
    otp = f"{random.randint(100000, 999999)}"
    await db.orders.update_one({"id": order_id}, {"$set": {"cash_otp": otp, "cash_otp_at": iso(now_utc())}})
    # DEMO: return OTP so it can be shown in-app to the customer
    return {"success": True, "otp": otp, "amount": o.get("total", 0)}


# ============================================================
# 2 & 5. Disputes / Query management
# ============================================================
class DisputeReq(BaseModel):
    distributor_id: str
    type: str  # wrong_supply | return | credit | other
    title: str
    description: Optional[str] = None
    order_id: Optional[str] = None
    photos: Optional[List[str]] = None
    photo_file_ids: Optional[List[str]] = None
    audio_file_id: Optional[str] = None
    transcript: Optional[str] = None
    bill_ids: Optional[List[str]] = None
    bill_numbers: Optional[List[str]] = None
    mode: Optional[str] = None  # sellable | issue (returns)
    source: Optional[str] = None  # shortbook | returns | order | manual
    note_id: Optional[str] = None
    items: Optional[List[dict]] = None  # returned lines: {name, qty, price, amount, batch}


async def create_dispute_doc(req: DisputeReq, user: dict) -> dict:
    if req.type not in DISPUTE_TYPES:
        raise HTTPException(400, f"type must be one of {sorted(DISPUTE_TYPES)}")
    if not (req.title or "").strip():
        raise HTTPException(400, "Title is required")
    d = await db.distributors.find_one({"id": req.distributor_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Distributor not found")
    file_ids = list(req.photo_file_ids or []) + ([req.audio_file_id] if req.audio_file_id else [])
    if file_ids:  # let the distributor open the attachments
        await db.files.update_many({"id": {"$in": file_ids}, "owner_id": user["id"]},
                                   {"$addToSet": {"shared_with": req.distributor_id}})
    doc = {
        "category_label": CATEGORY_LABELS.get(req.type, req.type),
        "flagged": True,
        "photo_file_ids": req.photo_file_ids or [], "audio_file_id": req.audio_file_id,
        "transcript": (req.transcript or "").strip() or None,
        "bill_ids": req.bill_ids or [], "bill_numbers": req.bill_numbers or [],
        "mode": req.mode if req.mode in ("sellable", "issue") else None,
        "source": req.source or "manual", "note_id": req.note_id, "items": req.items or [],
        "id": str(uuid.uuid4()), "code": _gen_code("DSP"),
        "distributor_id": req.distributor_id, "distributor_name": d.get("short_name"),
        "user_id": user["id"], "customer_name": user.get("shop_name") or user.get("name") or user.get("email"),
        "type": req.type, "title": req.title.strip(),
        "description": (req.description or "").strip() or None,
        "order_id": req.order_id, "photos": req.photos or [],
        "status": "open", "resolution": None,
        "created_by": user["id"], "created_at": iso(now_utc()), "updated_at": iso(now_utc()),
        "activities": [{"at": iso(now_utc()), "by": "customer", "text": "Query raised"}],
    }
    await db.disputes.insert_one({**doc})
    await notify(f"New query flagged: {doc['category_label']}",
                 f"{doc['customer_name']} — {doc['title']}" + (f" (Bill {', '.join(doc['bill_numbers'])})" if doc["bill_numbers"] else ""),
                 distributor_id=req.distributor_id, kind="query", link="/d/queries")
    doc.pop("_id", None)
    return doc


@feature_router.post("/disputes")
async def create_dispute(req: DisputeReq, user: dict = Depends(get_current_user)):
    doc = await create_dispute_doc(req, user)
    return {"success": True, "dispute": doc}


@feature_router.post("/disputes/{dispute_id}/unflag")
async def unflag_dispute(dispute_id: str, user: dict = Depends(get_current_user)):
    """Only the party that raised the ticket may unflag it, and only after the
    distributor has resolved (or rejected) it."""
    disp = await db.disputes.find_one({"id": dispute_id}, {"_id": 0})
    if not disp or disp.get("created_by") != user["id"]:
        raise HTTPException(404, "Query not found")
    if disp.get("status") not in ("resolved", "rejected"):
        raise HTTPException(400, "You can unflag only after the distributor resolves this query")
    acts = disp.get("activities", []) + [{"at": iso(now_utc()), "by": "customer", "text": "Unflagged & closed by retailer"}]
    await db.disputes.update_one({"id": dispute_id}, {"$set": {
        "flagged": False, "status": "closed", "closed_at": iso(now_utc()), "updated_at": iso(now_utc()), "activities": acts}})
    await notify("Query closed", f"{disp.get('customer_name')} unflagged {disp.get('code')} — {disp.get('title')}",
                 distributor_id=disp["distributor_id"], kind="query", link="/d/queries")
    return {"success": True, "status": "closed"}


@feature_router.get("/disputes")
async def my_disputes(user: dict = Depends(get_current_user)):
    rows = await db.disputes.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(300)
    await _attach_linked_orders(rows)
    return rows


async def _attach_linked_orders(rows: List[dict]) -> None:
    """Resolve the order behind each query (direct order_id, or via its bill numbers)."""
    ids = {r["order_id"] for r in rows if r.get("order_id")}
    bills = {b for r in rows if not r.get("order_id") for b in (r.get("bill_numbers") or [])}
    if not ids and not bills:
        return
    orders = await db.orders.find(
        {"$or": [{"id": {"$in": list(ids)}}, {"invoice_number": {"$in": list(bills)}}, {"code": {"$in": list(bills)}}]},
        {"_id": 0, "id": 1, "code": 1, "invoice_number": 1, "distributor_id": 1, "user_id": 1}).to_list(1000)
    by_id = {o["id"]: o for o in orders}
    by_bill = {}
    for o in orders:
        for k in (o.get("invoice_number"), o.get("code")):
            if k:
                by_bill[(k, o["distributor_id"], o["user_id"])] = o
    for r in rows:
        o = by_id.get(r.get("order_id")) if r.get("order_id") else next(
            (by_bill.get((b, r["distributor_id"], r["user_id"])) for b in (r.get("bill_numbers") or [])
             if by_bill.get((b, r["distributor_id"], r["user_id"]))), None)
        if o:
            r["linked_order_id"], r["linked_order_code"] = o["id"], o.get("invoice_number") or o.get("code")


class QueryReplyReq(BaseModel):
    text: Optional[str] = None
    photo_file_ids: Optional[List[str]] = None


@feature_router.post("/disputes/{dispute_id}/reply")
async def pharmacy_reply(dispute_id: str, req: QueryReplyReq, user: dict = Depends(get_current_user)):
    """Pharmacy adds a message / photos to its own query thread."""
    disp = await db.disputes.find_one({"id": dispute_id, "user_id": user["id"]}, {"_id": 0})
    if not disp:
        raise HTTPException(404, "Query not found")
    if disp.get("status") == "closed":
        raise HTTPException(400, "This query is closed")
    text, photos = (req.text or "").strip(), req.photo_file_ids or []
    if not text and not photos:
        raise HTTPException(400, "Write a message or attach a photo")
    if photos:
        await db.files.update_many({"id": {"$in": photos}, "owner_id": user["id"]},
                                   {"$addToSet": {"shared_with": disp["distributor_id"]}})
    act = {"at": iso(now_utc()), "by": "customer", "author": disp.get("customer_name"), "text": text or "Photo attached", "photo_file_ids": photos}
    upd: dict = {"updated_at": iso(now_utc())}
    if disp.get("status") in ("resolved", "rejected"):  # retailer is not satisfied → reopen
        if disp.get("status") == "rejected" and disp.get("source") == "returns" and disp.get("order_id"):
            # reopening re-counts the returned qty — make sure it still fits what was received
            o = await db.orders.find_one({"id": disp["order_id"]}, {"_id": 0, "items": 1}) or {}
            used: dict = {}
            async for r in db.returns.find({"order_id": disp["order_id"], "user_id": user["id"], "status": {"$ne": "rejected"}}, {"_id": 0, "items": 1}):
                for it in r.get("items") or []:
                    used[it["line"]] = used.get(it["line"], 0) + it["qty"]
            lines = o.get("items") or []
            for it in disp.get("items") or []:
                ln = lines[it["line"]] if it["line"] < len(lines) else {}
                got = int(ln.get("qty") or 0) + int(ln.get("free_qty") or 0)
                if used.get(it["line"], 0) + it["qty"] > got:
                    raise HTTPException(400, f"{it.get('name')} was already returned again — this query can't be reopened")
        upd["status"] = "open"
        act["text"] += " (reopened)"
    await db.disputes.update_one({"id": dispute_id}, {"$set": upd, "$push": {"activities": act}})
    if upd.get("status") == "open" and disp.get("source") == "returns":  # reopened → return pending again
        await db.returns.update_one({"dispute_id": dispute_id}, {"$set": {"status": "requested", "updated_at": iso(now_utc())}})
    await notify(f"Reply on {disp.get('code')}", f"{disp.get('customer_name')}: {act['text'][:80]}",
                 distributor_id=disp["distributor_id"], kind="query", link="/d/queries")
    return {"success": True, "activity": act}


@feature_router.get("/distributor/me/disputes")
async def dist_disputes(type: Optional[str] = None, status: Optional[str] = None, user: dict = Depends(get_current_user)):
    d = await _dist_any(user)
    q: dict = {"distributor_id": d["id"]}
    if type:
        q["type"] = type
    if status:
        q["status"] = status
    rows = await db.disputes.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    await _attach_linked_orders(rows)
    counts_rows = await db.disputes.find({"distributor_id": d["id"]}, {"_id": 0, "status": 1, "type": 1}).to_list(2000)
    counts = {"open": 0, "in_progress": 0, "resolved": 0, "rejected": 0, "closed": 0}
    for r in counts_rows:
        counts[r.get("status", "open")] = counts.get(r.get("status", "open"), 0) + 1
    return {"items": rows, "counts": counts}


class DisputeUpdateReq(BaseModel):
    status: Optional[str] = None  # open | in_progress | resolved | rejected
    resolution: Optional[str] = None
    note: Optional[str] = None
    photo_file_ids: Optional[List[str]] = None


@feature_router.patch("/distributor/me/disputes/{dispute_id}")
async def update_dispute(dispute_id: str, req: DisputeUpdateReq, user: dict = Depends(get_current_user)):
    d = await _dist_manage(user)
    disp = await db.disputes.find_one({"id": dispute_id, "distributor_id": d["id"]}, {"_id": 0})
    if not disp:
        raise HTTPException(404, "Query not found")
    if disp.get("status") == "closed":
        raise HTTPException(400, "This query was already closed by the retailer")
    upd: dict = {"updated_at": iso(now_utc())}
    acts = list(disp.get("activities", []))
    photos = req.photo_file_ids or []
    author = user.get("name") or d.get("short_name")
    if req.status:
        if req.status not in {"open", "in_progress", "resolved", "rejected"}:
            raise HTTPException(400, "Invalid status")
        upd["status"] = req.status
        acts.append({"at": iso(now_utc()), "by": "distributor", "author": author, "kind": "status",
                     "text": f"Status → {STATUS_TEXT.get(req.status, req.status)}"})
    if req.resolution is not None:
        upd["resolution"] = req.resolution.strip() or None
    if (req.note or "").strip() or photos:
        if photos:
            await db.files.update_many({"id": {"$in": photos}, "owner_id": user["id"]},
                                       {"$addToSet": {"shared_with": disp["user_id"]}})
        acts.append({"at": iso(now_utc()), "by": "distributor", "author": author,
                     "text": (req.note or "").strip() or "Photo attached", "photo_file_ids": photos})
    if len(upd) == 1 and len(acts) == len(disp.get("activities", [])):
        raise HTTPException(400, "Nothing to update")
    upd["activities"] = acts
    await db.disputes.update_one({"id": dispute_id}, {"$set": upd})
    if req.status in ("resolved", "rejected") and disp.get("source") == "returns":  # keep the linked return in sync
        await db.returns.update_one({"dispute_id": dispute_id}, {"$set": {
            "status": "approved" if req.status == "resolved" else "rejected", "updated_at": iso(now_utc())}})
    msg = f"{disp.get('code')} — {disp.get('title')}: " + (f"status {req.status}" if req.status else "new update")
    if req.status in ("resolved", "rejected"):
        msg += ". Please review and unflag it."
    await notify(f"Query update from {d.get('short_name')}", msg, user_id=disp["user_id"], kind="query", link="/disputes")
    return {"success": True}


# ============================================================
# 3. Staff (salesman) chat with office
# ============================================================
class StaffChatReq(BaseModel):
    text: str


@feature_router.get("/staff/chat")
async def staff_chat_history(user: dict = Depends(get_current_user)):
    require_role(user, {"manager", "field_sales", "delivery"})
    did = user.get("distributor_id")
    msgs = await db.staff_chat.find({"distributor_id": did, "staff_id": user["id"]}, {"_id": 0}).sort("created_at", 1).to_list(500)
    await db.staff_chat.update_many(
        {"distributor_id": did, "staff_id": user["id"], "sender": "office", "read_by_staff": {"$ne": True}},
        {"$set": {"read_by_staff": True}},
    )
    return msgs


@feature_router.post("/staff/chat")
async def staff_chat_send(req: StaffChatReq, user: dict = Depends(get_current_user)):
    require_role(user, {"manager", "field_sales", "delivery"})
    if not req.text.strip():
        raise HTTPException(400, "Message cannot be empty")
    msg = {
        "id": str(uuid.uuid4()), "distributor_id": user.get("distributor_id"),
        "staff_id": user["id"], "staff_name": user.get("name"), "staff_role": user.get("role"),
        "sender": "staff", "text": req.text.strip(), "created_at": iso(now_utc()),
        "read_by_office": False, "read_by_staff": True,
    }
    await db.staff_chat.insert_one({**msg})
    return {"success": True, "message": msg}


@feature_router.get("/distributor/me/staff-chat/threads")
async def office_chat_threads(user: dict = Depends(get_current_user)):
    d = await _dist_manage(user)
    staff = await db.users.find({"distributor_id": d["id"], "role": {"$in": ["manager", "field_sales", "delivery"]}}, {"_id": 0}).to_list(200)
    threads = []
    for s in staff:
        last = await db.staff_chat.find({"distributor_id": d["id"], "staff_id": s["id"]}, {"_id": 0}).sort("created_at", -1).to_list(1)
        unread = await db.staff_chat.count_documents({"distributor_id": d["id"], "staff_id": s["id"], "sender": "staff", "read_by_office": {"$ne": True}})
        threads.append({
            "staff_id": s["id"], "name": s.get("name"), "role": s.get("role"),
            "last_text": last[0]["text"] if last else None,
            "last_at": last[0]["created_at"] if last else None,
            "unread": unread,
        })
    threads.sort(key=lambda t: (t["last_at"] or ""), reverse=True)
    return threads


@feature_router.get("/distributor/me/staff-chat/{staff_id}")
async def office_chat_history(staff_id: str, user: dict = Depends(get_current_user)):
    d = await _dist_manage(user)
    msgs = await db.staff_chat.find({"distributor_id": d["id"], "staff_id": staff_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    await db.staff_chat.update_many(
        {"distributor_id": d["id"], "staff_id": staff_id, "sender": "staff", "read_by_office": {"$ne": True}},
        {"$set": {"read_by_office": True}},
    )
    return msgs


class OfficeChatReq(BaseModel):
    staff_id: str
    text: str


@feature_router.post("/distributor/me/staff-chat")
async def office_chat_send(req: OfficeChatReq, user: dict = Depends(get_current_user)):
    d = await _dist_manage(user)
    if not req.text.strip():
        raise HTTPException(400, "Message cannot be empty")
    s = await db.users.find_one({"id": req.staff_id, "distributor_id": d["id"]}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Staff member not found")
    msg = {
        "id": str(uuid.uuid4()), "distributor_id": d["id"], "staff_id": req.staff_id,
        "staff_name": s.get("name"), "staff_role": s.get("role"),
        "sender": "office", "text": req.text.strip(), "created_at": iso(now_utc()),
        "read_by_office": True, "read_by_staff": False,
    }
    await db.staff_chat.insert_one({**msg})
    return {"success": True, "message": msg}


# ============================================================
# 4 + 9 + 10. Field sales — take orders (with margin + cash discount)
# ============================================================
@feature_router.get("/field/customers")
async def field_customers(q: Optional[str] = None, user: dict = Depends(get_current_user)):
    require_role(user, {"field_sales", "manager", "owner"})
    d = await _dist_any(user)
    from distributor_ops import _dist_customer_ids, staff_party_filter  # noqa: E402
    uids = await _dist_customer_ids(d["id"])  # mapped retailers + anyone who ordered
    users = await db.users.find({"id": {"$in": uids}}, {"_id": 0}).to_list(5000)
    pf = await staff_party_filter(user)  # "Set Parties": area retailers + assigned retailers
    if pf:
        users = [u for u in users if pf(u)]
    cc_map = {c["user_id"]: c for c in await db.customer_credit.find({"distributor_id": d["id"]}, {"_id": 0}).to_list(1000)}
    rows = []
    for u in users:
        cc = cc_map.get(u["id"]) or {}
        name = u.get("shop_name") or u.get("name") or u.get("email")
        if q and q.lower() not in name.lower():
            continue
        rows.append({
            "id": u["id"], "name": name, "contact_name": u.get("name"), "phone": u.get("phone"),
            "address": u.get("address"), "area": u.get("area"),
            "credit_limit": cc.get("credit_limit", 0), "credit_used": round(cc.get("credit_used", 0), 2),
            "credit_available": round(cc.get("credit_limit", 0) - cc.get("credit_used", 0), 2),
            "blacklisted": bool(cc.get("blacklisted")),
        })
    rows.sort(key=lambda r: r["name"].lower())
    return rows


@feature_router.get("/field/products")
async def field_products(q: Optional[str] = None, user: dict = Depends(get_current_user)):
    require_role(user, {"field_sales", "manager", "owner"})
    d = await _dist_any(user)
    query: dict = {"distributor_ids": d["id"]}
    if q:
        query["$or"] = [{"name": {"$regex": q, "$options": "i"}}, {"salt": {"$regex": q, "$options": "i"}}]
    products = await db.products.find(query, {"_id": 0}).to_list(1000)
    out = []
    for p in products:
        pr = next((x for x in (p.get("prices") or []) if x["distributor_id"] == d["id"]), None)
        if not pr:
            continue
        ptr = pr.get("ptr", p.get("ptr", 0))
        mrp = pr.get("mrp", p.get("mrp", 0))
        margin_pct = pr.get("margin_pct")
        if margin_pct is None and mrp:
            margin_pct = round((mrp - ptr) / mrp * 100, 1)
        out.append({
            "product_id": p["id"], "name": p["name"], "salt": p.get("salt"), "pack": p.get("pack"),
            "ptr": ptr, "mrp": mrp, "margin_pct": margin_pct, "margin_amt": round(mrp - ptr, 2),
            "scheme": pr.get("scheme"), "qty_available": pr.get("qty_available", 0) or 0,
            "barcode": p.get("barcode"),
        })
    out.sort(key=lambda r: r["name"].lower())
    return out


class FieldOrderItem(BaseModel):
    product_id: str
    qty: int


class FieldOrderReq(BaseModel):
    customer_id: str
    items: List[FieldOrderItem]
    payment_method: str = "credit"  # cash | credit
    cash_discount_pct: float = 0.0
    extra_cd_pct: float = 0.0
    offer_pct: float = 0.0


def _cd_total(gross: float, cd: float, extra: float, offer: float) -> dict:
    disc_pct = max(0.0, cd) + max(0.0, extra) + max(0.0, offer)
    disc_pct = min(disc_pct, 100.0)
    disc_amt = round(gross * disc_pct / 100, 2)
    return {"gross": round(gross, 2), "discount_pct": round(disc_pct, 2), "discount_amt": disc_amt, "net": round(gross - disc_amt, 2)}


@feature_router.post("/field/orders")
async def field_take_order(req: FieldOrderReq, user: dict = Depends(get_current_user)):
    require_role(user, {"field_sales", "manager", "owner"})
    d = await _dist_any(user)
    cust = await db.users.find_one({"id": req.customer_id}, {"_id": 0})
    if not cust:
        raise HTTPException(404, "Customer not found")
    if not req.items:
        raise HTTPException(400, "Add at least one product")
    if await is_blacklisted(d["id"], req.customer_id):
        raise HTTPException(403, "This customer is blacklisted and cannot be ordered for.")
    pm = req.payment_method if req.payment_method in ("cash", "credit") else "credit"

    gross = 0.0
    order_items = []
    total_margin = 0.0
    for it in req.items:
        if it.qty <= 0:
            continue
        p = await db.products.find_one({"id": it.product_id}, {"_id": 0})
        if not p:
            continue
        pr = next((x for x in (p.get("prices") or []) if x["distributor_id"] == d["id"]), None)
        unit = (pr or {}).get("ptr", p.get("ptr", 0))
        mrp = (pr or {}).get("mrp", p.get("mrp", 0))
        line = unit * it.qty
        gross += line
        total_margin += (mrp - unit) * it.qty
        order_items.append({
            "product_id": p["id"], "name": p["name"], "qty_ordered": it.qty, "qty": it.qty,
            "free_qty": 0, "price": unit, "mrp": mrp, "discount_pct": 0, "gst_pct": 12.0,
            "batch": f"B{random.randint(1000,9999)}", "expiry": None,
        })
    if not order_items:
        raise HTTPException(400, "No valid products in order")

    cd = _cd_total(gross, req.cash_discount_pct, req.extra_cd_pct, req.offer_pct)
    net = cd["net"]

    if pm == "credit":
        cc = await cc_get(d["id"], req.customer_id)
        available = cc.get("credit_limit", 0) - cc.get("credit_used", 0)
        if net > available:
            raise HTTPException(400, f"Credit insufficient: ₹{available:.0f} available, ₹{net:.0f} required")
        await cc_inc(d["id"], req.customer_id, net)

    inv_num = f"F0{now_utc().strftime('%m%y')}-A{random.randint(1000000, 9999999)}"
    order = {
        "id": str(uuid.uuid4()), "code": _gen_code("ORD"), "invoice_number": inv_num,
        "user_id": req.customer_id, "items": order_items, "distributor_id": d["id"],
        "distributor_name": d.get("short_name"), "sku_count": len(order_items),
        "total": net, "gross_total": cd["gross"], "cash_discount_pct": req.cash_discount_pct,
        "extra_cd_pct": req.extra_cd_pct, "offer_pct": req.offer_pct,
        "discount_amt": cd["discount_amt"], "est_margin": round(total_margin, 2),
        "status": "placed", "payment_method": pm, "created_at": iso(now_utc()),
        "eta": iso(now_utc()), "source": "field", "taken_by": user["id"], "taken_by_name": user.get("name"),
        "amount_on_credit": net if pm == "credit" else 0, "amount_paid_on_delivery": 0,
    }
    await db.orders.insert_one({**order})
    await maybe_auto_accept(order["id"], d, req.customer_id)
    fresh = await db.orders.find_one({"id": order["id"]}, {"_id": 0})
    return {"success": True, "order": fresh or order, "breakdown": cd, "est_margin": round(total_margin, 2)}


# ============================================================
# 10. Apply cash discount to an existing order (distributor)
# ============================================================
class ApplyCDReq(BaseModel):
    cash_discount_pct: float = 0.0
    extra_cd_pct: float = 0.0
    offer_pct: float = 0.0


@feature_router.post("/distributor/orders/{order_id}/apply-cd")
async def apply_cd(order_id: str, req: ApplyCDReq, user: dict = Depends(get_current_user)):
    d = await _dist_manage(user)
    o = await db.orders.find_one({"id": order_id, "distributor_id": d["id"]}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Order not found")
    gross = o.get("gross_total") or o.get("total", 0)
    cd = _cd_total(gross, req.cash_discount_pct, req.extra_cd_pct, req.offer_pct)
    # if the order was on credit, adjust the customer credit usage by the delta
    if o.get("payment_method") == "credit":
        delta = cd["net"] - o.get("total", gross)
        await cc_inc(d["id"], o["user_id"], delta)
    await db.orders.update_one({"id": order_id}, {"$set": {
        "gross_total": cd["gross"], "cash_discount_pct": req.cash_discount_pct,
        "extra_cd_pct": req.extra_cd_pct, "offer_pct": req.offer_pct,
        "discount_amt": cd["discount_amt"], "total": cd["net"],
        "amount_on_credit": cd["net"] if o.get("payment_method") == "credit" else 0,
    }})
    return {"success": True, "breakdown": cd}


# ============================================================
# 11. Stock adjustment (damage / expiry)
# ============================================================
class StockAdjustReq(BaseModel):
    delta: int  # negative to remove, positive to add back
    reason: str  # damage | expiry | correction | theft
    note: Optional[str] = None


@feature_router.post("/distributor/me/inventory/{product_id}/adjust")
async def adjust_stock(product_id: str, req: StockAdjustReq, user: dict = Depends(get_current_user)):
    d = await _dist_manage(user)
    if req.reason not in STOCK_REASONS:
        raise HTTPException(400, f"reason must be one of {sorted(STOCK_REASONS)}")
    p = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Product not found")
    prices = p.get("prices") or []
    pr = next((x for x in prices if x["distributor_id"] == d["id"]), None)
    if not pr:
        raise HTTPException(404, "This distributor does not stock this product")
    before = pr.get("qty_available", 0) or 0
    after = max(0, before + req.delta)
    pr["qty_available"] = after
    await db.products.update_one({"id": product_id}, {"$set": {"prices": prices}})
    log = {
        "id": str(uuid.uuid4()), "distributor_id": d["id"], "product_id": product_id,
        "product_name": p["name"], "reason": req.reason, "delta": req.delta,
        "qty_before": before, "qty_after": after, "note": (req.note or None),
        "by": user["id"], "by_name": user.get("name"), "created_at": iso(now_utc()),
    }
    await db.stock_adjustments.insert_one({**log})
    return {"success": True, "qty_available": after, "adjustment": log}


@feature_router.get("/distributor/me/inventory/adjustments")
async def list_adjustments(product_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    d = await _dist_any(user)
    q: dict = {"distributor_id": d["id"]}
    if product_id:
        q["product_id"] = product_id
    rows = await db.stock_adjustments.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return rows


# ============================================================
# 7. Barcode lookup + auto-assign
# ============================================================
class BarcodeReq(BaseModel):
    barcode: str


@feature_router.post("/distributor/me/inventory/{product_id}/barcode")
async def set_barcode(product_id: str, req: BarcodeReq, user: dict = Depends(get_current_user)):
    d = await _dist_manage(user)
    p = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Product not found")
    code = req.barcode.strip()
    clash = await db.products.find_one({"barcode": code, "id": {"$ne": product_id}}, {"_id": 0})
    if clash:
        raise HTTPException(409, f"Barcode already used by {clash['name']}")
    await db.products.update_one({"id": product_id}, {"$set": {"barcode": code}})
    return {"success": True, "barcode": code}


@feature_router.post("/distributor/me/inventory/auto-barcode")
async def auto_barcode(user: dict = Depends(get_current_user)):
    d = await _dist_manage(user)
    products = await db.products.find({"distributor_ids": d["id"]}, {"_id": 0}).to_list(2000)
    assigned = 0
    for p in products:
        if p.get("barcode"):
            continue
        # deterministic-ish 13-digit EAN-like code seeded on product id
        seed = abs(hash(p["id"])) % (10 ** 12)
        code = f"890{seed:012d}"[:13]
        # ensure unique
        while await db.products.find_one({"barcode": code}, {"_id": 0}):
            seed = (seed + 1) % (10 ** 12)
            code = f"890{seed:012d}"[:13]
        await db.products.update_one({"id": p["id"]}, {"$set": {"barcode": code}})
        assigned += 1
    return {"success": True, "assigned": assigned}


@feature_router.get("/products/barcode/{code}")
async def lookup_barcode(code: str, user: dict = Depends(get_current_user)):
    p = await db.products.find_one({"barcode": code.strip()}, {"_id": 0})
    if not p:
        raise HTTPException(404, "No product with this barcode")
    return {"product_id": p["id"], "name": p["name"], "salt": p.get("salt"), "pack": p.get("pack"),
            "mrp": p.get("mrp"), "ptr": p.get("ptr"), "barcode": p.get("barcode")}


# ============================================================
# 8. Area auto-assign (staff areas + deliveries + leads)
# ============================================================
class AreasReq(BaseModel):
    areas: List[str]


@feature_router.patch("/distributor/me/staff/{staff_id}/areas")
async def set_staff_areas(staff_id: str, req: AreasReq, user: dict = Depends(get_current_user)):
    d = await _dist_manage(user)
    s = await db.users.find_one({"id": staff_id, "distributor_id": d["id"]}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Staff member not found")
    areas = [a.strip() for a in req.areas if a.strip()]
    await db.users.update_one({"id": staff_id}, {"$set": {"areas": areas}})
    return {"success": True, "areas": areas}


def _match_area(text: Optional[str], areas: List[str]) -> bool:
    if not text or not areas:
        return False
    t = text.lower()
    return any(a.lower() in t for a in areas if a)


@feature_router.post("/distributor/me/deliveries/auto-assign")
async def auto_assign_deliveries(user: dict = Depends(get_current_user)):
    d = await _dist_manage(user)
    riders = await db.users.find({"distributor_id": d["id"], "role": "delivery", "active": True}, {"_id": 0}).to_list(200)
    orders = await db.orders.find({"distributor_id": d["id"], "status": "dispatched", "assigned_to": {"$in": [None]}}, {"_id": 0}).to_list(500)
    # also orders with no assigned_to field at all
    orders += await db.orders.find({"distributor_id": d["id"], "status": "dispatched", "assigned_to": {"$exists": False}}, {"_id": 0}).to_list(500)
    seen = set()
    assigned, unmatched = 0, 0
    for o in orders:
        if o["id"] in seen:
            continue
        seen.add(o["id"])
        cust = await db.users.find_one({"id": o["user_id"]}, {"_id": 0}) or {}
        addr = (cust.get("address") or "") + " " + (cust.get("area") or "")
        rider = next((r for r in riders if _match_area(addr, r.get("areas") or [])), None)
        if not rider:
            unmatched += 1
            continue
        await db.orders.update_one({"id": o["id"]}, {"$set": {
            "assigned_to": rider["id"], "assigned_to_name": rider.get("name"), "delivery_status": "assigned",
        }})
        assigned += 1
    return {"success": True, "assigned": assigned, "unmatched": unmatched}


@feature_router.post("/distributor/me/leads/auto-assign")
async def auto_assign_leads(user: dict = Depends(get_current_user)):
    d = await _dist_manage(user)
    reps = await db.users.find({"distributor_id": d["id"], "role": "field_sales", "active": True}, {"_id": 0}).to_list(200)
    leads = await db.leads.find({"distributor_id": d["id"], "$or": [{"assigned_to": None}, {"assigned_to": {"$exists": False}}]}, {"_id": 0}).to_list(500)
    assigned, unmatched = 0, 0
    for l in leads:
        area = (l.get("area") or "") + " " + (l.get("address") or "")
        rep = next((r for r in reps if _match_area(area, r.get("areas") or [])), None)
        if not rep:
            unmatched += 1
            continue
        await db.leads.update_one({"id": l["id"]}, {"$set": {"assigned_to": rep["id"], "assigned_to_name": rep.get("name")}})
        assigned += 1
    return {"success": True, "assigned": assigned, "unmatched": unmatched}


# ============================================================
# 12. Item details — remaining stock + all delivery photos
# ============================================================
@feature_router.get("/distributor/me/orders/{order_id}/detail")
async def dist_order_detail(order_id: str, user: dict = Depends(get_current_user)):
    d = await _dist_any(user)
    o = await db.orders.find_one({"id": order_id, "distributor_id": d["id"]}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Order not found")
    cust = await db.users.find_one({"id": o["user_id"]}, {"_id": 0}) or {}
    items = []
    for it in o.get("items", []):
        p = await db.products.find_one({"id": it.get("product_id")}, {"_id": 0})
        remaining = None
        if p:
            pr = next((x for x in (p.get("prices") or []) if x["distributor_id"] == d["id"]), None)
            if pr:
                remaining = pr.get("qty_available", 0) or 0
        items.append({**it, "remaining_stock": remaining})
    o["items"] = items
    o["customer_name"] = cust.get("shop_name") or cust.get("name") or cust.get("email")
    o["customer_phone"] = cust.get("phone")
    o["customer_address"] = cust.get("address")
    return o


@feature_router.get("/distributor/me/delivery-photos")
async def delivery_photos(customer_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    d = await _dist_any(user)
    q: dict = {"distributor_id": d["id"], "delivery_status": "delivered", "delivery_proof": {"$ne": None}}
    if customer_id:
        q["user_id"] = customer_id
    orders = await db.orders.find(q, {"_id": 0}).sort("delivered_at", -1).to_list(300)
    uids = list({o["user_id"] for o in orders})
    users = {u["id"]: u for u in await db.users.find({"id": {"$in": uids}}, {"_id": 0}).to_list(500)}
    out = []
    for o in orders:
        proof = o.get("delivery_proof") or {}
        if not proof.get("photo_base64"):
            continue
        u = users.get(o["user_id"]) or {}
        out.append({
            "order_id": o["id"], "code": o.get("code"),
            "customer_name": u.get("shop_name") or u.get("name"),
            "photo_base64": proof.get("photo_base64"), "captured_at": proof.get("captured_at"),
            "rider_name": proof.get("rider_name"), "notes": proof.get("notes"),
            "lat": proof.get("lat"), "lng": proof.get("lng"),
        })
    return out


# ============================================================
# 14. Area & time-wise auto bill generation
# ============================================================
class GenerateBillsReq(BaseModel):
    area: Optional[str] = None
    scheduled_for: Optional[str] = None  # ISO string (demo scheduling)


@feature_router.post("/distributor/me/bills/generate")
async def generate_bills(req: GenerateBillsReq, user: dict = Depends(get_current_user)):
    d = await _dist_manage(user)
    q: dict = {
        "distributor_id": d["id"],
        "status": {"$in": ["accepted", "dispatched", "delivered"]},
        "billed": {"$ne": True},
    }
    orders = await db.orders.find(q, {"_id": 0}).to_list(1000)
    # group by customer, filter by area if provided
    uids = list({o["user_id"] for o in orders})
    users = {u["id"]: u for u in await db.users.find({"id": {"$in": uids}}, {"_id": 0}).to_list(1000)}
    by_cust: dict = {}
    for o in orders:
        u = users.get(o["user_id"]) or {}
        addr = (u.get("address") or "") + " " + (u.get("area") or "")
        if req.area and req.area.lower() not in addr.lower():
            continue
        by_cust.setdefault(o["user_id"], []).append(o)

    created = []
    for cust_id, cust_orders in by_cust.items():
        u = users.get(cust_id) or {}
        total = round(sum(o.get("total", 0) for o in cust_orders), 2)
        bill = {
            "id": str(uuid.uuid4()), "code": _gen_code("BILL"), "distributor_id": d["id"],
            "customer_id": cust_id, "customer_name": u.get("shop_name") or u.get("name"),
            "area": u.get("area") or (req.area or None),
            "order_ids": [o["id"] for o in cust_orders], "order_count": len(cust_orders),
            "total": total, "status": "generated",
            "scheduled_for": req.scheduled_for, "generated_at": iso(now_utc()), "generated_by": user.get("name"),
        }
        await db.bills.insert_one({**bill})
        await db.orders.update_many({"id": {"$in": bill["order_ids"]}}, {"$set": {"billed": True, "bill_id": bill["id"]}})
        created.append(bill)
    return {"success": True, "generated": len(created), "bills": created}


@feature_router.get("/distributor/me/bills")
async def list_bills(user: dict = Depends(get_current_user)):
    d = await _dist_any(user)
    rows = await db.bills.find({"distributor_id": d["id"]}, {"_id": 0}).sort("generated_at", -1).to_list(500)
    return rows
