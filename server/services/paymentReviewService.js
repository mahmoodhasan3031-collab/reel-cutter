/**
 * Payment review service (STEP 19).
 *
 * Admin-facing list/get/approve/reject operations over manual_payments.
 * - Uses the service-role Supabase client when configured (RLS denies
 *   authenticated users UPDATE on manual_payments), otherwise an in-memory
 *   store so tests/dev run offline — mirroring existing service conventions.
 * - Approval reuses the existing license generator + license email delivery.
 * - Status transitions are guarded with conditional updates so retries and
 *   concurrent reviews cannot create duplicate licenses or audit records.
 */

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const config = require('../config');
const { createLicense, deleteLicenseById } = require('./licenseGenerator');
const { deliverLicenseEmail, sanitizeErrorMessage } = require('./emailService');
const { writeAuditLog } = require('./auditLog');

const VALID_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'];
const VALID_PLAN_IDS = ['basic', 'standard', 'pro'];

// Safe, admin-reviewable fields only — never service-role/internal secrets
const SAFE_PAYMENT_FIELDS = [
  'id',
  'customer_name',
  'customer_email',
  'whatsapp_number',
  'plan_id',
  'payment_method',
  'amount',
  'currency',
  'transaction_id',
  'sender_account',
  'proof_url',
  'status',
  'admin_note',
  'rejection_reason',
  'reviewed_by',
  'license_id',
  'created_at',
  'updated_at',
  'reviewed_at',
];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// In-memory fallback store (tests / local dev without Supabase)
const inMemoryPayments = new Map();

// Test-only override; undefined means "resolve from config"
let injectedSupabaseClient;

function getSupabaseClient() {
  if (injectedSupabaseClient !== undefined) {
    return injectedSupabaseClient;
  }
  if (!config.supabase.url || !config.supabase.serviceRoleKey) {
    return null;
  }
  return createClient(config.supabase.url, config.supabase.serviceRoleKey, {
    auth: { persistSession: false },
  });
}

function isValidUuid(id) {
  return typeof id === 'string' && UUID_REGEX.test(id);
}

/**
 * Serializes a payment row to the safe admin-facing shape.
 */
function toSafePayment(record) {
  if (!record) return null;
  const safe = {};
  for (const field of SAFE_PAYMENT_FIELDS) {
    safe[field] = record[field] !== undefined ? record[field] : null;
  }
  return safe;
}

function failure(httpStatus, code, message) {
  return { ok: false, httpStatus, code, message };
}

// ─── List ────────────────────────────────────────────────────────────────────

/**
 * Lists payments, newest first, with status filter + pagination.
 *
 * @param {Object} options
 * @param {string} [options.status='pending']
 * @param {number} [options.page=1]
 * @param {number} [options.limit=20]
 * @returns {Promise<{ ok: true, payments: Object[], total: number, page: number, limit: number, totalPages: number }>}
 */
async function listPayments({ status = 'pending', page = 1, limit = 20 } = {}) {
  if (!VALID_STATUSES.includes(status)) {
    return failure(400, 'INVALID_INPUT', `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}.`);
  }

  const safePage = Math.max(1, Math.floor(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit) || 20));
  const from = (safePage - 1) * safeLimit;
  const to = from + safeLimit - 1;

  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error, count } = await supabase
      .from('manual_payments')
      .select('*', { count: 'exact' })
      .eq('status', status)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      console.error('[PaymentReview] List error:', sanitizeErrorMessage(error));
      return failure(500, 'INTERNAL_ERROR', 'An unexpected error occurred. Please try again.');
    }

    const total = count || 0;
    return {
      ok: true,
      payments: (data || []).map(toSafePayment),
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  const all = Array.from(inMemoryPayments.values())
    .filter((p) => p.status === status)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const pageItems = all.slice(from, from + safeLimit);

  return {
    ok: true,
    payments: pageItems.map(toSafePayment),
    total: all.length,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(all.length / safeLimit),
  };
}

// ─── Get ─────────────────────────────────────────────────────────────────────

/**
 * Fetches a single payment by id (safe fields only).
 */
async function getPayment(id) {
  if (!isValidUuid(id)) {
    return failure(400, 'INVALID_INPUT', 'Payment ID must be a valid UUID.');
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('manual_payments')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('[PaymentReview] Get error:', sanitizeErrorMessage(error));
      return failure(500, 'INTERNAL_ERROR', 'An unexpected error occurred. Please try again.');
    }
    if (!data) {
      return failure(404, 'NOT_FOUND', 'Payment not found.');
    }
    return { ok: true, payment: toSafePayment(data), raw: data };
  }

  const record = inMemoryPayments.get(id);
  if (!record) {
    return failure(404, 'NOT_FOUND', 'Payment not found.');
  }
  return { ok: true, payment: toSafePayment(record), raw: record };
}

// ─── Approve ─────────────────────────────────────────────────────────────────

/**
 * Approves a pending payment: creates a license (existing generator),
 * links it to the payment, writes audit, and sends the license email.
 *
 * Idempotent:
 *   - already approved → success without a second license/audit/email
 *   - rejected / cancelled → 409, never converted
 *   - conditional WHERE status='pending' update guards concurrent reviewers;
 *     a losing racer's freshly created license is cleaned up
 *
 * @param {string} id Payment UUID
 * @param {Object} options
 * @param {string} options.adminId Verified admin identity
 * @param {string|null} [options.adminNote]
 * @returns {Promise<Object>}
 */
async function approvePayment(id, { adminId, adminNote = null }) {
  if (!isValidUuid(id)) {
    return failure(400, 'INVALID_INPUT', 'Payment ID must be a valid UUID.');
  }
  if (!adminId) {
    return failure(401, 'UNAUTHORIZED', 'Authentication required.');
  }

  const fetched = await getPayment(id);
  if (!fetched.ok) return fetched;
  const payment = fetched.raw;

  // Idempotency: already approved → no new license, no new audit, no email
  if (payment.status === 'approved') {
    return {
      ok: true,
      code: 'ALREADY_APPROVED',
      payment: toSafePayment(payment),
      license: payment.license_id ? { id: payment.license_id } : null,
    };
  }
  if (payment.status === 'rejected') {
    return failure(409, 'INVALID_STATUS', 'This payment has already been rejected and cannot be approved.');
  }
  if (payment.status === 'cancelled') {
    return failure(409, 'INVALID_STATUS', 'This payment was cancelled and cannot be approved.');
  }
  if (payment.status !== 'pending') {
    return failure(409, 'INVALID_STATUS', 'This payment cannot be approved in its current status.');
  }

  // Validate the record before approval
  const planId = payment.plan_id;
  if (!VALID_PLAN_IDS.includes(planId)) {
    return failure(422, 'INVALID_PAYMENT_RECORD', 'Payment record has an invalid plan and cannot be approved.');
  }
  if (!payment.customer_email) {
    return failure(422, 'INVALID_PAYMENT_RECORD', 'Payment record has no customer email and cannot be approved.');
  }

  const reviewedAt = new Date().toISOString();
  const normalizedAdminNote = typeof adminNote === 'string' && adminNote.trim()
    ? adminNote.trim()
    : (payment.admin_note || null);

  // 1. Create the license for the purchased plan (existing generator only)
  let license;
  try {
    license = await createLicense({
      tier: planId,
      customerEmail: payment.customer_email,
      transactionId: payment.transaction_id || null,
      paymentProvider: 'manual',
      planInterval: 'month',
      requireRemote: true,
    });
  } catch (err) {
    console.error('[PaymentReview] License creation failed:', sanitizeErrorMessage(err));
    return failure(500, 'LICENSE_CREATION_FAILED', 'Failed to create the license. Payment was not approved.');
  }
  if (!license || !license.id) {
    return failure(500, 'LICENSE_CREATION_FAILED', 'Failed to create the license. Payment was not approved.');
  }

  const supabase = getSupabaseClient();
  let updatedPayment = null;

  if (supabase) {
    // 2. Conditional transition: only pending → approved can win
    const { data: updatedRows, error: updateError } = await supabase
      .from('manual_payments')
      .update({
        status: 'approved',
        license_id: license.id,
        reviewed_by: adminId,
        reviewed_at: reviewedAt,
        admin_note: normalizedAdminNote,
      })
      .eq('id', id)
      .eq('status', 'pending')
      .select();

    if (updateError) {
      console.error('[PaymentReview] Approve update error:', sanitizeErrorMessage(updateError));
      await safeDeleteLicense(license.id);
      return failure(500, 'INTERNAL_ERROR', 'An unexpected error occurred. Please try again.');
    }

    if (!updatedRows || updatedRows.length === 0) {
      // Lost a race (or state changed) — inspect the current record
      const current = await getPayment(id);
      await safeDeleteLicense(license.id);
      if (current.ok && current.raw.status === 'approved') {
        return {
          ok: true,
          code: 'ALREADY_APPROVED',
          payment: toSafePayment(current.raw),
          license: current.raw.license_id ? { id: current.raw.license_id } : null,
        };
      }
      return failure(409, 'INVALID_STATUS', 'Payment state changed before approval could complete. Please refresh.');
    }
    updatedPayment = updatedRows[0];
  } else {
    // In-memory path (single-threaded): guard then transition
    const record = inMemoryPayments.get(id);
    if (!record || record.status !== 'pending') {
      await safeDeleteLicense(license.id);
      return failure(409, 'INVALID_STATUS', 'Payment state changed before approval could complete. Please refresh.');
    }
    record.status = 'approved';
    record.license_id = license.id;
    record.reviewed_by = adminId;
    record.reviewed_at = reviewedAt;
    record.admin_note = normalizedAdminNote;
    record.updated_at = new Date().toISOString();
    updatedPayment = record;
  }

  // 3. Audit log (only after a successful transition → no duplicate records)
  await writeAuditLog({
    adminId,
    action: 'payment_approved',
    targetType: 'manual_payment',
    targetId: id,
    metadata: {
      payment_id: id,
      plan: planId,
      amount: payment.amount,
      currency: payment.currency,
      payment_method: payment.payment_method,
      license_id: license.id,
      admin_note: normalizedAdminNote,
    },
  });

  // 4. License delivery email — failure never rolls back the approval
  let email = { success: false, skipped: true };
  if (payment.customer_email) {
    try {
      const emailResult = await deliverLicenseEmail(license.id);
      email = {
        success: Boolean(emailResult && emailResult.success),
        error: emailResult && emailResult.success ? undefined : (emailResult && emailResult.error) || 'Email delivery failed',
      };
      if (!email.success) {
        console.error('[PaymentReview] License email delivery failed after approval:', email.error);
      }
    } catch (err) {
      email = { success: false, error: 'Email delivery failed' };
      console.error('[PaymentReview] License email threw after approval:', sanitizeErrorMessage(err));
    }
  }

  return {
    ok: true,
    code: 'APPROVED',
    payment: toSafePayment(updatedPayment),
    license: { id: license.id, licenseKey: license.licenseKey, tier: license.tier || planId },
    email,
  };
}

async function safeDeleteLicense(licenseId) {
  try {
    await deleteLicenseById(licenseId);
  } catch (err) {
    console.error('[PaymentReview] Orphan license cleanup failed:', sanitizeErrorMessage(err));
  }
}

// ─── Reject ──────────────────────────────────────────────────────────────────

/**
 * Rejects a pending payment. Requires a reason. Idempotent on already
 * rejected. Never touches licenses or HWID. Never modifies approved or
 * cancelled payments.
 *
 * @param {string} id Payment UUID
 * @param {Object} options
 * @param {string} options.adminId Verified admin identity
 * @param {string} options.reason Rejection reason (required)
 * @param {string|null} [options.adminNote]
 * @returns {Promise<Object>}
 */
async function rejectPayment(id, { adminId, reason, adminNote = null }) {
  if (!isValidUuid(id)) {
    return failure(400, 'INVALID_INPUT', 'Payment ID must be a valid UUID.');
  }
  if (!adminId) {
    return failure(401, 'UNAUTHORIZED', 'Authentication required.');
  }
  if (typeof reason !== 'string' || !reason.trim()) {
    return failure(400, 'INVALID_INPUT', 'A rejection reason is required.');
  }
  const trimmedReason = reason.trim();
  if (trimmedReason.length > 1000) {
    return failure(400, 'INVALID_INPUT', 'Rejection reason must be at most 1000 characters.');
  }

  const fetched = await getPayment(id);
  if (!fetched.ok) return fetched;
  const payment = fetched.raw;

  // Idempotent: already rejected → no duplicate audit
  if (payment.status === 'rejected') {
    return {
      ok: true,
      code: 'ALREADY_REJECTED',
      payment: toSafePayment(payment),
    };
  }
  if (payment.status === 'approved') {
    return failure(409, 'INVALID_STATUS', 'This payment has already been approved and cannot be rejected.');
  }
  if (payment.status === 'cancelled') {
    return failure(409, 'INVALID_STATUS', 'This payment was cancelled and cannot be modified.');
  }
  if (payment.status !== 'pending') {
    return failure(409, 'INVALID_STATUS', 'This payment cannot be rejected in its current status.');
  }

  const reviewedAt = new Date().toISOString();
  const normalizedAdminNote = typeof adminNote === 'string' && adminNote.trim()
    ? adminNote.trim()
    : (payment.admin_note || null);

  const supabase = getSupabaseClient();
  let updatedPayment = null;

  if (supabase) {
    const { data: updatedRows, error: updateError } = await supabase
      .from('manual_payments')
      .update({
        status: 'rejected',
        rejection_reason: trimmedReason,
        admin_note: normalizedAdminNote,
        reviewed_by: adminId,
        reviewed_at: reviewedAt,
      })
      .eq('id', id)
      .eq('status', 'pending')
      .select();

    if (updateError) {
      console.error('[PaymentReview] Reject update error:', sanitizeErrorMessage(updateError));
      return failure(500, 'INTERNAL_ERROR', 'An unexpected error occurred. Please try again.');
    }
    if (!updatedRows || updatedRows.length === 0) {
      const current = await getPayment(id);
      if (current.ok && current.raw.status === 'rejected') {
        return { ok: true, code: 'ALREADY_REJECTED', payment: toSafePayment(current.raw) };
      }
      return failure(409, 'INVALID_STATUS', 'Payment state changed before rejection could complete. Please refresh.');
    }
    updatedPayment = updatedRows[0];
  } else {
    const record = inMemoryPayments.get(id);
    if (!record || record.status !== 'pending') {
      return failure(409, 'INVALID_STATUS', 'Payment state changed before rejection could complete. Please refresh.');
    }
    record.status = 'rejected';
    record.rejection_reason = trimmedReason;
    record.admin_note = normalizedAdminNote;
    record.reviewed_by = adminId;
    record.reviewed_at = reviewedAt;
    record.updated_at = new Date().toISOString();
    updatedPayment = record;
  }

  // Audit only after a successful transition
  await writeAuditLog({
    adminId,
    action: 'payment_rejected',
    targetType: 'manual_payment',
    targetId: id,
    metadata: {
      payment_id: id,
      plan: payment.plan_id,
      amount: payment.amount,
      currency: payment.currency,
      payment_method: payment.payment_method,
      reason: trimmedReason,
      admin_note: normalizedAdminNote,
    },
  });

  return {
    ok: true,
    code: 'REJECTED',
    payment: toSafePayment(updatedPayment),
  };
}

// ─── Test helpers ────────────────────────────────────────────────────────────

/**
 * Seeds a payment into the in-memory store (for tests).
 */
function seedInMemoryPayment(record) {
  const id = record.id || (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'));
  const now = new Date().toISOString();
  inMemoryPayments.set(id, {
    id,
    customer_name: record.customer_name || 'Test Customer',
    customer_email: record.customer_email || 'customer@example.com',
    whatsapp_number: record.whatsapp_number || null,
    plan_id: record.plan_id || 'standard',
    payment_method: record.payment_method || 'bkash',
    amount: record.amount || 2000,
    currency: record.currency || 'BDT',
    transaction_id: record.transaction_id || `TXN-${id.slice(0, 8)}`,
    sender_account: record.sender_account || null,
    proof_url: record.proof_url || null,
    status: record.status || 'pending',
    admin_note: record.admin_note || null,
    rejection_reason: record.rejection_reason || null,
    reviewed_by: record.reviewed_by || null,
    reviewed_at: record.reviewed_at || null,
    license_id: record.license_id || null,
    created_at: record.created_at || now,
    updated_at: record.updated_at || now,
  });
  return id;
}

/**
 * Clears in-memory payments (for tests).
 */
function clearInMemoryPayments() {
  inMemoryPayments.clear();
}

/**
 * Direct in-memory accessor (for tests).
 */
function getInMemoryPayment(id) {
  return inMemoryPayments.get(id) || null;
}

/**
 * For testing: overrides the Supabase client used by list/get/approve/reject.
 * Pass null to force the in-memory path.
 */
function setSupabaseClientForTests(client) {
  injectedSupabaseClient = client;
}

/**
 * For testing: restores config-based Supabase client resolution.
 */
function resetSupabaseClientForTests() {
  injectedSupabaseClient = undefined;
}

module.exports = {
  listPayments,
  getPayment,
  approvePayment,
  rejectPayment,
  toSafePayment,
  isValidUuid,
  VALID_STATUSES,
  VALID_PLAN_IDS,
  SAFE_PAYMENT_FIELDS,
  seedInMemoryPayment,
  clearInMemoryPayments,
  getInMemoryPayment,
  setSupabaseClientForTests,
  resetSupabaseClientForTests,
};
