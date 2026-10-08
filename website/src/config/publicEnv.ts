/**
 * Public environment contract for the Reel Cutter website. (STEP 53 / P1-1)
 *
 * Single source of truth for every NEXT_PUBLIC_* value the website reads.
 * CLIENT-SAFE: this module may only hold public, non-secret values.
 *
 * Contract:
 *   - Production builds (NODE_ENV === "production") FAIL LOUDLY when a
 *     required public variable is missing. There is no localhost fallback
 *     and no mock fallback in production.
 *   - Local development keeps the previous zero-config behaviour, so
 *     `next dev` still works before any .env file exists.
 *
 * The dev-only fallback literals below are reached through
 * `<value> || devDefault(...)`. When the variable is set, the build inlines
 * a literal, the `||` short-circuit constant-folds, and the whole
 * `devDefault` function (including the localhost literal) is eliminated from
 * the production bundle.
 *
 * Environment Variables (client-side, inlined at build time):
 *   NEXT_PUBLIC_API_BASE_URL      - Backend API origin (required in production)
 *   NEXT_PUBLIC_SERVER_URL        - Optional legacy alias for the API origin
 *   NEXT_PUBLIC_SUPABASE_URL      - Supabase project URL (required in production)
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY - Supabase public anon key (required in production)
 */

function devDefault(name: string): string {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `[publicEnv] ${name} is not set. A production build must define it ` +
        `explicitly; localhost and mock fallbacks are disabled in production. ` +
        `Set ${name} in the deployment environment and rebuild.`,
    );
  }
  switch (name) {
    case "NEXT_PUBLIC_API_BASE_URL":
      return "http://localhost:3001";
    case "NEXT_PUBLIC_SUPABASE_URL":
    case "NEXT_PUBLIC_SUPABASE_ANON_KEY":
    default:
      return "";
  }
}

const API_BASE_URL: string =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_SERVER_URL ||
  devDefault("NEXT_PUBLIC_API_BASE_URL");

const SUPABASE_URL: string =
  process.env.NEXT_PUBLIC_SUPABASE_URL || devDefault("NEXT_PUBLIC_SUPABASE_URL");

const SUPABASE_ANON_KEY: string =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  devDefault("NEXT_PUBLIC_SUPABASE_ANON_KEY");

/**
 * Resolved public environment values.
 * Reading a property never throws; the failure happens at module evaluation
 * so a missing production variable fails the build instead of shipping a
 * silently broken site.
 */
export const PUBLIC_ENV = {
  apiBaseUrl: API_BASE_URL,
  supabaseUrl: SUPABASE_URL,
  supabaseAnonKey: SUPABASE_ANON_KEY,
} as const;
