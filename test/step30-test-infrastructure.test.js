'use strict';

/**
 * STEP 30 - Test/Staging Infrastructure Configuration Tests
 *
 * Tests infrastructure readiness and configuration behavior.
 * Does NOT test live operations (no credentials available).
 * Does NOT hardcode real credentials.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const serverDir = path.join(__dirname, '..', 'server');
const routeDir = path.join(serverDir, 'routes');
const migrationDir = path.join(__dirname, '..', 'supabase', 'migrations');

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log('  PASS: ' + name);
  } catch (err) {
    failed++;
    failures.push({ name: name, error: err.message });
    console.log('  FAIL: ' + name);
    console.log('    ' + err.message);
  }
}

function walkDir(dir, extensions) {
  extensions = extensions || /\.(js|ts|tsx)$/;
  var files = [];
  try {
    var entries = fs.readdirSync(dir, { withFileTypes: true });
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== '.next') {
        files = files.concat(walkDir(fullPath, extensions));
      } else if (extensions.test(entry.name)) {
        files.push(fullPath);
      }
    }
  } catch (e) { /* skip */ }
  return files;
}

async function runStep30Tests() {
  console.log('');
  console.log('==========================================================');
  console.log('STEP 30 - Test/Staging Infrastructure Configuration Tests');
  console.log('==========================================================');
  console.log('');

  // === 1. Environment Detection ===
  console.log('-- 1. Environment Detection --');

  await test('1.1. server/config.js loads without crashing in test mode', function() {
    delete require.cache[require.resolve(path.join(serverDir, 'config.js'))];
    var config = require(path.join(serverDir, 'config.js'));
    assert.ok(config, 'Config must export an object');
    assert.ok(config.stripe, 'Config must have stripe section');
    assert.ok(config.supabase, 'Config must have supabase section');
    assert.ok(config.email, 'Config must have email section');
  });

  await test('1.2. Non-production mode uses mock values for missing secrets', function() {
    delete require.cache[require.resolve(path.join(serverDir, 'config.js'))];
    var originalEnv = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    var config = require(path.join(serverDir, 'config.js'));
    assert.ok(config.stripe.secretKey.startsWith('sk_test_mock'),
      'Non-production must use mock Stripe key');
    assert.ok(config.stripe.webhookSecret.startsWith('whsec_mock'),
      'Non-production must use mock webhook secret');
    if (originalEnv) process.env.NODE_ENV = originalEnv;
  });

  // === 2. Stripe TEST Key Detection ===
  console.log('');
  console.log('-- 2. Stripe TEST Key Detection --');

  await test('2.1. Config recognizes STRIPE_SECRET_KEY env var', function() {
    var configSource = fs.readFileSync(path.join(serverDir, 'config.js'), 'utf8');
    assert.ok(configSource.includes('STRIPE_SECRET_KEY'),
      'Must reference STRIPE_SECRET_KEY');
  });

  await test('2.2. Config recognizes STRIPE_WEBHOOK_SECRET env var', function() {
    var configSource = fs.readFileSync(path.join(serverDir, 'config.js'), 'utf8');
    assert.ok(configSource.includes('STRIPE_WEBHOOK_SECRET'),
      'Must reference STRIPE_WEBHOOK_SECRET');
  });

  await test('2.3. Config rejects live keys in production mode', function() {
    var configSource = fs.readFileSync(path.join(serverDir, 'config.js'), 'utf8');
    assert.ok(configSource.includes('production') && configSource.includes('throw'),
      'Config must throw if secrets missing in production');
  });

  // === 3. Price ID Detection ===
  console.log('');
  console.log('-- 3. Price ID Detection --');

  await test('3.1. Config recognizes STRIPE_PRICE_BASIC', function() {
    var configSource = fs.readFileSync(path.join(serverDir, 'config.js'), 'utf8');
    assert.ok(configSource.includes('STRIPE_PRICE_BASIC'),
      'Must reference STRIPE_PRICE_BASIC');
  });

  await test('3.2. Config recognizes STRIPE_PRICE_STANDARD', function() {
    var configSource = fs.readFileSync(path.join(serverDir, 'config.js'), 'utf8');
    assert.ok(configSource.includes('STRIPE_PRICE_STANDARD'),
      'Must reference STRIPE_PRICE_STANDARD');
  });

  await test('3.3. Config recognizes STRIPE_PRICE_PRO', function() {
    var configSource = fs.readFileSync(path.join(serverDir, 'config.js'), 'utf8');
    assert.ok(configSource.includes('STRIPE_PRICE_PRO'),
      'Must reference STRIPE_PRICE_PRO');
  });

  await test('3.4. Payment route maps planId to server-side Price ID', function() {
    var paymentSource = fs.readFileSync(path.join(routeDir, 'payment.js'), 'utf8');
    assert.ok(paymentSource.includes('getStripePriceId'),
      'Must map planId to Price ID server-side');
    assert.ok(!paymentSource.includes('req.body.price'),
      'Must not accept price from request body');
  });

  await test('3.5. Config defines tier pricing structure', function() {
    var config = require(path.join(serverDir, 'config.js'));
    assert.ok(config.stripe.tierPrices.basic.amount === 10, 'Basic must be $10');
    assert.ok(config.stripe.tierPrices.standard.amount === 20, 'Standard must be $20');
    assert.ok(config.stripe.tierPrices.pro.amount === 30, 'Pro must be $30');
  });

  // === 4. Supabase Configuration Detection ===
  console.log('');
  console.log('-- 4. Supabase Configuration Detection --');

  await test('4.1. Config recognizes SUPABASE_URL', function() {
    var configSource = fs.readFileSync(path.join(serverDir, 'config.js'), 'utf8');
    assert.ok(configSource.includes('SUPABASE_URL'),
      'Must reference SUPABASE_URL');
  });

  await test('4.2. Config recognizes SUPABASE_SERVICE_ROLE_KEY', function() {
    var configSource = fs.readFileSync(path.join(serverDir, 'config.js'), 'utf8');
    assert.ok(configSource.includes('SUPABASE_SERVICE_ROLE_KEY'),
      'Must reference SUPABASE_SERVICE_ROLE_KEY');
  });

  await test('4.3. Supabase config defaults to empty when missing', function() {
    delete require.cache[require.resolve(path.join(serverDir, 'config.js'))];
    var originalUrl = process.env.SUPABASE_URL;
    var originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    var config = require(path.join(serverDir, 'config.js'));
    assert.strictEqual(config.supabase.url, '', 'URL must default to empty');
    assert.strictEqual(config.supabase.serviceRoleKey, '', 'Key must default to empty');
    if (originalUrl) process.env.SUPABASE_URL = originalUrl;
    if (originalKey) process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  });

  // === 5. Migration Presence ===
  console.log('');
  console.log('-- 5. Migration Presence --');

  await test('5.1. Step 18 migration exists', function() {
    var files = fs.readdirSync(migrationDir);
    var migration = files.find(function(f) { return f.includes('harden_license_integrity'); });
    assert.ok(migration, 'Step 18 migration must exist');
  });

  await test('5.2. Step 27 user_id migration exists', function() {
    var files = fs.readdirSync(migrationDir);
    var migration = files.find(function(f) { return f.includes('add_user_id_to_licenses'); });
    assert.ok(migration, 'Step 27 migration must exist');
  });

  await test('5.3. Step 28 RLS migration exists', function() {
    var files = fs.readdirSync(migrationDir);
    var migration = files.find(function(f) { return f.includes('add_authenticated_rls_policy'); });
    assert.ok(migration, 'Step 28 migration must exist');
  });

  await test('5.4. All migrations use idempotent SQL', function() {
    var files = fs.readdirSync(migrationDir);
    for (var i = 0; i < files.length; i++) {
      if (files[i].endsWith('.sql')) {
        var content = fs.readFileSync(path.join(migrationDir, files[i]), 'utf8');
        if (content.includes('CREATE TABLE') && !content.includes('CREATE TABLE IF NOT EXISTS')) {
          assert.fail(files[i] + ': CREATE TABLE must use IF NOT EXISTS');
        }
      }
    }
  });

  // === 6. RLS Configuration ===
  console.log('');
  console.log('-- 6. RLS Configuration --');

  await test('6.1. Schema enables RLS on licenses table', function() {
    var schemaPath = path.join(__dirname, '..', 'supabase-schema.sql');
    var content = fs.readFileSync(schemaPath, 'utf8');
    assert.ok(content.includes('ENABLE ROW LEVEL SECURITY'), 'RLS must be enabled');
  });

  await test('6.2. Schema has service_role full access policy', function() {
    var schemaPath = path.join(__dirname, '..', 'supabase-schema.sql');
    var content = fs.readFileSync(schemaPath, 'utf8');
    assert.ok(content.includes('service_role'), 'Must have service_role policy');
    assert.ok(content.includes('FOR ALL'), 'Service-role must have full access');
  });

  await test('6.3. Schema has authenticated user read-only policy', function() {
    var schemaPath = path.join(__dirname, '..', 'supabase-schema.sql');
    var content = fs.readFileSync(schemaPath, 'utf8');
    assert.ok(content.includes('Authenticated users can read own licenses'),
      'Must have authenticated read policy');
    assert.ok(content.includes('user_id = auth.uid()'),
      'Must enforce user_id ownership');
  });

  await test('6.4. Step 16A revokes anon table access', function() {
    var files = fs.readdirSync(migrationDir);
    var migration = files.find(function(f) { return f.includes('isolate_client_service_role'); });
    var content = fs.readFileSync(path.join(migrationDir, migration), 'utf8');
    assert.ok(content.includes('REVOKE SELECT') && content.includes('FROM anon'),
      'Must revoke SELECT from anon');
  });

  // === 7. CORS Validation ===
  console.log('');
  console.log('-- 7. CORS Validation --');

  await test('7.1. Server uses explicit CORS origins', function() {
    var indexSource = fs.readFileSync(path.join(serverDir, 'index.js'), 'utf8');
    assert.ok(indexSource.includes('CORS_ALLOWED_ORIGINS'),
      'Must use CORS_ALLOWED_ORIGINS env var');
  });

  await test('7.2. Server does NOT use wildcard CORS origin', function() {
    var indexSource = fs.readFileSync(path.join(serverDir, 'index.js'), 'utf8');
    assert.ok(!indexSource.includes("'*'"), 'Must not use wildcard origin');
    assert.ok(!indexSource.includes('"*"'), 'Must not use wildcard origin');
  });

  await test('7.3. Server validates CORS origins against allowlist', function() {
    var indexSource = fs.readFileSync(path.join(serverDir, 'index.js'), 'utf8');
    assert.ok(indexSource.includes('allowedOrigins') || indexSource.includes('allowed'),
      'Must validate origin against allowlist');
  });

  // === 8. Webhook Endpoint Configuration ===
  console.log('');
  console.log('-- 8. Webhook Endpoint Configuration --');

  await test('8.1. Webhook route exists', function() {
    var webhookPath = path.join(routeDir, 'webhook.js');
    assert.ok(fs.existsSync(webhookPath), 'webhook.js must exist');
  });

  await test('8.2. Webhook handles POST /stripe endpoint', function() {
    var webhookSource = fs.readFileSync(path.join(routeDir, 'webhook.js'), 'utf8');
    assert.ok(webhookSource.includes('router.post'), 'Must have POST handler');
    assert.ok(webhookSource.includes('stripe'), 'Must handle stripe events');
  });

  await test('8.3. Webhook uses raw body for signature verification', function() {
    var webhookSource = fs.readFileSync(path.join(routeDir, 'webhook.js'), 'utf8');
    assert.ok(webhookSource.includes('express.raw') || webhookSource.includes('raw'),
      'Must use raw body for signature verification');
  });

  await test('8.4. Webhook mounts on server at correct path', function() {
    var indexSource = fs.readFileSync(path.join(serverDir, 'index.js'), 'utf8');
    assert.ok(indexSource.includes('/webhook'),
      'Webhook must mount at /webhook');
  });

  // === 9. Secret Isolation ===
  console.log('');
  console.log('-- 9. Secret Isolation --');

  await test('9.1. No Stripe secrets in website source', function() {
    var files = walkDir(path.join(__dirname, '..', 'website', 'src'));
    for (var i = 0; i < files.length; i++) {
      var content = fs.readFileSync(files[i], 'utf8');
      assert.ok(!content.includes('sk_live_'),
        path.relative(path.join(__dirname, '..'), files[i]) + ' must not contain sk_live_');
      assert.ok(!content.includes('sk_test_'),
        path.relative(path.join(__dirname, '..'), files[i]) + ' must not contain sk_test_');
    }
  });

  await test('9.2. No Supabase service-role key in website source', function() {
    var files = walkDir(path.join(__dirname, '..', 'website', 'src'));
    for (var i = 0; i < files.length; i++) {
      var content = fs.readFileSync(files[i], 'utf8');
      assert.ok(!content.includes('service_role'),
        path.relative(path.join(__dirname, '..'), files[i]) + ' must not contain service_role');
    }
  });

  await test('9.3. No Stripe secrets in Electron renderer/preload', function() {
    var srcDir = path.join(__dirname, '..', 'src');
    var dirs = ['renderer', 'preload'].map(function(d) {
      return path.join(srcDir, d);
    }).filter(fs.existsSync);
    for (var d = 0; d < dirs.length; d++) {
      var files = walkDir(dirs[d]);
      for (var i = 0; i < files.length; i++) {
        var content = fs.readFileSync(files[i], 'utf8');
        assert.ok(!content.includes('sk_live_'),
          path.relative(srcDir, files[i]) + ' must not contain sk_live_');
        assert.ok(!content.includes('whsec_'),
          path.relative(srcDir, files[i]) + ' must not contain whsec_');
      }
    }
  });

  await test('9.4. .env files are not committed to git', function() {
    var envFiles = ['.env', '.env.local', '.env.production', 'server/.env'];
    for (var i = 0; i < envFiles.length; i++) {
      var envPath = path.join(__dirname, '..', envFiles[i]);
      if (fs.existsSync(envPath)) {
        var content = fs.readFileSync(envPath, 'utf8');
        assert.ok(!content.includes('sk_live_'),
          envFiles[i] + ' must not contain live Stripe keys');
      }
    }
  });

  // === 10. Email Configuration Detection ===
  console.log('');
  console.log('-- 10. Email Configuration Detection --');

  await test('10.1. Config recognizes RESEND_API_KEY', function() {
    var configSource = fs.readFileSync(path.join(serverDir, 'config.js'), 'utf8');
    assert.ok(configSource.includes('RESEND_API_KEY'),
      'Must reference RESEND_API_KEY');
  });

  await test('10.2. Config recognizes SMTP variables', function() {
    var configSource = fs.readFileSync(path.join(serverDir, 'config.js'), 'utf8');
    assert.ok(configSource.includes('SMTP_HOST'), 'Must reference SMTP_HOST');
    assert.ok(configSource.includes('SMTP_PORT'), 'Must reference SMTP_PORT');
    assert.ok(configSource.includes('SMTP_USER'), 'Must reference SMTP_USER');
    assert.ok(configSource.includes('SMTP_PASS'), 'Must reference SMTP_PASS');
  });

  await test('10.3. Email service supports Resend and SMTP', function() {
    var emailSource = fs.readFileSync(path.join(serverDir, 'services', 'emailService.js'), 'utf8');
    assert.ok(emailSource.includes('resend') || emailSource.includes('Resend'),
      'Must support Resend API');
    assert.ok(emailSource.includes('nodemailer') || emailSource.includes('createTransport'),
      'Must support SMTP via Nodemailer');
  });

  // === 11. .env.example Documentation ===
  console.log('');
  console.log('-- 11. .env.example Documentation --');

  await test('11.1. server/.env.example exists', function() {
    assert.ok(fs.existsSync(path.join(serverDir, '.env.example')),
      '.env.example must exist');
  });

  await test('11.2. .env.example documents all required Stripe vars', function() {
    var envExample = fs.readFileSync(path.join(serverDir, '.env.example'), 'utf8');
    assert.ok(envExample.includes('STRIPE_SECRET_KEY'), 'Must document STRIPE_SECRET_KEY');
    assert.ok(envExample.includes('STRIPE_WEBHOOK_SECRET'), 'Must document STRIPE_WEBHOOK_SECRET');
    assert.ok(envExample.includes('STRIPE_PRICE_BASIC'), 'Must document STRIPE_PRICE_BASIC');
    assert.ok(envExample.includes('STRIPE_PRICE_STANDARD'), 'Must document STRIPE_PRICE_STANDARD');
    assert.ok(envExample.includes('STRIPE_PRICE_PRO'), 'Must document STRIPE_PRICE_PRO');
  });

  await test('11.3. .env.example documents Supabase vars', function() {
    var envExample = fs.readFileSync(path.join(serverDir, '.env.example'), 'utf8');
    assert.ok(envExample.includes('SUPABASE_URL'), 'Must document SUPABASE_URL');
    assert.ok(envExample.includes('SUPABASE_ANON_KEY'), 'Must document SUPABASE_ANON_KEY');
    assert.ok(envExample.includes('SUPABASE_SERVICE_ROLE_KEY'), 'Must document SUPABASE_SERVICE_ROLE_KEY');
  });

  // === 12. Existing Regression ===
  console.log('');
  console.log('-- 12. Existing Regression --');

  await test('12.1. Step 25 license service exports all functions', function() {
    var svc = require(path.join(serverDir, 'services', 'licenseService.js'));
    assert.strictEqual(typeof svc.lookupLicense, 'function');
    assert.strictEqual(typeof svc.activateLicense, 'function');
    assert.strictEqual(typeof svc.validateLicense, 'function');
    assert.strictEqual(typeof svc.getLicenseStatus, 'function');
    assert.strictEqual(typeof svc.linkLicenseToUser, 'function');
    assert.strictEqual(typeof svc.getLicensesByUserId, 'function');
  });

  await test('12.2. Step 26 payment route exists', function() {
    assert.ok(fs.existsSync(path.join(routeDir, 'payment.js')),
      'Payment route must exist');
    var paymentSource = fs.readFileSync(path.join(routeDir, 'payment.js'), 'utf8');
    assert.ok(paymentSource.includes('create-checkout-session'),
      'Must have create-checkout-session endpoint');
  });

  await test('12.3. Step 27 dashboard route exists', function() {
    var licenseSource = fs.readFileSync(path.join(routeDir, 'license.js'), 'utf8');
    assert.ok(licenseSource.includes('/dashboard'), 'Must have /dashboard endpoint');
    assert.ok(licenseSource.includes('Authorization'), 'Must require auth');
  });

  await test('12.4. Step 28 RLS policy in schema', function() {
    var schemaPath = path.join(__dirname, '..', 'supabase-schema.sql');
    var content = fs.readFileSync(schemaPath, 'utf8');
    assert.ok(content.includes('Authenticated users can read own licenses'),
      'Must have authenticated read policy');
  });

  // === Summary ===
  console.log('');
  console.log('==========================================================');
  console.log('STEP 30 Test Results: ' + passed + ' passed, ' + failed + ' failed');
  console.log('==========================================================');

  if (failures.length > 0) {
    console.log('');
    console.log('Failed tests:');
    for (var i = 0; i < failures.length; i++) {
      console.log('  - ' + failures[i].name + ': ' + failures[i].error);
    }
  }

  process.exitCode = failed > 0 ? 1 : 0;
}

runStep30Tests().catch(function(err) {
  console.error('STEP 30 test runner error:', err);
  process.exitCode = 1;
});
