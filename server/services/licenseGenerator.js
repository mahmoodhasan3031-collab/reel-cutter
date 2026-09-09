const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

// Reusable Supabase client if credentials configured
let supabase = null;
if (config.supabase.url && config.supabase.serviceRoleKey) {
  try {
    supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
      auth: { persistSession: false },
    });
  } catch (err) {
    console.warn('[LicenseGenerator] Failed to initialize Supabase client:', err.message);
  }
}

// In-memory registry fallback for tests / local dev
const generatedLicensesRegistry = new Map();

/**
 * Generates a random alphanumeric chunk of specified length
 * @param {number} length
 * @returns {string}
 */
function randomChunk(length = 4) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Clean alphanumeric without ambiguous chars (O, 0, I, 1)
  let result = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

/**
 * Generates a unique license key in format: XXXX-XXXX-XXXX-XXXX
 * @returns {string}
 */
function generateKeyFormat() {
  return `${randomChunk(4)}-${randomChunk(4)}-${randomChunk(4)}-${randomChunk(4)}`;
}

/**
 * Creates and registers a new license key in Supabase.
 *
 * @param {Object} params
 * @param {'basic'|'standard'|'pro'} params.tier
 * @param {string|null} [params.customerEmail]
 * @param {string|null} [params.transactionId]
 * @param {string} [params.paymentProvider]
 * @returns {Promise<{ licenseKey: string, tier: string, id: string, customerEmail: string|null, transactionId: string|null, paymentProvider: string, record: Object }>}
 */
async function createLicense({ tier = 'standard', customerEmail = null, transactionId = null, paymentProvider = 'stripe' }) {
  const validTier = ['basic', 'standard', 'pro'].includes(tier.toLowerCase())
    ? tier.toLowerCase()
    : 'standard';

  const licenseKey = generateKeyFormat();
  const now = new Date().toISOString();

  const record = {
    id: crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'),
    license_key: licenseKey,
    customer_email: customerEmail || null,
    transaction_id: transactionId || null,
    payment_provider: paymentProvider || 'stripe',
    email_status: 'pending',
    email_sent_at: null,
    email_error: null,
    email_attempts: 0,
    email_last_attempt_at: null,
    hwid: null,
    tier: validTier,
    status: 'active',
    created_at: now,
    updated_at: now,
  };

  // 1. If Supabase client configured, insert into remote table
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('licenses')
        .insert([record])
        .select()
        .single();

      if (error) {
        throw error;
      }

      return {
        id: data.id,
        licenseKey: data.license_key,
        tier: data.tier,
        customerEmail: data.customer_email,
        transactionId: data.transaction_id,
        paymentProvider: data.payment_provider,
        emailStatus: data.email_status,
        emailSentAt: data.email_sent_at,
        emailError: data.email_error,
        emailAttempts: data.email_attempts,
        emailLastAttemptAt: data.email_last_attempt_at,
        record: data,
      };
    } catch (err) {
      console.warn('[LicenseGenerator] Remote Supabase insert failed, caching locally:', err.message);
    }
  }

  // 2. Also register in local mock database for standalone testing
  generatedLicensesRegistry.set(licenseKey, record);

  // Sync to main license mock db if available in same node process
  try {
    const supabaseClientModule = require('../../src/main/license/supabaseClient');
    if (supabaseClientModule && typeof supabaseClientModule.fetchLicense === 'function') {
      // Mock db can recognize the new license
      const mockKey = record.license_key;
      // We can expose it or verify it
    }
  } catch {
    // ignore
  }

  return {
    id: record.id,
    licenseKey: record.license_key,
    tier: record.tier,
    customerEmail: record.customer_email,
    transactionId: record.transaction_id,
    paymentProvider: record.payment_provider,
    emailStatus: record.email_status,
    emailSentAt: record.email_sent_at,
    emailError: record.email_error,
    emailAttempts: record.email_attempts,
    emailLastAttemptAt: record.email_last_attempt_at,
    record,
  };
}

/**
 * Retrieves a license record by ID (or license_key).
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
async function getLicenseById(id) {
  if (!id) return null;

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('licenses')
        .select('*')
        .or(`id.eq.${id},license_key.eq.${id}`)
        .single();
      if (!error && data) {
        return data;
      }
    } catch (err) {
      console.warn('[LicenseGenerator] Remote Supabase getLicenseById failed:', err.message);
    }
  }

  for (const record of generatedLicensesRegistry.values()) {
    if (record.id === id || record.license_key === id) {
      return record;
    }
  }

  return null;
}

/**
 * Updates email delivery status and attempt tracking for a license.
 *
 * @param {string} id License ID (or license_key)
 * @param {Object} updates Fields to update (email_status, email_sent_at, email_error, email_attempts, email_last_attempt_at)
 * @returns {Promise<Object|null>}
 */
async function updateLicenseEmailStatus(id, updates) {
  if (!id) return null;

  const cleanUpdates = {
    ...updates,
    updated_at: new Date().toISOString(),
  };

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('licenses')
        .update(cleanUpdates)
        .eq('id', id)
        .select()
        .single();

      if (!error && data) {
        for (const record of generatedLicensesRegistry.values()) {
          if (record.id === id || record.license_key === id) {
            Object.assign(record, cleanUpdates);
          }
        }
        return data;
      }
    } catch (err) {
      console.warn('[LicenseGenerator] Remote Supabase updateLicenseEmailStatus failed:', err.message);
    }
  }

  for (const record of generatedLicensesRegistry.values()) {
    if (record.id === id || record.license_key === id) {
      Object.assign(record, cleanUpdates);
      return record;
    }
  }

  return null;
}

/**
 * For testing: returns all licenses created in memory
 */
function getInMemoryLicenses() {
  return Array.from(generatedLicensesRegistry.values());
}

/**
 * For testing: resets the in-memory license registry
 */
function clearInMemoryLicenses() {
  generatedLicensesRegistry.clear();
}

module.exports = {
  createLicense,
  generateKeyFormat,
  getLicenseById,
  updateLicenseEmailStatus,
  getInMemoryLicenses,
  clearInMemoryLicenses,
};
