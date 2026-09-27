-- ==============================================================================
-- STEP 33 MIGRATION: Fix manual_payments authenticated SELECT policy
-- Depends on: 20260926000000_create_manual_payments_and_audit_log.sql
--              20260929000000_harden_manual_payment_insert_policy.sql
-- ==============================================================================
--
-- DEFECT (confirmed in local RLS testing during STEP 32, CASE 10):
--   The authenticated SELECT policy created by 20260926 reads auth.users:
--
--     USING (customer_email = (SELECT email FROM auth.users WHERE id = auth.uid()))
--
--   Policy expressions are evaluated with the calling role's privileges.
--   `auth.users` is granted only to postgres/service_role, so as `authenticated`
--   this raises `permission denied for table users` and the read is refused by
--   error instead of by predicate. Verified locally:
--     ERROR:  permission denied for table users
--     HINT:  Grant the required privileges to the current role with:
--            GRANT SELECT ON auth.users TO authenticated;
--   The same defect made authenticated UPDATE/DELETE paths error (STEP 32
--   CASE 11/12). Fail-closed today, but it is an error, not a policy decision,
--   and it makes the authenticated read path unusable.
--
-- FIX: drop ONLY that one policy (guarded) and recreate it with the JWT-claim
--   ownership expression already validated in STEP 32 for the INSERT policy:
--
--     lower(customer_email) = lower(auth.jwt() ->> 'email')
--
--   - reads no table at all (no auth.users dependency, no grant requirement)
--   - absent/NULL email claim yields NULL -> row is invisible (fail-closed)
--   - ownership comparison is case-insensitive on both sides
--   - the INSERT policy from 20260929 is left exactly as-is
--
-- SCOPE / OWNERSHIP:
--   - Touches ONE policy on ONE table. Nothing else.
--   - Does NOT modify 20260926 or 20260929000000.
--   - Does NOT modify licenses, RPCs, audit_log or storage.
--   - Does NOT grant authenticated UPDATE or DELETE.
--   - Leaves anon denied (0926 revokes intact, no anon policy created).
--   - Leaves service_role untouched (its FOR ALL policy still applies).
--   - Leaves RLS enabled (never disabled, never reconfigured).
--   - Contains no SECURITY DEFINER and no GRANT.
--
-- IDEMPOTENCY:
--   PostgreSQL has no `CREATE POLICY IF NOT EXISTS`; the statement is therefore
--   preceded by an explicit `DROP POLICY IF EXISTS` inside the same guarded
--   block, so re-running produces identical state instead of failing with 42710.
--
-- ORDERING: must run AFTER 20260926000000 (policy exists) and can run before or
--   after 20260929000000 (independent policies).
-- ==============================================================================

-- ─── 1. GUARDED DROP + RECREATE ───────────────────────────────────────────────
-- Preconditions are checked first and fail closed: if manual_payments or the
-- expected original SELECT policy is missing, nothing is dropped and the
-- migration raises an exception.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'manual_payments'
  ) THEN
    RAISE EXCEPTION 'STEP 33 MIGRATION BLOCKED: public.manual_payments does not exist — apply 20260926000000 first.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'manual_payments' AND rowsecurity = true
  ) THEN
    RAISE EXCEPTION 'STEP 33 MIGRATION BLOCKED: ROW LEVEL SECURITY is not enabled on public.manual_payments.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'manual_payments'
      AND policyname = 'Authenticated users can read own payments'
      AND cmd = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'STEP 33 MIGRATION BLOCKED: original authenticated SELECT policy not found on public.manual_payments — apply 20260926000000 first.';
  END IF;

  -- Drop ONLY the existing authenticated SELECT policy (same name is reused).
  DROP POLICY IF EXISTS "Authenticated users can read own payments"
    ON public.manual_payments;

  CREATE POLICY "Authenticated users can read own payments"
    ON public.manual_payments
    FOR SELECT
    TO authenticated
    USING (
      -- ownership: verified email claim of the calling JWT (no auth.users read)
      lower(customer_email) = lower(auth.jwt() ->> 'email')
    );

  RAISE NOTICE 'STEP 33 POLICY FIXED: authenticated SELECT now uses the JWT email claim (no auth.users read)';
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

  -- authenticated SELECT exists and carries the JWT ownership expression.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'manual_payments'
      AND policyname = 'Authenticated users can read own payments'
      AND cmd = 'SELECT'
      AND roles @> ARRAY['authenticated']::name[]
      AND qual ILIKE '%auth.jwt()%'
      AND qual ILIKE '%customer_email%'
      AND qual ILIKE '%email%'
      AND qual NOT ILIKE '%auth.users%'
      AND qual NOT ILIKE '%auth.uid()%'
  ) THEN
    v_errors := array_append(v_errors, 'authenticated SELECT policy missing or not JWT-based');
  END IF;

  -- Exactly the 3 policies from 20260926 (same names, no additions/removals).
  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'manual_payments') <> 3 THEN
    v_errors := array_append(v_errors, 'unexpected policy count on manual_payments');
  END IF;

  -- authenticated must keep ONLY its INSERT + SELECT policies.
  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'manual_payments'
        AND roles @> ARRAY['authenticated']::name[]) <> 2 THEN
    v_errors := array_append(v_errors, 'authenticated policy set changed on manual_payments');
  END IF;

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

  -- service_role full-access policy must be untouched.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'manual_payments'
      AND policyname = 'Service role full access on manual_payments'
      AND cmd = 'ALL'
      AND roles @> ARRAY['service_role']::name[]
      AND qual = 'true'
      AND with_check = 'true'
  ) THEN
    v_errors := array_append(v_errors, 'service_role policy on manual_payments changed');
  END IF;

  -- The STEP 32 INSERT hardening must still be in place.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'manual_payments'
      AND policyname = 'Authenticated users can insert own payments'
      AND cmd = 'INSERT'
      AND with_check ILIKE '%auth.jwt()%'
      AND with_check ILIKE '%pending%'
      AND with_check ILIKE '%license_id IS NULL%'
      AND with_check ILIKE '%reviewed_by IS NULL%'
      AND with_check ILIKE '%reviewed_at IS NULL%'
  ) THEN
    v_errors := array_append(v_errors, 'STEP 32 INSERT hardening missing — regression detected');
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
    RAISE EXCEPTION 'STEP 33 MIGRATION VERIFICATION FAILED: %', array_to_string(v_errors, '; ');
  END IF;

  RAISE NOTICE 'STEP 33 MIGRATION VERIFICATION PASSED: authenticated SELECT is JWT-based; anon denied; INSERT hardening, audit_log, licenses and RPCs unchanged';
END $$;
