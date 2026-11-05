"""
RX Tech — Retailer change requirements (client doc, Jun 2026).

- Mapping / unmapping (pharmacy requests -> distributor approves with credit limit)
- GPS-based proximity sorting of unmapped distributors
- Credit rating: automatic (payment history) + star ratings from both sides
- In-app notifications (both portals)
- Pharmarack-style flat search (mapped / non-mapped) + product-wise margin comparison
- Shortbook notes (text / voice / photo) + raise query
- Returns: bill search + multi-bill flagging (Sellable / Issue)
- Distributor delivery localities + cut-off slots
- Object storage uploads + speech-to-text
"""
import math
import mimetypes
import os
import tempfile
import uuid
from typing import List, Optional

import jwt
import requests
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from pydantic import BaseModel

from server import (
    db, get_current_user, get_owned_distributor, staff_distributor, now_utc, iso,
    cc_get, notify, is_mapped, scheme_detail, scheme_label, effective_ptr,
    delivery_estimate, logger, JWT_SECRET, JWT_ALG, bearer,
)
from client_features import DisputeReq, create_dispute_doc, ISSUE_CATEGORIES, CATEGORY_LABELS

retail_router = APIRouter(prefix="/api")


async def _dist_manage(user: dict) -> dict:
    return await staff_distributor(user, {"owner", "manager"})


# ============================================================
# Migration / seed (idempotent)
# ============================================================
DEMO_COORDS = {
    "dist-1": (19.1440, 72.9370, "Bhandup"), "dist-3": (19.0860, 72.9081, "Ghatkopar"),
    "dist-5": (19.1136, 72.8697, "Andheri"), "dist-4": (19.2183, 72.9781, "Thane"),
    "dist-2": (18.5204, 73.8567, "Pune"),
}


async def migrate_retail() -> None:
    try:
        # Every existing credit relationship = an established (mapped) relationship
        async for cc in db.customer_credit.find({}, {"_id": 0, "distributor_id": 1, "user_id": 1}):
            await db.mappings.update_one(
                {"distributor_id": cc["distributor_id"], "user_id": cc["user_id"]},
                {"$setOnInsert": {"id": str(uuid.uuid4()), "status": "mapped", "requested_at": iso(now_utc()),
                                  "decided_at": iso(now_utc()), "source": "migration"}},
                upsert=True,
            )
        for did, (lat, lng, area) in DEMO_COORDS.items():
            await db.distributors.update_one({"id": did, "lat": {"$exists": False}},
                                             {"$set": {"lat": lat, "lng": lng, "area": area}})
        await db.distributors.update_one({"id": "dist-1", "settings.delivery": {"$exists": False}}, {"$set": {"settings.delivery": {
            "localities": ["Bhandup", "Ghatkopar", "Kurla", "Mulund", "Vikhroli", "Powai"],
            "slots": [{"cutoff": "11:00", "window": "1:00 PM – 3:00 PM"}, {"cutoff": "17:00", "window": "7:00 PM – 9:00 PM"}]}}})
        await db.users.update_one({"email": "demo@rxtech.com", "lat": {"$exists": False}},
                                  {"$set": {"lat": 19.1470, "lng": 72.9330, "area": "Bhandup West"}})
        await db.notifications.create_index([("user_id", 1), ("created_at", -1)])
        # credit_used can never be negative (older refund paths didn't clamp)
        await db.customer_credit.update_many({"credit_used": {"$lt": 0}}, {"$set": {"credit_used": 0.0}})
        await db.notifications.create_index([("distributor_id", 1), ("created_at", -1)])
        await db.mappings.create_index([("distributor_id", 1), ("user_id", 1)])
    except Exception as e:
        logger.warning(f"retail migration skipped: {e}")


# ============================================================
# Helpers
# ============================================================
def haversine_km(a_lat, a_lng, b_lat, b_lng) -> Optional[float]:
    if None in (a_lat, a_lng, b_lat, b_lng):
        return None
    r = 6371.0
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp, dl = math.radians(b_lat - a_lat), math.radians(b_lng - a_lng)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return round(2 * r * math.asin(math.sqrt(h)), 1)


def _grade(score: Optional[float]) -> str:
    if score is None:
        return "New"
    return "A+" if score >= 85 else "A" if score >= 70 else "B" if score >= 55 else "C" if score >= 40 else "D"


async def _stars(q: dict) -> dict:
    rows = await db.ratings.find(q, {"_id": 0, "stars": 1}).to_list(5000)
    if not rows:
        return {"avg": None, "count": 0}
    return {"avg": round(sum(r["stars"] for r in rows) / len(rows), 1), "count": len(rows)}


async def pharmacy_ratings(user_ids: List[str], distributor_id: Optional[str] = None) -> dict:
    """Automatic credit score from payment history (across all distributors)
    + average stars distributors gave this pharmacy. One query per collection."""
    if not user_ids:
        return {}
    pays = await db.payments.find({"user_id": {"$in": user_ids}},
                                  {"_id": 0, "user_id": 1, "status": 1, "amount": 1, "due_date": 1, "paid_at": 1}).to_list(50000)
    ccs = await db.customer_credit.find({"user_id": {"$in": user_ids}}, {"_id": 0, "user_id": 1, "credit_limit": 1, "credit_used": 1}).to_list(20000)
    stars = await db.ratings.find({"user_id": {"$in": user_ids}, "rater": "distributor"}, {"_id": 0, "user_id": 1, "stars": 1}).to_list(20000)
    out = {}
    for uid in user_ids:
        mine = [p for p in pays if p["user_id"] == uid]
        paid = [p for p in mine if p["status"] == "paid"]
        on_time = [p for p in paid if (p.get("paid_at") or "") <= (p.get("due_date") or "9")]
        open_amt = sum(p["amount"] for p in mine if p["status"] in ("due", "overdue"))
        overdue_amt = sum(p["amount"] for p in mine if p["status"] == "overdue")
        overdue_n = sum(1 for p in mine if p["status"] == "overdue")
        lim = sum(c.get("credit_limit", 0) or 0 for c in ccs if c["user_id"] == uid)
        used = sum(c.get("credit_used", 0) or 0 for c in ccs if c["user_id"] == uid)
        if not mine:
            score = None
        else:
            on_time_ratio = (len(on_time) / len(paid)) if paid else 0.5
            overdue_ratio = (overdue_amt / open_amt) if open_amt else 0.0
            util = min(1.0, used / lim) if lim else 0.0
            score = round(on_time_ratio * 50 + (1 - overdue_ratio) * 30 + (1 - util) * 20)
        st = [s["stars"] for s in stars if s["user_id"] == uid]
        out[uid] = {
            "score": score, "grade": _grade(score), "bills": len(mine), "paid_on_time": len(on_time),
            "paid": len(paid), "overdue_count": overdue_n, "overdue_amount": round(overdue_amt, 2),
            "stars_avg": round(sum(st) / len(st), 1) if st else None, "stars_count": len(st),
        }
    return out


async def distributor_rating(did: str) -> dict:
    """Automatic reliability score (fulfilment + query resolution) + avg stars from pharmacies."""
    orders = await db.orders.find({"distributor_id": did}, {"_id": 0, "status": 1}).to_list(20000)
    delivered = sum(1 for o in orders if o.get("status") == "delivered")
    cancelled = sum(1 for o in orders if o.get("status") == "cancelled")
    disputes = await db.disputes.find({"distributor_id": did}, {"_id": 0, "status": 1}).to_list(5000)
    solved = sum(1 for x in disputes if x.get("status") in ("resolved", "closed"))
    if not orders and not disputes:
        score = None
    else:
        f = delivered / (delivered + cancelled) if (delivered + cancelled) else 1.0
        r = solved / len(disputes) if disputes else 1.0
        score = round(f * 60 + r * 40)
    s = await _stars({"distributor_id": did, "rater": "pharmacy"})
    return {"score": score, "grade": _grade(score), "orders": len(orders), "delivered": delivered,
            "cancelled": cancelled, "queries": len(disputes), "queries_resolved": solved,
            "stars_avg": s["avg"], "stars_count": s["count"]}


async def _mapping_map(user_id: str) -> dict:
    return {m["distributor_id"]: m for m in await db.mappings.find({"user_id": user_id}, {"_id": 0}).to_list(5000)}


# ============================================================
# Location (GPS)
# ============================================================
class LocationReq(BaseModel):
    lat: float
    lng: float
    area: Optional[str] = None
    city: Optional[str] = None
    pincode: Optional[str] = None


def _loc_update(req: LocationReq) -> dict:
    if not (-90 <= req.lat <= 90 and -180 <= req.lng <= 180):
        raise HTTPException(400, "Invalid coordinates")
    upd = {"lat": req.lat, "lng": req.lng, "location_at": iso(now_utc())}
    for k in ("area", "city", "pincode"):
        v = getattr(req, k)
        if v and v.strip():
            upd[k] = v.strip()
    return upd


@retail_router.patch("/auth/location")
async def set_my_location(req: LocationReq, user: dict = Depends(get_current_user)):
    upd = _loc_update(req)
    await db.users.update_one({"id": user["id"]}, {"$set": upd})
    return {"success": True, **upd}


@retail_router.patch("/distributor/me/location")
async def set_dist_location(req: LocationReq, user: dict = Depends(get_current_user)):
    d = await _dist_manage(user)
    upd = _loc_update(req)
    if upd.get("city"):
        upd["location"] = upd["city"]
    await db.distributors.update_one({"id": d["id"]}, {"$set": upd})
    return {"success": True, **upd}


# ============================================================
# Pharmacy — mapped / unmapped distributors
# ============================================================
@retail_router.get("/retail/distributors")
async def retail_distributors(tab: str = "mapped", q: Optional[str] = None, user: dict = Depends(get_current_user)):
    mm = await _mapping_map(user["id"])
    query: dict = {}
    if q:
        query["$or"] = [{"name": {"$regex": q, "$options": "i"}}, {"location": {"$regex": q, "$options": "i"}},
                        {"area": {"$regex": q, "$options": "i"}}]
    dists = await db.distributors.find(query, {"_id": 0}).to_list(2000)
    ccs = {c["distributor_id"]: c for c in await db.customer_credit.find({"user_id": user["id"]}, {"_id": 0}).to_list(2000)}
    rows = []
    for d in dists:
        st = (mm.get(d["id"]) or {}).get("status") or "unmapped"
        is_m = st == "mapped"
        if (tab == "mapped") != is_m:
            continue
        cc = ccs.get(d["id"]) or {}
        rows.append({
            "id": d["id"], "name": d.get("name"), "short_name": d.get("short_name") or d.get("name"),
            "location": d.get("area") or d.get("location"), "rating": d.get("rating"),
            "categories": d.get("categories") or [], "discount_label": d.get("discount_label"),
            "mapping_status": st, "distance_km": haversine_km(user.get("lat"), user.get("lng"), d.get("lat"), d.get("lng")),
            "delivery": delivery_estimate(d, user),
            "credit_limit": cc.get("credit_limit") if is_m else None,
            "credit_used": round(cc.get("credit_used", 0) or 0, 2) if is_m else None,
            "reject_reason": (mm.get(d["id"]) or {}).get("note") if st == "rejected" else None,
        })
    if tab == "mapped":
        rows.sort(key=lambda r: (r["short_name"] or "").lower())
    else:  # nearest first; distributors without a location go last
        rows.sort(key=lambda r: (r["distance_km"] is None, r["distance_km"] or 0, (r["short_name"] or "").lower()))
    return {"items": rows, "has_location": user.get("lat") is not None,
            "counts": {"mapped": sum(1 for m in mm.values() if m.get("status") == "mapped")}}


class MapReq(BaseModel):
    distributor_id: str
    note: Optional[str] = None


@retail_router.post("/retail/mappings")
async def request_mapping(req: MapReq, user: dict = Depends(get_current_user)):
    if user.get("role") not in (None, "pharmacist"):
        raise HTTPException(403, "Only pharmacy accounts can request mapping")
    d = await db.distributors.find_one({"id": req.distributor_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Distributor not found")
    m = await db.mappings.find_one({"distributor_id": d["id"], "user_id": user["id"]}, {"_id": 0})
    if m and m.get("status") in ("mapped", "pending"):
        raise HTTPException(400, "Already mapped" if m["status"] == "mapped" else "Request already sent — waiting for approval")
    await db.mappings.update_one(
        {"distributor_id": d["id"], "user_id": user["id"]},
        {"$set": {"status": "pending", "requested_at": iso(now_utc()), "note": (req.note or None)},
         "$setOnInsert": {"id": str(uuid.uuid4())}}, upsert=True)
    await notify("New mapping request", f"{user.get('shop_name') or user.get('name') or user.get('email')} wants to be mapped with you",
                 distributor_id=d["id"], kind="mapping", link="/d/customers?tab=requests")
    return {"success": True, "status": "pending"}


@retail_router.delete("/retail/mappings/{distributor_id}")
async def unmap_or_cancel(distributor_id: str, user: dict = Depends(get_current_user)):
    m = await db.mappings.find_one({"distributor_id": distributor_id, "user_id": user["id"]}, {"_id": 0})
    if not m or m.get("status") not in ("mapped", "pending"):
        raise HTTPException(400, "You are not mapped with this distributor")
    if m["status"] == "mapped":
        cc = await db.customer_credit.find_one({"distributor_id": distributor_id, "user_id": user["id"]}, {"_id": 0}) or {}
        if (cc.get("credit_used") or 0) > 0:
            raise HTTPException(400, f"Clear your outstanding of ₹{cc['credit_used']:,.0f} with this distributor before unmapping")
    new_status = "unmapped"
    await db.mappings.update_one({"distributor_id": distributor_id, "user_id": user["id"]},
                                 {"$set": {"status": new_status, "decided_at": iso(now_utc()), "unmapped_by": "pharmacy"}})
    who = user.get("shop_name") or user.get("name") or user.get("email")
    await notify("Pharmacy unmapped" if m["status"] == "mapped" else "Mapping request withdrawn",
                 f"{who} {'unmapped from' if m['status'] == 'mapped' else 'withdrew the request to'} you",
                 distributor_id=distributor_id, kind="mapping", link="/d/customers")
    return {"success": True, "status": new_status}


# ============================================================
# Distributor — mapping requests / approve / reject / unmap
# ============================================================
@retail_router.get("/distributor/me/mapping-requests")
async def mapping_requests(user: dict = Depends(get_current_user)):
    d = await _dist_manage(user)
    ms = await db.mappings.find({"distributor_id": d["id"], "status": "pending"}, {"_id": 0}).sort("requested_at", -1).to_list(500)
    uids = [m["user_id"] for m in ms]
    users = {u["id"]: u for u in await db.users.find({"id": {"$in": uids}}, {"_id": 0}).to_list(500)}
    ratings = await pharmacy_ratings(uids)
    rows = []
    for m in ms:
        u = users.get(m["user_id"]) or {}
        rows.append({
            "user_id": m["user_id"], "name": u.get("shop_name") or u.get("name") or u.get("email"),
            "contact_name": u.get("name"), "phone": u.get("phone"), "email": u.get("email"),
            "address": u.get("address"), "area": u.get("area"), "gst": u.get("gst"), "drug_license": u.get("drug_license"),
            "requested_at": m.get("requested_at"), "note": m.get("note"),
            "distance_km": haversine_km(d.get("lat"), d.get("lng"), u.get("lat"), u.get("lng")),
            "rating": ratings.get(m["user_id"]),
        })
    return rows


class ApproveReq(BaseModel):
    credit_limit: float = 0
    credit_days: Optional[int] = None


@retail_router.post("/distributor/me/mapping-requests/{user_id}/approve")
async def approve_mapping(user_id: str, req: ApproveReq, user: dict = Depends(get_current_user)):
    d = await _dist_manage(user)
    m = await db.mappings.find_one({"distributor_id": d["id"], "user_id": user_id, "status": "pending"}, {"_id": 0})
    if not m:
        raise HTTPException(404, "No pending request from this pharmacy")
    if req.credit_limit < 0:
        raise HTTPException(400, "Credit limit cannot be negative")
    await cc_get(d["id"], user_id)
    upd = {"credit_limit": round(req.credit_limit, 2), "updated_at": iso(now_utc())}
    if req.credit_days:
        upd["credit_days"] = int(req.credit_days)
    await db.customer_credit.update_one({"distributor_id": d["id"], "user_id": user_id}, {"$set": upd})
    await db.mappings.update_one({"distributor_id": d["id"], "user_id": user_id},
                                 {"$set": {"status": "mapped", "decided_at": iso(now_utc()), "decided_by": user.get("name")}})
    await notify("Mapping approved 🎉", f"{d.get('short_name')} approved you with a credit limit of ₹{req.credit_limit:,.0f}",
                 user_id=user_id, kind="mapping", link=f"/distributor/{d['id']}")
    return {"success": True, "status": "mapped"}


class RejectReq(BaseModel):
    reason: Optional[str] = None


@retail_router.post("/distributor/me/mapping-requests/{user_id}/reject")
async def reject_mapping(user_id: str, req: RejectReq, user: dict = Depends(get_current_user)):
    d = await _dist_manage(user)
    res = await db.mappings.update_one({"distributor_id": d["id"], "user_id": user_id, "status": "pending"},
                                       {"$set": {"status": "rejected", "note": (req.reason or None), "decided_at": iso(now_utc())}})
    if not res.matched_count:
        raise HTTPException(404, "No pending request from this pharmacy")
    await notify("Mapping request declined", f"{d.get('short_name')} declined your request" + (f": {req.reason}" if req.reason else ""),
                 user_id=user_id, kind="mapping", link="/(tabs)/vendors")
    return {"success": True, "status": "rejected"}


@retail_router.post("/distributor/me/customers/{cust_id}/unmap")
async def dist_unmap(cust_id: str, user: dict = Depends(get_current_user)):
    d = await _dist_manage(user)
    res = await db.mappings.update_one({"distributor_id": d["id"], "user_id": cust_id, "status": "mapped"},
                                       {"$set": {"status": "unmapped", "decided_at": iso(now_utc()), "unmapped_by": "distributor"}})
    if not res.matched_count:
        raise HTTPException(400, "This pharmacy is not mapped with you")
    await notify("Unmapped by distributor", f"{d.get('short_name')} has unmapped you. Credit orders are paused; cash orders still work.",
                 user_id=cust_id, kind="mapping", link="/(tabs)/vendors")
    return {"success": True, "status": "unmapped"}


# ============================================================
# Credit rating + star ratings
# ============================================================
class StarReq(BaseModel):
    stars: int
    comment: Optional[str] = None


def _check_stars(n: int):
    if n < 1 or n > 5:
        raise HTTPException(400, "Stars must be between 1 and 5")


@retail_router.get("/retail/credit-rating")
async def my_credit_rating(user: dict = Depends(get_current_user)):
    return (await pharmacy_ratings([user["id"]]))[user["id"]]


@retail_router.get("/retail/distributors/{did}/rating")
async def dist_rating_for_pharmacy(did: str, user: dict = Depends(get_current_user)):
    r = await distributor_rating(did)
    mine = await db.ratings.find_one({"distributor_id": did, "user_id": user["id"], "rater": "pharmacy"}, {"_id": 0})
    return {**r, "my_stars": (mine or {}).get("stars"), "my_comment": (mine or {}).get("comment"),
            "mapping_status": ((await _mapping_map(user["id"])).get(did) or {}).get("status") or "unmapped"}


@retail_router.post("/retail/distributors/{did}/rating")
async def rate_distributor(did: str, req: StarReq, user: dict = Depends(get_current_user)):
    _check_stars(req.stars)
    if not await db.orders.find_one({"distributor_id": did, "user_id": user["id"]}, {"_id": 1}) and not await is_mapped(did, user["id"]):
        raise HTTPException(400, "You can rate a distributor after mapping or ordering")
    await db.ratings.update_one({"distributor_id": did, "user_id": user["id"], "rater": "pharmacy"},
                                {"$set": {"stars": req.stars, "comment": (req.comment or None), "at": iso(now_utc())}}, upsert=True)
    s = await _stars({"distributor_id": did, "rater": "pharmacy"})
    if s["avg"] is not None:
        await db.distributors.update_one({"id": did}, {"$set": {"rating": s["avg"]}})
    return {"success": True, **s}


@retail_router.get("/distributor/me/customers/{cust_id}/rating")
async def customer_rating(cust_id: str, user: dict = Depends(get_current_user)):
    d = await _dist_manage(user)
    r = (await pharmacy_ratings([cust_id]))[cust_id]
    mine = await db.ratings.find_one({"distributor_id": d["id"], "user_id": cust_id, "rater": "distributor"}, {"_id": 0})
    m = await db.mappings.find_one({"distributor_id": d["id"], "user_id": cust_id}, {"_id": 0})
    return {**r, "my_stars": (mine or {}).get("stars"), "my_comment": (mine or {}).get("comment"),
            "mapping_status": (m or {}).get("status") or "unmapped"}


@retail_router.post("/distributor/me/customers/{cust_id}/rating")
async def rate_customer(cust_id: str, req: StarReq, user: dict = Depends(get_current_user)):
    d = await _dist_manage(user)
    _check_stars(req.stars)
    if not await db.mappings.find_one({"distributor_id": d["id"], "user_id": cust_id, "status": {"$in": ["mapped", "unmapped"]}}, {"_id": 1}) and \
            not await db.orders.find_one({"distributor_id": d["id"], "user_id": cust_id}, {"_id": 1}):
        raise HTTPException(400, "You can rate only pharmacies that are your customers")
    await db.ratings.update_one({"distributor_id": d["id"], "user_id": cust_id, "rater": "distributor"},
                                {"$set": {"stars": req.stars, "comment": (req.comment or None), "at": iso(now_utc())}}, upsert=True)
    return {"success": True}


@retail_router.get("/distributor/me/rating")
async def my_dist_rating(user: dict = Depends(get_current_user)):
    d = await _dist_manage(user)
    return await distributor_rating(d["id"])


# ============================================================
# Notifications
# ============================================================
def _notif_out(rows: List[dict]) -> dict:
    return {"items": rows, "unread": sum(1 for r in rows if not r.get("read"))}


@retail_router.get("/notifications")
async def my_notifications(user: dict = Depends(get_current_user)):
    return _notif_out(await db.notifications.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200))


@retail_router.post("/notifications/read-all")
async def read_all(user: dict = Depends(get_current_user)):
    await db.notifications.update_many({"user_id": user["id"], "read": False}, {"$set": {"read": True}})
    return {"success": True}


@retail_router.get("/distributor/me/notifications")
async def dist_notifications(user: dict = Depends(get_current_user)):
    d = await get_owned_distributor(user)
    return _notif_out(await db.notifications.find({"distributor_id": d["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200))


@retail_router.post("/distributor/me/notifications/read-all")
async def dist_read_all(user: dict = Depends(get_current_user)):
    d = await get_owned_distributor(user)
    await db.notifications.update_many({"distributor_id": d["id"], "read": False}, {"$set": {"read": True}})
    return {"success": True}


# ============================================================
# Pharmarack-style search (one row per product x distributor)
# ============================================================
def _offer(p: dict, pr: dict, d: dict, user: dict, mapped: bool) -> dict:
    ptr = pr.get("ptr", p.get("ptr", 0)) or 0
    mrp = pr.get("mrp", p.get("mrp", 0)) or 0
    eff = effective_ptr(pr, ptr)
    det = scheme_detail(pr)
    return {
        "product_id": p["id"], "name": p["name"], "pack": p.get("pack"), "manufacturer": p.get("manufacturer"),
        "salt": p.get("salt"), "distributor_id": d["id"], "distributor_name": d.get("short_name") or d.get("name"),
        "distributor_area": d.get("area") or d.get("location"),
        "ptr": ptr, "mrp": mrp, "effective_ptr": eff,
        "margin_pct": round((mrp - eff) / mrp * 100, 1) if mrp else 0,
        "scheme": scheme_label(det), "scheme_detail": det,
        "qty_available": pr.get("qty_available", 0) or 0, "mapped": mapped,
        "delivery": delivery_estimate(d, user), "rating": d.get("rating"),
    }


@retail_router.get("/retail/search")
async def retail_search(q: str = "", tab: str = "mapped", distributor_id: Optional[str] = None,
                        skip: int = 0, limit: int = 30, user: dict = Depends(get_current_user)):
    q = (q or "").strip()
    if len(q) < 2:
        return {"items": [], "counts": {"mapped": 0, "unmapped": 0}, "distributors": []}
    import re as _re
    rx = {"$regex": _re.escape(q), "$options": "i"}
    prods = await db.products.find({"$or": [{"name": rx}, {"salt": rx}, {"manufacturer": rx}]},
                                   {"_id": 0, "id": 1, "name": 1, "pack": 1, "manufacturer": 1, "salt": 1, "mrp": 1, "ptr": 1, "prices": 1}
                                   ).sort([("name", 1), ("id", 1)]).to_list(400)
    mm = await _mapping_map(user["id"])
    mapped_ids = {k for k, v in mm.items() if v.get("status") == "mapped"}
    dids = {pr["distributor_id"] for p in prods for pr in (p.get("prices") or [])}
    dmap = {d["id"]: d for d in await db.distributors.find({"id": {"$in": list(dids)}}, {"_id": 0}).to_list(2000)}
    rows_m, rows_u = [], []
    for p in prods:
        for pr in (p.get("prices") or []):
            d = dmap.get(pr["distributor_id"])
            if not d:
                continue
            m = d["id"] in mapped_ids
            (rows_m if m else rows_u).append(_offer(p, pr, d, user, m))
    rows = rows_m if tab == "mapped" else rows_u
    dist_opts = sorted({(r["distributor_id"], r["distributor_name"]) for r in rows}, key=lambda x: (x[1] or "").lower())
    if distributor_id:
        rows = [r for r in rows if r["distributor_id"] == distributor_id]
    skip, limit = max(0, skip), min(100, max(1, limit))
    return {"items": rows[skip:skip + limit], "total": len(rows),
            "counts": {"mapped": len(rows_m), "unmapped": len(rows_u)},
            "distributors": [{"id": i, "name": n} for i, n in dist_opts]}


@retail_router.get("/retail/compare/{pid}")
async def compare_product(pid: str, sort: str = "margin", user: dict = Depends(get_current_user)):
    """Product-wise comparison — every distributor offering this product, ranked by margin."""
    p = await db.products.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Product not found")
    mm = await _mapping_map(user["id"])
    dids = [pr["distributor_id"] for pr in (p.get("prices") or [])]
    dmap = {d["id"]: d for d in await db.distributors.find({"id": {"$in": dids}}, {"_id": 0}).to_list(2000)}
    offers = []
    for pr in (p.get("prices") or []):
        d = dmap.get(pr["distributor_id"])
        if d:
            o = _offer(p, pr, d, user, (mm.get(d["id"]) or {}).get("status") == "mapped")
            o["distance_km"] = haversine_km(user.get("lat"), user.get("lng"), d.get("lat"), d.get("lng"))
            offers.append(o)
    if sort == "ptr":
        offers.sort(key=lambda o: o["effective_ptr"])
    elif sort == "stock":
        offers.sort(key=lambda o: -o["qty_available"])
    elif sort == "delivery":
        offers.sort(key=lambda o: (not o["delivery"].get("serviceable"), "Tomorrow" in o["delivery"]["label"], o["delivery"].get("cutoff") or "99"))
    else:
        offers.sort(key=lambda o: (-o["margin_pct"], o["effective_ptr"]))
    return {"product": {k: p.get(k) for k in ("id", "name", "pack", "manufacturer", "salt", "mrp")}, "offers": offers}


# ============================================================
# Delivery localities + cut-off slots (distributor)
# ============================================================
class Slot(BaseModel):
    cutoff: str  # "HH:MM" 24h — orders placed before this go in this slot
    window: str  # e.g. "1:00 PM – 3:00 PM"


class DeliveryCfgReq(BaseModel):
    localities: List[str] = []
    slots: List[Slot] = []
    manual_date: Optional[str] = None  # YYYY-MM-DD (IST) — manually set next delivery
    manual_time: Optional[str] = None  # HH:MM 24h
    manual_note: Optional[str] = None


@retail_router.get("/distributor/me/delivery-slots")
async def get_delivery_cfg(user: dict = Depends(get_current_user)):
    d = await get_owned_distributor(user)
    cfg = (d.get("settings") or {}).get("delivery") or {}
    return {"localities": cfg.get("localities") or [], "slots": cfg.get("slots") or [],
            "manual_at": cfg.get("manual_at"), "manual_note": cfg.get("manual_note"), "updated_at": cfg.get("updated_at"),
            "lat": d.get("lat"), "lng": d.get("lng"), "area": d.get("area")}


@retail_router.put("/distributor/me/delivery-slots")
async def put_delivery_cfg(req: DeliveryCfgReq, user: dict = Depends(get_current_user)):
    d = await _dist_manage(user)
    import re as _re
    for s in req.slots:
        if not _re.match(r"^([01]\d|2[0-3]):[0-5]\d$", s.cutoff):
            raise HTTPException(400, f"Cut-off '{s.cutoff}' must be HH:MM (24h)")
        if not s.window.strip():
            raise HTTPException(400, "Each slot needs a delivery time")
    locs = sorted({x.strip() for x in req.localities if x and x.strip()}, key=str.lower)
    slots = sorted([{"cutoff": s.cutoff, "window": s.window.strip()} for s in req.slots], key=lambda s: s["cutoff"])
    manual_at = None
    if req.manual_date and req.manual_time:
        from server import IST
        from datetime import datetime as _dt
        try:
            manual_at = _dt.strptime(f"{req.manual_date} {req.manual_time}", "%Y-%m-%d %H:%M").replace(tzinfo=IST).isoformat()
        except ValueError:
            raise HTTPException(400, "Manual delivery date/time must be YYYY-MM-DD and HH:MM")
    cfg = {"localities": locs, "slots": slots, "manual_at": manual_at, "manual_note": (req.manual_note or "").strip() or None,
           "updated_at": iso(now_utc())}
    await db.distributors.update_one({"id": d["id"]}, {"$set": {"settings.delivery": cfg}})
    return {"success": True, **cfg}


# ============================================================
# Bills (for returns / multi-select) + returns flagging
# ============================================================
def _bill_rows(pays: List[dict]) -> List[dict]:
    by: dict = {}
    for p in pays:
        code = (p.get("invoice_code") or "").replace("-PART", "")
        b = by.setdefault((p["distributor_id"], code), {
            "bill_id": None, "bill_number": code, "distributor_id": p["distributor_id"],
            "distributor_name": p.get("distributor_name"), "amount_open": 0.0, "amount_paid": 0.0, "due_date": p.get("due_date"),
        })
        if p.get("invoice_code", "").endswith("-PART") or p["status"] == "paid":
            b["amount_paid"] += p["amount"]
        else:
            b["amount_open"] += p["amount"]
        if not p.get("invoice_code", "").endswith("-PART"):
            b["bill_id"] = p["id"]
    out = []
    for b in by.values():
        if not b["bill_id"]:
            continue
        b["amount_total"] = round(b["amount_open"] + b["amount_paid"], 2)
        b["payment_state"] = "paid" if b["amount_open"] <= 0 else ("partial" if b["amount_paid"] > 0 else "unpaid")
        b["suggested_mode"] = "sellable" if b["payment_state"] == "paid" else "issue"
        b["amount_open"], b["amount_paid"] = round(b["amount_open"], 2), round(b["amount_paid"], 2)
        out.append(b)
    out.sort(key=lambda b: b.get("due_date") or "", reverse=True)
    return out


# ============================================================
# Returns — only from orders the pharmacy has RECEIVED (delivered), product-wise
# ============================================================
def _order_bill_no(o: dict) -> str:
    return o.get("invoice_number") or o.get("code") or ""


async def _returned_qty(user_id: str, order_id: str) -> dict:
    """Qty already returned per order line (open / approved returns, not rejected)."""
    out: dict = {}
    async for r in db.returns.find({"user_id": user_id, "order_id": order_id, "status": {"$ne": "rejected"}}, {"_id": 0, "items": 1}):
        for it in r.get("items") or []:
            out[it["line"]] = out.get(it["line"], 0) + it["qty"]
    return out


def _payment_state(o: dict, pays: List[dict]) -> str:
    bill = _order_bill_no(o)
    rows = [b for b in _bill_rows([p for p in pays if p["distributor_id"] == o["distributor_id"]]) if b["bill_number"] == bill]
    if rows:
        return rows[0]["payment_state"]
    if o.get("payment_method") == "credit" and not o.get("delivery_confirmed"):
        return "unpaid"
    return "paid" if (o.get("amount_on_credit") or 0) <= 0 else "partial"


@retail_router.get("/retail/returnable-orders")
async def returnable_orders(distributor: Optional[str] = None, bill: Optional[str] = None, user: dict = Depends(get_current_user)):
    orders = await db.orders.find({"user_id": user["id"], "$or": [{"status": "delivered"}, {"delivery_confirmed": True}]},
                                  {"_id": 0}).sort("created_at", -1).to_list(300)
    if distributor:
        dl = distributor.lower()
        orders = [o for o in orders if dl in (o.get("distributor_name") or "").lower()]
    if bill:
        bl = bill.lower()
        orders = [o for o in orders if bl in _order_bill_no(o).lower() or bl in (o.get("code") or "").lower()]
    pays = await db.payments.find({"user_id": user["id"]}, {"_id": 0}).to_list(2000)
    out = []
    for o in orders:
        done = await _returned_qty(user["id"], o["id"])
        lines = []
        for i, it in enumerate(o.get("items") or []):
            got = int(it.get("qty") or 0) + int(it.get("free_qty") or 0)
            lines.append({"line": i, "product_id": it.get("product_id"), "name": it.get("name"), "price": it.get("price", 0),
                          "batch": it.get("batch"), "expiry": it.get("expiry"), "received_qty": got,
                          "returned_qty": done.get(i, 0), "returnable_qty": max(got - done.get(i, 0), 0)})
        state = _payment_state(o, pays)
        out.append({"order_id": o["id"], "code": o.get("code"), "bill_number": _order_bill_no(o),
                    "distributor_id": o["distributor_id"], "distributor_name": o.get("distributor_name"),
                    "delivered_at": o.get("delivery_confirmed_at") or o.get("delivered_at") or o.get("created_at"),
                    "total": o.get("total", 0), "payment_state": state,
                    "suggested_mode": "sellable" if state == "paid" else "issue", "items": lines})
    return out


class ReturnLine(BaseModel):
    line: int
    qty: int


class ReturnFlagReq(BaseModel):
    order_id: str
    items: List[ReturnLine]
    category: str
    mode: str  # sellable | issue (pre-picked from payment state, confirmed by pharmacy)
    description: Optional[str] = None
    photo_file_ids: Optional[List[str]] = None
    audio_file_id: Optional[str] = None
    transcript: Optional[str] = None


@retail_router.post("/retail/returns/flag")
async def flag_returns(req: ReturnFlagReq, user: dict = Depends(get_current_user)):
    if req.category not in ISSUE_CATEGORIES:
        raise HTTPException(400, "Pick a valid issue category")
    if req.mode not in ("sellable", "issue"):
        raise HTTPException(400, "Pick Sellable or Issue")
    merged: dict = {}
    for x in req.items:  # same product line sent twice counts once (summed)
        if x.qty > 0:
            merged[x.line] = merged.get(x.line, 0) + x.qty
    picked = [ReturnLine(line=k, qty=v) for k, v in merged.items()]
    if not picked:
        raise HTTPException(400, "Select at least one product and quantity")
    o = await db.orders.find_one({"id": req.order_id, "user_id": user["id"]}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Order not found")
    if not (o.get("status") == "delivered" or o.get("delivery_confirmed")):
        raise HTTPException(400, "You can return only orders you have received")
    lines = o.get("items") or []
    done = await _returned_qty(user["id"], o["id"])
    items = []
    for x in picked:
        if x.line < 0 or x.line >= len(lines):
            raise HTTPException(400, "Invalid product line")
        it = lines[x.line]
        left = int(it.get("qty") or 0) + int(it.get("free_qty") or 0) - done.get(x.line, 0)
        if x.qty > left:
            raise HTTPException(400, f"{it.get('name')}: only {max(left, 0)} left to return")
        items.append({"line": x.line, "product_id": it.get("product_id"), "name": it.get("name"), "qty": x.qty,
                      "price": it.get("price", 0), "batch": it.get("batch"), "amount": round(x.qty * (it.get("price") or 0), 2)})
    bill = _order_bill_no(o)
    title = ", ".join(f"{i['name']} × {i['qty']}" for i in items)
    doc = await create_dispute_doc(DisputeReq(
        distributor_id=o["distributor_id"], type=req.category, title=title[:200], description=req.description,
        photo_file_ids=req.photo_file_ids, audio_file_id=req.audio_file_id, transcript=req.transcript,
        order_id=o["id"], bill_numbers=[bill] if bill else [], mode=req.mode, source="returns", items=items), user)
    ret = {
        "id": str(uuid.uuid4()), "user_id": user["id"], "distributor_id": o["distributor_id"],
        "distributor_name": o.get("distributor_name"), "product_name": title[:200], "order_id": o["id"],
        "reason": CATEGORY_LABELS.get(req.category), "category": req.category, "mode": req.mode,
        "bill_numbers": [bill] if bill else [], "dispute_id": doc["id"], "items": items,
        "qty": sum(i["qty"] for i in items), "amount": round(sum(i["amount"] for i in items), 2),
        "status": "requested", "created_at": iso(now_utc()),
    }
    await db.returns.insert_one({**ret})
    ret.pop("_id", None)
    return {"success": True, "dispute": doc, "return": ret}


# ============================================================
# Shortbook notes (text / voice / photo)
# ============================================================
class NoteReq(BaseModel):
    text: Optional[str] = None
    product_name: Optional[str] = None
    audio_file_id: Optional[str] = None
    transcript: Optional[str] = None
    photo_file_id: Optional[str] = None


@retail_router.get("/shortbook/notes")
async def list_notes(user: dict = Depends(get_current_user)):
    return await db.shortbook_notes.find({"user_id": user["id"], "deleted": {"$ne": True}}, {"_id": 0}).sort("created_at", -1).to_list(500)


@retail_router.post("/shortbook/notes")
async def add_note(req: NoteReq, user: dict = Depends(get_current_user)):
    if not any([(req.text or "").strip(), req.audio_file_id, req.photo_file_id, (req.transcript or "").strip()]):
        raise HTTPException(400, "Type, speak or attach a photo to save a note")
    doc = {"id": str(uuid.uuid4()), "user_id": user["id"], "text": (req.text or "").strip() or None,
           "product_name": (req.product_name or "").strip() or None, "audio_file_id": req.audio_file_id,
           "transcript": (req.transcript or "").strip() or None, "photo_file_id": req.photo_file_id,
           "query_id": None, "created_at": iso(now_utc())}
    await db.shortbook_notes.insert_one({**doc})
    return doc


@retail_router.delete("/shortbook/notes/{nid}")
async def del_note(nid: str, user: dict = Depends(get_current_user)):
    await db.shortbook_notes.update_one({"id": nid, "user_id": user["id"]}, {"$set": {"deleted": True}})
    return {"success": True}


@retail_router.post("/shortbook/notes/{nid}/query")
async def note_to_query(nid: str, req: DisputeReq, user: dict = Depends(get_current_user)):
    note = await db.shortbook_notes.find_one({"id": nid, "user_id": user["id"]}, {"_id": 0})
    if not note:
        raise HTTPException(404, "Note not found")
    if note.get("query_id"):
        raise HTTPException(400, f"A query ({note.get('query_code')}) was already raised from this note")
    if req.type not in ISSUE_CATEGORIES:
        raise HTTPException(400, "Pick a valid issue category")
    req.source, req.note_id = "shortbook", nid
    doc = await create_dispute_doc(req, user)
    await db.shortbook_notes.update_one({"id": nid}, {"$set": {"query_id": doc["id"], "query_code": doc["code"]}})
    return {"success": True, "dispute": doc}


# ============================================================
# Object storage (photos / voice) + speech-to-text
# ============================================================
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
APP_NAME = "rxtech"
_storage_key: Optional[str] = None
MAX_UPLOAD = 10 * 1024 * 1024


def _init_storage() -> str:
    global _storage_key
    if _storage_key:
        return _storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": os.environ.get("EMERGENT_LLM_KEY")}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def _put(path: str, data: bytes, ctype: str) -> dict:
    global _storage_key
    for attempt in range(2):
        key = _init_storage()
        r = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key, "Content-Type": ctype}, data=data, timeout=120)
        if r.status_code == 503 and attempt == 0:
            _storage_key = None
            continue
        if r.status_code == 402:
            raise HTTPException(402, "Storage credits exhausted — please top up your balance")
        r.raise_for_status()
        return r.json()
    raise HTTPException(503, "Storage unavailable, try again")


def _get(path: str):
    key = _init_storage()
    r = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    r.raise_for_status()
    return r.content, r.headers.get("Content-Type", "application/octet-stream")


async def _save_upload(file: UploadFile, user: dict, kind: str) -> dict:
    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty file")
    if len(data) > MAX_UPLOAD:
        raise HTTPException(400, "File too large (max 10 MB)")
    name = file.filename or f"{kind}.bin"
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ("m4a" if kind == "audio" else "jpg")
    ctype = file.content_type if file.content_type and file.content_type != "application/octet-stream" else None
    ctype = ctype or mimetypes.guess_type(name)[0] or ("audio/m4a" if kind == "audio" else "image/jpeg")
    path = f"{APP_NAME}/uploads/{user['id']}/{uuid.uuid4()}.{ext}"
    res = await run_in_threadpool(_put, path, data, ctype)
    doc = {"id": str(uuid.uuid4()), "owner_id": user["id"], "path": res.get("path", path), "kind": kind,
           "content_type": ctype, "name": name, "size": len(data), "shared_with": [], "created_at": iso(now_utc())}
    await db.files.insert_one({**doc})
    doc.pop("_id", None)
    return {**doc, "data": data, "ext": ext}


@retail_router.post("/uploads")
async def upload_file(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    doc = await _save_upload(file, user, "image")
    return {"id": doc["id"], "url": f"/api/files/{doc['id']}", "content_type": doc["content_type"]}


@retail_router.post("/transcribe")
async def transcribe(audio: UploadFile = File(...), user: dict = Depends(get_current_user)):
    """Stores the voice recording AND returns the typed text (pharmacy picked 'Both')."""
    doc = await _save_upload(audio, user, "audio")
    if doc["size"] < 2000:
        raise HTTPException(400, "Recording too short — hold and speak a little longer")
    text = ""
    try:
        from emergentintegrations.llm.openai import OpenAISpeechToText
        stt = OpenAISpeechToText(api_key=os.environ.get("EMERGENT_LLM_KEY"))
        with tempfile.NamedTemporaryFile(suffix="." + doc["ext"], delete=True) as tmp:
            tmp.write(doc["data"])
            tmp.flush()
            with open(tmp.name, "rb") as fh:
                resp = await stt.transcribe(file=fh, model="gpt-4o-mini-transcribe", response_format="json", temperature=0)
        text = (getattr(resp, "text", "") or "").strip()
    except Exception as e:
        logger.warning(f"transcribe failed: {e}")
        return {"file_id": doc["id"], "url": f"/api/files/{doc['id']}", "text": "", "error": "Couldn't convert voice to text — the recording is still saved."}
    return {"file_id": doc["id"], "url": f"/api/files/{doc['id']}", "text": text}


@retail_router.get("/files/{fid}")
async def get_file(fid: str, token: Optional[str] = Query(None),
                   creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer)):
    """Header auth on native; ?token= on web (<img>/<audio> can't send headers)."""
    raw = (creds.credentials if creds and creds.credentials else None) or token
    if not raw:
        raise HTTPException(401, "Missing token")
    try:
        uid = jwt.decode(raw, JWT_SECRET, algorithms=[JWT_ALG]).get("sub")
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
    f = await db.files.find_one({"id": fid}, {"_id": 0})
    if not user or not f:
        raise HTTPException(404, "File not found")
    did = user.get("owned_distributor_id") or user.get("distributor_id")
    shared = f.get("shared_with") or []
    if f["owner_id"] != uid and uid not in shared and not (did and did in shared):
        raise HTTPException(404, "File not found")
    data, ctype = await run_in_threadpool(_get, f["path"])
    return Response(content=data, media_type=f.get("content_type") or ctype,
                    headers={"Cache-Control": "private, max-age=86400"})
