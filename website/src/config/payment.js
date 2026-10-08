/**
 * Payment Configuration for Stripe Integration
 *
 * This file defines the structure for Stripe Price IDs and payment configuration.
 * All sensitive keys (Stripe secret key, webhook secret, Supabase service-role key)
 * MUST be stored in environment variables on the server side — never in client code.
 *
 * Environment Variables Required (server-side only):
 *   STRIPE_SECRET_KEY          - Stripe API secret key
 *   STRIPE_WEBHOOK_SECRET      - Stripe webhook signing secret
 *   STRIPE_PRICE_BASIC         - Stripe Price ID for Basic tier
 *   STRIPE_PRICE_STANDARD      - Stripe Price ID for Standard tier
 *   STRIPE_PRICE_PRO           - Stripe Price ID for Pro tier
 *
 * DO NOT commit .env files or expose these values in client-side code.
 */

/**
 * Stripe mode for the checkout UI. Read from NEXT_PUBLIC_STRIPE_MODE.
 * Fail closed: a production build must never silently pick a mode.
 */
function resolveStripeMode(raw) {
  const value = (raw || '').trim().toLowerCase();
  if (value === 'test' || value === 'live') return value;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '[payment] NEXT_PUBLIC_STRIPE_MODE must be explicitly set to "test" or ' +
        '"live" for a production build. Set it in the deployment environment ' +
        'and rebuild.',
    );
  }
  return 'test';
}

const STRIPE_MODE = resolveStripeMode(process.env.NEXT_PUBLIC_STRIPE_MODE);

const PAYMENT_CONFIG = {
  isLive: STRIPE_MODE === 'live',
  mode: STRIPE_MODE,
  methods: ['card'],
  currency: 'usd',
  checkoutEndpoint: '/api/payment/create-checkout-session',
  webhookEndpoint: '/webhook/stripe',
};

const PLAN_STRIPE_PRICE_MAP = {
  basic: process.env.STRIPE_PRICE_BASIC || null,
  standard: process.env.STRIPE_PRICE_STANDARD || null,
  pro: process.env.STRIPE_PRICE_PRO || null,
};

function isPaymentConfigured() {
  return Object.values(PLAN_STRIPE_PRICE_MAP).every((id) => id !== null);
}

module.exports = {
  STRIPE_MODE,
  PAYMENT_CONFIG,
  PLAN_STRIPE_PRICE_MAP,
  isPaymentConfigured,
};
