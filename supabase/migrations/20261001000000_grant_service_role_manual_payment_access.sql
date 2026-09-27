-- ==============================================================================
-- STEP 46C MIGRATION: Grant service_role access to manual payment tables
-- Depends on: 20260926000000_create_manual_payments_and_audit_log.sql
-- ==============================================================================
--
-- WHY: 20260926 creates public.manual_payments and public.audit_log but issues
--   no table GRANTs (it only REVOKEs anon/authenticated). In production the
--   project's default privileges do not grant table privileges to service_role,
--   so every service-role read/write on these two tables failed with:
--     42501 permission denied for table manual_payments / audit_log
--   Observed in production as the admin dashboard list/count failure; applied
--   manually in production and persisted here for environment parity.
--
-- SCOPE / OWNERSHIP:
--   - Exactly two GRANT statements, both to service_role only.
--   - Grants NOTHING to anon or authenticated — 20260926's REVOKEs stay in
--     force and the RLS policies remain the second line of defence.
--   - Does NOT modify RLS flags, policies, table structure, constraints,
--     indexes, triggers or RPCs. Contains no CREATE/ALTER/DROP statements.
--
-- IDEMPOTENCY:
--   PostgreSQL GRANT is idempotent: re-running yields the same privilege state
--   and raises no error (no duplicate privileges are created), so this
--   migration is safe to re-apply.
--
-- ORDERING: must run AFTER 20260926000000 (the tables must exist).
-- ==============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.manual_payments TO service_role;
GRANT SELECT, INSERT ON TABLE public.audit_log TO service_role;
