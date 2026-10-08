/**
 * Admin API Configuration (STEP 20B)
 *
 * Endpoints for the STEP 19 admin backend. CLIENT-SAFE — contains only
 * public URL construction. Never put server-side credential hashes,
 * session HMAC material, Supabase service-role keys, or payment-provider
 * secrets in this file.
 *
 * The browser never parses or validates session tokens — the server
 * (server/services/adminAuth.js) is the sole authority.
 *
 * Environment Variables (client-side, inlines at build time):
 *   NEXT_PUBLIC_API_BASE_URL - Backend API origin (required in production)
 */

import { PUBLIC_ENV } from "./publicEnv";

const _apiBaseUrl: string = PUBLIC_ENV.apiBaseUrl;

/** Payment statuses accepted by GET /api/admin/payments?status= */
export const ADMIN_PAYMENT_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "cancelled",
] as const;

export type AdminPaymentStatus =
  (typeof ADMIN_PAYMENT_STATUSES)[number];

/** Statuses offered as list filters in the dashboard UI. */
export const ADMIN_LIST_FILTERS = [
  "pending",
  "approved",
  "rejected",
] as const;

/**
 * STEP 19 admin endpoints.
 *
 * All endpoints except login require:
 * Authorization: Bearer <session token>
 *
 * The session token is issued by:
 * POST /api/admin/login
 */
export const ADMIN_API = {
  apiBaseUrl: _apiBaseUrl,

  /**
   * POST { username, password }
   * →
   * { token, token_type, expires_in, admin }
   */
  login: `${_apiBaseUrl}/api/admin/login`,

  /**
   * GET ?status=&page=&limit=
   * →
   * { payments, pagination }
   */
  payments: (
    params?: {
      status?: string;
      page?: number;
      limit?: number;
    }
  ): string => {
    const query = new URLSearchParams();

    if (params?.status) {
      query.set("status", params.status);
    }

    if (params?.page !== undefined) {
      query.set("page", String(params.page));
    }

    if (params?.limit !== undefined) {
      query.set("limit", String(params.limit));
    }

    const qs = query.toString();

    return `${_apiBaseUrl}/api/admin/payments${
      qs ? `?${qs}` : ""
    }`;
  },

  /**
   * GET
   *
   * →
   * {
   *   payment: {
   *     ...,
   *     proof: {
   *       reference,
   *       signed_url,
   *       expires_in_seconds
   *     }
   *   }
   * }
   */
  payment: (paymentId: string): string =>
    `${_apiBaseUrl}/api/admin/payments/${encodeURIComponent(
      paymentId
    )}`,

  /**
   * POST { admin_note? }
   *
   * →
   * {
   *   payment,
   *   license,
   *   email,
   *   already_approved
   * }
   */
  approve: (paymentId: string): string =>
    `${_apiBaseUrl}/api/admin/payments/${encodeURIComponent(
      paymentId
    )}/approve`,

  /**
   * POST { reason, admin_note? }
   *
   * →
   * {
   *   payment,
   *   already_rejected
   * }
   */
  reject: (paymentId: string): string =>
    `${_apiBaseUrl}/api/admin/payments/${encodeURIComponent(
      paymentId
    )}/reject`,

  /**
   * POST
   *
   * Revoke an existing license.
   */
  revokeLicense: (licenseKey: string): string =>
    `${_apiBaseUrl}/api/admin/licenses/${encodeURIComponent(
      licenseKey
    )}/revoke`,

  /**
   * POST
   *
   * Reset the HWID binding for an existing license.
   */
  resetLicenseHwid: (licenseKey: string): string =>
    `${_apiBaseUrl}/api/admin/licenses/${encodeURIComponent(
      licenseKey
    )}/reset-hwid`,
} as const;

/** Default page size for the payment list. */
export const ADMIN_LIST_DEFAULT_LIMIT = 20;