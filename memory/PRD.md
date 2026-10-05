# RX Tech – Product Requirements Document

## Overview
**RX Tech** is a B2B medicine marketplace mobile app (similar to Retalio) for pharmacists and medical shop owners to order medicines from listed distributors and pharma vendors. Built with Expo (React Native) + FastAPI + MongoDB.

Designs sourced from user's Figma "Medical Order App" page (file: Recovery-Call-Center).

## Tech stack
- **Frontend**: Expo SDK 54, expo-router (file-based), TypeScript, React Native
- **Backend**: FastAPI, Motor (MongoDB async), JWT, PyJWT
- **Database**: MongoDB (local on K8s pod)

## Authentication
- Email-based OTP login (6-digit, 10-min TTL)
- OTP returned in API response in DEV mode (no SMTP needed for preview)
- Production: plug in SendGrid (API key required from user)
- JWT bearer token (30 day TTL)
- First-time onboarding captures: name (required), phone (required), shop name, GST, address

## Screens implemented
**Auth**
- `/` Splash (auto-routes by token state)
- `/auth/email` Email entry
- `/auth/otp` 6-digit OTP verification
- `/auth/onboarding` New-user profile capture

**Main tabs (5)**
- `/(tabs)/home` Dashboard – KPIs (today's orders, payments due), AI insights (reorder suggested), deliveries today, action required (credit warning, backorder), profit opportunities
- `/(tabs)/vendors` Distributors list (search, ratings, categories, discounts)
- `/(tabs)/orders` Orders list with status tabs (all/placed/processing/shipped/delivered)
- `/(tabs)/payments` Payments list with summary (total due / overdue) and pay action
- `/(tabs)/more` Profile, operations menu (shortbook, returns, bulk order), reports, account, logout

**Detail screens**
- `/search` Full search with recent searches, quick filters, **distributor filter row** (filter products by vendor), results
- `/product/[id]` Product detail – price, MRP, margin, scheme, distributor selection, find substitutes, qty controls, add to cart
- `/cart` Cart grouped by distributor with line items, bill summary, **place per-distributor OR all-at-once**
- `/order/[id]` Order detail with 4-step status tracker
- `/distributor/[id]` Distributor profile, credit limit usage, product catalog
- `/returns` Returns list with status pills
- `/shortbook` AI-suggested reorders, individual or bulk add to cart
- `/bulk-order` **NEW** Bulk-order single product: search → pick SKU → bulk qty (with 50/100/200/500 presets) → compare distributors → one-tap add
- `/invoice/[id]` **NEW** Full invoice detail – amount, due/paid status with paid date, breakdown, share, **Report Problem** button, Pay Now
- `/report-issue` **NEW** Report a problem (invoice / order / delivery / other) with linked reference

## Backend API
**Auth**: `POST /api/auth/send-otp`, `POST /api/auth/verify-otp`, `POST /api/auth/onboard`, `GET /api/auth/me`
**Dashboard**: `GET /api/dashboard`
**Catalog**: `GET /api/products` (supports `?q=`, `?category=`, `?distributor_id=`), `GET /api/products/{id}`, `GET /api/distributors`, `GET /api/distributors/{id}`
**Cart**: `GET /api/cart`, `POST /api/cart/items`, `PATCH /api/cart/items/{id}`, `DELETE /api/cart/items/{id}`, `DELETE /api/cart`
**Orders**: `POST /api/orders` (supports `?distributor_id=` to place per-vendor), `GET /api/orders`, `GET /api/orders/{id}`
**Payments**: `GET /api/payments`, `GET /api/payments/{id}` (invoice detail), `POST /api/payments/{id}/pay` (sets `paid_at`)
**Issues**: `POST /api/issues`, `GET /api/issues`
**Returns**: `GET /api/returns`, `POST /api/returns`
**Shortbook**: `GET /api/shortbook`, `POST /api/shortbook/{id}/order`

## Seed data
- 5 Distributors (ABC Pharma, Medline, XYZ Pharma, HealthFirst, Sun Wholesale)
- 12 Products (Azithromycin, Paracetamol, Metformin, Amlodipine, Pantoprazole, Cetirizine, Atorvastatin, Omeprazole, Amoxicillin, Losartan, Diclofenac, Glimepiride)
- Per-user seed on first login: 4 sample orders, 4 payments (due/overdue/paid), 2 returns, 8 shortbook items

## Design language
- Clean B/W minimalist matching Figma
- White bg, light-gray surface (#F5F5F7)
- Black primary buttons (#0A0A0A)
- Rounded cards (12-16px)
- ₹ INR currency, Indian thousand format
- Status pills with semantic colors (placed=blue, processing=amber, shipped=indigo, delivered=green)

## Smart business enhancement
- **AI Insights & Shortbook**: Auto-detects below-min-level SKUs and suggests reorders with estimated value — drives repeat orders and protects against stockouts.
- **Credit risk warning** on home: Surfaces credit usage % per distributor to prevent rejected orders.
- **Best distributor flag** on product detail: Always highlights the lowest-PTR vendor to maximize margin per SKU.

## Distributor side (COMPLETE — connected to pharmacist side)
- **Role switch**: Pharmacist More → "Switch to Distributor mode" → `/d/home` (and back). Demo owns `dist-1` / "ABC Pharma".
- **Per-customer credit engine** (`customer_credit` collection, keyed by distributor_id+user_id): both pharmacist ("my credit with X") and distributor ("credit I gave Y") read the SAME record. Auto-updates on order, collection, credit note, return, short-delivery.
- **Distributor tabs**: Home (KPIs/chart/quick tiles/messages badge) · Orders · Stock · Customers · **Money/Collections** · More.
- **Collections** (`/d/collections`): receivables KPIs (outstanding/overdue/collected-30d/due-this-week), Open/Overdue/Due/History filters, Record Payment (full/partial, cash/upi/cheque/neft) → settles invoice + drops customer credit + reflects on pharmacist ledger.
- **Customer detail** (`/d/customer/[id]`): credit bar + Edit limit, business stats, Credit/Debit note issuance, Collect on open invoices, full ledger with running balance, Call/WhatsApp/Chat.
- **Message portal** (`/d/messages`): two-way chat threads per customer (unread counts), 1-on-1 thread; distributor replies are seen by pharmacist and vice-versa.
- Backend: 25/25 tests pass; full pharmacist regression green. All actions are real DB writes (no payment gateway — distributor records cash/UPI/cheque collection, as in real pharma distribution).


## Known limitations / next steps
- OTP delivery is DEV mode (returned in API); needs SendGrid for production
- Payment "Pay" button currently marks invoice paid locally — needs UPI/payment gateway
- Returns flow has list + status but no "request return" form yet
- Categories/filters on home not yet drilled into
- No notifications / push yet
- Profile editing not yet wired (placeholder in /more)


## Multi-role platform + 14 client features (Feb 2026)
Pivoted from a single-app role toggle to isolated role-based apps behind one login (`/auth/email` → password for staff, OTP for owner/pharmacist). `routeByRole` sends: owner/manager→`/d`, field_sales→`/field`, delivery→`/delivery`, pharmacist→`/(tabs)`.

**Roles & permissions**
- Owner: full access incl. ERP API keys (`/distributor/me/api-keys`, owner-only via `require_owner_distributor`).
- Manager: full operational access via `get_owned_distributor` fallback to `distributor_id`; ERP keys return 403; ERP section hidden in `/d/more`.
- Field Sales: own assigned leads only; can take orders. Delivery: own assigned orders + proof/OTP.

**14 features implemented (backend in `/app/backend/client_features.py` = `feature_router`; hooks in `server.py`):**
1. Cash-collection OTP (demo, in-app) — `POST /delivery/orders/{id}/cash-otp`; verified in `/deliver`.
2/5. Disputes / Query mgmt — `/disputes` (pharma), `/distributor/me/disputes` (+filters, resolve). Types: wrong_supply, return, credit, other.
3. Staff↔office chat — `/staff/chat`, `/distributor/me/staff-chat/*` (reusable `ChatView`).
4/9/10. Field order-taking — `/field/customers`, `/field/products` (margin), `POST /field/orders` (CD + extra CD + offer% 3/4/5, est_margin).
6. Blacklist — `PATCH /distributor/me/customers/{id}/blacklist`; blocks `POST /orders` (403).
7. Barcode — `auto-barcode`, `GET /products/barcode/{code}`, per-product set.
8. Area auto-assign — staff `areas`; `deliveries/auto-assign` + `leads/auto-assign`.
11. Stock adjust (damage/expiry) — `POST /distributor/me/inventory/{pid}/adjust` + `stock_adjustments` log.
12. Item detail remaining stock + delivery photos gallery — `/distributor/me/orders/{id}/detail`, `/distributor/me/delivery-photos`.
13. Auto-accept (no overdue) — `/distributor/me/settings.auto_accept_no_overdue`; hooked in `place_order` + `field/orders`.
14. Area & time auto bill generation — `POST /distributor/me/bills/generate`, `GET /distributor/me/bills`.

New collections: `disputes`, `staff_chat`, `stock_adjustments`, `bills`. New order fields: `cash_otp`, `gross_total`, `cash_discount_pct`, `extra_cd_pct`, `offer_pct`, `est_margin`, `billed`, `auto_accepted`.

**Testing:** 39/39 pytest pass (`/app/backend/tests/test_client_features.py`), frontend smoke green. Report: `/app/test_reports/iteration_7.json`.

**MOCKED:** Cash OTP is demo (returned in API / shown in-app, no SMS). Bill scheduling is a label only (no cron).

## Next steps / backlog

## ERP Data Sync (Import / Export) — Aug 2026
Distributors' billing software (Medica Ultimate) has **no API** — only a daily **SQL Server `.bak`** backup (unparseable at runtime). Instead we ingest the **CSV/Excel exports** every such software produces. Screen: `/d/sync` (owner/manager only), linked from Distributor More → "Data Sync".

**IN (their system → app):** upload Item/Party/Ledger export via **file** (expo-document-picker) or **public Google Drive link**. Backend `sync_engine.py` auto-detects the header row (skips title rows) and **fuzzily maps columns** to product/party/ledger. **De-dupes** via upsert on `(distributor_id, dedupe_key)` — products keyed on item code or name+pack, parties on code or name, ledger on hash(voucher|date|party|amount). Stored in `dist_products` / `dist_parties` / `dist_ledger`.

**OUT (app → their system):** export orders placed by pharmacies to CSV/XLSX, **Full** or **incremental (since last export)** — one row per line item with Medica-friendly columns. Downloaded (web anchor) / shared (native).

**Auto-sync:** background asyncio loop re-fetches the saved Drive link per distributor `interval_hours` (default 24). Manual "Fetch & Import" also available.

Endpoints: `POST /api/distributor/me/sync/import`, `GET /sync/data`, `POST /sync/clear`, `POST /sync/export`, `GET/PATCH /sync/settings`, `GET /sync/logs`. New collections: `dist_products`, `dist_parties`, `dist_ledger`, `sync_settings`, `sync_logs`.

**Testing:** 15/15 pytest pass (`/app/backend/tests/test_erp_sync.py`), frontend E2E green (iteration_8). **NOTE:** raw `.bak` cannot be auto-parsed — distributors must export CSV/Excel from their software.

### Older backlog

## Separate Portals + Registration + Real ERP Report — Oct 2026
**Separate login portals.** New entry screen `app/auth/choose.tsx` → **Pharmacy Login** / **Distributor Login** / **Register**. `index.tsx` and every logout now land on `/auth/choose`. The existing `auth/email → otp | login` flow is reused with a `portal` param, so there is one implementation with portal-specific branding/copy. Backend `check_portal()` + `portal` field on `/auth/login-method`, `/auth/verify-otp`, `/auth/login` enforce the split: PHARMACY_ROLES = {None, pharmacist}, DISTRIBUTOR_ROLES = {owner, manager, field_sales, delivery} → cross-portal login returns 403 "This is a pharmacy account. Please use Pharmacy Login." (and vice-versa). `login-method` with a portal also 404s unknown emails ("Please register first").

**Removed the role toggle for good.** Deleted the "Switch to Distributor mode" banner/handler from `app/(tabs)/more.tsx` AND the backend `POST /distributor/switch-role` endpoint.

**Self-registration.** `POST /api/auth/register` + `app/auth/register.tsx` with a Pharmacy/Distributor toggle. Goes **live instantly**. Only name, email, phone and shop/firm name are required; GST, drug licence, address, city, area optional. Distributor registration also creates a `distributors` document and sets the user `role=owner` + `owned_distributor_id`, so they appear in the marketplace and the `/d` panel works immediately. An OTP is issued by the register call so the user goes straight to the OTP screen.

**Android navigation-bar overlap fixed.** All four tab bars (`(tabs)`, `d`, `field`, `delivery`) now add `useSafeAreaInsets().bottom` to height + paddingBottom, and the sticky bottom bars in `search.tsx`, `product/[id].tsx`, `cart.tsx` add the bottom inset too.

**Real distributor report loads.** Studied the user's actual **"N N ENTERPRISE" Stock Detail** export (xlsx, 3 title rows, header on row 4, 2,369 rows): `PCode | Product Name | Packing | BSTK | MRP | SSTK | PTR | PTS | GP%`. Added synonyms so nothing is lost — `bstk→stock`, `sstk→stock_strip`, new `pts` and `gp_pct` fields. Added `_is_junk()` to drop report footers/total rows (the "***Computer Generated Report***" line was being imported as a product). Switched `_upsert` to **`bulk_write`** in 1,000-row chunks and added a unique index on `(distributor_id, dedupe_key)` via `ensure_sync_indexes()` at startup. Result: **2,365 products imported in 0.4s**; re-import = 0 inserted / 2,367 updated (perfect dedupe).

**Data browser.** New `GET /api/distributor/me/sync/browse?type=&q=&skip=&limit=` (paginated + searchable) and screen `app/d/sync-data.tsx` ("My System Data") with Items/Parties/Ledger tabs, search and infinite scroll. Reachable from the Data Sync stat cards (now tappable), the web sidebar, and Distributor More.

**Post-test fixes (iteration_10 follow-ups).** (a) `sync/browse` now sorts on `[(sort_key,1),("dedupe_key",1)]` — without a tiebreaker, duplicate product names shuffled across pages; verified paging all 2,365 rows yields 2,365 unique ids. (b) The `Field` component in `auth/register.tsx` was declared **inside** `Register`, so it was a new component type each render and the TextInput remounted on every keystroke (focus loss on native). Hoisted it to module scope with explicit `value`/`onChangeText` props; verified by typing "Ramesh Kumar" in one go.

**Testing:** iteration_10 — 20/20 backend pytest (`tests/test_portal_register.py`) + frontend E2E all pass. Sample real report kept at `tests/sample_nn_stock_report.xlsx`.

## Build-gap hardening — Oct 2026
User reported "neither registering nor importing from excel" **on their new Android/iOS build**. Verified the preview is correct end-to-end (UI registration → OTP → `/d/home`; Excel import 2,365 products), so the cause is their **deployed backend/build predating these changes**: `/auth/register` is a brand-new endpoint (needs a backend redeploy) and `expo-document-picker` is a brand-new native module (needs a fresh build). Correct order: **Publish → Deploy → then generate builds.**

Two hardening fixes so it works even on an older build:
1. **Google Sheets links now import.** `_download_drive()` tries `docs.google.com/spreadsheets/d/<id>/export?format=xlsx` for `/spreadsheets/` URLs and `drive.usercontent.../download` for file URLs, falling back to the other, and returns a clear 400 (never a 500) for private/invalid links. The user's real Sheets link imports 2,365 products in ~1.2s — **this path needs no native file picker**, so it works in any build.
2. **File-picker fallback.** `app/d/sync.tsx` `importFile()` guards `await import("expo-document-picker")` and, if unavailable, tells the user to use the Drive link option or generate a fresh build instead of failing silently.

**Testing:** iteration_11 — 10/10 backend pytest (`tests/test_hardening_fixes.py`) + registration and Data Sync frontend regressions all pass.

## Production 520 fix — removed pandas/numpy — Oct 2026
User's new APK showed **"Registration failed — Request failed (520)"**. The screenshot showed the *new* registration screen, so the build WAS current — my earlier "redeploy + rebuild" diagnosis was **wrong** (it cost the user a deploy/build cycle). **HTTP 520 is a Cloudflare origin error**: the app reached the production backend but the origin failed. Preview worked with identical code, so the difference is production resources.

Root cause (most probable): `sync_engine.py` imported **pandas** (which pulls numpy) at module import time, and `server.py` imports `sync_engine`, so every worker paid ~200 MB+ RSS at startup — enough to be OOM-killed on a small production pod, which surfaces as a 520. Secondary risk: `startup()` **awaited** `ensure_sync_indexes()` which created a **unique** index — that fails/stalls on collections that already contain duplicates, blocking the app from ever serving.

Fixes:
1. **Removed pandas/numpy entirely.** Excel reading now uses `openpyxl` (`read_only=True, data_only=True`), CSV reading uses stdlib `csv`, XLSX writing uses `xlsxwriter` directly (`constant_memory=True`), CSV writing uses `csv.DictWriter`. Dropped `pandas`, `numpy`, `tzdata` from `requirements.txt`. Legacy `.xls` now returns a clear 400 telling the user to save as .xlsx/CSV (openpyxl can't read BIFF).
2. **Index creation is non-blocking and non-unique.** `ensure_sync_indexes()` creates a plain (non-unique) index — dedupe is enforced by the upsert filter, not the index — and `startup()` now fires it in a background task so it can never stop the app from serving.

**Verified:** `server` imports successfully with pandas/numpy **blocked via a meta_path blocker** (simulating the new prod image); backend **RSS dropped to 26 MB**; xlsx import 2,365 products in 1.2s, CSV import, Google-Sheets-link import, CSV export (24 rows) and XLSX export (valid workbook, 25×18) all pass; browse/search works.

⚠️ Still outstanding: OTP is demo-only (shown in-app, never emailed) — must be replaced with a real email provider before real users onboard.

## Fixes — Aug 2026
- **Sticky "View Cart" bar on `/search`** (`app/search.tsx`): after adding a medicine from search results, a bottom bar shows item count + total with a **View Cart** button → `/cart`, so users can check out without navigating back. Hidden when cart is empty; list bottom padding bumps to 110 so results aren't covered.
- **BUG: Data Sync export wouldn't download on web** (`app/d/sync.tsx`). Root cause: the code built a `data:` URI and called `.click()` on an anchor that was **never appended to the DOM** (blocked by Firefox/Safari; large base64 also truncates in data URIs). Fixed with **Blob + `URL.createObjectURL`** and an anchor appended to `document.body`, then revoked. Native path unchanged (FileSystem + expo-sharing, now with UTI + graceful fallback). Verified via real browser `download` events (iteration_9): CSV 3654 B, XLSX 7720 B.
  - Note: "New · Excel/CSV" (incremental) correctly returns 400 "No new orders to export since your last export" when nothing is new — expected, not a bug.

## Desktop Web (Distributor Panel) — Aug 2026
The Expo app already runs on web (React Native Web). Made the **distributor-side apps** (`/d` owner/manager, `/field`, `/delivery`) responsive: on web ≥900px a persistent **left sidebar** (`src/components/WebSidebar.tsx` → `WebShell` + `useIsWideWeb`) replaces the bottom tab bar, content is centered at max-width 1200px. Phone/native keep bottom tabs unchanged. Pharmacist stays mobile-first (unchanged). Sidebar mirrors all features (Dashboard/Orders/Stock/Customers/Collections + Operations: Team, CRM, Deliveries, Queries, Team Chat, Auto Bills, Data Sync, Order Settings + Account/ERP + Sign out). Verified via web login (owner) — dashboard + sub-route navigation keep the sidebar persistent. Deploy via Publish; custom domain configured post-publish.
- Real SMS for cash OTP + notifications (needs Twilio or similar API key).
- SendGrid for OTP/email delivery (production).
- Payment gateway (Razorpay/Stripe UPI) for in-app collections.
- Real cron for scheduled area-wise bill generation.
- Consider refactoring `server.py` (4100+ lines) into routers/models modules.
