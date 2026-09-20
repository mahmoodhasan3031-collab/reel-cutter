/**
 * Payment Configuration for Stripe Integration
 *
 * This file defines the client-safe payment configuration.
 * All sensitive keys (Stripe secret key, webhook secret, Supabase service-role key)
 * MUST be stored in environment variables on the server side — never in client code.
 *
 * Environment Variables Required (server-side only, on Render):
 *   STRIPE_SECRET_KEY          - Stripe API secret key
 *   STRIPE_WEBHOOK_SECRET      - Stripe webhook signing secret
 *   STRIPE_PRICE_BASIC         - Stripe Price ID for Basic tier
 *   STRIPE_PRICE_STANDARD      - Stripe Price ID for Standard tier
 *   STRIPE_PRICE_PRO           - Stripe Price ID for Pro tier
 *
 * Environment Variables Required (client-side, on Vercel):
 *   NEXT_PUBLIC_API_BASE_URL   - Backend API origin (e.g. https://reel-cutter.onrender.com)
 *
 * DO NOT commit .env files or expose these values in client-side code.
 */

/**
 * Stripe test mode indicator.
 * This is a TEST/Sandbox integration — not live payments.
 * Do not change to live mode without full payment flow verification.
 */
export const STRIPE_MODE = "test" as const;

/**
 * Client-safe payment configuration.
 * This contains only non-sensitive information safe for browser use.
 *
 * Actual Stripe Price IDs are resolved server-side when creating
 * checkout sessions. This config is for display/validation purposes only.
 */
export const PAYMENT_CONFIG = {
  /**
   * Whether Stripe payment integration is enabled.
   * True = checkout flow is active (TEST mode).
   * False = "Coming Soon" placeholder shown.
   */
  isLive: true,

  /**
   * Stripe mode: "test" or "live".
   * Must match the backend Stripe key mode.
   */
  mode: STRIPE_MODE,

  /**
   * Supported payment methods.
   */
  methods: ["card"] as const,

  /**
   * Currency for all transactions.
   */
  currency: "usd",

  /**
   * Backend API base URL for creating checkout sessions.
   * Uses NEXT_PUBLIC_API_BASE_URL environment variable.
   * Falls back to localhost for development.
   */
  get apiBaseUrl(): string {
    return process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001";
  },

  /**
   * Full backend endpoint for creating checkout sessions.
   * The backend validates the plan server-side and never trusts client-submitted prices.
   */
  get checkoutEndpoint(): string {
    return `${this.apiBaseUrl}/api/payment/create-checkout-session`;
  },
} as const;
