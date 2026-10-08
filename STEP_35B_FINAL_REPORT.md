# STEP 35B Final Report

## Summary

Successfully connected the website to the live monthly Stripe checkout flow. All old "Coming Soon" placeholder UI has been replaced with a real, functional Stripe Checkout integration.

---

## Commit

| Field | Value |
|-------|-------|
| Commit hash | `42f8688` |
| Commit message | `feat: connect website to live monthly stripe checkout` |
| Push result | `master -> master` (success) |
| Branch | `master` |

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `website/src/config/pricing.ts` | Modified | `billingModel: "one-time"` → `"subscription"`, `billingPeriod: "one-time"` → `"per month"`, removed `stripePriceId: null`, CTAs → "Subscribe Basic/Standard/Pro" |
| `website/src/config/payment.ts` | Modified | `isLive: true`, `STRIPE_MODE: "test"`, added `apiBaseUrl` getter using `NEXT_PUBLIC_API_BASE_URL`, updated `checkoutEndpoint` to use backend URL |
| `website/src/app/checkout/CheckoutForm.tsx` | **Created** | New `"use client"` component: gets Supabase user, sends `{ planId, email, userId }` to backend, redirects to Stripe Checkout URL, loading/error states, duplicate-click prevention |
| `website/src/app/checkout/page.tsx` | Rewritten | Server Component for plan lookup + renders `<CheckoutForm>`. Removed amber "Coming Soon" warning, removed disabled button |
| `website/src/app/checkout/success/page.tsx` | Rewritten | Removed hardcoded `{true ?` conditions. Shows "Subscription Confirmed" with clear messaging about license provisioning |
| `website/src/app/pricing/page.tsx` | Modified | Hero: "Monthly subscription. Cancel anytime." FAQ: recurring fees, upgrade, payment methods — all updated to reflect monthly subscription model |
| `website/.env.example` | Modified | Added `NEXT_PUBLIC_API_BASE_URL` (gitignored, local reference only) |

---

## Test Results

### Website

| Test | Result |
|------|--------|
| `npm run lint` (ESLint) | **PASS** — 0 errors, 0 warnings |
| `npm run build` (Next.js 16.3.5 Turbopack) | **PASS** — TypeScript OK, all 18 routes built |

### Backend (no changes made)

| Test | Result |
|------|--------|
| `test/payment.test.js` (15 tests) | **PASS** — 15/15 |
| `test/step26-stripe-payment.test.js` (25 tests) | **PASS** — 25/25 |
| `test/step17-security.test.js` (44 tests) | **PASS** — 44/44 |
| Credential audit (no secrets in renderer/client) | **PASS** |

---

## Backend Changes

**None required.** The backend (`server/routes/payment.js`) was already fully compatible:
- `POST /api/payment/create-checkout-session` accepts `{ planId, email?, userId? }`
- Returns `{ success: true, sessionId, url }`
- Uses `mode: 'subscription'`
- Server-authoritative Price ID resolution
- CORS configured via `CORS_ALLOWED_ORIGINS`

---

## Environment Variables Required

### Vercel (must set in project settings)

| Variable | Value | Status |
|----------|-------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Already set (from STEP 34A fix) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | Already set (from STEP 34A fix) |
| `NEXT_PUBLIC_API_BASE_URL` | `https://reel-cutter.onrender.com` | **NEW — must set** |

### Render (verify existing)

| Variable | Value | Status |
|----------|-------|--------|
| `CORS_ALLOWED_ORIGINS` | Must include `https://reel-cutter-nine.vercel.app` | **Verify** |
| `STRIPE_SECRET_KEY` | `sk_test_...` | Already set |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | Already set |
| `STRIPE_PRICE_BASIC` | `price_1UHPf5KptMynv9VjnG46fk0G` | Already set |
| `STRIPE_PRICE_STANDARD` | `price_1UHPtdKptMynv9Vj0Aed1d13` | Already set |
| `STRIPE_PRICE_PRO` | `price_1UHPtyKptMynv9VjTznOudBb` | Already set |

---

## Architecture

```
Website (Vercel)  ──POST /api/payment/create-checkout-session──▶  Backend (Render)
  reel-cutter-nine.vercel.app                                    reel-cutter.onrender.com
                                                                       │
                                                                       ▼
                                                                Stripe Checkout (TEST)
                                                                       │
                                                          ┌────────────┴────────────┐
                                                          ▼                         ▼
                                                   /checkout/success          /checkout/cancel
                                                   (Vercel website)           (Vercel website)
```

---

## Security Verification

| Check | Status |
|-------|--------|
| No Stripe secret keys in client code | **VERIFIED** |
| No Supabase service-role keys in client code | **VERIFIED** |
| Price ID resolution server-side only | **VERIFIED** |
| userId obtained from Supabase client session | **VERIFIED** |
| CORS enforced on backend | **VERIFIED** |
| Input validation on backend | **VERIFIED** |
| Rate limiting on backend | **VERIFIED** |
| Credential audit test | **PASS** |

---

## Git Diff Summary

```
website/src/app/checkout/CheckoutForm.tsx  | 133 ++++++++++++++++++++++++++++
website/src/app/checkout/page.tsx          | 180 ++++++++++------------------
website/src/app/checkout/success/page.tsx  | 125 ++++++++-------------
website/src/app/pricing/page.tsx           |  16 +--
website/src/config/payment.ts             |  76 ++++++-------
website/src/config/pricing.ts             |  25 ++---
6 files changed, 307 insertions(+), 263 deletions(-)
```

---

## Post-Deployment Verification Checklist

After Vercel redeploys from the pushed commit:

1. [ ] Set `NEXT_PUBLIC_API_BASE_URL=https://reel-cutter.onrender.com` in Vercel env vars
2. [ ] Verify `CORS_ALLOWED_ORIGINS` includes `https://reel-cutter-nine.vercel.app` on Render
3. [ ] Visit `/pricing` — should show "$10/month", "$20/month", "$30/month"
4. [ ] Click a plan → `/checkout?plan=basic` — active form, no "Coming Soon"
5. [ ] Submit checkout → redirects to Stripe Checkout (TEST mode)
6. [ ] Complete payment in Stripe test mode → redirected to `/checkout/success`
7. [ ] Cancel in Stripe → redirected to `/checkout/cancel`
8. [ ] Check browser console — no CORS errors
9. [ ] Verify no `sk_test_` or `whsec_` strings in browser source/view-source
