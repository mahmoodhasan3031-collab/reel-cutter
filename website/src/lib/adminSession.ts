/**
 * Admin session storage (STEP 20B).
 *
 * Stores ONLY the minimum authenticated session material returned by
 * POST /api/admin/login: the opaque bearer token, the admin username
 * (display only), and the expiry timestamp derived from expires_in.
 *
 * - Never stores the password.
 * - Never parses or validates the token in the browser — the server does.
 * - Uses sessionStorage (per-tab) so the session does not persist after
 *   the tab closes; cleared explicitly on logout and on 401/403.
 */

import { ADMIN_AUTH_COOKIE } from "@/lib/adminAuthCookie";

const ADMIN_SESSION_KEY = "reelcutter_admin_session";

export interface AdminSession {
  /** Opaque server-issued bearer token — sent as-is, never decoded. */
  token: string;
  /** Display-only username from the login response. */
  username: string;
  /** Absolute expiry in epoch milliseconds (from expires_in seconds). */
  expiresAt: number;
}

function safeStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Mirrors the session expiry into a server-readable cookie so
 * `src/middleware.ts` can gate the (protected) admin group before HTML
 * renders. Value is the expiry only — never the bearer token.
 */
function writeAuthCookie(expiresAt: number): void {
  if (typeof document === "undefined") return;
  try {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie =
      `${ADMIN_AUTH_COOKIE}=${expiresAt}` +
      `; expires=${new Date(expiresAt).toUTCString()}` +
      `; path=/; SameSite=Lax${secure}`;
  } catch {
    /* cookies unavailable — the server gate simply requires a fresh sign-in */
  }
}

function removeAuthCookie(): void {
  if (typeof document === "undefined") return;
  try {
    document.cookie =
      `${ADMIN_AUTH_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT` +
      `; path=/; SameSite=Lax`;
  } catch {
    /* nothing to clear */
  }
}

/**
 * Reads the admin session. Returns null when missing, malformed, or expired.
 * Expired sessions are removed as a side effect.
 */
export function getAdminSession(): AdminSession | null {
  const storage = safeStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AdminSession>;
    if (
      !parsed ||
      typeof parsed.token !== "string" ||
      !parsed.token ||
      typeof parsed.expiresAt !== "number"
    ) {
      storage.removeItem(ADMIN_SESSION_KEY);
      return null;
    }
    if (Date.now() >= parsed.expiresAt) {
      storage.removeItem(ADMIN_SESSION_KEY);
      return null;
    }
    return {
      token: parsed.token,
      username: typeof parsed.username === "string" ? parsed.username : "",
      expiresAt: parsed.expiresAt,
    };
  } catch {
    storage.removeItem(ADMIN_SESSION_KEY);
    return null;
  }
}

/**
 * Persists a session from the login response.
 * expiresInSeconds comes from the server's expires_in field.
 */
export function setAdminSession(
  token: string,
  username: string,
  expiresInSeconds: number
): AdminSession | null {
  const storage = safeStorage();
  if (!storage || !token) return null;
  const ttlSeconds =
    typeof expiresInSeconds === "number" && expiresInSeconds > 0
      ? expiresInSeconds
      : 1800;
  const session: AdminSession = {
    token,
    username,
    expiresAt: Date.now() + ttlSeconds * 1000,
  };
  try {
    storage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
    writeAuthCookie(session.expiresAt);
    return session;
  } catch {
    return null;
  }
}

/** Removes the admin session (logout / 401 / 403). */
export function clearAdminSession(): void {
  const storage = safeStorage();
  if (storage) {
    try {
      storage.removeItem(ADMIN_SESSION_KEY);
    } catch {
      /* storage unavailable — nothing to clear */
    }
  }
  removeAuthCookie();
}

/** True when a non-expired session exists. Does not validate with the server. */
export function hasAdminSession(): boolean {
  return getAdminSession() !== null;
}
