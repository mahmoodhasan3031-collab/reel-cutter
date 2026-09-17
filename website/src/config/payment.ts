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

export interface StripePriceConfig {
  basic: string | null;
  standard: string | null;
  pro: string | null;
}

/**
 * Client-safe payment configuration.
 * This contains only non-sensitive information safe for browser use.
 *
 * Actual Stripe Price IDs should be resolved server-side when creating
 * checkout sessions. This config is for display/validation purposes only.
 */
export const PAYMENT_CONFIG = {
  /**
   * Whether Stripe payment integration is live.
   * Set to true only after full payment flow is implemented and tested.
   */
  isLive: false,

  /**
   * Supported payment methods.
   */
  methods: ["card"] as const,

  /**
   * Currency for all transactions.
   */
  currency: "usd",

  /**
   * Server endpoint for creating checkout sessions.
   * This endpoint must validate the plan server-side and never trust client-submitted prices.
   */
  checkoutEndpoint: "/api/checkout",

  /**
   * Server endpoint for webhook verification.
   */
  webhookEndpoint: "/api/webhooks/stripe",
} as const;

/**
 * Plan-to-Price mapping structure.
 *
 * In production, the server resolves these from environment variables:
 *   process.env.STRIPE_PRICE_BASIC → "price_xxx"
 *   process.env.STRIPE_PRICE_STANDARD → "price_yyy"
 *   process.env.STRIPE_PRICE_PRO → "price_zzz"
 *
 * The website NEVER sends or validates Stripe Price IDs directly.
 * The server determines the correct Price ID based on the validated plan ID.
 */
export const PLAN_STRIPE_PRICE_MAP = {
  basic: null as string | null,
  standard: null as string | null,
  pro: null as string | null,
} satisfies StripePriceConfig;

/**
 * Validate that the payment configuration is complete.
 * Returns true if all required Price IDs are configured.
 */
export function isPaymentConfigured(): boolean {
  return Object.values(PLAN_STRIPE_PRICE_MAP).every((id) => id !== null);
}
