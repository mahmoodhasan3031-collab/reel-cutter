#!/usr/bin/env node
/**
 * Production public environment gate. (STEP 53 / P1-1)
 *
 * Runs automatically via the `prebuild` npm hook, before `next build`.
 * A production build must never ship with localhost API endpoints, a mock
 * Supabase project, or an ambiguous Stripe mode, so this script fails the
 * build early with an actionable message instead of letting the site deploy
 * silently broken.
 *
 * Values are resolved exactly the way `next build` resolves them:
 * environment variables first, then .env.production.local / .env.local /
 * .env.production / .env inside the website directory.
 *
 * This file must never print or hardcode secrets - only variable names and
 * non-secret origins.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");

const websiteDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// isDev = false -> .env.production(.local), .env.local, .env (same set as next build).
loadEnvConfig(websiteDir, false, console, false);

/** First non-empty trimmed value among the given variable names. */
function valueOf(names) {
  for (const name of names) {
    const value = (process.env[name] || "").trim();
    if (value) return value;
  }
  return "";
}

const apiBaseUrl = valueOf(["NEXT_PUBLIC_API_BASE_URL", "NEXT_PUBLIC_SERVER_URL"]);
const supabaseUrl = valueOf(["NEXT_PUBLIC_SUPABASE_URL"]);
const supabaseAnonKey = valueOf(["NEXT_PUBLIC_SUPABASE_ANON_KEY"]);
const stripeMode = (process.env.NEXT_PUBLIC_STRIPE_MODE || "").trim().toLowerCase();

const errors = [];

if (!apiBaseUrl) {
  errors.push("  - NEXT_PUBLIC_API_BASE_URL (or NEXT_PUBLIC_SERVER_URL) is not set");
}
if (!supabaseUrl) {
  errors.push("  - NEXT_PUBLIC_SUPABASE_URL is not set");
}
if (!supabaseAnonKey) {
  errors.push("  - NEXT_PUBLIC_SUPABASE_ANON_KEY is not set");
}
if (stripeMode !== "test" && stripeMode !== "live") {
  errors.push(
    `  - NEXT_PUBLIC_STRIPE_MODE must be "test" or "live"${
      stripeMode ? ` (got "${stripeMode}")` : " (is not set)"
    }`,
  );
}

const isLocalOrigin = (value) =>
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(value);

if (apiBaseUrl && isLocalOrigin(apiBaseUrl)) {
  errors.push(
    `  - NEXT_PUBLIC_API_BASE_URL points at a local development server (${apiBaseUrl}); ` +
      "a production build must use the deployed API origin",
  );
}
if (supabaseUrl && isLocalOrigin(supabaseUrl)) {
  errors.push(
    `  - NEXT_PUBLIC_SUPABASE_URL points at a local development server (${supabaseUrl})`,
  );
}
if (stripeMode === "live" && apiBaseUrl && isLocalOrigin(apiBaseUrl)) {
  errors.push("  - Stripe live mode cannot be combined with a local API origin");
}

if (errors.length > 0) {
  console.error("\n\u2717 Production public environment is not configured:\n");
  for (const error of errors) console.error(error);
  console.error(
    [
      "",
      `  Directory: ${websiteDir}`,
      "  Fix: set these in the Vercel project environment, or copy",
      "  website/.env.example to website/.env.production.local for a local",
      "  production build. See website/README.md for the full contract.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

console.log(
  `\u2713 Public environment OK for build: apiBaseUrl=${apiBaseUrl}, ` +
    `supabaseUrl=${supabaseUrl}, stripeMode=${stripeMode}`,
);
