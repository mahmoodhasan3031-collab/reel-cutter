-- ==============================================================================
-- BASELINE MIGRATION: Create public.licenses
-- Timestamp MUST sort BEFORE 20260916000000_isolate_client_service_role.sql
-- ==============================================================================
--
-- WHY THIS MIGRATION EXISTS (dependency/order defect):
--   The public.licenses table was originally provisioned OUTSIDE the migration
--   chain (reference schema: supabase-schema.sql). The migration chain therefore
--   started with Step 16A, whose SECURITY DEFINER functions reference
--   public.licenses. On a completely fresh database this failed with:
--
--     ERROR: relation "public.licenses" does not exist (SQLSTATE 42P01)
--     Failing migration: supabase/migrations/20260916000000_isolate_client_service_role.sql
--
--   This baseline migration records the original table definition as the first
--   migration so the chain is self-contained and reproducible from scratch.
--
-- SCOPE / OWNERSHIP (no duplication with later migrations):
--   Created here (original schema objects only):
--     - public.licenses table, indexes, updated_at trigger, RLS, service_role policy
--   Still owned by the existing migrations (NOT duplicated here):
--     - 20260916000000 Step 16A : RPC functions (fetch_license_by_key,
--       bind_license_hwid) + REVOKE of direct anon table access
--     - 20260917000000 Step 18  : partial unique index on transaction_id
--     - 20260924000000 Step 27  : user_id column + idx_licenses_user_id
--     - 20260925000000 Step 28  : authenticated read-own-licenses policy
--     - 20260926000000 STEP 16  : manual_payments + audit_log (FK -> licenses)
--
-- IDEMPOTENT: every statement is guarded, so this is a no-op on any database
-- where the licenses table already exists (e.g. previously provisioned envs).
-- ==============================================================================

-- ─── 1. TABLE ────────────────────────────────────────────────────────────────
-- Columns match the reference schema supabase-schema.sql exactly.
-- user_id is intentionally NOT created here: Step 27
-- (20260924000000_add_user_id_to_licenses.sql) owns that column.

CREATE TABLE IF NOT EXISTS public.licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_key TEXT NOT NULL UNIQUE,
  customer_email TEXT,
  transaction_id TEXT,
  payment_provider TEXT DEFAULT 'stripe',
  email_status TEXT NOT NULL DEFAULT 'pending' CHECK (email_status IN ('pending', 'sent', 'failed')),
  email_sent_at TIMESTAMPTZ,
  email_error TEXT,
  email_attempts INTEGER NOT NULL DEFAULT 0,
  email_last_attempt_at TIMESTAMPTZ,
  hwid TEXT,
  tier TEXT NOT NULL DEFAULT 'standard' CHECK (tier IN ('basic', 'standard', 'pro')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.licenses IS 'Stores license keys purchased by users';

-- ─── 2. INDEXES ──────────────────────────────────────────────────────────────
-- idx_licenses_user_id        -> created by Step 27 migration
-- idx_licenses_transaction_id_unique -> created by Step 18 migration
-- (neither is created here, to avoid duplicating their ownership)

CREATE INDEX IF NOT EXISTS idx_licenses_license_key ON public.licenses (license_key);
CREATE INDEX IF NOT EXISTS idx_licenses_customer_email ON public.licenses (customer_email);
CREATE INDEX IF NOT EXISTS idx_licenses_email_status ON public.licenses (email_status);
CREATE INDEX IF NOT EXISTS idx_licenses_hwid ON public.licenses (hwid);
CREATE INDEX IF NOT EXISTS idx_licenses_status ON public.licenses (status);

-- ─── 3. updated_at TRIGGER ───────────────────────────────────────────────────
-- handle_updated_at() is also required by 20260926000000_create_manual_payments_
-- and_audit_log.sql (which verifies this trigger exists), so it must be part of
-- the baseline schema.

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_licenses_updated_at ON public.licenses;
CREATE TRIGGER set_licenses_updated_at
BEFORE UPDATE ON public.licenses
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- ─── 4. ROW LEVEL SECURITY ───────────────────────────────────────────────────

ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;

-- ─── 5. service_role POLICY ──────────────────────────────────────────────────
-- "Allow service role full access" is the existing service_role policy name
-- verified by 20260926000000_create_manual_payments_and_audit_log.sql.
-- CREATE POLICY has no IF NOT EXISTS, so guard with a DO block.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'licenses'
      AND policyname = 'Allow service role full access'
  ) THEN
    CREATE POLICY "Allow service role full access" ON public.licenses
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- NOTE: the authenticated read-own-licenses policy is intentionally NOT created
-- here — Step 28 (20260925000000_add_authenticated_rls_policy.sql) owns it.
-- NOTE: anon direct table access is intentionally NOT revoked here — Step 16A
-- (20260916000000_isolate_client_service_role.sql) owns that control.

-- ─── 6. VERIFICATION ─────────────────────────────────────────────────────────

DO $$
DECLARE
  v_errors TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'licenses'
  ) THEN
    v_errors := array_append(v_errors, 'licenses table not created');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'licenses' AND rowsecurity = true
  ) THEN
    v_errors := array_append(v_errors, 'RLS not enabled on licenses');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'handle_updated_at'
      AND pronamespace = 'public'::regnamespace
  ) THEN
    v_errors := array_append(v_errors, 'handle_updated_at() not created');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'licenses' AND indexname = 'idx_licenses_license_key'
  ) THEN
    v_errors := array_append(v_errors, 'idx_licenses_license_key not created');
  END IF;

  IF array_length(v_errors, 1) > 0 THEN
    RAISE EXCEPTION 'BASELINE LICENSES MIGRATION FAILED: %', array_to_string(v_errors, '; ');
  END IF;

  RAISE NOTICE 'BASELINE LICENSES MIGRATION PASSED: public.licenses created with RLS enabled';
END $$;
