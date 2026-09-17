-- ==============================================================================
-- STEP 18: transaction_id uniqueness & webhook idempotency hardening
-- Migration: 20260917000000_harden_license_integrity.sql
--
-- SAFETY:
--   - Uses a partial unique index that only enforces uniqueness on non-NULL
--     transaction_id values, so existing NULLs are not affected.
--   - Before applying the UNIQUE constraint, the migration checks for existing
--     duplicates and will FAIL with a descriptive message if found.
--   - Does NOT modify or re-run STEP 16A migration.
-- ==============================================================================

-- 1. Safety check: fail if duplicate non-NULL transaction_ids exist
DO $$
DECLARE
  dup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT transaction_id
    FROM public.licenses
    WHERE transaction_id IS NOT NULL
    GROUP BY transaction_id
    HAVING COUNT(*) > 1
  ) duplicates;

  IF dup_count > 0 THEN
    RAISE EXCEPTION 'STEP 18 MIGRATION BLOCKED: Found % duplicate transaction_id groups. Clean up duplicates before applying this migration.', dup_count;
  END IF;
END $$;

-- 2. Drop the existing non-unique index if it exists (will be replaced by unique index)
DROP INDEX IF EXISTS public.idx_licenses_transaction_id;

-- 3. Create a partial unique index: enforces uniqueness only for non-NULL values
--    This supports the webhook idempotency design where transaction_id uniqueness
--    prevents duplicate license creation for the same payment.
CREATE UNIQUE INDEX idx_licenses_transaction_id_unique
  ON public.licenses (transaction_id)
  WHERE transaction_id IS NOT NULL;

-- 4. Verify the constraint was created
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_licenses_transaction_id_unique'
    AND tablename = 'licenses'
  ) THEN
    RAISE EXCEPTION 'STEP 18 MIGRATION FAILED: Unique index on transaction_id was not created';
  END IF;
END $$;
