-- ==============================================================================
-- STEP 82: Fix public.bind_license_hwid ambiguous UPDATE (regression of Step 27)
-- Migration: 20261014000000_fix_bind_license_hwid_ambiguity_regression.sql
-- Depends on: 20261002000000_step76_license_entitlement_hardening.sql (Step 76)
--
-- DEFECT (repository source, confirmed at HEAD 7f72e9b; production UNKNOWN):
--   Step 27 (20260927000000) fixed SQLSTATE 42P03 by aliasing the UPDATE target
--   and qualifying every column reference:
--
--     UPDATE public.licenses l
--     SET hwid = p_hwid
--     WHERE l.license_key = v_normalized_key
--       AND l.hwid IS NULL;
--
--   Step 76 rewrote the function and dropped that alias. Its UPDATE reads:
--
--     UPDATE public.licenses
--     SET hwid = v_normalized_hwid
--     WHERE license_key = v_normalized_key
--       AND hwid IS NULL
--       AND status = 'active';
--
--   Because RETURNS TABLE(id, license_key, hwid, tier, status, created_at,
--   updated_at) declares PL/pgSQL variables named license_key, hwid and status,
--   each unqualified WHERE reference resolves to BOTH a table column and a
--   function variable and raises:
--
--     ERROR: column reference "license_key" is ambiguous (SQLSTATE 42P03)
--
--   — the exact failure documented by 20260927000000 (fail-closed: the statement
--   aborts before any write, so no wrong binding can occur, but a valid unbound
--   license can never be bound).
--
-- FIX (the only function-body change):
--   Alias the UPDATE target (AS l) and qualify all three WHERE predicates:
--     l.license_key, l.hwid, l.status
--   The SET target column stays unqualified, exactly as in the working
--   Step 27 version.
--
-- SCOPE / OWNERSHIP:
--   - Replaces ONLY public.bind_license_hwid(text, text), sourced verbatim from
--     the tracked Step 76 definition plus the UPDATE correction above.
--   - UNCHANGED: signature, RETURNS TABLE columns, upper(trim(...)) /
--     lower(trim(...)) normalization, 64-lowercase-hex format guard (rejected
--     before the UPDATE), status = 'active' guard, hwid IS NULL guard,
--     "return a row only when bound to the requested hwid" RETURN QUERY,
--     SECURITY DEFINER, SET search_path = public, and fail-closed behavior.
--   - NOT touched: fetch_license_by_key, any other function, table, index,
--     trigger, policy, RLS setting, or constraint.
--   - Permissions: the Step 76 EXECUTE statements are re-asserted VERBATIM
--     (idempotent no-ops when Step 76 already ran; no grant is invented and
--     none is weakened). CREATE OR REPLACE preserves existing ACLs regardless.
--   - fetch_license_by_key is intentionally NOT redefined here: its body has no
--     ambiguity defect, so it is left exactly as the chain defines it.
--
-- PRODUCTION STATUS: the live function definition has NOT been verified. This
-- migration must be reviewed and applied only with explicit authorization,
-- never automatically. Applying it is out of scope for its own preparation.
-- ==============================================================================

-- ─── 1. bind_license_hwid — Step 76 body with the aliased/qualified UPDATE ───

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
  -- STEP 82: target aliased and every WHERE predicate l-qualified so the
  -- OUT-column variables (license_key, hwid, status) can never be ambiguous.
  UPDATE public.licenses AS l
  SET hwid = v_normalized_hwid
  WHERE l.license_key = v_normalized_key
    AND l.hwid IS NULL
    AND l.status = 'active';
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
-- Re-asserted verbatim from Step 76 — idempotent, no new grant, no weakening.
REVOKE EXECUTE ON FUNCTION public.bind_license_hwid(TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bind_license_hwid(TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.bind_license_hwid(TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.bind_license_hwid(TEXT, TEXT) TO service_role;

-- ─── 2. Verification (definition inspection only — never calls the function,
--        never reads or modifies license rows) ───────────────────────────────

DO $$
DECLARE
  v_src TEXT;
  v_prosecdef BOOLEAN;
  v_proconfig TEXT[];
BEGIN
  IF to_regprocedure('public.bind_license_hwid(text, text)') IS NULL THEN
    RAISE EXCEPTION 'STEP 82 BIND FIX FAILED: public.bind_license_hwid(text, text) does not exist';
  END IF;

  SELECT p.prosrc, p.prosecdef, p.proconfig
    INTO v_src, v_prosecdef, v_proconfig
  FROM pg_proc p
  WHERE p.oid = 'public.bind_license_hwid(text, text)'::regprocedure;

  IF v_prosecdef IS NOT TRUE THEN
    RAISE EXCEPTION 'STEP 82 BIND FIX FAILED: bind_license_hwid is missing or not SECURITY DEFINER';
  END IF;

  IF v_proconfig IS NULL OR NOT (v_proconfig @> ARRAY['search_path=public']) THEN
    RAISE EXCEPTION 'STEP 82 BIND FIX FAILED: SET search_path = public was not preserved';
  END IF;

  IF strpos(v_src, 'UPDATE public.licenses AS l') = 0 THEN
    RAISE EXCEPTION 'STEP 82 BIND FIX FAILED: UPDATE target alias (AS l) missing from bind_license_hwid';
  END IF;

  IF strpos(v_src, 'WHERE l.license_key = v_normalized_key') = 0
     OR strpos(v_src, 'AND l.hwid IS NULL') = 0
     OR strpos(v_src, 'AND l.status = ''active''') = 0 THEN
    RAISE EXCEPTION 'STEP 82 BIND FIX FAILED: one or more UPDATE predicates are not l-qualified';
  END IF;

  IF strpos(v_src, 'WHERE license_key') > 0 THEN
    RAISE EXCEPTION 'STEP 82 BIND FIX FAILED: unqualified WHERE license_key still present (ambiguous reference)';
  END IF;

  RAISE NOTICE 'STEP 82 BIND FIX APPLIED: bind_license_hwid UPDATE is aliased and l-qualified; SECURITY DEFINER and search_path preserved';
END $$;
