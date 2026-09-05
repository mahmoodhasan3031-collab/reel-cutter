require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT || '3001', 10),
  appDownloadUrl: process.env.APP_DOWNLOAD_URL || 'https://reelcutter.app/download',

  // Stripe Configuration
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || 'sk_test_mock_stripe_key',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || 'whsec_mock_stripe_webhook_secret',
    priceIds: {
      [process.env.STRIPE_PRICE_BASIC || 'price_basic_10']: 'basic',
      [process.env.STRIPE_PRICE_STANDARD || 'price_standard_20']: 'standard',
      [process.env.STRIPE_PRICE_PRO || 'price_pro_30']: 'pro',
    },
    tierPrices: {
      basic: { amount: 10, currency: 'usd', name: 'Basic Tier' },
      standard: { amount: 20, currency: 'usd', name: 'Standard Tier' },
      pro: { amount: 30, currency: 'usd', name: 'Pro Tier' },
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
};
