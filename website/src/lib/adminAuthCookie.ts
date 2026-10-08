/**
 * Admin authorization cookie (STEP 70).
 *
 * The browser admin session (STEP 20B) lives in per-tab storage, which the
 * server cannot read. This module defines the small server-readable companion
 * cookie that lets `src/middleware.ts` enforce the (protected) admin route
 * group before any protected admin HTML is rendered.
 *
 * The value is only the session expiry in epoch milliseconds. It carries no
 * token and no credentials: `/api/admin/*` remains the sole authority for
 * real authorization (the opaque bearer token is verified by the backend).
 */

export const ADMIN_AUTH_COOKIE = "reelcutter_admin_auth";

/**
 * True when the cookie holds a well-formed expiry that has not passed.
 * Returns false when the cookie is absent, malformed, or expired.
 */
export function isAdminAuthAuthorized(
  value: string | null | undefined,
  now: number = Date.now()
): boolean {
  if (!value) return false;
  if (!/^\d{10,16}$/.test(value)) return false;
  const expiresAt = Number(value);
  if (!Number.isFinite(expiresAt)) return false;
  return now < expiresAt;
}
