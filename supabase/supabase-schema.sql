CREATE TABLE IF NOT EXISTS public.licenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    license_key TEXT NOT NULL,
    product_code TEXT NOT NULL,
    status TEXT NOT NOT NULL DEFAULT 'active',
    purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uc_license_key UNIQUE (license_key)
);

COMMENT ON TABLE public.licenses IS 'Stores license keys purchased by users';