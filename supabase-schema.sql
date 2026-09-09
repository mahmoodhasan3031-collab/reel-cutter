-- ==============================================================================
-- Supabase Schema: Reel Cutter Licensing System
-- Table: licenses
-- ==============================================================================

-- 1. Create the licenses table
CREATE TABLE IF NOT EXISTS public.licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_key TEXT NOT NULL UNIQUE,
  customer_email TEXT,
  transaction_id TEXT,
  payment_provider TEXT DEFAULT 'stripe',
  email_status TEXT NOT NULL DEFAULT 'pending' CHECK (email_status IN ('pending', 'sent', 'failed')),
  email_sent_at TIMESTAMPTZ,
  email_error TEXT,
  email_attempts INTEGER NOT NULL DEFAULT 0,
  email_last_attempt_at TIMESTAMPTZ,
  hwid TEXT,
  tier TEXT NOT NULL DEFAULT 'standard' CHECK (tier IN ('basic', 'standard', 'pro')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Indexes for performance and customer support lookups
CREATE INDEX IF NOT EXISTS idx_licenses_license_key ON public.licenses (license_key);
CREATE INDEX IF NOT EXISTS idx_licenses_customer_email ON public.licenses (customer_email);
CREATE INDEX IF NOT EXISTS idx_licenses_transaction_id ON public.licenses (transaction_id);
CREATE INDEX IF NOT EXISTS idx_licenses_email_status ON public.licenses (email_status);
CREATE INDEX IF NOT EXISTS idx_licenses_hwid ON public.licenses (hwid);
CREATE INDEX IF NOT EXISTS idx_licenses_status ON public.licenses (status);

-- 3. Trigger to auto-update updated_at on record updates
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_licenses_updated_at ON public.licenses;
CREATE TRIGGER set_licenses_updated_at
BEFORE UPDATE ON public.licenses
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;

-- 5. Access Policies
-- The Electron main process should use the Supabase SERVICE_ROLE key, which
-- automatically bypasses RLS. If an anon key is used, read/activate RPCs can be scoped:
CREATE POLICY "Allow service role full access" ON public.licenses
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 6. Sample Initial Seed Licenses (For Testing & Production Setup)
INSERT INTO public.licenses (license_key, tier, status)
VALUES
  ('PRO-REEL-7890-ABCD-1234', 'pro', 'active'),
  ('STD-REEL-4567-EFGH-5678', 'standard', 'active'),
  ('BAS-REEL-1234-IJKL-9012', 'basic', 'active'),
  ('PRO-REEL-REVOKED-9999', 'pro', 'revoked')
ON CONFLICT (license_key) DO NOTHING;

-- ==============================================================================
-- 7. Safe Migration for Existing Databases
-- Run these blocks if the `licenses` table already exists in your Supabase project:
-- ==============================================================================
--
-- STEP 2B MIGRATION (Customer tracking):
-- ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS customer_email TEXT;
-- ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS transaction_id TEXT;
-- ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS payment_provider TEXT DEFAULT 'stripe';
-- CREATE INDEX IF NOT EXISTS idx_licenses_customer_email ON public.licenses (customer_email);
-- CREATE INDEX IF NOT EXISTS idx_licenses_transaction_id ON public.licenses (transaction_id);
--
-- STEP 2C MIGRATION (Email delivery hardening & status tracking):
-- ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS email_status TEXT NOT NULL DEFAULT 'pending' CHECK (email_status IN ('pending', 'sent', 'failed'));
-- ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;
-- ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS email_error TEXT;
-- ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS email_attempts INTEGER NOT NULL DEFAULT 0;
-- ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS email_last_attempt_at TIMESTAMPTZ;
-- CREATE INDEX IF NOT EXISTS idx_licenses_email_status ON public.licenses (email_status);


