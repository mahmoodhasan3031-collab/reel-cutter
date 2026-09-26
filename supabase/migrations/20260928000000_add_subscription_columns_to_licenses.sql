-- ==============================================================================
-- CORRECTIVE MIGRATION: Add subscription columns to public.licenses
-- Depends on: 20260915000000_create_licenses_table.sql (baseline)
-- ==============================================================================
--
-- DEFECT (schema drift, discovered during STEP 23 fresh-database verification):
--   STEP 32E (commit d11eb84) added Stripe subscription support to the
--   application (server/services/licenseGenerator.js, licenseService.js,
--   routes/webhook.js) but shipped NO SQL. licenseGenerator.createLicense()
--   unconditionally inserts 8 subscription columns on every license row:
--
--     stripe_subscription_id, stripe_customer_id, subscription_status,
--     current_period_start, current_period_end, cancel_at_period_end,
--     canceled_at, plan_interval
--
--   On a database provisioned from the migration chain those columns do not
--   exist, so PostgREST rejects the insert:
--
--     ERROR PGRST204: Could not find the 'cancel_at_period_end' column
--     of 'licenses' in the schema cache
--
--   licenseGenerator swallows the error (falls back to its in-memory registry)
--   and returns a license id that was never persisted. paymentReviewService then
--   writes that id into manual_payments.license_id, violating the foreign key:
--
--     insert or update on table "manual_payments" violates foreign key
--     constraint "manual_payments_license_id_fkey"
--
--   Net effect: admin approval fails with HTTP 500 and the payment stays
--   'pending'. No wrong data is written (fail-closed), but the flow is broken.
--
-- FIX: add the missing columns with stable, backward-compatible defaults.
--   All columns are nullable or defaulted, so this is a no-op for existing rows
--   (including the baseline's sample licenses) and never fails on re-run.
--
-- SCOPE / OWNERSHIP:
--   - Adds ONLY the 8 subscription columns + activated_at (read by
--     server/services/licenseService.js:112 and routes/license.js:187).
--   - Does NOT modify the baseline or any existing migration.
--   - Does NOT touch RLS, policies, indexes, triggers or RPC functions.
--   - Local Supabase only; never executed against production.
-- ==============================================================================

ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS subscription_status TEXT;
ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ;
ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;
ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ;
ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS plan_interval TEXT;
ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;

-- Subscription lookup path: webhook idempotency queries
-- .eq('stripe_subscription_id', subscriptionId) (licenseGenerator.js:234)
CREATE INDEX IF NOT EXISTS idx_licenses_stripe_subscription_id
  ON public.licenses (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- ─── VERIFICATION ────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_missing TEXT[] := ARRAY[]::TEXT[];
  v_col TEXT;
BEGIN
  FOREACH v_col IN ARRAY ARRAY[
    'stripe_subscription_id', 'stripe_customer_id', 'subscription_status',
    'current_period_start', 'current_period_end', 'cancel_at_period_end',
    'canceled_at', 'plan_interval', 'activated_at'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'licenses' AND column_name = v_col
    ) THEN
      v_missing := array_append(v_missing, v_col);
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'SUBSCRIPTION COLUMNS MIGRATION FAILED: missing %',
      array_to_string(v_missing, ', ');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'licenses'
      AND indexname = 'idx_licenses_stripe_subscription_id'
  ) THEN
    RAISE EXCEPTION 'SUBSCRIPTION COLUMNS MIGRATION FAILED: idx_licenses_stripe_subscription_id not created';
  END IF;

  RAISE NOTICE 'SUBSCRIPTION COLUMNS MIGRATION APPLIED: licenses table now matches licenseGenerator expectations';
END $$;
