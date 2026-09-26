-- ==============================================================================
-- CORRECTIVE MIGRATION: Fix public.bind_license_hwid ambiguous column reference
-- Depends on: 20260916000000_isolate_client_service_role.sql (Step 16A)
-- ==============================================================================
--
-- DEFECT (pre-existing, discovered during fresh-database verification):
--   Step 16A declares RETURNS TABLE(id, license_key, hwid, tier, status,
--   created_at, updated_at). In PL/pgSQL those OUT columns become local
--   variables, so the unqualified references inside the UPDATE:
--
--     UPDATE public.licenses
--     SET hwid = p_hwid
--     WHERE license_key = v_normalized_key
--       AND hwid IS NULL;
--
--   fail at runtime with:
--     ERROR: column reference "license_key" is ambiguous (SQLSTATE 42P03)
--     DETAIL: It could refer to either a PL/pgSQL variable or a table column.
--
--   Effect: HWID binding always errored (fail-closed: no wrong binding ever
--   occurred, but a valid unbound license could never be bound).
--
-- FIX: qualify every table column reference with the target alias (l.*).
--
-- SECURITY PRESERVED (unchanged from Step 16A):
--   - SECURITY DEFINER
--   - SET search_path = public
--   - identical signature and return columns (only the 7 safe columns)
--   - HWID binding guard: only binds when hwid IS NULL (no re-binding)
--   - license_key must match (no cross-license binding)
--   - no tier/status/payment/email fields returned or writable
--   - EXECUTE grants unchanged (anon + authenticated)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.bind_license_hwid(p_license_key TEXT, p_hwid TEXT)
RETURNS TABLE (
  id UUID,
  license_key TEXT,
  hwid TEXT,
  tier TEXT,
  status TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized_key TEXT;
  v_updated_count INTEGER;
BEGIN
  -- Normalize the license key
  v_normalized_key := upper(trim(p_license_key));

  -- Only bind if the license exists AND hwid is currently NULL (unbound).
  -- Column references are qualified (l.*) to avoid ambiguity with the
  -- RETURNS TABLE OUT variables of the same names.
  UPDATE public.licenses l
  SET hwid = p_hwid
  WHERE l.license_key = v_normalized_key
    AND l.hwid IS NULL;

  -- Check if the update affected any rows
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  -- Return the license record (whether updated or already bound)
  RETURN QUERY
  SELECT
    l.id,
    l.license_key,
    l.hwid,
    l.tier,
    l.status,
    l.created_at,
    l.updated_at
  FROM public.licenses l
  WHERE l.license_key = v_normalized_key;
END;
$$;

-- EXECUTE grants are NOT re-granted here: CREATE OR REPLACE FUNCTION preserves
-- existing ACLs (anon + authenticated keep EXECUTE, granted by Step 16A).

-- ─── VERIFICATION ────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'bind_license_hwid'
      AND p.prosecdef = true
  ) THEN
    RAISE EXCEPTION 'BIND LICENSE HWID FIX FAILED: bind_license_hwid is missing or not SECURITY DEFINER';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'bind_license_hwid'
      AND p.proconfig @> ARRAY['search_path=public']
  ) THEN
    RAISE EXCEPTION 'BIND LICENSE HWID FIX FAILED: SET search_path = public was not preserved';
  END IF;

  RAISE NOTICE 'BIND LICENSE HWID FIX APPLIED: qualified column references, security attributes preserved';
END $$;
