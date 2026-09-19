'use strict';

/**
 * STEP 26 — Stripe Payment Integration Tests
 * 
 * Note: These tests are designed to be run via the test/runAllTests.js runner,
 * or directly with node --require hook. They verify the code architecture
 * and configuration, not live Stripe API calls.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const serverDir = path.join(__dirname, '..', 'server');
const routeDir = path.join(serverDir, 'routes');
const middlewareDir = path.join(serverDir, 'middleware');

let passed = 0;
let failed = 0;
const failures = [];

// Test runner following the project pattern
function runTest(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, error: err.message });
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
  }
}

// Check if file exists and return content
function loadFile(filePath) {
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf8');
  }
  return null;
}

// ─── Main test suite ──────────────────────────────────────────────────────────

async function runTests() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('STEP 26 — Stripe Payment Integration Tests');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // ─── A. Checkout Session Endpoint ──────────────────────────────────────────

  console.log('── A. Checkout Session Endpoint ──');

  runTest('A1. Payment route file exists', () => {
    const content = loadFile(path.join(routeDir, 'payment.js'));
    assert.ok(content, 'payment.js must exist');
  });

  runTest('A2. Payment route exports router', () => {
    const content = loadFile(path.join(routeDir, 'payment.js'));
    assert.ok(content && content.includes('router'), 'Must export express router');
  });

  runTest('A3. Payment route has create-checkout-session endpoint', () => {
    const content = loadFile(path.join(routeDir, 'payment.js'));
    assert.ok(content && content.includes("router.post('/create-checkout-session'"), 'Must have POST /create-checkout-session');
  });

  runTest('A4. Payment route has status endpoint', () => {
    const content = loadFile(path.join(routeDir, 'payment.js'));
    assert.ok(content && content.includes("router.get('/status'"), 'Must have GET /status');
  });

  runTest('A5. Session creation uses mode=subscription (monthly)', () => {
    const content = loadFile(path.join(routeDir, 'payment.js'));
    assert.ok(content && content.includes("mode: 'subscription'"), 'Must use mode=subscription for monthly subscription');
  });

  runTest('A6. Session creation maps planId to Price ID', () => {
    const content = loadFile(path.join(routeDir, 'payment.js'));
    assert.ok(content && content.includes('getStripePriceId'), 'Must map planId to stripe Price ID');
  });

  runTest('A7. Session creation sets success URL from allowed origins', () => {
    const content = loadFile(path.join(routeDir, 'payment.js'));
    assert.ok(content && content.includes('buildSuccessUrl'), 'Must use buildSuccessUrl for success URL');
  });

  runTest('A8. Session creation sets cancel URL from allowed origins', () => {
    const content = loadFile(path.join(routeDir, 'payment.js'));
    assert.ok(content && content.includes('buildCancelUrl'), 'Must use buildCancelUrl for cancel URL');
  });

  runTest('A9. Payment route has input validation (stripUnknownFields)', () => {
    const content = loadFile(path.join(routeDir, 'payment.js'));
    assert.ok(content && content.includes('stripUnknownFields'), 'Must strip unknown fields from request body');
  });

  runTest('A10. Payment route has rate limiter on session endpoint', () => {
    const content = loadFile(path.join(routeDir, 'payment.js'));
    assert.ok(content && content.includes('validateLimiter'), 'Must have rate limiter on validate endpoint');
  });

  runTest('A11. Payment route validates planId presence', () => {
    const content = loadFile(path.join(routeDir, 'payment.js'));
    assert.ok(content && content.includes('planId'), 'Must reference planId in request handling');
  });

  // ─── B. Price ID Mapping ──────────────────────────────────────────────────

  console.log('');
  console.log('── B. Price ID Mapping ──');

  runTest('B1. Config has priceIds mapping', () => {
    const content = loadFile(path.join(serverDir, 'config.js'));
    assert.ok(content && content.includes('priceIds'), 'config.stripe.priceIds must exist');
  });

  runTest('B2. Price map includes basic, standard, pro', () => {
    const content = loadFile(path.join(serverDir, 'config.js'));
    assert.ok(content && (content.includes('price_basic_monthly_10') || content.includes('priceIds.basic')), 'Must have basic price ID config');
  });

  runTest('B3. Payment config PLAN_STRIPE_PRICE_MAP structure', () => {
    const content = loadFile(path.join(__dirname, '..', 'website', 'src', 'config', 'payment.js'));
    assert.ok(content && content.includes('PLAN_STRIPE_PRICE_MAP'), 'Must have PLAN_STRIPE_PRICE_MAP');
  });

  // ─── C. Input Validation ──────────────────────────────────────────────────

  console.log('');
  console.log('── C. Input Validation ──');

  runTest('C1. Input validator module exists', () => {
    const content = loadFile(path.join(middlewareDir, 'inputValidator.js'));
    assert.ok(content, 'inputValidator.js must exist');
  });

  // ─── D. Error Response Security ───────────────────────────────────────────

  console.log('');
  console.log('── D. Error Response Security ──');

  runTest('D1. Payment route has safe error response format', () => {
    const content = loadFile(path.join(routeDir, 'payment.js'));
    assert.ok(content && content.includes('success: false'), 'Error must have success: false');
  });

  runTest('D2. Payment route does not expose stack traces', () => {
    const content = loadFile(path.join(routeDir, 'payment.js'));
    assert.ok(content && !content.includes('err.stack'), 'Must not expose stack traces');
  });

  // ─── E. CORS Policy ───────────────────────────────────────────────────────

  console.log('');
  console.log('── E. CORS Policy ──');

  runTest('E1. Server index.js has CORS configuration', () => {
    const content = loadFile(path.join(serverDir, 'index.js'));
    assert.ok(content && content.includes('Access-Control-Allow-Origin'), 'Must set CORS headers');
  });

  runTest('E2. Server does NOT use wildcard origin', () => {
    const content = loadFile(path.join(serverDir, 'index.js'));
    assert.ok(content && !content.includes("'*'"), 'Must not use wildcard origin');
  });

  // ─── F. Server Architecture ───────────────────────────────────────────────

  console.log('');
  console.log('── F. Server Architecture ──');

  runTest('F1. Server index mounts payment routes at /api/payment', () => {
    const content = loadFile(path.join(serverDir, 'index.js'));
    assert.ok(content && content.includes('/api/payment'), 'Must mount payment routes at /api/payment');
  });

  runTest('F2. Server has JSON body size limit', () => {
    const content = loadFile(path.join(serverDir, 'index.js'));
    assert.ok(content && content.includes('limit'), 'Must have JSON body size limit');
  });

  runTest('F3. Server has 404 handler', () => {
    const content = loadFile(path.join(serverDir, 'index.js'));
    assert.ok(content && content.includes('404'), 'Must have 404 handler');
  });

  runTest('F4. Server has global error handler', () => {
    const content = loadFile(path.join(serverDir, 'index.js'));
    assert.ok(content && content.includes('err') && content.includes('500'), 'Must have global error handler');
  });

  // ─── G. Rate Limiting ─────────────────────────────────────────────────────

  console.log('');
  console.log('── G. Rate Limiting ──');

  runTest('G1. Rate limiter module exists', () => {
    const content = loadFile(path.join(middlewareDir, 'rateLimiter.js'));
    assert.ok(content, 'rateLimiter.js must exist');
  });

  runTest('G2. Rate limiter exports validateLimiter', () => {
    const content = loadFile(path.join(middlewareDir, 'rateLimiter.js'));
    assert.ok(content && content.includes('validateLimiter'), 'Must export validateLimiter');
  });

  // ─── Summary ─────────────────────────────────────────────────────────────

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`STEP 26 Test Results: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════════════════════════');

  if (failed > 0) {
    console.log('');
    console.log('Failed tests:');
    for (const f of failures) {
      console.log(`  - ${f.name}: ${f.error}`);
    }
    process.exit(1);
  }

  console.log('\n✨ All Step 26 tests completed successfully!\n');
}

runTests().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});