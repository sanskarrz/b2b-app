# RX Tech — Developer Knowledge Transfer (KT)

> B2B medicine marketplace + distributor operations platform.
> Expo (React Native, file-based routing) frontend · FastAPI backend · MongoDB.
> Runs on **mobile (iOS/Android via Expo)** and **desktop web** (React Native Web).

---

## 1. Tech stack
| Layer | Tech |
|---|---|
| Frontend | Expo SDK 54, expo-router, TypeScript, React Native (+ RN Web) |
| Backend | FastAPI, Motor (async MongoDB), PyJWT, pandas/openpyxl/xlsxwriter (data sync) |
| DB | MongoDB |
| Auth | Email OTP (pharmacist/owner) + email-password JWT (staff). 30-day JWT. |
| Deploy | Backend on K8s, frontend on EAS/Expo. Production: https://wireframe-to-app-1.emergent.host |

---

## 2. Repository layout
```
/app
├── backend
│   ├── server.py            # main app: auth, catalog, cart, orders, payments,
│   │                        #   credit/ledger, collections, chat, distributor mgmt,
│   │                        #   team, leads, deliveries, seeds  (~4100 lines)
│   ├── client_features.py   # feature_router: 14 client features (disputes, staff chat,
│   │                        #   field orders, barcode, stock adjust, bills, blacklist…)
│   ├── sync_engine.py       # sync_router: ERP CSV/XLSX import + export + auto-sync
│   ├── requirements.txt
│   └── tests/               # pytest (test_client_features.py, test_erp_sync.py)
├── frontend
│   ├── app/                 # expo-router routes (file path = URL)
│   │   ├── auth/            # email → otp / login(password) → onboarding
│   │   ├── (tabs)/          # PHARMACIST app (home/vendors/orders/payments/more)
│   │   ├── d/               # DISTRIBUTOR panel (owner/manager)
│   │   ├── field/           # FIELD SALES app
│   │   ├── delivery/        # DELIVERY app
│   │   ├── product/ cart/ order/ distributor/ invoice/ …  # pharmacist detail screens
│   │   └── dispute/ disputes.tsx
│   ├── src/
│   │   ├── api.ts           # fetch client w/ bearer auth + error parsing
│   │   ├── theme.ts         # colors / radius / spacing / formatINR
│   │   ├── components/      # Toast, confirm, ChatView, WebSidebar (desktop shell)…
│   │   └── utils/           # storage (AsyncStorage/SecureStore), routeByRole, statement(pdf)
│   ├── .env                 # EXPO_PUBLIC_BACKEND_URL (+ protected packager vars)
│   └── app.json
├── memory/PRD.md            # product requirements & change log (READ THIS)
├── memory/test_credentials.md
└── test_result.md           # testing history / agent communication
```

---

## 3. Roles & routing
Single login entry (`/auth/email`) → backend `/auth/login-method` decides OTP vs password.
`src/utils/routeByRole.ts` sends users to the right app:

| Role | Login | App | Notes |
|---|---|---|---|
| pharmacist | OTP | `/(tabs)` | marketplace buyer |
| owner | OTP | `/d` | full distributor access incl. ERP API keys |
| manager | password | `/d` | all ops EXCEPT owner-only ERP keys/settings (403) |
| field_sales | password | `/field` | own assigned leads; take orders |
| delivery | password | `/delivery` | assigned orders; photo/GPS proof; cash-OTP |

Backend permission helpers in `server.py`: `require_role`, `staff_distributor(user, allowed)`,
`get_owned_distributor`, `require_owner_distributor`. Managers resolve their distributor via
`owned_distributor_id || distributor_id`.

---

## 4. Feature map
**Pharmacist:** dashboard KPIs + AI insights, distributor catalog/search, product detail (PTR/MRP/margin/best-vendor), cart (per-distributor or all), orders w/ status tracker, payments/invoices (pay, report problem), returns, shortbook (AI reorder), bulk order, per-distributor ledger + credit line, disputes/queries, two-way chat.

**Distributor (`/d`):** dashboard (KPIs/chart/top customers), orders, stock/inventory (+ damage/expiry adjust, barcode), customers (credit limit, CN/DN, collect, ledger, blacklist), collections (record cash/UPI/cheque/NEFT payments), messages (2-way chat w/ pharmacists), team, sales CRM/leads, deliveries (auto-assign by area), query management (disputes), team/staff chat, auto bills (area/time), order settings (auto-accept, default CD), **Data Sync**, ERP API keys (owner only).

**14 client features** live in `client_features.py` — see PRD.md §"14 features".

---

## 5. ERP Data Sync (`sync_engine.py`) — important
Their billing software (**Medica Ultimate**) has **no API**; only a daily **SQL Server `.bak`** backup (3.2 GB, unparseable at runtime). So we ingest the **CSV/Excel exports** the software can produce.

- **Import IN** — `POST /api/distributor/me/sync/import` (`source=file` base64, or `source=drive` public Google-Drive link). Parser auto-detects the header row (skips title rows), **fuzzily maps columns** to Item Master / Party Master / Ledger (synonym maps `PRODUCT_MAP`/`PARTY_MAP`/`LEDGER_MAP`), stores in `dist_products`/`dist_parties`/`dist_ledger`. **De-dupe** via upsert on `(distributor_id, dedupe_key)`: products=itemcode|name+pack, parties=code|name, ledger=hash(voucher|date|party|amount). Re-uploading a whole-month backup updates, never duplicates.
- **Export OUT** — `POST /api/distributor/me/sync/export` (`mode=full|incremental`, `format=csv|xlsx`) → base64 file of app orders (one row per line item, Medica-friendly columns). Incremental = orders since `last_export_at`.
- **Settings/logs** — `GET/PATCH /sync/settings` (drive_url, auto_sync, interval_hours), `GET /sync/logs`, `GET /sync/data`, `POST /sync/clear`.
- **Auto-sync** — background asyncio loop (`auto_sync_loop`, started in `server.py` startup) re-fetches the saved Drive link per distributor interval.
- Frontend: `app/d/sync.tsx` (owner/manager only). Uses expo-document-picker + expo-file-system/legacy + expo-sharing.

> ⚠️ Distributors must **Export to Excel/CSV** from their software's Item/Party/Ledger screens. The raw `.bak` is NOT parsed.

---

## 6. Desktop web layout
`src/components/WebSidebar.tsx` → `useIsWideWeb()` (web & width ≥900) + `WebShell`.
Distributor layouts (`app/d/_layout.tsx`, `field/_layout.tsx`, `delivery/_layout.tsx`) render a persistent left sidebar (centered 1200px content) on wide web; phones/native keep bottom tabs. Pharmacist stays mobile-first.

---

## 7. Key API surface (prefix `/api`)
- **Auth:** `POST /auth/send-otp`, `/auth/verify-otp`, `/auth/login-method`, `/auth/login`, `/auth/change-password`, `/auth/onboard`, `PATCH /auth/profile`, `GET /auth/me`
- **Pharmacist:** `/dashboard`, `/products`, `/products/{id}`, `/distributors`, `/distributors/{id}`, `/cart*`, `/orders*`, `/payments*`, `/issues`, `/returns`, `/shortbook*`, `/ledger/{distributor_id}`, `/credit-notes`, `/debit-notes`, `/scan/extract`
- **Distributor:** `/distributor/me/*` (dashboard, orders, inventory, customers, collections/payments, team, leads, deliveries, api-keys, settings, disputes, staff-chat, bills, inventory adjust/barcode)
- **Field/Delivery:** `/field/*`, `/delivery/*`
- **ERP sync:** `/distributor/me/sync/*`
- **ERP external (API-key):** `/erp/v1/*` (X-API-Key header) — for distributors' own ERP integrations

Full list: grep `@api_router`, `@feature_router`, `@sync_router` in the three backend files, and see PRD.md.

---

## 8. Data model (MongoDB collections)
`users` (role, distributor linkage), `distributors`, `products` (prices[] per distributor: ptr/mrp/qty/scheme/barcode), `cart`, `orders` (items[], status, payment_method, delivery_proof, cash_otp, gross_total/discounts/est_margin, billed), `payments`, `customer_credit` (distributor_id+user_id → limit/used/blacklist), `credit_notes`, `debit_notes`, `returns`, `shortbook`, `issues`, `chat_messages`, `leads`, `otps`, `api_keys`, `disputes`, `staff_chat`, `stock_adjustments`, `bills`, and sync: `dist_products`, `dist_parties`, `dist_ledger`, `sync_settings`, `sync_logs`.

---

## 9. Env & run
**Never modify** in `.env`: `EXPO_PACKAGER_PROXY_URL`, `EXPO_PACKAGER_HOSTNAME` (frontend), `MONGO_URL` (backend), `metro.config.js`.
- Frontend calls backend via `EXPO_PUBLIC_BACKEND_URL` + `/api`.
- Backend binds `0.0.0.0:8001`; all routes prefixed `/api`.
- Run (supervisor): `sudo supervisorctl restart backend` / `restart expo`.
- Backend deps: `pip install -r backend/requirements.txt`. Frontend deps: `yarn` (add pkgs via `yarn expo install`).
- Tests: `cd backend && pytest tests/`.

---

## 10. Demo/test credentials
See `memory/test_credentials.md`. Summary:
- Pharmacist (OTP): `demo@rxtech.com` (seeded). Owner (OTP): `owner@rxtech.com` (ABC Pharma / dist-1).
- Staff (password `Pass@123`): `manager@rxtech.com`, `sales@rxtech.com`, `sales2@rxtech.com`, `delivery@rxtech.com`, `delivery2@rxtech.com`.
- Dev OTP is returned by `/auth/send-otp` (`dev_otp`) and shown in-app in preview.

---

## 11. Known limitations / mocked
- OTP delivery is **DEV/demo** (returned in API, no real SMS/email). Production needs SendGrid/Twilio.
- Payment "pay" marks invoices paid in-DB (no real gateway). Distributor records cash/UPI/cheque manually.
- Cash-collection OTP + area/time bill scheduling are **demo** (no SMS, no real cron; auto-sync loop is real in-process).
- Returns has list/status but no pharmacist "request return" form; profile editing partial.
- `server.py` is large (~4100 lines) — candidate for router/module refactor (not yet done).

---

## 12. Where to learn more
- `memory/PRD.md` — full product spec + dated change log (authoritative).
- `test_result.md` — testing history & agent notes.
