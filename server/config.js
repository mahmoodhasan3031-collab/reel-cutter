require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT || '3001', 10),
  appDownloadUrl: process.env.APP_DOWNLOAD_URL || 'https://reelcutter.app/download',

  // Stripe Configuration — reject startup if secrets are missing in production
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || (process.env.NODE_ENV === 'production' ? (() => { throw new Error('STRIPE_SECRET_KEY is required in production') })() : 'sk_test_mock_stripe_key'),
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || (process.env.NODE_ENV === 'production' ? (() => { throw new Error('STRIPE_WEBHOOK_SECRET is required in production') })() : 'whsec_mock_stripe_webhook_secret'),
    // Monthly recurring Price IDs — each env var maps to a tier
    priceIds: {
      [process.env.STRIPE_PRICE_BASIC || 'price_basic_monthly_10']: 'basic',
      [process.env.STRIPE_PRICE_STANDARD || 'price_standard_monthly_20']: 'standard',
      [process.env.STRIPE_PRICE_PRO || 'price_pro_monthly_30']: 'pro',
    },
    tierPrices: {
      basic: { amount: 10, currency: 'usd', name: 'Basic Tier', interval: 'month' },
      standard: { amount: 20, currency: 'usd', name: 'Standard Tier', interval: 'month' },
      pro: { amount: 30, currency: 'usd', name: 'Pro Tier', interval: 'month' },
    },
  },

  // Email Configuration (Nodemailer / Resend)
  email: {
    from: process.env.EMAIL_FROM || 'Reel Cutter <support@reelcutter.app>',
    resendApiKey: process.env.RESEND_API_KEY || '',
    smtp: {
      host: process.env.SMTP_HOST || '',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
  },

  // Supabase Database
  supabase: {
    url: process.env.SUPABASE_URL || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },

  // Admin Authentication (STEP 19) — backend-only payment review admin.
  // Credentials come exclusively from environment variables. No hardcoded
  // passwords. ADMIN_PASSWORD_HASH must be a scrypt hash generated with:
  //   node server/scripts/generateAdminPasswordHash.js "<password>"
  admin: {
    username: process.env.ADMIN_USERNAME || '',
    passwordHash: process.env.ADMIN_PASSWORD_HASH || '',
    sessionSecret: process.env.ADMIN_SESSION_SECRET || '',
    sessionTtlSeconds: parseInt(process.env.ADMIN_SESSION_TTL_SECONDS || '1800', 10),
  },
};
