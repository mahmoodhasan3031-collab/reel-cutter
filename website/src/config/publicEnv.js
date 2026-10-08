/**
 * Public environment contract for the Reel Cutter website. (STEP 53 / P1-1)
 *
 * CommonJS twin of publicEnv.ts, kept in sync for Node-based tests
 * (require()). The TypeScript build resolves publicEnv.ts; this file exists so
 * tests can exercise the same fail-closed contract at runtime.
 *
 * CLIENT-SAFE: public, non-secret values only.
 *
 * Contract:
 *   - NODE_ENV === "production" throws when a required variable is missing.
 *   - Local development keeps the zero-config fallbacks.
 */

function devDefault(name) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `[publicEnv] ${name} is not set. A production build must define it ` +
        'explicitly; localhost and mock fallbacks are disabled in production. ' +
        `Set ${name} in the deployment environment and rebuild.`,
    );
  }
  switch (name) {
    case 'NEXT_PUBLIC_API_BASE_URL':
      return 'http://localhost:3001';
    case 'NEXT_PUBLIC_SUPABASE_URL':
    case 'NEXT_PUBLIC_SUPABASE_ANON_KEY':
    default:
      return '';
  }
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_SERVER_URL ||
  devDefault('NEXT_PUBLIC_API_BASE_URL');

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || devDefault('NEXT_PUBLIC_SUPABASE_URL');

const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  devDefault('NEXT_PUBLIC_SUPABASE_ANON_KEY');

const PUBLIC_ENV = {
  apiBaseUrl: API_BASE_URL,
  supabaseUrl: SUPABASE_URL,
  supabaseAnonKey: SUPABASE_ANON_KEY,
};

module.exports = {
  PUBLIC_ENV,
  devDefault,
};
