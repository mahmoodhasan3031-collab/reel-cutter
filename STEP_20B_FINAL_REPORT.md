# STEP 20B Final Report

## Summary

Built the secure admin dashboard UI in `website/` for reviewing manual payments against the existing STEP 19 backend. Routes: `/admin/login`, `/admin` (dashboard), `/admin/payments` (list), `/admin/payments/[id]` (details + proof preview + approve/reject). No backend, Stripe, production Supabase, storage, or desktop/HWID/license logic changes. STOP — no STEP 21.

---

## Feature Checklist

| Area | Status |
|------|--------|
| Admin Login UI | **DONE** — `/admin/login` noindex page; username/password form → `POST /api/admin/login`; generic auth error (no enumeration); 401/400 → "Invalid username or password"; 429 → wait message; 503 → not-configured message; success stores opaque token via `setAdminSession` (never the password) and redirects to `/admin` |
| Route Protection | **DONE** — `(protected)/layout.tsx` wraps dashboard/list/detail in `AdminGuard`; guard checks `getAdminSession()` before rendering children (loading state first); missing/expired session → `router.replace('/admin/login')`; login page lives outside the route group; all admin pages `robots: noindex` |
| Dashboard | **DONE** — `/admin` shows real per-status counts from `GET /api/admin/payments?status=X&limit=1` → `pagination.total` (server exact counts, no invented aggregates) + 5 most recent pending submissions with links; Refresh; loading/error/empty states |
| Payment List | **DONE** — `/admin/payments` table: Customer, Email, Plan, Method, Amount, Currency, Transaction ID, Status, Submitted; pending/approved/rejected filter tabs (reset to page 1); Prev/Next pagination from `pagination.total_pages`; loading/empty/error/refresh; row → `/admin/payments/[id]` |
| Payment Details | **DONE** — `/admin/payments/[id]` awaits Next 16 params Promise; all safe fields (name, email, whatsapp, plan, method, amount, currency, txn, sender, created/updated/reviewed dates, reviewed_by, license_id, admin_note, rejection_reason); back link; status badge |
| Proof Preview | **DONE** — `<img src={signed_url}>` from `GET …/:id` only; never persisted to storage; `onError` → reference fallback + "Refresh proof link" (re-fetches detail for a fresh short-lived URL); expiry surfaced |
| Approve Flow | **DONE** — pending-only; explicit confirmation panel warns license will be created + customer emailed; optional `admin_note`; body contains **only** `admin_note` (no status/reviewed_by/license_id); disables controls during submit; result surfaces license ID, email delivery, `already_approved`; refreshes detail; actions disabled when not pending |
| Reject Flow | **DONE** — explicit confirmation; **required** reason (client validation + disabled confirm until non-empty, maxLength 1000); optional admin note; body = `{ reason, admin_note? }` only; `already_rejected` handled; conflict (409) → message + auto refresh |
| Session Handling | **DONE** — token + username + `expiresAt` (from server `expires_in`) in **sessionStorage only**; no password stored; token never parsed/decoded in browser (server authoritative); expired session cleared on read; 401/403 → clear session + hard redirect `/admin/login`; Logout clears + redirects; no credentials in URL; no console logging of secrets |
| Security | **DONE** — 401/403 clear+redirect; 429 rate-limit message; 409 state-conflict + refresh; 5xx generic message; no `ADMIN_PASSWORD_HASH`/`ADMIN_SESSION_SECRET`/`service_role` in `website/src`; approve/reject bodies exclude `reviewed_by`/`license_id`/`status`; only `Authorization: Bearer` header; no client-side license creation; no status-mutation endpoints; signed URL not persisted; bundle secret scan clean (747 files) |
| Tests: **72/72** | `test/step20b-admin-dashboard-ui.test.js` sections A–X registered in `runAllTests.js` |
| Regression | **PASS** — full `npm test` all suites green (incl. step16-security 22/22, step16a 34/34, step17 44/44, step18 46/46, step19 71/71, step19-reliability 44/44, step20a 53/53, step20b 72/72, step23/24/25/26/32e, packaging 19/19) |
| Lint | **PASS** — `npm run lint` 0 errors, 0 warnings |
| TypeScript | **PASS** — `npx tsc --noEmit` clean |
| Next Build | **PASS** — `npm run build` success; routes `○ /admin`, `○ /admin/login`, `○ /admin/payments`, `ƒ /admin/payments/[id]` |

---

## Files Created

| File | Description |
|------|-------------|
| `website/src/config/adminApi.ts` | STEP 19 endpoints (login, payments list/detail, approve, reject), list filters, default limit; client-safe |
| `website/src/config/adminApi.js` | CommonJS twin for Node tests |
| `website/src/lib/adminSession.ts` | sessionStorage session: get/set/clear/has; expiry check; token never decoded |
| `website/src/lib/adminApi.ts` | `adminFetch` (Bearer attach, 401/403 clear+redirect, error mapping), `describeAdminError`, `isConflictError`, `redirectToAdminLogin` |
| `website/src/app/admin/login/page.tsx` | Noindex login page (metadata + card shell) |
| `website/src/app/admin/login/AdminLoginForm.tsx` | Client login form: validation, loading, generic errors, rate-limit/503 handling, session persist, redirect |
| `website/src/app/admin/(protected)/layout.tsx` | Server layout: admin metadata title template + noindex; renders `AdminGuard` |
| `website/src/app/admin/(protected)/AdminGuard.tsx` | Client guard + top nav (Dashboard \| Payments \| username \| Logout) |
| `website/src/app/admin/(protected)/page.tsx` | Dashboard server page (metadata) |
| `website/src/app/admin/(protected)/AdminDashboard.tsx` | Counts (3× `pagination.total`) + recent pending list |
| `website/src/app/admin/(protected)/payments/page.tsx` | Payments server page (metadata) |
| `website/src/app/admin/(protected)/payments/PaymentsList.tsx` | Filter tabs, pagination, table, states, refresh |
| `website/src/app/admin/(protected)/payments/[id]/page.tsx` | Detail server page; awaits Next 16 `params` Promise |
| `website/src/app/admin/(protected)/payments/[id]/PaymentDetail.tsx` | Full details, signed-URL proof preview + refresh, approve/reject confirmation flows |
| `test/step20b-admin-dashboard-ui.test.js` | 72 tests, sections A–X |

## Files Modified

| File | Change |
|------|--------|
| `test/runAllTests.js` | Registered `step20b-admin-dashboard-ui.test.js` |
| `test/step20a-manual-payment-ui.test.js` | Updated I4: was "no `/admin` exists" (obsolete now that STEP 20B owns it); now asserts STEP 20A payment pages do not reference `/admin` and that admin login exists — not a weakening (scope boundary moved), full 53/53 still pass |

---

## Backend Changes Required

**None.** Frontend integrates existing STEP 19 endpoints only:

- `POST /api/admin/login`
- `GET /api/admin/payments?status=&page=&limit=`
- `GET /api/admin/payments/:id` (returns `proof.signed_url`)
- `POST /api/admin/payments/:id/approve`
- `POST /api/admin/payments/:id/reject`

---

## Production Database / Storage / Deployment

- **Production Database: NO**
- **Storage: NO**
- **Deployment: NO**
- **Stripe Removed: NO**

---

## Bugs Discovered / Fixed

1. **Test regex syntax error** in `step20b` W1 (`/createLicense|/api\/licenses|…` — unescaped `/` terminated the pattern) → fixed to `\/api\/licenses`.
2. **Over-broad test assertions** (A2 noindex regex missed Next `robots: { index: false }` form; B2 flagged the word "password" in a security comment; O3/X1 sliced past function end into rendered "Reviewed by" label; U1/U2 flagged literal secret *names* in a "never store these" comment) → tightened assertions to real security properties; reworded config comments to avoid false-positive secret scans without weakening coverage.
3. **STEP 20A I4 obsolete** — asserted `/admin` must not exist; STEP 20B intentionally creates it → replaced with STEP 20A↔20B independence check (20A files never link to `/admin`).
4. **Lint `react-hooks/set-state-in-effect`** on initial data fetches → deferred first `setState` behind `await` + documented disable (same pattern as existing `PaymentStatusClient`); `window.location.href` internal-nav warnings → switched list row nav to `router.push`, documented intentional hard redirect in `redirectToAdminLogin`; removed unused `ADMIN_API` import and unused eslint-disable in CJS twin.

---

## Pre-existing Failures (Not Masked)

| Failure | Notes |
|---------|-------|
| `test/step28-production-readiness.test.js` **I1** (62/63) | Stale assertion: webhook `markEventProcessed` ordering — known issue from before STEP 20B; suite is **not** registered in `runAllTests.js`; unchanged by this step |

---

## Manual Setup

1. Ensure backend is running with admin auth configured: `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` (scrypt), `ADMIN_SESSION_SECRET` in `server/.env` — otherwise login returns 503.
2. Ensure `CORS_ALLOWED_ORIGINS` includes the website origin (default `http://localhost:3000`).
3. Ensure `NEXT_PUBLIC_API_BASE_URL` points at the backend origin.
4. Visit `/admin/login` and sign in with the configured admin credentials.

---

**STEP 20B COMPLETE — STOP (no STEP 21).**
