# STEP 35A — Website Checkout Audit

## 1. Current Checkout Flow (What's Live)

User journey today:

1. User visits `/pricing` → sees 3 plan cards with `$10/$20/$30` and `billingPeriod: "one-time"`
2. User clicks "Get Basic" → navigates to `/checkout?plan=basic`
3. Checkout page (`website/src/app/checkout/page.tsx`) is a **Server Component** with hardcoded placeholder UI
4. Displays plan details, an email input, and an **amber warning box**: "Secure Checkout Coming Soon"
5. CTA button is **disabled**: "Checkout Not Yet Available"
6. **No JavaScript, no fetch calls, no API integration exists anywhere in the website**

**Bottom line:** The checkout page was designed as a static mockup placeholder. It was never wired to any payment API.

---

## 2. Root Cause of Old UI

The old UI persists because of **multiple hardcoded "Coming Soon" / "one-time" / disabled guards** spread across 4 files:

| # | File | Line(s) | What's hardcoded |
|---|------|---------|-----------------|
| 1 | `website/src/config/pricing.ts` | L25, L100-101, L122-123, L143-144 | `billingModel: "one-time"`, `billingPeriod: "one-time"` for all 3 plans |
| 2 | `website/src/config/pricing.ts` | L115, L136, L161 | `stripePriceId: null` for all 3 plans |
| 3 | `website/src/config/payment.ts` | L36 | `isLive: false` |
| 4 | `website/src/app/checkout/page.tsx` | L114-139 | Amber warning: "Secure Checkout Coming Soon" |
| 5 | `website/src/app/checkout/page.tsx` | L142-153 | Disabled button: "Checkout Not Yet Available" |
| 6 | `website/src/app/pricing/page.tsx` | L25 | "One-time payment. No subscriptions." |
| 7 | `website/src/app/pricing/page.tsx` | L284-286, L309-314 | FAQ: "No recurring fees" / "Online payment is coming soon" |

**There is no `website/src/lib/` directory containing any checkout, payment, or Stripe client code.** The only lib files are `supabase/server.ts`, `supabase/client.ts`, and `supabase/middleware.ts`.

**There are no API routes in the website** (`website/src/app/api/` does not exist). The backend is a separate Express server on Render.

---

## 3. Exact Files/Functions Involved

### Files to modify (minimum viable)

| File | Change Required |
|------|----------------|
| `website/src/app/checkout/page.tsx` | **Complete rewrite**: Convert from static Server Component placeholder to interactive checkout with client-side form, API call to backend, redirect to Stripe |
| `website/src/config/pricing.ts` | Change `billingPeriod` → `"per month"`, `billingModel` → `"subscription"` for all 3 plans |
| `website/src/config/payment.ts` | Set `isLive: true`, update `checkoutEndpoint` to backend URL |
| `website/src/app/pricing/page.tsx` | Update hero text, FAQ answers to reflect monthly subscription |

### Files to verify / potentially modify

| File | Reason |
|------|--------|
| `website/src/app/checkout/success/page.tsx` | Currently has hardcoded `{true ?` conditions (line 26, 28) — needs real session verification logic |
| `website/src/app/checkout/cancel/page.tsx` | Already functional — just displays cancellation message. No changes needed. |
| `website/.env.example` | Add `NEXT_PUBLIC_SERVER_URL` |

### Backend file (already correct, no changes needed)

| File | Status |
|------|--------|
| `server/routes/payment.js` | Ready — `POST /create-checkout-session` accepts `{ planId, email?, userId? }`, returns `{ success, sessionId, url }` |
| `server/config.js` | Ready — Stripe Price IDs configured via env vars |
| `server/index.js` | Ready — CORS configured via `CORS_ALLOWED_ORIGINS` env var |

---

## 4. Backend API Compatibility

### Backend endpoint (already live on Render)

```
POST https://reel-cutter.onrender.com/api/payment/create-checkout-session
```

**Request:**
```json
{
  "planId": "basic" | "standard" | "pro",
  "email": "user@example.com",    // optional
  "userId": "uuid-format"         // optional — Supabase auth user ID
}
```

**Response (success):**
```json
{
  "success": true,
  "sessionId": "cs_test_...",
  "url": "https://checkout.stripe.com/..."
}
```

**Response (error):**
```json
{
  "success": false,
  "error": { "code": "PLAN_NOT_CONFIGURED", "message": "..." }
}
```

### Architecture

```
Website (Vercel)  ──POST /api/payment/create-checkout-session──▶  Backend (Render)
  reel-cutter-nine.vercel.app                                    reel-cutter.onrender.com
                                                                       │
                                                                       ▼
                                                                Stripe Checkout Session
                                                                       │
                                                                       ▼
                                                                User redirected to Stripe
                                                                       │
                                                          ┌────────────┴────────────┐
                                                          ▼                         ▼
                                                   /checkout/success          /checkout/cancel
                                                   (Vercel website)           (Vercel website)
```

### CORS

Backend CORS middleware (server/index.js:12-31):
- Reads `CORS_ALLOWED_ORIGINS` env var (comma-separated)
- Validates `req.headers.origin` against allowed list
- Returns appropriate `Access-Control-Allow-Origin` header
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type`

**Required:** `CORS_ALLOWED_ORIGINS` on Render must include `https://reel-cutter-nine.vercel.app`

### Backend already handles

- Server-authoritative Price ID resolution (client sends planId, server maps to Stripe Price ID)
- Input validation (planId, email format, userId UUID format)
- Rate limiting (activateLimiter, statusLimiter)
- Security headers (X-Content-Type-Options, X-Frame-Options, X-XSS-Protection)
- Success/cancel URL construction from `CORS_ALLOWED_ORIGINS` (first origin + `/checkout/success` or `/checkout/cancel`)
- Subscription mode (`mode: 'subscription'`)
- Metadata propagation for webhook processing

---

## 5. Required Website Changes

### 5A. `website/src/config/pricing.ts`

Change all 3 plans:
```
billingPeriod: "one-time"  →  billingPeriod: "per month"
billingModel: "one-time"   →  billingModel: "subscription"
stripePriceId: null        →  remove or keep null (server resolves price IDs)
```

### 5B. `website/src/app/checkout/page.tsx` — Full Rewrite

Convert from Server Component placeholder to a client-interactive checkout:

**Required flow:**
1. Page loads with plan details from URL search params (existing Server Component logic is fine for plan lookup)
2. Email input field (existing)
3. **Remove** amber "Coming Soon" warning
4. **Remove** disabled button
5. **Add** a `"use client"` child component or convert to client component that:
   - On form submit, calls `POST {NEXT_PUBLIC_SERVER_URL}/api/payment/create-checkout-session`
   - Sends `{ planId, email, userId }` (userId from Supabase client session)
   - On success, redirects browser to `response.url` (Stripe Checkout URL)
   - On error, displays error message
   - Shows loading state during API call

**userId source:** From Supabase client-side session:
```ts
import { createClient } from "@/lib/supabase/client";
const supabase = createClient();
const { data: { user } } = await supabase.auth.getUser();
const userId = user?.id;
```

**Important:** The checkout page is currently a Server Component. It should be restructured to either:
- (Option A) Keep Server Component for plan lookup + render a `"use client"` checkout form component
- (Option B) Convert entire page to client component

**Option A is recommended** — plan lookup stays server-side, checkout form is a separate client component.

### 5C. `website/src/config/payment.ts`

```ts
isLive: false  →  isLive: true
checkoutEndpoint: "/api/checkout"  →  checkoutEndpoint: process.env.NEXT_PUBLIC_SERVER_URL + "/api/payment"
```

Or better: the checkout page should directly use `NEXT_PUBLIC_SERVER_URL` for the API call.

### 5D. `website/src/app/pricing/page.tsx`

Update copy:
- L8: "Simple one-time pricing with no subscriptions" → "Simple monthly subscription pricing"
- L25: "One-time payment. No subscriptions. No hidden fees." → "Monthly subscription. Cancel anytime. No hidden fees."
- L60: `{plan.billingPeriod}` — will now show "per month" automatically
- L284-286: FAQ "No recurring fees" → update to reflect subscription model
- L309-314: FAQ "Online payment is coming soon" → "Online payment is now available" or remove

### 5E. `website/src/app/checkout/success/page.tsx`

Currently has hardcoded conditions (`{true ?` on lines 26/28). Should be enhanced to:
- Read `sessionId` from URL params (already does this)
- Optionally call backend `GET /api/payment/status?sessionId=...` to verify payment
- Display plan name, amount paid, etc. from session data

### 5F. `website/.env.example`

Add:
```
NEXT_PUBLIC_SERVER_URL=https://reel-cutter.onrender.com
```

---

## 6. Required Environment Variables

### Vercel (website deployment)

| Variable | Value | Purpose |
|----------|-------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Auth — already needed |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | Auth — already needed |
| `NEXT_PUBLIC_SERVER_URL` | `https://reel-cutter.onrender.com` | Backend API base URL — **NEW** |

### Render (backend deployment)

| Variable | Value | Purpose |
|----------|-------|---------|
| `CORS_ALLOWED_ORIGINS` | `https://reel-cutter-nine.vercel.app` | Allow Vercel website to call API — **MUST VERIFY** |
| `STRIPE_SECRET_KEY` | `sk_test_...` | Stripe API — already set |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | Webhook verification — already set |
| `STRIPE_PRICE_BASIC` | `price_1UHPf5KptMynv9VjnG46fk0G` | Monthly price — already set |
| `STRIPE_PRICE_STANDARD` | `price_1UHPtdKptMynv9Vj0Aed1d13` | Monthly price — already set |
| `STRIPE_PRICE_PRO` | `price_1UHPtyKptMynv9VjTznOudBb` | Monthly price — already set |

---

## 7. Required Vercel Configuration

| Setting | Value |
|---------|-------|
| Root Directory | `website` |
| Framework | Next.js |
| Build Command | `npm run build` |
| Output Directory | `.next` |
| Branch | `master` |

**No `vercel.json` is currently present** — none needed unless custom rewrites/redirects are desired.

**Vercel project environment variables** must include all 3 variables listed in Section 6 above.

---

## 8. Security Considerations

| Concern | Status |
|---------|--------|
| Price ID trust | **SAFE** — Server resolves planId → priceId. Client never sends price IDs. |
| userId trust | **SAFE** — Website should obtain userId from Supabase client session (not user-input). Backend validates UUID format. |
| CORS | **MUST VERIFY** — Backend must have `CORS_ALLOWED_ORIGINS` including `https://reel-cutter-nine.vercel.app`. No wildcards. |
| Stripe keys exposure | **SAFE** — `STRIPE_SECRET_KEY` is only on Render (server-side). Never exposed to Vercel or browser. |
| Webhook signing | **SAFE** — `STRIPE_WEBHOOK_SECRET` is only on Render. |
| Input validation | **READY** — Backend validates planId, email format, userId UUID format, rate-limits requests. |
| Success/cancel URLs | **SAFE** — Server builds URLs from `CORS_ALLOWED_ORIGINS`. No client-trusted URL construction. |
| Session tokens | **SAFE** — Supabase access tokens used for license dashboard API. Checkout does not require auth (email-based). |
| HTTPS | **SAFE** — Both Vercel and Render serve over HTTPS. |

---

## 9. Exact Implementation Plan for STEP 35B

### Phase 1: Config Updates (no behavioral change)

1. **Edit `website/src/config/pricing.ts`**
   - Change `billingPeriod: "one-time"` → `"per month"` for all 3 plans
   - Change `billingModel: "one-time"` → `"subscription"` for all 3 plans
   - Update the `PricingPlan` interface type: `billingModel: "one-time"` → `billingModel: "subscription"`

2. **Edit `website/src/config/payment.ts`**
   - Change `isLive: false` → `isLive: true`
   - Update `checkoutEndpoint` to point to backend

3. **Edit `website/.env.example`**
   - Add `NEXT_PUBLIC_SERVER_URL=https://reel-cutter.onrender.com`

### Phase 2: Pricing Page Updates (copy changes)

4. **Edit `website/src/app/pricing/page.tsx`**
   - Update hero subtitle (L25): "One-time payment..." → "Monthly subscription..."
   - Update FAQ "No recurring fees" (L284-286): Reflect subscription model
   - Update FAQ "Online payment is coming soon" (L309-314): Payment is now live

### Phase 3: Checkout Page Rewrite (core change)

5. **Create `website/src/components/CheckoutForm.tsx`** (new `"use client"` component)
   - Props: `{ planId: string; planName: string; priceDisplay: string; billingPeriod: string; features: PlanFeature[] }`
   - State: `email`, `loading`, `error`
   - On submit:
     - Get Supabase user via `createClient().auth.getUser()`
     - `POST {NEXT_PUBLIC_SERVER_URL}/api/payment/create-checkout-session` with `{ planId, email, userId }`
     - On success: `window.location.href = response.url` (redirect to Stripe)
     - On error: display error message
   - Renders: plan summary, email input, submit button with loading state

6. **Rewrite `website/src/app/checkout/page.tsx`**
   - Keep Server Component for plan lookup (`getPlanById`, `isValidPlanId`)
   - Render `<CheckoutForm>` with plan data
   - Remove all "Coming Soon" / disabled button / amber warning
   - Remove email field from page (move to CheckoutForm component)

### Phase 4: Success Page Enhancement (optional but recommended)

7. **Edit `website/src/app/checkout/success/page.tsx`**
   - Remove hardcoded `{true ?` conditions
   - Call backend `GET /api/payment/status?sessionId=...` server-side or client-side
   - Display actual payment status, plan name, amount

### Phase 5: Verification

8. **Build check**: `npm run build` in `website/` — no errors
9. **Lint check**: `npm run lint` in `website/` — no errors
10. **Push to master** — triggers Vercel deployment
11. **Verify env vars** on Vercel: `NEXT_PUBLIC_SERVER_URL` is set
12. **Verify env vars** on Render: `CORS_ALLOWED_ORIGINS` includes `https://reel-cutter-nine.vercel.app`
13. **Test checkout flow**: `/pricing` → click plan → `/checkout?plan=...` → submit → redirects to Stripe → success/cancel pages work

---

## 10. Test Plan

### Pre-deployment Tests (local)

| # | Test | Expected |
|---|------|----------|
| 1 | `npm run build` in `website/` | Build succeeds with no errors |
| 2 | `npm run lint` in `website/` | No lint errors |
| 3 | Visit `/pricing` locally | Shows "per month" billing, subscription copy |
| 4 | Visit `/checkout?plan=basic` | Shows active checkout form (no "Coming Soon") |
| 5 | Visit `/checkout?plan=invalid` | Returns 404 |
| 6 | Submit form without email | Should still work (email is optional) |
| 7 | Submit form with invalid email | Should show validation error |

### Post-deployment Tests (Vercel + Render)

| # | Test | Expected |
|---|------|----------|
| 1 | Visit `reel-cutter-nine.vercel.app/pricing` | Shows monthly pricing |
| 2 | Visit `reel-cutter-nine.vercel.app/checkout?plan=basic` | Active checkout form |
| 3 | Submit checkout with valid email | Redirects to Stripe Checkout (test mode) |
| 4 | Submit checkout without auth | Works (email-based, userId is optional) |
| 5 | Submit checkout with auth | userId is included in request |
| 6 | Complete Stripe payment in test mode | Redirects to `/checkout/success?sessionId=...` |
| 7 | Cancel Stripe payment | Redirects to `/checkout/cancel?sessionId=...` |
| 8 | Success page shows payment details | Session data displayed |
| 9 | CORS: browser console shows no CORS errors | Backend accepts Vercel origin |
| 10 | Stripe webhook fires | License created (if webhook is configured) |

### Regression Tests

| # | Test | Expected |
|---|------|----------|
| 1 | `/pricing` page renders correctly | No layout/style breakage |
| 2 | `/account` page still works | License dashboard unaffected |
| 3 | `/login` and `/signup` pages work | Auth flow unaffected |
| 4 | Backend health check: `GET https://reel-cutter.onrender.com/` | Returns 200 |
| 5 | Backend payment API: `POST /api/payment/create-checkout-session` with `{ planId: "basic" }` | Returns Stripe session |

### Edge Cases

| # | Test | Expected |
|---|------|----------|
| 1 | Submit with unknown planId | Backend returns `PLAN_NOT_CONFIGURED` error |
| 2 | Submit with malformed email | Backend returns `INVALID_INPUT` error |
| 3 | Submit with invalid userId format | Backend returns `INVALID_INPUT` error |
| 4 | Double-click submit | Loading state prevents duplicate requests |
| 5 | Backend is down | User sees friendly error message, not crash |

---

## Summary

| Item | Detail |
|------|--------|
| Root cause | Checkout page is a static placeholder with hardcoded "Coming Soon" / disabled button. Never wired to backend. |
| Primary file | `website/src/app/checkout/page.tsx` (complete rewrite needed) |
| Config files | `website/src/config/pricing.ts`, `website/src/config/payment.ts` |
| Backend status | **Ready** — no backend changes needed |
| API compatibility | **Full match** — backend expects exactly what website should send |
| New files | `website/src/components/CheckoutForm.tsx` (client checkout form) |
| Environment vars | 1 new Vercel var (`NEXT_PUBLIC_SERVER_URL`), verify 1 Render var (`CORS_ALLOWED_ORIGINS`) |
| Security | No concerns — server-authoritative architecture already in place |
