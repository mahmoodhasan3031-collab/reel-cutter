# STEP 49B — Supabase License Security & Production Security Re-Audit (Final Report)

**Date:** 2026-09-26
**Projects audited:**
- `reel-cutter` (Electron app + Next.js website + Node license/payment server + Supabase local stack)
- `postify` (STEP 49 original areas: backend API + Chrome extension)

**VERDICT: PASS** — with one documented pre-existing, unrelated test failure (point 27) and five documented, non-exploitable observations (point 28).

No schema changes, no new migrations, and no RLS/Step-16A weakening were made during this audit. The only production-code change in this step is a log-privacy fix (point 24).

---

## 1. Scope and method
Live Supabase container (`supabase_db_reel-cutter`, PostgreSQL 17.6) was probed directly as `postgres`, `anon`, `authenticated` and `service_role`. Static scans covered migrations, server, Electron client, website, build outputs and the postify backend/extension. All required commands were executed (verification log, end of report).

## 2. Migration chain integrity — CLEAN
- `supabase db reset` → all **8** migrations applied in order, containers restarted, no errors.
- `supabase migration list --local` → 8 entries, files and local DB in agreement (no missing/unapplied rows).
- `supabase db diff --local` → **“No schema changes found”** (zero drift).
- Project is **not linked** to a remote (`supabase/.temp/project-id` absent); nothing was pushed anywhere.

## 3. New migration `20260928000000_add_subscription_columns_to_licenses.sql` — SAFE
Adds 9 nullable/defaulted columns (`stripe_subscription_id`, `stripe_customer_id`, `subscription_status`, `current_period_start/end`, `cancel_at_period_end`, `canceled_at`, `plan_interval`, `activated_at`) plus one partial index, with an in-file verification block. It touches **no** policy, grant, trigger or RPC; Step 16A semantics and RPC output are unchanged (verified post-reset, points 6–9). New columns are unreachable to `anon` (no table-level DML) and, for `authenticated`, visible only through the `user_id = auth.uid()` row filter.

## 4. `licenses` schema — matches application expectations
25 columns, 5 constraints (PK, UNIQUE `license_key`, 3 CHECKs), 10 indexes (incl. unique partial `transaction_id`, new partial `stripe_subscription_id`). `status` CHECK remains `active|revoked`; the app writes subscription lifecycle to `subscription_status`, not `status` (`server/routes/webhook.js:267`), so no CHECK violation exists.

## 5. RLS and policies on `licenses` — correct
`rowsecurity = t`; exactly two policies:
- `Allow service role full access` → `service_role` / ALL.
- `Authenticated users can read own licenses` → `authenticated` / SELECT, `USING (user_id = auth.uid())`.
No INSERT/UPDATE/DELETE policy for `authenticated` (attempts return `UPDATE 0` / `DELETE 0`, i.e. row-invisible), no policy for `anon`.

## 6. Table-level privileges per role — Step 16A intact
- `anon`: `REFERENCES,TRIGGER,TRUNCATE` only — **all four DML verbs revoked** (re-verified: SELECT/INSERT/UPDATE/DELETE each fail with `permission denied for table licenses`).
- `authenticated`: full DML, gated by RLS (own rows only; `user_id IS NULL` rows invisible).
- `service_role` / `postgres`: full.
Migrations contain **only** `GRANT EXECUTE ON FUNCTION` — no table DML was ever granted.

## 7. Column-level grants — sensitive columns shielded
`anon` holds only `REFERENCES` on every column (all column `SELECT`s revoked). `authenticated`/`service_role` retain column `SELECT`, but row visibility for `authenticated` is restricted to the caller’s own rows.

## 8. SECURITY DEFINER / search_path audit — CLEAN (DB-wide)
Only two SECURITY DEFINER functions exist in `public` (plus Supabase’s own `pgbouncer`/`vault`/`supabase_functions`, all with fixed/empty search_path): `fetch_license_by_key`, `bind_license_hwid` — both `prosecdef = t` with `proconfig = {search_path=public}`. **S7: 0 SECURITY DEFINER functions without a fixed search_path.** `public` schema has `CREATE = f` for `anon` and `authenticated`, so search-path hijacking by an unprivileged role is impossible. Function bodies contain no `SELECT *`, no `EXECUTE`/`format`/dynamic SQL (S14).

## 9. RPC output whitelist — no sensitive columns exposed
Both RPCs return exactly 7 columns: `id, license_key, hwid, tier, status, created_at, updated_at`. `customer_email`, `transaction_id`, `payment_provider`, `email_*`, `user_id` and all `stripe_*`/subscription columns are absent (S13 + point-28 test C4). Test T10 confirms `customer_email` does not exist in the result type.

## 10. RPC malicious-input battery — all 22 checks pass
Nonexistent / NULL / empty / whitespace keys → 0 rows, no error, no internal detail. Whitespace+case normalization works. SQL-injection payloads via `fetch` and `bind` → 0 rows (parameterised). 100 000-char and malformed-UUID keys → 0 rows, no crash. Error responses reveal nothing beyond “not found”.

## 11. HWID binding semantics — anti-overwrite enforced
First bind succeeds; a second bind with a different HWID does **not** overwrite; an already-bound license cannot be rebound; same-HWID re-bind is a safe no-op; nonexistent key → 0 rows; `updated_at` trigger fires (T21). Design notes (fail-safe): binding `NULL` hwid is a no-op, and an *unbound* revoked license can be bound at RPC level — the client blocks both paths before binding (`licenseManager.js` checks `status === 'revoked'` and `data.hwid` first).

## 12. Anonymous direct table access — fully denied
`anon` SELECT/INSERT/UPDATE/DELETE on `licenses` → `permission denied`; behaviour check D confirms the same; the only reachable anonymous surface is the two RPCs.

## 13. `anon` TRUNCATE / REFERENCES / TRIGGER — document-only (not exploitable)
Supabase’s default ACL (`arwdDxtm`) leaves `TRUNCATE` with `anon`, and RLS does not apply to TRUNCATE. It is **not** exploitable: (a) `manual_payments.license_id → licenses(id)` FK blocks truncation (`ERROR: cannot truncate a table referenced in a foreign key constraint`, verified live), (b) PostgREST exposes no TRUNCATE verb, (c) the anon key is a JWT for PostgREST — a direct PG connection needs the database password. Per audit instructions this is documented, **not** modified.

## 14. `handle_updated_at()` — safe as-is
Not SECURITY DEFINER (`prosecdef = f`), body uses only pg_catalog built-ins, and PostgreSQL rejects direct invocation (`ERROR: trigger functions can only be called as triggers`, verified live). Its missing explicit `search_path` is therefore harmless; left untouched per instructions.

## 15. `manual_payments` — correct isolation
RLS enabled; policies: `service_role` ALL, `authenticated` INSERT/SELECT “own”, **no UPDATE/DELETE policy**; `anon` has all four DML verbs revoked (only `REFERENCES,TRIGGER,TRUNCATE`). FK to `licenses(id)` present; unique `(payment_method, transaction_id)` constraint prevents duplicate submissions; `updated_at` trigger present.

## 16. Authenticated payment policies reference `auth.users` — fail-closed observation (documented, not fixed)
Both `authenticated` policies subquery `auth.users`, to which `authenticated` has no grant in this stack (grants exist only for `postgres`). Evaluation therefore raises `permission denied for table users` — i.e. the policies **fail closed** (deny with an error), they never leak or permit anything. Verified impact: **zero** — no code in `src/`, `website/src/` (or the extension) performs `.from('manual_payments')` / `.from('audit_log')` / `.from('licenses')`; the payment flow goes through the server routes which use `service_role` (point 23). Not fixed because changing policies is a schema change with no security benefit.

## 17. `audit_log` — locked to service_role
RLS enabled, single `service_role` policy, and **all** DML privileges revoked from both `anon` **and** `authenticated` (privilege-level deny, `has_table_privilege = f` for all four verbs). Verified: authenticated INSERT → permission denied.

## 18. Electron client — anon key only, RPC only
`src/main/license/supabaseClient.js` reads `__SUPABASE_ANON_KEY__`/`process.env.SUPABASE_ANON_KEY` only; no `SUPABASE_SERVICE_ROLE_KEY` reference; only `.rpc('fetch_license_by_key')` and `.rpc('bind_license_hwid')` — no `.from()` table access; mock-DB fallback is disabled whenever `app.isPackaged` (activation/verification fall back to “internet required”). `licenseManager` additionally enforces revoked-status and HWID checks before binding.

## 19. Preload surface — IPC only
`src/preload/index.js` exposes seven `license:*` invoke channels; no `createClient`, no service-role token, no table/RPC passthrough.

## 20. Build-time credential injection — anon only
`electron.vite.config.mjs` defines `__SUPABASE_URL__` + `__SUPABASE_ANON_KEY__` (publishable `sb_publishable_…`) in the **main** process only; the string `SERVICE_ROLE` does not appear in the build config.

## 21. Bundle scans — clean
- `reel-cutter/out/` — no JWT (`eyJhbGciOi`), no `sb_secret_`, no `SUPABASE_SERVICE_ROLE_KEY`, no `sk_live_`/real `whsec_`; the only secret-pattern hits are the client’s own **log-sanitizer regexes** (redaction rules, not secrets); exactly one publishable anon key (expected).
- `website/.next/static` — clean.
- `postify/extension/dist` — clean.

## 22. Server secret management — env-only, fail-fast, never tracked
`server/config.js` reads `SUPABASE_SERVICE_ROLE_KEY`/Stripe/Resend/admin credentials exclusively from environment variables; production start **throws** when `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` are missing; admin auth uses a scrypt hash + env session secret (no hardcoded password). `server/.env` is git-ignored (`server/.gitignore:2`), `git ls-files server/.env` is empty, only `.env.example` (placeholders) is tracked; `render.yaml` lists secrets as dashboard-only.

## 23. Server request-path security — verified
CORS: explicit origin allow-list from `CORS_ALLOWED_ORIGINS`, no wildcard, OPTIONS handled. Stripe webhook signature verification enforced (K5/K6 pass). Rate limiters on activate/validate/status/upload/manual-payment/admin routes; input validators (`validateLicenseKey`, `validateHwid`, `stripUnknownFields`, method allow-lists) on all license routes; admin endpoints behind `authenticateAdmin` with no anonymous access (step19 I1). No stack traces / SQL errors in client responses (step17 H1–H4).

## 24. Logging privacy — **defect found and fixed**
`server/routes/webhook.js:142` logged a full plaintext license key on duplicate webhooks. Fixed by adding `maskLicenseKey()` and masking the value (`PRO-****`); no test asserted the old string. Re-scanned: no `console.*` in `server/` interpolates a raw license key; Electron/website sources never log HWID or license-key values (only `err.message`); the client logger already redacts `sk_`/`whsec_`/`re_`/Bearer/Authorization patterns.

## 25. Storage & role posture — correct
Private bucket `payment-proofs` exists (`public = f`, created manually per migration note). `anon`, `authenticated`, `service_role` are all non-superusers. DB-level `search_path` is the Supabase default `"$user", public, extensions`.

## 26. STEP 49 (postify) audit areas — all pass
`backend\run_tests.ps1` → **37 files, 10 852 passed, 0 failed**. Coverage cited: `test_auth_security.py`, `test_auth.py`, `test_auth_api.py` (auth, session, CSV/export privacy), `test_credit_security.py`, `test_rate_limit_security.py` (rate limiting), `test_api.py` (CORS/security headers), `test_logging_observability.py`, `test_production_configuration.py`, `test_production_fixture_isolation.py` (fixture isolation — real DBs untouched), `test_ai.py` (AI handling). `backend/api/dependencies.py` explicitly ignores spoofable `X-Account-ID` (header is never trusted; spoofing covered by tests). Postify contains zero Supabase/service-role/RLS references, and no `.env` with secrets (only `backend/.env.example`).

## 27. Test matrix
| Suite | Result |
|---|---|
| postify `run_tests.ps1` | **10 852 / 10 852 PASS** (37 files) |
| postify extension `npm test` | **1 026 / 1 026 PASS** |
| postify extension `npm run build` | PASS (tsc + vite) |
| reel-cutter `npm test` (all suites, incl. new STEP 49B) | **ALL PASS** (16A 34/34, 17-sec 44/44, 18-sec 46/46, security-audit 22/22, 19 71/71, 26 25/25, 32E 39/39, **49B 15/15**) |
| reel-cutter `step30-test-infrastructure` | 42 / 42 PASS |
| reel-cutter `step16-manual-payment-migration` | 68 / 68 PASS |
| reel-cutter `step35c-webhook-checkout-fix` | 21 / 21 PASS |
| reel-cutter `step28-production-readiness` | **62 / 63** — I1 fails: pre-existing brittle `indexOf` source-order assertion on `markEventProcessed` vs `await createLicense` in `webhook.js`; unchanged vs HEAD, unrelated to this audit, not modified |
| DB `verify_schema.sql` / `verify_behavior.sql` / `sec_audit_db.sql` / `sec_rpc_tests.sql` | all assertions pass (points 4–17) |
| postify SQLite DBs | `postify.db` 2026-09-20 15:30:43Z, `client_hunter.db` 2026-09-22 07:57:33Z — **mtimes identical before and after all runs** (no writes) |

## 28. Known limitations & final verdict
Documented, non-exploitable (no action taken): (a) `manual_payments` authenticated policies fail closed on `auth.users` (point 16); (b) `anon` retains default TRUNCATE/REFERENCES/TRIGGER privileges — blocked by FK/PostgREST (point 13); (c) RPC `EXECUTE` granted to `PUBLIC` (required for the anon client; safe: fixed 7-column output + pinned search_path); (d) `supabase/seed.sql` missing (CLI WARN — fresh DB starts with an empty `licenses` table; `supabase/supabase-schema.sql` still contains the known `NOT NOT NULL` typo and is **not** applied — `schema_paths = []`); (e) pre-existing step28 I1 failure (point 27).

**Final verdict: PASS.** Migration chain applies cleanly from scratch with zero schema drift, Step 16A isolation and RLS semantics are fully intact, no service-role material exists in any client, bundle or committed file, no sensitive column is reachable by `anon`/`authenticated` outside the 7-column RPC whitelist, and every required verification suite passes except the one documented pre-existing assertion.

---

### Commands executed (verification log)
```
supabase db reset                          → 8 migrations applied (WARN: no supabase/seed.sql)
supabase migration list --local            → 8/8 consistent
supabase db diff --local                   → No schema changes found
psql verify_schema.sql                     → pass (25 cols, 2 policies, 3 functions, grants)
psql verify_behavior.sql                   → pass (anon RPC ok, first-bind ok, no-rebind, SELECT denied)
psql sec_audit_db.sql                      → pass (S1–S17; S7 = 0 definer w/o search_path)
psql sec_rpc_tests.sql                     → pass (T1–T22)
node test/runAllTests.js (npm test)        → all suites pass (incl. new step49b 15/15)
node test/step49b-security-audit.test.js   → 15/15 pass, exit 0
node test/step30-test-infrastructure.test.js      → 42/42
node test/step16-manual-payment-migration.test.js → 68/68
node test/step35c-webhook-checkout-fix.test.js    → 21/21
node test/step28-production-readiness.test.js     → 62/63 (pre-existing I1)
backend\run_tests.ps1                      → 10852/10852 (37 files)
extension npm test / npm run build         → 1026/1026 / build OK
```

### Files changed in this step
- `server/routes/webhook.js` — masked license key in duplicate-webhook log (`maskLicenseKey`)  [defect fix, point 24]
- `test/step49b-security-audit.test.js` — **new** focused security test suite (15 checks)  [new tests]
- `test/runAllTests.js` — registered `step49b-security-audit.test.js` in the security block

*No migration, RLS policy, grant, RPC, schema or postify file was modified.*
