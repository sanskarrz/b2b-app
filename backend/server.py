"""
RX Tech – B2B Medicine Marketplace Backend
FastAPI + MongoDB, JWT-based session with Email OTP.
"""
from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Body, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import random
import string
import jwt
import bcrypt
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Literal
import uuid
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# ---------- MongoDB ----------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# ---------- Config ----------
JWT_SECRET = os.environ.get("JWT_SECRET", "rxtech-dev-secret-change-in-prod")
JWT_ALG = "HS256"
JWT_EXPIRES_DAYS = 30
OTP_TTL_MINUTES = 10
# DEV mode: return OTP in API response (no SMTP configured)
DEV_RETURN_OTP = os.environ.get("DEV_RETURN_OTP", "true").lower() == "true"
# Demo account — only this email gets pre-seeded sample data
DEMO_EMAIL = "demo@rxtech.com"

# ---------- App ----------
app = FastAPI(title="RX Tech API")
api_router = APIRouter(prefix="/api")
bearer = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("rxtech")


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.isoformat()


# ---------- Helpers: JWT ----------
def create_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "iat": int(now_utc().timestamp()),
        "exp": int((now_utc() + timedelta(days=JWT_EXPIRES_DAYS)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


async def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer)
) -> dict:
    if not creds or not creds.credentials:
        raise HTTPException(status_code=401, detail="Missing token")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALG])
        user_id = payload.get("sub")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# Roles
STAFF_PASSWORD_ROLES = {"manager", "field_sales", "delivery"}
DISTRIBUTOR_ROLES = {"owner", "manager", "field_sales", "delivery"}


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except Exception:
        return False


def require_role(user: dict, allowed: set):
    """Raise 403 unless the user's role is in `allowed`."""
    role = user.get("role") or "pharmacist"
    if role not in allowed:
        raise HTTPException(status_code=403, detail="You don't have access to this action")
    return role


async def staff_distributor(user: dict, allowed: set) -> dict:
    """Return the distributor this staff/owner belongs to, enforcing role."""
    require_role(user, allowed)
    did = user.get("owned_distributor_id") or user.get("distributor_id")
    if not did:
        raise HTTPException(status_code=403, detail="No distributor linked to this account")
    d = await db.distributors.find_one({"id": did}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Distributor not found")
    return d


# ============================================================
# MODELS
# ============================================================
class SendOTPRequest(BaseModel):
    email: EmailStr


class VerifyOTPRequest(BaseModel):
    email: EmailStr
    otp: str


class OnboardRequest(BaseModel):
    name: str
    phone: str
    shop_name: Optional[str] = None
    gst: Optional[str] = None
    address: Optional[str] = None
    drug_license: Optional[str] = None
    food_license: Optional[str] = None


class User(BaseModel):
    id: str
    email: str
    name: Optional[str] = None
    phone: Optional[str] = None
    shop_name: Optional[str] = None
    gst: Optional[str] = None
    address: Optional[str] = None
    drug_license: Optional[str] = None
    food_license: Optional[str] = None
    onboarded: bool = False
    created_at: str
    # NEW: roles & distributor-owner link
    roles: List[str] = ["pharmacist"]  # "pharmacist" | "distributor"
    owned_distributor_id: Optional[str] = None  # distributor.id if this user owns one


class Distributor(BaseModel):
    id: str
    name: str
    short_name: str
    rating: float
    delivery_time: str
    min_order: int
    location: str
    gst: str
    categories: List[str]
    discount_label: str
    credit_limit: int
    credit_used: int


class Product(BaseModel):
    id: str
    name: str
    salt: str
    manufacturer: str
    pack: str
    mrp: float
    ptr: float  # price to retailer
    scheme: Optional[str] = None
    margin_pct: float
    category: str
    distributor_ids: List[str]
    best_distributor_id: str
    stock_status: str  # in_stock | low | out
    image_emoji: str = "💊"


class CartItem(BaseModel):
    id: str
    user_id: str
    product_id: str
    distributor_id: str
    qty: int
    added_at: str


class Order(BaseModel):
    id: str
    code: str
    user_id: str
    items: List[dict]
    distributor_id: str
    distributor_name: str
    sku_count: int
    total: float
    status: str  # placed | processing | shipped | delivered | cancelled
    created_at: str
    eta: Optional[str] = None


class Payment(BaseModel):
    id: str
    user_id: str
    distributor_id: str
    distributor_name: str
    invoice_code: str
    amount: float
    due_date: str
    status: str  # due | paid | overdue
    days_to_due: int


class ReturnItem(BaseModel):
    id: str
    user_id: str
    product_name: str
    distributor_name: str
    reason: str
    qty: int
    amount: float
    status: str  # requested | approved | rejected | refunded
    created_at: str


# ============================================================
# SEED DATA
# ============================================================
def _build_prices(p: dict) -> List[dict]:
    """Build per-distributor pricing variants from a base product."""
    import random as _r
    base_ptr = p["ptr"]
    mrp = p["mrp"]
    schemes_pool = ["10+1 Free", "5+1 Free", "10+2 Free", None, None]
    out = []
    for i, did in enumerate(p["distributor_ids"]):
        # Deterministic-ish variance by index
        variance = (-0.06, 0.0, 0.05, 0.10, -0.03)[i % 5]
        ptr = round(base_ptr * (1 + variance), 2)
        margin = round((mrp - ptr) / mrp * 100, 1)
        scheme = p.get("scheme") if did == p.get("best_distributor_id") else schemes_pool[i % len(schemes_pool)]
        out.append({"distributor_id": did, "ptr": ptr, "mrp": mrp, "scheme": scheme, "margin_pct": margin})
    return out


async def seed_database():
    """Idempotent seed of distributors, products, sample data.

    Re-seeds product catalog when the existing count is much smaller than the
    bundled Indian-medicine catalog (allows upgrading older deployments).
    """
    from seed_catalog import build_products, get_product_count  # local import

    target_product_count = get_product_count()

    distributors = [
        {"id": "dist-1", "name": "ABC Pharma Distributors", "short_name": "ABC Pharma", "rating": 4.7, "delivery_time": "Today 6 PM", "min_order": 2000, "location": "Mumbai", "state_code": "27", "gst": "27AABCU9603R1ZX", "categories": ["Antibiotics", "Diabetes", "Cardiac"], "discount_label": "Up to 18% off", "credit_limit": 200000, "credit_used": 184000, "credit_days": 21, "settlement_discount_pct": 1.5},
        {"id": "dist-2", "name": "Medline Distributors Pvt Ltd", "short_name": "Medline Distr.", "rating": 4.5, "delivery_time": "Tomorrow", "min_order": 1500, "location": "Pune", "state_code": "27", "gst": "27ABCDE1234F1Z5", "categories": ["General", "Pediatric"], "discount_label": "Up to 14% off", "credit_limit": 150000, "credit_used": 42000, "credit_days": 30, "settlement_discount_pct": 2.0},
        {"id": "dist-3", "name": "XYZ Pharma Wholesale", "short_name": "XYZ Pharma", "rating": 4.6, "delivery_time": "Today 8 PM", "min_order": 1000, "location": "Mumbai", "state_code": "27", "gst": "27XYZAB5678C1Z9", "categories": ["Antibiotics", "Generic", "Dermatology"], "discount_label": "Up to 22% off", "credit_limit": 100000, "credit_used": 18500, "credit_days": 15, "settlement_discount_pct": 1.0},
        {"id": "dist-4", "name": "HealthFirst Distribution", "short_name": "HealthFirst", "rating": 4.3, "delivery_time": "Tomorrow", "min_order": 3000, "location": "Thane", "state_code": "27", "gst": "27HEAL1234F1Z7", "categories": ["Surgical", "Devices"], "discount_label": "Up to 12% off", "credit_limit": 80000, "credit_used": 0, "credit_days": 30, "settlement_discount_pct": 1.0},
        {"id": "dist-5", "name": "Sun Wholesale Pharma", "short_name": "Sun Wholesale", "rating": 4.4, "delivery_time": "Today 7 PM", "min_order": 1500, "location": "Mumbai", "state_code": "27", "gst": "27SUNWS998P1Z1", "categories": ["Generic", "Antibiotics"], "discount_label": "Up to 16% off", "credit_limit": 120000, "credit_used": 31000, "credit_days": 21, "settlement_discount_pct": 1.5},
    ]

    if await db.distributors.count_documents({}) == 0:
        await db.distributors.insert_many([{**d} for d in distributors])
    else:
        # Backfill new fields on existing distributors
        for d in distributors:
            await db.distributors.update_one(
                {"id": d["id"]},
                {"$set": {k: v for k, v in d.items() if k in ("credit_days", "settlement_discount_pct", "state_code")}},
            )

    # Refresh products: if catalog is significantly larger than existing, re-seed
    current = await db.products.count_documents({})
    if current < target_product_count:
        await db.products.delete_many({})
        big_catalog = build_products()
        await db.products.insert_many([{**p} for p in big_catalog])
        logger.info(f"Catalog refreshed: {current} → {len(big_catalog)} products")
        return

    # Legacy code below kept for backward-compat seeding fallback
    if current > 0:
        return

    products = [
        {"id": "p-1", "name": "Azithromycin 500mg", "salt": "Azithromycin", "manufacturer": "Cipla", "pack": "Strip of 3 Tabs", "mrp": 78.50, "ptr": 54.20, "scheme": "10+1 Free", "margin_pct": 23.5, "category": "Antibiotic", "distributor_ids": ["dist-1", "dist-3", "dist-5"], "best_distributor_id": "dist-3", "stock_status": "in_stock", "image_emoji": "💊"},
        {"id": "p-2", "name": "Paracetamol 650mg", "salt": "Paracetamol", "manufacturer": "GSK", "pack": "Strip of 15 Tabs", "mrp": 45.00, "ptr": 32.50, "scheme": "5+1 Free", "margin_pct": 18.2, "category": "Analgesic", "distributor_ids": ["dist-1", "dist-2", "dist-3"], "best_distributor_id": "dist-2", "stock_status": "in_stock", "image_emoji": "💊"},
        {"id": "p-3", "name": "Metformin 500mg", "salt": "Metformin HCL", "manufacturer": "USV", "pack": "Strip of 10 Tabs", "mrp": 38.00, "ptr": 26.40, "scheme": None, "margin_pct": 21.0, "category": "Diabetes", "distributor_ids": ["dist-1", "dist-5"], "best_distributor_id": "dist-1", "stock_status": "low", "image_emoji": "💊"},
        {"id": "p-4", "name": "Amlodipine 5mg", "salt": "Amlodipine Besilate", "manufacturer": "Sun Pharma", "pack": "Strip of 10 Tabs", "mrp": 56.00, "ptr": 40.80, "scheme": "10+2 Free", "margin_pct": 19.8, "category": "Cardiac", "distributor_ids": ["dist-1", "dist-5"], "best_distributor_id": "dist-1", "stock_status": "in_stock", "image_emoji": "❤️"},
        {"id": "p-5", "name": "Pantoprazole 40mg", "salt": "Pantoprazole", "manufacturer": "Alkem", "pack": "Strip of 15 Tabs", "mrp": 124.00, "ptr": 89.50, "scheme": "10+1 Free", "margin_pct": 16.4, "category": "Gastric", "distributor_ids": ["dist-2", "dist-3", "dist-5"], "best_distributor_id": "dist-5", "stock_status": "in_stock", "image_emoji": "🟢"},
        {"id": "p-6", "name": "Cetirizine 10mg", "salt": "Cetirizine HCL", "manufacturer": "Cipla", "pack": "Strip of 10 Tabs", "mrp": 32.00, "ptr": 22.40, "scheme": None, "margin_pct": 24.0, "category": "Antihistamine", "distributor_ids": ["dist-1", "dist-2", "dist-3"], "best_distributor_id": "dist-3", "stock_status": "in_stock", "image_emoji": "💊"},
        {"id": "p-7", "name": "Atorvastatin 10mg", "salt": "Atorvastatin", "manufacturer": "Lupin", "pack": "Strip of 10 Tabs", "mrp": 110.00, "ptr": 78.00, "scheme": "5+1 Free", "margin_pct": 21.5, "category": "Cardiac", "distributor_ids": ["dist-1", "dist-2"], "best_distributor_id": "dist-1", "stock_status": "in_stock", "image_emoji": "❤️"},
        {"id": "p-8", "name": "Omeprazole 20mg", "salt": "Omeprazole", "manufacturer": "Dr. Reddy's", "pack": "Strip of 10 Caps", "mrp": 64.00, "ptr": 45.20, "scheme": None, "margin_pct": 19.0, "category": "Gastric", "distributor_ids": ["dist-2", "dist-3"], "best_distributor_id": "dist-3", "stock_status": "in_stock", "image_emoji": "🟠"},
        {"id": "p-9", "name": "Amoxicillin 500mg", "salt": "Amoxicillin", "manufacturer": "Cipla", "pack": "Strip of 10 Caps", "mrp": 92.00, "ptr": 66.00, "scheme": "10+1 Free", "margin_pct": 20.5, "category": "Antibiotic", "distributor_ids": ["dist-1", "dist-3", "dist-5"], "best_distributor_id": "dist-5", "stock_status": "in_stock", "image_emoji": "🟡"},
        {"id": "p-10", "name": "Losartan 50mg", "salt": "Losartan Potassium", "manufacturer": "Torrent", "pack": "Strip of 10 Tabs", "mrp": 88.00, "ptr": 62.30, "scheme": "10+2 Free", "margin_pct": 22.0, "category": "Cardiac", "distributor_ids": ["dist-1", "dist-2"], "best_distributor_id": "dist-1", "stock_status": "in_stock", "image_emoji": "❤️"},
        {"id": "p-11", "name": "Diclofenac 50mg", "salt": "Diclofenac Sodium", "manufacturer": "Sun Pharma", "pack": "Strip of 10 Tabs", "mrp": 42.00, "ptr": 30.10, "scheme": None, "margin_pct": 20.8, "category": "Analgesic", "distributor_ids": ["dist-3", "dist-5"], "best_distributor_id": "dist-3", "stock_status": "in_stock", "image_emoji": "💊"},
        {"id": "p-12", "name": "Glimepiride 2mg", "salt": "Glimepiride", "manufacturer": "Sanofi", "pack": "Strip of 10 Tabs", "mrp": 95.00, "ptr": 68.40, "scheme": "5+1 Free", "margin_pct": 19.2, "category": "Diabetes", "distributor_ids": ["dist-1", "dist-2", "dist-5"], "best_distributor_id": "dist-5", "stock_status": "low", "image_emoji": "💊"},
    ]
    products_seed = products
    products = []
    for p in products_seed:
        p["prices"] = _build_prices(p)
        products.append(p)
    await db.products.insert_many([{**p} for p in products])

    logger.info(f"Seeded {len(distributors)} distributors and {len(products)} products")


async def seed_user_data(user_id: str):
    """Seed sample orders, payments, returns for a user upon first login.

    Per-collection idempotency — each block only inserts if the user has none.
    """
    base = now_utc()

    if await db.orders.count_documents({"user_id": user_id}) == 0:
        orders = [
            {"id": str(uuid.uuid4()), "code": "ORD-2340", "invoice_number": f"F0{datetime.now().strftime('%m%y')}-A{random.randint(1000000, 9999999)}", "user_id": user_id, "items": [{"product_id": "p-1", "name": "Azithromycin 500mg", "qty_ordered": 30, "qty": 30, "free_qty": 0, "price": 54.20, "mrp": 78.50, "discount_pct": 4.0, "gst_pct": 12.0, "batch": f"B{random.randint(1000, 9999)}A", "expiry": "Jun 2027"}, {"product_id": "p-2", "name": "Paracetamol 650mg", "qty_ordered": 50, "qty": 50, "free_qty": 5, "price": 32.50, "mrp": 45.00, "discount_pct": 4.0, "gst_pct": 12.0, "batch": f"B{random.randint(1000, 9999)}B", "expiry": "Sep 2027"}, {"product_id": "p-6", "name": "Cetirizine 10mg", "qty_ordered": 40, "qty": 40, "free_qty": 0, "price": 22.40, "mrp": 32.00, "discount_pct": 4.0, "gst_pct": 12.0, "batch": f"B{random.randint(1000, 9999)}C", "expiry": "Dec 2026"}], "distributor_id": "dist-3", "distributor_name": "XYZ Pharma", "sku_count": 3, "total": 12450.00, "status": "placed", "payment_method": "credit", "created_at": iso(base - timedelta(hours=3)), "eta": iso(base + timedelta(hours=4)), "delivery_confirmed": False, "has_bill_pdf": True, "amount_paid_on_delivery": 0, "amount_on_credit": 12450.00},
            {"id": str(uuid.uuid4()), "code": "ORD-2341", "invoice_number": f"F0{datetime.now().strftime('%m%y')}-A{random.randint(1000000, 9999999)}", "user_id": user_id, "items": [{"product_id": "p-4", "name": "Amlodipine 5mg", "qty_ordered": 20, "qty": 20, "free_qty": 0, "price": 40.80, "mrp": 56.00, "discount_pct": 4.0, "gst_pct": 12.0, "batch": f"B{random.randint(1000, 9999)}D", "expiry": "Aug 2027"}, {"product_id": "p-7", "name": "Atorvastatin 10mg", "qty_ordered": 25, "qty": 25, "free_qty": 2, "price": 78.00, "mrp": 110.00, "discount_pct": 4.0, "gst_pct": 12.0, "batch": f"B{random.randint(1000, 9999)}E", "expiry": "Oct 2027"}], "distributor_id": "dist-1", "distributor_name": "ABC Pharma", "sku_count": 2, "total": 8650.00, "status": "shipped", "payment_method": "credit", "created_at": iso(base - timedelta(hours=6)), "eta": iso(base + timedelta(hours=2)), "delivery_confirmed": False, "has_bill_pdf": True, "amount_paid_on_delivery": 0, "amount_on_credit": 8650.00},
            {"id": str(uuid.uuid4()), "code": "ORD-2342", "invoice_number": f"F0{datetime.now().strftime('%m%y')}-A{random.randint(1000000, 9999999)}", "user_id": user_id, "items": [{"product_id": "p-5", "name": "Pantoprazole 40mg", "qty_ordered": 30, "qty": 30, "free_qty": 3, "price": 89.50, "mrp": 124.00, "discount_pct": 4.0, "gst_pct": 12.0, "batch": f"B{random.randint(1000, 9999)}F", "expiry": "May 2027"}], "distributor_id": "dist-5", "distributor_name": "Sun Wholesale", "sku_count": 1, "total": 6450.00, "status": "shipped", "payment_method": "cash", "created_at": iso(base - timedelta(hours=8)), "eta": iso(base + timedelta(hours=1)), "delivery_confirmed": False, "has_bill_pdf": False, "amount_paid_on_delivery": 0, "amount_on_credit": 0},
            {"id": str(uuid.uuid4()), "code": "ORD-2338", "invoice_number": f"F0{datetime.now().strftime('%m%y')}-A{random.randint(1000000, 9999999)}", "user_id": user_id, "items": [{"product_id": "p-9", "name": "Amoxicillin 500mg", "qty_ordered": 50, "qty": 50, "free_qty": 0, "price": 66.00, "mrp": 92.00, "discount_pct": 4.0, "gst_pct": 12.0, "batch": f"B{random.randint(1000, 9999)}G", "expiry": "Nov 2027"}], "distributor_id": "dist-5", "distributor_name": "Sun Wholesale", "sku_count": 4, "total": 14750.00, "status": "delivered", "payment_method": "cash", "created_at": iso(base - timedelta(days=1)), "eta": None, "delivery_confirmed": True, "delivery_confirmed_at": iso(base - timedelta(hours=20)), "has_bill_pdf": True, "amount_paid_on_delivery": 14750.00, "amount_on_credit": 0},
        ]
        await db.orders.insert_many(orders)

    if await db.payments.count_documents({"user_id": user_id}) == 0:
        payments = [
            {"id": str(uuid.uuid4()), "user_id": user_id, "distributor_id": "dist-1", "distributor_name": "ABC Pharma", "invoice_code": "INV-12934", "amount": 42300.00, "due_date": iso(base + timedelta(hours=4)), "status": "due", "days_to_due": 0},
            {"id": str(uuid.uuid4()), "user_id": user_id, "distributor_id": "dist-3", "distributor_name": "XYZ Pharma", "invoice_code": "INV-12891", "amount": 18650.00, "due_date": iso(base + timedelta(days=3)), "status": "due", "days_to_due": 3},
            {"id": str(uuid.uuid4()), "user_id": user_id, "distributor_id": "dist-2", "distributor_name": "Medline Distr.", "invoice_code": "INV-12702", "amount": 9250.00, "due_date": iso(base - timedelta(days=2)), "status": "overdue", "days_to_due": -2},
            {"id": str(uuid.uuid4()), "user_id": user_id, "distributor_id": "dist-5", "distributor_name": "Sun Wholesale", "invoice_code": "INV-12660", "amount": 14750.00, "due_date": iso(base - timedelta(days=10)), "status": "paid", "days_to_due": -10, "paid_at": iso(base - timedelta(days=8))},
            {"id": str(uuid.uuid4()), "user_id": user_id, "distributor_id": "dist-1", "distributor_name": "ABC Pharma", "invoice_code": "INV-12598", "amount": 28400.00, "due_date": iso(base - timedelta(days=15)), "status": "paid", "days_to_due": -15, "paid_at": iso(base - timedelta(days=14))},
            {"id": str(uuid.uuid4()), "user_id": user_id, "distributor_id": "dist-3", "distributor_name": "XYZ Pharma", "invoice_code": "INV-12511", "amount": 11200.00, "due_date": iso(base - timedelta(days=20)), "status": "paid", "days_to_due": -20, "paid_at": iso(base - timedelta(days=18))},
            {"id": str(uuid.uuid4()), "user_id": user_id, "distributor_id": "dist-2", "distributor_name": "Medline Distr.", "invoice_code": "INV-12440", "amount": 7850.00, "due_date": iso(base - timedelta(days=25)), "status": "paid", "days_to_due": -25, "paid_at": iso(base - timedelta(days=22))},
        ]
        await db.payments.insert_many(payments)

    if await db.returns.count_documents({"user_id": user_id}) == 0:
        returns = [
            {"id": str(uuid.uuid4()), "user_id": user_id, "product_name": "Paracetamol 650mg", "distributor_name": "Medline Distr.", "reason": "Damaged packaging", "qty": 10, "amount": 325.00, "status": "approved", "created_at": iso(base - timedelta(days=2))},
            {"id": str(uuid.uuid4()), "user_id": user_id, "product_name": "Atorvastatin 10mg", "distributor_name": "ABC Pharma", "reason": "Near expiry", "qty": 5, "amount": 390.00, "status": "requested", "created_at": iso(base - timedelta(hours=12))},
        ]
        await db.returns.insert_many(returns)

    if await db.shortbook.count_documents({"user_id": user_id}) == 0:
        shortbook = [
            {"id": str(uuid.uuid4()), "user_id": user_id, "product_id": "p-3", "product_name": "Metformin 500mg", "current_stock": 8, "min_level": 30, "suggested_qty": 50, "estimated_value": 1320.00},
            {"id": str(uuid.uuid4()), "user_id": user_id, "product_id": "p-12", "product_name": "Glimepiride 2mg", "current_stock": 12, "min_level": 25, "suggested_qty": 30, "estimated_value": 2052.00},
            {"id": str(uuid.uuid4()), "user_id": user_id, "product_id": "p-6", "product_name": "Cetirizine 10mg", "current_stock": 15, "min_level": 40, "suggested_qty": 60, "estimated_value": 1344.00},
            {"id": str(uuid.uuid4()), "user_id": user_id, "product_id": "p-11", "product_name": "Diclofenac 50mg", "current_stock": 5, "min_level": 25, "suggested_qty": 40, "estimated_value": 1204.00},
            {"id": str(uuid.uuid4()), "user_id": user_id, "product_id": "p-9", "product_name": "Amoxicillin 500mg", "current_stock": 18, "min_level": 50, "suggested_qty": 60, "estimated_value": 3960.00},
            {"id": str(uuid.uuid4()), "user_id": user_id, "product_id": "p-2", "product_name": "Paracetamol 650mg", "current_stock": 22, "min_level": 60, "suggested_qty": 80, "estimated_value": 2600.00},
            {"id": str(uuid.uuid4()), "user_id": user_id, "product_id": "p-8", "product_name": "Omeprazole 20mg", "current_stock": 10, "min_level": 30, "suggested_qty": 40, "estimated_value": 1808.00},
            {"id": str(uuid.uuid4()), "user_id": user_id, "product_id": "p-4", "product_name": "Amlodipine 5mg", "current_stock": 14, "min_level": 35, "suggested_qty": 45, "estimated_value": 1836.00},
        ]
        await db.shortbook.insert_many(shortbook)

    if await db.credit_notes.count_documents({"user_id": user_id}) == 0:
        credit_notes = [
            {"id": str(uuid.uuid4()), "code": "CN-2401", "user_id": user_id, "distributor_id": "dist-1", "order_id": None, "amount": 1240.00, "reason": "return-refund", "notes": "5 strips Atorvastatin returned — near expiry", "status": "issued", "created_at": iso(base - timedelta(days=4))},
            {"id": str(uuid.uuid4()), "code": "CN-2402", "user_id": user_id, "distributor_id": "dist-2", "order_id": None, "amount": 325.00, "reason": "damaged", "notes": "Damaged packaging — Paracetamol 650", "status": "issued", "created_at": iso(base - timedelta(days=2))},
        ]
        await db.credit_notes.insert_many(credit_notes)

    if await db.debit_notes.count_documents({"user_id": user_id}) == 0:
        debit_notes = [
            {"id": str(uuid.uuid4()), "code": "DN-2401", "user_id": user_id, "distributor_id": "dist-3", "order_id": None, "amount": 480.00, "reason": "short-supply", "notes": "Short by 8 strips Levocetirizine in INV-12891", "status": "issued", "created_at": iso(base - timedelta(days=1))},
        ]
        await db.debit_notes.insert_many(debit_notes)

    if await db.chat_messages.count_documents({"user_id": user_id}) == 0:
        chats = [
            {"id": str(uuid.uuid4()), "user_id": user_id, "distributor_id": "dist-1", "sender": "user", "message": "Hi, when will INV-12934 be delivered?", "read": True, "created_at": iso(base - timedelta(hours=5))},
            {"id": str(uuid.uuid4()), "user_id": user_id, "distributor_id": "dist-1", "sender": "distributor", "message": "Hi! INV-12934 will be delivered today by 6 PM. Driver Rajesh — 98XXXXXX21.", "read": True, "created_at": iso(base - timedelta(hours=4, minutes=58))},
            {"id": str(uuid.uuid4()), "user_id": user_id, "distributor_id": "dist-1", "sender": "user", "message": "Got it. Any scheme on Pantoprazole?", "read": True, "created_at": iso(base - timedelta(hours=4, minutes=50))},
            {"id": str(uuid.uuid4()), "user_id": user_id, "distributor_id": "dist-1", "sender": "distributor", "message": "Yes — 10+1 on Pan 40 this week. Bulk >₹10K gets extra 5% off.", "read": False, "created_at": iso(base - timedelta(hours=4, minutes=48))},
            {"id": str(uuid.uuid4()), "user_id": user_id, "distributor_id": "dist-3", "sender": "user", "message": "Please send latest price list for antibiotics.", "read": True, "created_at": iso(base - timedelta(days=1, hours=2))},
            {"id": str(uuid.uuid4()), "user_id": user_id, "distributor_id": "dist-3", "sender": "distributor", "message": "Sent on your email. New launch: Azithral-XL 200mg DT pack of 6 at ₹68 PTR.", "read": False, "created_at": iso(base - timedelta(days=1, hours=1, minutes=50))},
        ]
        await db.chat_messages.insert_many(chats)


# ============================================================
# AUTH ROUTES
# ============================================================
@api_router.post("/auth/send-otp")
async def send_otp(payload: SendOTPRequest):
    email = payload.email.lower().strip()
    otp = "".join(random.choices(string.digits, k=6))
    expires_at = now_utc() + timedelta(minutes=OTP_TTL_MINUTES)
    await db.otps.update_one(
        {"email": email},
        {"$set": {"email": email, "otp": otp, "expires_at": iso(expires_at), "attempts": 0}},
        upsert=True,
    )
    logger.info(f"[OTP] {email} → {otp}")
    # NOTE: In production, send via SendGrid here.
    response = {"success": True, "message": f"OTP sent to {email}"}
    if DEV_RETURN_OTP:
        response["dev_otp"] = otp  # only in preview/dev
    return response


@api_router.post("/auth/verify-otp")
async def verify_otp(payload: VerifyOTPRequest):
    email = payload.email.lower().strip()
    record = await db.otps.find_one({"email": email}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=400, detail="OTP not requested")
    if record["otp"] != payload.otp.strip():
        await db.otps.update_one({"email": email}, {"$inc": {"attempts": 1}})
        raise HTTPException(status_code=400, detail="Invalid OTP")
    if datetime.fromisoformat(record["expires_at"]) < now_utc():
        raise HTTPException(status_code=400, detail="OTP expired")

    # Get or create user
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        user = {
            "id": str(uuid.uuid4()),
            "email": email,
            "name": None,
            "phone": None,
            "shop_name": None,
            "gst": None,
            "address": None,
            "drug_license": None,
            "food_license": None,
            "onboarded": False,
            "created_at": iso(now_utc()),
        }
        await db.users.insert_one({**user})

    # Clean up OTP
    await db.otps.delete_one({"email": email})

    # Issue token
    token = create_token(user["id"])
    # Seed sample data ONLY for the demo account — all other users start empty (real)
    if email == DEMO_EMAIL:
        await seed_user_data(user["id"])
        await seed_demo_user_credit(user["id"])

    return {"success": True, "token": token, "user": user, "onboarded": user.get("onboarded", False)}


class LoginMethodRequest(BaseModel):
    email: EmailStr


class PasswordLoginRequest(BaseModel):
    email: EmailStr
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@api_router.post("/auth/login-method")
async def login_method(payload: LoginMethodRequest):
    """Tell the client whether this email logs in via password (staff) or OTP."""
    email = payload.email.lower().strip()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if user and user.get("password_hash") and (user.get("role") in STAFF_PASSWORD_ROLES):
        return {"method": "password", "exists": True, "name": user.get("name"), "role": user.get("role")}
    return {"method": "otp", "exists": bool(user)}


@api_router.post("/auth/login")
async def password_login(payload: PasswordLoginRequest):
    """Email + password login for staff accounts (manager / field_sales / delivery)."""
    email = payload.email.lower().strip()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not user.get("password_hash") or not user.get("active", True):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    if not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    token = create_token(user["id"])
    user.pop("password_hash", None)
    return {
        "success": True, "token": token, "user": user, "onboarded": True,
        "role": user.get("role"), "must_change_password": user.get("must_change_password", False),
    }


@api_router.post("/auth/change-password")
async def change_password(payload: ChangePasswordRequest, user: dict = Depends(get_current_user)):
    full = await db.users.find_one({"id": user["id"]})
    if not full or not full.get("password_hash"):
        raise HTTPException(400, "Password login not enabled for this account")
    if not verify_password(payload.current_password, full["password_hash"]):
        raise HTTPException(400, "Current password is incorrect")
    if len(payload.new_password) < 6:
        raise HTTPException(400, "New password must be at least 6 characters")
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"password_hash": hash_password(payload.new_password), "must_change_password": False}},
    )
    return {"success": True}


@api_router.post("/auth/onboard")
async def onboard(payload: OnboardRequest, user: dict = Depends(get_current_user)):
    update = {
        "name": payload.name.strip(),
        "phone": payload.phone.strip(),
        "shop_name": (payload.shop_name or "").strip() or None,
        "gst": (payload.gst or "").strip() or None,
        "address": (payload.address or "").strip() or None,
        "drug_license": (payload.drug_license or "").strip() or None,
        "food_license": (payload.food_license or "").strip() or None,
        "onboarded": True,
    }
    await db.users.update_one({"id": user["id"]}, {"$set": update})
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return {"success": True, "user": updated}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


# ============================================================
# DASHBOARD
# ============================================================
@api_router.get("/dashboard")
async def dashboard(user: dict = Depends(get_current_user)):
    uid = user["id"]
    today_orders = await db.orders.find({"user_id": uid}, {"_id": 0}).to_list(100)
    today_total = sum(o["total"] for o in today_orders if o["status"] in ("placed", "processing", "shipped"))

    payments = await db.payments.find({"user_id": uid, "status": {"$in": ["due", "overdue"]}}, {"_id": 0}).to_list(100)
    next_payment = sorted(payments, key=lambda p: p["due_date"])[0] if payments else None

    shortbook = await db.shortbook.find({"user_id": uid}, {"_id": 0}).to_list(100)
    shortbook_total = sum(s["estimated_value"] for s in shortbook)

    deliveries = [o for o in today_orders if o["status"] in ("placed", "processing", "shipped") and o.get("eta")]

    # Pick the worst-utilized credit line (for THIS user) as the warning subject
    cc_rows = await user_credit_rows(uid)
    worst_cc = max(
        cc_rows,
        key=lambda c: (c.get("credit_used", 0) / max(c.get("credit_limit", 1), 1)),
        default=None,
    )
    worst = None
    if worst_cc:
        wd = await db.distributors.find_one({"id": worst_cc["distributor_id"]}, {"_id": 0})
        if wd:
            worst = {"id": wd["id"], "short_name": wd["short_name"],
                     "credit_used": round(worst_cc.get("credit_used", 0), 2), "credit_limit": worst_cc.get("credit_limit", 0)}
    credit_pct = round((worst["credit_used"] / worst["credit_limit"]) * 100) if worst and worst["credit_limit"] else 0

    return {
        "today_orders": {
            "total": today_total,
            "count": len([o for o in today_orders if o["status"] in ("placed", "processing", "shipped")]),
        },
        "payment_due": {
            "amount": next_payment["amount"] if next_payment else 0,
            "distributor": next_payment["distributor_name"] if next_payment else None,
            "due_label": "Today" if next_payment and next_payment["days_to_due"] <= 0 else (f"in {next_payment['days_to_due']}d" if next_payment else None),
        },
        "ai_insights": {
            "sku_count": len(shortbook),
            "estimated_value": shortbook_total,
        },
        "deliveries": [
            {
                "invoice": f"INV-{o['code'].split('-')[1]}",
                "distributor": o["distributor_name"],
                "items": o["sku_count"],
                "eta_label": "ETA: " + (o.get("eta", "")[11:16] if o.get("eta") else "TBD"),
                "order_id": o["id"],
            }
            for o in deliveries[:3]
        ],
        "action_required": {
            "credit_warning": {
                "distributor_id": worst["id"] if worst else "",
                "distributor": worst["short_name"] if worst else "",
                "used_pct": credit_pct,
                "used": worst["credit_used"] if worst else 0,
                "limit": worst["credit_limit"] if worst else 0,
            },
            "backorder": {
                "product": "Azithromycin 500mg",
                "qty": 6,
                "eta": "Tomorrow",
            },
        },
        "profit_opportunities": [
            {"title": "High margin alternative", "subtitle": "Switch 3 SKUs to save ₹2,400/mo", "tag": "+18% margin"},
            {"title": "Bulk scheme available", "subtitle": "Order 10+1 on Pantoprazole this week", "tag": "Save ₹890"},
        ],
    }


# ============================================================
# CATALOG (Distributors + Products)
# ============================================================
@api_router.get("/distributors")
async def list_distributors(q: Optional[str] = None):
    query = {}
    if q:
        query["$or"] = [{"name": {"$regex": q, "$options": "i"}}, {"location": {"$regex": q, "$options": "i"}}]
    items = await db.distributors.find(query, {"_id": 0}).to_list(200)
    return items


@api_router.get("/distributors/{dist_id}")
async def get_distributor(dist_id: str, user: Optional[dict] = Depends(get_current_user)):
    d = await db.distributors.find_one({"id": dist_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Not found")
    prods = await db.products.find({"distributor_ids": dist_id}, {"_id": 0}).to_list(200)

    # User-specific stats if logged in
    stats = None
    last_chat = None
    recent_orders: list = []
    if user:
        orders = await db.orders.find({"user_id": user["id"], "distributor_id": dist_id}, {"_id": 0}).to_list(200)
        payments = await db.payments.find({"user_id": user["id"], "distributor_id": dist_id}, {"_id": 0}).to_list(200)
        total_spent = sum(o["total"] for o in orders)
        order_count = len(orders)
        unpaid = sum(p["amount"] for p in payments if p["status"] in ("due", "overdue"))
        last_order = max(orders, key=lambda o: o["created_at"]) if orders else None
        stats = {
            "total_spent": round(total_spent, 2),
            "order_count": order_count,
            "unpaid": round(unpaid, 2),
            "last_order_date": last_order["created_at"] if last_order else None,
        }
        # Recent 5 orders
        recent_orders = sorted(orders, key=lambda o: o["created_at"], reverse=True)[:5]
        # Last chat preview
        last_chat = await db.chat_messages.find_one(
            {"user_id": user["id"], "distributor_id": dist_id},
            {"_id": 0},
            sort=[("created_at", -1)],
        )

    # Contact details — derived (could be real fields in future)
    contact = {
        "phone": d.get("contact_phone") or "+91 22 6666 0000",
        "whatsapp": d.get("contact_whatsapp") or "+91 98765 43210",
        "email": d.get("contact_email") or f"sales@{d['short_name'].lower().replace(' ', '').replace('.', '')}.in",
        "address": d.get("address") or f"Plot 12, MIDC, {d['location']}, MH 400 0XX",
        "sales_rep": d.get("sales_rep") or {"name": "Rajesh Kumar", "phone": "+91 98765 43210", "designation": "Sr. Sales Executive"},
        "working_hours": "Mon–Sat 9 AM – 7 PM",
    }

    return {
        "distributor": d,
        "contact": contact,
        "products": prods,
        "stats": stats,
        "recent_orders": recent_orders,
        "last_chat": last_chat,
    }


@api_router.get("/products")
async def list_products(q: Optional[str] = None, category: Optional[str] = None, distributor_id: Optional[str] = None, limit: int = 50):
    query = {}
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"salt": {"$regex": q, "$options": "i"}},
            {"manufacturer": {"$regex": q, "$options": "i"}},
        ]
    if category:
        query["category"] = category
    if distributor_id:
        query["distributor_ids"] = distributor_id
    items = await db.products.find(query, {"_id": 0}).to_list(limit)
    return items


@api_router.get("/products/{pid}")
async def get_product(pid: str):
    p = await db.products.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Not found")

    # Build per-distributor offers (same shape as search/comprehensive)
    dist_map = {d["id"]: d for d in await db.distributors.find({}, {"_id": 0}).to_list(50)}
    offers: List[dict] = []
    for pr in (p.get("prices") or []):
        d = dist_map.get(pr["distributor_id"])
        if not d:
            continue
        offers.append({
            "distributor_id": pr["distributor_id"],
            "distributor_name": d["short_name"],
            "distributor_full_name": d["name"],
            "rating": d.get("rating"),
            "delivery_time": d.get("delivery_time"),
            "ptr": pr["ptr"],
            "mrp": pr.get("mrp", p["mrp"]),
            "scheme": pr.get("scheme"),
            "margin_pct": pr.get("margin_pct"),
            "qty_available": pr.get("qty_available", 0),
            "dist_discount_pct": pr.get("dist_discount_pct", 0),
            "gst_pct": pr.get("gst_pct", 12.0),
            "expiry": pr.get("expiry"),
            "delivery_eta_hours": pr.get("delivery_eta_hours", 24),
        })
    offers.sort(key=lambda x: x["ptr"])
    lowest = offers[0] if offers else None
    highest_margin = max(offers, key=lambda x: x.get("margin_pct", 0)) if offers else None

    # Variants — same SALT and same MANUFACTURER, different product
    variants = await db.products.find(
        {"salt": p["salt"], "manufacturer": p["manufacturer"], "id": {"$ne": pid}}, {"_id": 0}
    ).to_list(10)
    # Substitutes — same SALT, DIFFERENT MANUFACTURER (alternate brands)
    substitutes = await db.products.find(
        {"salt": p["salt"], "manufacturer": {"$ne": p["manufacturer"]}, "id": {"$ne": pid}}, {"_id": 0}
    ).to_list(20)

    # Older clients expect "distributors" list — keep for compat (list of dist objs that offer it)
    distributors = [dist_map[did] for did in p.get("distributor_ids", []) if did in dist_map]

    return {
        "product": p,
        "offers": offers,
        "lowest_cost": {"distributor_id": lowest["distributor_id"], "distributor_name": lowest["distributor_name"], "ptr": lowest["ptr"]} if lowest else None,
        "highest_margin": {"distributor_id": highest_margin["distributor_id"], "distributor_name": highest_margin["distributor_name"], "margin_pct": highest_margin.get("margin_pct")} if highest_margin else None,
        "distributors": distributors,
        "variants": variants,
        "substitutes": substitutes,
    }


# ============================================================
# CART
# ============================================================
class AddCartReq(BaseModel):
    product_id: str
    distributor_id: str
    qty: int = 1


@api_router.get("/cart")
async def get_cart(user: dict = Depends(get_current_user)):
    items = await db.cart.find({"user_id": user["id"]}, {"_id": 0}).to_list(100)
    # enrich
    detailed = []
    total = 0.0
    for it in items:
        p = await db.products.find_one({"id": it["product_id"]}, {"_id": 0})
        d = await db.distributors.find_one({"id": it["distributor_id"]}, {"_id": 0})
        if not p or not d:
            continue
        subtotal = p["ptr"] * it["qty"]
        total += subtotal
        detailed.append({**it, "product": p, "distributor": d, "subtotal": subtotal})
    return {"items": detailed, "total": total, "count": len(detailed)}


@api_router.post("/cart/items")
async def add_cart(req: AddCartReq, user: dict = Depends(get_current_user)):
    existing = await db.cart.find_one({"user_id": user["id"], "product_id": req.product_id, "distributor_id": req.distributor_id}, {"_id": 0})
    if existing:
        await db.cart.update_one(
            {"id": existing["id"]},
            {"$set": {"qty": existing["qty"] + req.qty}},
        )
        return {"success": True, "id": existing["id"]}
    item = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "product_id": req.product_id,
        "distributor_id": req.distributor_id,
        "qty": req.qty,
        "added_at": iso(now_utc()),
    }
    await db.cart.insert_one({**item})
    return {"success": True, "id": item["id"]}


class UpdateCartReq(BaseModel):
    qty: int


@api_router.patch("/cart/items/{item_id}")
async def update_cart(item_id: str, req: UpdateCartReq, user: dict = Depends(get_current_user)):
    if req.qty <= 0:
        await db.cart.delete_one({"id": item_id, "user_id": user["id"]})
        return {"success": True, "removed": True}
    await db.cart.update_one({"id": item_id, "user_id": user["id"]}, {"$set": {"qty": req.qty}})
    return {"success": True}


@api_router.delete("/cart/items/{item_id}")
async def remove_cart(item_id: str, user: dict = Depends(get_current_user)):
    await db.cart.delete_one({"id": item_id, "user_id": user["id"]})
    return {"success": True}


@api_router.delete("/cart")
async def clear_cart(user: dict = Depends(get_current_user)):
    await db.cart.delete_many({"user_id": user["id"]})
    return {"success": True}


@api_router.get("/cart/lookup")
async def cart_lookup(user: dict = Depends(get_current_user)):
    """Quick lookup of cart contents keyed by `{product_id}::{distributor_id}` so the UI
    can show 'in cart (qty)' indicators on search/product screens without fetching the
    full cart payload."""
    items = await db.cart.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
    lookup: dict = {}
    total = 0
    for it in items:
        key = f"{it['product_id']}::{it['distributor_id']}"
        lookup[key] = {"item_id": it["id"], "qty": it["qty"]}
        total += it["qty"]
    return {"items": lookup, "count": total, "unique": len(items)}


# ============================================================
# ORDERS
# ============================================================
class PlaceOrderQuery(BaseModel):
    payment_method: str = "cash"  # cash | credit


async def is_blacklisted(distributor_id: str, user_id: str) -> bool:
    """A customer blacklisted by a distributor cannot place orders with them."""
    cc = await db.customer_credit.find_one({"distributor_id": distributor_id, "user_id": user_id}, {"_id": 0})
    return bool(cc and cc.get("blacklisted"))


async def maybe_auto_accept(order_id: str, distributor: dict, cust_id: str) -> None:
    """Auto-accept a freshly-placed order when the distributor enabled
    'auto-accept (no overdue)' and the customer has no overdue payments."""
    settings = (distributor or {}).get("settings") or {}
    if not settings.get("auto_accept_no_overdue"):
        return
    overdue = await db.payments.count_documents({
        "distributor_id": distributor["id"], "user_id": cust_id, "status": "overdue",
    })
    if overdue:
        return
    o = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not o or o.get("status") != "placed":
        return
    timeline = o.get("timeline", []) + [{"status": "accepted", "at": iso(now_utc()), "by": "auto", "note": "Auto-accepted (no overdue)"}]
    await db.orders.update_one({"id": order_id}, {"$set": {
        "status": "accepted", "auto_accepted": True, "timeline": timeline,
    }})


@api_router.post("/orders")
async def place_order(payment_method: str = "cash", distributor_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = {"user_id": user["id"]}
    if distributor_id:
        query["distributor_id"] = distributor_id
    cart = await db.cart.find(query, {"_id": 0}).to_list(100)
    if not cart:
        raise HTTPException(400, "Cart is empty")
    pm = payment_method if payment_method in ("cash", "credit") else "cash"

    # Group by distributor → one order per distributor
    by_dist: dict = {}
    for it in cart:
        by_dist.setdefault(it["distributor_id"], []).append(it)

    code_suffix = random.randint(2400, 9999)
    orders_created = []
    for dist_id, items in by_dist.items():
        d = await db.distributors.find_one({"id": dist_id}, {"_id": 0})
        if await is_blacklisted(dist_id, user["id"]):
            raise HTTPException(403, f"You are blacklisted by {d['short_name'] if d else 'this distributor'} and cannot place orders. Please contact them.")
        total = 0.0
        order_items = []
        for it in items:
            p = await db.products.find_one({"id": it["product_id"]}, {"_id": 0})
            if not p:
                continue
            price_entry = next((pr for pr in (p.get("prices") or []) if pr["distributor_id"] == dist_id), None)
            unit = price_entry["ptr"] if price_entry else p["ptr"]
            line = unit * it["qty"]
            total += line
            # Enrich line with batch + expiry (would come from distributor in real life)
            batch_id = f"B{random.randint(1000, 9999)}{chr(65 + random.randint(0, 25))}"
            exp = now_utc() + timedelta(days=random.randint(540, 900))
            order_items.append({
                "product_id": p["id"],
                "name": p["name"],
                "qty_ordered": it["qty"],
                "qty": it["qty"],  # qty received (initially same; updated on delivery confirmation)
                "free_qty": 0,
                "price": unit,
                "mrp": p.get("mrp", 0),
                "discount_pct": (price_entry or {}).get("dist_discount_pct", 4.0),
                "gst_pct": 12.0,
                "batch": batch_id,
                "expiry": exp.strftime("%b %Y"),
            })
        # If credit, check + deduct the customer's credit line with this distributor
        if pm == "credit" and d:
            cc = await cc_get(dist_id, user["id"])
            available = (cc.get("credit_limit", 0) - cc.get("credit_used", 0))
            if total > available:
                raise HTTPException(400, f"Credit insufficient with {d['short_name']}: ₹{available:.0f} available, ₹{total:.0f} required")
            await cc_inc(dist_id, user["id"], total)
        # Real distributor invoice number (mimics F022526-A00XXXXX format)
        inv_num = f"F0{datetime.now().strftime('%m%y')}-A{random.randint(1000000, 9999999)}"
        order = {
            "id": str(uuid.uuid4()),
            "code": f"ORD-{code_suffix}",
            "invoice_number": inv_num,
            "user_id": user["id"],
            "items": order_items,
            "distributor_id": dist_id,
            "distributor_name": d["short_name"] if d else "Unknown",
            "sku_count": len(order_items),
            "total": total,
            "status": "placed",
            "payment_method": pm,
            "created_at": iso(now_utc()),
            "eta": iso(now_utc() + timedelta(hours=4)),
            "delivery_confirmed": False,
            "delivery_confirmed_at": None,
            "delivery_photo_url": None,
            "delivery_notes": None,
            "has_bill_pdf": random.random() > 0.3,  # ~70% of distributors uploaded a PDF bill
            "amount_paid_on_delivery": 0,
            "amount_on_credit": total if pm == "credit" else 0,
        }
        await db.orders.insert_one({**order})
        await maybe_auto_accept(order["id"], d, user["id"])
        fresh = await db.orders.find_one({"id": order["id"]}, {"_id": 0})
        orders_created.append(fresh or order)
        code_suffix += 1

    # Clear cart (only the placed items)
    if distributor_id:
        await db.cart.delete_many({"user_id": user["id"], "distributor_id": distributor_id})
    else:
        await db.cart.delete_many({"user_id": user["id"]})
    return {"success": True, "orders": orders_created}


@api_router.get("/orders")
async def list_orders(status: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = {"user_id": user["id"]}
    if status and status != "all":
        query["status"] = status
    items = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return items


@api_router.get("/orders/{order_id}")
async def get_order(order_id: str, user: dict = Depends(get_current_user)):
    o = await db.orders.find_one({"id": order_id, "user_id": user["id"]}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Not found")
    return o


# ============================================================
# PAYMENTS
# ============================================================
@api_router.get("/payments")
async def list_payments(status: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = {"user_id": user["id"]}
    if status and status != "all":
        query["status"] = status
    items = await db.payments.find(query, {"_id": 0}).sort("due_date", 1).to_list(200)
    total_due = sum(p["amount"] for p in items if p["status"] in ("due", "overdue"))
    total_overdue = sum(p["amount"] for p in items if p["status"] == "overdue")
    return {"items": items, "total_due": total_due, "total_overdue": total_overdue}


@api_router.post("/payments/{pid}/pay")
async def pay_invoice(pid: str, user: dict = Depends(get_current_user)):
    await db.payments.update_one(
        {"id": pid, "user_id": user["id"]},
        {"$set": {"status": "paid", "paid_at": iso(now_utc())}},
    )
    return {"success": True}


@api_router.get("/payments/summary")
async def payment_summary_v1(user: dict = Depends(get_current_user)):
    """Comprehensive payment overview for accounting (defined early to avoid /{pid} match)."""
    payments = await db.payments.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
    distributors = await db.distributors.find({}, {"_id": 0}).to_list(50)

    total_due = sum(p["amount"] for p in payments if p["status"] in ("due", "overdue"))
    total_overdue = sum(p["amount"] for p in payments if p["status"] == "overdue")
    total_paid_30d = sum(
        p["amount"] for p in payments
        if p["status"] == "paid" and p.get("paid_at") and (now_utc() - datetime.fromisoformat(p["paid_at"].replace("Z", "+00:00"))).days <= 30
    )
    _ccr = await db.customer_credit.find({"user_id": user["id"]}, {"_id": 0}).to_list(200)
    total_credit_taken = sum(c.get("credit_used", 0) for c in _ccr)
    total_credit_limit = sum(c.get("credit_limit", 0) for c in _ccr)

    today = now_utc()
    this_week = next_week = this_month = 0.0
    schedule_by_day: dict = {}
    for p in payments:
        if p["status"] not in ("due", "overdue"):
            continue
        try:
            due = datetime.fromisoformat(p["due_date"].replace("Z", "+00:00"))
        except Exception:
            continue
        diff_days = (due.date() - today.date()).days
        if 0 <= diff_days <= 7:
            this_week += p["amount"]
        if 7 < diff_days <= 14:
            next_week += p["amount"]
        if 0 <= diff_days <= 30:
            this_month += p["amount"]
        key = due.date().isoformat()
        schedule_by_day[key] = schedule_by_day.get(key, 0) + p["amount"]

    pending_cn = await db.credit_notes.find({"user_id": user["id"], "status": "pending"}, {"_id": 0}).to_list(100)
    on_hold = sum(c["amount"] for c in pending_cn)

    return {
        "total_credit_taken": round(total_credit_taken, 2),
        "total_credit_limit": round(total_credit_limit, 2),
        "credit_available": round(total_credit_limit - total_credit_taken, 2),
        "total_due": round(total_due, 2),
        "total_overdue": round(total_overdue, 2),
        "due_this_week": round(this_week, 2),
        "due_next_week": round(next_week, 2),
        "due_this_month": round(this_month, 2),
        "paid_last_30d": round(total_paid_30d, 2),
        "on_hold_disputes": round(on_hold, 2),
        "schedule_by_day": schedule_by_day,
    }


@api_router.get("/payments/{pid}")
async def get_payment(pid: str, user: dict = Depends(get_current_user)):
    p = await db.payments.find_one({"id": pid, "user_id": user["id"]}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Invoice not found")
    return p


# ============================================================
# ISSUES / REPORT PROBLEM
# ============================================================
class IssueReq(BaseModel):
    type: str  # invoice | order | delivery | other
    reference_id: Optional[str] = None
    reference_label: Optional[str] = None
    message: str


@api_router.post("/issues")
async def report_issue(req: IssueReq, user: dict = Depends(get_current_user)):
    item = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "type": req.type,
        "reference_id": req.reference_id,
        "reference_label": req.reference_label,
        "message": req.message.strip(),
        "status": "open",
        "created_at": iso(now_utc()),
    }
    await db.issues.insert_one({**item})
    return {"success": True, "item": item}


@api_router.get("/issues")
async def list_issues(user: dict = Depends(get_current_user)):
    items = await db.issues.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return items


# ============================================================
# RETURNS
# ============================================================
class CreateReturnReq(BaseModel):
    product_name: str
    distributor_name: str
    reason: str
    qty: int
    amount: float


@api_router.get("/returns")
async def list_returns(user: dict = Depends(get_current_user)):
    items = await db.returns.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return items


@api_router.post("/returns")
async def create_return(req: CreateReturnReq, user: dict = Depends(get_current_user)):
    # Find distributor by name (best-effort)
    dist = await db.distributors.find_one({"short_name": req.distributor_name}, {"_id": 0})
    dist_id = dist["id"] if dist else None

    item = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "distributor_id": dist_id,
        "product_name": req.product_name,
        "distributor_name": req.distributor_name,
        "reason": req.reason,
        "qty": req.qty,
        "amount": req.amount,
        "status": "requested",
        "created_at": iso(now_utc()),
    }
    await db.returns.insert_one({**item})

    # Auto-create a pending Credit Note (status=pending until distributor approves)
    if dist_id:
        cn = {
            "id": str(uuid.uuid4()),
            "code": f"CN-R{random.randint(2400, 9999)}",
            "user_id": user["id"],
            "distributor_id": dist_id,
            "order_id": None,
            "return_id": item["id"],
            "amount": req.amount,
            "reason": req.reason,
            "notes": f"Return: {req.qty} units of {req.product_name}",
            "status": "pending",  # pending → issued (on approval), credit_used adjusted only when issued
            "created_at": iso(now_utc()),
        }
        await db.credit_notes.insert_one({**cn})

    return {"success": True, "item": item}


# Approve a return → flip credit note to "issued" and reduce credit_used
@api_router.post("/returns/{return_id}/approve")
async def approve_return(return_id: str, user: dict = Depends(get_current_user)):
    ret = await db.returns.find_one({"id": return_id, "user_id": user["id"]}, {"_id": 0})
    if not ret:
        raise HTTPException(404, "Not found")
    await db.returns.update_one({"id": return_id}, {"$set": {"status": "approved"}})
    cn = await db.credit_notes.find_one({"return_id": return_id, "user_id": user["id"]}, {"_id": 0})
    if cn and cn.get("status") == "pending":
        await db.credit_notes.update_one({"id": cn["id"]}, {"$set": {"status": "issued"}})
        if cn.get("distributor_id"):
            await cc_inc(cn["distributor_id"], user["id"], -cn["amount"])
    return {"success": True}


# ============================================================
# SHORTBOOK
# ============================================================
@api_router.get("/shortbook")
async def list_shortbook(user: dict = Depends(get_current_user)):
    items = await db.shortbook.find({"user_id": user["id"]}, {"_id": 0}).to_list(200)
    total = sum(s["estimated_value"] for s in items)
    return {"items": items, "total": total, "count": len(items)}


@api_router.post("/shortbook/{sid}/order")
async def order_shortbook_item(sid: str, user: dict = Depends(get_current_user)):
    item = await db.shortbook.find_one({"id": sid, "user_id": user["id"]}, {"_id": 0})
    if not item:
        raise HTTPException(404, "Not found")
    p = await db.products.find_one({"id": item["product_id"]}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Product missing")
    # Add to cart with best distributor
    await db.cart.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "product_id": p["id"],
        "distributor_id": p["best_distributor_id"],
        "qty": item["suggested_qty"],
        "added_at": iso(now_utc()),
    })
    await db.shortbook.delete_one({"id": sid})
    return {"success": True}


# ============================================================
# OCR — Scan/Upload Bill/Prescription
# ============================================================
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")


class ScanReq(BaseModel):
    image_base64: str  # data URI or raw base64
    mode: Optional[str] = "auto"  # "medicine" | "prescription" | "auto"


SCAN_PROMPTS = {
    "medicine": (
        "You are looking at a photo of a single medicine package (box, strip, vial or bottle). "
        "Identify ONE medicine. Read the brand name, generic salt/composition, strength (mg/ml), "
        "pack size, and manufacturer if visible. Return STRICT JSON, NO PROSE:\n"
        "{\"mode\":\"medicine\",\"items\":[{\"name\":\"<brand+strength e.g. Crocin 650mg>\",\"salt\":\"<generic e.g. Paracetamol>\",\"strength\":\"<e.g. 650mg>\",\"pack\":\"<e.g. 15 tablets>\",\"manufacturer\":\"<brand owner>\",\"qty\":1}]}\n"
        "If unsure of any field, leave it as empty string. If no medicine is visible, return {\"mode\":\"medicine\",\"items\":[]}."
    ),
    "prescription": (
        "You are looking at a doctor's prescription OR a pharmacy bill/invoice. Extract EVERY medicine listed. "
        "For each medicine, capture name + strength + quantity if mentioned. Return STRICT JSON, NO PROSE:\n"
        "{\"mode\":\"prescription\",\"items\":[{\"name\":\"<brand or generic + strength>\",\"salt\":\"\",\"strength\":\"\",\"pack\":\"\",\"manufacturer\":\"\",\"qty\":<integer or 1 if not specified>}]}\n"
        "Skip non-medicine items (consultation fees, GST line, etc.). If no medicines are readable, return items: []."
    ),
    "auto": (
        "You are a pharmacy OCR assistant. First decide if the image is (a) a single medicine package/box/strip "
        "OR (b) a multi-medicine document such as a prescription or pharmacy bill. Then extract structured info. "
        "Return STRICT JSON, NO PROSE:\n"
        "{\"mode\":\"medicine\" or \"prescription\",\"items\":[{\"name\":\"<brand+strength>\",\"salt\":\"<generic>\",\"strength\":\"<mg/ml>\",\"pack\":\"<pack size>\",\"manufacturer\":\"<owner>\",\"qty\":<integer>}]}\n"
        "Be conservative. Empty string for unknown fields. items=[] if nothing readable."
    ),
}


@api_router.post("/scan/extract")
async def scan_extract(req: ScanReq, user: dict = Depends(get_current_user)):
    """Extract medicines from a medicine-box photo, a prescription or a pharmacy bill,
    then match each extracted medicine against the catalog and return the best
    distributor offer + up to 2 alternates per medicine."""
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "OCR not configured (missing EMERGENT_LLM_KEY)")

    mode = (req.mode or "auto").lower()
    if mode not in SCAN_PROMPTS:
        mode = "auto"

    img = req.image_base64
    if "," in img and img.startswith("data:"):
        img = img.split(",", 1)[1]

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"scan-{user['id']}-{int(now_utc().timestamp())}",
        system_message=SCAN_PROMPTS[mode],
    ).with_model("openai", "gpt-4o-mini")

    msg = UserMessage(
        text=(
            "Analyze this image and return JSON only."
            if mode != "auto"
            else "Decide if this is a single medicine package or a prescription/bill, then return JSON only."
        ),
        file_contents=[ImageContent(image_base64=img)],
    )
    try:
        raw = await chat.send_message(msg)
    except Exception as e:
        logger.exception("OCR failed")
        raise HTTPException(500, f"OCR failed: {e}")

    import re as _re, json as _json
    text = (raw or "").strip()
    # extract JSON object
    m = _re.search(r"\{.*\}", text, _re.S)
    parsed: dict = {"mode": mode, "items": []}
    if m:
        try:
            parsed = _json.loads(m.group(0))
        except Exception:
            parsed = {"mode": mode, "items": []}
    if "items" not in parsed or not isinstance(parsed.get("items"), list):
        parsed["items"] = []
    detected_mode = parsed.get("mode") or mode
    items_raw = parsed["items"][:30]

    # Match each extracted item against catalog
    matches: List[dict] = []
    for entry in items_raw:
        if not isinstance(entry, dict):
            continue
        name = (entry.get("name") or "").strip()
        salt = (entry.get("salt") or "").strip()
        strength = (entry.get("strength") or "").strip()
        pack = (entry.get("pack") or "").strip()
        manufacturer = (entry.get("manufacturer") or "").strip()
        qty = entry.get("qty")
        try:
            qty = max(1, int(qty)) if qty is not None else 1
        except Exception:
            qty = 1

        # Build search tokens — first significant word(s) of name and salt
        scan_label = name or salt or "Unknown"
        tokens: List[str] = []
        for src in [name, salt, manufacturer]:
            for tok in _re.split(r"[\s\-\/]+", src):
                tok = tok.strip().lower()
                if len(tok) >= 3 and tok not in {"tablet", "tablets", "tab", "cap", "capsule", "syrup", "injection", "inj", "mg", "ml", "drop", "drops"} and not tok.isdigit():
                    tokens.append(tok)
        # de-dupe preserve order
        seen_t: set = set()
        tokens = [t for t in tokens if not (t in seen_t or seen_t.add(t))]

        candidates: List[dict] = []
        for tok in tokens[:3]:
            found = await db.products.find(
                {"$or": [
                    {"name": {"$regex": tok, "$options": "i"}},
                    {"salt": {"$regex": tok, "$options": "i"}},
                    {"manufacturer": {"$regex": tok, "$options": "i"}},
                ]},
                {"_id": 0},
            ).to_list(8)
            for f in found:
                if not any(c["id"] == f["id"] for c in candidates):
                    candidates.append(f)
            if len(candidates) >= 6:
                break

        # rank — prefer those whose name contains the strength
        if strength:
            strength_clean = strength.lower().replace(" ", "")
            candidates.sort(
                key=lambda p: 0 if strength_clean in p.get("name", "").lower().replace(" ", "") else 1
            )

        if candidates:
            best = candidates[0]
            dist = await db.distributors.find_one({"id": best["best_distributor_id"]}, {"_id": 0})
            matches.append({
                "scanned": {
                    "label": scan_label,
                    "name": name, "salt": salt, "strength": strength,
                    "pack": pack, "manufacturer": manufacturer, "qty": qty,
                },
                "product": best,
                "best_distributor": dist,
                "alternatives": candidates[1:3],
            })
        else:
            matches.append({
                "scanned": {
                    "label": scan_label,
                    "name": name, "salt": salt, "strength": strength,
                    "pack": pack, "manufacturer": manufacturer, "qty": qty,
                },
                "product": None,
                "best_distributor": None,
                "alternatives": [],
            })

    return {
        "mode": detected_mode,
        "extracted": [m.get("scanned", {}).get("label", "") for m in matches],
        "matches": matches,
    }


# ============================================================
# REPORTS / ANALYTICS
# ============================================================
@api_router.get("/reports/analytics")
async def report_analytics(user: dict = Depends(get_current_user)):
    """Sales analytics: total spend, orders, by-distributor, by-month."""
    orders = await db.orders.find({"user_id": user["id"]}, {"_id": 0}).to_list(1000)
    total_spend = sum(o["total"] for o in orders)
    total_orders = len(orders)
    avg_order = total_spend / total_orders if total_orders else 0
    delivered = sum(1 for o in orders if o["status"] == "delivered")

    # by distributor
    by_dist: dict = {}
    for o in orders:
        d = by_dist.setdefault(o["distributor_name"], {"name": o["distributor_name"], "orders": 0, "spend": 0.0})
        d["orders"] += 1
        d["spend"] += o["total"]
    top_distributors = sorted(by_dist.values(), key=lambda x: x["spend"], reverse=True)[:5]

    # by month (last 6)
    from collections import defaultdict
    months: dict = defaultdict(lambda: {"month": "", "spend": 0.0, "orders": 0})
    for o in orders:
        try:
            dt = datetime.fromisoformat(o["created_at"])
            key = dt.strftime("%Y-%m")
            months[key]["month"] = dt.strftime("%b %y")
            months[key]["spend"] += o["total"]
            months[key]["orders"] += 1
        except Exception:
            pass
    monthly = sorted(months.items())[-6:]
    by_month = [v for _, v in monthly]

    return {
        "summary": {
            "total_spend": total_spend,
            "total_orders": total_orders,
            "avg_order_value": avg_order,
            "delivered_count": delivered,
        },
        "top_distributors": top_distributors,
        "by_month": by_month,
    }


@api_router.get("/reports/gst-invoices")
async def report_gst(user: dict = Depends(get_current_user)):
    """List of GST-eligible invoices: all orders/payments grouped for tax purposes."""
    payments = await db.payments.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
    items = []
    total_taxable = 0.0
    for p in payments:
        # Assume 12% GST included in invoice (typical pharma rate)
        gst_rate = 0.12
        taxable = round(p["amount"] / (1 + gst_rate), 2)
        tax = round(p["amount"] - taxable, 2)
        total_taxable += taxable
        items.append({
            "invoice_code": p["invoice_code"],
            "distributor": p["distributor_name"],
            "date": p.get("paid_at") or p["due_date"],
            "taxable": taxable,
            "gst": tax,
            "total": p["amount"],
            "status": p["status"],
            "id": p["id"],
        })
    items.sort(key=lambda x: x["date"], reverse=True)
    return {
        "items": items,
        "total_taxable": total_taxable,
        "total_gst": sum(i["gst"] for i in items),
        "total_invoice": sum(i["total"] for i in items),
    }


@api_router.get("/reports/profit")
async def report_profit(user: dict = Depends(get_current_user)):
    """Profit report: estimated margin earned per SKU based on orders placed."""
    orders = await db.orders.find({"user_id": user["id"]}, {"_id": 0}).to_list(1000)
    per_sku: dict = {}
    total_value = 0.0
    total_margin = 0.0
    for o in orders:
        for line in o.get("items", []):
            pid = line.get("product_id")
            if not pid:
                continue
            prod = await db.products.find_one({"id": pid}, {"_id": 0})
            if not prod:
                continue
            margin_pct = prod.get("margin_pct", 0) / 100.0
            line_value = line["qty"] * line["price"]
            line_margin = line_value * margin_pct
            total_value += line_value
            total_margin += line_margin
            row = per_sku.setdefault(pid, {
                "product_id": pid,
                "name": prod["name"],
                "qty": 0,
                "value": 0.0,
                "margin": 0.0,
                "margin_pct": prod.get("margin_pct", 0),
            })
            row["qty"] += line["qty"]
            row["value"] += line_value
            row["margin"] += line_margin
    top_sku = sorted(per_sku.values(), key=lambda x: x["margin"], reverse=True)[:8]
    return {
        "summary": {
            "total_value": total_value,
            "total_margin": total_margin,
            "avg_margin_pct": (total_margin / total_value * 100) if total_value else 0,
        },
        "top_sku": top_sku,
    }


# ============================================================
# PROFILE
# ============================================================
class ProfileUpdateReq(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    shop_name: Optional[str] = None
    gst: Optional[str] = None
    address: Optional[str] = None
    drug_license: Optional[str] = None
    food_license: Optional[str] = None


@api_router.patch("/auth/profile")
async def update_profile(req: ProfileUpdateReq, user: dict = Depends(get_current_user)):
    update = {k: v.strip() for k, v in req.model_dump(exclude_none=True).items() if isinstance(v, str)}
    if update:
        await db.users.update_one({"id": user["id"]}, {"$set": update})
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return updated


# ============================================================
# HEALTH / ROOT
# ============================================================
@api_router.get("/search/comprehensive")
async def search_comprehensive(q: str, user: dict = Depends(get_current_user)):
    """Rich search: shows every distributor offering this medicine + alternate-brand substitutes."""
    q = (q or "").strip()
    if not q:
        return {"matches": [], "alternatives": []}

    direct = await db.products.find(
        {"$or": [{"name": {"$regex": q, "$options": "i"}}, {"manufacturer": {"$regex": q, "$options": "i"}}]},
        {"_id": 0},
    ).to_list(20)

    # Find substitutes — same salt, different products
    salts = list({p["salt"] for p in direct})
    seen_ids = {p["id"] for p in direct}
    alternatives_raw: List[dict] = []
    for salt in salts:
        alts = await db.products.find(
            {"salt": salt, "id": {"$nin": list(seen_ids)}}, {"_id": 0}
        ).to_list(10)
        alternatives_raw.extend(alts)
    seen_ids.update(a["id"] for a in alternatives_raw)

    # If salt-based query produced no direct hits, treat as salt search
    if not direct:
        direct = await db.products.find(
            {"salt": {"$regex": q, "$options": "i"}}, {"_id": 0}
        ).to_list(20)

    dist_map = {d["id"]: d for d in await db.distributors.find({}, {"_id": 0}).to_list(50)}

    def build_row(p: dict) -> dict:
        prices = p.get("prices") or []
        offers = []
        for pr in prices:
            d = dist_map.get(pr["distributor_id"])
            if not d:
                continue
            offers.append({
                "distributor_id": pr["distributor_id"],
                "distributor_name": d["short_name"],
                "rating": d["rating"],
                "delivery_time": d["delivery_time"],
                "ptr": pr["ptr"],
                "mrp": pr.get("mrp", p["mrp"]),
                "scheme": pr.get("scheme"),
                "margin_pct": pr.get("margin_pct"),
                "qty_available": pr.get("qty_available", 0),
                "dist_discount_pct": pr.get("dist_discount_pct", 0),
                "gst_pct": pr.get("gst_pct", 12.0),
                "expiry": pr.get("expiry"),
                "delivery_eta_hours": pr.get("delivery_eta_hours", 24),
            })
        offers.sort(key=lambda x: x["ptr"])
        lowest = offers[0] if offers else None
        highest_margin = max(offers, key=lambda x: x["margin_pct"]) if offers else None
        return {
            "product": {
                "id": p["id"], "name": p["name"], "salt": p["salt"], "manufacturer": p["manufacturer"],
                "pack": p["pack"], "mrp": p["mrp"], "image_emoji": p.get("image_emoji", "💊"),
                "category": p.get("category"),
            },
            "offers": offers,
            "lowest_cost": {"distributor_id": lowest["distributor_id"], "distributor_name": lowest["distributor_name"], "ptr": lowest["ptr"]} if lowest else None,
            "highest_margin": {"distributor_id": highest_margin["distributor_id"], "distributor_name": highest_margin["distributor_name"], "margin_pct": highest_margin["margin_pct"]} if highest_margin else None,
        }

    return {
        "matches": [build_row(p) for p in direct],
        "alternatives": [build_row(p) for p in alternatives_raw],
    }


# ============================================================
# PAYMENT SUMMARY (Total credit + Upcoming dues schedule)
# ============================================================
@api_router.get("/payments/summary")
async def payment_summary(user: dict = Depends(get_current_user)):
    """Comprehensive payment overview for accounting."""
    payments = await db.payments.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
    distributors = await db.distributors.find({}, {"_id": 0}).to_list(50)

    total_due = sum(p["amount"] for p in payments if p["status"] in ("due", "overdue"))
    total_overdue = sum(p["amount"] for p in payments if p["status"] == "overdue")
    total_paid_30d = sum(
        p["amount"] for p in payments
        if p["status"] == "paid" and p.get("paid_at") and (now_utc() - datetime.fromisoformat(p["paid_at"].replace("Z", "+00:00"))).days <= 30
    )
    _ccr = await db.customer_credit.find({"user_id": user["id"]}, {"_id": 0}).to_list(200)
    total_credit_taken = sum(c.get("credit_used", 0) for c in _ccr)
    total_credit_limit = sum(c.get("credit_limit", 0) for c in _ccr)

    # Upcoming dues schedule: this week / next week / this month
    today = now_utc()
    this_week = next_week = this_month = 0.0
    schedule_by_day: dict = {}
    for p in payments:
        if p["status"] not in ("due", "overdue"):
            continue
        try:
            due = datetime.fromisoformat(p["due_date"].replace("Z", "+00:00"))
        except Exception:
            continue
        diff_days = (due.date() - today.date()).days
        if 0 <= diff_days <= 7:
            this_week += p["amount"]
        if 7 < diff_days <= 14:
            next_week += p["amount"]
        if 0 <= diff_days <= 30:
            this_month += p["amount"]
        # Per-day for calendar heat map
        key = due.date().isoformat()
        schedule_by_day[key] = schedule_by_day.get(key, 0) + p["amount"]

    # On-hold amount from pending credit notes (returns under review)
    pending_cn = await db.credit_notes.find({"user_id": user["id"], "status": "pending"}, {"_id": 0}).to_list(100)
    on_hold = sum(c["amount"] for c in pending_cn)

    return {
        "total_credit_taken": round(total_credit_taken, 2),
        "total_credit_limit": round(total_credit_limit, 2),
        "credit_available": round(total_credit_limit - total_credit_taken, 2),
        "total_due": round(total_due, 2),
        "total_overdue": round(total_overdue, 2),
        "due_this_week": round(this_week, 2),
        "due_next_week": round(next_week, 2),
        "due_this_month": round(this_month, 2),
        "paid_last_30d": round(total_paid_30d, 2),
        "on_hold_disputes": round(on_hold, 2),
        "schedule_by_day": schedule_by_day,  # dict iso-date → amount
    }


# ============================================================
# CART OPTIMIZER — auto-switch to lowest PTR distributor
# ============================================================
@api_router.post("/cart/optimize")
async def optimize_cart(user: dict = Depends(get_current_user)):
    """Switch each cart line to the distributor with lowest PTR for the same product."""
    cart = await db.cart.find({"user_id": user["id"]}, {"_id": 0}).to_list(100)
    moved = 0
    savings = 0.0
    for it in cart:
        p = await db.products.find_one({"id": it["product_id"]}, {"_id": 0})
        if not p or not p.get("prices"):
            continue
        # Find lowest-PTR distributor among current distributors
        lowest = min(p["prices"], key=lambda x: x["ptr"])
        current = next((x for x in p["prices"] if x["distributor_id"] == it["distributor_id"]), None)
        if current and lowest["distributor_id"] != it["distributor_id"]:
            save = (current["ptr"] - lowest["ptr"]) * it["qty"]
            if save > 0:
                await db.cart.update_one(
                    {"id": it["id"]},
                    {"$set": {"distributor_id": lowest["distributor_id"]}},
                )
                moved += 1
                savings += save
    return {"success": True, "moved": moved, "savings": round(savings, 2)}


# ============================================================
# SUBSTITUTE SUGGESTIONS — for cart line items
# ============================================================
@api_router.get("/cart/substitutes")
async def cart_substitutes(user: dict = Depends(get_current_user)):
    """For each cart item, suggest a cheaper same-salt brand if available."""
    cart = await db.cart.find({"user_id": user["id"]}, {"_id": 0}).to_list(100)
    out = []
    for it in cart:
        p = await db.products.find_one({"id": it["product_id"]}, {"_id": 0})
        if not p:
            continue
        current_ptr = next((x["ptr"] for x in (p.get("prices") or []) if x["distributor_id"] == it["distributor_id"]), p.get("ptr"))
        # Find same-salt cheaper alternative
        alts = await db.products.find({"salt": p["salt"], "id": {"$ne": p["id"]}}, {"_id": 0}).to_list(20)
        best_alt = None
        best_save = 0
        for a in alts:
            for pr in (a.get("prices") or []):
                save = (current_ptr - pr["ptr"]) * it["qty"]
                if save > best_save:
                    best_save = save
                    best_alt = {"product": a, "offer": pr, "save_per_unit": current_ptr - pr["ptr"], "total_save": save}
        if best_alt:
            out.append({
                "cart_item_id": it["id"],
                "current_product": {"id": p["id"], "name": p["name"], "ptr": current_ptr},
                "suggested": {
                    "product_id": best_alt["product"]["id"],
                    "product_name": best_alt["product"]["name"],
                    "manufacturer": best_alt["product"]["manufacturer"],
                    "distributor_id": best_alt["offer"]["distributor_id"],
                    "ptr": best_alt["offer"]["ptr"],
                    "total_save": round(best_alt["total_save"], 2),
                },
            })
    return out


@api_router.post("/cart/items/{item_id}/swap")
async def swap_cart_item(item_id: str, body: dict, user: dict = Depends(get_current_user)):
    """Swap a cart line to a different product+distributor."""
    new_pid = body.get("product_id")
    new_did = body.get("distributor_id")
    if not new_pid or not new_did:
        raise HTTPException(400, "product_id and distributor_id required")
    await db.cart.update_one(
        {"id": item_id, "user_id": user["id"]},
        {"$set": {"product_id": new_pid, "distributor_id": new_did}},
    )
    return {"success": True}


# ============================================================
# ORDER TEMPLATES — save/load recurring carts
# ============================================================
class TemplateReq(BaseModel):
    name: str


@api_router.post("/templates")
async def save_template(req: TemplateReq, user: dict = Depends(get_current_user)):
    """Save the current cart as a named template."""
    cart = await db.cart.find({"user_id": user["id"]}, {"_id": 0}).to_list(100)
    if not cart:
        raise HTTPException(400, "Cart is empty")
    tpl = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "name": req.name.strip(),
        "items": [{"product_id": c["product_id"], "distributor_id": c["distributor_id"], "qty": c["qty"]} for c in cart],
        "created_at": iso(now_utc()),
    }
    await db.templates.insert_one({**tpl})
    return {"success": True, "item": tpl}


@api_router.get("/templates")
async def list_templates(user: dict = Depends(get_current_user)):
    items = await db.templates.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    # Enrich with item count + estimated value
    for t in items:
        total = 0.0
        for it in t["items"]:
            p = await db.products.find_one({"id": it["product_id"]}, {"_id": 0})
            if p:
                pr = next((x["ptr"] for x in (p.get("prices") or []) if x["distributor_id"] == it["distributor_id"]), p.get("ptr", 0))
                total += pr * it["qty"]
        t["estimated_value"] = round(total, 2)
        t["sku_count"] = len(t["items"])
    return items


@api_router.post("/templates/{tid}/load")
async def load_template(tid: str, user: dict = Depends(get_current_user)):
    tpl = await db.templates.find_one({"id": tid, "user_id": user["id"]}, {"_id": 0})
    if not tpl:
        raise HTTPException(404, "Template not found")
    for it in tpl["items"]:
        # Upsert into cart (merge qty if exists)
        existing = await db.cart.find_one(
            {"user_id": user["id"], "product_id": it["product_id"], "distributor_id": it["distributor_id"]},
            {"_id": 0},
        )
        if existing:
            await db.cart.update_one({"id": existing["id"]}, {"$inc": {"qty": it["qty"]}})
        else:
            await db.cart.insert_one({
                "id": str(uuid.uuid4()),
                "user_id": user["id"],
                "product_id": it["product_id"],
                "distributor_id": it["distributor_id"],
                "qty": it["qty"],
                "added_at": iso(now_utc()),
            })
    return {"success": True, "added": len(tpl["items"])}


@api_router.delete("/templates/{tid}")
async def delete_template(tid: str, user: dict = Depends(get_current_user)):
    await db.templates.delete_one({"id": tid, "user_id": user["id"]})
    return {"success": True}


# ============================================================
# FAVOURITES / WATCHLIST
# ============================================================
class FavReq(BaseModel):
    product_id: str


@api_router.post("/favourites")
async def add_favourite(req: FavReq, user: dict = Depends(get_current_user)):
    await db.favourites.update_one(
        {"user_id": user["id"], "product_id": req.product_id},
        {"$set": {"user_id": user["id"], "product_id": req.product_id, "added_at": iso(now_utc())}},
        upsert=True,
    )
    return {"success": True}


@api_router.delete("/favourites/{pid}")
async def del_favourite(pid: str, user: dict = Depends(get_current_user)):
    await db.favourites.delete_one({"user_id": user["id"], "product_id": pid})
    return {"success": True}


@api_router.get("/favourites")
async def list_favourites(user: dict = Depends(get_current_user)):
    favs = await db.favourites.find({"user_id": user["id"]}, {"_id": 0}).sort("added_at", -1).to_list(200)
    out = []
    for f in favs:
        p = await db.products.find_one({"id": f["product_id"]}, {"_id": 0})
        if p:
            out.append({**p, "favourited_at": f["added_at"]})
    return out


# ============================================================
# RECENTLY VIEWED
# ============================================================
@api_router.post("/recent/{pid}")
async def add_recent(pid: str, user: dict = Depends(get_current_user)):
    await db.recent_views.update_one(
        {"user_id": user["id"], "product_id": pid},
        {"$set": {"user_id": user["id"], "product_id": pid, "viewed_at": iso(now_utc())}},
        upsert=True,
    )
    return {"success": True}


@api_router.get("/recent")
async def list_recent(user: dict = Depends(get_current_user)):
    recent = await db.recent_views.find({"user_id": user["id"]}, {"_id": 0}).sort("viewed_at", -1).to_list(15)
    out = []
    for r in recent:
        p = await db.products.find_one({"id": r["product_id"]}, {"_id": 0})
        if p:
            out.append(p)
    return out


# ============================================================
# MARGIN ANALYZER (by category)
# ============================================================
@api_router.get("/analytics/margin-by-category")
async def margin_by_category(user: dict = Depends(get_current_user)):
    """Aggregate orders by product category to show margin contribution."""
    orders = await db.orders.find({"user_id": user["id"], "status": {"$in": ["delivered", "shipped", "processing"]}}, {"_id": 0}).to_list(500)
    cat_data: dict = {}
    for o in orders:
        for it in o.get("items", []):
            p = await db.products.find_one({"id": it["product_id"]}, {"_id": 0})
            if not p:
                continue
            cat = p.get("category", "Other")
            margin_pct = p.get("margin_pct", 20)
            spend = it["price"] * it["qty"]
            profit = spend * (margin_pct / 100)
            entry = cat_data.setdefault(cat, {"spend": 0, "profit": 0, "items": 0})
            entry["spend"] += spend
            entry["profit"] += profit
            entry["items"] += it["qty"]
    rows = [
        {
            "category": k,
            "spend": round(v["spend"], 2),
            "profit": round(v["profit"], 2),
            "margin_pct": round((v["profit"] / v["spend"]) * 100, 1) if v["spend"] > 0 else 0,
            "items": v["items"],
        }
        for k, v in cat_data.items()
    ]
    rows.sort(key=lambda r: r["profit"], reverse=True)
    return {
        "rows": rows,
        "total_spend": round(sum(r["spend"] for r in rows), 2),
        "total_profit": round(sum(r["profit"] for r in rows), 2),
    }


# ============================================================
# SMART REORDER PREDICTOR
# ============================================================
@api_router.get("/analytics/reorder-predictor")
async def reorder_predictor(user: dict = Depends(get_current_user)):
    """Predict which SKUs need reordering based on order history.

    For each SKU ordered in the last 90 days, compute monthly avg → suggest
    quantity if days_since_last >= avg_cycle.
    """
    orders = await db.orders.find(
        {"user_id": user["id"], "status": {"$in": ["delivered", "shipped"]}},
        {"_id": 0},
    ).to_list(500)
    sku_data: dict = {}
    for o in orders:
        try:
            d = datetime.fromisoformat(o["created_at"].replace("Z", "+00:00"))
        except Exception:
            continue
        for it in o.get("items", []):
            pid = it["product_id"]
            entry = sku_data.setdefault(pid, {"qty": 0, "occurrences": [], "name": it["name"]})
            entry["qty"] += it["qty"]
            entry["occurrences"].append(d)

    now = now_utc()
    suggestions = []
    for pid, info in sku_data.items():
        info["occurrences"].sort()
        if len(info["occurrences"]) < 1:
            continue
        last_order = info["occurrences"][-1]
        days_since = (now - last_order).days
        # estimated cycle = total days span / orders. fallback 30
        if len(info["occurrences"]) >= 2:
            span = (info["occurrences"][-1] - info["occurrences"][0]).days
            cycle = max(7, span / max(len(info["occurrences"]) - 1, 1))
        else:
            cycle = 30
        urgency = days_since / cycle
        if urgency >= 0.7:
            p = await db.products.find_one({"id": pid}, {"_id": 0})
            if not p:
                continue
            avg_qty = round(info["qty"] / len(info["occurrences"]))
            suggestions.append({
                "product_id": pid,
                "product": p,
                "avg_qty": avg_qty,
                "days_since": days_since,
                "cycle_days": round(cycle),
                "urgency": round(urgency, 2),
                "suggested_qty": avg_qty,
            })
    suggestions.sort(key=lambda s: s["urgency"], reverse=True)
    return suggestions[:20]


# ============================================================
# DISTRIBUTOR COMPARE (A vs B)
# ============================================================
@api_router.get("/distributors/compare/{a_id}/{b_id}")
async def compare_distributors(a_id: str, b_id: str, user: dict = Depends(get_current_user)):
    a = await db.distributors.find_one({"id": a_id}, {"_id": 0})
    b = await db.distributors.find_one({"id": b_id}, {"_id": 0})
    if not a or not b:
        raise HTTPException(404, "Distributor not found")

    async def stats_for(did: str):
        orders = await db.orders.find({"user_id": user["id"], "distributor_id": did}, {"_id": 0}).to_list(200)
        payments = await db.payments.find({"user_id": user["id"], "distributor_id": did}, {"_id": 0}).to_list(200)
        return {
            "total_spent": round(sum(o["total"] for o in orders), 2),
            "order_count": len(orders),
            "unpaid": round(sum(p["amount"] for p in payments if p["status"] in ("due", "overdue")), 2),
        }

    a_prods = await db.products.count_documents({"distributor_ids": a_id})
    b_prods = await db.products.count_documents({"distributor_ids": b_id})

    return {
        "a": {**a, "product_count": a_prods, "user_stats": await stats_for(a_id)},
        "b": {**b, "product_count": b_prods, "user_stats": await stats_for(b_id)},
    }


@api_router.get("/")
async def root():
    return {"message": "RX Tech API"}


# ============================================================
# DELIVERY CONFIRMATION FLOW (critical) — pharmacist confirms
# received items, qty (may be short), payment split (cash vs credit),
# optional photo (required only when disputing).
# ============================================================
class ConfirmDeliveryReq(BaseModel):
    items: List[dict]  # [{product_id, qty_received, free_qty?, batch?, expiry?, notes?}]
    paid_now: float = 0
    on_credit: float = 0
    photo_url: Optional[str] = None
    notes: Optional[str] = None
    raise_dispute: bool = False


@api_router.post("/orders/{order_id}/confirm-delivery")
async def confirm_delivery(order_id: str, req: ConfirmDeliveryReq, user: dict = Depends(get_current_user)):
    o = await db.orders.find_one({"id": order_id, "user_id": user["id"]}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Order not found")
    if o.get("delivery_confirmed"):
        raise HTTPException(400, "Already confirmed")

    # Update items with received qty + recompute total
    new_total = 0.0
    qty_short_total = 0.0  # value of short items
    new_items = []
    received_lookup = {r["product_id"]: r for r in req.items}
    for it in o.get("items", []):
        recv = received_lookup.get(it["product_id"], {})
        qr = int(recv.get("qty_received", it.get("qty_ordered", it["qty"])))
        fq = int(recv.get("free_qty", it.get("free_qty", 0)))
        line_total = it["price"] * qr
        new_total += line_total
        ordered = it.get("qty_ordered", it["qty"])
        if qr < ordered:
            qty_short_total += it["price"] * (ordered - qr)
        new_items.append({
            **it,
            "qty": qr,
            "free_qty": fq,
            "batch": recv.get("batch", it.get("batch")),
            "expiry": recv.get("expiry", it.get("expiry")),
            "line_notes": recv.get("notes"),
        })

    # Update credit_used: refund the qty-short value (since we charged the full amount at placement)
    if o.get("payment_method") == "credit" and qty_short_total > 0:
        await db.distributors.update_one(
            {"id": o["distributor_id"]},
            {"$inc": {"credit_used": -qty_short_total}},
        )

    update = {
        "items": new_items,
        "total": round(new_total, 2),
        "status": "delivered",
        "delivery_confirmed": True,
        "delivery_confirmed_at": iso(now_utc()),
        "delivery_photo_url": req.photo_url,
        "delivery_notes": req.notes,
        "amount_paid_on_delivery": round(req.paid_now, 2),
        "amount_on_credit": round(req.on_credit, 2),
        "qty_short_value": round(qty_short_total, 2),
        "has_dispute": req.raise_dispute,
    }
    await db.orders.update_one({"id": order_id}, {"$set": update})

    # Create a payment record for the credit portion (if any)
    if req.on_credit > 0:
        await db.payments.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "distributor_id": o["distributor_id"],
            "distributor_name": o["distributor_name"],
            "invoice_code": o.get("invoice_number", o["code"]),
            "amount": round(req.on_credit, 2),
            "due_date": iso(now_utc() + timedelta(days=21)),
            "status": "due",
            "days_to_due": 21,
        })

    # Auto-create a debit note if short qty (since we paid for what we didn't receive)
    if qty_short_total > 0 and not req.raise_dispute:
        await db.debit_notes.insert_one({
            "id": str(uuid.uuid4()),
            "code": f"DN-S{random.randint(2400, 9999)}",
            "user_id": user["id"],
            "distributor_id": o["distributor_id"],
            "order_id": order_id,
            "amount": round(qty_short_total, 2),
            "reason": "short-supply",
            "notes": f"Auto: qty short on delivery confirmation",
            "status": "issued",
            "created_at": iso(now_utc()),
        })

    return {"success": True, "order_id": order_id, "new_total": round(new_total, 2), "qty_short_value": round(qty_short_total, 2)}


# ============================================================
# PAY LUMP SUM — settle multiple invoices at once
# ============================================================
class PayLumpSumReq(BaseModel):
    payment_ids: List[str]


@api_router.post("/payments/pay-lump-sum")
async def pay_lump_sum(req: PayLumpSumReq, user: dict = Depends(get_current_user)):
    total_paid = 0.0
    for pid in req.payment_ids:
        p = await db.payments.find_one({"id": pid, "user_id": user["id"]}, {"_id": 0})
        if not p or p["status"] == "paid":
            continue
        await db.payments.update_one(
            {"id": pid},
            {"$set": {"status": "paid", "paid_at": iso(now_utc())}},
        )
        # Reduce credit_used on the customer's credit line
        if p.get("distributor_id"):
            await cc_inc(p["distributor_id"], user["id"], -p["amount"])
        total_paid += p["amount"]
    return {"success": True, "count": len(req.payment_ids), "total_paid": round(total_paid, 2)}


# ============================================================
# DISTRIBUTOR — LIST INVOICES (open vs history)
# ============================================================
@api_router.get("/distributors/{dist_id}/invoices")
async def distributor_invoices(dist_id: str, user: dict = Depends(get_current_user)):
    d = await db.distributors.find_one({"id": dist_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Not found")
    payments = await db.payments.find(
        {"user_id": user["id"], "distributor_id": dist_id},
        {"_id": 0},
    ).sort("due_date", 1).to_list(500)
    open_inv = [p for p in payments if p["status"] in ("due", "overdue")]
    history = [p for p in payments if p["status"] == "paid"]
    overdue_total = sum(p["amount"] for p in open_inv if p["status"] == "overdue")
    outstanding = sum(p["amount"] for p in open_inv)
    _cc = await cc_get(dist_id, user["id"])
    _lim = _cc.get("credit_limit", 0)
    _used = round(_cc.get("credit_used", 0), 2)
    return {
        "distributor": d,
        "open_invoices": open_inv,
        "invoice_history": history,
        "overdue": round(overdue_total, 2),
        "outstanding": round(outstanding, 2),
        "credit_limit": _lim,
        "credit_used": _used,
        "credit_used_pct": round((_used / max(_lim, 1)) * 100, 1),
    }


# ============================================================
# LEDGER CSV EXPORT
# ============================================================
@api_router.get("/ledger/{distributor_id}/export")
async def ledger_export(
    distributor_id: str,
    format: str = "csv",
    days: int = 90,
    user: dict = Depends(get_current_user),
):
    """Export ledger as CSV. `days` filters the window."""
    from io import StringIO
    import csv
    d = await db.distributors.find_one({"id": distributor_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Not found")

    cutoff = now_utc() - timedelta(days=days)
    orders = await db.orders.find({"user_id": user["id"], "distributor_id": distributor_id}, {"_id": 0}).to_list(500)
    payments = await db.payments.find({"user_id": user["id"], "distributor_id": distributor_id}, {"_id": 0}).to_list(500)
    credit_notes = await db.credit_notes.find({"user_id": user["id"], "distributor_id": distributor_id}, {"_id": 0}).to_list(200)
    debit_notes = await db.debit_notes.find({"user_id": user["id"], "distributor_id": distributor_id}, {"_id": 0}).to_list(200)

    rows = []
    for o in orders:
        rows.append([o["created_at"][:10], "BILL", o.get("invoice_number", o["code"]), o.get("sku_count", 0), o["total"], 0, o.get("status", "")])
    for p in payments:
        if p["status"] == "paid":
            rows.append([(p.get("paid_at") or p["due_date"])[:10], "PAYMENT", p["invoice_code"], "", 0, p["amount"], "settled"])
    for cn in credit_notes:
        rows.append([cn["created_at"][:10], "CREDIT_NOTE", cn["code"], "", 0, cn["amount"], cn["reason"]])
    for dn in debit_notes:
        rows.append([dn["created_at"][:10], "DEBIT_NOTE", dn["code"], "", dn["amount"], 0, dn["reason"]])

    # Filter by date window
    rows = [r for r in rows if r[0] >= cutoff.date().isoformat()]
    rows.sort(key=lambda r: r[0])

    # Running balance
    out = []
    bal = 0.0
    for r in rows:
        bal += (r[4] or 0) - (r[5] or 0)
        out.append(r + [round(bal, 2)])

    buf = StringIO()
    w = csv.writer(buf)
    w.writerow(["LEDGER EXPORT", d["short_name"], f"Last {days} days"])
    w.writerow([])
    w.writerow(["Date", "Type", "Reference", "Items", "Debit (Bill)", "Credit (Paid)", "Status/Reason", "Running Balance"])
    for r in out:
        w.writerow(r)
    w.writerow([])
    w.writerow(["TOTALS"])
    w.writerow(["Total Bills", "", "", "", sum(r[4] for r in out), "", "", ""])
    w.writerow(["Total Paid", "", "", "", "", sum(r[5] for r in out), "", ""])
    w.writerow(["Closing Balance", "", "", "", "", "", "", bal])

    from fastapi.responses import Response
    csv_text = buf.getvalue()
    filename = f"ledger_{d['short_name'].replace(' ', '_')}_{days}d.csv"
    return Response(
        content=csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ============================================================
# LEDGER (per distributor) — bills, payments, credit/debit notes
# ============================================================
@api_router.get("/ledger/{distributor_id}")
async def get_ledger(distributor_id: str, user: dict = Depends(get_current_user)):
    """Return a complete vendor ledger: all bills (orders/invoices), payments,
    credit notes, debit notes, with running balance.
    """
    dist = await db.distributors.find_one({"id": distributor_id}, {"_id": 0})
    if not dist:
        raise HTTPException(404, "Distributor not found")
    # Collect bills (orders) for this user+distributor
    orders = await db.orders.find(
        {"user_id": user["id"], "distributor_id": distributor_id},
        {"_id": 0},
    ).to_list(500)
    payments = await db.payments.find(
        {"user_id": user["id"], "distributor_id": distributor_id},
        {"_id": 0},
    ).to_list(500)
    credit_notes = await db.credit_notes.find(
        {"user_id": user["id"], "distributor_id": distributor_id},
        {"_id": 0},
    ).to_list(200)
    debit_notes = await db.debit_notes.find(
        {"user_id": user["id"], "distributor_id": distributor_id},
        {"_id": 0},
    ).to_list(200)

    # Build entries with proper +/- sign
    entries = []
    for o in orders:
        entries.append({
            "id": o["id"], "type": "bill", "ref": o["code"],
            "label": f"Invoice {o['code']}",
            "sku_count": o.get("sku_count", 0),
            "date": o["created_at"], "debit": o["total"], "credit": 0,
            "status": o["status"], "payment_method": o.get("payment_method", "cash"),
        })
    for p in payments:
        if p["status"] == "paid":
            entries.append({
                "id": p["id"], "type": "payment", "ref": p["invoice_code"],
                "label": f"Payment for {p['invoice_code']}",
                "date": p.get("paid_at") or p["due_date"], "debit": 0, "credit": p["amount"],
                "status": "settled",
            })
    for cn in credit_notes:
        entries.append({
            "id": cn["id"], "type": "credit_note", "ref": cn["code"],
            "label": f"Credit Note: {cn['reason']}",
            "date": cn["created_at"], "debit": 0, "credit": cn["amount"],
            "status": cn.get("status", "issued"),
        })
    for dn in debit_notes:
        entries.append({
            "id": dn["id"], "type": "debit_note", "ref": dn["code"],
            "label": f"Debit Note: {dn['reason']}",
            "date": dn["created_at"], "debit": dn["amount"], "credit": 0,
            "status": dn.get("status", "issued"),
        })

    entries.sort(key=lambda e: e["date"])
    running = 0.0
    for e in entries:
        running += (e["debit"] - e["credit"])
        e["running_balance"] = round(running, 2)

    total_bills = sum(o["total"] for o in orders)
    total_paid = sum(p["amount"] for p in payments if p["status"] == "paid")
    total_due = sum(p["amount"] for p in payments if p["status"] in ("due", "overdue"))
    total_overdue = sum(p["amount"] for p in payments if p["status"] == "overdue")
    total_credit_notes = sum(c["amount"] for c in credit_notes)
    total_debit_notes = sum(d["amount"] for d in debit_notes)
    closing_balance = round(running, 2)
    _cc = await cc_get(distributor_id, user["id"])
    credit_available = (_cc.get("credit_limit", 0) - _cc.get("credit_used", 0))

    return {
        "distributor": dist,
        "summary": {
            "total_bills": round(total_bills, 2),
            "total_paid": round(total_paid, 2),
            "total_due": round(total_due, 2),
            "total_overdue": round(total_overdue, 2),
            "credit_notes": round(total_credit_notes, 2),
            "debit_notes": round(total_debit_notes, 2),
            "closing_balance": closing_balance,
            "credit_limit": _cc.get("credit_limit", 0),
            "credit_used": round(_cc.get("credit_used", 0), 2),
            "credit_available": round(credit_available, 2),
        },
        "entries": entries,
    }


# ============================================================
# CREDIT NOTES / DEBIT NOTES
# ============================================================
class CreditNoteReq(BaseModel):
    distributor_id: str
    order_id: Optional[str] = None
    amount: float
    reason: str  # damaged | expired | wrong-supply | return-refund | settlement | other
    notes: Optional[str] = None


@api_router.post("/credit-notes")
async def create_credit_note(req: CreditNoteReq, user: dict = Depends(get_current_user)):
    cnt = await db.credit_notes.count_documents({"user_id": user["id"]})
    cn = {
        "id": str(uuid.uuid4()),
        "code": f"CN-{2400 + cnt + 1}",
        "user_id": user["id"],
        "distributor_id": req.distributor_id,
        "order_id": req.order_id,
        "amount": round(req.amount, 2),
        "reason": req.reason,
        "notes": req.notes,
        "status": "issued",
        "created_at": iso(now_utc()),
    }
    await db.credit_notes.insert_one({**cn})
    # If credit note offsets credit-used, reduce the customer's credit line
    if req.amount > 0:
        await cc_inc(req.distributor_id, user["id"], -req.amount)
    return {"success": True, "item": cn}


@api_router.get("/credit-notes")
async def list_credit_notes(distributor_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {"user_id": user["id"]}
    if distributor_id:
        q["distributor_id"] = distributor_id
    items = await db.credit_notes.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
    return items


class DebitNoteReq(BaseModel):
    distributor_id: str
    order_id: Optional[str] = None
    amount: float
    reason: str
    notes: Optional[str] = None


@api_router.post("/debit-notes")
async def create_debit_note(req: DebitNoteReq, user: dict = Depends(get_current_user)):
    cnt = await db.debit_notes.count_documents({"user_id": user["id"]})
    dn = {
        "id": str(uuid.uuid4()),
        "code": f"DN-{2400 + cnt + 1}",
        "user_id": user["id"],
        "distributor_id": req.distributor_id,
        "order_id": req.order_id,
        "amount": round(req.amount, 2),
        "reason": req.reason,
        "notes": req.notes,
        "status": "issued",
        "created_at": iso(now_utc()),
    }
    await db.debit_notes.insert_one({**dn})
    return {"success": True, "item": dn}


@api_router.get("/debit-notes")
async def list_debit_notes(distributor_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {"user_id": user["id"]}
    if distributor_id:
        q["distributor_id"] = distributor_id
    items = await db.debit_notes.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
    return items


# ============================================================
# GST INVOICE BREAKDOWN
# ============================================================
@api_router.get("/orders/{order_id}/invoice")
async def get_invoice_breakdown(order_id: str, user: dict = Depends(get_current_user)):
    """Return order with full GST breakdown (CGST + SGST or IGST) — pharma default 12% (6+6)."""
    o = await db.orders.find_one({"id": order_id, "user_id": user["id"]}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Order not found")
    dist = await db.distributors.find_one({"id": o["distributor_id"]}, {"_id": 0})
    user_state = (user.get("state_code") or "27")  # default MH
    dist_state = (dist.get("state_code") if dist else "27")
    intra_state = (user_state == dist_state)

    gst_pct = 12.0  # pharma standard
    # Treat order.total as inclusive of GST? In this app we'll treat as taxable value + GST added.
    taxable = round(o["total"] / (1 + gst_pct / 100), 2)
    gst_amount = round(o["total"] - taxable, 2)
    if intra_state:
        cgst = round(gst_amount / 2, 2)
        sgst = round(gst_amount - cgst, 2)
        igst = 0.0
    else:
        cgst = 0.0
        sgst = 0.0
        igst = gst_amount

    # Per-line breakdown
    lines = []
    for it in o.get("items", []):
        line_total = it["price"] * it["qty"]
        line_taxable = round(line_total / (1 + gst_pct / 100), 2)
        line_gst = round(line_total - line_taxable, 2)
        lines.append({
            **it,
            "line_total": round(line_total, 2),
            "taxable": line_taxable,
            "gst": line_gst,
        })

    return {
        "order": o,
        "distributor": dist,
        "gst_pct": gst_pct,
        "taxable_value": taxable,
        "cgst": cgst,
        "sgst": sgst,
        "igst": igst,
        "total_gst": gst_amount,
        "round_off": 0.0,
        "grand_total": round(o["total"], 2),
        "intra_state": intra_state,
        "lines": lines,
    }


# ============================================================
# CHAT (per distributor)
# ============================================================
class ChatMsgReq(BaseModel):
    distributor_id: str
    message: str
    attach_order_id: Optional[str] = None


@api_router.get("/chat/threads")
async def chat_threads(user: dict = Depends(get_current_user)):
    """List all chat threads — one per distributor — with last message preview."""
    # Pull all distributors that have any chat OR any order with this user
    distributors = await db.distributors.find({}, {"_id": 0}).to_list(50)
    threads = []
    for d in distributors:
        last = await db.chat_messages.find_one(
            {"user_id": user["id"], "distributor_id": d["id"]},
            {"_id": 0},
            sort=[("created_at", -1)],
        )
        unread = await db.chat_messages.count_documents(
            {"user_id": user["id"], "distributor_id": d["id"], "sender": "distributor", "read": False}
        )
        if last:
            threads.append({
                "distributor": {"id": d["id"], "short_name": d["short_name"], "rating": d.get("rating")},
                "last_message": last,
                "unread": unread,
            })
    # Sort by last message date
    threads.sort(key=lambda t: t["last_message"]["created_at"], reverse=True)
    return threads


@api_router.get("/chat/{distributor_id}")
async def chat_history(distributor_id: str, user: dict = Depends(get_current_user)):
    d = await db.distributors.find_one({"id": distributor_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Distributor not found")
    msgs = await db.chat_messages.find(
        {"user_id": user["id"], "distributor_id": distributor_id},
        {"_id": 0},
    ).sort("created_at", 1).to_list(500)
    # mark distributor messages read
    await db.chat_messages.update_many(
        {"user_id": user["id"], "distributor_id": distributor_id, "sender": "distributor", "read": False},
        {"$set": {"read": True}},
    )
    return {"distributor": d, "messages": msgs}


@api_router.post("/chat")
async def send_chat(req: ChatMsgReq, user: dict = Depends(get_current_user)):
    msg = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "distributor_id": req.distributor_id,
        "sender": "user",
        "message": req.message.strip(),
        "attach_order_id": req.attach_order_id,
        "read": True,
        "created_at": iso(now_utc()),
    }
    await db.chat_messages.insert_one({**msg})
    # Auto-reply stub from distributor side (after small delay simulated via created_at offset)
    auto = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "distributor_id": req.distributor_id,
        "sender": "distributor",
        "message": _chat_auto_reply(req.message, req.attach_order_id),
        "read": False,
        "created_at": iso(now_utc() + timedelta(seconds=2)),
    }
    await db.chat_messages.insert_one({**auto})
    return {"success": True, "messages": [msg, auto]}


def _chat_auto_reply(text: str, order_id: Optional[str]) -> str:
    t = text.lower()
    if "delivery" in t or "eta" in t or "when" in t:
        return "Hi! Your order is being prepared. Expected ETA today by 6 PM. Track in Orders tab."
    if "discount" in t or "scheme" in t or "offer" in t:
        return "We're running a 10+1 scheme on Pantoprazole and 5% extra discount on bulk orders >₹10K this week."
    if "credit" in t or "limit" in t:
        return "Sure — we'll review your credit limit next billing cycle. Send us your last 3 months' purchases on email."
    if "return" in t or "damaged" in t or "expired" in t:
        return "Apologies — please raise a return request and we'll issue a credit note within 48 hrs."
    if order_id:
        return f"Thanks! I've pulled up that order. Our team will reply shortly with details."
    return "Hi! Thanks for reaching out — our sales rep will respond shortly. For urgent issues call +91-22-XXXX-XXXX."


# ============================================================
# DISTRIBUTOR PORTAL STUB (to be expanded later)
# ============================================================
@api_router.get("/distributor-portal/dashboard")
async def distributor_dashboard(distributor_id: str = "dist-1"):
    """Placeholder dashboard for distributor side — to be built out later.

    Returns counts of orders received, total revenue, pending payments etc.
    For now, no auth (will require distributor-role JWT in v2).
    """
    orders = await db.orders.find({"distributor_id": distributor_id}, {"_id": 0}).to_list(500)
    payments = await db.payments.find({"distributor_id": distributor_id}, {"_id": 0}).to_list(500)
    received_orders = len(orders)
    revenue = sum(o["total"] for o in orders)
    pending_payment = sum(p["amount"] for p in payments if p["status"] in ("due", "overdue"))
    return {
        "received_orders": received_orders,
        "revenue": round(revenue, 2),
        "pending_payment": round(pending_payment, 2),
        "active_buyers": len({o["user_id"] for o in orders}),
    }





@api_router.get("/health")
async def health():
    return {"status": "ok"}


# ============================================================================
# DISTRIBUTOR-SIDE PLATFORM
# ============================================================================

import secrets as _secrets


# ============================================================================
# PER-CUSTOMER CREDIT ENGINE
# Credit is tracked per (distributor_id, user_id) pair in `customer_credit`.
# Both the pharmacist view ("my credit with distributor X") and the distributor
# view ("credit I extended to pharmacy Y") read from the SAME record, so the two
# sides of the marketplace always stay in sync.
# ============================================================================
async def cc_get(distributor_id: str, user_id: str) -> dict:
    """Return the per-customer credit record, lazily creating it from the
    distributor's default terms if it does not exist yet."""
    cc = await db.customer_credit.find_one(
        {"distributor_id": distributor_id, "user_id": user_id}, {"_id": 0}
    )
    if cc:
        return cc
    d = await db.distributors.find_one({"id": distributor_id}, {"_id": 0}) or {}
    cc = {
        "id": str(uuid.uuid4()),
        "distributor_id": distributor_id,
        "user_id": user_id,
        "credit_limit": int(d.get("credit_limit", 100000)),
        "credit_used": 0.0,
        "credit_days": int(d.get("credit_days", 21)),
        "settlement_discount_pct": float(d.get("settlement_discount_pct", 1.5)),
        "updated_at": iso(now_utc()),
    }
    await db.customer_credit.insert_one({**cc})
    cc.pop("_id", None)
    return cc


async def cc_inc(distributor_id: str, user_id: str, delta: float) -> None:
    """Increment (or decrement, if delta<0) credit_used for a customer, never
    going below zero."""
    cc = await cc_get(distributor_id, user_id)
    new_used = max(0.0, round((cc.get("credit_used", 0) or 0) + delta, 2))
    await db.customer_credit.update_one(
        {"distributor_id": distributor_id, "user_id": user_id},
        {"$set": {"credit_used": new_used, "updated_at": iso(now_utc())}},
    )


async def user_credit_rows(user_id: str) -> List[dict]:
    return await db.customer_credit.find({"user_id": user_id}, {"_id": 0}).to_list(200)


async def seed_demo_user_credit(user_id: str) -> None:
    """Seed customer_credit records for the demo pharmacist mirroring the demo
    distributors' outstanding so the existing demo numbers carry over to the
    new per-customer model."""
    if await db.customer_credit.count_documents({"user_id": user_id}) > 0:
        return
    dists = await db.distributors.find({}, {"_id": 0}).to_list(50)
    base = now_utc()
    for d in dists:
        await db.customer_credit.insert_one({
            "id": str(uuid.uuid4()),
            "distributor_id": d["id"],
            "user_id": user_id,
            "credit_limit": int(d.get("credit_limit", 100000)),
            "credit_used": float(d.get("credit_used", 0)),
            "credit_days": int(d.get("credit_days", 21)),
            "settlement_discount_pct": float(d.get("settlement_discount_pct", 1.5)),
            "updated_at": iso(base),
        })


# ============================================================================
# DEMO DISTRIBUTOR DATA — pharmacy customers buying from dist-1 so the
# distributor-side app (orders / customers / collections / chat) looks alive.
# ============================================================================
DEMO_DIST_ID = "dist-1"


def _mk_order(user_id, code, dist_id, dist_name, items, status, pm, created_at, **extra):
    total = round(sum(i["price"] * i["qty"] for i in items), 2)
    o = {
        "id": str(uuid.uuid4()), "code": code,
        "invoice_number": f"F0{datetime.now().strftime('%m%y')}-A{random.randint(1000000, 9999999)}",
        "user_id": user_id, "items": items, "distributor_id": dist_id,
        "distributor_name": dist_name, "sku_count": len(items), "total": total,
        "status": status, "payment_method": pm, "created_at": created_at,
        "eta": None, "delivery_confirmed": status == "delivered",
        "has_bill_pdf": True, "amount_paid_on_delivery": total if (pm == "cash" and status == "delivered") else 0,
        "amount_on_credit": total if pm == "credit" else 0,
    }
    o.update(extra)
    return o


def _it(pid, name, qty, price, mrp):
    return {"product_id": pid, "name": name, "qty_ordered": qty, "qty": qty, "free_qty": 0,
            "price": price, "mrp": mrp, "discount_pct": 4.0, "gst_pct": 12.0,
            "batch": f"B{random.randint(1000, 9999)}A", "expiry": "Jun 2027"}


async def seed_distributor_demo() -> None:
    """Idempotent seed of demo pharmacy customers for dist-1."""
    if await db.users.find_one({"id": "cust-1"}):
        return
    base = now_utc()
    customers = [
        {"id": "cust-1", "shop": "Apollo Medical Store", "name": "Ramesh Kumar", "phone": "9820011223", "addr": "Andheri West, Mumbai", "gst": "27APOLL1234A1Z5", "dl": "MH-MUM-20-110021", "limit": 150000, "used": 96500},
        {"id": "cust-2", "shop": "Wellness Pharmacy", "name": "Sneha Patil", "phone": "9820033445", "addr": "Bandra East, Mumbai", "gst": "27WELLP5678B1Z3", "dl": "MH-MUM-21-110874", "limit": 100000, "used": 38200},
        {"id": "cust-3", "shop": "City Care Chemist", "name": "Imran Shaikh", "phone": "9820055667", "addr": "Dadar West, Mumbai", "gst": "27CITYC9012C1Z1", "dl": "MH-MUM-19-109233", "limit": 80000, "used": 71200},
        {"id": "cust-4", "shop": "Guardian Pharmacy", "name": "Anita Desai", "phone": "9820077889", "addr": "Powai, Mumbai", "gst": "27GUARD3456D1Z9", "dl": "MH-MUM-22-112987", "limit": 60000, "used": 0},
    ]
    dn = "ABC Pharma"
    for c in customers:
        await db.users.insert_one({
            "id": c["id"], "email": f"{c['id']}@pharmacy.demo", "name": c["name"],
            "phone": c["phone"], "shop_name": c["shop"], "gst": c["gst"], "address": c["addr"],
            "drug_license": c["dl"], "food_license": None, "onboarded": True,
            "created_at": iso(base - timedelta(days=140)), "roles": ["pharmacist"], "owned_distributor_id": None,
        })
        await db.customer_credit.insert_one({
            "id": str(uuid.uuid4()), "distributor_id": DEMO_DIST_ID, "user_id": c["id"],
            "credit_limit": c["limit"], "credit_used": float(c["used"]),
            "credit_days": 21, "settlement_discount_pct": 1.5, "updated_at": iso(base),
        })

    n = 5200
    orders = [
        # cust-1: a brand new order awaiting acceptance + one dispatched + one delivered
        _mk_order("cust-1", f"ORD-{n}", DEMO_DIST_ID, dn, [_it("p-1", "Azithromycin 500mg", 40, 54.20, 78.50), _it("p-7", "Atorvastatin 10mg", 30, 78.00, 110.00)], "placed", "credit", iso(base - timedelta(hours=2))),
        _mk_order("cust-1", f"ORD-{n+1}", DEMO_DIST_ID, dn, [_it("p-4", "Amlodipine 5mg", 50, 40.80, 56.00)], "dispatched", "credit", iso(base - timedelta(days=1)), dispatched_at=iso(base - timedelta(hours=20))),
        _mk_order("cust-1", f"ORD-{n+2}", DEMO_DIST_ID, dn, [_it("p-9", "Amoxicillin 500mg", 60, 66.00, 92.00)], "delivered", "cash", iso(base - timedelta(days=6)), delivered_at=iso(base - timedelta(days=6))),
        # cust-2: accepted (credit) + delivered (credit)
        _mk_order("cust-2", f"ORD-{n+3}", DEMO_DIST_ID, dn, [_it("p-10", "Losartan 50mg", 35, 62.30, 88.00)], "accepted", "credit", iso(base - timedelta(hours=8))),
        _mk_order("cust-2", f"ORD-{n+4}", DEMO_DIST_ID, dn, [_it("p-3", "Metformin 500mg", 80, 26.40, 38.00)], "delivered", "credit", iso(base - timedelta(days=9)), delivered_at=iso(base - timedelta(days=9))),
        # cust-3: a new order + heavy outstanding
        _mk_order("cust-3", f"ORD-{n+5}", DEMO_DIST_ID, dn, [_it("p-1", "Azithromycin 500mg", 25, 54.20, 78.50)], "placed", "credit", iso(base - timedelta(hours=5))),
        _mk_order("cust-3", f"ORD-{n+6}", DEMO_DIST_ID, dn, [_it("p-7", "Atorvastatin 10mg", 40, 78.00, 110.00)], "delivered", "credit", iso(base - timedelta(days=20)), delivered_at=iso(base - timedelta(days=20))),
        # cust-4: a cash order
        _mk_order("cust-4", f"ORD-{n+7}", DEMO_DIST_ID, dn, [_it("p-4", "Amlodipine 5mg", 20, 40.80, 56.00)], "placed", "cash", iso(base - timedelta(hours=1))),
    ]
    await db.orders.insert_many([{**o} for o in orders])

    payments = [
        # cust-1 outstanding ~96.5k
        {"id": str(uuid.uuid4()), "user_id": "cust-1", "distributor_id": DEMO_DIST_ID, "distributor_name": dn, "invoice_code": "INV-20051", "amount": 54500.00, "due_date": iso(base + timedelta(days=8)), "status": "due", "days_to_due": 8},
        {"id": str(uuid.uuid4()), "user_id": "cust-1", "distributor_id": DEMO_DIST_ID, "distributor_name": dn, "invoice_code": "INV-20040", "amount": 42000.00, "due_date": iso(base - timedelta(days=3)), "status": "overdue", "days_to_due": -3},
        {"id": str(uuid.uuid4()), "user_id": "cust-1", "distributor_id": DEMO_DIST_ID, "distributor_name": dn, "invoice_code": "INV-19980", "amount": 31000.00, "due_date": iso(base - timedelta(days=30)), "status": "paid", "days_to_due": -30, "paid_at": iso(base - timedelta(days=28))},
        # cust-2 outstanding ~38.2k
        {"id": str(uuid.uuid4()), "user_id": "cust-2", "distributor_id": DEMO_DIST_ID, "distributor_name": dn, "invoice_code": "INV-20055", "amount": 38200.00, "due_date": iso(base + timedelta(days=14)), "status": "due", "days_to_due": 14},
        {"id": str(uuid.uuid4()), "user_id": "cust-2", "distributor_id": DEMO_DIST_ID, "distributor_name": dn, "invoice_code": "INV-19920", "amount": 22400.00, "due_date": iso(base - timedelta(days=25)), "status": "paid", "days_to_due": -25, "paid_at": iso(base - timedelta(days=24))},
        # cust-3 outstanding ~71.2k, mostly overdue
        {"id": str(uuid.uuid4()), "user_id": "cust-3", "distributor_id": DEMO_DIST_ID, "distributor_name": dn, "invoice_code": "INV-20030", "amount": 48200.00, "due_date": iso(base - timedelta(days=12)), "status": "overdue", "days_to_due": -12},
        {"id": str(uuid.uuid4()), "user_id": "cust-3", "distributor_id": DEMO_DIST_ID, "distributor_name": dn, "invoice_code": "INV-20060", "amount": 23000.00, "due_date": iso(base + timedelta(days=5)), "status": "due", "days_to_due": 5},
    ]
    await db.payments.insert_many(payments)

    chats = [
        {"id": str(uuid.uuid4()), "user_id": "cust-1", "distributor_id": DEMO_DIST_ID, "sender": "user", "message": "Need 40 strips Azithral urgently, can you dispatch today?", "read": False, "created_at": iso(base - timedelta(hours=2))},
        {"id": str(uuid.uuid4()), "user_id": "cust-2", "distributor_id": DEMO_DIST_ID, "sender": "user", "message": "What scheme is running on Metformin this week?", "read": False, "created_at": iso(base - timedelta(hours=8))},
        {"id": str(uuid.uuid4()), "user_id": "cust-3", "distributor_id": DEMO_DIST_ID, "sender": "user", "message": "Please share the updated ledger statement.", "read": False, "created_at": iso(base - timedelta(hours=5))},
    ]
    await db.chat_messages.insert_many(chats)
    logger.info("Seeded distributor demo: 4 pharmacy customers + orders/payments/credit/chat")



async def get_owned_distributor(user: dict) -> dict:
    """Return the Distributor record this user can manage.

    Owners reach it via owned_distributor_id. Managers (staff role) reach the
    same distributor via their distributor_id — they share the owner's
    operational dashboard, customers, collections, leads and deliveries.
    """
    did = user.get("owned_distributor_id")
    if not did and user.get("role") == "manager":
        did = user.get("distributor_id")
    if not did:
        # Try fallback from DB (demo@rxtech.com → dist-1 / managers)
        u = await db.users.find_one({"id": user["id"]}, {"_id": 0}) or {}
        did = u.get("owned_distributor_id")
        if not did and u.get("role") == "manager":
            did = u.get("distributor_id")
    if not did:
        raise HTTPException(403, "You do not own a distributor account")
    d = await db.distributors.find_one({"id": did}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Distributor not found")
    return d


async def require_owner_distributor(user: dict) -> dict:
    """Owner-only access (billing / ERP integration / owner settings)."""
    did = user.get("owned_distributor_id")
    if not did:
        u = await db.users.find_one({"id": user["id"]}, {"_id": 0}) or {}
        did = u.get("owned_distributor_id")
    if not did:
        raise HTTPException(403, "Only the account owner can manage this")
    d = await db.distributors.find_one({"id": did}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Distributor not found")
    return d


@api_router.post("/distributor/switch-role")
async def switch_role(payload: dict = Body(...), user: dict = Depends(get_current_user)):
    """Demo helper: ensures the current user has the distributor role and is linked
    to a distributor (defaults to dist-1 if none)."""
    target = payload.get("role")
    if target not in ("pharmacist", "distributor"):
        raise HTTPException(400, "Invalid role")
    upd = {}
    if target == "distributor":
        # Ensure user has distributor role and is linked to a distributor
        u = await db.users.find_one({"id": user["id"]}, {"_id": 0}) or {}
        roles = set(u.get("roles") or ["pharmacist"])
        roles.add("distributor")
        upd["roles"] = list(roles)
        if not u.get("owned_distributor_id"):
            # link to dist-1 for demo
            upd["owned_distributor_id"] = "dist-1"
    await db.users.update_one({"id": user["id"]}, {"$set": upd}) if upd else None
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return {"active_role": target, "user": fresh}


@api_router.get("/distributor/me")
async def distributor_me(user: dict = Depends(get_current_user)):
    d = await get_owned_distributor(user)
    # how many products this distributor offers
    count = await db.products.count_documents({"distributor_ids": d["id"]})
    return {"distributor": d, "product_count": count}


@api_router.get("/distributor/me/dashboard")
async def distributor_dashboard(user: dict = Depends(get_current_user)):
    d = await get_owned_distributor(user)
    today = now_utc().replace(hour=0, minute=0, second=0, microsecond=0)
    pending = await db.orders.count_documents({"distributor_id": d["id"], "status": {"$in": ["placed", "accepted"]}})
    dispatched = await db.orders.count_documents({"distributor_id": d["id"], "status": "dispatched"})
    delivered_today = await db.orders.count_documents({
        "distributor_id": d["id"], "status": "delivered",
        "created_at": {"$gte": iso(today)},
    })

    # Today sales (sum of total of delivered orders today)
    today_orders = await db.orders.find(
        {"distributor_id": d["id"], "created_at": {"$gte": iso(today)}}, {"_id": 0},
    ).to_list(500)
    today_sales = sum(o.get("total", 0) for o in today_orders)
    today_orders_count = len(today_orders)

    # Last 7 days sales chart
    from datetime import timedelta
    series = []
    for i in range(6, -1, -1):
        day_start = (today - timedelta(days=i))
        day_end = day_start + timedelta(days=1)
        day_orders = await db.orders.find(
            {"distributor_id": d["id"], "created_at": {"$gte": iso(day_start), "$lt": iso(day_end)}}, {"_id": 0},
        ).to_list(500)
        series.append({"label": day_start.strftime("%a"), "sales": sum(o.get("total", 0) for o in day_orders), "orders": len(day_orders)})

    # Outstanding (credit owed by all customers to this distributor)
    outstanding_agg = await db.payments.aggregate([
        {"$match": {"distributor_id": d["id"], "status": {"$in": ["due", "overdue"]}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}},
    ]).to_list(1)
    outstanding = outstanding_agg[0] if outstanding_agg else {"total": 0, "count": 0}

    # Top customer (by total order value lifetime)
    top_agg = await db.orders.aggregate([
        {"$match": {"distributor_id": d["id"]}},
        {"$group": {"_id": "$user_id", "total": {"$sum": "$total"}, "orders": {"$sum": 1}}},
        {"$sort": {"total": -1}},
        {"$limit": 5},
    ]).to_list(5)
    top_customers = []
    for row in top_agg:
        u = await db.users.find_one({"id": row["_id"]}, {"_id": 0, "name": 1, "email": 1, "shop_name": 1})
        if u:
            top_customers.append({
                "user_id": row["_id"], "name": u.get("name") or u.get("email"),
                "shop_name": u.get("shop_name"), "total": row["total"], "orders": row["orders"],
            })

    # Low stock products (count with qty_available <= 20)
    low_stock = await db.products.count_documents({
        "prices": {"$elemMatch": {"distributor_id": d["id"], "qty_available": {"$lte": 20, "$gt": 0}}},
    })
    out_of_stock = await db.products.count_documents({
        "prices": {"$elemMatch": {"distributor_id": d["id"], "qty_available": 0}},
    })

    # Total credit extended to all customers of this distributor
    _ccr = await db.customer_credit.find({"distributor_id": d["id"]}, {"_id": 0}).to_list(500)
    _dist_cc_limit = sum(c.get("credit_limit", 0) for c in _ccr)
    _dist_cc_used = round(sum(c.get("credit_used", 0) for c in _ccr), 2)

    return {
        "distributor": d,
        "pending_orders": pending,
        "dispatched_orders": dispatched,
        "delivered_today": delivered_today,
        "today_sales": today_sales,
        "today_orders_count": today_orders_count,
        "outstanding": outstanding,
        "sales_chart": series,
        "top_customers": top_customers,
        "low_stock": low_stock,
        "out_of_stock": out_of_stock,
        "credit_limit": _dist_cc_limit,
        "credit_used": _dist_cc_used,
    }


@api_router.get("/distributor/me/orders")
async def distributor_orders(
    status: Optional[str] = None,
    q: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    d = await get_owned_distributor(user)
    query: dict = {"distributor_id": d["id"]}
    if status and status != "all":
        query["status"] = status
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    # Enrich with customer info
    user_ids = list({o["user_id"] for o in orders})
    users = {u["id"]: u for u in await db.users.find({"id": {"$in": user_ids}}, {"_id": 0}).to_list(200)}
    for o in orders:
        u = users.get(o["user_id"]) or {}
        o["customer_name"] = u.get("shop_name") or u.get("name") or u.get("email")
        o["customer_phone"] = u.get("phone")
        o["customer_email"] = u.get("email")
    if q:
        qq = q.lower().strip()
        orders = [o for o in orders if qq in (o.get("code", "").lower()) or qq in (o.get("customer_name", "").lower())]
    return orders


@api_router.post("/distributor/orders/{order_id}/action")
async def distributor_order_action(
    order_id: str,
    payload: dict = Body(...),
    user: dict = Depends(get_current_user),
):
    """action = 'accept' | 'dispatch' | 'deliver' | 'cancel'"""
    d = await get_owned_distributor(user)
    action = payload.get("action")
    note = payload.get("note") or None
    valid_transitions = {
        "accept": (["placed"], "accepted"),
        "dispatch": (["placed", "accepted"], "dispatched"),
        "deliver": (["dispatched"], "delivered"),
        "cancel": (["placed", "accepted"], "cancelled"),
    }
    if action not in valid_transitions:
        raise HTTPException(400, f"Invalid action. Must be one of: {list(valid_transitions.keys())}")
    allowed, new_status = valid_transitions[action]
    order = await db.orders.find_one({"id": order_id, "distributor_id": d["id"]}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    if order["status"] not in allowed:
        raise HTTPException(400, f"Cannot {action} from {order['status']}")
    updates: dict = {"status": new_status}
    timeline = order.get("timeline", []) + [{
        "status": new_status, "at": iso(now_utc()), "by": "distributor", "note": note,
    }]
    updates["timeline"] = timeline
    if action == "dispatch":
        updates["dispatched_at"] = iso(now_utc())
    elif action == "deliver":
        updates["delivered_at"] = iso(now_utc())
    elif action == "cancel":
        updates["cancelled_at"] = iso(now_utc())
    await db.orders.update_one({"id": order_id}, {"$set": updates})
    return {"success": True, "status": new_status}


@api_router.get("/distributor/me/inventory")
async def distributor_inventory(
    q: Optional[str] = None,
    only: Optional[str] = None,  # 'low' | 'out' | 'in'
    user: dict = Depends(get_current_user),
):
    d = await get_owned_distributor(user)
    query: dict = {"distributor_ids": d["id"]}
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"salt": {"$regex": q, "$options": "i"}},
            {"manufacturer": {"$regex": q, "$options": "i"}},
        ]
    products = await db.products.find(query, {"_id": 0}).to_list(1000)
    items = []
    for p in products:
        my_price = next((pr for pr in (p.get("prices") or []) if pr["distributor_id"] == d["id"]), None)
        if not my_price:
            continue
        qty = my_price.get("qty_available", 0) or 0
        if only == "low" and not (0 < qty <= 20):
            continue
        if only == "out" and qty != 0:
            continue
        if only == "in" and qty <= 20:
            continue
        items.append({
            "product_id": p["id"],
            "name": p["name"],
            "salt": p["salt"],
            "manufacturer": p["manufacturer"],
            "pack": p.get("pack"),
            "image_emoji": p.get("image_emoji", "💊"),
            "mrp": my_price.get("mrp", p.get("mrp")),
            "ptr": my_price.get("ptr", p.get("ptr")),
            "scheme": my_price.get("scheme"),
            "margin_pct": my_price.get("margin_pct"),
            "qty_available": qty,
            "stock_status": "out" if qty == 0 else "low" if qty <= 20 else "in",
            "expiry": my_price.get("expiry"),
            "dist_discount_pct": my_price.get("dist_discount_pct", 0),
            "gst_pct": my_price.get("gst_pct", 12.0),
        })
    return items


class InventoryUpdate(BaseModel):
    ptr: Optional[float] = None
    mrp: Optional[float] = None
    qty_available: Optional[int] = None
    scheme: Optional[str] = None
    dist_discount_pct: Optional[float] = None
    expiry: Optional[str] = None


@api_router.patch("/distributor/me/inventory/{product_id}")
async def distributor_inventory_update(
    product_id: str,
    payload: InventoryUpdate,
    user: dict = Depends(get_current_user),
):
    d = await get_owned_distributor(user)
    p = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Product not found")
    prices = p.get("prices") or []
    found = False
    for pr in prices:
        if pr["distributor_id"] == d["id"]:
            found = True
            for k in ("ptr", "mrp", "qty_available", "scheme", "dist_discount_pct", "expiry"):
                v = getattr(payload, k)
                if v is not None:
                    pr[k] = v
            # recompute margin if ptr or mrp changed
            try:
                if pr.get("mrp") and pr.get("ptr"):
                    pr["margin_pct"] = round(((pr["mrp"] - pr["ptr"]) / pr["mrp"]) * 100, 1)
            except Exception:
                pass
            break
    if not found:
        raise HTTPException(404, "This distributor does not stock this product")
    await db.products.update_one({"id": product_id}, {"$set": {"prices": prices}})
    return {"success": True}


@api_router.get("/distributor/me/customers")
async def distributor_customers(
    q: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    d = await get_owned_distributor(user)
    # All users who have ordered from this distributor
    agg = await db.orders.aggregate([
        {"$match": {"distributor_id": d["id"]}},
        {"$group": {
            "_id": "$user_id",
            "total_spent": {"$sum": "$total"},
            "orders": {"$sum": 1},
            "last_order_at": {"$max": "$created_at"},
        }},
    ]).to_list(500)
    user_ids = [r["_id"] for r in agg]
    users = {u["id"]: u for u in await db.users.find({"id": {"$in": user_ids}}, {"_id": 0}).to_list(500)}
    # Outstanding per user (sum of pending payments to this distributor)
    pay_agg = await db.payments.aggregate([
        {"$match": {"distributor_id": d["id"], "status": {"$in": ["due", "overdue"]}}},
        {"$group": {"_id": "$user_id", "outstanding": {"$sum": "$amount"}, "overdue_count": {"$sum": {"$cond": [{"$eq": ["$status", "overdue"]}, 1, 0]}}}},
    ]).to_list(500)
    pay_map = {p["_id"]: p for p in pay_agg}
    cc_map = {c["user_id"]: c for c in await db.customer_credit.find({"distributor_id": d["id"]}, {"_id": 0}).to_list(500)}
    rows = []
    for r in agg:
        u = users.get(r["_id"])
        if not u:
            continue
        pay = pay_map.get(r["_id"], {"outstanding": 0, "overdue_count": 0})
        cc = cc_map.get(r["_id"]) or {}
        c_lim = cc.get("credit_limit", 0)
        c_used = round(cc.get("credit_used", 0), 2)
        rows.append({
            "user_id": r["_id"],
            "name": u.get("shop_name") or u.get("name") or u.get("email"),
            "contact_name": u.get("name"),
            "email": u.get("email"),
            "phone": u.get("phone"),
            "address": u.get("address"),
            "drug_license": u.get("drug_license"),
            "gst": u.get("gst"),
            "total_spent": r["total_spent"],
            "orders": r["orders"],
            "last_order_at": r["last_order_at"],
            "outstanding": pay["outstanding"],
            "overdue_count": pay["overdue_count"],
            "credit_limit": c_lim,
            "credit_used": c_used,
            "credit_available": round(c_lim - c_used, 2),
            "credit_used_pct": round((c_used / max(c_lim, 1)) * 100, 1),
        })
    if q:
        qq = q.lower()
        rows = [r for r in rows if qq in (r["name"] or "").lower() or qq in (r["email"] or "").lower() or qq in (r["phone"] or "").lower()]
    rows.sort(key=lambda x: x["total_spent"], reverse=True)
    return rows


# ============================================================================
# ERP API KEYS
# ============================================================================

@api_router.get("/distributor/me/api-keys")
async def list_api_keys(user: dict = Depends(get_current_user)):
    d = await require_owner_distributor(user)
    keys = await db.api_keys.find({"distributor_id": d["id"]}, {"_id": 0, "key_secret": 0}).to_list(50)
    return keys


@api_router.post("/distributor/me/api-keys")
async def create_api_key(payload: dict = Body(default={}), user: dict = Depends(get_current_user)):
    d = await require_owner_distributor(user)
    label = (payload.get("label") or "ERP Integration").strip()
    raw = "rxt_live_" + _secrets.token_urlsafe(32)
    item = {
        "id": str(uuid.uuid4()),
        "distributor_id": d["id"],
        "label": label,
        "key_prefix": raw[:14] + "…",
        "key_secret": raw,  # we keep the full key in the doc for demo simplicity
        "created_at": iso(now_utc()),
        "last_used_at": None,
        "active": True,
    }
    await db.api_keys.insert_one({**item})
    # Return the secret only on creation
    return {"id": item["id"], "label": label, "key": raw, "key_prefix": item["key_prefix"], "created_at": item["created_at"]}


@api_router.delete("/distributor/me/api-keys/{key_id}")
async def revoke_api_key(key_id: str, user: dict = Depends(get_current_user)):
    d = await require_owner_distributor(user)
    r = await db.api_keys.update_one({"id": key_id, "distributor_id": d["id"]}, {"$set": {"active": False}})
    if r.modified_count == 0:
        raise HTTPException(404, "Key not found")
    return {"success": True}


# ============================================================================
# ERP-FACING ENDPOINTS (Authenticated via X-API-Key header)
# These are designed to be called from a distributor's own ERP/back-office.
# ============================================================================

async def get_erp_distributor(x_api_key: Optional[str] = Header(default=None, alias="X-API-Key")) -> dict:
    if not x_api_key:
        raise HTTPException(401, "X-API-Key header required")
    key_doc = await db.api_keys.find_one({"key_secret": x_api_key, "active": True}, {"_id": 0})
    if not key_doc:
        raise HTTPException(401, "Invalid or revoked API key")
    await db.api_keys.update_one({"id": key_doc["id"]}, {"$set": {"last_used_at": iso(now_utc())}})
    d = await db.distributors.find_one({"id": key_doc["distributor_id"]}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Distributor not found")
    return d


@api_router.get("/erp/v1/me")
async def erp_me(d: dict = Depends(get_erp_distributor)):
    return {"distributor_id": d["id"], "name": d["name"], "short_name": d["short_name"]}


@api_router.get("/erp/v1/orders")
async def erp_orders(
    status: Optional[str] = None,
    since: Optional[str] = None,
    limit: int = 100,
    d: dict = Depends(get_erp_distributor),
):
    q: dict = {"distributor_id": d["id"]}
    if status:
        q["status"] = status
    if since:
        q["created_at"] = {"$gte": since}
    orders = await db.orders.find(q, {"_id": 0}).sort("created_at", -1).to_list(min(limit, 500))
    return {"count": len(orders), "orders": orders}


@api_router.post("/erp/v1/orders/{order_id}/dispatch")
async def erp_dispatch(order_id: str, payload: dict = Body(default={}), d: dict = Depends(get_erp_distributor)):
    note = payload.get("note") or "Dispatched via ERP"
    order = await db.orders.find_one({"id": order_id, "distributor_id": d["id"]}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    if order["status"] not in ("placed", "accepted"):
        raise HTTPException(400, f"Cannot dispatch from {order['status']}")
    timeline = order.get("timeline", []) + [{"status": "dispatched", "at": iso(now_utc()), "by": "erp", "note": note}]
    await db.orders.update_one({"id": order_id}, {"$set": {"status": "dispatched", "dispatched_at": iso(now_utc()), "timeline": timeline}})
    return {"success": True, "status": "dispatched"}


class BulkInventoryItem(BaseModel):
    product_id: str
    ptr: Optional[float] = None
    mrp: Optional[float] = None
    qty_available: Optional[int] = None
    scheme: Optional[str] = None
    expiry: Optional[str] = None


@api_router.post("/erp/v1/inventory/bulk-update")
async def erp_bulk_inventory(items: List[BulkInventoryItem], d: dict = Depends(get_erp_distributor)):
    updated = 0
    skipped: List[str] = []
    for it in items:
        p = await db.products.find_one({"id": it.product_id}, {"_id": 0})
        if not p:
            skipped.append(it.product_id)
            continue
        prices = p.get("prices") or []
        found = False
        for pr in prices:
            if pr["distributor_id"] == d["id"]:
                found = True
                for k in ("ptr", "mrp", "qty_available", "scheme", "expiry"):
                    v = getattr(it, k)
                    if v is not None:
                        pr[k] = v
                try:
                    if pr.get("mrp") and pr.get("ptr"):
                        pr["margin_pct"] = round(((pr["mrp"] - pr["ptr"]) / pr["mrp"]) * 100, 1)
                except Exception:
                    pass
                break
        if not found:
            skipped.append(it.product_id)
            continue
        await db.products.update_one({"id": it.product_id}, {"$set": {"prices": prices}})
        updated += 1
    return {"updated": updated, "skipped": skipped, "total_requested": len(items)}


@api_router.get("/erp/v1/inventory")
async def erp_get_inventory(d: dict = Depends(get_erp_distributor)):
    products = await db.products.find({"distributor_ids": d["id"]}, {"_id": 0}).to_list(2000)
    rows = []
    for p in products:
        my = next((pr for pr in (p.get("prices") or []) if pr["distributor_id"] == d["id"]), None)
        if not my:
            continue
        rows.append({
            "product_id": p["id"], "name": p["name"], "salt": p["salt"],
            "pack": p.get("pack"), "ptr": my.get("ptr"), "mrp": my.get("mrp"),
            "qty_available": my.get("qty_available"), "scheme": my.get("scheme"),
            "expiry": my.get("expiry"),
        })
    return {"count": len(rows), "items": rows}



# ============================================================================
# DISTRIBUTOR — COLLECTIONS / RECEIVABLES (money owed by customers)
# ============================================================================
@api_router.get("/distributor/me/receivables")
async def distributor_receivables(
    status: Optional[str] = None,  # 'due' | 'overdue' | 'paid' | None(open)
    q: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    d = await get_owned_distributor(user)
    payments = await db.payments.find({"distributor_id": d["id"]}, {"_id": 0}).sort("due_date", 1).to_list(1000)
    # enrich with customer name
    uids = list({p["user_id"] for p in payments})
    users = {u["id"]: u for u in await db.users.find({"id": {"$in": uids}}, {"_id": 0}).to_list(500)}
    for p in payments:
        u = users.get(p["user_id"]) or {}
        p["customer_name"] = u.get("shop_name") or u.get("name") or u.get("email") or "—"
        p["customer_phone"] = u.get("phone")

    open_pays = [p for p in payments if p["status"] in ("due", "overdue")]
    paid_pays = [p for p in payments if p["status"] == "paid"]
    total_outstanding = round(sum(p["amount"] for p in open_pays), 2)
    total_overdue = round(sum(p["amount"] for p in open_pays if p["status"] == "overdue"), 2)
    # collected in last 30 days
    collected_30d = round(sum(
        p["amount"] for p in paid_pays
        if p.get("paid_at") and (now_utc() - datetime.fromisoformat(p["paid_at"].replace("Z", "+00:00"))).days <= 30
    ), 2)
    # due this week
    today = now_utc()
    due_week = 0.0
    for p in open_pays:
        try:
            diff = (datetime.fromisoformat(p["due_date"].replace("Z", "+00:00")).date() - today.date()).days
            if 0 <= diff <= 7:
                due_week += p["amount"]
        except Exception:
            pass

    if status == "paid":
        rows = paid_pays
    elif status in ("due", "overdue"):
        rows = [p for p in open_pays if p["status"] == status]
    else:
        rows = open_pays
    if q:
        qq = q.lower()
        rows = [p for p in rows if qq in (p.get("customer_name", "").lower()) or qq in (p.get("invoice_code", "").lower())]

    return {
        "summary": {
            "total_outstanding": total_outstanding,
            "total_overdue": total_overdue,
            "collected_30d": collected_30d,
            "due_this_week": round(due_week, 2),
            "open_count": len(open_pays),
            "overdue_count": len([p for p in open_pays if p["status"] == "overdue"]),
        },
        "items": rows,
    }


class RecordPaymentReq(BaseModel):
    amount: Optional[float] = None   # if omitted → full settlement
    method: Optional[str] = "cash"   # cash | upi | cheque | neft


@api_router.post("/distributor/payments/{pid}/record")
async def distributor_record_payment(pid: str, req: RecordPaymentReq, user: dict = Depends(get_current_user)):
    """Record a collection (full or partial) from a customer. Reduces the
    customer's credit_used and settles / part-settles the invoice — reflected on
    the pharmacist side instantly."""
    d = await get_owned_distributor(user)
    p = await db.payments.find_one({"id": pid, "distributor_id": d["id"]}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Invoice not found")
    if p["status"] == "paid":
        raise HTTPException(400, "Invoice already settled")
    remaining = round(p["amount"], 2)
    amt = round(min(req.amount if req.amount and req.amount > 0 else remaining, remaining), 2)
    if amt <= 0:
        raise HTTPException(400, "Amount must be greater than zero")
    method = (req.method or "cash").lower()
    cust = p["user_id"]
    await cc_inc(d["id"], cust, -amt)
    fully = amt >= remaining
    if fully:
        await db.payments.update_one(
            {"id": pid},
            {"$set": {"status": "paid", "paid_at": iso(now_utc()), "pay_method": method}},
        )
    else:
        # reduce the open invoice, log the collected portion as a separate paid record
        await db.payments.update_one({"id": pid}, {"$set": {"amount": round(remaining - amt, 2)}})
        await db.payments.insert_one({
            "id": str(uuid.uuid4()), "user_id": cust, "distributor_id": d["id"],
            "distributor_name": p.get("distributor_name", d["short_name"]),
            "invoice_code": f"{p['invoice_code']}-PART", "amount": amt,
            "due_date": p["due_date"], "status": "paid", "days_to_due": 0,
            "paid_at": iso(now_utc()), "pay_method": method,
        })
    return {"success": True, "collected": amt, "fully_paid": fully}


# ============================================================================
# DISTRIBUTOR — CUSTOMER DETAIL + LEDGER + CREDIT MANAGEMENT
# ============================================================================
@api_router.get("/distributor/me/customers/{cust_id}")
async def distributor_customer_detail(cust_id: str, user: dict = Depends(get_current_user)):
    d = await get_owned_distributor(user)
    cust = await db.users.find_one({"id": cust_id}, {"_id": 0})
    if not cust:
        raise HTTPException(404, "Customer not found")
    orders = await db.orders.find({"user_id": cust_id, "distributor_id": d["id"]}, {"_id": 0}).to_list(500)
    payments = await db.payments.find({"user_id": cust_id, "distributor_id": d["id"]}, {"_id": 0}).to_list(500)
    credit_notes = await db.credit_notes.find({"user_id": cust_id, "distributor_id": d["id"]}, {"_id": 0}).to_list(200)
    debit_notes = await db.debit_notes.find({"user_id": cust_id, "distributor_id": d["id"]}, {"_id": 0}).to_list(200)
    cc = await cc_get(d["id"], cust_id)

    entries = []
    for o in orders:
        entries.append({"id": o["id"], "type": "bill", "ref": o["code"], "label": f"Invoice {o['code']}",
                        "date": o["created_at"], "debit": o["total"], "credit": 0, "status": o["status"]})
    for p in payments:
        if p["status"] == "paid":
            entries.append({"id": p["id"], "type": "payment", "ref": p["invoice_code"], "label": f"Payment {p['invoice_code']}",
                            "date": p.get("paid_at") or p["due_date"], "debit": 0, "credit": p["amount"], "status": "settled"})
    for cn in credit_notes:
        entries.append({"id": cn["id"], "type": "credit_note", "ref": cn["code"], "label": f"Credit Note: {cn['reason']}",
                        "date": cn["created_at"], "debit": 0, "credit": cn["amount"], "status": cn.get("status", "issued")})
    for dn in debit_notes:
        entries.append({"id": dn["id"], "type": "debit_note", "ref": dn["code"], "label": f"Debit Note: {dn['reason']}",
                        "date": dn["created_at"], "debit": dn["amount"], "credit": 0, "status": dn.get("status", "issued")})
    entries.sort(key=lambda e: e["date"])
    running = 0.0
    for e in entries:
        running += (e["debit"] - e["credit"])
        e["running_balance"] = round(running, 2)

    outstanding = round(sum(p["amount"] for p in payments if p["status"] in ("due", "overdue")), 2)
    overdue = round(sum(p["amount"] for p in payments if p["status"] == "overdue"), 2)
    last_order = max(orders, key=lambda o: o["created_at"]) if orders else None
    c_lim = cc.get("credit_limit", 0)
    c_used = round(cc.get("credit_used", 0), 2)

    return {
        "customer": {
            "id": cust["id"], "name": cust.get("shop_name") or cust.get("name") or cust.get("email"),
            "contact_name": cust.get("name"), "phone": cust.get("phone"), "email": cust.get("email"),
            "address": cust.get("address"), "gst": cust.get("gst"), "drug_license": cust.get("drug_license"),
        },
        "credit": {
            "credit_limit": c_lim, "credit_used": c_used, "credit_available": round(c_lim - c_used, 2),
            "credit_used_pct": round((c_used / max(c_lim, 1)) * 100, 1),
            "credit_days": cc.get("credit_days", 21), "settlement_discount_pct": cc.get("settlement_discount_pct", 1.5),
            "blacklisted": bool(cc.get("blacklisted")), "blacklist_reason": cc.get("blacklist_reason"),
        },
        "stats": {
            "total_spent": round(sum(o["total"] for o in orders), 2),
            "order_count": len(orders),
            "outstanding": outstanding, "overdue": overdue,
            "last_order_at": last_order["created_at"] if last_order else None,
        },
        "recent_orders": sorted(orders, key=lambda o: o["created_at"], reverse=True)[:5],
        "open_invoices": sorted([p for p in payments if p["status"] in ("due", "overdue")], key=lambda p: p["due_date"]),
        "entries": entries,
    }


class SetCreditReq(BaseModel):
    credit_limit: Optional[int] = None
    credit_days: Optional[int] = None
    settlement_discount_pct: Optional[float] = None


@api_router.patch("/distributor/me/customers/{cust_id}/credit")
async def distributor_set_credit(cust_id: str, req: SetCreditReq, user: dict = Depends(get_current_user)):
    d = await get_owned_distributor(user)
    if not await db.users.find_one({"id": cust_id}, {"_id": 0}):
        raise HTTPException(404, "Customer not found")
    await cc_get(d["id"], cust_id)  # ensure exists
    upd = {"updated_at": iso(now_utc())}
    if req.credit_limit is not None:
        if req.credit_limit < 0:
            raise HTTPException(400, "Credit limit cannot be negative")
        upd["credit_limit"] = int(req.credit_limit)
    if req.credit_days is not None:
        upd["credit_days"] = int(req.credit_days)
    if req.settlement_discount_pct is not None:
        upd["settlement_discount_pct"] = float(req.settlement_discount_pct)
    await db.customer_credit.update_one({"distributor_id": d["id"], "user_id": cust_id}, {"$set": upd})
    cc = await cc_get(d["id"], cust_id)
    return {"success": True, "credit": cc}


class DistNoteReq(BaseModel):
    amount: float
    reason: str
    notes: Optional[str] = None
    order_id: Optional[str] = None


@api_router.post("/distributor/me/customers/{cust_id}/credit-note")
async def distributor_issue_credit_note(cust_id: str, req: DistNoteReq, user: dict = Depends(get_current_user)):
    d = await get_owned_distributor(user)
    if not await db.users.find_one({"id": cust_id}, {"_id": 0}):
        raise HTTPException(404, "Customer not found")
    if req.amount <= 0:
        raise HTTPException(400, "Amount must be greater than zero")
    cnt = await db.credit_notes.count_documents({"distributor_id": d["id"]})
    cn = {
        "id": str(uuid.uuid4()), "code": f"CN-{5000 + cnt + 1}", "user_id": cust_id,
        "distributor_id": d["id"], "order_id": req.order_id, "amount": round(req.amount, 2),
        "reason": req.reason, "notes": req.notes, "status": "issued",
        "issued_by": "distributor", "created_at": iso(now_utc()),
    }
    await db.credit_notes.insert_one({**cn})
    await cc_inc(d["id"], cust_id, -req.amount)
    return {"success": True, "item": cn}


@api_router.post("/distributor/me/customers/{cust_id}/debit-note")
async def distributor_issue_debit_note(cust_id: str, req: DistNoteReq, user: dict = Depends(get_current_user)):
    d = await get_owned_distributor(user)
    if not await db.users.find_one({"id": cust_id}, {"_id": 0}):
        raise HTTPException(404, "Customer not found")
    if req.amount <= 0:
        raise HTTPException(400, "Amount must be greater than zero")
    cnt = await db.debit_notes.count_documents({"distributor_id": d["id"]})
    dn = {
        "id": str(uuid.uuid4()), "code": f"DN-{5000 + cnt + 1}", "user_id": cust_id,
        "distributor_id": d["id"], "order_id": req.order_id, "amount": round(req.amount, 2),
        "reason": req.reason, "notes": req.notes, "status": "issued",
        "issued_by": "distributor", "created_at": iso(now_utc()),
    }
    await db.debit_notes.insert_one({**dn})
    return {"success": True, "item": dn}


@api_router.get("/distributor/me/customers/{cust_id}/statement")
async def distributor_customer_statement(cust_id: str, user: dict = Depends(get_current_user)):
    """Full account statement data for a customer (used to render a shareable PDF)."""
    d = await get_owned_distributor(user)
    cust = await db.users.find_one({"id": cust_id}, {"_id": 0})
    if not cust:
        raise HTTPException(404, "Customer not found")
    orders = await db.orders.find({"user_id": cust_id, "distributor_id": d["id"]}, {"_id": 0}).to_list(1000)
    payments = await db.payments.find({"user_id": cust_id, "distributor_id": d["id"]}, {"_id": 0}).to_list(1000)
    credit_notes = await db.credit_notes.find({"user_id": cust_id, "distributor_id": d["id"]}, {"_id": 0}).to_list(500)
    debit_notes = await db.debit_notes.find({"user_id": cust_id, "distributor_id": d["id"]}, {"_id": 0}).to_list(500)
    cc = await cc_get(d["id"], cust_id)

    entries = []
    for o in orders:
        entries.append({"type": "bill", "ref": o["code"], "label": f"Invoice {o['code']}",
                        "date": o["created_at"], "debit": round(o["total"], 2), "credit": 0})
    for p in payments:
        if p["status"] == "paid":
            entries.append({"type": "payment", "ref": p["invoice_code"], "label": f"Payment received ({(p.get('pay_method') or 'cash').upper()})",
                            "date": p.get("paid_at") or p["due_date"], "debit": 0, "credit": round(p["amount"], 2)})
    for cn in credit_notes:
        entries.append({"type": "credit_note", "ref": cn["code"], "label": f"Credit Note · {cn['reason']}",
                        "date": cn["created_at"], "debit": 0, "credit": round(cn["amount"], 2)})
    for dn in debit_notes:
        entries.append({"type": "debit_note", "ref": dn["code"], "label": f"Debit Note · {dn['reason']}",
                        "date": dn["created_at"], "debit": round(dn["amount"], 2), "credit": 0})
    entries.sort(key=lambda e: e["date"])
    running = 0.0
    for e in entries:
        running += (e["debit"] - e["credit"])
        e["balance"] = round(running, 2)

    total_billed = round(sum(e["debit"] for e in entries), 2)
    total_credited = round(sum(e["credit"] for e in entries), 2)
    outstanding = round(sum(p["amount"] for p in payments if p["status"] in ("due", "overdue")), 2)
    overdue = round(sum(p["amount"] for p in payments if p["status"] == "overdue"), 2)

    return {
        "distributor": {
            "name": d.get("name") or d.get("short_name"),
            "short_name": d.get("short_name"),
            "gst": d.get("gst"), "address": d.get("address") or d.get("location"),
            "phone": d.get("phone"), "location": d.get("location"),
        },
        "customer": {
            "id": cust["id"], "name": cust.get("shop_name") or cust.get("name") or cust.get("email"),
            "contact_name": cust.get("name"), "phone": cust.get("phone"),
            "address": cust.get("address"), "gst": cust.get("gst"), "drug_license": cust.get("drug_license"),
        },
        "credit": {
            "credit_limit": cc.get("credit_limit", 0), "credit_used": round(cc.get("credit_used", 0), 2),
            "credit_available": round(cc.get("credit_limit", 0) - cc.get("credit_used", 0), 2),
            "credit_days": cc.get("credit_days", 21),
        },
        "summary": {
            "total_billed": total_billed, "total_credited": total_credited,
            "outstanding": outstanding, "overdue": overdue,
            "closing_balance": round(running, 2), "entry_count": len(entries),
        },
        "entries": entries,
        "generated_at": iso(now_utc()),
    }



# ============================================================================
# DISTRIBUTOR — MESSAGE PORTAL (two-way chat with customers)
# ============================================================================
@api_router.get("/distributor/me/chat/threads")
async def distributor_chat_threads(user: dict = Depends(get_current_user)):
    d = await get_owned_distributor(user)
    msgs = await db.chat_messages.find({"distributor_id": d["id"]}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    threads: dict = {}
    for m in msgs:
        uid = m["user_id"]
        if uid not in threads:
            threads[uid] = {"user_id": uid, "last_message": m, "unread": 0}
        if m["sender"] == "user" and not m.get("read"):
            threads[uid]["unread"] += 1
    uids = list(threads.keys())
    users = {u["id"]: u for u in await db.users.find({"id": {"$in": uids}}, {"_id": 0}).to_list(500)}
    out = []
    for uid, t in threads.items():
        u = users.get(uid) or {}
        out.append({
            "customer": {"id": uid, "name": u.get("shop_name") or u.get("name") or u.get("email") or "—",
                         "phone": u.get("phone")},
            "last_message": t["last_message"], "unread": t["unread"],
        })
    out.sort(key=lambda t: t["last_message"]["created_at"], reverse=True)
    return out


@api_router.get("/distributor/me/chat/{cust_id}")
async def distributor_chat_history(cust_id: str, user: dict = Depends(get_current_user)):
    d = await get_owned_distributor(user)
    cust = await db.users.find_one({"id": cust_id}, {"_id": 0})
    if not cust:
        raise HTTPException(404, "Customer not found")
    msgs = await db.chat_messages.find({"user_id": cust_id, "distributor_id": d["id"]}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    await db.chat_messages.update_many(
        {"user_id": cust_id, "distributor_id": d["id"], "sender": "user", "read": False},
        {"$set": {"read": True}},
    )
    return {
        "customer": {"id": cust["id"], "name": cust.get("shop_name") or cust.get("name") or cust.get("email"),
                     "phone": cust.get("phone")},
        "messages": msgs,
    }


class DistChatReq(BaseModel):
    user_id: str
    message: str
    attach_order_id: Optional[str] = None


@api_router.post("/distributor/me/chat")
async def distributor_send_chat(req: DistChatReq, user: dict = Depends(get_current_user)):
    d = await get_owned_distributor(user)
    if not req.message.strip():
        raise HTTPException(400, "Message cannot be empty")
    msg = {
        "id": str(uuid.uuid4()), "user_id": req.user_id, "distributor_id": d["id"],
        "sender": "distributor", "message": req.message.strip(),
        "attach_order_id": req.attach_order_id, "read": False, "created_at": iso(now_utc()),
    }
    await db.chat_messages.insert_one({**msg})
    return {"success": True, "message": msg}




# ============================================================================
# TEAM PLATFORM — staff accounts, delivery ops, field-sales CRM
# ============================================================================
async def seed_team_demo() -> None:
    """Seed the distributor owner + staff (manager/field-sales/delivery) + leads
    and assign demo deliveries. Idempotent."""
    if await db.users.find_one({"email": "owner@rxtech.com"}):
        return
    base = now_utc()
    pw = hash_password("Pass@123")

    # Owner (OTP login, owns dist-1)
    await db.users.insert_one({
        "id": "owner-1", "email": "owner@rxtech.com", "name": "Rajesh Mehta",
        "phone": "9810000001", "role": "owner", "owned_distributor_id": "dist-1",
        "distributor_id": "dist-1", "onboarded": True, "active": True,
        "created_at": iso(base - timedelta(days=400)),
    })

    staff = [
        {"id": "mgr-1", "email": "manager@rxtech.com", "name": "Priya Nair", "phone": "9810000002", "role": "manager"},
        {"id": "fs-1", "email": "sales@rxtech.com", "name": "Amit Verma", "phone": "9810000003", "role": "field_sales"},
        {"id": "fs-2", "email": "sales2@rxtech.com", "name": "Kavya Reddy", "phone": "9810000004", "role": "field_sales"},
        {"id": "dl-1", "email": "delivery@rxtech.com", "name": "Suresh Yadav", "phone": "9810000005", "role": "delivery"},
        {"id": "dl-2", "email": "delivery2@rxtech.com", "name": "Manoj Singh", "phone": "9810000006", "role": "delivery"},
    ]
    for s in staff:
        await db.users.insert_one({
            **s, "password_hash": pw, "distributor_id": "dist-1", "owned_distributor_id": None,
            "onboarded": True, "active": True, "must_change_password": False,
            "created_by": "owner-1", "created_at": iso(base - timedelta(days=200)),
        })

    # Assign existing dispatched orders to a delivery rep
    dispatched = await db.orders.find({"distributor_id": "dist-1", "status": "dispatched"}, {"_id": 0}).to_list(50)
    for o in dispatched:
        await db.orders.update_one({"id": o["id"]}, {"$set": {
            "assigned_to": "dl-1", "assigned_to_name": "Suresh Yadav", "delivery_status": "assigned",
        }})

    # Field-sales leads
    leads = [
        {"shop_name": "Sunrise Medicals", "contact_name": "Vikram Joshi", "phone": "9890011111", "area": "Thane West", "status": "new", "assigned_to": "fs-1", "est_value": 80000},
        {"shop_name": "HealthFirst Pharmacy", "contact_name": "Deepa Rao", "phone": "9890022222", "area": "Mulund", "status": "contacted", "assigned_to": "fs-1", "est_value": 120000},
        {"shop_name": "MediPlus Store", "contact_name": "Arjun Kapoor", "phone": "9890033333", "area": "Ghatkopar", "status": "visited", "assigned_to": "fs-1", "est_value": 60000},
        {"shop_name": "Care & Cure Chemist", "contact_name": "Neha Gupta", "phone": "9890044444", "area": "Kurla", "status": "new", "assigned_to": "fs-2", "est_value": 95000},
        {"shop_name": "LifeLine Pharmacy", "contact_name": "Sanjay Patil", "phone": "9890055555", "area": "Sion", "status": "contacted", "assigned_to": "fs-2", "est_value": 70000},
        {"shop_name": "Wellbeing Druggist", "contact_name": "Pooja Shah", "phone": "9890066666", "area": "Chembur", "status": "converted", "assigned_to": "fs-1", "est_value": 110000},
    ]
    names = {"fs-1": "Amit Verma", "fs-2": "Kavya Reddy"}
    for i, l in enumerate(leads):
        await db.leads.insert_one({
            "id": f"lead-{i+1}", "distributor_id": "dist-1",
            "shop_name": l["shop_name"], "contact_name": l["contact_name"], "phone": l["phone"],
            "address": l["area"] + ", Mumbai", "area": l["area"], "status": l["status"],
            "assigned_to": l["assigned_to"], "assigned_to_name": names[l["assigned_to"]],
            "est_value": l["est_value"], "source": "field", "notes": None,
            "activities": [], "customer_id": None, "created_by": "mgr-1",
            "created_at": iso(base - timedelta(days=20 - i)), "updated_at": iso(base - timedelta(days=20 - i)),
        })
    logger.info("Seeded team demo: owner + 5 staff + 6 leads + delivery assignments")


# ---------- Staff management (owner / manager) ----------
class StaffCreateReq(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str  # manager | field_sales | delivery
    phone: Optional[str] = None


class StaffUpdateReq(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = None
    active: Optional[bool] = None
    new_password: Optional[str] = None


def _staff_public(u: dict) -> dict:
    return {
        "id": u["id"], "name": u.get("name"), "email": u.get("email"), "phone": u.get("phone"),
        "role": u.get("role"), "active": u.get("active", True), "created_at": u.get("created_at"),
    }


@api_router.get("/distributor/me/staff")
async def list_staff(role: Optional[str] = None, user: dict = Depends(get_current_user)):
    d = await staff_distributor(user, {"owner", "manager"})
    q = {"distributor_id": d["id"], "role": {"$in": list(STAFF_PASSWORD_ROLES)}}
    if role:
        q["role"] = role
    rows = await db.users.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [_staff_public(u) for u in rows]


@api_router.post("/distributor/me/staff")
async def create_staff(req: StaffCreateReq, user: dict = Depends(get_current_user)):
    d = await staff_distributor(user, {"owner", "manager"})
    if req.role not in STAFF_PASSWORD_ROLES:
        raise HTTPException(400, "Role must be manager, field_sales or delivery")
    if len(req.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    email = req.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(409, "An account with this email already exists")
    uid = str(uuid.uuid4())
    await db.users.insert_one({
        "id": uid, "email": email, "name": req.name.strip(), "phone": (req.phone or "").strip() or None,
        "role": req.role, "password_hash": hash_password(req.password), "distributor_id": d["id"],
        "owned_distributor_id": None, "onboarded": True, "active": True, "must_change_password": True,
        "created_by": user["id"], "created_at": iso(now_utc()),
    })
    u = await db.users.find_one({"id": uid}, {"_id": 0})
    return {"success": True, "staff": _staff_public(u)}


@api_router.patch("/distributor/me/staff/{staff_id}")
async def update_staff(staff_id: str, req: StaffUpdateReq, user: dict = Depends(get_current_user)):
    d = await staff_distributor(user, {"owner", "manager"})
    s = await db.users.find_one({"id": staff_id, "distributor_id": d["id"]}, {"_id": 0})
    if not s or s.get("role") not in STAFF_PASSWORD_ROLES:
        raise HTTPException(404, "Staff member not found")
    upd: dict = {}
    if req.name is not None: upd["name"] = req.name.strip()
    if req.phone is not None: upd["phone"] = req.phone.strip() or None
    if req.role is not None:
        if req.role not in STAFF_PASSWORD_ROLES:
            raise HTTPException(400, "Invalid role")
        upd["role"] = req.role
    if req.active is not None: upd["active"] = req.active
    if req.new_password:
        if len(req.new_password) < 6:
            raise HTTPException(400, "Password must be at least 6 characters")
        upd["password_hash"] = hash_password(req.new_password)
        upd["must_change_password"] = True
    await db.users.update_one({"id": staff_id}, {"$set": upd})
    u = await db.users.find_one({"id": staff_id}, {"_id": 0})
    return {"success": True, "staff": _staff_public(u)}


@api_router.delete("/distributor/me/staff/{staff_id}")
async def deactivate_staff(staff_id: str, user: dict = Depends(get_current_user)):
    d = await staff_distributor(user, {"owner", "manager"})
    s = await db.users.find_one({"id": staff_id, "distributor_id": d["id"]}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Staff member not found")
    await db.users.update_one({"id": staff_id}, {"$set": {"active": False}})
    return {"success": True}


# ---------- Delivery operations ----------
class AssignReq(BaseModel):
    delivery_user_id: str


class DeliverReq(BaseModel):
    photo_base64: str
    lat: Optional[float] = None
    lng: Optional[float] = None
    notes: Optional[str] = None
    amount_collected: Optional[float] = None
    cash_otp: Optional[str] = None


class FailReq(BaseModel):
    reason: str


@api_router.patch("/distributor/orders/{order_id}/assign")
async def assign_delivery(order_id: str, req: AssignReq, user: dict = Depends(get_current_user)):
    d = await staff_distributor(user, {"owner", "manager"})
    o = await db.orders.find_one({"id": order_id, "distributor_id": d["id"]}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Order not found")
    rider = await db.users.find_one({"id": req.delivery_user_id, "distributor_id": d["id"], "role": "delivery"}, {"_id": 0})
    if not rider:
        raise HTTPException(404, "Delivery person not found")
    await db.orders.update_one({"id": order_id}, {"$set": {
        "assigned_to": rider["id"], "assigned_to_name": rider.get("name"), "delivery_status": "assigned",
    }})
    return {"success": True}


@api_router.get("/delivery/me/orders")
async def delivery_my_orders(status: Optional[str] = None, user: dict = Depends(get_current_user)):
    require_role(user, {"delivery"})
    q: dict = {"assigned_to": user["id"]}
    if status == "completed":
        q["delivery_status"] = {"$in": ["delivered", "failed"]}
    else:
        q["delivery_status"] = {"$in": ["assigned", "out_for_delivery"]}
    orders = await db.orders.find(q, {"_id": 0}).sort("created_at", 1).to_list(200)
    uids = list({o["user_id"] for o in orders})
    users = {u["id"]: u for u in await db.users.find({"id": {"$in": uids}}, {"_id": 0}).to_list(500)}
    for o in orders:
        u = users.get(o["user_id"]) or {}
        o["customer_name"] = u.get("shop_name") or u.get("name") or "Customer"
        o["customer_phone"] = u.get("phone")
        o["customer_address"] = u.get("address")
    return orders


@api_router.get("/delivery/me/summary")
async def delivery_summary(user: dict = Depends(get_current_user)):
    require_role(user, {"delivery"})
    today = now_utc().replace(hour=0, minute=0, second=0, microsecond=0)
    assigned = await db.orders.count_documents({"assigned_to": user["id"], "delivery_status": {"$in": ["assigned", "out_for_delivery"]}})
    delivered_today = await db.orders.count_documents({"assigned_to": user["id"], "delivery_status": "delivered", "delivered_at": {"$gte": iso(today)}})
    failed = await db.orders.count_documents({"assigned_to": user["id"], "delivery_status": "failed"})
    return {"pending": assigned, "delivered_today": delivered_today, "failed": failed, "rider_name": user.get("name")}


@api_router.post("/delivery/orders/{order_id}/start")
async def delivery_start(order_id: str, user: dict = Depends(get_current_user)):
    require_role(user, {"delivery"})
    o = await db.orders.find_one({"id": order_id, "assigned_to": user["id"]}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Delivery not found")
    await db.orders.update_one({"id": order_id}, {"$set": {"delivery_status": "out_for_delivery"}})
    return {"success": True}


@api_router.post("/delivery/orders/{order_id}/deliver")
async def delivery_complete(order_id: str, req: DeliverReq, user: dict = Depends(get_current_user)):
    require_role(user, {"delivery"})
    o = await db.orders.find_one({"id": order_id, "assigned_to": user["id"]}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Delivery not found")
    if not req.photo_base64:
        raise HTTPException(400, "A delivery photo is required as proof")
    # Cash collection OTP verification (demo): if a cash OTP was generated for
    # this order, the rider must enter it to confirm cash was collected.
    if o.get("payment_method") == "cash" and o.get("cash_otp"):
        if not req.cash_otp:
            raise HTTPException(400, "Enter the cash collection OTP shown to the customer")
        if req.cash_otp.strip() != o["cash_otp"]:
            raise HTTPException(400, "Incorrect cash OTP. Ask the customer to confirm the code.")
    proof = {
        "photo_base64": req.photo_base64, "lat": req.lat, "lng": req.lng,
        "notes": req.notes, "captured_at": iso(now_utc()), "rider_id": user["id"], "rider_name": user.get("name"),
        "amount_collected": req.amount_collected,
    }
    set_fields = {
        "status": "delivered", "delivery_status": "delivered", "delivery_confirmed": True,
        "delivered_at": iso(now_utc()), "delivery_proof": proof,
    }
    if o.get("payment_method") == "cash":
        set_fields["cash_collected"] = req.amount_collected if req.amount_collected is not None else o.get("total", 0)
        set_fields["cash_otp_verified"] = bool(o.get("cash_otp"))
    await db.orders.update_one({"id": order_id}, {"$set": set_fields})
    return {"success": True}


@api_router.post("/delivery/orders/{order_id}/fail")
async def delivery_fail(order_id: str, req: FailReq, user: dict = Depends(get_current_user)):
    require_role(user, {"delivery"})
    o = await db.orders.find_one({"id": order_id, "assigned_to": user["id"]}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Delivery not found")
    await db.orders.update_one({"id": order_id}, {"$set": {
        "delivery_status": "failed", "fail_reason": req.reason, "failed_at": iso(now_utc()),
    }})
    return {"success": True}


# ---------- Field Sales CRM ----------
class LeadCreateReq(BaseModel):
    shop_name: str
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    area: Optional[str] = None
    assigned_to: Optional[str] = None
    est_value: Optional[float] = None
    notes: Optional[str] = None


class LeadBulkReq(BaseModel):
    leads: List[LeadCreateReq]
    assigned_to: Optional[str] = None


class LeadUpdateReq(BaseModel):
    status: Optional[str] = None
    assigned_to: Optional[str] = None
    est_value: Optional[float] = None
    notes: Optional[str] = None
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None


class LeadActivityReq(BaseModel):
    type: str  # call | visit | note
    notes: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None


LEAD_STAGES = ["new", "contacted", "visited", "converted", "lost"]


async def _distributor_for_crm(user: dict) -> dict:
    return await staff_distributor(user, {"owner", "manager", "field_sales"})


@api_router.get("/distributor/me/leads")
async def list_leads(status: Optional[str] = None, q: Optional[str] = None, mine: Optional[bool] = None, user: dict = Depends(get_current_user)):
    d = await _distributor_for_crm(user)
    query: dict = {"distributor_id": d["id"]}
    # field reps only see their own leads
    if user.get("role") == "field_sales" or mine:
        query["assigned_to"] = user["id"]
    if status:
        query["status"] = status
    rows = await db.leads.find(query, {"_id": 0}).sort("updated_at", -1).to_list(1000)
    if q:
        ql = q.lower()
        rows = [r for r in rows if ql in (r.get("shop_name", "").lower()) or ql in (r.get("area", "").lower()) or ql in (r.get("phone", "") or "")]
    counts = {s: 0 for s in LEAD_STAGES}
    base_q = {"distributor_id": d["id"]}
    if user.get("role") == "field_sales":
        base_q["assigned_to"] = user["id"]
    for r in await db.leads.find(base_q, {"_id": 0, "status": 1}).to_list(2000):
        counts[r.get("status", "new")] = counts.get(r.get("status", "new"), 0) + 1
    return {"items": rows, "counts": counts}


@api_router.post("/distributor/me/leads")
async def create_lead(req: LeadCreateReq, user: dict = Depends(get_current_user)):
    d = await _distributor_for_crm(user)
    assignee = req.assigned_to or (user["id"] if user.get("role") == "field_sales" else None)
    aname = None
    if assignee:
        au = await db.users.find_one({"id": assignee}, {"_id": 0})
        aname = (au or {}).get("name")
    lead = {
        "id": str(uuid.uuid4()), "distributor_id": d["id"], "shop_name": req.shop_name.strip(),
        "contact_name": req.contact_name, "phone": req.phone, "address": req.address,
        "area": req.area, "status": "new", "assigned_to": assignee, "assigned_to_name": aname,
        "est_value": req.est_value or 0, "source": "field", "notes": req.notes, "activities": [],
        "customer_id": None, "created_by": user["id"], "created_at": iso(now_utc()), "updated_at": iso(now_utc()),
    }
    await db.leads.insert_one({**lead})
    return {"success": True, "lead": lead}


@api_router.post("/distributor/me/leads/bulk")
async def bulk_leads(req: LeadBulkReq, user: dict = Depends(get_current_user)):
    d = await staff_distributor(user, {"owner", "manager"})
    aname = None
    if req.assigned_to:
        au = await db.users.find_one({"id": req.assigned_to}, {"_id": 0})
        aname = (au or {}).get("name")
    docs = []
    for l in req.leads:
        if not l.shop_name.strip():
            continue
        docs.append({
            "id": str(uuid.uuid4()), "distributor_id": d["id"], "shop_name": l.shop_name.strip(),
            "contact_name": l.contact_name, "phone": l.phone, "address": l.address, "area": l.area,
            "status": "new", "assigned_to": req.assigned_to, "assigned_to_name": aname,
            "est_value": l.est_value or 0, "source": "import", "notes": l.notes, "activities": [],
            "customer_id": None, "created_by": user["id"], "created_at": iso(now_utc()), "updated_at": iso(now_utc()),
        })
    if docs:
        await db.leads.insert_many(docs)
    return {"success": True, "imported": len(docs)}


@api_router.get("/distributor/me/leads/{lead_id}")
async def lead_detail(lead_id: str, user: dict = Depends(get_current_user)):
    d = await _distributor_for_crm(user)
    lead = await db.leads.find_one({"id": lead_id, "distributor_id": d["id"]}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Lead not found")
    if user.get("role") == "field_sales" and lead.get("assigned_to") != user["id"]:
        raise HTTPException(403, "Not your lead")
    return lead


@api_router.patch("/distributor/me/leads/{lead_id}")
async def update_lead(lead_id: str, req: LeadUpdateReq, user: dict = Depends(get_current_user)):
    d = await _distributor_for_crm(user)
    lead = await db.leads.find_one({"id": lead_id, "distributor_id": d["id"]}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Lead not found")
    if user.get("role") == "field_sales" and lead.get("assigned_to") != user["id"]:
        raise HTTPException(403, "Not your lead")
    upd: dict = {"updated_at": iso(now_utc())}
    if req.status is not None:
        if req.status not in LEAD_STAGES:
            raise HTTPException(400, "Invalid status")
        upd["status"] = req.status
    if req.assigned_to is not None:
        au = await db.users.find_one({"id": req.assigned_to}, {"_id": 0})
        upd["assigned_to"] = req.assigned_to
        upd["assigned_to_name"] = (au or {}).get("name")
    for f in ["est_value", "notes", "contact_name", "phone", "address"]:
        v = getattr(req, f)
        if v is not None:
            upd[f] = v
    await db.leads.update_one({"id": lead_id}, {"$set": upd})
    return {"success": True, "lead": await db.leads.find_one({"id": lead_id}, {"_id": 0})}


@api_router.post("/distributor/me/leads/{lead_id}/activity")
async def add_lead_activity(lead_id: str, req: LeadActivityReq, user: dict = Depends(get_current_user)):
    d = await _distributor_for_crm(user)
    lead = await db.leads.find_one({"id": lead_id, "distributor_id": d["id"]}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Lead not found")
    act = {
        "id": str(uuid.uuid4()), "type": req.type, "notes": req.notes, "lat": req.lat, "lng": req.lng,
        "by": user["id"], "by_name": user.get("name"), "at": iso(now_utc()),
    }
    new_status = lead.get("status")
    if req.type == "visit" and lead.get("status") in ("new", "contacted"):
        new_status = "visited"
    elif req.type == "call" and lead.get("status") == "new":
        new_status = "contacted"
    await db.leads.update_one({"id": lead_id}, {"$push": {"activities": act}, "$set": {"status": new_status, "updated_at": iso(now_utc())}})
    return {"success": True, "activity": act}


@api_router.post("/distributor/me/leads/{lead_id}/convert")
async def convert_lead(lead_id: str, user: dict = Depends(get_current_user)):
    d = await _distributor_for_crm(user)
    lead = await db.leads.find_one({"id": lead_id, "distributor_id": d["id"]}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Lead not found")
    if lead.get("customer_id"):
        raise HTTPException(400, "Lead already converted")
    cust_id = str(uuid.uuid4())
    await db.users.insert_one({
        "id": cust_id, "email": (lead.get("phone") or cust_id) + "@lead.demo",
        "name": lead.get("contact_name") or lead["shop_name"], "phone": lead.get("phone"),
        "shop_name": lead["shop_name"], "gst": None, "address": lead.get("address"),
        "drug_license": None, "food_license": None, "onboarded": True, "role": "pharmacist",
        "owned_distributor_id": None, "created_at": iso(now_utc()),
    })
    await cc_get(d["id"], cust_id)  # opens a default credit line
    await db.leads.update_one({"id": lead_id}, {"$set": {"status": "converted", "customer_id": cust_id, "updated_at": iso(now_utc())}})
    return {"success": True, "customer_id": cust_id}


@api_router.delete("/distributor/me/leads/{lead_id}")
async def delete_lead(lead_id: str, user: dict = Depends(get_current_user)):
    d = await staff_distributor(user, {"owner", "manager"})
    res = await db.leads.delete_one({"id": lead_id, "distributor_id": d["id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Lead not found")
    return {"success": True}


# ---------- Owner cockpit: team performance ----------
@api_router.get("/distributor/me/team/performance")
async def team_performance(user: dict = Depends(get_current_user)):
    d = await staff_distributor(user, {"owner", "manager"})
    staff = await db.users.find({"distributor_id": d["id"], "role": {"$in": list(STAFF_PASSWORD_ROLES)}}, {"_id": 0}).to_list(200)
    today = now_utc().replace(hour=0, minute=0, second=0, microsecond=0)
    perf = []
    for s in staff:
        if s["role"] == "delivery":
            delivered = await db.orders.count_documents({"assigned_to": s["id"], "delivery_status": "delivered"})
            delivered_today = await db.orders.count_documents({"assigned_to": s["id"], "delivery_status": "delivered", "delivered_at": {"$gte": iso(today)}})
            pending = await db.orders.count_documents({"assigned_to": s["id"], "delivery_status": {"$in": ["assigned", "out_for_delivery"]}})
            perf.append({**_staff_public(s), "metric_label": "Deliveries", "delivered": delivered, "delivered_today": delivered_today, "pending": pending})
        elif s["role"] == "field_sales":
            total = await db.leads.count_documents({"assigned_to": s["id"]})
            converted = await db.leads.count_documents({"assigned_to": s["id"], "status": "converted"})
            perf.append({**_staff_public(s), "metric_label": "Leads", "leads": total, "converted": converted,
                         "conversion_pct": round((converted / max(total, 1)) * 100)})
        else:
            perf.append({**_staff_public(s), "metric_label": "Manager"})
    summary = {
        "total_staff": len(staff),
        "managers": len([s for s in staff if s["role"] == "manager"]),
        "field_sales": len([s for s in staff if s["role"] == "field_sales"]),
        "delivery": len([s for s in staff if s["role"] == "delivery"]),
    }
    return {"summary": summary, "team": perf}


# Register router
app.include_router(api_router)

# Client-requested feature endpoints (imported after all helpers are defined)
from client_features import feature_router  # noqa: E402
app.include_router(feature_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await seed_database()
    await seed_distributor_demo()
    await seed_team_demo()


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
