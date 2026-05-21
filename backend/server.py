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
async def seed_database():
    """Idempotent seed of distributors, products, sample data."""
    if await db.distributors.count_documents({}) > 0:
        return

    distributors = [
        {"id": "dist-1", "name": "ABC Pharma Distributors", "short_name": "ABC Pharma", "rating": 4.7, "delivery_time": "Today 6 PM", "min_order": 2000, "location": "Mumbai", "gst": "27AABCU9603R1ZX", "categories": ["Antibiotics", "Diabetes", "Cardiac"], "discount_label": "Up to 18% off", "credit_limit": 200000, "credit_used": 184000},
        {"id": "dist-2", "name": "Medline Distributors Pvt Ltd", "short_name": "Medline Distr.", "rating": 4.5, "delivery_time": "Tomorrow", "min_order": 1500, "location": "Pune", "gst": "27ABCDE1234F1Z5", "categories": ["General", "Pediatric"], "discount_label": "Up to 14% off", "credit_limit": 150000, "credit_used": 42000},
        {"id": "dist-3", "name": "XYZ Pharma Wholesale", "short_name": "XYZ Pharma", "rating": 4.6, "delivery_time": "Today 8 PM", "min_order": 1000, "location": "Mumbai", "gst": "27XYZAB5678C1Z9", "categories": ["Antibiotics", "Generic", "Dermatology"], "discount_label": "Up to 22% off", "credit_limit": 100000, "credit_used": 18500},
        {"id": "dist-4", "name": "HealthFirst Distribution", "short_name": "HealthFirst", "rating": 4.3, "delivery_time": "Tomorrow", "min_order": 3000, "location": "Thane", "gst": "27HEAL1234F1Z7", "categories": ["Surgical", "Devices"], "discount_label": "Up to 12% off", "credit_limit": 80000, "credit_used": 0},
        {"id": "dist-5", "name": "Sun Wholesale Pharma", "short_name": "Sun Wholesale", "rating": 4.4, "delivery_time": "Today 7 PM", "min_order": 1500, "location": "Mumbai", "gst": "27SUNWS998P1Z1", "categories": ["Generic", "Antibiotics"], "discount_label": "Up to 16% off", "credit_limit": 120000, "credit_used": 31000},
    ]
    await db.distributors.insert_many([{**d} for d in distributors])

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
    await db.products.insert_many([{**p} for p in products])

    logger.info(f"Seeded {len(distributors)} distributors and {len(products)} products")


async def seed_user_data(user_id: str):
    """Seed sample orders, payments, returns for a user upon first login."""
    if await db.orders.count_documents({"user_id": user_id}) > 0:
        return

    base = now_utc()
    orders = [
        {"id": str(uuid.uuid4()), "code": "ORD-2340", "user_id": user_id, "items": [{"product_id": "p-1", "name": "Azithromycin 500mg", "qty": 30, "price": 54.20}, {"product_id": "p-2", "name": "Paracetamol 650mg", "qty": 50, "price": 32.50}, {"product_id": "p-6", "name": "Cetirizine 10mg", "qty": 40, "price": 22.40}], "distributor_id": "dist-3", "distributor_name": "XYZ Pharma", "sku_count": 3, "total": 12450.00, "status": "placed", "created_at": iso(base - timedelta(hours=3)), "eta": iso(base + timedelta(hours=4))},
        {"id": str(uuid.uuid4()), "code": "ORD-2341", "user_id": user_id, "items": [{"product_id": "p-4", "name": "Amlodipine 5mg", "qty": 20, "price": 40.80}, {"product_id": "p-7", "name": "Atorvastatin 10mg", "qty": 25, "price": 78.00}], "distributor_id": "dist-1", "distributor_name": "ABC Pharma", "sku_count": 2, "total": 8650.00, "status": "processing", "created_at": iso(base - timedelta(hours=6)), "eta": iso(base + timedelta(hours=2))},
        {"id": str(uuid.uuid4()), "code": "ORD-2342", "user_id": user_id, "items": [{"product_id": "p-5", "name": "Pantoprazole 40mg", "qty": 30, "price": 89.50}], "distributor_id": "dist-5", "distributor_name": "Sun Wholesale", "sku_count": 1, "total": 6450.00, "status": "shipped", "created_at": iso(base - timedelta(hours=8)), "eta": iso(base + timedelta(hours=1))},
        {"id": str(uuid.uuid4()), "code": "ORD-2338", "user_id": user_id, "items": [{"product_id": "p-9", "name": "Amoxicillin 500mg", "qty": 50, "price": 66.00}], "distributor_id": "dist-5", "distributor_name": "Sun Wholesale", "sku_count": 4, "total": 14750.00, "status": "delivered", "created_at": iso(base - timedelta(days=1)), "eta": None},
    ]
    await db.orders.insert_many(orders)

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

    returns = [
        {"id": str(uuid.uuid4()), "user_id": user_id, "product_name": "Paracetamol 650mg", "distributor_name": "Medline Distr.", "reason": "Damaged packaging", "qty": 10, "amount": 325.00, "status": "approved", "created_at": iso(base - timedelta(days=2))},
        {"id": str(uuid.uuid4()), "user_id": user_id, "product_name": "Atorvastatin 10mg", "distributor_name": "ABC Pharma", "reason": "Near expiry", "qty": 5, "amount": 390.00, "status": "requested", "created_at": iso(base - timedelta(hours=12))},
    ]
    await db.returns.insert_many(returns)

    # Shortbook entries — auto reorder candidates
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

    abc = await db.distributors.find_one({"id": "dist-1"}, {"_id": 0})
    credit_pct = round((abc["credit_used"] / abc["credit_limit"]) * 100) if abc else 0

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
                "distributor": abc["short_name"] if abc else "",
                "used_pct": credit_pct,
                "used": abc["credit_used"] if abc else 0,
                "limit": abc["credit_limit"] if abc else 0,
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
@api_router.post("/orders")
async def place_order(distributor_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = {"user_id": user["id"]}
    if distributor_id:
        query["distributor_id"] = distributor_id
    cart = await db.cart.find(query, {"_id": 0}).to_list(100)
    if not cart:
        raise HTTPException(400, "Cart is empty")

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
            line = p["ptr"] * it["qty"]
            total += line
            order_items.append({"product_id": p["id"], "name": p["name"], "qty": it["qty"], "price": p["ptr"]})
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
    item = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "product_name": req.product_name,
        "distributor_name": req.distributor_name,
        "reason": req.reason,
        "qty": req.qty,
        "amount": req.amount,
        "status": "requested",
        "created_at": iso(now_utc()),
    }
    await db.returns.insert_one({**item})
    return {"success": True, "item": item}


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
# HEALTH / ROOT
# ============================================================
@api_router.get("/")
async def root():
    return {"message": "RX Tech API"}


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
