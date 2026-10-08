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
 *   NEXT_PUBLIC_STRIPE_MODE    - "test" or "live" (REQUIRED and explicit in production)
 *
 * DO NOT commit .env files or expose these values in client-side code.
 */

import { PUBLIC_ENV } from "./publicEnv";

export type StripeMode = "test" | "live";

/**
 * Resolve the Stripe mode from NEXT_PUBLIC_STRIPE_MODE.
 *
 * Fail closed: a production build must never silently fall back to test mode
 * (or claim to be live while running in test mode), so an unset or invalid
 * value throws during a production build.
 */
function resolveStripeMode(raw: string | undefined): StripeMode {
  const value = (raw || "").trim().toLowerCase();
  if (value === "test" || value === "live") return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `[payment] NEXT_PUBLIC_STRIPE_MODE must be explicitly set to "test" or ` +
        `"live" for a production build (received ${
          value ? `"${value}"` : "an empty value"
        }). Set it in the deployment environment and rebuild.`,
    );
  }
  return "test";
}

/**
 * Stripe mode: "test" or "live".
 * Read from NEXT_PUBLIC_STRIPE_MODE and inlined at build time.
 * Must match the backend Stripe key mode.
 */
export const STRIPE_MODE: StripeMode = resolveStripeMode(
  process.env.NEXT_PUBLIC_STRIPE_MODE,
);

/**
 * Client-safe payment configuration.
 * This contains only non-sensitive information safe for browser use.
 *
 * Actual Stripe Price IDs are resolved server-side when creating
 * checkout sessions. This config is for display/validation purposes only.
 *
 * NOTE: process.env.NEXT_PUBLIC_API_BASE_URL is inlined at build time by Next.js.
 * It MUST be set in Vercel environment variables BEFORE triggering a deployment.
 * After changing this env var, a full redeploy is required (not just a preview).
 */

const _apiBaseUrl: string = PUBLIC_ENV.apiBaseUrl;

export const PAYMENT_CONFIG = {
  /**
   * Whether the configured Stripe mode is the real (live) mode.
   * Derived from STRIPE_MODE so the flag can never disagree with the mode.
   * False = Stripe test/sandbox mode; true = Stripe live mode.
   */
  isLive: STRIPE_MODE === "live",

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
   * Uses NEXT_PUBLIC_API_BASE_URL environment variable (inlined at build time).
   * Falls back to localhost for local development only; production builds fail.
   */
  apiBaseUrl: _apiBaseUrl,

  /**
   * Full backend endpoint for creating checkout sessions.
   * The backend validates the plan server-side and never trusts client-submitted prices.
   */
  checkoutEndpoint: `${_apiBaseUrl}/api/payment/create-checkout-session`,
} as const;
