-- ==============================================================================
-- STEP 32 MIGRATION: Harden manual_payments authenticated INSERT policy
-- Depends on: 20260926000000_create_manual_payments_and_audit_log.sql
-- ==============================================================================
--
-- DEFECT (found during STEP 31 review):
--   The authenticated INSERT policy created by 20260926 checks ONLY email
--   ownership:
--
--     WITH CHECK (customer_email = (SELECT email FROM auth.users WHERE id = auth.uid()))
--
--   It does not constrain `status`, `license_id`, `reviewed_by` or
--   `reviewed_at`. Because the table is exposed through PostgREST with default
--   grants, a signed-in user could insert a row directly carrying
--   `status = 'approved'`, a non-NULL `license_id` and admin review fields,
--   forging an approval record that the admin dashboard would render as real.
--
--   The application path is NOT affected (server/routes/manualPayment.js strips
--   customer-controlled admin fields and always writes status='pending' using
--   the service role, which bypasses RLS). This migration closes the direct
--   database path — defence in depth.
--
-- FIX: drop ONLY that one policy (guarded) and recreate it with a strict
--   WITH CHECK requiring email ownership AND a pristine pending row.
--
-- OWNERSHIP CLAUSE NOTE (validated against a local Supabase instance):
--   20260926 expresses ownership as
--     customer_email = (SELECT email FROM auth.users WHERE id = auth.uid())
--   That subquery is evaluated with the calling role's privileges. On a stock
--   Supabase instance `auth.users` is granted only to `postgres`/`service_role`,
--   so as `authenticated` it raises `permission denied for table users` and the
--   policy denies by error. The JWT claim carries the same verified identity
--   without touching auth.users, so this migration uses:
--     lower(customer_email) = lower(auth.jwt() ->> 'email')
--   A missing/absent email claim yields NULL and therefore denies (fail-closed).
--
-- SCOPE / OWNERSHIP:
--   - Touches ONE policy on ONE table. Nothing else.
--   - Does NOT modify 20260926 (or any existing migration).
--   - Does NOT grant authenticated UPDATE or DELETE.
--   - Does NOT touch anon: no anon policy exists and none is created.
--   - Leaves RLS enabled (never disabled, never reconfigured).
--   - Leaves audit_log, licenses and all RPCs untouched.
--   - Contains no SECURITY DEFINER and no GRANT.
--
-- IDEMPOTENCY:
--   PostgreSQL has no `CREATE POLICY IF NOT EXISTS`; the statement is therefore
--   preceded by an explicit `DROP POLICY IF EXISTS` inside the same guarded
--   block, so re-running produces identical state instead of failing with 42710.
--
-- ORDERING: must run AFTER 20260926000000 and AFTER 20260928000000.
-- ==============================================================================

-- ─── 1. GUARDED DROP + RECREATE ───────────────────────────────────────────────
-- Preconditions are checked first and fail closed: if manual_payments or the
-- expected original policy is missing, nothing is dropped and the migration
-- raises an exception.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'manual_payments'
  ) THEN
    RAISE EXCEPTION 'STEP 32 MIGRATION BLOCKED: public.manual_payments does not exist — apply 20260926000000 first.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'manual_payments' AND rowsecurity = true
  ) THEN
    RAISE EXCEPTION 'STEP 32 MIGRATION BLOCKED: ROW LEVEL SECURITY is not enabled on public.manual_payments.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'manual_payments'
      AND policyname = 'Authenticated users can insert own payments'
      AND cmd = 'INSERT'
  ) THEN
    RAISE EXCEPTION 'STEP 32 MIGRATION BLOCKED: original authenticated INSERT policy not found on public.manual_payments — apply 20260926000000 first.';
  END IF;

  -- Drop ONLY the existing authenticated INSERT policy (same name is reused).
  DROP POLICY IF EXISTS "Authenticated users can insert own payments"
    ON public.manual_payments;

  CREATE POLICY "Authenticated users can insert own payments"
    ON public.manual_payments
    FOR INSERT
    TO authenticated
    WITH CHECK (
      -- ownership: verified email claim of the calling JWT (no auth.users read)
      lower(customer_email) = lower(auth.jwt() ->> 'email')
      -- hardening: the row must be a pristine, unreviewed pending payment
      AND status = 'pending'
      AND license_id IS NULL
      AND reviewed_by IS NULL
      AND reviewed_at IS NULL
    );

  RAISE NOTICE 'STEP 32 POLICY HARDENED: authenticated INSERT now restricted to own pending payment with no license/admin fields';
END $$;

-- ─── 2. VERIFICATION (fail-closed) ───────────────────────────────────────────

DO $$
DECLARE
  v_errors TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'manual_payments' AND rowsecurity = true
  ) THEN
    v_errors := array_append(v_errors, 'RLS not enabled on manual_payments');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'manual_payments'
      AND policyname = 'Authenticated users can insert own payments'
      AND cmd = 'INSERT'
      AND roles @> ARRAY['authenticated']::name[]
  ) THEN
    v_errors := array_append(v_errors, 'hardened authenticated INSERT policy missing');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'manual_payments'
      AND policyname = 'Authenticated users can insert own payments'
      AND with_check ILIKE '%auth.jwt()%'
      AND with_check ILIKE '%customer_email%'
      AND with_check ILIKE '%email%'
      AND with_check ILIKE '%status%'
      AND with_check ILIKE '%pending%'
      AND with_check ILIKE '%license_id IS NULL%'
      AND with_check ILIKE '%reviewed_by IS NULL%'
      AND with_check ILIKE '%reviewed_at IS NULL%'
  ) THEN
    v_errors := array_append(v_errors, 'WITH CHECK is not the hardened definition');
  END IF;

  -- No new policies: exactly the 3 policies created by 20260926 must exist.
  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'manual_payments') <> 3 THEN
    v_errors := array_append(v_errors, 'unexpected policy count on manual_payments');
  END IF;

  -- authenticated must keep NO UPDATE / DELETE policy.
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'manual_payments'
      AND roles @> ARRAY['authenticated']::name[]
      AND cmd IN ('UPDATE', 'DELETE')
  ) THEN
    v_errors := array_append(v_errors, 'authenticated gained UPDATE/DELETE policy');
  END IF;

  -- anon must remain denied (no anon policy of any command).
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'manual_payments'
      AND roles @> ARRAY['anon']::name[]
  ) THEN
    v_errors := array_append(v_errors, 'anon gained a policy on manual_payments');
  END IF;

  -- audit_log must be untouched (RLS on, still exactly its 1 service-role policy).
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'audit_log' AND rowsecurity = true
  ) THEN
    v_errors := array_append(v_errors, 'audit_log RLS missing');
  END IF;
  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'audit_log') <> 1 THEN
    v_errors := array_append(v_errors, 'audit_log policies changed');
  END IF;

  -- licenses must be untouched.
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'licenses' AND rowsecurity = true
  ) THEN
    v_errors := array_append(v_errors, 'licenses RLS missing — regression detected');
  END IF;
  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'licenses') < 2 THEN
    v_errors := array_append(v_errors, 'licenses policies missing — regression detected');
  END IF;

  -- RPCs must be untouched.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fetch_license_by_key'
  ) THEN
    v_errors := array_append(v_errors, 'fetch_license_by_key missing — regression detected');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'bind_license_hwid'
  ) THEN
    v_errors := array_append(v_errors, 'bind_license_hwid missing — regression detected');
  END IF;

  IF array_length(v_errors, 1) > 0 THEN
    RAISE EXCEPTION 'STEP 32 MIGRATION VERIFICATION FAILED: %', array_to_string(v_errors, '; ');
  END IF;

  RAISE NOTICE 'STEP 32 MIGRATION VERIFICATION PASSED: hardened INSERT policy in place; anon denied; audit_log, licenses and RPCs unchanged';
END $$;
