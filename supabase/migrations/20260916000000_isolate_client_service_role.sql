-- ============================================================================
-- Migration: Isolate Electron Client from Service-Role Key
-- Step 16A — Least-privilege RLS via PostgreSQL RPC functions
--
-- This migration:
-- 1. Creates SECURITY DEFINER functions for client license operations
-- 2. Grants EXECUTE to anon role (Electron client uses anon key)
-- 3. Preserves service_role full access for server operations
-- 4. Prevents client from directly reading/writing the licenses table
-- 5. Enforces HWID binding guard (only unbound licenses can be bound)
--
-- Reversible: DROP FUNCTION statements below can undo this migration.
-- ============================================================================

-- ─── 1. fetch_license_by_key ────────────────────────────────────────────────
-- Allows the Electron client to look up a license by key.
-- Returns only non-sensitive columns (no email, transaction, payment fields).
-- Runs as SECURITY DEFINER so it bypasses RLS.
-- The function controls exactly which columns are exposed.

CREATE OR REPLACE FUNCTION public.fetch_license_by_key(p_license_key TEXT)
RETURNS TABLE (
  id UUID,
  license_key TEXT,
  hwid TEXT,
  tier TEXT,
  status TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.id,
    l.license_key,
    l.hwid,
    l.tier,
    l.status,
    l.created_at,
    l.updated_at
  FROM public.licenses l
  WHERE l.license_key = upper(trim(p_license_key));
$$;

-- Grant execute to anon (Electron client) and authenticated (future use)
GRANT EXECUTE ON FUNCTION public.fetch_license_by_key(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.fetch_license_by_key(TEXT) TO authenticated;

-- ─── 2. bind_license_hwid ───────────────────────────────────────────────────
-- Allows the Electron client to bind a license to a hardware ID.
-- CRITICAL SECURITY GUARD: Only binds if hwid IS NULL (unbound license).
-- This prevents:
--   - Rebinding an already-bound license to a different machine
--   - Targeting another user's license (license_key must match)
--   - Modifying tier, status, or any server-managed field
-- The trigger handle_updated_at auto-sets updated_at.

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

  -- Only bind if the license exists AND hwid is currently NULL (unbound)
  UPDATE public.licenses
  SET hwid = p_hwid
  WHERE license_key = v_normalized_key
    AND hwid IS NULL;

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

-- Grant execute to anon (Electron client) and authenticated (future use)
GRANT EXECUTE ON FUNCTION public.bind_license_hwid(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.bind_license_hwid(TEXT, TEXT) TO authenticated;

-- ─── 3. Revoke direct table access from anon ────────────────────────────────
-- Explicitly revoke direct SELECT/UPDATE/INSERT on licenses from anon.
-- This ensures the client CANNOT bypass the RPC functions.

REVOKE SELECT ON public.licenses FROM anon;
REVOKE UPDATE ON public.licenses FROM anon;
REVOKE INSERT ON public.licenses FROM anon;
REVOKE DELETE ON public.licenses FROM anon;

-- ─── 4. Verification query (run after migration to confirm) ──────────────────
-- SELECT
--   schemaname,
--   tablename,
--   policyname,
--   roles,
--   cmd,
--   qual,
--   with_check
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'licenses'
-- ORDER BY policyname;
