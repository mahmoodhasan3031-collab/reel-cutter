# STEP 76 — License Entitlement Hardening: Final Report

## A. Summary & Verdict

**Verdict: PASS — all six STEP 75 license-delivery-boundary findings are CLOSED.**

STEP 76 hardened the license entitlement boundary between the Electron client, the backend API, and the Supabase database:

| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| M-1 | Medium | Subscription entitlement not enforced (7-column RPC; webhook never updates `status`; client checked only `status === 'revoked'`) | **CLOSED** |
| M-2 | Medium | Legacy HWID-keyed HMAC signature accepted and transparently upgraded | **CLOSED** |
| L-1 | Low | `EXECUTE` on client license RPCs granted to `anon`; client embedded a Supabase key | **CLOSED** |
| L-2 | Low | `bind_license_hwid` result ignored — lost bind races reported as success | **CLOSED** |
| L-3 | Low | No admin revoke / HWID-reset operation | **CLOSED** |
| L-4 | Low | `invalidKeyLimiter` defined but never used | **CLOSED** |

Full regression: **69/69 registered test suites pass (`runAllTests.js` exit code 0)**, including the baseline 269/269 across the seven directly-affected suites plus the new 36/36 STEP 76 suite (305 assertions in those eight suites).

Constraints honored: no `.env` files touched, no production server/database mutation or restart, no package installs, no commit/push, no resets/reverts of prior STEP 71–75 work.

---

## B. Scope

- Repository: `C:\Users\Mahmood_Hasan\Desktop\llm model\reel-cutter` (HEAD `ed65970`, unchanged).
- In scope: license service, license routes, admin routes, rate limiter, Electron license modules, build config, one new SQL migration, tests.
- Out of scope (unchanged by design): Stripe webhook policy logic (already correct in JS), `checkSubscriptionValidity` policy rules, dashboard/`/status` response shape (step25 contract), website.

---

## C. Per-Finding Detail & Evidence

### M-1 — Subscription entitlement enforced — CLOSED

*Root cause:* `fetch_license_by_key` returned 7 columns with no subscription fields, so `checkSubscriptionValidity` never ran in production; the Stripe webhook updates `subscription_status`/`current_period_end`/`cancel_at_period_end`, never `status`. The Electron client additionally only rejected `status === 'revoked'`.

*Fix:*
1. Migration returns the 3 entitlement columns (10 total, no `stripe_subscription_id` / `stripe_customer_id` / `customer_email`) — `supabase/migrations/20261002000000_step76_license_entitlement_hardening.sql:32-62`.
2. New `computeIsActive(record)` derives the authoritative entitlement flag: one-time licenses use `status`, subscription records use `checkSubscriptionValidity` — `server/services/licenseService.js:115-121`. Exposed as `isActive` (plus `subscriptionStatus`, `currentPeriodEnd`, `cancelAtPeriodEnd`) on the read-only status route — `server/services/licenseService.js:352-368`.
3. In-memory lookup returns the identical 10-column shape (test/prod parity, no payment metadata) — `server/services/licenseService.js:152-163`.
4. Electron `validateStartup` sends the device HWID (authoritative `POST /api/license/validate`) and denies when `data.isActive === false` with reason `SUBSCRIPTION_INACTIVE` / `LICENSE_INACTIVE`; server error codes `SUBSCRIPTION_INACTIVE`/`LICENSE_INACTIVE` are also mapped — `src/main/license/licenseManager.js:88`, `src/main/license/licenseManager.js:153-195`.
5. Activation is a single authoritative `POST /api/license/activate` call (server checks subscription before binding) — `src/main/license/licenseManager.js:237-266`.

*Evidence:* step76 A1–A7 (`test/step76-entitlement-hardening.test.js`), step32e 39/39, step25 57/57.

### M-2 — Legacy signature scheme removed — CLOSED

*Root cause:* `computeSignatureLegacy` HMACed with the raw HWID as key; `loadLicenseData` accepted it and re-saved under the new scheme, so any same-user process that can derive the machine ID could forge a trusted payload.

*Fix:* function removed, single-scheme verification in `loadLicenseData`, export removed — `src/main/license/store.js` (signature section), `src/main/license/store.js:373-380` exports.

*Evidence:* step18 A4/A6/A7/A8 rewritten (A8 builds a byte-exact legacy-signed file and requires rejection + no upgrade write); step76 B1–B3. Clock/grace protections were already proven by license tests 11/12 — not regressed.

### L-1 — Anon EXECUTE revoked; API-only client — CLOSED

*Fix:*
1. `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated` + `GRANT … TO service_role` for both RPCs, `SET search_path = public` pinned — migration lines 64-68, 128-132.
2. Electron no longer imports `@supabase/supabase-js` anywhere under `src/main`; transport is plain `fetch` against the backend (`GET /api/license/status`, `POST /api/license/validate`, `POST /api/license/activate`) with a 10s timeout — `src/main/license/supabaseClient.js:138-158`.
3. No Supabase credential — not even the publishable anon key — is bundled: `electron.vite.config.mjs` now injects `__API_BASE_URL__` (default `https://reel-cutter.onrender.com`, overridable via `REEL_CUTTER_API_URL`); the previous `__SUPABASE_URL__`/`__SUPABASE_ANON_KEY__` defines were removed.
4. Packaged-build fail-closed strings preserved ("License verification requires internet…", "License activation requires internet…").

*Evidence:* step16a A2/B1/B2/B5, step49b B1/D1, step76 C1–C4.

### L-2 — Bind result verified — CLOSED

*Fix:* `bindLicense` treats an empty RPC result as `LICENSE_BIND_FAILED` and a row whose `hwid` differs from the requested value as `HWID_MISMATCH`; `activateLicense` surfaces `ACTIVATION_FAILED`/`HWID_MISMATCH` instead of a blanket error — `server/services/licenseService.js:187-198`, `:250-264`. SQL side: format guard (`^[a-f0-9]{64}$`), `status='active' AND hwid IS NULL` guards, and the function returns a row only when `l.hwid = v_normalized_hwid` — migration lines 99-124.

*Evidence:* step76 D1–D5 (injected fake RPC client via `setSupabaseClientForTests`).

### L-3 — Admin revoke / reset-hwid — CLOSED

*Fix:* two new admin-only endpoints (both behind `requireAdmin` + `adminApiLimiter`, `POST`-only, strict body, format-validated path key):
- `POST /api/admin/licenses/:licenseKey/revoke` → `status='revoked'`, idempotent (`already_revoked`), never touches `hwid`/subscription columns — `server/routes/admin.js:387-430`.
- `POST /api/admin/licenses/:licenseKey/reset-hwid` → clears `hwid` only (`had_hwid`/`already_unbound`), idempotent — `server/routes/admin.js:439-483`.
- Service layer: `revokeLicenseKey` / `resetLicenseHwid` with service-role `.update().eq().select()` and in-memory fallback across both stores — `server/services/licenseService.js:546-627`.
- Every call writes an audit record (`license_revoked` / `license_hwid_reset`; `target_id` null since it is a UUID column — key carried in sanitized `metadata.license_key`) — `server/routes/admin.js:409-419`, `:461-471`.

*Evidence:* step76 E1–E10, including a full HTTP recovery flow (device B blocked → admin reset → B activates → admin revoke → B locked out) and audit-content assertions.

### L-4 — Strict invalid-key rate limiting — CLOSED

*Fix:* `invalidKeyGuard` counts only requests that actually ended in `LICENSE_INVALID` (404) against a dedicated 5/min per-IP budget, shared across `/activate`, `/validate`, `/status`; it answers 429 itself (`RATE_LIMITED` + `Retry-After`) — `server/middleware/rateLimiter.js:124-133`, wiring at `server/routes/license.js:54`, `:98`, `:135`. Format-invalid keys (400) and valid keys never consume the budget.

*Evidence:* step76 F1–F4 (6th unknown key → 429; malformed key not counted; budget shared across endpoints; valid keys still resolve while budget is exhausted).

---

## D. Architecture After STEP 76

```
Electron client                      Backend (Express)                 Supabase
─────────────────                    ─────────────────                 ────────
supabaseClient.js (fetch only,       /api/license/activate ─┐
 no Supabase SDK, no keys)           /api/license/validate ─┼─ licenseService ─ service-role client
   GET  /api/license/status          /api/license/status  ─┘        │
   POST /api/license/validate        /api/admin/licenses/:key/revoke  ├─ fetch_license_by_key (10 cols)
   POST /api/license/activate        /api/admin/licenses/:key/reset-hwid └─ bind_license_hwid (guarded)
                                              │
                                        audit_log (per mutation)

DB roles: EXECUTE on both RPCs → service_role ONLY (anon/authenticated/PUBLIC revoked)
```

Entitlement policy stays in JS (`checkSubscriptionValidity`) so SQL and JS cannot drift; SQL only guarantees *which columns* are visible and *safe bind semantics*.

---

## E. Database Migration

New file: `supabase/migrations/20261002000000_step76_license_entitlement_hardening.sql` (untracked — created this step, not committed).

1. `fetch_license_by_key` → 10 output columns (`+ subscription_status, current_period_end, cancel_at_period_end`); no payment metadata.
2. `bind_license_hwid` → input normalization + `^[a-f0-9]{64}$` format guard, `status='active' AND hwid IS NULL` update guard, returns a row only when bound to the *requested* HWID.
3. `REVOKE EXECUTE … FROM PUBLIC/anon/authenticated` + `GRANT … TO service_role` for both functions; `SET search_path = public` pinned on both.
4. Rows predating subscription columns keep `subscription_status IS NULL` → legacy `status` check (documented in the migration header).

**Deployment action (operator, not executed here):** apply this migration to the Supabase project. No production mutation was performed during STEP 76.

---

## F. Files Changed (this step)

Modified (12):
- `server/services/licenseService.js` — `computeIsActive`, `isActive` status field, L-2 bind verification, `revokeLicenseKey`/`resetLicenseHwid`, lazy client + test injection, 10-column in-memory lookup.
- `server/middleware/rateLimiter.js` — `consumeWindow`/`clientIp`/`applyLimitHeaders` refactor, `invalidKeyGuard`, 5/min invalid-key budget.
- `server/routes/license.js` — invalid-key guard wired on the three unknown-key paths.
- `server/routes/admin.js` — revoke + reset-hwid endpoints, audit writes, imports, endpoint doc header.
- `src/main/license/store.js` — legacy signature scheme removed (M-2), `encryptData` exported (test/tooling).
- `src/main/license/supabaseClient.js` — rewritten: backend HTTP transport, error classification, mock parity, `setMockLicense`.
- `src/main/license/licenseManager.js` — HWID-aware authoritative validation, `isActive` enforcement, activation error-code mapping.
- `electron.vite.config.mjs` — `__API_BASE_URL__` define added; Supabase defines removed.
- `test/runAllTests.js` — registered `step76-entitlement-hardening.test.js`.
- `test/step16a-security.test.js` — A2/B1/B2/B5 updated to the new (correct) architecture.
- `test/step49b-security-audit.test.js` — B1/D1 updated likewise.
- `test/step18-security.test.js` — A4 boundary fixed; A6/A7/A8 now assert legacy removal/rejection.

New (2):
- `supabase/migrations/20261002000000_step76_license_entitlement_hardening.sql`
- `test/step76-entitlement-hardening.test.js` (36 tests: A=M-1, B=M-2, C=L-1, D=L-2, E=L-3, F=L-4, G=migration guards)

---

## G. Test Results

| Suite | Result |
|---|---|
| license.test.js | 15/15 |
| step16a-security.test.js | 34/34 |
| step25-license-api.test.js | 57/57 |
| step27-license-delivery-dashboard.test.js | 63/63 |
| step32e-subscription-server.test.js | 39/39 |
| step49b-security-audit.test.js | 15/15 |
| step18-security.test.js | 46/46 |
| **Baseline subtotal (pre-existing, must not regress)** | **269/269 ✓** |
| step76-entitlement-hardening.test.js (new) | 36/36 ✓ |
| **Full `test/runAllTests.js` (69 suites)** | **exit code 0 — all suites passed** |

Baseline established before any edit: 269/269 across the seven suites; identical counts after the change.

Intentionally updated assertions (documented, architecture-justified):
- step16a A2/B1/B2/B5 and step49b B1/D1 previously *required* an anon-key/RPC client; they now require the opposite (no key, no `.rpc(`, backend HTTP only).
- step18 A4/A6/A7/A8 previously *required* the legacy signature scheme; A8 now functionally proves a legacy-signed file is rejected with no upgrade write.
- step18 C-sections and step16a C9 still describe historical migrations and were left untouched.
- step27 D2/L2 (404 semantics), step25 L1 (status stays hwid-free), step17 B13–B16 (packaged fail-closed strings) all still pass unmodified — contracts preserved.

---

## H. Static Security Scans (STEP 76 output)

- No real secret patterns (`sb_publishable_`, `sb_secret_`, `sk_live_`, JWT literals) in any file changed this step (the two hits in `step49b-security-audit.test.js` are the scanner's own detection regexes).
- The publishable anon key previously embedded in `electron.vite.config.mjs` is **removed from the build config** (it remains only in git history; rotating it is optional but recommended if treated as sensitive — see section N).
- No `GRANT EXECUTE … TO anon|authenticated|PUBLIC` in the new migration.
- No license key values written to `console.*` in any changed server/client file.
- No `.env` / `.env.local` modified; secrets referenced by name only in this report.

---

## I. Git Integrity

| Check | Baseline | After |
|---|---|---|
| `git status --porcelain` entries | 89 | 103 (+14 = exactly this step's 12 modified + 2 new files; 0 removed) |
| `git diff --stat` | 54 files, +520/−5404 | 66 files, +1313/−5620 |
| Staged changes | 0 | 0 |
| Stashes | 0 | 0 |
| HEAD | `ed659703c116854f3cb46cfb0dd3307f46e9777c` | unchanged |
| Prior STEP 71–75 working-tree work | present | preserved (0 baseline entries lost) |

No commit, push, reset, stash, checkout, or revert was performed.

---

## J. Deployment / Operator Notes

1. **Required:** apply `20261002000000_step76_license_entitlement_hardening.sql` to Supabase (Supabase CLI/dashboard — not run by this step).
2. **Required for release:** rebuild/repackage the Electron app so the new transport + `__API_BASE_URL__` define ship (old clients keep their bundled anon key and direct RPC calls until users update; both RPCs lose anon EXECUTE only after step 1, so **apply the migration only together with a client release**, or accept that legacy clients fail closed on activation/validation until updated).
3. **Optional env:** `REEL_CUTTER_API_URL` overrides the backend origin at build/run time (default `https://reel-cutter.onrender.com`). No other new environment variables; no new npm dependencies.
4. **Admin usage:** `POST /api/admin/licenses/:licenseKey/revoke` and `POST /api/admin/licenses/:licenseKey/reset-hwid` with the existing admin Bearer session; both are audited.
5. Local dev unchanged: with no backend configured, the client uses the mock database (never in packaged builds).

---

## K. Verification of Non-Goals

- Not done (by constraint): production DB/server mutation, restart, commit/push, `.env` edits, package installs, STEP 77 work.
- Not done (by design): moving subscription policy into SQL; exposing `stripe_subscription_id` to the client; changing `/status` to hwid-aware (step25 contract — hwid-aware checks use `POST /validate`).

---

## L. Residual Risks (accepted / documented)

1. **Offline-within-grace entitlement lag (M-1 residual):** an existing, previously-validated install that goes offline keeps access for up to 72h even if the subscription dies meanwhile; online startups re-check on every launch and the background heartbeat revalidates every 10 minutes when online. Reducing the grace window is a product trade-off, not taken here.
2. **Same-OS-user secret storage (M-2 residual):** the per-install signing secret lives encrypted on disk with a key any process running as the same OS user can recover (OS keystorage or fallback AES). The forgery path via *publicly derivable HWID* is closed; a same-user attacker with filesystem write + secret access is out of the threat model (documented in STEP 75).
3. **Legacy clients vs new grants:** desktop builds released before this step still hold the bundled anon key; after the migration, their direct RPC calls fail closed (offline-grace applies). Pair the migration with a client release (section J.2).
4. **In-memory limiter:** the invalid-key budget is per-process/in-memory (as with all existing limiters); a multi-instance deployment needs the already-documented Redis-backed limiter.
5. **Publishable anon key rotation:** the previously bundled publishable key was removed from source; it remains in git history. It grants no license RPC access post-migration, so rotation is optional hygiene.
6. **Audit `target_id` is NULL** for license operations (UUID column vs text key) — key stored in sanitized `metadata.license_key` instead.

---

## M. Test/Code References for Reviewers

- Migration: `supabase/migrations/20261002000000_step76_license_entitlement_hardening.sql`
- Server: `server/services/licenseService.js:115` (`computeIsActive`), `:187` (L-2), `:546`/`:591` (revoke/reset); `server/middleware/rateLimiter.js:124` (`invalidKeyGuard`); `server/routes/license.js:54`; `server/routes/admin.js:387`, `:439`
- Client: `src/main/license/supabaseClient.js:14` (transport), `:191` (`fetchLicense`), `:254` (`bindLicenseHwid`); `src/main/license/licenseManager.js:88`, `:187`, `:237`; `src/main/license/store.js` (legacy removed); `electron.vite.config.mjs` (`__API_BASE_URL__`)
- Tests: `test/step76-entitlement-hardening.test.js` (36), updated `test/step18-security.test.js`, `test/step16a-security.test.js`, `test/step49b-security-audit.test.js`

## N. STOP

STEP 76 complete. Findings M-1, M-2, L-1, L-2, L-3, L-4 all **CLOSED** with automated evidence; full regression green (69/69 suites, exit 0); working tree delta = this step's 14 files only; no commits made. **STOP — no STEP 77, no commit, no push.**
