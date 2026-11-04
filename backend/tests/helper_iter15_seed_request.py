# Helper: register TEST_ pharmacy and send mapping request to dist-1 (for distributor UI approve test)
import os, uuid, random, requests, json
API = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api"
email = f"test_ui_{uuid.uuid4().hex[:6]}@example.com"
r = requests.post(f"{API}/auth/register", json={"account_type": "pharmacy", "name": "TEST_UI Pharm", "email": email,
                                                 "phone": "9" + str(random.randint(100000000, 999999999)), "business_name": "TEST_UI Shop"})
otp = requests.post(f"{API}/auth/send-otp", json={"email": email, "portal": "pharmacy"}).json()["dev_otp"]
tok = requests.post(f"{API}/auth/verify-otp", json={"email": email, "otp": otp, "portal": "pharmacy"}).json()["token"]
h = {"Authorization": f"Bearer {tok}"}
print(requests.post(f"{API}/retail/mappings", headers=h, json={"distributor_id": "dist-1", "note": "TEST_UI request"}).json())
me = requests.get(f"{API}/auth/me", headers=h).json()
print(json.dumps({"email": email, "id": (me.get("user") or me).get("id")}))
