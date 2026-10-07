-- ============================================================================
-- Migration: STEP 76 — License Entitlement Hardening
--
-- Closes STEP 75 license-delivery-boundary findings:
--   M-1  fetch_license_by_key now returns the authoritative subscription
--        columns so the server can enforce subscription entitlement
--        (previously the 7-column RPC omitted them, so production lookups
--        always fell back to the static `status` column, which the Stripe
--        webhook never updates).
--   L-1  EXECUTE on both client RPCs is revoked from PUBLIC/anon/
--        authenticated and granted to service_role ONLY. The Electron
--        client now calls the backend HTTP API (STEP 76 transport change),
--        so no public role needs database-level EXECUTE.
--   L-2  bind_license_hwid is hardened: input format guard (64 hex chars),
--        lowercase/trim normalization, status='active' guard, and the
--        function only returns a row when the license is bound to the
--        REQUESTED hwid (so a lost bind race can no longer look like
--        success to the caller).
--
-- Notes:
--   - Stripe subscription identifiers are intentionally NOT exposed by the
--     RPC (payment metadata); entitlement is decided from
--     subscription_status / current_period_end / cancel_at_period_end.
--   - Subscription *policy* (grace periods, past_due windows) stays in
--     server/services/licenseService.js so SQL and JS cannot drift apart.
--   - Rows created before subscription columns existed have
--     subscription_status IS NULL and keep using the legacy `status` check.
-- ============================================================================

-- ─── 1. fetch_license_by_key — entitlement-aware output ─────────────────────

CREATE OR REPLACE FUNCTION public.fetch_license_by_key(p_license_key TEXT)
RETURNS TABLE (
  id UUID,
  license_key TEXT,
  hwid TEXT,
  tier TEXT,
  status TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  subscription_status TEXT,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN
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
    l.updated_at,
    l.subscription_status,
    l.current_period_end,
    l.cancel_at_period_end
  FROM public.licenses l
  WHERE l.license_key = upper(trim(p_license_key));
$$;

-- L-1: no public role may execute the license RPCs — service_role only.
REVOKE EXECUTE ON FUNCTION public.fetch_license_by_key(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fetch_license_by_key(TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fetch_license_by_key(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fetch_license_by_key(TEXT) TO service_role;

-- ─── 2. bind_license_hwid — hardened atomic bind ────────────────────────────
-- CRITICAL SECURITY GUARD: only binds if hwid IS NULL (unbound license).
-- STEP 76 additions:
--   * rejects malformed hardware IDs (must be 64 lowercase hex chars)
--   * only binds licenses whose status is 'active'
--   * returns a row ONLY when the stored hwid equals the requested hwid,
--     so callers cannot mistake a lost race (or a rejected bind) for success

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
  v_normalized_hwid TEXT;
BEGIN
  v_normalized_key := upper(trim(p_license_key));
  v_normalized_hwid := lower(trim(p_hwid));

  -- Format guard: refuse anything that is not a canonical HWID.
  IF v_normalized_hwid IS NULL OR v_normalized_hwid !~ '^[a-f0-9]{64}$' THEN
    RETURN;
  END IF;

  -- Only bind if the license exists, is active, AND hwid is currently NULL.
  UPDATE public.licenses
  SET hwid = v_normalized_hwid
  WHERE license_key = v_normalized_key
    AND hwid IS NULL
    AND status = 'active';
  -- updated_at is handled by the set_licenses_updated_at trigger.

  -- Return the record only when it is actually bound to the requested HWID.
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
  WHERE l.license_key = v_normalized_key
    AND l.hwid = v_normalized_hwid;
END;
$$;

-- L-1: service_role only (the server routes every bind through this RPC).
REVOKE EXECUTE ON FUNCTION public.bind_license_hwid(TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bind_license_hwid(TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.bind_license_hwid(TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.bind_license_hwid(TEXT, TEXT) TO service_role;

-- ─── 3. Verification queries (run after migration) ──────────────────────────
-- SELECT p.oid::regprocedure, p.prosecdef, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute
-- FROM pg_proc p WHERE p.proname IN ('fetch_license_by_key', 'bind_license_hwid');
