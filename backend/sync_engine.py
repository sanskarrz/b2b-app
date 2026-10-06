"""
RX Tech — Distributor <-> ERP (Medica Ultimate / Marg / Busy / Tally) data sync.

Their billing software has no API. It only produces a daily *backup*. A raw SQL
Server ``.bak`` cannot be parsed at runtime, so this engine works on the standard
CSV / Excel *exports* every such software can produce (Item Master, Party Master,
Ledger). The parser is deliberately format-agnostic: it auto-detects the header
row and fuzzily maps columns, so almost any layout "just works".

Flow
----
IN  (their system -> RX Tech):  distributor uploads a CSV/XLSX export (file or a
    public Google-Drive link). We parse -> upsert into distributor-scoped
    collections (``dist_products``, ``dist_parties``, ``dist_ledger``) and
    de-duplicate (whole-month backups are re-uploaded repeatedly).

OUT (RX Tech -> their system):  distributor exports the orders that pharmacies
    placed in the app, as CSV/XLSX (Full or "since last export"), and imports it
    into their billing software.
"""
import csv as _csv
import hashlib
import io
import logging
import re
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from server import db, get_current_user, staff_distributor, now_utc, iso

logger = logging.getLogger("rxtech.sync")

sync_router = APIRouter(prefix="/api")


# ============================================================
# Column synonym maps (normalized: lowercase, alphanumeric-only)
# ============================================================
def _norm(s) -> str:
    return re.sub(r"[^a-z0-9]", "", str(s).lower()) if s is not None else ""


PRODUCT_MAP: Dict[str, List[str]] = {
    "code": ["itemcode", "code", "productcode", "icode", "itemno", "item", "pcode", "sku"],
    "name": ["itemname", "productname", "product", "description", "particulars", "medicine", "drugname", "name"],
    "company": ["company", "mfr", "manufacturer", "mfg", "marketedby", "comp", "supplier", "brand"],
    "pack": ["pack", "packing", "packsize", "unit"],
    "mrp": ["mrp", "maxretailprice", "mrprate"],
    "rate": ["ptr", "salerate", "saleprice", "sellingrate", "rate", "sprate", "sellrate", "price", "netrate"],
    "purchase_rate": ["purchaserate", "purrate", "prate", "costrate", "cost", "pprate", "purchase"],
    "pts": ["pts", "pricetostockist", "ptsrate", "stockistrate"],
    "gp_pct": ["gppct", "gp", "grossprofit", "marginpct", "margin", "gpper"],
    "stock": ["closingstock", "clstock", "currentstock", "availableqty", "avlqty", "bstk", "bstock", "boxstock", "stock", "qty", "quantity", "balqty", "closingqty"],
    "stock_strip": ["sstk", "sstock", "stripstock", "loosestock", "looseqty"],
    "batch": ["batchno", "batch"],
    "expiry": ["expdate", "expiry", "exp", "expirydate"],
    "hsn": ["hsncode", "hsn"],
    "gst": ["gstpct", "gst", "tax", "taxpct", "igst", "gstrate"],
    "barcode": ["barcode", "eancode", "ean", "code128"],
    "rack": ["rackno", "rack", "location", "shelf"],
}

PARTY_MAP: Dict[str, List[str]] = {
    "code": ["partycode", "custcode", "accountcode", "ledgercode", "accno", "acccode", "code", "cdcode"],
    "name": ["partyname", "customername", "accountname", "ledgername", "firmname", "shopname", "party", "customer", "name"],
    "address": ["address", "addr", "add", "add1", "address1"],
    "city": ["city", "station", "place"],
    "area": ["area", "route", "zone", "region", "locality", "beat"],
    "phone": ["mobileno", "mobile", "phoneno", "phone", "mob", "contact", "contactno", "tel"],
    "gstin": ["gstinno", "gstin", "gstno", "gst"],
    "dl": ["dlno", "dl", "druglicense", "dlno1", "dlno2", "dlnumber"],
    "credit_limit": ["creditlimit", "crlimit", "limit"],
    "balance": ["closingbalance", "outstanding", "clbal", "balance", "openingbalance", "obal", "due", "netbalance"],
    "email": ["emailid", "email", "mail"],
}

LEDGER_MAP: Dict[str, List[str]] = {
    "date": ["voucherdate", "billdate", "trndate", "invoicedate", "date", "dt"],
    "voucher": ["voucherno", "billno", "invoiceno", "vchno", "refno", "docno", "billnumber", "invno"],
    "party": ["partyname", "accountname", "ledgername", "customername", "party", "account", "ledger"],
    "type": ["vouchertype", "type", "particulars", "narration", "trntype"],
    "debit": ["debitamount", "debit", "dramount", "dr", "dramt"],
    "credit": ["creditamount", "credit", "cramount", "cr", "cramt"],
    "amount": ["netamount", "billamount", "amount", "amt", "value", "total"],
}


def _build_index(colmap: Dict[str, List[str]]) -> Dict[str, str]:
    """normalized-synonym -> canonical field."""
    idx: Dict[str, str] = {}
    for field, syns in colmap.items():
        for s in syns:
            idx.setdefault(s, field)
    return idx


PRODUCT_IDX = _build_index(PRODUCT_MAP)
PARTY_IDX = _build_index(PARTY_MAP)
LEDGER_IDX = _build_index(LEDGER_MAP)


def _map_row_headers(headers: List[str], idx: Dict[str, str]) -> Dict[int, str]:
    """Return {column_position: canonical_field} for headers matching the index."""
    out: Dict[int, str] = {}
    used = set()
    for pos, h in enumerate(headers):
        nh = _norm(h)
        if not nh:
            continue
        field = idx.get(nh)
        if not field:
            # partial contains match (e.g. "cust name" -> "name")
            for syn, f in idx.items():
                if len(syn) >= 4 and (syn in nh or nh in syn):
                    field = f
                    break
        if field and field not in used:
            out[pos] = field
            used.add(field)
    return out


def _score(headers: List[str], idx: Dict[str, str]) -> int:
    return len(_map_row_headers(headers, idx))


# ============================================================
# File loading & header detection
# ============================================================
def _read_grids(content: bytes, filename: str) -> Dict[str, List[List]]:
    """Return {sheet_name: raw grid (list of rows, header=None)}."""
    fn = (filename or "").lower()
    is_excel = fn.endswith((".xlsx", ".xls", ".xlsm")) or content[:2] == b"PK"
    grids: Dict[str, List[List]] = {}
    if is_excel:
        if fn.endswith(".xls"):
            raise HTTPException(
                400,
                "Old .xls files aren't supported. Open it in Excel and use 'Save As' → "
                "Excel Workbook (.xlsx) or CSV, then upload that.",
            )
        try:
            import openpyxl
            wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        except Exception as e:
            raise HTTPException(
                400,
                "This looks like a database backup or an unsupported file, not a CSV/Excel export. "
                "Please export Item Master / Party Master / Ledger to Excel or CSV from your billing "
                f"software and upload that. ({type(e).__name__})",
            )
        try:
            for name in wb.sheetnames:
                ws = wb[name]
                rows = []
                for row in ws.iter_rows(values_only=True):
                    cells = ["" if c is None else c for c in row]
                    if any(str(c).strip() for c in cells):
                        rows.append(cells)
                grids[str(name)] = rows
        finally:
            wb.close()
    else:
        text = None
        for enc in ("utf-8-sig", "utf-8", "latin-1", "cp1252"):
            try:
                text = content.decode(enc)
                break
            except Exception:
                continue
        if text is None:
            raise HTTPException(400, "Could not read this file as text/CSV. Please check the format.")
        # sniff delimiter from the line with the most separators
        sample = "\n".join(text.splitlines()[:20])
        sep = max(",;\t|", key=lambda c: sample.count(c))
        rows = list(_csv.reader(io.StringIO(text), delimiter=sep))
        grids["Sheet1"] = [[("" if c is None else c) for c in r] for r in rows if any(str(c).strip() for c in r)]
    return grids


def _detect(grid: List[List]) -> Tuple[Optional[str], int, Dict[int, str]]:
    """Find best data-type + header row for a grid.
    Returns (type, header_row_index, {col_pos: field}) or (None, -1, {})."""
    best = (None, -1, {}, 0)  # type, row, mapping, score
    for r in range(min(15, len(grid))):
        row = [str(c) for c in grid[r]]
        for typ, idx in (("ledger", LEDGER_IDX), ("product", PRODUCT_IDX), ("party", PARTY_IDX)):
            mp = _map_row_headers(row, idx)
            sc = len(mp)
            # signature requirements
            fields = set(mp.values())
            ok = False
            if typ == "ledger":
                ok = "party" in fields and (("debit" in fields or "credit" in fields or "amount" in fields)) and ("date" in fields or "voucher" in fields)
            elif typ == "product":
                ok = "name" in fields and (fields & {"mrp", "rate", "stock", "pack", "batch"})
            elif typ == "party":
                ok = "name" in fields and (fields & {"address", "gstin", "credit_limit", "phone", "balance", "code"})
            if ok and sc > best[3]:
                best = (typ, r, mp, sc)
    return best[0], best[1], best[2]


def _cell(row: List, pos: int) -> str:
    if pos < 0 or pos >= len(row):
        return ""
    v = row[pos]
    return "" if v is None else str(v).strip()


def _num(s: str) -> float:
    try:
        s = re.sub(r"[^0-9.\-]", "", str(s))
        return float(s) if s not in ("", "-", ".") else 0.0
    except Exception:
        return 0.0


def _hash(*parts) -> str:
    return hashlib.md5("|".join(_norm(p) for p in parts).encode()).hexdigest()


# ============================================================
# Parsers -> record dicts + dedupe key
# ============================================================
def _is_junk(name: str) -> bool:
    """Report footers / separators / total rows that aren't real records."""
    low = name.lower().strip()
    if not low:
        return True
    if "***" in low or "computer generated" in low or "does not require" in low:
        return True
    if low.startswith(("total", "grand total", "sub total", "subtotal", "----", "====", "page ")):
        return True
    return False


def _parse_products(grid, hdr, mp, did) -> List[dict]:
    out = []
    for row in grid[hdr + 1:]:
        get = lambda f: _cell(row, next((p for p, x in mp.items() if x == f), -1))
        name = get("name")
        code = get("code")
        if not name and not code:
            continue
        if _is_junk(name or code):
            continue
        mrp, rate = _num(get("mrp")), _num(get("rate"))
        pts, stock = _num(get("pts")), _num(get("stock"))
        pack = get("pack")
        # a real stock row always carries at least one number or a pack size
        if mrp == 0 and rate == 0 and pts == 0 and stock == 0 and not pack:
            continue
        key = code or (_norm(name) + "|" + _norm(pack))
        out.append({
            "distributor_id": did, "dedupe_key": key,
            "code": code or None, "name": name or code, "company": get("company") or None,
            "pack": pack or None, "mrp": mrp, "rate": rate,
            "purchase_rate": _num(get("purchase_rate")), "stock": stock,
            "stock_strip": _num(get("stock_strip")), "pts": pts,
            "gp_pct": _num(get("gp_pct")),
            "batch": get("batch") or None, "expiry": get("expiry") or None,
            "hsn": get("hsn") or None, "gst": _num(get("gst")),
            "barcode": get("barcode") or None, "rack": get("rack") or None,
        })
    return out


def _parse_parties(grid, hdr, mp, did) -> List[dict]:
    out = []
    for row in grid[hdr + 1:]:
        get = lambda f: _cell(row, next((p for p, x in mp.items() if x == f), -1))
        name = get("name")
        code = get("code")
        if not name and not code:
            continue
        if _is_junk(name or code):
            continue
        key = code or _norm(name)
        out.append({
            "distributor_id": did, "dedupe_key": key,
            "code": code or None, "name": name or code, "address": get("address") or None,
            "city": get("city") or None, "area": get("area") or None, "phone": get("phone") or None,
            "gstin": get("gstin") or None, "dl": get("dl") or None,
            "credit_limit": _num(get("credit_limit")), "balance": _num(get("balance")),
            "email": get("email") or None,
        })
    return out


def _parse_ledger(grid, hdr, mp, did) -> List[dict]:
    out = []
    for row in grid[hdr + 1:]:
        get = lambda f: _cell(row, next((p for p, x in mp.items() if x == f), -1))
        party = get("party")
        voucher = get("voucher")
        date = get("date")
        if not party and not voucher:
            continue
        if _is_junk(party or voucher):
            continue
        debit = _num(get("debit"))
        credit = _num(get("credit"))
        amount = _num(get("amount")) or (debit - credit)
        key = _hash(voucher, date, party, str(amount))
        out.append({
            "distributor_id": did, "dedupe_key": key,
            "date": date or None, "voucher": voucher or None, "party": party or None,
            "type": get("type") or None, "debit": debit, "credit": credit, "amount": amount,
        })
    return out


COLL = {"product": "dist_products", "party": "dist_parties", "ledger": "dist_ledger"}
PARSERS = {"product": _parse_products, "party": _parse_parties, "ledger": _parse_ledger}


async def _upsert(typ: str, records: List[dict]) -> Tuple[int, int]:
    """Bulk upsert on (distributor_id, dedupe_key). Returns (inserted, updated)."""
    from pymongo import UpdateOne
    coll = db[COLL[typ]]
    stamp = iso(now_utc())
    ins = upd = 0
    CHUNK = 1000
    for start in range(0, len(records), CHUNK):
        ops = []
        for r in records[start:start + CHUNK]:
            r["updated_at"] = stamp
            ops.append(UpdateOne(
                {"distributor_id": r["distributor_id"], "dedupe_key": r["dedupe_key"]},
                {"$set": r, "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": stamp}},
                upsert=True,
            ))
        if not ops:
            continue
        res = await coll.bulk_write(ops, ordered=False)
        ins += len(res.upserted_ids or {})
        upd += res.modified_count
    return ins, upd


def _margin(mrp: float, ptr: float) -> float:
    if mrp and ptr and mrp > 0:
        return round((mrp - ptr) / mrp * 100, 1)
    return 0.0


async def push_to_stock(did: str, records: List[dict]) -> dict:
    """Mirror the imported item master into the live catalog (`products.prices[]`)
    so the distributor's Stock screen — and the pharmacy marketplace — reflect the
    real stock and rates from their billing software.

    Matching order: barcode → name+pack → name. Unmatched items are created so the
    distributor's full catalogue becomes orderable.
    """
    from pymongo import UpdateOne, InsertOne

    # Project only what matching needs — prices[] is by far the heaviest field, and
    # `distributor_ids` already tells us whether this distributor has an entry
    # (push_to_stock always $addToSet's the id alongside any prices[] write).
    existing = await db.products.find(
        {}, {"_id": 0, "id": 1, "name": 1, "pack": 1, "barcode": 1,
             "distributor_ids": 1, "source": 1}
    ).to_list(200000)

    by_barcode: Dict[str, dict] = {}
    by_name_pack: Dict[str, dict] = {}
    by_name: Dict[str, dict] = {}
    for p in existing:
        bc = str(p.get("barcode") or "").strip()
        if bc:
            by_barcode.setdefault(bc, p)
        by_name_pack.setdefault(_norm(p.get("name")) + "|" + _norm(p.get("pack")), p)
        by_name.setdefault(_norm(p.get("name")), p)

    # The same medicine can appear on several report rows (one per internal
    # item code / batch). Collapse them into one catalogue line and SUM the
    # stock, so no row is silently dropped and quantities stay truthful.
    merged: Dict[str, dict] = {}
    for r in records:
        nm = (r.get("name") or "").strip()
        if not nm:
            continue
        k = _norm(nm) + "|" + _norm(r.get("pack"))
        m = merged.get(k)
        if not m:
            merged[k] = {**r, "name": nm, "stock": float(r.get("stock") or 0)}
            continue
        m["stock"] = (m.get("stock") or 0) + float(r.get("stock") or 0)
        # Prefer real (non-zero) rates and any detail the other row was missing.
        for f in ("mrp", "rate", "pts", "purchase_rate", "gp_pct"):
            if not m.get(f) and r.get(f):
                m[f] = r[f]
        for f in ("code", "company", "barcode", "expiry", "batch", "hsn", "gst", "rack"):
            if not m.get(f) and r.get(f):
                m[f] = r[f]

    ops: list = []
    updated = created = 0

    for r in merged.values():
        name = r["name"]
        mrp = r.get("mrp") or 0.0
        ptr = r.get("rate") or r.get("pts") or 0.0
        qty = int(r.get("stock") or 0)
        bc = str(r.get("barcode") or "").strip()
        status = "in_stock" if qty > 20 else "low" if qty > 0 else "out_of_stock"

        key_np = _norm(name) + "|" + _norm(r.get("pack"))
        p = (by_barcode.get(bc) if bc else None) or by_name_pack.get(key_np) or by_name.get(_norm(name))

        # Only the report's own rows carry GST; when the report has no GST column
        # leave the field alone so the app's existing rate keeps applying.
        gst = r.get("gst") or None

        if p:
            has_entry = did in (p.get("distributor_ids") or [])
            if has_entry:
                sets = {
                    "prices.$[e].qty_available": qty,
                    "prices.$[e].margin_pct": _margin(mrp, ptr),
                }
                if ptr:
                    sets["prices.$[e].ptr"] = ptr
                if mrp:
                    sets["prices.$[e].mrp"] = mrp
                if r.get("expiry"):
                    sets["prices.$[e].expiry"] = r["expiry"]
                if gst:
                    sets["prices.$[e].gst_pct"] = gst
                # Keep the marketplace honest for lines this distributor alone
                # supplies: refresh availability and the headline rate too.
                # Shared lines are left alone — another distributor's zero stock
                # must not mark the medicine out of stock for everyone.
                if p.get("source") == "erp_import" and (p.get("distributor_ids") or []) == [did]:
                    sets["stock_status"] = status
                    if mrp:
                        sets["mrp"] = mrp
                    if ptr:
                        sets["ptr"] = ptr
                        sets["margin_pct"] = _margin(mrp, ptr)
                ops.append(UpdateOne(
                    {"id": p["id"]},
                    {"$set": sets, "$addToSet": {"distributor_ids": did}},
                    array_filters=[{"e.distributor_id": did}],
                ))
            else:
                entry = {
                    "distributor_id": did, "ptr": ptr, "mrp": mrp, "scheme": None,
                    "margin_pct": _margin(mrp, ptr), "qty_available": qty,
                    "dist_discount_pct": 0, "expiry": r.get("expiry"),
                    "delivery_eta_hours": 24,
                }
                if gst:
                    entry["gst_pct"] = gst
                ops.append(UpdateOne(
                    {"id": p["id"]},
                    {"$push": {"prices": entry},
                     "$addToSet": {"distributor_ids": did}},
                ))
            updated += 1
        else:
            entry = {
                "distributor_id": did, "ptr": ptr, "mrp": mrp, "scheme": None,
                "margin_pct": _margin(mrp, ptr), "qty_available": qty,
                "dist_discount_pct": 0, "expiry": r.get("expiry"),
                "delivery_eta_hours": 24,
            }
            if gst:
                entry["gst_pct"] = gst
            ops.append(InsertOne({
                "id": f"p-erp-{uuid.uuid4().hex[:10]}",
                "name": name,
                "salt": "",
                "manufacturer": r.get("company") or "",
                "pack": r.get("pack") or "",
                "mrp": mrp,
                "ptr": ptr,
                "scheme": None,
                "margin_pct": _margin(mrp, ptr),
                "category": "General",
                "distributor_ids": [did],
                "best_distributor_id": did,
                "stock_status": status,
                "image_emoji": "💊",
                "barcode": bc or None,
                "prices": [entry],
                "source": "erp_import",
                "erp_code": r.get("code"),
                "created_at": iso(now_utc()),
            }))
            created += 1

    CHUNK = 500
    for i in range(0, len(ops), CHUNK):
        try:
            await db.products.bulk_write(ops[i:i + CHUNK], ordered=False)
        except Exception as e:
            logger.warning(f"[sync] stock push chunk failed: {e}")
    return {"stock_updated": updated, "stock_created": created}


async def ensure_sync_indexes():
    """Speed up dedupe lookups. Deliberately NOT unique: de-duplication is enforced
    by the upsert filter, and a unique index would fail on collections that already
    contain duplicates. Never blocks or breaks startup."""
    for coll in COLL.values():
        try:
            await db[coll].create_index([("distributor_id", 1), ("dedupe_key", 1)])
        except Exception as e:
            # An equivalent index already existing is a success condition, not a problem.
            logger.info(f"[sync] index on {coll} already present/skipped ({type(e).__name__})")
    try:
        await db.sync_logs.create_index([("distributor_id", 1), ("at", -1)])
    except Exception:
        pass


async def process_import(content: bytes, filename: str, did: str) -> dict:
    grids = _read_grids(content, filename)
    summary = {"product": {"found": 0, "inserted": 0, "updated": 0},
               "party": {"found": 0, "inserted": 0, "updated": 0},
               "ledger": {"found": 0, "inserted": 0, "updated": 0}}
    sheets_info = []
    stock = {"stock_updated": 0, "stock_created": 0}
    setting = await db.sync_settings.find_one({"distributor_id": did}, {"_id": 0}) or {}
    push_stock = setting.get("sync_to_stock", True)
    for name, grid in grids.items():
        typ, hdr, mp = _detect(grid)
        if not typ:
            sheets_info.append({"sheet": name, "detected": "unrecognized"})
            continue
        records = PARSERS[typ](grid, hdr, mp, did)
        ins, upd = await _upsert(typ, records)
        summary[typ]["found"] += len(records)
        summary[typ]["inserted"] += ins
        summary[typ]["updated"] += upd
        info = {"sheet": name, "detected": typ, "rows": len(records),
                "inserted": ins, "updated": upd}
        # Item master → also update the live Stock / marketplace catalogue
        if typ == "product" and push_stock and records:
            s = await push_to_stock(did, records)
            stock["stock_updated"] += s["stock_updated"]
            stock["stock_created"] += s["stock_created"]
            info.update(s)
        sheets_info.append(info)
    total = sum(v["found"] for v in summary.values())
    if total == 0:
        raise HTTPException(
            400,
            "No Item / Party / Ledger data was recognized in this file. Make sure you exported one of "
            "these masters (with a header row) to CSV/Excel from your billing software.",
        )
    return {"summary": summary, "sheets": sheets_info, "total_rows": total, **stock}


# ============================================================
# Google Drive download
# ============================================================
def _drive_id(url: str) -> Optional[str]:
    for pat in (r"/file/d/([a-zA-Z0-9_-]+)", r"[?&]id=([a-zA-Z0-9_-]+)", r"/d/([a-zA-Z0-9_-]+)"):
        m = re.search(pat, url)
        if m:
            return m.group(1)
    return None


async def _download_drive(url: str) -> Tuple[bytes, str]:
    url = (url or "").strip()
    fid = _drive_id(url)
    if not fid:
        raise HTTPException(400, "That doesn't look like a valid Google Drive link.")
    # Native Google Sheets must be exported via the spreadsheets endpoint; plain
    # Drive uploads come from usercontent. Try the most likely one first.
    sheet_url = f"https://docs.google.com/spreadsheets/d/{fid}/export?format=xlsx"
    file_url = f"https://drive.usercontent.google.com/download?id={fid}&export=download&confirm=t"
    candidates = [sheet_url, file_url] if "/spreadsheets/" in url else [file_url, sheet_url]

    last_err = "Could not download the file from Google Drive."
    async with httpx.AsyncClient(timeout=120, follow_redirects=True) as cx:
        for dl in candidates:
            try:
                r = await cx.get(dl)
            except Exception as e:
                last_err = f"Could not reach Google Drive ({type(e).__name__})."
                continue
            if r.status_code != 200:
                last_err = "This Drive file isn't publicly accessible. Set sharing to 'Anyone with the link' and try again."
                continue
            content = r.content
            head = content[:200].lstrip().lower()
            if head.startswith(b"<!doctype html") or head.startswith(b"<html"):
                last_err = ("This Drive file isn't publicly accessible. Open it in Drive → Share → "
                            "General access → 'Anyone with the link', then try again.")
                continue
            fn = ""
            m = re.search(r'filename="?([^"]+)"?', r.headers.get("content-disposition", ""))
            if m:
                fn = m.group(1)
            if not fn:
                fn = "drive-export.xlsx" if dl == sheet_url else "drive-file"
            return content, fn
    raise HTTPException(400, last_err)


# ============================================================
# Endpoints
# ============================================================
async def _dist(user: dict) -> dict:
    return await staff_distributor(user, {"owner", "manager"})


async def _log(did: str, direction: str, source: str, result: dict, by: str):
    await db.sync_logs.insert_one({
        "id": str(uuid.uuid4()), "distributor_id": did, "direction": direction,
        "source": source, "result": result, "by": by, "at": iso(now_utc()),
    })


class ImportReq(BaseModel):
    source: str = "file"        # file | drive
    file_base64: Optional[str] = None
    filename: Optional[str] = None
    drive_url: Optional[str] = None


@sync_router.post("/distributor/me/sync/import")
async def sync_import(req: ImportReq, user: dict = Depends(get_current_user)):
    d = await _dist(user)
    if req.source == "drive":
        url = (req.drive_url or "").strip()
        if not url:
            raise HTTPException(400, "Please provide a Google Drive link.")
        content, fn = await _download_drive(url)
        filename = req.filename or fn or "drive.csv"
    else:
        if not req.file_base64:
            raise HTTPException(400, "No file provided.")
        import base64
        b64 = req.file_base64.split(",")[-1]
        try:
            content = base64.b64decode(b64)
        except Exception:
            raise HTTPException(400, "File could not be decoded.")
        filename = req.filename or "upload.csv"
    result = await process_import(content, filename, d["id"])
    await db.sync_settings.update_one(
        {"distributor_id": d["id"]},
        {"$set": {"last_import_at": iso(now_utc()), "last_import_file": filename}},
        upsert=True,
    )
    await _log(d["id"], "import", req.source, result, user.get("name") or user.get("email"))
    return {"success": True, **result}


@sync_router.get("/distributor/me/sync/data")
async def sync_data(user: dict = Depends(get_current_user)):
    """Counts + a small preview of imported data."""
    d = await _dist(user)
    out = {}
    for typ, coll in COLL.items():
        c = await db[coll].count_documents({"distributor_id": d["id"]})
        preview = await db[coll].find({"distributor_id": d["id"]}, {"_id": 0}).sort("updated_at", -1).to_list(20)
        out[typ] = {"count": c, "preview": preview}
    return out


@sync_router.get("/distributor/me/sync/browse")
async def sync_browse(
    type: str = "product", q: str = "", skip: int = 0, limit: int = 50,
    user: dict = Depends(get_current_user),
):
    """Paginated, searchable view of the data imported from their billing software."""
    d = await _dist(user)
    if type not in COLL:
        raise HTTPException(400, "type must be product, party or ledger")
    query: dict = {"distributor_id": d["id"]}
    term = (q or "").strip()
    if term:
        rx = {"$regex": re.escape(term), "$options": "i"}
        fields = {"product": ["name", "code", "company", "barcode", "pack"],
                  "party": ["name", "code", "city", "area", "phone", "gstin"],
                  "ledger": ["party", "voucher", "type"]}[type]
        query["$or"] = [{f: rx} for f in fields]
    sort_key = {"product": "name", "party": "name", "ledger": "date"}[type]
    total = await db[COLL[type]].count_documents(query)
    rows = await db[COLL[type]].find(query, {"_id": 0}).sort(
        [(sort_key, 1), ("dedupe_key", 1)]
    ).skip(max(0, skip)).limit(min(200, max(1, limit))).to_list(200)
    return {"total": total, "skip": skip, "limit": limit, "rows": rows}


class ClearReq(BaseModel):
    type: str  # product | party | ledger | all


@sync_router.post("/distributor/me/sync/clear")
async def sync_clear(req: ClearReq, user: dict = Depends(get_current_user)):
    d = await _dist(user)
    types = list(COLL.keys()) if req.type == "all" else [req.type]
    deleted = 0
    for t in types:
        if t not in COLL:
            continue
        r = await db[COLL[t]].delete_many({"distributor_id": d["id"]})
        deleted += r.deleted_count
    return {"success": True, "deleted": deleted}


# ---------- Export ----------
class ExportReq(BaseModel):
    mode: str = "full"          # full | incremental
    format: str = "csv"         # csv | xlsx


async def _export_rows(did: str, since: Optional[str]) -> List[dict]:
    q: dict = {"distributor_id": did}
    if since:
        q["created_at"] = {"$gt": since}
    orders = await db.orders.find(q, {"_id": 0}).sort("created_at", 1).to_list(5000)
    uids = list({o.get("user_id") for o in orders})
    users = {u["id"]: u for u in await db.users.find({"id": {"$in": uids}}, {"_id": 0}).to_list(5000)}
    rows = []
    for o in orders:
        u = users.get(o.get("user_id")) or {}
        party = u.get("shop_name") or u.get("name") or u.get("email") or ""
        base = {
            "Invoice No": o.get("invoice_number") or o.get("code") or "",
            "Order Code": o.get("code") or "",
            "Date": (o.get("created_at") or "")[:10],
            "Party Name": party,
            "Party GSTIN": u.get("gst") or u.get("gstin") or "",
            "Party Phone": u.get("phone") or "",
            "Party Area": u.get("area") or "",
            "Status": o.get("status") or "",
            "Payment": o.get("payment_method") or "",
        }
        items = o.get("items") or []
        if not items:
            rows.append({**base, "Item Name": "", "Pack": "", "Batch": "", "Qty": 0,
                         "Free": 0, "Rate": 0, "MRP": 0, "GST%": 0, "Amount": o.get("total", 0)})
            continue
        for it in items:
            qty = it.get("qty") or it.get("qty_ordered") or 0
            rate = it.get("price") or 0
            rows.append({
                **base,
                "Item Name": it.get("name") or "", "Pack": it.get("pack") or "",
                "Batch": it.get("batch") or "", "Qty": qty, "Free": it.get("free_qty") or 0,
                "Rate": rate, "MRP": it.get("mrp") or 0, "GST%": it.get("gst_pct") or 0,
                "Amount": round(rate * qty, 2),
            })
    return rows


@sync_router.post("/distributor/me/sync/export")
async def sync_export(req: ExportReq, user: dict = Depends(get_current_user)):
    d = await _dist(user)
    setting = await db.sync_settings.find_one({"distributor_id": d["id"]}, {"_id": 0}) or {}
    since = setting.get("last_export_at") if req.mode == "incremental" else None
    rows = await _export_rows(d["id"], since)
    if not rows:
        raise HTTPException(400, "No new orders to export since your last export."
                            if req.mode == "incremental" else "No orders to export yet.")
    import base64
    headers = list(rows[0].keys())
    stamp = now_utc().strftime("%Y%m%d-%H%M")
    if req.format == "xlsx":
        import xlsxwriter
        buf = io.BytesIO()
        wb = xlsxwriter.Workbook(buf, {"in_memory": True, "constant_memory": True})
        ws = wb.add_worksheet("Orders")
        bold = wb.add_format({"bold": True})
        for c, h in enumerate(headers):
            ws.write(0, c, h, bold)
        for r, row in enumerate(rows, start=1):
            for c, h in enumerate(headers):
                ws.write(r, c, row.get(h, ""))
        wb.close()
        data = buf.getvalue()
        filename = f"rxtech-orders-{stamp}.xlsx"
        mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    else:
        buf = io.StringIO()
        w = _csv.DictWriter(buf, fieldnames=headers, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
        data = buf.getvalue().encode("utf-8-sig")
        filename = f"rxtech-orders-{stamp}.csv"
        mime = "text/csv"
    now = iso(now_utc())
    await db.sync_settings.update_one(
        {"distributor_id": d["id"]}, {"$set": {"last_export_at": now}}, upsert=True,
    )
    await _log(d["id"], "export", req.mode,
               {"rows": len(rows), "mode": req.mode, "format": req.format}, user.get("name") or user.get("email"))
    return {
        "success": True, "filename": filename, "mime": mime,
        "rows": len(rows), "orders": len({r["Invoice No"] for r in rows}),
        "base64": base64.b64encode(data).decode(),
    }


# ---------- Settings & logs ----------
class SyncSettingsReq(BaseModel):
    drive_url: Optional[str] = None
    auto_sync: Optional[bool] = None
    interval_hours: Optional[int] = None
    sync_to_stock: Optional[bool] = None


def _settings_out(s: dict) -> dict:
    return {
        "drive_url": s.get("drive_url") or "",
        "auto_sync": bool(s.get("auto_sync", False)),
        "sync_to_stock": bool(s.get("sync_to_stock", True)),
        "interval_hours": int(s.get("interval_hours", 24)),
        "last_import_at": s.get("last_import_at"),
        "last_import_file": s.get("last_import_file"),
        "last_export_at": s.get("last_export_at"),
        "last_auto_at": s.get("last_auto_at"),
    }


@sync_router.get("/distributor/me/sync/settings")
async def get_sync_settings(user: dict = Depends(get_current_user)):
    d = await _dist(user)
    s = await db.sync_settings.find_one({"distributor_id": d["id"]}, {"_id": 0}) or {}
    return _settings_out(s)


@sync_router.patch("/distributor/me/sync/settings")
async def patch_sync_settings(req: SyncSettingsReq, user: dict = Depends(get_current_user)):
    d = await _dist(user)
    upd: dict = {}
    if req.drive_url is not None:
        upd["drive_url"] = req.drive_url.strip() or None
    if req.auto_sync is not None:
        upd["auto_sync"] = bool(req.auto_sync)
    if req.interval_hours is not None:
        upd["interval_hours"] = max(1, min(168, int(req.interval_hours)))
    if req.sync_to_stock is not None:
        upd["sync_to_stock"] = bool(req.sync_to_stock)
    await db.sync_settings.update_one({"distributor_id": d["id"]}, {"$set": upd}, upsert=True)
    s = await db.sync_settings.find_one({"distributor_id": d["id"]}, {"_id": 0}) or {}
    return _settings_out(s)


@sync_router.get("/distributor/me/sync/logs")
async def get_sync_logs(user: dict = Depends(get_current_user)):
    d = await _dist(user)
    return await db.sync_logs.find({"distributor_id": d["id"]}, {"_id": 0}).sort("at", -1).to_list(100)


# ============================================================
# Background auto-sync — re-fetch the saved Drive link on a schedule
# ============================================================
async def auto_sync_loop():
    import asyncio
    while True:
        try:
            settings = await db.sync_settings.find(
                {"auto_sync": True, "drive_url": {"$ne": None}}, {"_id": 0}
            ).to_list(500)
            now = now_utc()
            for s in settings:
                interval = int(s.get("interval_hours", 24))
                last = s.get("last_auto_at") or s.get("last_import_at")
                due = True
                if last:
                    try:
                        due = (now - datetime.fromisoformat(last.replace("Z", "+00:00"))) >= timedelta(hours=interval)
                    except Exception:
                        due = True
                if not due:
                    continue
                did = s["distributor_id"]
                try:
                    content, fn = await _download_drive(s["drive_url"])
                    result = await process_import(content, fn or "auto.csv", did)
                    await db.sync_settings.update_one(
                        {"distributor_id": did},
                        {"$set": {"last_auto_at": iso(now), "last_import_at": iso(now)}},
                    )
                    await _log(did, "import", "auto", result, "auto-sync")
                except Exception as e:
                    await _log(did, "import", "auto", {"error": str(e)}, "auto-sync")
        except Exception:
            pass
        import asyncio as _a
        await _a.sleep(3600)  # check hourly; runs each distributor per its interval
