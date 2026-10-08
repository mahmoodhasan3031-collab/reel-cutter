# STEP 20A Final Report

## Summary

Built the complete customer-facing manual payment UI in `website/`: a `/payment/manual` submission page (plan selection, payment-method instructions, proof upload via STEP 18, submit via STEP 17) and a `/payment/status/[id]` status page (pending/approved/rejected, rejection reason, license-delivery messaging). All pricing/payment config is reused from the existing centralized configs; payment destinations come from `NEXT_PUBLIC_` env vars. No Stripe, admin dashboard, production Supabase, or HWID changes were made. STOP — no STEP 20B.

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `website/src/config/manualPayment.ts` | **Created** | Centralized manual payment config: 5 methods (bkash/nagad/rocket/bank/binance), env-based destinations, instructions, suggested BDT amounts (USDT reuses `pricing` plan price), endpoints (`/api/upload/proof`, `/api/manual-payment/submit`, `/api/manual-payment/status/:id`), proof constraints (JPEG/PNG/WEBP, 5MB) |
| `website/src/config/manualPayment.js` | **Created** | CommonJS twin for Node tests (mirrors `.ts`, kept in sync) |
| `website/src/app/payment/manual/page.tsx` | **Created** | Server page: noindex, `?plan=` validation via `isValidPlanId`, manual-verification notice ("license issued only after verification"), 7-step flow, renders form |
| `website/src/app/payment/manual/ManualPaymentForm.tsx` | **Created** | Client form: plan select from `PLANS`, method selector, destination + instructions panel, amount (suggested prefill, editable, backend authoritative), name/email/whatsapp/txn/sender validation, proof upload (raw binary to STEP 18, stores `proof.path` → `proof_url`), submit to STEP 17 with optional Bearer token, `DUPLICATE_TRANSACTION`/`RATE_LIMITED`/network error mapping, success screen with payment ID + status link |
| `website/src/app/payment/status/[id]/page.tsx` | **Created** | Server page: noindex, decodes id, renders client |
| `website/src/app/payment/status/[id]/PaymentStatusClient.tsx` | **Created** | Status fetch (Bearer only when session exists → anonymous minimal response safe), badges for pending/approved/rejected, conditional fields (method/amount/txn/rejection_reason/updated_at), approved = "license key issued and sent to your email", rejected = reason when returned, 404/429/network handling, refresh |
| `website/src/app/pricing/page.tsx` | Modified | Each plan card links to `/payment/manual?plan=<id>`; payment-methods FAQ now mentions bKash/Nagad/Rocket/bank/Binance with manual-payment link |
| `website/.env.example` | Modified | Documented `NEXT_PUBLIC_BKASH_NUMBER`, `NEXT_PUBLIC_NAGAD_NUMBER`, `NEXT_PUBLIC_ROCKET_NUMBER`, `NEXT_PUBLIC_BANK_ACCOUNT`, `NEXT_PUBLIC_BINANCE_PAY_ID` (gitignored, local reference only) |
| `test/step20a-manual-payment-ui.test.js` | **Created** | 53 tests across sections A–I (config, page, form/validation, proof upload, submission, status page, pricing integration, security scan, no-touch invariants) |
| `test/runAllTests.js` | Modified | Registered `step20a-manual-payment-ui.test.js` |

---

## Test Results

### STEP 20A (new)

| Test | Result |
|------|--------|
| `node test/step20a-manual-payment-ui.test.js` (53 tests) | **PASS** — 53/53 |

### Website

| Test | Result |
|------|--------|
| `npm run lint` (ESLint) | **PASS** — 0 errors, 0 warnings |
| `npx tsc --noEmit` | **PASS** — no TypeScript errors |
| `npm run build` (Next.js 16.3.5 Turbopack) | **PASS** — 19 routes; `ƒ /payment/manual` and `ƒ /payment/status/[id]` present |
| Production bundle secret scan (163 files: `service_role`, `ADMIN_PASSWORD`, `ADMIN_SESSION`, `sk_live_`, `whsec_`, `STRIPE_SECRET`) | **PASS** — clean |

### Full regression (`npm test`)

| Suite | Result |
|-------|--------|
| All registered suites (license → step32e, incl. step17/18/19/20a/23/24/25/26) | **PASS** — all completed successfully |
| STEP 17 manual payment API (62 tests) | **PASS** — 62/62 |
| STEP 18 security (46 tests) | **PASS** — 46/46 |
| STEP 19 admin auth + payment review (71 tests) | **PASS** — 71/71 |
| STEP 23 pricing (38 tests) | **PASS** — 38/38 |
| STEP 24 auth (32 tests) | **PASS** — 32/32 |

Known pre-existing failure (not masked, not in registry): `test/step28-production-readiness.test.js` I1 stale assertion — unchanged by this step.

---

## Backend Changes

**None.** Frontend integrates existing endpoints only:

- `POST /api/upload/proof` (STEP 18) — raw binary, returns `{ proof: { path, ... } }`
- `POST /api/manual-payment/submit` (STEP 17) — status forced `pending`, rate limited 5/min, `DUPLICATE_TRANSACTION` → 409
- `GET /api/manual-payment/status/:id` (STEP 17) — authenticated full safe response / anonymous minimal response, rate limited 20/min

---

## Environment Variables

### Vercel (new — set for destinations to display; flow works with fallback text if unset)

| Variable | Purpose | Status |
|----------|---------|--------|
| `NEXT_PUBLIC_BKASH_NUMBER` | bKash destination | **NEW — set in production** |
| `NEXT_PUBLIC_NAGAD_NUMBER` | Nagad destination | **NEW — set in production** |
| `NEXT_PUBLIC_ROCKET_NUMBER` | Rocket destination | **NEW — set in production** |
| `NEXT_PUBLIC_BANK_ACCOUNT` | Bank details | **NEW — set in production** |
| `NEXT_PUBLIC_BINANCE_PAY_ID` | Binance Pay ID | **NEW — set in production** |
| `NEXT_PUBLIC_API_BASE_URL` | Backend origin | Already set (STEP 35B) |

### Render

No changes required.

---

## Architecture

```
Pricing page ──?plan=──▶ /payment/manual (ManualPaymentForm)
                              │
                              ├──POST /api/upload/proof──────▶ STEP 18 (raw image → proof.path)
                              │                                      │
                              └──POST /api/manual-payment/submit────▶ STEP 17 (pending row)
                                         │ (Bearer if signed in)
                                         ▼
                              success screen → /payment/status/[id]
                                                      │
                                                      └──GET /api/manual-payment/status/:id
                                                                (full if Bearer matches email,
                                                                 minimal if anonymous)
```

---

## Security Verification

| Check | Status |
|-------|--------|
| No service-role keys in `website/src` (full tree scan) | **VERIFIED** |
| No admin credentials / storage credentials / Stripe secrets in STEP 20A files | **VERIFIED** |
| Destinations only via `NEXT_PUBLIC_` env (no hardcoded numbers) | **VERIFIED** |
| No free-text `proof_url` field — reference only from STEP 18 upload response | **VERIFIED** |
| Submit body excludes `status`/`rejection_reason`/`reviewed_by`/`license_key` | **VERIFIED** |
| No admin API calls, no Stripe calls, no HWID/activation logic in flow | **VERIFIED** |
| No `/admin` route added to website | **VERIFIED** |
| Stripe checkout flow files untouched | **VERIFIED** |
| STEP 17/18 backend routes untouched | **VERIFIED** |
| Production bundle scan | **PASS** — clean |
| Auth optional: anonymous submit/status supported; Bearer attached only when session exists | **VERIFIED** |

---

## Post-Deployment Verification Checklist

1. [ ] Set the five `NEXT_PUBLIC_*` payment destination vars in Vercel and redeploy
2. [ ] Visit `/pricing` — each card shows "Pay manually (bKash, Nagad, Bank…)"
3. [ ] Click it → `/payment/manual?plan=basic` — notice, steps, bKash destination + instructions visible
4. [ ] Switch method to Binance Pay — currency label becomes USDT, destination switches
5. [ ] Upload a PNG/JPEG/WEBP ≤5MB → "Uploaded: …" state; submit blocked while uploading
6. [ ] Submit with a test transaction ID → success screen with Payment ID
7. [ ] Open `/payment/status/<id>` — pending badge, submitted date, refresh works
8. [ ] Re-submit same transaction ID → friendly duplicate message
9. [ ] Signed-in user: email prefilled, full status fields shown; anonymous: minimal status fields only
10. [ ] After admin approval (STEP 19) → status shows approved + "license key … sent to your email"
11. [ ] Rejected payment → reason displayed when API returns it
12. [ ] Verify no secrets in browser view-source on both pages

---

## STOP

STEP 20A complete. No STEP 20B started. No commits made (not requested).
