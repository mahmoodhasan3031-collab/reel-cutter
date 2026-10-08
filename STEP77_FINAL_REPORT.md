# STEP 77 — Production License/Entitlement Boundary: Read-Only Verification

**Mode:** READ-ONLY. No production mutation, no migration applied, no secret created/rotated,
no policy change, no application source change, no commit/push/reset/stash/delete.

---

## Verdict block (required)

| Dimension | Result |
|---|---|
| **CODE VERIFICATION** | **PASS** |
| **DATABASE VERIFICATION** | **UNVERIFIED** (catalog-level SQL inspection not available; see D/I) |
| **MIGRATION APPLICATION STATUS** | **NOT APPLIED** — read-only REST evidence, see D (catalog detail remains UNVERIFIED) |
| **PRODUCTION READINESS** | **BLOCKED** |

---

## A. Repository integrity

Repo: `C:\Users\Mahmood_Hasan\Desktop\llm model\reel-cutter` (git repo, HEAD `ed659703c116854f3cb46cfb0dd3307f46e9777c`).

| Check | BEFORE (step start) | AFTER (report time) | Match |
|---|---|---|---|
| `git status --porcelain` | 104 entries | 104 entries | **IDENTICAL (line-by-line)** |
| `git diff --stat` | 66 files, +1313 / −5620 | 66 files, +1313 / −5620 | **IDENTICAL** |
| `git diff --check` | empty (no whitespace errors) | empty | **IDENTICAL** |
| HEAD | `ed659703c116854f3cb46cfb0dd3307f46e9777c` | same | **IDENTICAL** |
| staged entries | 0 | 0 | **IDENTICAL** |
| stashes | 0 | 0 | **IDENTICAL** |

- No `git add`, `commit`, `push`, `reset`, `stash`, `checkout`, `revert`, or `clean` was executed.
- Only STEP 77 artifacts: this report (`STEP77_FINAL_REPORT.md`, new untracked file — explicitly
  requested deliverable) and one probe script written **outside** the repo
  (`%TEMP%\opencode\step77_probes.js`).
- Test runs rewrote `server/.webhook-idempotency.json` only — a **gitignored** runtime cache
  (`server/.gitignore`), not part of git state.

## B. STEP 76 baseline (as read from `STEP76_FINAL_REPORT.md`)

- All six findings (M-1, M-2, L-1, L-2, L-3, L-4) reported CLOSED.
- Counts: step16a 34/34, step49b 15/15, step18 46/46, step76 36/36, regression baseline 269/269,
  full `runAllTests.js` 69 suites exit 0.
- 14 git entries attributable to STEP 76; staged=0, stash=0, HEAD unchanged; no commit/push.
- STEP 76 stopped **before** the production migration; the migration file was left **untracked**.
- Critical remaining operator action: apply
  `supabase/migrations/20261002000000_step76_license_entitlement_hardening.sql`
  **together with** the corresponding client release.

STEP 77 re-verified all seven baseline suites plus step76 fresh — all green (section L).

## C. Migration file analysis

File: `supabase/migrations/20261002000000_step76_license_entitlement_hardening.sql` (136 lines, **untracked**).

Production objects/contracts the file is intended to establish (nothing else):

| # | Object | Contract |
|---|---|---|
| C1 | `CREATE OR REPLACE FUNCTION public.fetch_license_by_key(TEXT)` | `RETURNS TABLE` **10 columns**: `id, license_key, hwid, tier, status, created_at, updated_at, subscription_status, current_period_end, cancel_at_period_end`; `SECURITY DEFINER`; `SET search_path = public`; key normalized `upper(trim())`; **no** `stripe_subscription_id` / `stripe_customer_id` / `customer_email`. Lines 32-62. |
| C2 | privilege block for C1 | `REVOKE EXECUTE … FROM PUBLIC`, `… FROM anon`, `… FROM authenticated`; `GRANT EXECUTE … TO service_role`. Lines 64-68. |
| C3 | `CREATE OR REPLACE FUNCTION public.bind_license_hwid(TEXT, TEXT)` | 7-column `RETURNS TABLE`; plpgsql `SECURITY DEFINER`, `search_path = public`; normalizes key (`upper/trim`) and HWID (`lower/trim`); **format guard** `^[a-f0-9]{64}$` → `RETURN` (empty, *before* any `UPDATE`); `UPDATE … WHERE license_key=… AND hwid IS NULL AND status='active'`; returns a row **only** when `l.hwid =` requested HWID; `updated_at` delegated to the existing `set_licenses_updated_at` trigger (created by `20260915000000`, verified present in repo migrations). Lines 78-126. |
| C4 | privilege block for C3 | same revokes + `GRANT … TO service_role`. Lines 128-132. |
| C5 | commented verification query | `pg_proc`/`has_function_privilege` SELECT, lines 134-136 (not executed). |

**Explicitly NOT established by this migration:** no tables, no columns added, no RLS flags,
no policies, no indexes, no constraints, no triggers, no role/table grants, no webhook or
admin-endpoint logic (JS), no rate limiter (JS), no client release.

Dependencies it assumes already exist in production: `licenses.subscription_status`,
`current_period_end`, `cancel_at_period_end` (migration `20260928`), and trigger
`set_licenses_updated_at` (`20260915`). Both are `LANGUAGE sql`/plpgsql parse-checked, so a
missing dependency makes the migration fail loudly rather than half-apply.

## D. Production migration status

**MIGRATION APPLICATION STATUS: NOT APPLIED** (read-only REST evidence; catalog detail UNVERIFIED).

Read-only probes executed against production project `pyrtitvvwxrwhmdfrjsb.supabase.co`
(`server/.env` `SUPABASE_URL`) using the **anon/publishable key only**. Service-role key: **not used**.

| Probe (non-mutating) | Result | Inference |
|---|---|---|
| `POST /rest/v1/rpc/fetch_license_by_key` body `{"p_license_key":"ZZZZ-ZZZZ-ZZZZ-ZZZZ"}` | **HTTP 200, `[]`** | `anon` **still holds EXECUTE** → C2 revokes **not applied** |
| `POST /rest/v1/rpc/bind_license_hwid` with a **malformed** HWID (the format guard returns *before* the `UPDATE`, so the statement never runs) | **HTTP 200, `[]`** | `anon` **still holds EXECUTE** → C4 revokes **not applied** |
| `GET /rest/v1/licenses?select=*&limit=1` (anon) | 401 `42501 permission denied for table licenses` | anon cannot read license rows (pre-existing `20260916` REVOKEs hold) |
| `GET /rest/v1/manual_payments?select=*` (anon) | 401 `42501 permission denied for table manual_payments` | ditto |
| `GET /rest/v1/audit_log?select=*` (anon) | 401 `42501 permission denied for table audit_log` | ditto |
| `GET /rest/v1/` with no apikey | 401 `No API key found` | key check enforced |
| `GET /rest/v1/` OpenAPI with anon key | 401 `Secret API key required` | no schema/column inventory available to anon |

Both `REVOKE` statements of the migration are therefore demonstrably **not in effect**; since a
migration file applies as one unit, the file as a whole has not been applied. Independent
corroboration: `git status` shows the file still untracked, no operator has reported applying it,
and the backend API build also predates STEP 76 (section E).

**UNVERIFIED** (no SQL/catalog channel exists in this environment — no Supabase CLI login token,
project not linked, no DB password, no SQL-over-REST):
migration/version history (`supabase_migrations.schema_migrations`), `relrowsecurity` flags,
policy definitions, table/column GRANT inventory, function bodies/return shapes (10 vs 7 columns
cannot be observed without a real license key), triggers, indexes, constraints, `authenticated`/
`service_role` behaviour, and whether `20260928` subscription columns exist in production.
Operator path already prepared but never executed by the user: `step49_readonly_production_audit.sql`
(dashboard SQL Editor, SELECT-only).

## E. License API endpoint inventory (source + live probes)

Mounted at `server/index.js:47-66`; license router `server/routes/license.js`, admin router
`server/routes/admin.js`.

| Endpoint | Middleware order | Live probe (production, read-only) |
|---|---|---|
| `POST /api/license/activate` | `allowMethods(POST)` → `stripUnknownFields([licenseKey,hwid])` → `activateLimiter` (10/min/IP) → handler | missing HWID → **400** `INVALID_INPUT`; bad HWID format → **400** |
| `POST /api/license/validate` | same, `validateLimiter` (30/min/IP) | missing HWID → **400**; bad HWID → **400** |
| `GET /api/license/status` | `allowMethods(GET)` → `statusLimiter` (30/min/IP) → handler | malformed key → **400** generic; 7× valid-format unknown keys → **404** `LICENSE_INVALID` each (no 429) |
| `GET /api/license/dashboard` | `allowMethods(GET)` → Bearer JWT verified via `adminClient.auth.getUser(token)` **before** any DB read (`license.js:175-191`) → `getLicensesByUserId` → explicit `safeLicenses` projection | no auth → **401**; garbage bearer → **401**; forged customer JWT → **401** |
| `POST /api/admin/login` | `loginLimiter` (5/min/IP) | not probed (credential endpoint) |
| `GET /api/admin/payments`, `GET /api/admin/payments/:id`, `POST …/approve`, `POST …/reject` | `requireAdmin` → `adminApiLimiter` (60/min) | no auth → **401**; forged admin session → **401** |
| `POST /api/admin/licenses/:licenseKey/revoke` | `allowMethods(POST)` → `stripUnknownFields([])` → `requireAdmin` → `adminApiLimiter` → key format check → service → audit | **404 NOT_FOUND** ⇒ route **absent from deployed build** |
| `POST /api/admin/licenses/:licenseKey/reset-hwid` | same | **404 NOT_FOUND** ⇒ route **absent from deployed build** |

Deployment inference: the live Render backend answers `/api/admin/payments` with 401 (admin router
mounted) but `/api/admin/licenses/*` with 404 (global 404 handler) → the deployed commit predates
STEP 76, consistent with an uncommitted working tree. Consequences: L-3 admin revoke/HWID-reset is
**not available in production**, and L-4's strict invalid-key budget is **not live**
(section J).

## F. Authentication / authorization boundary

Trace (verified in source, section refs):

```
Electron client (src/main/license/supabaseClient.js — plain fetch, no SDK, no key, 10s timeout)
  ├─ GET  /api/license/status   ─┐
  ├─ POST /api/license/validate ─┼─▶ license.js: format validation (inputValidator.js:9-57)
  └─ POST /api/license/activate ─┘        │  (400 before any DB access)
                                          ├─▶ limiter (per-IP budget)
                                          ├─▶ licenseService.activate/validate/getLicenseStatus
                                          │      └─ service-role client → RPC fetch_license_by_key
                                          ├─▶ entitlement: checkSubscriptionValidity / computeIsActive
                                          ├─▶ HWID: bind/compare (server-authoritative)
                                          └─▶ response: explicit safe object (licenseKey, tier,
                                                status, activatedAt[, hasHwid, isActive, subscription*])
Client (website, user session)
  └─ GET /api/license/dashboard ─▶ Bearer → Supabase adminClient.auth.getUser (license.js:180)
                                   → userId from token (never client-supplied) → DB read
                                   → safeFields projection (no hwid value, no email, no transaction)
Admin
  └─ /api/admin/* ─▶ requireAdmin (HMAC session, timing-safe, adminAuth.js) BEFORE handler/DB
```

- Authorization **precedes** sensitive DB access on every authenticated path
  (dashboard: `license.js:175-193`; admin: middleware order in `admin.js:187-443`).
- Key-based endpoints (`activate`/`validate`/`status`) are intentionally unauthenticated:
  possession of the key + HWID match **is** the authorization factor; strict format validation and
  per-IP limiters run before lookup; failures are generic (`LICENSE_INVALID`, never row content).
- Live probes confirm: malformed key → generic 400; nonexistent key → generic 404;
  missing/invalid HWID → generic 400; no bearer / forged customer JWT → 401;
  forged admin session → 401; no response exposed DB rows, raw entitlements, or credentials.
- Test-mode seam `x-test-user-id` (`license.js:186-190`) is only reachable when **both**
  `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are absent — the same two variables gate the
  service client (`licenseService.js:15`), so in that state no production rows exist behind it
  (INFO-1).

## G. HWID binding boundary

- API layer: `validateHwid` requires exactly 64 lowercase-hex chars (`inputValidator.js:20-42`);
  missing → 400, malformed → 400 (verified live on `/activate` and `/validate`).
- Service layer (`licenseService.js`): `activateLicense` binds only when `record.hwid` is null,
  returns `HWID_MISMATCH` for a different device, `LICENSE_REVOKED`/`LICENSE_INACTIVE`/
  `SUBSCRIPTION_INACTIVE` before binding; `bindLicense` treats an empty RPC result as
  `LICENSE_BIND_FAILED` and a differing stored HWID as `HWID_MISMATCH` (L-2).
- DB layer (intended, migration C3): format guard, `hwid IS NULL` guard, `status='active'` guard,
  row returned only when bound to the *requested* HWID → **not in production** (section D).
- Production DB today = pre-migration `bind_license_hwid` (`20260927` body): `SECURITY DEFINER`,
  `hwid IS NULL` only (**no status guard, no format guard**), binds raw `p_hwid`, and **returns the
  row whether or not the update happened**; and `anon` can execute it (proven in D). The API's
  HWID/format gates are therefore bypassable by calling PostgREST directly with the publishable
  key — folded into H-1.

## H. Entitlement boundary

- Intended (STEP 76 M-1): 10-column RPC feeds `checkSubscriptionValidity` → `computeIsActive`
  → `/api/license/status` exposes `isActive`, `subscriptionStatus`, `currentPeriodEnd`,
  `cancelAtPeriodEnd` (`licenseService.js:115-121`, `:352-368`); client denies on
  `isActive === false`.
- Production reality: migration not applied → the RPC still returns the pre-STEP 76 column set
  (no subscription columns), so `record.subscription_status` is always undefined server-side and
  entitlement degrades to the static `status` column — exactly the M-1 defect. The Stripe webhook
  updates subscription columns, not `status`, so a lapsed subscription can remain `active`.
- Live confirmation of non-deployment: production `/api/license/status` behaviour cannot be
  observed for a *valid* key (no disposable production license key available — documented
  limitation), but the 7th unknown-key request returned 404 instead of the STEP 76 429, and the
  STEP 76 admin routes 404 (section E) — the backend code that computes `isActive` is not deployed.
- Exposed entitlement fields go only to (a) the holder of the license key, or (b) the authenticated
  owner via `/dashboard` (own rows only). No cross-user entitlement exposure was found in code or
  probes.

## I. RLS / policy / grant verification

Verified (read-only REST, production):

| Check | Result |
|---|---|
| anon can `SELECT public.licenses` | **DENIED** (`42501`) |
| anon can `SELECT public.manual_payments` | **DENIED** (`42501`) |
| anon can `SELECT public.audit_log` | **DENIED** (`42501`) |
| anonymous API key required by PostgREST | **YES** (401 without `apikey`) |
| anon EXECUTE on `fetch_license_by_key` | **GRANTED (still)** → migration C2 missing |
| anon EXECUTE on `bind_license_hwid` | **GRANTED (still)** → migration C4 missing |
| schema/OpenAPI disclosure to anon | **DENIED** (`Secret API key required`) |

UNVERIFIED (no catalog channel): `relrowsecurity`/`relforcerowsecurity` flags, exact policy
definitions (service-role-all, authenticated read-own, manual-payment insert/SELECT policies),
`GRANT` matrix for `service_role`/`authenticated`, function bodies & return columns, triggers,
indexes, constraints, and migration history. Repo migrations (`20260915`/`20260916`/`20260925`/
`20260926`/`20260929`/`20260930`/`20261001`) define the expected state; production conformance was
last auditable only through `step49_readonly_production_audit.sql`, which remains unexecuted.
→ **DATABASE VERIFICATION = UNVERIFIED.**

## J. Rate limiting verification

| Limiter | Config | Verified |
|---|---|---|
| `activateLimiter` | 10/min/IP (`rateLimiter.js:135`) | by suite step76/step25 (local HTTP); not probed live (would consume activation budget) |
| `validateLimiter` | 30/min/IP (`:136`) | by suites (local) |
| `statusLimiter` | 30/min/IP (`:137`) | by suites (local) |
| `invalidKeyGuard` (L-4) | 5/min/IP, shared across activate/validate/status, counts only `LICENSE_INVALID` (`:16-17`, `:124-133`) | **local: step76 F1-F4 pass (36/36 suite)**; **production: NOT observed** — 7 unknown-key `GET /api/license/status` requests in a row all returned **404**, no 429, no `Retry-After` |
| `adminApiLimiter` / `loginLimiter` | 60/min, 5/min (`admin.js:58-60`) | by step19/step47 suites |

Production 429 probe was deliberately bounded to 7 requests (control: it only ever consumed this
caller's own per-IP invalid-key budget for 60 s; no data touched, no other IP affected). Absence of
429 is itself the deployment signal recorded in E.

**Residual bypass (pre-existing until the migration lands):** with the publishable key an attacker
can call `fetch_license_by_key` directly against PostgREST with *no* rate limit at all, so API-side
key-guessing limits (current 30/min/status, future 5/min invalid-key) do not bound DB-side guessing.

## K. Secret / error-leakage scan

Scanned: `server/`, `src/`, `website/src/`, `supabase/`, `test/`, `electron.vite.config.mjs`,
`package*.json`.

| Pattern | Result |
|---|---|
| `sk_live_…` / `sk_test_…` (real-looking) | **none** — only sanitizer fixtures in `test/crash-reporter.test.js`, `test/security-audit.test.js` (intentional detection inputs) |
| `whsec_…` (real-looking) | **none** — same two fixture files |
| `sb_secret_…` | **none** |
| JWT-shaped literals (`eyJ…`.`…`.`…`) | **none** |
| service-role key in non-ignored files | **none** — referenced by env *name* only (`server/config.js:39`); never logged, never serialized into a response (greps for `console.*serviceRoleKey`, `res.json(...serviceRole`, `err.stack` in `server/` = 0 hits) |
| license keys / HWIDs in logs | **none** — webhook uses `maskLicenseKey(...)` (`webhook.js:147`); error logs carry `err.message` only |
| raw DB row / entitlement serialization | **none** — `.select('*')` appears 4× (`licenseService.js:435`, `paymentReviewService.js:161`, `licenseGenerator.js:214/247`) but every HTTP response maps to explicit safe projections (`license.js:196-209`, `licenseService.js:277-285/352-368`) |
| anon-key access to protected license tables | **denied at the table** (section I); anon RPC access **still open** (H-1) |
| Electron client Supabase credentials | **none** — no `@supabase/supabase-js`, no `SUPABASE_ANON_KEY`, no `.rpc(` anywhere under `src/` (grep = 0); build config injects `__API_BASE_URL__` only |
| website license/RPC/service-role usage | **none** (grep `.rpc(`, `fetch_license_by_key`, `bind_license_hwid`, `service_role`, `sb_secret_` under `website/src` = 0) |
| `.env` files | `server/.env` **not tracked**, gitignored; `*.env.example` values are prose placeholders containing "your/example" wording (both `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` fail every real-key regex) |
| publishable anon key literal | present at `test/step21-manual-payment-e2e.test.js:104`, byte-identical to `server/.env` `SUPABASE_ANON_KEY` (`sb_publishable_…`, 46 chars). Publishable keys are public-by-design; it is **not** in HEAD (working-tree only). → L-3 |

No secret was printed, created, rotated, or transmitted anywhere except the two read-only RPC
probes in D (which sent the key as the standard `apikey` header to its own project).

## L. Regression tests

Run individually (`node test/<suite>.js`), no package installs, no lockfile changes.

**Required suites — all green:**

| Suite | Result |
|---|---|
| `step76-entitlement-hardening.test.js` | 36/36 |
| `license.test.js` | 15/15 |
| `step25-license-api.test.js` | 57/57 |
| `step32e-subscription-server.test.js` | 39/39 |
| `step16a-security.test.js` | 34/34 |
| `step18-security.test.js` | 46/46 |
| `step49b-security-audit.test.js` | 15/15 |
| **STEP 76 baseline subtotal** | **269/269 ✓ (re-confirmed)** |
| `step24-authentication.test.js` | 32/32 |
| `step17-security.test.js` | 44/44 |
| `security-audit.test.js` | 22/22 |
| `step27-license-delivery-dashboard.test.js` | 63/63 |
| `step21-manual-payment-e2e.test.js` | 41/41 (live-Supabase probe correctly **skipped**: non-loopback target) |
| `step19-admin-auth-payment-review.test.js` | 71/71 |
| `step47-manual-payment-approval.test.js` | 15/15 |
| `step17-manual-payment-api.test.js` | 62/62 |
| `step16-manual-payment-migration.test.js` | 68/68 |
| `step32-manual-payment-policy.test.js` | 34/34 |
| `step35c-webhook-checkout-fix.test.js` | 21/21 |
| `payment.test.js` | 15/15 |
| `e2e-payment-email.test.js` | 12/12 |
| **Total passed** | **20 suites, 742/742 assertions, exit 0 each** |

**Suites outside the registered 69-suite gate — failures recorded, not fixed (section M):**

| Suite | Result | Cause |
|---|---|---|
| `step46c-service-role-grants.test.js` | 9/10 | **G2 fails**: "newest migration on disk" is now `20261002…step76…`, so `20261001…` is no longer last — stale assumption introduced by STEP 76's new file (L-1). Container check skipped (Docker daemon not running). |
| `step33-manual-payment-select-policy.test.js` | 10/24 | all 14 failures cascade from `B0. local docker database container is running` — Docker Desktop daemon not running (environmental) |
| `step28-production-readiness.test.js` | 1 failure (`I1`) | documented **pre-existing** in `STEP_49B_FINAL_REPORT.md` (point 27) |
| `step53-production-config.test.js` | 32/39 | 7 failures: `all Supabase migrations are tracked by git` (caused by the **untracked STEP 76 migration**, L-2), `website/.env.example is tracked` (pre-existing untracked file), download-page/package `v1.0.5` expectations vs HEAD `1.0.6` (stale), `payment.ts` production mode gate, electron-builder artifactName literal — all pre-existing except the migration-tracking one |

`test/runAllTests.js` itself was **not** re-run in full (instruction: relevant suites only);
STEP 76 recorded 69/69 suites exit 0 and none of the 8 baseline suites regressed here.

## M. Findings by severity

### HIGH

**H-1 — Production migration NOT applied: anon still executes both license RPCs (entitlement + HWID boundary unenforced).**
*Evidence:* D table — `fetch_license_by_key` **200** and `bind_license_hwid` **200** under the
public publishable key; revokes from migration C2/C4 not in effect; migration file still untracked.
*Impact while open:*
1. Unauthorized license-record reads: any guessed key returns `id, license_key, hwid, tier, status,
   created_at, updated_at` directly to a public-key holder (bypassing API sanitization).
2. L-4 bypass: unlimited DB-side key enumeration with no rate limit at all.
3. Bypassable HWID authorization: pre-migration `bind_license_hwid` (no format guard, no
   `status='active'` guard, returns the row even when nothing changed) lets a public-key holder
   bind any *unbound* license — including one they do not own — to an arbitrary string, locking out
   the legitimate buyer and defeating the API's HWID/limit gates.
4. M-1 not enforced: RPC omits the subscription columns → server entitlement falls back to the
   static `status` column → lapsed subscriptions keep working.
*Rule match:* "production migration missing when required for enforcement" + "unauthorized
license/entitlement access" + "bypassable HWID/license authorization".
*No fix attempted (STEP 77 is read-only).*

### MEDIUM

**M-1 — Production backend build predates STEP 76 (L-3 admin operations absent, L-4 strict limiter absent).**
*Evidence:* E — `/api/admin/licenses/:key/revoke` and `/reset-hwid` → **404** while
`/api/admin/payments` → 401 (router mounted); 7 consecutive unknown-key `status` calls → all 404,
no 429/`Retry-After` (J).
*Impact:* defense-in-depth gap — admin revoke/HWID-reset unavailable to operators in production;
invalid-key budget is only the generic 30/min status limiter instead of the strict 5/min unknown-key
budget; per-endpoint limiters still bound guessing, so this is not a full bypass (that is H-1).
*Rule match:* "meaningful defense-in-depth gap affecting license security".

### LOW

**L-1 — `step46c` migration-ordering assertion broken by the new STEP 76 file, and the suite is invisible to the full-run gate.**
`test/step46c-service-role-grants.test.js` G2 asserts `20261001…` is the newest migration; the new
`20261002…` file makes it fail. The suite is **not registered** in `test/runAllTests.js`, so
"69/69 suites" cannot catch this. Not fixed (no authorized change).

**L-2 — STEP 76 migration file is untracked in git.**
`?? supabase/migrations/20261002000000_step76_license_entitlement_hardening.sql`. Consequences:
it is outside version control (loss/drift risk for the one artifact production needs), and it trips
`step53`'s "all Supabase migrations are tracked by git" gate. Committing requires explicit
authorization, which STEP 77 does not have.

**L-3 — Live production publishable key literal in a tracked test file.**
`test/step21-manual-payment-e2e.test.js:104` hardcodes the production `sb_publishable_…` value
(identical to `server/.env` `SUPABASE_ANON_KEY`). Publishable keys are public by design and
STEP 76 already lists rotation as optional hygiene; residual risk rises while H-1 is open, because
that key currently carries real RPC power. Value not reproduced in this report.

**L-4 — Catalog-level production verification is impossible from this environment.**
No Supabase CLI token, project unlinked, no DB password → RLS flags, policies, grants, function
bodies, indexes, constraints and migration history stay UNVERIFIED (section I).

### INFO

**INFO-1 — Intentional architecture / accepted limitations.**
Entitlement *policy* lives in JS (`checkSubscriptionValidity`) so SQL and JS cannot drift; SQL only
whitelists columns and hardens binding. `/api/license/status` exposes entitlement fields to the key
holder by design and never exposes `hwid` (only `hasHwid`) — step25 contract.
`x-test-user-id` on `/api/license/dashboard` is reachable only when both Supabase vars are absent,
in which state no production rows exist behind it. `lookupLicense` falls back to an empty in-memory
store on RPC failure (fail-closed: denies rather than widens). In-memory limiters need Redis for
multi-instance deployments (already documented). `invalidKeyLimiter` remains exported but unused
(the guard path is used). Pre-existing `step28` I1 and `step33` Docker failures are unchanged.
Probe limitations: no valid production license key, so success-path response bodies (status /
validate / activate) were verified by local suites only; `bind_license_hwid` was probed exclusively
through its pre-`UPDATE` format guard, and the service-role key was never used.

## N. Production readiness verdict

```
CODE VERIFICATION      = PASS     (source trace + 742/742 assertions over 20 suites,
                                   including the full 269/269 STEP 76 baseline + 36/36 step76)
DATABASE VERIFICATION  = UNVERIFIED  (catalog-level SQL inspection unavailable; only
                                   read-only REST evidence collected — section I)
MIGRATION APPLICATION  = NOT APPLIED (read-only anon-EXECUTE evidence — section D;
                                   catalog detail still UNVERIFIED)
PRODUCTION READINESS   = BLOCKED  (H-1 open; M-1 open)
```

The STEP 76 code and tests are sound; the enforcement they depend on simply does not exist in
production yet. Production remains in its pre-STEP 76 steady state — no regression was introduced,
but none of the STEP 76 protections are live.

## O. Explicit next operator action

*(Operator decisions — none of this was executed by STEP 77.)*

1. **Apply** `supabase/migrations/20261002000000_step76_license_entitlement_hardening.sql` to the
   production Supabase project `pyrtitvvwxrwhmdfrjsb` (dashboard SQL Editor or Supabase CLI), and
   **in the same release train**:
   - **rebuild/ship the Electron client** (new HTTP transport, no bundled Supabase key) and
   - **deploy the backend** (Render) so `isActive` entitlement enforcement, the admin
     revoke/reset-hwid endpoints, and the strict invalid-key 429 become live.
   Ordering matters: revoking anon `EXECUTE` before old clients stop using it makes legacy builds
     fail closed on activation/validation (STEP 76 §J.2).
2. **Verify after applying** with read-only evidence, in this order:
   - PostgREST with the publishable key → `fetch_license_by_key` must return **403**, not 200;
   - run `step49_readonly_production_audit.sql` in the dashboard SQL Editor (19 SELECT-only checks:
     RLS flags, policies, grants, function attributes) and archive the output;
   - `GET /api/license/status` with 6 unknown keys → 6th must be **429** `RATE_LIMITED` with
     `Retry-After`;
   - `POST /api/admin/licenses/<key>/revoke` with a real admin session → 200/404, never 404-route.
3. **Track the migration in git** (commit only when explicitly authorized) and refresh the stale
   assertions in `step46c` G2 / `step53` migration-tracking so the full gate covers them.
4. Optional hygiene: rotate the previously bundled publishable key (git history + released
   installers), and move the invalid-key budget to Redis if the API ever runs multi-instance.

---

## STOP

STEP 77 complete: read-only verification performed, `STEP77_FINAL_REPORT.md` written, git state
byte-identical to the BEFORE state (apart from this explicitly requested report file), no production
change, no migration applied, no commit/push. **STOP — no STEP 78.**
