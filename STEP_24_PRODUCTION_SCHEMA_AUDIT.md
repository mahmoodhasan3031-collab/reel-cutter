# STEP 24 — Production Readiness Schema Audit (READ-ONLY)

**Date:** 2026-09-26
**Target:** `https://pyrtitvvwxrwhmdfrjsb.supabase.co` (from `server/.env`, host verified before any request)
**Mode:** Strictly read-only. HTTP methods used: `GET` and `HEAD` only.
**Outcome:** `PRODUCTION WRITES PERFORMED: 0`

---

## 0. Inspection method and its limits

No SQL credentials exist anywhere in this repository or environment:

| Candidate read-only SQL path | Result |
|---|---|
| `server/.env` DB/POSTGRES/DB_URL/PG* keys | none (14 keys, all app/API keys) |
| root `.env`, `website/.env`, `website/.env.local` | absent |
| `~/.supabase/access-token` | absent |
| `SUPABASE_ACCESS_TOKEN` / `DATABASE_URL` env vars | absent |
| Supabase CLI project link | not linked |
| PostgREST `pg_catalog` probe | `PGRST205` — not exposed |
| PostgREST `information_schema` probe | `PGRST205` — not exposed |

Therefore the audit used the **PostgREST OpenAPI document (`GET /rest/v1/`)**, **per-column existence probes** (`GET /rest/v1/licenses?select=<col>&id=eq.000…000` — returns an empty result set, never data), **row-count probes** (`HEAD` + `Prefer: count=exact` — headers only, no body), **table probes**, and the **Storage bucket API**. All error probes used a non-existent UUID/row so no production row content was ever returned or printed.

**Consequently not inspectable read-only (stated explicitly rather than guessed):**

- PK / UNIQUE / CHECK constraints and indexes on production `licenses`
- `pg_class.relrowsecurity` flag and `pg_policies` definitions
- `SECURITY DEFINER`, `SET search_path` and `GRANT`/`REVOKE` on RPCs (partially inferred behaviourally — see §C)
- `updated_at` trigger / `handle_updated_at()` presence
- migration history table (`supabase_migrations` is not in the exposed schema)

---

## A. Production schema — `public.licenses`

Source: PostgREST OpenAPI (Swagger 2.0) + 24 explicit per-column probes.

**24 columns** exposed. Local DB has **25** — the single delta is `activated_at`.

| # | column | type | NOT NULL (OpenAPI `required`) |
|---|---|---|---|
| 1 | `id` | uuid | YES (PK expected) |
| 2 | `license_key` | text | YES |
| 3 | `customer_email` | text | no |
| 4 | `transaction_id` | text | no |
| 5 | `payment_provider` | text | no |
| 6 | `email_status` | text | YES |
| 7 | `email_sent_at` | timestamptz | no |
| 8 | `email_error` | text | no |
| 9 | `email_attempts` | integer | YES |
| 10 | `email_last_attempt_at` | timestamptz | no |
| 11 | `hwid` | text | no |
| 12 | `tier` | text | YES |
| 13 | `status` | text | YES |
| 14 | `user_id` | uuid | no |
| 15 | `created_at` | timestamptz | YES |
| 16 | `updated_at` | timestamptz | YES |
| 17 | `stripe_subscription_id` | text | no |
| 18 | `stripe_customer_id` | text | no |
| 19 | `subscription_status` | text | no |
| 20 | `current_period_start` | timestamptz | no |
| 21 | `current_period_end` | timestamptz | no |
| 22 | `cancel_at_period_end` | boolean | YES |
| 23 | `canceled_at` | timestamptz | no |
| 24 | `plan_interval` | text | YES |

**Subscription-column probe results (the STEP 23 open question — now answered):**

| column | production |
|---|---|
| `stripe_subscription_id` | **PRESENT** |
| `stripe_customer_id` | **PRESENT** |
| `subscription_status` | **PRESENT** |
| `current_period_start` | **PRESENT** |
| `current_period_end` | **PRESENT** |
| `cancel_at_period_end` | **PRESENT** |
| `canceled_at` | **PRESENT** |
| `plan_interval` | **PRESENT** |
| `activated_at` | **ABSENT** (`42703: column licenses.activated_at does not exist`) |

So the STEP 32E concern is confirmed and partly closed: **all 8 subscription columns were shipped to production out-of-band** (commit `d11eb84` shipped code with no SQL, but the columns exist). The only schema gap is `activated_at`.

**RLS / privilege behaviour (inference only):**

| caller | direct read of `licenses` |
|---|---|
| `service_role` | HTTP 200, 6 rows visible |
| `anon` | **HTTP 401** — SELECT privilege explicitly revoked |

`anon = 401` proves the privilege-level isolation from `20260916000000`, but **does not by itself prove `relrowsecurity = true`** (a revoked grant produces 401 whether or not RLS is on). The RLS flag and policy list remain unverified. Local reference state for comparison: `rls=true`, policies `Allow service role full access (ALL, USING true)` and `Authenticated users can read own licenses (SELECT, user_id = auth.uid())`.

---

## B. Safe license metadata (counts only — no keys, HWIDs or emails printed)

| metric | value |
|---|---|
| total rows | **6** |
| `status = active` | 5 |
| `status = revoked` | 1 |
| status outside (active, revoked) | 0 |
| `license_key IS NOT NULL` | 6 |
| `license_key IS NULL` | 0 |
| `hwid IS NOT NULL` (bound) | 1 |
| `hwid IS NULL` (unbound) | 5 |
| `customer_email IS NOT NULL` | 2 |
| `transaction_id IS NOT NULL` | 2 |
| `created_at IS NOT NULL` | 6 |

**Integrity:** first read = 6 rows, final read after the whole audit = `content-range: 0-5/6` → **6 rows, unchanged**.

---

## C. RPC audit

Exposed RPC endpoints in production: `fetch_license_by_key`, `bind_license_hwid`, **`rls_auto_enable`**.

| RPC | present | advertised methods | parameters |
|---|---|---|---|
| `fetch_license_by_key` | YES | `POST` only (OpenAPI) | `p_license_key: string (required)` |
| `bind_license_hwid` | YES | `POST` only (VOLATILE) | `p_license_key: string (required)`, `p_hwid: string (required)` |
| `rls_auto_enable` | YES | — | — |

- **`fetch_license_by_key` — executed read-only** with a non-existent key (`__STEP24_AUDIT_NONEXISTENT__`, zero rows matched): `200`, **0 rows** for *both* `service_role` **and** `anon`. Because `anon` cannot `SELECT` from `licenses` (401 above) yet the function succeeded for `anon`, the function **must run with elevated (definer) rights** — a behavioural confirmation of `SECURITY DEFINER` that would be impossible otherwise.
  - Observation: OpenAPI advertises `POST` only, yet `GET /rest/v1/rpc/fetch_license_by_key?...` was accepted (`200`). Reported as observed; not a defect (function is read-only and returned 0 rows).
- **`bind_license_hwid` — NOT EXECUTED.** It is a write-producing RPC. Existence and signature come from the PostgREST schema cache only. Its `SECURITY DEFINER` status, `search_path` and `EXECUTE` grants are **not read-only inspectable**. Local reference definition (`provolatile=v`, `prosecdef=true`, `proconfig={search_path=public}`, args `p_license_key text, p_hwid text`, returns 7-column table).
- **`rls_auto_enable` — unexplained.** Not present in the local database (local public functions are exactly `bind_license_hwid`, `fetch_license_by_key`, `handle_updated_at`) and **no occurrence anywhere in this repository** (searched `server/`, `website/`, `src/`, `test/`, `supabase/`, `docs/`, `scripts/`, root files). **Not executed** — it may mutate state.

---

## D. Intentionally non-production objects

| object | production | expected |
|---|---|---|
| `public.manual_payments` | **ABSENT** (`PGRST205`) + absent from OpenAPI definitions | absent |
| `public.audit_log` | **ABSENT** (`PGRST205`) + absent from OpenAPI definitions | absent |

Confirmed by two independent signals (table probe + OpenAPI definition list). Only **one** table is exposed in production: `licenses`.

---

## E. Storage

| check | result |
|---|---|
| `GET /storage/v1/bucket` (service_role) | `200`, **0 buckets** |
| `GET /storage/v1/bucket` (anon) | `200`, **0 buckets** |
| `GET /storage/v1/bucket/payment-proofs` | `400 Bucket not found` |

**`payment-proofs` bucket is ABSENT** (as expected for the undeployed manual-payment flow). No storage object was created, read or deleted.

---

## F. Migration compatibility review (repo → production)

| migration | git | lines | style | required in production? | additive-safe? |
|---|---|---|---|---|---|
| `20260915000000_create_licenses_table.sql` | **UNTRACKED** | 159 | 12× `IF NOT EXISTS`, 1× `CREATE OR REPLACE`, **0 INSERT, 0 DROP** | **No** — table already exists; would no-op | Yes (fully guarded) |
| `20260916000000_isolate_client_service_role.sql` | tracked | 130 | 2× `CREATE OR REPLACE` + `REVOKE`/`GRANT` | No — both functions already exist in production | Yes (`CREATE OR REPLACE` is idempotent; preserves ACLs) |
| `20260927000000_fix_bind_license_hwid_ambiguity.sql` | **UNTRACKED** | 111 | 2× `CREATE OR REPLACE`, qualified `l.*` columns, verification `DO` block | Optional/defect-fix — current production body **cannot be read** to confirm the ambiguity defect | Yes — references no new columns (no `activated_at`), grants explicitly not re-issued |
| `20260928000000_add_subscription_columns_to_licenses.sql` | **UNTRACKED** | 95 | 9× `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, verification `DO` block | **Yes — required**, solely for `activated_at` (the 8 subscription columns already exist and will no-op) | Yes — no `DROP`, no backfill, `cancel_at_period_end boolean NOT NULL DEFAULT false` already satisfied in production |

**Notes**

- The earlier "baseline declares `v_errors`" finding was a **false positive from my probe regex**: `v_errors` is a `DO`-block local variable (line 122), not a column. Production actually contains **every** baseline column.
- Baseline intentionally omits `user_id` (owned by `20260924000000`); production **has** `user_id` → consistent with `20260924000000` having been applied.
- Lexicographic order puts `20260927` before `20260928`; neither depends on the other, so ordering is safe.
- **Untracked (loss risk):** `20260915000000`, `20260926000000`, `20260927000000`, `20260928000000`, plus `supabase/config.toml`, `supabase/.gitignore`, `supabase/supabase-schema.sql`. Only `20260916000000` (and `20260924000000`, `20260925000000`) of the reviewed set is tracked.

---

## G. Reference-schema drift

| file | licences columns declared | drift vs production |
|---|---|---|
| root `supabase-schema.sql` | 16 | **STALE** — missing all 8 subscription columns and `activated_at` |
| `supabase/supabase-schema.sql` | — | **STALE** — contains neither `stripe_subscription_id` nor `activated_at` |
| `supabase/supabase-schema.sql` `NOT NOT DEFAULT` defect | — | **not present at audit time** (string not found; clean) |

---

## H. Findings

### BLOCKER

1. **B1 — Manual-payment flow is live in code/UI but absent in production.** `server/index.js:48` mounts `/api/upload` and `:60` mounts `/api/manual-payment` unconditionally; the website ships `src/app/payment/manual/ManualPaymentForm.tsx` and `src/app/payment/status/[id]/PaymentStatusClient.tsx` with **no feature flag** in `src/config/manualPayment.ts`. Production lacks `manual_payments` (`server/routes/manualPayment.js:276` inserts into it → 500 at `:287`), lacks the `payment-proofs` bucket (`server/routes/upload.js:11`), and lacks `audit_log` (`server/services/auditLog.js:100`).
2. **B2 — Admin console is disabled in production.** `server/.env` has **no** `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET`; `server/services/adminAuth.js:36` requires all three, so `server/routes/admin.js:148/155` answer **503 `SERVICE_UNAVAILABLE`**. Consequence: no admin login, no manual-payment review, no admin-side license issuance/approval in production.
3. **B3 — Unknown `public.rls_auto_enable` RPC exists in production** but exists in neither the local DB nor any file in this repository. Definition unreadable read-only; not invoked. Must be identified/dropped at SQL level before sign-off.

### MAJOR

4. **M1 — `public.licenses.activated_at` is missing in production** while app code reads it: `server/routes/license.js:187`, `server/services/licenseService.js:112,154,214,264,289,379,402,432`. Effect: dashboard omits the `activated_at` key (local returns `null`) and `activateLicense` falls back to `new Date().toISOString()` — an API response-shape/behaviour divergence, not a crash. The insert path (`server/services/licenseGenerator.js:82-107`) does **not** write `activated_at`, so license creation still succeeds. **Fix: apply `20260928000000`.**
5. **M2 — Reference schemas are stale.** Root `supabase-schema.sql` and `supabase/supabase-schema.sql` both omit all 8 subscription columns and `activated_at`.
6. **M3 — Three of the four audited migrations are untracked** (`20260915000000`, `20260927000000`, `20260928000000`), together with `20260926000000` and `supabase/config.toml`. The untracked set is much larger than migrations: `server/routes/{admin,manualPayment,upload}.js`, `server/services/{adminAuth,auditLog,paymentReviewService}.js`, `website/src/app/{admin,payment}/`, `website/src/config/manualPayment.*`, `website/src/lib/adminApi.ts`, `website/src/lib/adminSession.ts` and several STEP test files are all `??` (untracked), while 8 tracked files carry uncommitted modifications.

### MINOR / INFO

7. **I1 — RLS flag, policies, constraints and RPC security attributes are unverifiable** with the credentials available (no DB password, no access token, PostgREST exposes only `public`). Recorded as *unverified*, not as *assumed correct*.
8. **I2 — Local vs production RPC definition drift unknown.** Local: `prosecdef=true`, `proconfig={search_path=public}` for both RPCs. Production signatures match; bodies/attributes unread.
9. **I3 — `manual_payments`/`audit_log`/`payment-proofs` absence matches the documented decision** that they are not deployed — but that decision is inconsistent with B1 (the routes and UI are shipped).

### Verified PASS

- Anon direct read of `licenses` → HTTP 401 (privilege isolation intact).
- `fetch_license_by_key` exists and executes read-only for a non-existent key (0 rows) for both roles; definer-rights behaviour confirmed.
- `payment-proofs` bucket absent as expected; production has **zero** buckets.
- `manual_payments` / `audit_log` absent as expected (double-confirmed).
- All 8 subscription columns present in production — the STEP 23 "out-of-band columns" risk is resolved in production's favour.
- Existing production license data intact: 6 rows before and after the audit; 5 active / 1 revoked; 1 bound / 5 unbound.

---

## I. Read-only tests executed (no production interaction)

| suite | result |
|---|---|
| `test/step16-manual-payment-migration.test.js` | **68 / 68 pass** |
| `test/step16a-security.test.js` | **34 / 34 pass** |
| `test/step17-security.test.js` | **44 / 44 pass** |
| `test/step18-security.test.js` | **46 / 46 pass** |
| `test/step23-pricing-purchase.test.js` | **38 / 38 pass** |

Local Supabase was queried with **read-only** `psql` `SELECT`s only (`pg_class`, `pg_proc`, `pg_constraint`, `pg_indexes`, `pg_policies`, `information_schema.columns`); it was not started, restarted, migrated or written to during this step.

---

## Readiness verdict

**NOT PRODUCTION-READY.** 3 blocking issues (B1 live-but-absent manual payment flow, B2 admin console disabled, B3 unknown `rls_auto_enable` RPC) and 3 major issues (M1 missing `activated_at`, M2 stale reference schemas, M3 untracked migrations).

**Answers to the STEP 24 questions**

- **F3** — Is `20260928000000` needed in production? **Yes**, for `activated_at` only; the 8 subscription columns already exist and will no-op.
- **F4** — Is it additive-safe? **Yes** — `ADD COLUMN IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS`, no `DROP`, no backfill.
- **F2** — Is production's `bind_license_hwid` compatible with the repo fix? **Cannot be determined read-only**; requires an SQL-capable read of `pg_proc.prosrc` in STEP 25+.

---

## Safety confirmation

```
HTTP requests with method other than GET/HEAD : 0
bind_license_hwid executed                    : NO
Files modified (application/schema/env)      : 0
Migrations applied (local or production)      : 0
Database rows created/updated/deleted         : 0
Storage buckets/objects changed               : 0
Secrets printed                               : 0
Production license rows before / after audit  : 6 / 6 (unchanged)
```

**PRODUCTION WRITES PERFORMED: 0**

*(Only file written by this step is this report itself.)*
