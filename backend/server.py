"""
RX Tech – B2B Medicine Marketplace Backend
FastAPI + MongoDB, JWT-based session with Email OTP.
"""
from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import random
import string
import jwt
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
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


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


class User(BaseModel):
    id: str
    email: str
    name: Optional[str] = None
    phone: Optional[str] = None
    shop_name: Optional[str] = None
    gst: Optional[str] = None
    address: Optional[str] = None
    onboarded: bool = False
    created_at: str


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
            {"id": str(uuid.uuid4()), "code": "ORD-2340", "user_id": user_id, "items": [{"product_id": "p-1", "name": "Azithromycin 500mg", "qty": 30, "price": 54.20}, {"product_id": "p-2", "name": "Paracetamol 650mg", "qty": 50, "price": 32.50}, {"product_id": "p-6", "name": "Cetirizine 10mg", "qty": 40, "price": 22.40}], "distributor_id": "dist-3", "distributor_name": "XYZ Pharma", "sku_count": 3, "total": 12450.00, "status": "placed", "created_at": iso(base - timedelta(hours=3)), "eta": iso(base + timedelta(hours=4))},
            {"id": str(uuid.uuid4()), "code": "ORD-2341", "user_id": user_id, "items": [{"product_id": "p-4", "name": "Amlodipine 5mg", "qty": 20, "price": 40.80}, {"product_id": "p-7", "name": "Atorvastatin 10mg", "qty": 25, "price": 78.00}], "distributor_id": "dist-1", "distributor_name": "ABC Pharma", "sku_count": 2, "total": 8650.00, "status": "processing", "created_at": iso(base - timedelta(hours=6)), "eta": iso(base + timedelta(hours=2))},
            {"id": str(uuid.uuid4()), "code": "ORD-2342", "user_id": user_id, "items": [{"product_id": "p-5", "name": "Pantoprazole 40mg", "qty": 30, "price": 89.50}], "distributor_id": "dist-5", "distributor_name": "Sun Wholesale", "sku_count": 1, "total": 6450.00, "status": "shipped", "created_at": iso(base - timedelta(hours=8)), "eta": iso(base + timedelta(hours=1))},
            {"id": str(uuid.uuid4()), "code": "ORD-2338", "user_id": user_id, "items": [{"product_id": "p-9", "name": "Amoxicillin 500mg", "qty": 50, "price": 66.00}], "distributor_id": "dist-5", "distributor_name": "Sun Wholesale", "sku_count": 4, "total": 14750.00, "status": "delivered", "created_at": iso(base - timedelta(days=1)), "eta": None},
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

    return {"success": True, "token": token, "user": user, "onboarded": user.get("onboarded", False)}


@api_router.post("/auth/onboard")
async def onboard(payload: OnboardRequest, user: dict = Depends(get_current_user)):
    update = {
        "name": payload.name.strip(),
        "phone": payload.phone.strip(),
        "shop_name": (payload.shop_name or "").strip() or None,
        "gst": (payload.gst or "").strip() or None,
        "address": (payload.address or "").strip() or None,
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

    # Pick the worst-utilized distributor as the credit-warning subject
    all_dists = await db.distributors.find({}, {"_id": 0}).to_list(50)
    worst = max(
        all_dists,
        key=lambda d: (d.get("credit_used", 0) / max(d.get("credit_limit", 1), 1)),
        default=None,
    )
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
async def get_distributor(dist_id: str):
    d = await db.distributors.find_one({"id": dist_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Not found")
    # Products from this distributor
    prods = await db.products.find({"distributor_ids": dist_id}, {"_id": 0}).to_list(200)
    return {"distributor": d, "products": prods}


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
    distributors = await db.distributors.find({"id": {"$in": p["distributor_ids"]}}, {"_id": 0}).to_list(20)
    # Substitutes — same salt different product
    substitutes = await db.products.find(
        {"salt": p["salt"], "id": {"$ne": pid}}, {"_id": 0}
    ).to_list(10)
    return {"product": p, "distributors": distributors, "substitutes": substitutes}


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


# ============================================================
# ORDERS
# ============================================================
class PlaceOrderQuery(BaseModel):
    payment_method: str = "cash"  # cash | credit


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
            order_items.append({"product_id": p["id"], "name": p["name"], "qty": it["qty"], "price": unit})
        # If credit, check + deduct distributor credit limit
        if pm == "credit" and d:
            available = (d.get("credit_limit", 0) - d.get("credit_used", 0))
            if total > available:
                raise HTTPException(400, f"Credit insufficient with {d['short_name']}: ₹{available:.0f} available, ₹{total:.0f} required")
            await db.distributors.update_one({"id": dist_id}, {"$inc": {"credit_used": total}})
        order = {
            "id": str(uuid.uuid4()),
            "code": f"ORD-{code_suffix}",
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
        }
        await db.orders.insert_one({**order})
        orders_created.append(order)
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
    total_credit_taken = sum(d.get("credit_used", 0) for d in distributors)
    total_credit_limit = sum(d.get("credit_limit", 0) for d in distributors)

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
            await db.distributors.update_one(
                {"id": cn["distributor_id"]},
                {"$inc": {"credit_used": -cn["amount"]}},
            )
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


@api_router.post("/scan/extract")
async def scan_extract(req: ScanReq, user: dict = Depends(get_current_user)):
    """Extract medicines from a bill/prescription image, then search catalog for matches."""
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "OCR not configured")

    # Strip data: prefix
    img = req.image_base64
    if "," in img and img.startswith("data:"):
        img = img.split(",", 1)[1]

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"scan-{user['id']}-{int(now_utc().timestamp())}",
        system_message=(
            "You are a pharmacy OCR assistant. Look at the image of a doctor's prescription "
            "OR a pharmacy bill/invoice. Extract ONLY medicine names (generic or brand). "
            "Respond with a JSON array of strings, no prose. Example: [\"Azithromycin 500mg\", \"Paracetamol 650mg\"]. "
            "If you cannot read any medicine names, return []."
        ),
    ).with_model("openai", "gpt-4o-mini")

    msg = UserMessage(
        text="Extract all medicine names from this image. Return strict JSON array.",
        file_contents=[ImageContent(image_base64=img)],
    )
    try:
        raw = await chat.send_message(msg)
    except Exception as e:
        logger.exception("OCR failed")
        raise HTTPException(500, f"OCR failed: {e}")

    # Parse JSON array from response
    import re, json as _json
    text = (raw or "").strip()
    # extract JSON array
    m = re.search(r"\[.*\]", text, re.S)
    names: List[str] = []
    if m:
        try:
            arr = _json.loads(m.group(0))
            names = [str(x).strip() for x in arr if str(x).strip()]
        except Exception:
            names = []

    # Search catalog for each
    matches = []
    seen = set()
    for n in names[:20]:
        key = n.split()[0].lower() if n else ""
        if not key or key in seen:
            continue
        seen.add(key)
        # search products by first significant token
        items = await db.products.find(
            {"$or": [
                {"name": {"$regex": key, "$options": "i"}},
                {"salt": {"$regex": key, "$options": "i"}},
            ]},
            {"_id": 0},
        ).to_list(3)
        if items:
            # pick best (first) match — enrich with best distributor
            best = items[0]
            dist = await db.distributors.find_one({"id": best["best_distributor_id"]}, {"_id": 0})
            matches.append({
                "scanned_name": n,
                "product": best,
                "best_distributor": dist,
                "alternatives": items[1:3],
            })
        else:
            matches.append({"scanned_name": n, "product": None, "best_distributor": None, "alternatives": []})

    return {"extracted": names, "matches": matches}


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
    total_credit_taken = sum(d.get("credit_used", 0) for d in distributors)
    total_credit_limit = sum(d.get("credit_limit", 0) for d in distributors)

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


@api_router.get("/")
async def root():
    return {"message": "RX Tech API"}


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
    credit_available = (dist.get("credit_limit", 0) - dist.get("credit_used", 0))

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
            "credit_limit": dist.get("credit_limit", 0),
            "credit_used": dist.get("credit_used", 0),
            "credit_available": credit_available,
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
    # If credit note offsets credit-used, reduce it
    if req.amount > 0:
        await db.distributors.update_one(
            {"id": req.distributor_id},
            {"$inc": {"credit_used": -req.amount}},
        )
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


# Register router
app.include_router(api_router)

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


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
