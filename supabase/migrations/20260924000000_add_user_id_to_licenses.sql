-- ==============================================================================
-- STEP 27 MIGRATION: Add user_id to licenses table
-- Connect licenses to authenticated Supabase users
-- ==============================================================================
--
-- This migration adds a user_id column to link licenses to authenticated
-- Supabase users. Existing licenses without a user_id remain valid;
-- new licenses created after this migration will have a user_id set.
--
-- During upgrade, you may wish to run:
--   UPDATE public.licenses SET user_id = auth.users.id
--   FROM auth.users
--   WHERE public.licenses.customer_email = auth.users.email;
--
-- To preserve backward compatibility, user_id is nullable.

-- 1. Add user_id column to licenses table
ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS user_id UUID;

-- 2. Add index for user-based lookups
CREATE INDEX IF NOT EXISTS idx_licenses_user_id ON public.licenses (user_id);

-- 3. Update comment/description for documentation
COMMENT ON COLUMN public.licenses.user_id IS 'Supabase auth user ID linking this license to a customer account. Set via webhook or admin operation. Nullable for backward compatibility.';

-- ==============================================================================
-- NOTES:
-- - This migration is cumulative and does not modify or remove any existing columns
-- - Existing licenses (created before this migration) will have user_id = NULL
-- - New licenses created after this migration should have user_id populated
-- - The Electron main process uses service_role key and can set user_id directly
-- - The website dashboard uses authenticated Supabase sessions to query by user_id
-- ==============================================================================