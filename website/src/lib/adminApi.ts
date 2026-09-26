/**
 * Admin API client (STEP 20B).
 *
 * Thin fetch wrapper around the STEP 19 admin endpoints.
 * - Attaches the opaque session token as a Bearer header.
 * - The server is authoritative: this module never decodes tokens and
 *   never sends reviewed_by / license_id / status as approval fields.
 * - 401/403 clear the local session and redirect to /admin/login.
 * - Maps 409 / 429 / 5xx to human-readable messages.
 */

import { clearAdminSession, getAdminSession } from "@/lib/adminSession";

export class AdminApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
    this.code = code;
  }
}

/** Clears the session and sends the browser to the admin login page. */
export function redirectToAdminLogin(): void {
  clearAdminSession();
  if (typeof window !== "undefined") {
    // Hard navigation is intentional: full reload guarantees no protected
    // UI or in-memory token survives an auth failure outside React routing.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/admin/login";
  }
}

/**
 * Performs an authenticated admin API request.
 * Returns the parsed JSON body on success.
 * Throws AdminApiError on any failure (including auth redirects).
 */
export async function adminFetch(
  path: string,
  init?: RequestInit
): Promise<Record<string, unknown>> {
  const session = getAdminSession();
  if (!session) {
    redirectToAdminLogin();
    throw new AdminApiError(401, "UNAUTHORIZED", "Authentication required.");
  }

  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        Authorization: `Bearer ${session.token}`,
      },
      cache: "no-store",
    });
  } catch {
    throw new AdminApiError(
      0,
      "NETWORK_ERROR",
      "Could not connect to the server. Please try again."
    );
  }

  if (res.status === 401 || res.status === 403) {
    redirectToAdminLogin();
    throw new AdminApiError(
      res.status,
      "UNAUTHORIZED",
      "Your session is invalid or has expired. Please sign in again."
    );
  }

  const data = (await res.json().catch(() => null)) as
    | (Record<string, unknown> & {
        success?: boolean;
        error?: { code?: string; message?: string };
      })
    | null;

  if (!res.ok || !data || data.success !== true) {
    const code = data?.error?.code || "ERROR";
    const message =
      data?.error?.message || "The request could not be completed.";
    throw new AdminApiError(res.status, code, message);
  }

  return data;
}

/**
 * Converts any thrown value into a safe user-facing message.
 * 401/403 → session message; 409 → state conflict; 429 → rate limit;
 * 5xx → generic server error; everything else → server message when present.
 */
export function describeAdminError(err: unknown): string {
  if (err instanceof AdminApiError) {
    if (err.status === 401 || err.status === 403) {
      return "Your session is invalid or has expired. Please sign in again.";
    }
    if (err.status === 409) {
      return (
        err.message ||
        "The payment state changed. Refresh the page and try again."
      );
    }
    if (err.status === 429) {
      return (
        err.message || "Too many requests. Please wait a moment and try again."
      );
    }
    if (err.status >= 500) {
      return "A server error occurred. Please try again later.";
    }
    if (err.status === 0) {
      return err.message;
    }
    return err.message || "The request could not be completed.";
  }
  return "An unexpected error occurred. Please try again.";
}

/** True when the error represents a state conflict (HTTP 409). */
export function isConflictError(err: unknown): boolean {
  return err instanceof AdminApiError && err.status === 409;
}
