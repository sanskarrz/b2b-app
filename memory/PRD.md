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
- `/search` Full search with recent searches, quick filters, results
- `/product/[id]` Product detail – price, MRP, margin, scheme, distributor selection, find substitutes, qty controls, add to cart
- `/cart` Cart grouped by distributor with line items, bill summary, place order
- `/order/[id]` Order detail with 4-step status tracker
- `/distributor/[id]` Distributor profile, credit limit usage, product catalog
- `/returns` Returns list with status pills
- `/shortbook` AI-suggested reorders, individual or bulk add to cart

## Backend API
**Auth**: `POST /api/auth/send-otp`, `POST /api/auth/verify-otp`, `POST /api/auth/onboard`, `GET /api/auth/me`
**Dashboard**: `GET /api/dashboard`
**Catalog**: `GET /api/products`, `GET /api/products/{id}`, `GET /api/distributors`, `GET /api/distributors/{id}`
**Cart**: `GET /api/cart`, `POST /api/cart/items`, `PATCH /api/cart/items/{id}`, `DELETE /api/cart/items/{id}`, `DELETE /api/cart`
**Orders**: `POST /api/orders` (place), `GET /api/orders`, `GET /api/orders/{id}`
**Payments**: `GET /api/payments`, `POST /api/payments/{id}/pay`
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

## Known limitations / next steps
- OTP delivery is DEV mode (returned in API); needs SendGrid for production
- Payment "Pay" button currently marks invoice paid locally — needs UPI/payment gateway
- Returns flow has list + status but no "request return" form yet
- Categories/filters on home not yet drilled into
- No notifications / push yet
- Profile editing not yet wired (placeholder in /more)
