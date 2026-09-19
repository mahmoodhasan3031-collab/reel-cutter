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
 * @param {string|null} [params.stripeSubscriptionId]
 * @param {string|null} [params.stripeCustomerId]
 * @param {string|null} [params.subscriptionStatus]
 * @param {string|null} [params.currentPeriodStart]
 * @param {string|null} [params.currentPeriodEnd]
 * @param {boolean} [params.cancelAtPeriodEnd]
 * @param {string|null} [params.canceledAt]
 * @param {string} [params.planInterval]
 * @returns {Promise<Object>}
 */
async function createLicense({
  tier = 'standard',
  customerEmail = null,
  transactionId = null,
  paymentProvider = 'stripe',
  stripeSubscriptionId = null,
  stripeCustomerId = null,
  subscriptionStatus = null,
  currentPeriodStart = null,
  currentPeriodEnd = null,
  cancelAtPeriodEnd = false,
  canceledAt = null,
  planInterval = null,
}) {
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
    // Subscription fields
    stripe_subscription_id: stripeSubscriptionId || null,
    stripe_customer_id: stripeCustomerId || null,
    subscription_status: subscriptionStatus || null,
    current_period_start: currentPeriodStart || null,
    current_period_end: currentPeriodEnd || null,
    cancel_at_period_end: cancelAtPeriodEnd || false,
    canceled_at: canceledAt || null,
    plan_interval: planInterval || null,
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
        stripeSubscriptionId: data.stripe_subscription_id,
        stripeCustomerId: data.stripe_customer_id,
        subscriptionStatus: data.subscription_status,
        currentPeriodStart: data.current_period_start,
        currentPeriodEnd: data.current_period_end,
        cancelAtPeriodEnd: data.cancel_at_period_end,
        canceledAt: data.canceled_at,
        planInterval: data.plan_interval,
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
    stripeSubscriptionId: record.stripe_subscription_id,
    stripeCustomerId: record.stripe_customer_id,
    subscriptionStatus: record.subscription_status,
    currentPeriodStart: record.current_period_start,
    currentPeriodEnd: record.current_period_end,
    cancelAtPeriodEnd: record.cancel_at_period_end,
    canceledAt: record.canceled_at,
    planInterval: record.plan_interval,
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
 * Finds a license by Stripe subscription ID.
 * Used by webhook handler to prevent duplicate license creation.
 * @param {string} subscriptionId
 * @returns {Promise<Object|null>}
 */
async function findLicenseBySubscriptionId(subscriptionId) {
  if (!subscriptionId) return null;

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('licenses')
        .select('*')
        .eq('stripe_subscription_id', subscriptionId)
        .single();
      if (!error && data) {
        return data;
      }
    } catch (err) {
      console.warn('[LicenseGenerator] findLicenseBySubscriptionId Supabase failed:', err.message);
    }
  }

  // In-memory fallback
  for (const record of generatedLicensesRegistry.values()) {
    if (record.stripe_subscription_id === subscriptionId) {
      return record;
    }
  }

  return null;
}

/**
 * Updates subscription-related fields on an existing license.
 * Used by webhook handler for subscription lifecycle events.
 * @param {string} licenseIdOrKey - License ID or license_key
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object|null>}
 */
async function updateLicenseSubscription(licenseIdOrKey, updates) {
  if (!licenseIdOrKey) return null;

  const cleanUpdates = {
    ...updates,
    updated_at: new Date().toISOString(),
  };

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('licenses')
        .update(cleanUpdates)
        .or(`id.eq.${licenseIdOrKey},license_key.eq.${licenseIdOrKey}`)
        .select()
        .single();

      if (!error && data) {
        // Also update in-memory registry
        for (const record of generatedLicensesRegistry.values()) {
          if (record.id === licenseIdOrKey || record.license_key === licenseIdOrKey) {
            Object.assign(record, cleanUpdates);
          }
        }
        return data;
      }
    } catch (err) {
      console.warn('[LicenseGenerator] updateLicenseSubscription Supabase failed:', err.message);
    }
  }

  // In-memory fallback
  for (const record of generatedLicensesRegistry.values()) {
    if (record.id === licenseIdOrKey || record.license_key === licenseIdOrKey) {
      Object.assign(record, cleanUpdates);
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
 * For testing: seeds a license record into the in-memory registry
 * @param {Object} record - Must include at least license_key
 */
function seedInMemoryLicense(record) {
  const key = record.license_key;
  generatedLicensesRegistry.set(key, {
    id: record.id || (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex')),
    license_key: key,
    customer_email: record.customer_email || null,
    transaction_id: record.transaction_id || null,
    payment_provider: record.payment_provider || 'stripe',
    email_status: record.email_status || 'pending',
    email_sent_at: record.email_sent_at || null,
    email_error: record.email_error || null,
    email_attempts: record.email_attempts || 0,
    email_last_attempt_at: record.email_last_attempt_at || null,
    hwid: record.hwid || null,
    tier: record.tier || 'standard',
    status: record.status || 'active',
    stripe_subscription_id: record.stripe_subscription_id || null,
    stripe_customer_id: record.stripe_customer_id || null,
    subscription_status: record.subscription_status || null,
    current_period_start: record.current_period_start || null,
    current_period_end: record.current_period_end || null,
    cancel_at_period_end: record.cancel_at_period_end || false,
    canceled_at: record.canceled_at || null,
    plan_interval: record.plan_interval || null,
    created_at: record.created_at || new Date().toISOString(),
    updated_at: record.updated_at || new Date().toISOString(),
  });
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
  findLicenseBySubscriptionId,
  updateLicenseSubscription,
  updateLicenseEmailStatus,
  getInMemoryLicenses,
  seedInMemoryLicense,
  clearInMemoryLicenses,
};
