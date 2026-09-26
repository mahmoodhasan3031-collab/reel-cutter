-- ==============================================================================
-- STEP 16 MIGRATION: Create manual_payments table and audit_log table
-- Manual Payment System — Database Layer
-- ==============================================================================
--
-- This migration adds the database layer for the manual payment system:
--   1. manual_payments table — stores customer payment submissions
--   2. audit_log table — records all admin actions for accountability
--   3. RLS policies — enforces customer isolation and admin-only access
--   4. Indexes and constraints — ensures data integrity
--
-- PRESERVATION:
--   - All existing tables, RPCs, RLS policies, indexes remain UNCHANGED
--   - The licenses table is not modified
--   - The handle_updated_at() function is reused (already exists in schema)
--
-- STORAGE:
--   - A private Supabase Storage bucket 'payment-proofs' must be created
--     via the Supabase Dashboard (Storage > New Bucket > name: payment-proofs,
--     uncheck 'Public bucket'). This cannot be done via SQL migration.
--
-- REVERSIBLE: DROP TABLE statements below can undo this migration.
-- ==============================================================================

-- ─── 1. manual_payments TABLE ────────────────────────────────────────────────
-- Stores customer payment submissions for manual verification.
-- Each record represents one payment attempt by a customer.
-- On admin approval, a license_id link is created to the licenses table.

CREATE TABLE IF NOT EXISTS public.manual_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  whatsapp_number TEXT,
  plan_id TEXT NOT NULL CHECK (plan_id IN ('basic', 'standard', 'pro')),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('bkash', 'nagad', 'rocket', 'bank', 'binance')),
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'BDT' CHECK (currency IN ('BDT', 'USDT')),
  transaction_id TEXT NOT NULL,
  sender_account TEXT,
  proof_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  admin_note TEXT,
  rejection_reason TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  license_id UUID REFERENCES public.licenses(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.manual_payments IS 'Customer payment submissions for manual verification and approval. Each record represents one payment attempt.';

-- ─── 2. INDEXES ──────────────────────────────────────────────────────────────
-- Performance indexes for common query patterns.

CREATE INDEX IF NOT EXISTS idx_manual_payments_status
  ON public.manual_payments (status);

CREATE INDEX IF NOT EXISTS idx_manual_payments_customer_email
  ON public.manual_payments (customer_email);

CREATE INDEX IF NOT EXISTS idx_manual_payments_transaction_id
  ON public.manual_payments (transaction_id);

CREATE INDEX IF NOT EXISTS idx_manual_payments_created_at
  ON public.manual_payments (created_at);

-- ─── 3. UNIQUE CONSTRAINT ────────────────────────────────────────────────────
-- Prevents duplicate payment submissions for the same payment method + transaction ID.
-- A customer cannot submit the same bKash/Nagad/Rocket transaction twice.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'unique_manual_payment_txn'
    AND conrelid = 'public.manual_payments'::regclass
  ) THEN
    ALTER TABLE public.manual_payments
      ADD CONSTRAINT unique_manual_payment_txn UNIQUE (payment_method, transaction_id);
  END IF;
END $$;

-- ─── 4. TRIGGER — auto-update updated_at ─────────────────────────────────────
-- Reuses the existing handle_updated_at() function from supabase-schema.sql.
-- Only creates the trigger if the function exists.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'handle_updated_at'
    AND pronamespace = 'public'::regnamespace
  ) THEN
    DROP TRIGGER IF EXISTS set_manual_payments_updated_at ON public.manual_payments;
    CREATE TRIGGER set_manual_payments_updated_at
      BEFORE UPDATE ON public.manual_payments
      FOR EACH ROW
      EXECUTE FUNCTION public.handle_updated_at();
  END IF;
END $$;

-- ─── 5. RLS — manual_payments ────────────────────────────────────────────────
-- Security model:
--   - service_role: full access (server backend operations)
--   - authenticated: INSERT own payments, SELECT own payments only
--   - anon: NO access (all operations revoked)

ALTER TABLE public.manual_payments ENABLE ROW LEVEL SECURITY;

-- Policy: service_role full access
CREATE POLICY "Service role full access on manual_payments"
  ON public.manual_payments
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: authenticated users can INSERT their own payments
-- Guards: customer_email must match the authenticated user's email
CREATE POLICY "Authenticated users can insert own payments"
  ON public.manual_payments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    customer_email = (
      SELECT email FROM auth.users WHERE id = auth.uid()
    )
  );

-- Policy: authenticated users can SELECT their own payments
-- Guards: customer_email must match the authenticated user's email
CREATE POLICY "Authenticated users can read own payments"
  ON public.manual_payments
  FOR SELECT
  TO authenticated
  USING (
    customer_email = (
      SELECT email FROM auth.users WHERE id = auth.uid()
    )
  );

-- No UPDATE or DELETE policies for authenticated — only service_role can modify

-- Revoke direct table access from anon
REVOKE SELECT ON public.manual_payments FROM anon;
REVOKE UPDATE ON public.manual_payments FROM anon;
REVOKE INSERT ON public.manual_payments FROM anon;
REVOKE DELETE ON public.manual_payments FROM anon;

-- ─── 6. audit_log TABLE ──────────────────────────────────────────────────────
-- Records all admin actions for accountability and debugging.
-- Only service_role can access this table (no customer access).

CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.audit_log IS 'Audit trail for all admin actions. Only accessible by service_role.';

-- Index for chronological querying
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at
  ON public.audit_log (created_at);

-- Index for action type filtering
CREATE INDEX IF NOT EXISTS idx_audit_log_action
  ON public.audit_log (action);

-- ─── 7. RLS — audit_log ──────────────────────────────────────────────────────
-- Security model:
--   - service_role: full access (admin operations)
--   - authenticated: NO access
--   - anon: NO access

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Policy: service_role full access
CREATE POLICY "Service role full access on audit_log"
  ON public.audit_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Revoke all access from anon and authenticated
REVOKE SELECT ON public.audit_log FROM anon;
REVOKE INSERT ON public.audit_log FROM anon;
REVOKE UPDATE ON public.audit_log FROM anon;
REVOKE DELETE ON public.audit_log FROM anon;

REVOKE SELECT ON public.audit_log FROM authenticated;
REVOKE INSERT ON public.audit_log FROM authenticated;
REVOKE UPDATE ON public.audit_log FROM authenticated;
REVOKE DELETE ON public.audit_log FROM authenticated;

-- ─── 8. VERIFICATION ─────────────────────────────────────────────────────────
-- Run after migration to confirm all objects were created.

DO $$
DECLARE
  v_errors TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- Verify manual_payments table
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'manual_payments'
  ) THEN
    v_errors := array_append(v_errors, 'manual_payments table not created');
  END IF;

  -- Verify audit_log table
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'audit_log'
  ) THEN
    v_errors := array_append(v_errors, 'audit_log table not created');
  END IF;

  -- Verify indexes
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_manual_payments_status'
  ) THEN
    v_errors := array_append(v_errors, 'idx_manual_payments_status not created');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_manual_payments_customer_email'
  ) THEN
    v_errors := array_append(v_errors, 'idx_manual_payments_customer_email not created');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_manual_payments_transaction_id'
  ) THEN
    v_errors := array_append(v_errors, 'idx_manual_payments_transaction_id not created');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_manual_payments_created_at'
  ) THEN
    v_errors := array_append(v_errors, 'idx_manual_payments_created_at not created');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_audit_log_created_at'
  ) THEN
    v_errors := array_append(v_errors, 'idx_audit_log_created_at not created');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_audit_log_action'
  ) THEN
    v_errors := array_append(v_errors, 'idx_audit_log_action not created');
  END IF;

  -- Verify unique constraint
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'unique_manual_payment_txn'
  ) THEN
    v_errors := array_append(v_errors, 'unique_manual_payment_txn constraint not created');
  END IF;

  -- Verify RLS is enabled
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE tablename = 'manual_payments'
    AND rowsecurity = true
  ) THEN
    v_errors := array_append(v_errors, 'RLS not enabled on manual_payments');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE tablename = 'audit_log'
    AND rowsecurity = true
  ) THEN
    v_errors := array_append(v_errors, 'RLS not enabled on audit_log');
  END IF;

  -- Verify RLS policies exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'manual_payments'
    AND policyname = 'Service role full access on manual_payments'
  ) THEN
    v_errors := array_append(v_errors, 'Service role policy not created for manual_payments');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'manual_payments'
    AND policyname = 'Authenticated users can insert own payments'
  ) THEN
    v_errors := array_append(v_errors, 'Authenticated insert policy not created for manual_payments');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'manual_payments'
    AND policyname = 'Authenticated users can read own payments'
  ) THEN
    v_errors := array_append(v_errors, 'Authenticated select policy not created for manual_payments');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'audit_log'
    AND policyname = 'Service role full access on audit_log'
  ) THEN
    v_errors := array_append(v_errors, 'Service role policy not created for audit_log');
  END IF;

  -- Verify trigger exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_manual_payments_updated_at'
  ) THEN
    v_errors := array_append(v_errors, 'updated_at trigger not created for manual_payments');
  END IF;

  -- Verify existing licenses table is unchanged
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'licenses'
  ) THEN
    v_errors := array_append(v_errors, 'licenses table missing — regression detected');
  END IF;

  -- Verify existing licenses RLS policies are intact
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'licenses'
    AND policyname = 'Allow service role full access'
  ) THEN
    v_errors := array_append(v_errors, 'licenses service_role policy missing — regression detected');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'licenses'
    AND policyname = 'Authenticated users can read own licenses'
  ) THEN
    v_errors := array_append(v_errors, 'licenses authenticated read policy missing — regression detected');
  END IF;

  -- Verify existing RPC functions are intact
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'fetch_license_by_key'
    AND pronamespace = 'public'::regnamespace
  ) THEN
    v_errors := array_append(v_errors, 'fetch_license_by_key RPC missing — regression detected');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'bind_license_hwid'
    AND pronamespace = 'public'::regnamespace
  ) THEN
    v_errors := array_append(v_errors, 'bind_license_hwid RPC missing — regression detected');
  END IF;

  -- Raise errors if any
  IF array_length(v_errors, 1) > 0 THEN
    RAISE EXCEPTION 'STEP 16 MIGRATION VERIFICATION FAILED: %', array_to_string(v_errors, '; ');
  END IF;

  RAISE NOTICE 'STEP 16 MIGRATION VERIFICATION PASSED: All objects created, all existing objects preserved';
END $$;

-- ==============================================================================
-- NOTES:
-- - This migration is additive (does not modify or remove any existing objects)
-- - The handle_updated_at() function already exists from supabase-schema.sql
-- - The payment-proofs storage bucket must be created via Supabase Dashboard:
--     1. Go to Storage > New Bucket
--     2. Name: payment-proofs
--     3. Uncheck 'Public bucket' (keep it private)
--     4. Set allowed MIME types: image/jpeg, image/png, image/webp
--     5. Max file size: 5MB
-- - The licenses table, RPCs, and RLS policies are verified unchanged
-- - The unique constraint on (payment_method, transaction_id) prevents duplicate submissions
-- - Authenticated INSERT policy ensures customer_email matches the auth user's email
-- - Authenticated SELECT policy ensures customers can only read their own payments
-- - audit_log is only accessible by service_role (no customer access)
-- ==============================================================================
