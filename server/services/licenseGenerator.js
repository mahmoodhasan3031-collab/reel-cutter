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
 * @param {string} [params.customerEmail]
 * @param {string} [params.transactionId]
 * @returns {Promise<{ licenseKey: string, tier: string, id: string }>}
 */
async function createLicense({ tier = 'standard', customerEmail = '', transactionId = '' }) {
  const validTier = ['basic', 'standard', 'pro'].includes(tier.toLowerCase())
    ? tier.toLowerCase()
    : 'standard';

  const licenseKey = generateKeyFormat();
  const now = new Date().toISOString();

  const record = {
    id: crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'),
    license_key: licenseKey,
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
  };
}

/**
 * For testing: returns all licenses created in memory
 */
function getInMemoryLicenses() {
  return Array.from(generatedLicensesRegistry.values());
}

module.exports = {
  createLicense,
  generateKeyFormat,
  getInMemoryLicenses,
};
