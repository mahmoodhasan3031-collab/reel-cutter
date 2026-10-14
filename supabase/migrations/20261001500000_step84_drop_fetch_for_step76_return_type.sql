-- ==============================================================================
-- STEP 84/85: Pre-Step-76 compatibility drop for public.fetch_license_by_key
-- Migration: 20261001500000_step84_drop_fetch_for_step76_return_type.sql
-- Depends on: 20260916000000_isolate_client_service_role.sql (Step 16A)
-- Prepares:   20261002000000_step76_license_entitlement_hardening.sql (Step 76)
--
-- DEFECT CONTEXT (reproduced locally at HEAD 7f72e9b, SQLSTATE 42P13):
--   Step 16A created fetch_license_by_key(TEXT) with a 7-column RETURNS TABLE
--   (id, license_key, hwid, tier, status, created_at, updated_at).
--   Step 76 redefines it with a 10-column RETURNS TABLE via CREATE OR REPLACE
--   FUNCTION, which PostgreSQL rejects — the return type of an existing
--   function cannot be changed that way:
--     ERROR: cannot change return type of existing function (SQLSTATE 42P13)
--   Because each migration file applies as one unit, Step 76 has never
--   applied via the chain (local schema_migrations stops at 20261001000000;
--   production read-only probes in STEP77_FINAL_REPORT.md show its REVOKEs
--   not in effect), which also blocks every later migration, including the
--   bind_license_hwid corrective 20261014000000.
--
-- FIX (additive-only; no existing migration file is modified):
--   This migration runs BEFORE Step 76 in chain order (the 14-digit version
--   20261001500000 sorts lexicographically between 20261001000000 and
--   20261002000000) and drops the 7-column function so Step 76 can CREATE it
--   fresh with:
--     * the intended 10-column contract (adds subscription_status,
--       current_period_end, cancel_at_period_end — consumed by the
--       server/services/licenseService.js entitlement checks; see
--       STEP76_FINAL_REPORT.md and test/step76-entitlement-hardening.test.js),
--     * the intended service_role-only EXECUTE policy (Step 76 lines 65-68;
--       the previous anon/authenticated EXECUTE grants are removed with the
--       dropped function and are NOT re-granted).
--
-- FAIL-CLOSED GUARD:
--   If an environment has already recorded Step 76 (version 20261002000000)
--   as applied, dropping the function here would remove it without Step 76
--   ever re-running to recreate it. The guard RAISES before the DROP, so the
--   migration fails, nothing is changed, and manual repair is required.
--
-- SCOPE / OWNERSHIP:
--   - Touches ONLY public.fetch_license_by_key(TEXT) (drop) and nothing else.
--   - Does not modify Step 76, the Step 82 bind corrective, or any table,
--     policy, trigger, index, or grant directly (Step 76 owns the recreated
--     function's definition and permissions).
-- ==============================================================================

-- ─── 1. Fail-closed guard ───────────────────────────────────────────────────
-- Validates against the actual history schema (supabase_migrations.
-- schema_migrations: version text PK, statements text[], name text).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM supabase_migrations.schema_migrations
    WHERE version = '20261002000000'
  ) THEN
    RAISE EXCEPTION 'STEP 84 GUARD FAILED: migration 20261002000000 (Step 76) is already recorded as applied in this environment; dropping fetch_license_by_key here would not be recreated by the chain. Manual repair required.';
  END IF;
END $$;

-- ─── 2. Drop the 7-column function (Step 16A) so Step 76 can recreate it ───
-- IF EXISTS keeps this idempotent for environments where the function is
-- absent. No CASCADE: no tracked view, function, or trigger depends on it
-- (verified repo-wide in STEP 84; callers use runtime RPC name resolution
-- only, e.g. server/services/licenseService.js:164).

DROP FUNCTION IF EXISTS public.fetch_license_by_key(TEXT);
