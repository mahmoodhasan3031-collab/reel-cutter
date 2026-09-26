/**
 * Admin API Configuration (STEP 20B) — CommonJS twin
 *
 * Mirrors adminApi.ts for Node-based tests (require()).
 * Keep both files in sync. CLIENT-SAFE: no server-side credential
 * material, session HMAC keys, service-role keys, or provider secrets.
 */

const _apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';

const ADMIN_PAYMENT_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'];
const ADMIN_LIST_FILTERS = ['pending', 'approved', 'rejected'];

const ADMIN_API = {
  apiBaseUrl: _apiBaseUrl,
  login: `${_apiBaseUrl}/api/admin/login`,
  payments: (params) => {
    const query = new URLSearchParams();
    if (params && params.status) query.set('status', params.status);
    if (params && params.page !== undefined) query.set('page', String(params.page));
    if (params && params.limit !== undefined) query.set('limit', String(params.limit));
    const qs = query.toString();
    return `${_apiBaseUrl}/api/admin/payments${qs ? `?${qs}` : ''}`;
  },
  payment: (paymentId) =>
    `${_apiBaseUrl}/api/admin/payments/${encodeURIComponent(paymentId)}`,
  approve: (paymentId) =>
    `${_apiBaseUrl}/api/admin/payments/${encodeURIComponent(paymentId)}/approve`,
  reject: (paymentId) =>
    `${_apiBaseUrl}/api/admin/payments/${encodeURIComponent(paymentId)}/reject`,
};

const ADMIN_LIST_DEFAULT_LIMIT = 20;

module.exports = {
  ADMIN_PAYMENT_STATUSES,
  ADMIN_LIST_FILTERS,
  ADMIN_API,
  ADMIN_LIST_DEFAULT_LIMIT,
};
