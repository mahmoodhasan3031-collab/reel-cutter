-- ==============================================================================
-- STEP 28 MIGRATION: Add authenticated user RLS policy for licenses
-- Allows authenticated customers to read only their own license records
-- ==============================================================================
--
-- SECURITY MODEL:
--   - service_role: full access (existing policy, unchanged)
--   - authenticated: SELECT only WHERE user_id = auth.uid()
--   - anon: no direct table access (revoked in Step 16A)
--
-- This policy ensures:
--   1. Customers can read their own licenses
--   2. Customers CANNOT read other customers' licenses
--   3. Customers CANNOT update or delete any licenses
--   4. Anonymous users cannot access license data
--   5. Service-role server operations continue working
--
-- The Electron desktop client uses anon key + RPC functions (SECURITY DEFINER),
-- so it bypasses RLS entirely and is not affected by this policy.

-- 1. Policy: authenticated users can SELECT their own licenses
CREATE POLICY "Authenticated users can read own licenses"
  ON public.licenses
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 2. Verify policies exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'licenses'
    AND policyname = 'Authenticated users can read own licenses'
  ) THEN
    RAISE EXCEPTION 'STEP 28 MIGRATION FAILED: Authenticated user read policy was not created';
  END IF;
END $$;

-- ==============================================================================
-- NOTES:
-- - This policy is additive (does not modify or remove existing policies)
-- - The service_role policy remains unchanged (full access)
-- - No INSERT/UPDATE/DELETE policies for authenticated — server uses service_role
-- - The RPC functions (fetch_license_by_key, bind_license_hwid) use SECURITY DEFINER
--   and bypass RLS, so the Electron client is unaffected
-- - customer_email, transaction_id, payment_provider are NOT exposed through this
--   policy because the dashboard route (server-side) only returns safe fields
-- ==============================================================================
