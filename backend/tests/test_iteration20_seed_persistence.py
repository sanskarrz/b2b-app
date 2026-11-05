# Iteration 20: products catalogue survives backend restart (insert-only seed top-up)
import os
import subprocess
import time

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")


def _count():
    r = requests.get(f"{BASE_URL}/api/products", params={"limit": 5}, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    items = data if isinstance(data, list) else (data.get("items") or data.get("products") or [])
    total = None if isinstance(data, list) else (data.get("total") or data.get("count"))
    return items, total


def _mongo_count():
    from pymongo import MongoClient
    from dotenv import dotenv_values
    env = dotenv_values("/app/backend/.env")
    c = MongoClient(env["MONGO_URL"])
    return c[env["DB_NAME"]].products.count_documents({})


def test_products_list_returns_items():
    items, _ = _count()
    assert len(items) > 0
    assert "id" in items[0] and "name" in items[0]
    assert "_id" not in items[0]


def test_product_count_stable_after_restart():
    before = _mongo_count()
    subprocess.run(["sudo", "supervisorctl", "restart", "backend"], check=True, capture_output=True)
    ok = False
    for _ in range(60):
        time.sleep(2)
        try:
            if requests.get(f"{BASE_URL}/api/products", params={"limit": 1}, timeout=10).status_code == 200:
                ok = True
                break
        except Exception:
            pass
    assert ok, "backend did not come back"
    time.sleep(3)
    after = _mongo_count()
    print(f"products before={before} after={after}")
    assert after >= before
    items, _ = _count()
    assert len(items) > 0
