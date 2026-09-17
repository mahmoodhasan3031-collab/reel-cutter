/**
 * Payment Configuration for Future Stripe Integration
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

const PAYMENT_CONFIG = {
  isLive: false,
  methods: ["card"],
  currency: "usd",
  checkoutEndpoint: "/api/checkout",
  webhookEndpoint: "/api/webhooks/stripe",
};

const PLAN_STRIPE_PRICE_MAP = {
  basic: null,
  standard: null,
  pro: null,
};

function isPaymentConfigured() {
  return Object.values(PLAN_STRIPE_PRICE_MAP).every((id) => id !== null);
}

module.exports = {
  PAYMENT_CONFIG,
  PLAN_STRIPE_PRICE_MAP,
  isPaymentConfigured,
};
