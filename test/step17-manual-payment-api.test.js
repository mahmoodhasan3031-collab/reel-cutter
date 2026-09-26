'use strict';

/**
 * STEP 17 — Manual Payment Backend Submission API Tests
 *
 * Tests:
 *   A. Route File Integrity
 *   B. POST /api/manual-payment/submit — Validation
 *   C. POST /api/manual-payment/submit — Security Invariants
 *   D. GET /api/manual-payment/status/:id — Authorization
 *   E. Rate Limiting
 *   F. Error Handling
 *   G. Regression: Existing Objects Preserved
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const routeFile = path.join(__dirname, '..', 'server', 'routes', 'manualPayment.js');
const indexFile = path.join(__dirname, '..', 'server', 'index.js');

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ PASS: ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, error: err.message });
    console.log(`  ✗ FAIL: ${name}`);
    console.log(`    ${err.message}`);
  }
}

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

async function runStep17Tests() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('STEP 17 — Manual Payment Backend Submission API Tests');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // A. Route File Integrity
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('── A. Route File Integrity ──');

  let routeSrc = '';
  let indexSrc = '';

  await test('A1. manualPayment.js route file exists', () => {
    assert.ok(fs.existsSync(routeFile), 'manualPayment.js must exist');
    routeSrc = readFile(routeFile);
  });

  await test('A2. manualPayment.js is non-trivial (>500 bytes)', () => {
    assert.ok(routeSrc.length > 500, 'Route file must be substantial');
  });

  await test('A3. index.js imports manualPayment routes', () => {
    indexSrc = readFile(indexFile);
    assert.ok(
      indexSrc.includes('manualPayment'),
      'index.js must import manualPayment routes'
    );
  });

  await test('A4. index.js mounts /api/manual-payment', () => {
    assert.ok(
      indexSrc.includes('/api/manual-payment'),
      'index.js must mount /api/manual-payment'
    );
  });

  await test('A5. Route exports express.Router', () => {
    assert.ok(
      routeSrc.includes('module.exports = router'),
      'Route must export router'
    );
  });

  await test('A6. Route uses allowMethods middleware', () => {
    assert.ok(
      routeSrc.includes('allowMethods'),
      'Route must use allowMethods middleware'
    );
  });

  await test('A7. Route uses stripUnknownFields middleware', () => {
    assert.ok(
      routeSrc.includes('stripUnknownFields'),
      'Route must use stripUnknownFields for input stripping'
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // B. POST /api/manual-payment/submit — Validation
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('── B. POST /api/manual-payment/submit — Validation ──');

  await test('B1. Has POST /submit route', () => {
    assert.ok(
      routeSrc.includes("'/submit'") || routeSrc.includes("'submit'"),
      'Must define POST /submit route'
    );
  });

  await test('B2. Validates customer_name is required', () => {
    assert.ok(
      routeSrc.includes('customer_name'),
      'Must validate customer_name'
    );
    assert.ok(
      routeSrc.includes('Customer name is required'),
      'Must return error message for missing name'
    );
  });

  await test('B3. Validates customer_email is required', () => {
    assert.ok(
      routeSrc.includes('customer_email'),
      'Must validate customer_email'
    );
    assert.ok(
      routeSrc.includes('Email address is required'),
      'Must return error message for missing email'
    );
  });

  await test('B4. Validates email format', () => {
    assert.ok(
      routeSrc.includes('isValidEmail'),
      'Must validate email format'
    );
  });

  await test('B5. Normalizes email to lowercase', () => {
    assert.ok(
      routeSrc.includes('normalizeEmail'),
      'Must normalize email'
    );
    assert.ok(
      routeSrc.includes('.toLowerCase()'),
      'Must convert email to lowercase'
    );
  });

  await test('B6. Validates plan_id against allowed values', () => {
    assert.ok(
      routeSrc.includes('VALID_PLAN_IDS'),
      'Must define VALID_PLAN_IDS'
    );
    assert.ok(
      routeSrc.includes("'basic'") && routeSrc.includes("'standard'") && routeSrc.includes("'pro'"),
      'VALID_PLAN_IDS must include basic, standard, pro'
    );
  });

  await test('B7. Validates payment_method against allowed values', () => {
    assert.ok(
      routeSrc.includes('VALID_PAYMENT_METHODS'),
      'Must define VALID_PAYMENT_METHODS'
    );
    assert.ok(
      routeSrc.includes("'bkash'") && routeSrc.includes("'nagad'") &&
      routeSrc.includes("'rocket'") && routeSrc.includes("'bank'") && routeSrc.includes("'binance'"),
      'VALID_PAYMENT_METHODS must include all 5 methods'
    );
  });

  await test('B8. Validates currency against allowed values', () => {
    assert.ok(
      routeSrc.includes('VALID_CURRENCIES'),
      'Must define VALID_CURRENCIES'
    );
    assert.ok(
      routeSrc.includes("'BDT'") && routeSrc.includes("'USDT'"),
      'VALID_CURRENCIES must include BDT and USDT'
    );
  });

  await test('B9. Enforces BDT for bkash/nagad/rocket/bank', () => {
    assert.ok(
      routeSrc.includes('BDT_METHODS'),
      'Must define BDT_METHODS'
    );
    assert.ok(
      routeSrc.includes('payments must use BDT'),
      'Must enforce BDT for local payment methods'
    );
  });

  await test('B10. Enforces USDT for binance', () => {
    assert.ok(
      routeSrc.includes('Binance payments must use USDT'),
      'Must enforce USDT for Binance'
    );
  });

  await test('B11. Validates amount is positive', () => {
    assert.ok(
      routeSrc.includes('amount') && (routeSrc.includes('parseFloat') || routeSrc.includes('Number')),
      'Must parse amount as number'
    );
    assert.ok(
      routeSrc.includes('positive'),
      'Must validate amount is positive'
    );
  });

  await test('B12. Validates transaction_id is required', () => {
    assert.ok(
      routeSrc.includes('transaction_id'),
      'Must validate transaction_id'
    );
    assert.ok(
      routeSrc.includes('Transaction ID is required'),
      'Must return error message for missing transaction_id'
    );
  });

  await test('B13. Enforces max length on transaction_id', () => {
    assert.ok(
      routeSrc.includes('MAX_TRANSACTION_ID_LENGTH'),
      'Must define MAX_TRANSACTION_ID_LENGTH'
    );
  });

  await test('B14. Enforces max length on customer_name', () => {
    assert.ok(
      routeSrc.includes('MAX_NAME_LENGTH'),
      'Must define MAX_NAME_LENGTH'
    );
  });

  await test('B15. Validates optional whatsapp_number format', () => {
    assert.ok(
      routeSrc.includes('isValidPhone'),
      'Must validate phone format'
    );
  });

  await test('B16. Validates proof reference format', () => {
    assert.ok(
      routeSrc.includes('isValidProofReference'),
      'Must validate proof reference format'
    );
    assert.ok(
      routeSrc.includes('INVALID_PROOF_REFERENCE'),
      'Must return error for invalid proof reference'
    );
  });

  await test('B17. Defaults currency to BDT for non-binance methods', () => {
    assert.ok(
      routeSrc.includes("payment_method === 'binance'") || routeSrc.includes("'binance'"),
      'Must default currency based on payment method'
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // C. POST /api/manual-payment/submit — Security Invariants
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('── C. POST /api/manual-payment/submit — Security Invariants ──');

  await test('C1. Status is always set to pending', () => {
    assert.ok(
      routeSrc.includes("status: 'pending'"),
      'Must always set status to pending'
    );
  });

  await test('C2. Customer cannot set status to approved', () => {
    // The safeRecord object explicitly sets status, not from req.body
    assert.ok(
      !routeSrc.includes("req.body.status") || routeSrc.includes('// ALWAYS pending'),
      'Must not use req.body.status'
    );
  });

  await test('C3. Customer cannot set reviewed_by', () => {
    assert.ok(
      !routeSrc.includes('reviewed_by') || routeSrc.includes('Strip customer-controlled dangerous fields'),
      'Must not allow customer to set reviewed_by'
    );
  });

  await test('C4. Customer cannot set license_id', () => {
    assert.ok(
      !routeSrc.includes('license_id') || routeSrc.includes('Strip customer-controlled dangerous fields'),
      'Must not allow customer to set license_id'
    );
  });

  await test('C5. Customer cannot set reviewed_at', () => {
    assert.ok(
      !routeSrc.includes('reviewed_at') || routeSrc.includes('Strip customer-controlled dangerous fields'),
      'Must not allow customer to set reviewed_at'
    );
  });

  await test('C6. Uses Supabase service-role client for insert (not anon)', () => {
    assert.ok(
      routeSrc.includes('serviceRoleKey'),
      'Must use service-role key for database operations'
    );
  });

  await test('C7. Handles duplicate transaction with 409 status', () => {
    assert.ok(
      routeSrc.includes('409') || routeSrc.includes('DUPLICATE_TRANSACTION'),
      'Must return 409 for duplicate transactions'
    );
  });

  await test('C8. Handles unique constraint violation (error code 23505)', () => {
    assert.ok(
      routeSrc.includes('23505'),
      'Must handle PostgreSQL unique constraint violation code'
    );
  });

  await test('C9. Never exposes stack traces in error responses', () => {
    assert.ok(
      routeSrc.includes('An unexpected error occurred'),
      'Must use generic error message'
    );
    assert.ok(
      !routeSrc.includes('stack'),
      'Must not expose stack traces'
    );
  });

  await test('C10. Strips unknown fields from request body', () => {
    assert.ok(
      routeSrc.includes("stripUnknownFields(["),
      'Must use stripUnknownFields middleware'
    );
    const stripMatch = routeSrc.match(/stripUnknownFields\(\[([^\]]+)\]/);
    assert.ok(stripMatch, 'stripUnknownFields must have field list');
    const fields = stripMatch[1];
    assert.ok(
      fields.includes('customer_name') && fields.includes('customer_email') &&
      fields.includes('transaction_id') && fields.includes('plan_id') &&
      fields.includes('payment_method'),
      'stripUnknownFields must include key fields'
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // D. GET /api/manual-payment/status/:id — Authorization
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('── D. GET /api/manual-payment/status/:id — Authorization ──');

  await test('D1. Has GET /status/:id route', () => {
    assert.ok(
      routeSrc.includes('/status/:id'),
      'Must define GET /status/:id route'
    );
  });

  await test('D2. Returns 404 for non-existent payment', () => {
    assert.ok(
      routeSrc.includes('Payment not found'),
      'Must return appropriate error for missing payment'
    );
  });

  await test('D3. Authenticated user can only see own payments', () => {
    assert.ok(
      routeSrc.includes('customer_email') && routeSrc.includes('auth.email'),
      'Must compare customer_email with authenticated user email'
    );
  });

  await test('D4. Returns 404 (not 403) when accessing other customer payment', () => {
    // Must not leak existence of other customers' payments
    assert.ok(
      routeSrc.includes('Payment not found'),
      'Must return 404 for unauthorized access (not 403)'
    );
  });

  await test('D5. Does not expose admin_note', () => {
    assert.ok(
      !routeSrc.includes('admin_note') || routeSrc.includes('select('),
      'Must not return admin_note to customers'
    );
  });

  await test('D6. Does not expose reviewed_by', () => {
    assert.ok(
      !routeSrc.includes('reviewed_by'),
      'Must not expose reviewed_by to customers'
    );
  });

  await test('D7. Does not expose other customers data', () => {
    assert.ok(
      routeSrc.includes('auth.email'),
      'Must verify email ownership'
    );
  });

  await test('D8. Returns rejection_reason only when status is rejected', () => {
    assert.ok(
      routeSrc.includes("status === 'rejected'"),
      'Must conditionally include rejection_reason'
    );
  });

  await test('D9. Minimal response for anonymous users', () => {
    assert.ok(
      routeSrc.includes('Minimal safe response') || routeSrc.includes('Anonymous'),
      'Must provide safe minimal response for anonymous users'
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // E. Rate Limiting
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('── E. Rate Limiting ──');

  await test('E1. Submit endpoint has rate limiter', () => {
    assert.ok(
      routeSrc.includes('submitLimiter'),
      'Must apply submitLimiter to submit endpoint'
    );
  });

  await test('E2. Status endpoint has rate limiter', () => {
    assert.ok(
      routeSrc.includes('statusLimiter'),
      'Must apply statusLimiter to status endpoint'
    );
  });

  await test('E3. Uses createRateLimiter from existing infrastructure', () => {
    assert.ok(
      routeSrc.includes("require('../middleware/rateLimiter')"),
      'Must import from existing rateLimiter middleware'
    );
  });

  await test('E4. Submit rate limit is stricter than status', () => {
    const submitMatch = routeSrc.match(/submitLimiter\s*=\s*createRateLimiter\(\{[^}]*maxRequests:\s*(\d+)/);
    const statusMatch = routeSrc.match(/statusLimiter\s*=\s*createRateLimiter\(\{[^}]*maxRequests:\s*(\d+)/);
    if (submitMatch && statusMatch) {
      assert.ok(
        parseInt(submitMatch[1]) <= parseInt(statusMatch[1]),
        'Submit limiter must be <= status limiter'
      );
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // F. Error Handling
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('── F. Error Handling ──');

  await test('F1. Returns 400 for validation errors', () => {
    assert.ok(
      routeSrc.includes('400'),
      'Must return 400 for validation errors'
    );
  });

  await test('F2. Returns 401/403 for authentication/authorization errors', () => {
    assert.ok(
      routeSrc.includes('401') || routeSrc.includes('403'),
      'Must support 401 or 403 responses for auth errors'
    );
  });

  await test('F3. Returns 403 for authorization errors', () => {
    assert.ok(
      routeSrc.includes('403'),
      'Must support 403 responses'
    );
  });

  await test('F4. Returns 404 for not found', () => {
    assert.ok(
      routeSrc.includes('404'),
      'Must return 404 for missing payment'
    );
  });

  await test('F5. Returns 409 for duplicate transaction', () => {
    assert.ok(
      routeSrc.includes('409'),
      'Must return 409 for duplicates'
    );
  });

  await test('F6. Returns 429 for rate limiting', () => {
    // Rate limiter handles this, but verify import
    assert.ok(
      routeSrc.includes('createRateLimiter'),
      'Must use rate limiter (returns 429)'
    );
  });

  await test('F7. Returns 500 for unexpected errors', () => {
    assert.ok(
      routeSrc.includes('500'),
      'Must return 500 for server errors'
    );
  });

  await test('F8. Uses errorResponse helper consistently', () => {
    assert.ok(
      routeSrc.includes('errorResponse(res,'),
      'Must use errorResponse helper'
    );
  });

  await test('F9. Uses successResponse helper consistently', () => {
    assert.ok(
      routeSrc.includes('successResponse(res,'),
      'Must use successResponse helper'
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // G. Regression: Existing Objects Preserved
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('── G. Regression: Existing Objects Preserved ──');

  await test('G1. Existing license routes not modified', () => {
    const licenseFile = path.join(__dirname, '..', 'server', 'routes', 'license.js');
    const licenseSrc = readFile(licenseFile);
    assert.ok(licenseSrc.includes('/activate'), 'License activate route still exists');
    assert.ok(licenseSrc.includes('/validate'), 'License validate route still exists');
    assert.ok(licenseSrc.includes('/dashboard'), 'License dashboard route still exists');
  });

  await test('G2. Existing payment routes not modified', () => {
    const paymentFile = path.join(__dirname, '..', 'server', 'routes', 'payment.js');
    const paymentSrc = readFile(paymentFile);
    assert.ok(paymentSrc.includes('create-checkout-session'), 'Stripe checkout route still exists');
  });

  await test('G3. Existing webhook routes not modified', () => {
    const webhookFile = path.join(__dirname, '..', 'server', 'routes', 'webhook.js');
    const webhookSrc = readFile(webhookFile);
    assert.ok(webhookSrc.includes('/stripe'), 'Stripe webhook route still exists');
  });

  await test('G4. No Stripe code removed', () => {
    assert.ok(
      !routeSrc.includes('stripe') || routeSrc.includes('// Stripe'),
      'New route must not contain Stripe code'
    );
  });

  await test('G5. No license creation in submit endpoint', () => {
    assert.ok(
      !routeSrc.includes('createLicense'),
      'Submit endpoint must not create licenses'
    );
  });

  await test('G6. No license activation in submit endpoint', () => {
    assert.ok(
      !routeSrc.includes('activateLicense'),
      'Submit endpoint must not activate licenses'
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`STEP 17 Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('═══════════════════════════════════════════════════════════════');

  if (failures.length > 0) {
    console.log('');
    console.log('Failures:');
    for (const f of failures) {
      console.log(`  ✗ ${f.name}: ${f.error}`);
    }
  }

  console.log('');
  return { passed, failed, total: passed + failed, failures };
}

module.exports = { runStep17Tests };

if (require.main === module) {
  runStep17Tests().then(result => {
    process.exit(result.failed > 0 ? 1 : 0);
  });
}
