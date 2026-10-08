-- ==============================================================================
-- STEP 49 — READ-ONLY PRODUCTION VERIFICATION SCRIPT
-- Closes the 5 NOT VERIFIED items from the STEP 48 audit:
--   (1) RLS flags + exact policy definitions on licenses / manual_payments /
--       audit_log  (JWT-email binding, status-pending, NULL-on-insert)
--   (2) ensure_rls event trigger
--   (3) RPC function signatures / SECURITY DEFINER / search_path / bodies
--   (4) service_role table GRANTs (licenses DML, manual_payments DML,
--       audit_log SELECT+INSERT)
--   (5) Render deployed commit  ->  NOT SQL; verify in Render dashboard.
--
-- HOW TO RUN:
--   Supabase Dashboard -> production project (pyrtitvvwxrwhmdfrjsb.supabase.co)
--   -> SQL Editor -> New query -> paste this ENTIRE file -> Run.
--   Copy ALL rows of every result set back into the chat.
--
-- SAFETY:
--   Contains ONLY SELECT statements over system catalogs (pg_class,
--   pg_policies, pg_proc, pg_event_trigger, pg_namespace,
--   has_table_privilege). No DDL, no DML, no function execution, no table
--   data reads, no secret values. It is safe to run in production.
--
-- EXPECTED OUTPUT: Result set 1 = exactly 19 rows, every result = 'PASS'.
--   Result sets 2-4 are evidence/detail (inventory, function bodies,
--   grant matrix).
-- ==============================================================================


-- ─── RESULT SET 1 — SUMMARY: all 19 checks (check_id | result | evidence) ────

SELECT '1.rls.licenses' AS check_id,
       CASE WHEN c.relrowsecurity AND NOT c.relforcerowsecurity
            THEN 'PASS' ELSE 'FAIL' END AS result,
       format('relrowsecurity=%s, relforcerowsecurity=%s (expected true/false)',
              c.relrowsecurity, c.relforcerowsecurity) AS evidence
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'licenses'

UNION ALL
SELECT '1.rls.manual_payments',
       CASE WHEN c.relrowsecurity AND NOT c.relforcerowsecurity
            THEN 'PASS' ELSE 'FAIL' END,
       format('relrowsecurity=%s, relforcerowsecurity=%s (expected true/false)',
              c.relrowsecurity, c.relforcerowsecurity)
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'manual_payments'

UNION ALL
SELECT '1.rls.audit_log',
       CASE WHEN c.relrowsecurity AND NOT c.relforcerowsecurity
            THEN 'PASS' ELSE 'FAIL' END,
       format('relrowsecurity=%s, relforcerowsecurity=%s (expected true/false)',
              c.relrowsecurity, c.relforcerowsecurity)
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'audit_log'

-- 2.1 licenses: service_role ALL policy (expected name "Allow service role full access")
UNION ALL
SELECT '2.policies.licenses.service_role_all',
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_policies p
         WHERE p.schemaname = 'public' AND p.tablename = 'licenses'
           AND p.cmd = 'ALL' AND p.roles @> ARRAY['service_role']::name[]
       ) THEN 'PASS' ELSE 'FAIL' END,
       COALESCE((SELECT string_agg(p.policyname || ' [cmd=' || p.cmd || ']',
                                   ' | ' ORDER BY p.policyname)
                 FROM pg_policies p
                 WHERE p.schemaname = 'public' AND p.tablename = 'licenses'
                   AND p.cmd = 'ALL' AND p.roles @> ARRAY['service_role']::name[]),
                '(not found)')

-- 2.2 licenses: authenticated own-license SELECT policy (USING user_id = auth.uid())
UNION ALL
SELECT '2.policies.licenses.authenticated_select_own',
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_policies p
         WHERE p.schemaname = 'public' AND p.tablename = 'licenses'
           AND p.cmd = 'SELECT' AND p.roles @> ARRAY['authenticated']::name[]
           AND p.qual ILIKE '%user_id%'
           AND p.qual ILIKE '%auth.uid()%'
       ) THEN 'PASS' ELSE 'FAIL' END,
       COALESCE((SELECT 'USING (' || p.qual || ')'
                 FROM pg_policies p
                 WHERE p.schemaname = 'public' AND p.tablename = 'licenses'
                   AND p.cmd = 'SELECT' AND p.roles @> ARRAY['authenticated']::name[]
                   AND p.qual ILIKE '%user_id%' AND p.qual ILIKE '%auth.uid()%'
                 LIMIT 1),
                '(not found)')

-- 2.3 manual_payments: service_role ALL policy
UNION ALL
SELECT '2.policies.manual_payments.service_role_all',
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_policies p
         WHERE p.schemaname = 'public' AND p.tablename = 'manual_payments'
           AND p.cmd = 'ALL' AND p.roles @> ARRAY['service_role']::name[]
       ) THEN 'PASS' ELSE 'FAIL' END,
       COALESCE((SELECT string_agg(p.policyname || ' [cmd=' || p.cmd || ']',
                                   ' | ' ORDER BY p.policyname)
                 FROM pg_policies p
                 WHERE p.schemaname = 'public' AND p.tablename = 'manual_payments'
                   AND p.cmd = 'ALL' AND p.roles @> ARRAY['service_role']::name[]),
                '(not found)')

-- 2.4 manual_payments: hardened authenticated INSERT policy (20260929)
--     lower(customer_email) = lower(auth.jwt()->>'email')
--     AND status = 'pending' AND license_id IS NULL
--     AND reviewed_by IS NULL AND reviewed_at IS NULL
UNION ALL
SELECT '2.policies.manual_payments.insert_hardened_jwt',
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_policies p
         WHERE p.schemaname = 'public' AND p.tablename = 'manual_payments'
           AND p.cmd = 'INSERT'
           AND p.roles @> ARRAY['authenticated']::name[]
           AND p.with_check ILIKE '%auth.jwt()%'
           AND p.with_check ILIKE '%lower(customer_email)%'
           AND p.with_check ILIKE '%email%'
           AND p.with_check ILIKE '%status%'
           AND p.with_check ILIKE '%pending%'
           AND p.with_check ILIKE '%license_id IS NULL%'
           AND p.with_check ILIKE '%reviewed_by IS NULL%'
           AND p.with_check ILIKE '%reviewed_at IS NULL%'
       ) THEN 'PASS' ELSE 'FAIL' END,
       COALESCE((SELECT 'WITH CHECK (' || p.with_check || ')'
                 FROM pg_policies p
                 WHERE p.schemaname = 'public' AND p.tablename = 'manual_payments'
                   AND p.cmd = 'INSERT'
                   AND p.roles @> ARRAY['authenticated']::name[]
                 LIMIT 1),
                '(not found)')

-- 2.5 manual_payments: authenticated SELECT policy bound to JWT email (20260930)
UNION ALL
SELECT '2.policies.manual_payments.select_jwt_email',
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_policies p
         WHERE p.schemaname = 'public' AND p.tablename = 'manual_payments'
           AND p.cmd = 'SELECT'
           AND p.roles @> ARRAY['authenticated']::name[]
           AND p.qual ILIKE '%auth.jwt()%'
           AND p.qual ILIKE '%lower(customer_email)%'
           AND p.qual ILIKE '%email%'
       ) THEN 'PASS' ELSE 'FAIL' END,
       COALESCE((SELECT 'USING (' || p.qual || ')'
                 FROM pg_policies p
                 WHERE p.schemaname = 'public' AND p.tablename = 'manual_payments'
                   AND p.cmd = 'SELECT'
                   AND p.roles @> ARRAY['authenticated']::name[]
                 LIMIT 1),
                '(not found)')

-- 2.6 manual_payments: no anon policies (0926 REVOKEs remain the table-level line)
UNION ALL
SELECT '2.policies.manual_payments.no_anon_policies',
       CASE WHEN NOT EXISTS (
         SELECT 1 FROM pg_policies p
         WHERE p.schemaname = 'public' AND p.tablename = 'manual_payments'
           AND 'anon' = ANY (p.roles)
       ) THEN 'PASS' ELSE 'FAIL' END,
       COALESCE((SELECT string_agg(p.policyname || ' -> ' ||
                                   array_to_string(p.roles, ','), ' | ')
                 FROM pg_policies p
                 WHERE p.schemaname = 'public' AND p.tablename = 'manual_payments'
                   AND 'anon' = ANY (p.roles)),
                'no anon policies (expected)')

-- 2.7 manual_payments: exactly 3 policies (0929's own fail-closed invariant)
UNION ALL
SELECT '2.policies.manual_payments.policy_count_eq_3',
       CASE WHEN (SELECT count(*) FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'manual_payments') = 3
            THEN 'PASS' ELSE 'FAIL' END,
       'policy count = ' || (SELECT count(*) FROM pg_policies
                             WHERE schemaname = 'public'
                               AND tablename = 'manual_payments')

-- 2.8 audit_log: service_role policy present
UNION ALL
SELECT '2.policies.audit_log.service_role_all',
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_policies p
         WHERE p.schemaname = 'public' AND p.tablename = 'audit_log'
           AND p.cmd = 'ALL' AND p.roles @> ARRAY['service_role']::name[]
       ) THEN 'PASS' ELSE 'FAIL' END,
       COALESCE((SELECT string_agg(p.policyname || ' [cmd=' || p.cmd || ']',
                                   ' | ' ORDER BY p.policyname)
                 FROM pg_policies p
                 WHERE p.schemaname = 'public' AND p.tablename = 'audit_log'
                   AND p.cmd = 'ALL' AND p.roles @> ARRAY['service_role']::name[]),
                '(not found)')

-- 2.9 audit_log: no anon/authenticated policies (0926 revoked them; RLS denies all)
UNION ALL
SELECT '2.policies.audit_log.no_client_policies',
       CASE WHEN NOT EXISTS (
         SELECT 1 FROM pg_policies p
         WHERE p.schemaname = 'public' AND p.tablename = 'audit_log'
           AND (p.roles @> ARRAY['anon']::name[]
                OR p.roles @> ARRAY['authenticated']::name[])
       ) THEN 'PASS' ELSE 'FAIL' END,
       COALESCE((SELECT string_agg(p.policyname || ' -> ' ||
                                   array_to_string(p.roles, ','), ' | ')
                 FROM pg_policies p
                 WHERE p.schemaname = 'public' AND p.tablename = 'audit_log'
                   AND (p.roles @> ARRAY['anon']::name[]
                        OR p.roles @> ARRAY['authenticated']::name[])),
                'no anon/authenticated policies (expected)')

-- 3.1 RPC: fetch_license_by_key(p_license_key text)
--     expected: exactly 1 overload, SECURITY DEFINER, search_path=public
UNION ALL
SELECT '3.rpc.fetch_license_by_key',
       CASE WHEN s.matched = 1 AND s.overloads = 1
                 AND s.secdef
                 AND COALESCE(s.cfg, '') ILIKE '%search_path=public%'
            THEN 'PASS' ELSE 'FAIL' END,
       format('overloads(picker)=%s, matched_sig=%s, args=[%s], prosecdef=%s, proconfig=[%s], provolatile=%s',
              s.overloads, s.matched,
              COALESCE(s.args, '(function absent)'),
              COALESCE(s.secdef::text, '(absent)'),
              COALESCE(s.cfg, '(none)'),
              COALESCE(s.vol, '(absent)'))
FROM (
  SELECT (SELECT count(*)
          FROM pg_proc p2 JOIN pg_namespace n2 ON n2.oid = p2.pronamespace
          WHERE n2.nspname = 'public' AND p2.proname = 'fetch_license_by_key') AS overloads,
         count(*) AS matched,
         bool_or(p.prosecdef) AS secdef,
         min(array_to_string(p.proconfig, ', ')) AS cfg,
         min(p.provolatile) AS vol,
         min(pg_get_function_identity_arguments(p.oid)) AS args
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fetch_license_by_key'
    AND pg_get_function_identity_arguments(p.oid) = 'p_license_key text'
) s

-- 3.2 RPC: bind_license_hwid(p_license_key text, p_hwid text)
--     expected: exactly 1 overload (0927 fixed the ambiguity),
--     SECURITY DEFINER, search_path=public
UNION ALL
SELECT '3.rpc.bind_license_hwid',
       CASE WHEN s.matched = 1 AND s.overloads = 1
                 AND s.secdef
                 AND COALESCE(s.cfg, '') ILIKE '%search_path=public%'
            THEN 'PASS' ELSE 'FAIL' END,
       format('overloads(picker)=%s, matched_sig=%s, args=[%s], prosecdef=%s, proconfig=[%s], provolatile=%s',
              s.overloads, s.matched,
              COALESCE(s.args, '(function absent)'),
              COALESCE(s.secdef::text, '(absent)'),
              COALESCE(s.cfg, '(none)'),
              COALESCE(s.vol, '(absent)'))
FROM (
  SELECT (SELECT count(*)
          FROM pg_proc p2 JOIN pg_namespace n2 ON n2.oid = p2.pronamespace
          WHERE n2.nspname = 'public' AND p2.proname = 'bind_license_hwid') AS overloads,
         count(*) AS matched,
         bool_or(p.prosecdef) AS secdef,
         min(array_to_string(p.proconfig, ', ')) AS cfg,
         min(p.provolatile) AS vol,
         min(pg_get_function_identity_arguments(p.oid)) AS args
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'bind_license_hwid'
    AND pg_get_function_identity_arguments(p.oid) = 'p_license_key text, p_hwid text'
) s

-- 3.3 RPC: rls_auto_enable() (production-only, no repo reference)
--     expected: exactly 1 overload; attributes reported as evidence only
UNION ALL
SELECT '3.rpc.rls_auto_enable',
       CASE WHEN s.matched = 1 AND s.overloads = 1
            THEN 'PASS' ELSE 'FAIL' END,
       format('overloads(picker)=%s, matched_sig=%s, args=[%s], prosecdef=%s, proconfig=[%s], provolatile=%s, language=%s',
              s.overloads, s.matched,
              COALESCE(s.args, '(function absent)'),
              COALESCE(s.secdef::text, '(absent)'),
              COALESCE(s.cfg, '(none)'),
              COALESCE(s.vol, '(absent)'),
              COALESCE(s.lang, '(absent)'))
FROM (
  SELECT (SELECT count(*)
          FROM pg_proc p2 JOIN pg_namespace n2 ON n2.oid = p2.pronamespace
          WHERE n2.nspname = 'public' AND p2.proname = 'rls_auto_enable') AS overloads,
         count(*) AS matched,
         bool_or(p.prosecdef) AS secdef,
         min(array_to_string(p.proconfig, ', ')) AS cfg,
         min(p.provolatile) AS vol,
         min(pg_get_function_identity_arguments(p.oid)) AS args,
         min(l.lanname) AS lang
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  LEFT JOIN pg_language l ON l.oid = p.prolang
  WHERE n.nspname = 'public' AND p.proname = 'rls_auto_enable'
    AND pg_get_function_identity_arguments(p.oid) = ''
) s

-- 4. Event trigger: ensure_rls on ddl_command_end -> public.rls_auto_enable(),
--    enabled (evtenabled O/R/A)
UNION ALL
SELECT '4.event_trigger.ensure_rls',
       CASE WHEN t.oid IS NOT NULL
                 AND t.evtevent = 'ddl_command_end'
                 AND t.evtenabled IN ('O', 'R', 'A')
                 AND fn.nspname = 'public'
                 AND p.proname = 'rls_auto_enable'
            THEN 'PASS' ELSE 'FAIL' END,
       COALESCE(format('evtname=%s, evtevent=%s, evtenabled=%s (%s), function=%s.%s',
                       t.evtname, t.evtevent, t.evtenabled,
                       CASE t.evtenabled
                         WHEN 'D' THEN 'disabled'
                         WHEN 'O' THEN 'origin/enabled'
                         WHEN 'R' THEN 'replica'
                         WHEN 'A' THEN 'always'
                         ELSE 'unknown' END,
                       fn.nspname, p.proname),
                '(event trigger ensure_rls NOT FOUND)')
FROM (SELECT 'ensure_rls' AS nm) d
LEFT JOIN pg_event_trigger t ON t.evtname = d.nm
LEFT JOIN pg_proc p ON p.oid = t.evtfoid
LEFT JOIN pg_namespace fn ON fn.oid = p.pronamespace

-- 5.1 service_role effective DML grants on licenses (expected SELECT/INSERT/UPDATE/DELETE)
UNION ALL
SELECT '5.grants.licenses.service_role_dml',
       CASE WHEN has_table_privilege('service_role', 'public.licenses', 'SELECT')
                 AND has_table_privilege('service_role', 'public.licenses', 'INSERT')
                 AND has_table_privilege('service_role', 'public.licenses', 'UPDATE')
                 AND has_table_privilege('service_role', 'public.licenses', 'DELETE')
            THEN 'PASS' ELSE 'FAIL' END,
       'effective DML for service_role: ' || COALESCE(
         (SELECT string_agg(v.priv, ', ' ORDER BY v.priv)
          FROM (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) AS v(priv)
          WHERE has_table_privilege('service_role', 'public.licenses', v.priv)),
         '(none)')

-- 5.2 service_role effective DML grants on manual_payments (20261001: all 4)
UNION ALL
SELECT '5.grants.manual_payments.service_role_dml',
       CASE WHEN has_table_privilege('service_role', 'public.manual_payments', 'SELECT')
                 AND has_table_privilege('service_role', 'public.manual_payments', 'INSERT')
                 AND has_table_privilege('service_role', 'public.manual_payments', 'UPDATE')
                 AND has_table_privilege('service_role', 'public.manual_payments', 'DELETE')
            THEN 'PASS' ELSE 'FAIL' END,
       'effective DML for service_role: ' || COALESCE(
         (SELECT string_agg(v.priv, ', ' ORDER BY v.priv)
          FROM (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) AS v(priv)
          WHERE has_table_privilege('service_role', 'public.manual_payments', v.priv)),
         '(none)')

-- 5.3 service_role effective grants on audit_log (20261001: SELECT, INSERT;
--     extras reported in evidence but do not fail)
UNION ALL
SELECT '5.grants.audit_log.service_role_select_insert',
       CASE WHEN has_table_privilege('service_role', 'public.audit_log', 'SELECT')
                 AND has_table_privilege('service_role', 'public.audit_log', 'INSERT')
            THEN 'PASS' ELSE 'FAIL' END,
       'effective DML for service_role: ' || COALESCE(
         (SELECT string_agg(v.priv, ', ' ORDER BY v.priv)
          FROM (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) AS v(priv)
          WHERE has_table_privilege('service_role', 'public.audit_log', v.priv)),
         '(none)')
ORDER BY 1;


-- ─── RESULT SET 2 — POLICY INVENTORY (full definitions, evidence) ────────────

SELECT p.schemaname,
       p.tablename,
       p.policyname,
       p.permissive,
       p.roles,
       p.cmd,
       p.qual,
       p.with_check
FROM pg_policies p
WHERE p.schemaname = 'public'
  AND p.tablename IN ('licenses', 'manual_payments', 'audit_log')
ORDER BY p.tablename, p.policyname;


-- ─── RESULT SET 3 — RPC FUNCTION DEFINITIONS (signature + full body) ─────────

SELECT n.nspname || '.' || p.proname || '(' ||
         pg_get_function_identity_arguments(p.oid) || ')' AS function_signature,
       p.prosecdef AS security_definer,
       array_to_string(p.proconfig, ', ') AS search_path_config,
       p.provolatile AS volatility,
       pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('fetch_license_by_key', 'bind_license_hwid', 'rls_auto_enable')
ORDER BY 1;


-- ─── RESULT SET 4 — service_role GRANT MATRIX (effective privileges) ─────────

SELECT t.tbl AS table_name,
       v.priv AS privilege,
       has_table_privilege('service_role', 'public.' || t.tbl, v.priv) AS service_role_has
FROM (VALUES ('licenses'), ('manual_payments'), ('audit_log')) AS t(tbl)
CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
                   ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) AS v(priv)
ORDER BY 1, 2;
