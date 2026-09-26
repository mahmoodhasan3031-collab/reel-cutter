/**
 * Audit log writer (STEP 19).
 *
 * Every administrative mutation writes one audit record:
 *   admin_id, action, target_type, target_id, metadata, created_at
 *
 * Metadata is sanitized before storage so passwords, tokens, service-role
 * keys, and other secrets can never end up in the audit trail.
 */

const { createClient } = require('@supabase/supabase-js');
const config = require('../config');
const { sanitizeErrorMessage } = require('./emailService');

// In-memory fallback for tests / local dev when Supabase is unavailable
const inMemoryAuditLog = [];

// Keys that must never appear in audit metadata
const FORBIDDEN_METADATA_KEY_PATTERN =
  /(password|passwd|secret|token|service[_-]?role|authorization|api[_-]?key|credential|private[_-]?key|session)/i;

const MAX_METADATA_STRING_LENGTH = 500;
const MAX_METADATA_DEPTH = 4;
const MAX_METADATA_ARRAY_LENGTH = 25;

function getSupabaseClient() {
  if (!config.supabase.url || !config.supabase.serviceRoleKey) {
    return null;
  }
  return createClient(config.supabase.url, config.supabase.serviceRoleKey, {
    auth: { persistSession: false },
  });
}

/**
 * Recursively strips forbidden keys and bounds value sizes.
 *
 * @param {*} value
 * @param {number} depth
 * @returns {*}
 */
function sanitizeMetadata(value, depth = 0) {
  if (value === null || value === undefined) return null;
  if (depth > MAX_METADATA_DEPTH) return null;

  if (typeof value === 'string') {
    return value.length > MAX_METADATA_STRING_LENGTH
      ? `${value.slice(0, MAX_METADATA_STRING_LENGTH)}...`
      : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;

  if (Array.isArray(value)) {
    const bounded = value.slice(0, MAX_METADATA_ARRAY_LENGTH);
    return bounded.map((item) => sanitizeMetadata(item, depth + 1));
  }

  if (typeof value === 'object') {
    const clean = {};
    for (const [key, val] of Object.entries(value)) {
      if (FORBIDDEN_METADATA_KEY_PATTERN.test(key)) continue;
      clean[key] = sanitizeMetadata(val, depth + 1);
    }
    return clean;
  }

  return String(value);
}

/**
 * Writes an audit record. Never throws — audit failure is logged (sanitized)
 * and reported via the returned result so callers can surface it without
 * exposing secrets.
 *
 * @param {Object} params
 * @param {string} params.adminId - Verified admin identity (server-side only)
 * @param {string} params.action - e.g. payment_approved, payment_rejected
 * @param {string} params.targetType - e.g. manual_payment
 * @param {string|null} [params.targetId] - UUID of the target record
 * @param {Object|null} [params.metadata] - Non-sensitive context
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
async function writeAuditLog({ adminId, action, targetType, targetId = null, metadata = null }) {
  if (!adminId || !action || !targetType) {
    return { success: false, error: 'AUDIT_INVALID_INPUT' };
  }

  const record = {
    admin_id: String(adminId),
    action: String(action),
    target_type: String(targetType),
    target_id: targetId || null,
    metadata: sanitizeMetadata(metadata),
    created_at: new Date().toISOString(),
  };

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { error } = await supabase.from('audit_log').insert([record]);
      if (error) throw error;
      return { success: true };
    } catch (err) {
      const safeMsg = sanitizeErrorMessage(err);
      console.error('[AuditLog] Failed to persist audit record:', safeMsg);
      // Fall through to in-memory so the event is still observable in-process
      inMemoryAuditLog.push(record);
      return { success: false, error: 'AUDIT_WRITE_FAILED' };
    }
  }

  inMemoryAuditLog.push(record);
  return { success: true };
}

/**
 * Returns in-memory audit records (for tests).
 */
function getInMemoryAuditLog() {
  return [...inMemoryAuditLog];
}

/**
 * Clears in-memory audit records (for tests).
 */
function clearInMemoryAuditLog() {
  inMemoryAuditLog.length = 0;
}

module.exports = {
  writeAuditLog,
  sanitizeMetadata,
  getInMemoryAuditLog,
  clearInMemoryAuditLog,
};
