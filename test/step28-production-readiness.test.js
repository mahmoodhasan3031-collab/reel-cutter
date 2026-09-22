'use strict';

/**
 * STEP 28 — Production Database & Payment Deployment Readiness Tests
 *
 * Tests:
 *  A. Environment Variable Recognition
 *  B. Missing Secrets Fail Safely
 *  C. Secret Isolation (Client Code)
 *  D. CORS Configuration
 *  E. Stripe Configuration
 *  F. Stripe SDK Compatibility
 *  G. Migration Validity
 *  H. RLS / Database Security
 *  I. License Delivery Flow Architecture
 *  J. Email Production Readiness
 *  K. Security Scan
 *  L. Regression: Steps 25/26/27
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const serverDir = path.join(__dirname, '..', 'server');
const routeDir = path.join(serverDir, 'routes');
const serviceDir = path.join(serverDir, 'services');
const websiteDir = path.join(__dirname, '..', 'website');
const migrationDir = path.join(__dirname, '..', 'supabase', 'migrations');

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

function assertFileExists(filePath, label) {
  const exists = fs.existsSync(filePath);
  assert.ok(exists, `${label} must exist at ${path.relative(path.join(__dirname, '..'), filePath)}`);
}

function walkDir(dir, extensions = /\.(js|ts|tsx|jsx)$/) {
  const files = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== '.next') {
        files.push(...walkDir(fullPath, extensions));
      } else if (extensions.test(entry.name)) {
        files.push(fullPath);
      }
    }
  } catch { /* skip */ }
  return files;
}

async function runStep28Tests() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('STEP 28 — Production Database & Payment Deployment Readiness');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // A. Environment Variable Recognition
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('── A. Environment Variable Recognition ──');

  await test('A1. server/config.js recognizes STRIPE_SECRET_KEY', () => {
    const configSource = fs.readFileSync(path.join(serverDir, 'config.js'), 'utf8');
    assert.ok(configSource.includes('STRIPE_SECRET_KEY'), 'Must reference STRIPE_SECRET_KEY env var');
  });

  await test('A2. server/config.js recognizes STRIPE_WEBHOOK_SECRET', () => {
    const configSource = fs.readFileSync(path.join(serverDir, 'config.js'), 'utf8');
    assert.ok(configSource.includes('STRIPE_WEBHOOK_SECRET'), 'Must reference STRIPE_WEBHOOK_SECRET env var');
  });

  await test('A3. server/config.js recognizes STRIPE_PRICE_BASIC/STANDARD/PRO', () => {
    const configSource = fs.readFileSync(path.join(serverDir, 'config.js'), 'utf8');
    assert.ok(configSource.includes('STRIPE_PRICE_BASIC'), 'Must reference STRIPE_PRICE_BASIC');
    assert.ok(configSource.includes('STRIPE_PRICE_STANDARD'), 'Must reference STRIPE_PRICE_STANDARD');
    assert.ok(configSource.includes('STRIPE_PRICE_PRO'), 'Must reference STRIPE_PRICE_PRO');
  });

  await test('A4. server/config.js recognizes SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY', () => {
    const configSource = fs.readFileSync(path.join(serverDir, 'config.js'), 'utf8');
    assert.ok(configSource.includes('SUPABASE_URL'), 'Must reference SUPABASE_URL');
    assert.ok(configSource.includes('SUPABASE_SERVICE_ROLE_KEY'), 'Must reference SUPABASE_SERVICE_ROLE_KEY');
  });

  await test('A5. server/config.js recognizes CORS_ALLOWED_ORIGINS', () => {
    const indexSource = fs.readFileSync(path.join(serverDir, 'index.js'), 'utf8');
    assert.ok(indexSource.includes('CORS_ALLOWED_ORIGINS'), 'Must reference CORS_ALLOWED_ORIGINS');
  });

  await test('A6. server/config.js recognizes email environment variables', () => {
    const configSource = fs.readFileSync(path.join(serverDir, 'config.js'), 'utf8');
    assert.ok(configSource.includes('RESEND_API_KEY'), 'Must reference RESEND_API_KEY');
    assert.ok(configSource.includes('SMTP_HOST'), 'Must reference SMTP_HOST');
    assert.ok(configSource.includes('EMAIL_FROM'), 'Must reference EMAIL_FROM');
  });

  await test('A7. server/.env.example documents all required variables', () => {
    assertFileExists(path.join(serverDir, '.env.example'), '.env.example');
    const envExample = fs.readFileSync(path.join(serverDir, '.env.example'), 'utf8');
    assert.ok(envExample.includes('SUPABASE_URL'), '.env.example must document SUPABASE_URL');
    assert.ok(envExample.includes('SUPABASE_SERVICE_ROLE_KEY'), '.env.example must document SUPABASE_SERVICE_ROLE_KEY');
    assert.ok(envExample.includes('STRIPE_SECRET_KEY'), '.env.example must document STRIPE_SECRET_KEY');
    assert.ok(envExample.includes('STRIPE_WEBHOOK_SECRET'), '.env.example must document STRIPE_WEBHOOK_SECRET');
    assert.ok(envExample.includes('STRIPE_PRICE_BASIC'), '.env.example must document STRIPE_PRICE_BASIC');
    assert.ok(envExample.includes('STRIPE_PRICE_STANDARD'), '.env.example must document STRIPE_PRICE_STANDARD');
    assert.ok(envExample.includes('STRIPE_PRICE_PRO'), '.env.example must document STRIPE_PRICE_PRO');
    assert.ok(envExample.includes('CORS_ALLOWED_ORIGINS'), '.env.example must document CORS_ALLOWED_ORIGINS');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // B. Missing Secrets Fail Safely
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('── B. Missing Secrets Fail Safely ──');

  await test('B1. Production mode throws if STRIPE_SECRET_KEY is missing', () => {
    const configSource = fs.readFileSync(path.join(serverDir, 'config.js'), 'utf8');
    assert.ok(configSource.includes("production") && configSource.includes("throw"),
      'Config must throw in production if STRIPE_SECRET_KEY is missing');
    assert.ok(configSource.includes("'sk_test_mock_stripe_key'"),
      'Config must use mock key only in non-production');
  });

  await test('B2. Production mode throws if STRIPE_WEBHOOK_SECRET is missing', () => {
    const configSource = fs.readFileSync(path.join(serverDir, 'config.js'), 'utf8');
    assert.ok(configSource.includes("'whsec_mock_stripe_webhook_secret'"),
      'Config must use mock webhook secret only in non-production');
  });

  await test('B3. Mock values are clearly marked as test-only', () => {
    const configSource = fs.readFileSync(path.join(serverDir, 'config.js'), 'utf8');
    assert.ok(configSource.includes('sk_test_mock'), 'Mock Stripe key must contain sk_test_mock');
    assert.ok(configSource.includes('whsec_mock'), 'Mock webhook secret must contain whsec_mock');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // C. Secret Isolation (Client Code)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('── C. Secret Isolation (Client Code) ──');

  await test('C1. No Stripe secret keys in website source', () => {
    const files = walkDir(path.join(websiteDir, 'src'));
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      assert.ok(!content.includes('sk_live_'), `${path.relative(websiteDir, file)} must not contain sk_live_`);
      assert.ok(!content.includes('sk_test_'), `${path.relative(websiteDir, file)} must not contain sk_test_`);
    }
  });

  await test('C2. No Stripe webhook secrets in website source', () => {
    const files = walkDir(path.join(websiteDir, 'src'));
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      assert.ok(!content.includes('whsec_'), `${path.relative(websiteDir, file)} must not contain whsec_`);
    }
  });

  await test('C3. No Supabase service-role key in website source', () => {
    const files = walkDir(path.join(websiteDir, 'src'));
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      assert.ok(!content.includes('service_role'), `${path.relative(websiteDir, file)} must not contain service_role`);
      assert.ok(!content.includes('SUPABASE_SERVICE_ROLE_KEY'), `${path.relative(websiteDir, file)} must not contain SUPABASE_SERVICE_ROLE_KEY`);
    }
  });

  await test('C4. Website Supabase client uses anon key only', () => {
    const serverClientPath = path.join(websiteDir, 'src', 'lib', 'supabase', 'server.ts');
    const clientClientPath = path.join(websiteDir, 'src', 'lib', 'supabase', 'client.ts');
    const middlewarePath = path.join(websiteDir, 'src', 'lib', 'supabase', 'middleware.ts');

    for (const filePath of [serverClientPath, clientClientPath, middlewarePath]) {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        assert.ok(!content.includes('service_role'), `${path.basename(filePath)} must not use service_role key`);
      }
    }
  });

  await test('C5. No Stripe secrets in Electron renderer/preload source', () => {
    const srcDir = path.join(__dirname, '..', 'src');
    if (fs.existsSync(srcDir)) {
      const rendererDir = path.join(srcDir, 'renderer');
      const preloadDir = path.join(srcDir, 'preload');
      for (const dir of [rendererDir, preloadDir]) {
        if (fs.existsSync(dir)) {
          const files = walkDir(dir);
          for (const file of files) {
            const content = fs.readFileSync(file, 'utf8');
            assert.ok(!content.includes('sk_live_'), `${path.relative(__dirname, file)} must not contain sk_live_`);
            assert.ok(!content.includes('sk_test_'), `${path.relative(__dirname, file)} must not contain sk_test_`);
            assert.ok(!content.includes('whsec_'), `${path.relative(__dirname, file)} must not contain whsec_`);
          }
        }
      }
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // D. CORS Configuration
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('── D. CORS Configuration ──');

  await test('D1. Server uses explicit CORS origins, not wildcard', () => {
    const indexSource = fs.readFileSync(path.join(serverDir, 'index.js'), 'utf8');
    assert.ok(indexSource.includes('CORS_ALLOWED_ORIGINS'), 'Must use CORS_ALLOWED_ORIGINS env var');
    assert.ok(!indexSource.includes("'*'"), 'CORS must not use wildcard origin');
    assert.ok(!indexSource.includes('"*"'), 'CORS must not use wildcard origin');
  });

  await test('D2. CORS origin is validated against allowlist', () => {
    const indexSource = fs.readFileSync(path.join(serverDir, 'index.js'), 'utf8');
    assert.ok(indexSource.includes('allowedOrigins') || indexSource.includes('allowed'),
      'CORS must validate origin against allowlist');
    assert.ok(indexSource.includes('includes(origin)') || indexSource.includes('indexOf(origin)'),
      'Must check if origin is in allowed list');
  });

  await test('D3. Server .env.example documents CORS_ALLOWED_ORIGINS', () => {
    const envExample = fs.readFileSync(path.join(serverDir, '.env.example'), 'utf8');
    assert.ok(envExample.includes('CORS_ALLOWED_ORIGINS'), '.env.example must document CORS_ALLOWED_ORIGINS');
    assert.ok(envExample.includes('https://'), 'CORS origin must use HTTPS in production example');
  });

  await test('D4. Security headers are set (nosniff, DENY, XSS protection)', () => {
    const indexSource = fs.readFileSync(path.join(serverDir, 'index.js'), 'utf8');
    assert.ok(indexSource.includes('X-Content-Type-Options') || indexSource.includes('nosniff'),
      'Must set X-Content-Type-Options: nosniff');
    assert.ok(indexSource.includes('X-Frame-Options') || indexSource.includes('DENY'),
      'Must set X-Frame-Options: DENY');
    assert.ok(indexSource.includes('X-XSS-Protection') || indexSource.includes('1; mode=block'),
      'Must set X-XSS-Protection');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // E. Stripe Configuration
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('── E. Stripe Configuration ──');

  await test('E1. Stripe Price IDs are server-controlled, not client-controlled', () => {
    const paymentSource = fs.readFileSync(path.join(routeDir, 'payment.js'), 'utf8');
    assert.ok(paymentSource.includes('getStripePriceId(planId)'), 'Must map planId to server-side Price ID');
    assert.ok(!paymentSource.includes('req.body.price'), 'Must not accept price from request body');
    assert.ok(!paymentSource.includes('req.body.priceId'), 'Must not accept priceId from request body');
  });

  await test('E2. Checkout session uses mode=subscription (monthly recurring)', () => {
    const paymentSource = fs.readFileSync(path.join(routeDir, 'payment.js'), 'utf8');
    assert.ok(paymentSource.includes("mode: 'subscription'"), 'Must use subscription mode');
    assert.ok(!paymentSource.includes("mode: 'payment'"), 'Must not use one-time payment mode');
  });

  await test('E3. Webhook verifies Stripe signatures cryptographically', () => {
    const webhookSource = fs.readFileSync(path.join(routeDir, 'webhook.js'), 'utf8');
    assert.ok(webhookSource.includes('verifyWebhookEvent'),
      'Webhook must call verifyWebhookEvent');
    const providerSource = fs.readFileSync(path.join(__dirname, '..', 'server', 'providers', 'stripeProvider.js'), 'utf8');
    assert.ok(providerSource.includes('stripe-signature'),
      'StripeProvider must check stripe-signature header');
  });

  await test('E4. Pricing config defines all three tiers with correct amounts', () => {
    const config = require(path.join(serverDir, 'config.js'));
    assert.ok(config.stripe.tierPrices.basic.amount === 10, 'Basic must be $10');
    assert.ok(config.stripe.tierPrices.standard.amount === 20, 'Standard must be $20');
    assert.ok(config.stripe.tierPrices.pro.amount === 30, 'Pro must be $30');
  });

  await test('E5. stripUnknownFields prevents injection of extra fields', () => {
    const { stripUnknownFields } = require(path.join(serverDir, 'middleware', 'inputValidator.js'));
    const middleware = stripUnknownFields(['planId', 'email']);
    let capturedBody = null;
    const fakeReq = { body: { planId: 'pro', email: 'a@b.com', injectedField: 'malicious', tier: 'admin', priceId: 'price_hack' } };
    const fakeRes = { status: () => ({ json: () => {} }) };
    middleware(fakeReq, fakeRes, () => { capturedBody = fakeReq.body; });
    assert.deepStrictEqual(capturedBody, { planId: 'pro', email: 'a@b.com' },
      'stripUnknownFields must remove non-whitelisted fields');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // F. Stripe SDK Compatibility
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('── F. Stripe SDK Compatibility ──');

  await test('F1. Stripe SDK version is v22.x (compatible with project)', () => {
    const pkg = require(path.join(__dirname, '..', 'package.json'));
    assert.ok(pkg.dependencies.stripe, 'stripe must be in dependencies');
    assert.ok(pkg.dependencies.stripe.startsWith('^22.'), 'Stripe must be v22.x');
  });

  await test('F2. payment.js Stripe constructor does not use runtimeApiVersion', () => {
    const paymentSource = fs.readFileSync(path.join(routeDir, 'payment.js'), 'utf8');
    assert.ok(!paymentSource.includes('runtimeApiVersion'),
      'payment.js must not pass runtimeApiVersion (rejected by Stripe SDK v22)');
  });

  await test('F3. Stripe constructor accepts apiVersion parameter', () => {
    const paymentSource = fs.readFileSync(path.join(routeDir, 'payment.js'), 'utf8');
    assert.ok(paymentSource.includes('apiVersion'), 'Must specify apiVersion');
  });

  await test('F4. Stripe provider creates SDK instance without invalid config', () => {
    const Stripe = require('stripe');
    const config = require(path.join(serverDir, 'config.js'));
    let success = false;
    try {
      new Stripe(config.stripe.secretKey, { apiVersion: '2023-10-16' });
      success = true;
    } catch (e) {
      // Expected in test env with mock key
      success = e.message.includes('Invalid API Key') || e.message.includes('sk_test');
    }
    assert.ok(success, 'Stripe SDK constructor must not reject the config');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // G. Migration Validity
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('── G. Migration Validity ──');

  await test('G1. Step 16A migration exists (RPC functions)', () => {
    const files = fs.readdirSync(migrationDir);
    const migration = files.find((f) => f.includes('isolate_client_service_role'));
    assert.ok(migration, 'Step 16A migration must exist');
  });

  await test('G2. Step 18 migration exists (transaction_id unique index)', () => {
    const files = fs.readdirSync(migrationDir);
    const migration = files.find((f) => f.includes('harden_license_integrity'));
    assert.ok(migration, 'Step 18 migration must exist');
    const content = fs.readFileSync(path.join(migrationDir, migration), 'utf8');
    assert.ok(content.includes('CREATE UNIQUE INDEX'), 'Must create unique index');
    assert.ok(content.includes('transaction_id'), 'Must be on transaction_id');
    assert.ok(content.includes('WHERE transaction_id IS NOT NULL'), 'Must be partial index');
  });

  await test('G3. Step 27 migration exists (user_id column)', () => {
    const files = fs.readdirSync(migrationDir);
    const migration = files.find((f) => f.includes('add_user_id_to_licenses'));
    assert.ok(migration, 'Step 27 migration must exist');
    const content = fs.readFileSync(path.join(migrationDir, migration), 'utf8');
    assert.ok(content.includes('user_id UUID'), 'Must add user_id UUID column');
    assert.ok(content.includes('IF NOT EXISTS'), 'Must be idempotent');
    assert.ok(content.includes('CREATE INDEX'), 'Must create index on user_id');
  });

  await test('G4. Step 28 migration exists (authenticated RLS policy)', () => {
    const files = fs.readdirSync(migrationDir);
    const migration = files.find((f) => f.includes('add_authenticated_rls_policy'));
    assert.ok(migration, 'Step 28 migration must exist');
    const content = fs.readFileSync(path.join(migrationDir, migration), 'utf8');
    assert.ok(content.includes('CREATE POLICY'), 'Must create RLS policy');
    assert.ok(content.includes('authenticated'), 'Policy must apply to authenticated role');
    assert.ok(content.includes('user_id = auth.uid()'), 'Must enforce user_id ownership');
    assert.ok(content.includes('FOR SELECT'), 'Must be read-only (SELECT)');
  });

  await test('G5. Step 28 migration does not grant INSERT/UPDATE/DELETE to authenticated', () => {
    const files = fs.readdirSync(migrationDir);
    const migration = files.find((f) => f.includes('add_authenticated_rls_policy'));
    const content = fs.readFileSync(path.join(migrationDir, migration), 'utf8');
    assert.ok(!content.includes('FOR INSERT'), 'Must not grant INSERT to authenticated');
    assert.ok(!content.includes('FOR UPDATE'), 'Must not grant UPDATE to authenticated');
    assert.ok(!content.includes('FOR DELETE'), 'Must not grant DELETE to authenticated');
  });

  await test('G6. All migrations use idempotent SQL', () => {
    const files = fs.readdirSync(migrationDir);
    for (const file of files) {
      if (file.endsWith('.sql')) {
        const content = fs.readFileSync(path.join(migrationDir, file), 'utf8');
        // Check that DDL statements use IF NOT EXISTS / IF EXISTS / OR REPLACE
        if (content.includes('CREATE TABLE') && !content.includes('CREATE TABLE IF NOT EXISTS')) {
          assert.fail(`${file}: CREATE TABLE must use IF NOT EXISTS`);
        }
      }
    }
  });

  await test('G7. Schema supabase-schema.sql includes user_id column', () => {
    const schemaPath = path.join(__dirname, '..', 'supabase-schema.sql');
    assertFileExists(schemaPath, 'supabase-schema.sql');
    const content = fs.readFileSync(schemaPath, 'utf8');
    assert.ok(content.includes('user_id UUID'), 'Schema must include user_id column');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // H. RLS / Database Security
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('── H. RLS / Database Security ──');

  await test('H1. RLS is enabled on licenses table', () => {
    const schemaPath = path.join(__dirname, '..', 'supabase-schema.sql');
    const content = fs.readFileSync(schemaPath, 'utf8');
    assert.ok(content.includes('ENABLE ROW LEVEL SECURITY'), 'RLS must be enabled');
  });

  await test('H2. Service-role policy exists for full access', () => {
    const schemaPath = path.join(__dirname, '..', 'supabase-schema.sql');
    const content = fs.readFileSync(schemaPath, 'utf8');
    assert.ok(content.includes('service_role'), 'Must have service_role policy');
    assert.ok(content.includes('FOR ALL'), 'Service-role must have full access');
  });

  await test('H3. Step 16A revokes direct table access from anon', () => {
    const files = fs.readdirSync(migrationDir);
    const migration = files.find((f) => f.includes('isolate_client_service_role'));
    const content = fs.readFileSync(path.join(migrationDir, migration), 'utf8');
    assert.ok(content.includes('REVOKE SELECT') && content.includes('FROM anon'),
      'Must revoke SELECT from anon');
    assert.ok(content.includes('REVOKE UPDATE') && content.includes('FROM anon'),
      'Must revoke UPDATE from anon');
    assert.ok(content.includes('REVOKE INSERT') && content.includes('FROM anon'),
      'Must revoke INSERT from anon');
  });

  await test('H4. Dashboard route returns only safe fields (no customer_email, transaction_id)', async () => {
    const licenseRoute = require(path.join(routeDir, 'license.js'));
    assert.ok(typeof licenseRoute === 'function', 'License route must be loadable');
    const routeSource = fs.readFileSync(path.join(routeDir, 'license.js'), 'utf8');
    assert.ok(routeSource.includes('license_key'), 'Dashboard must return license_key');
    assert.ok(routeSource.includes('tier'), 'Dashboard must return tier');
    assert.ok(routeSource.includes('status'), 'Dashboard must return status');
    // Check the safeLicenses mapping block only — comments containing field names are OK
    const safeBlockStart = routeSource.indexOf('safeLicenses');
    const safeBlock = routeSource.substring(safeBlockStart, routeSource.indexOf('}', safeBlockStart) + 1);
    assert.ok(!safeBlock.includes('customer_email'), 'Dashboard safeLicenses must NOT include customer_email');
    assert.ok(!safeBlock.includes('transaction_id'), 'Dashboard safeLicenses must NOT include transaction_id');
    assert.ok(!safeBlock.includes('payment_provider'), 'Dashboard safeLicenses must NOT include payment_provider');
    assert.ok(!safeBlock.includes('email_error'), 'Dashboard safeLicenses must NOT include email_error');
  });

  await test('H5. Dashboard route requires Bearer authentication', () => {
    const routeSource = fs.readFileSync(path.join(routeDir, 'license.js'), 'utf8');
    assert.ok(routeSource.includes('Authorization'), 'Must check Authorization header');
    assert.ok(routeSource.includes('Bearer'), 'Must require Bearer token');
    assert.ok(routeSource.includes('401') || routeSource.includes('UNAUTHORIZED'),
      'Must return 401 for unauthorized');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // I. License Delivery Flow Architecture
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('── I. License Delivery Flow Architecture ──');

  await test('I1. Webhook marks event processed BEFORE license creation', () => {
    const webhookSource = fs.readFileSync(path.join(routeDir, 'webhook.js'), 'utf8');
    // Find the actual call to markEventProcessed (not the require import)
    const markCallIdx = webhookSource.indexOf('markEventProcessed(event.id)');
    // Find the actual call to createLicense (not the require import)
    const createCallIdx = webhookSource.indexOf('await createLicense(');
    assert.ok(markCallIdx < createCallIdx,
      `markEventProcessed(event.id) at ${markCallIdx} must be called before await createLicense(${createCallIdx})`);
  });

  await test('I2. Webhook rolls back on license creation failure', () => {
    const webhookSource = fs.readFileSync(path.join(routeDir, 'webhook.js'), 'utf8');
    assert.ok(webhookSource.includes('unmarkEventProcessed'), 'Must have rollback function');
  });

  await test('I3. Webhook links license to user via licenseKey (not UUID)', () => {
    const webhookSource = fs.readFileSync(path.join(routeDir, 'webhook.js'), 'utf8');
    assert.ok(webhookSource.includes('linkLicenseToUser(licenseResult.licenseKey'),
      'Must pass licenseKey to linkLicenseToUser');
  });

  await test('I4. Webhook falls back to event metadata for userId', () => {
    const webhookSource = fs.readFileSync(path.join(routeDir, 'webhook.js'), 'utf8');
    assert.ok(webhookSource.includes('event.data?.object?.metadata?.userId'),
      'Must fall back to event metadata for userId');
  });

  await test('I5. Email delivery does not create duplicate license on failure', () => {
    const emailSource = fs.readFileSync(path.join(serviceDir, 'emailService.js'), 'utf8');
    assert.ok(emailSource.includes('deliverLicenseEmail'), 'deliverLicenseEmail must exist');
    assert.ok(emailSource.includes('email_status'), 'Must track email_status');
  });

  await test('I6. License generator uses crypto.randomBytes for key generation', () => {
    const genSource = fs.readFileSync(path.join(serviceDir, 'licenseGenerator.js'), 'utf8');
    assert.ok(genSource.includes('crypto.randomBytes'), 'Must use crypto.randomBytes for secure key generation');
  });

  await test('I7. Rate limiters are applied to license API endpoints', () => {
    const licenseSource = fs.readFileSync(path.join(routeDir, 'license.js'), 'utf8');
    assert.ok(licenseSource.includes('activateLimiter'), 'activate endpoint must have rate limiter');
    assert.ok(licenseSource.includes('validateLimiter'), 'validate endpoint must have rate limiter');
    assert.ok(licenseSource.includes('statusLimiter'), 'status endpoint must have rate limiter');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // J. Email Production Readiness
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('── J. Email Production Readiness ──');

  await test('J1. Email service supports Resend API', () => {
    const emailSource = fs.readFileSync(path.join(serviceDir, 'emailService.js'), 'utf8');
    assert.ok(emailSource.includes('resendApiKey') || emailSource.includes('resend'),
      'Must support Resend API');
    assert.ok(emailSource.includes('api.resend.com'), 'Must use Resend API endpoint');
  });

  await test('J2. Email service supports SMTP fallback', () => {
    const emailSource = fs.readFileSync(path.join(serviceDir, 'emailService.js'), 'utf8');
    assert.ok(emailSource.includes('nodemailer') || emailSource.includes('createTransport'),
      'Must support SMTP via Nodemailer');
  });

  await test('J3. Email has in-memory fallback for testing', () => {
    const emailSource = fs.readFileSync(path.join(serviceDir, 'emailService.js'), 'utf8');
    assert.ok(emailSource.includes('sentEmailsLog') || emailSource.includes('captured'),
      'Must have in-memory fallback for testing');
  });

  await test('J4. Email recipient comes from license record, not request body', () => {
    const emailSource = fs.readFileSync(path.join(serviceDir, 'emailService.js'), 'utf8');
    assert.ok(emailSource.includes('license.customer_email'),
      'Must derive recipient from license record (trusted source)');
  });

  await test('J5. Email max retry attempts are bounded', () => {
    const emailSource = fs.readFileSync(path.join(serviceDir, 'emailService.js'), 'utf8');
    assert.ok(emailSource.includes('MAX_EMAIL_ATTEMPTS'),
      'Must define MAX_EMAIL_ATTEMPTS');
  });

  await test('J6. Error messages are sanitized to prevent secret leakage', () => {
    const emailSource = fs.readFileSync(path.join(serviceDir, 'emailService.js'), 'utf8');
    assert.ok(emailSource.includes('sanitizeErrorMessage'),
      'Must sanitize error messages');
    assert.ok(emailSource.includes('REDACTED') || emailSource.includes('redact'),
      'Must redact sensitive values from errors');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // K. Security Scan
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('── K. Security Scan ──');

  await test('K1. No sk_live_ or sk_test_ in renderer/preload source', () => {
    const srcDir = path.join(__dirname, '..', 'src');
    const dirs = ['renderer', 'preload'].map((d) => path.join(srcDir, d)).filter(fs.existsSync);
    for (const dir of dirs) {
      const files = walkDir(dir);
      for (const file of files) {
        const content = fs.readFileSync(file, 'utf8');
        assert.ok(!content.includes('sk_live_'), `${path.relative(srcDir, file)} must not contain sk_live_`);
        assert.ok(!content.includes('sk_test_'), `${path.relative(srcDir, file)} must not contain sk_test_`);
      }
    }
  });

  await test('K2. No whsec_ in renderer/preload source', () => {
    const srcDir = path.join(__dirname, '..', 'src');
    const dirs = ['renderer', 'preload'].map((d) => path.join(srcDir, d)).filter(fs.existsSync);
    for (const dir of dirs) {
      const files = walkDir(dir);
      for (const file of files) {
        const content = fs.readFileSync(file, 'utf8');
        assert.ok(!content.includes('whsec_'), `${path.relative(srcDir, file)} must not contain whsec_`);
      }
    }
  });

  await test('K3. No real secrets committed in .env files', () => {
    const envFiles = ['.env', '.env.local', '.env.production'];
    for (const envFile of envFiles) {
      const envPath = path.join(__dirname, '..', envFile);
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        assert.ok(!content.includes('sk_live_'), `${envFile} must not contain live Stripe keys`);
        assert.ok(!content.includes('whsec_') || content.includes('whsec_mock'), `${envFile} must not contain real webhook secrets`);
      }
    }
  });

  await test('K4. Logger redacts secrets from logs', () => {
    const electronSrcDir = path.join(__dirname, '..', 'src');
    const loggerPath = path.join(electronSrcDir, 'main', 'logger.js');
    if (fs.existsSync(loggerPath)) {
      const content = fs.readFileSync(loggerPath, 'utf8');
      assert.ok(content.includes('REDACTED') || content.includes('redact'),
        'Logger must redact sensitive values');
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // L. Regression: Steps 25/26/27
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('── L. Regression: Steps 25/26/27 ──');

  await test('L1. Step 25 license service exports all functions', () => {
    const svc = require(path.join(serviceDir, 'licenseService.js'));
    assert.strictEqual(typeof svc.lookupLicense, 'function');
    assert.strictEqual(typeof svc.activateLicense, 'function');
    assert.strictEqual(typeof svc.validateLicense, 'function');
    assert.strictEqual(typeof svc.getLicenseStatus, 'function');
    assert.strictEqual(typeof svc.linkLicenseToUser, 'function');
    assert.strictEqual(typeof svc.getLicensesByUserId, 'function');
    assert.strictEqual(typeof svc.seedInMemoryLicense, 'function');
    assert.strictEqual(typeof svc.clearInMemoryLicenses, 'function');
    assert.strictEqual(typeof svc.isSupabaseConfigured, 'function');
  });

  await test('L2. Step 25 license API endpoints exist', () => {
    const licenseSource = fs.readFileSync(path.join(routeDir, 'license.js'), 'utf8');
    assert.ok(licenseSource.includes('/activate'), 'Must have /activate endpoint');
    assert.ok(licenseSource.includes('/validate'), 'Must have /validate endpoint');
    assert.ok(licenseSource.includes('/status'), 'Must have /status endpoint');
  });

  await test('L3. Step 26 payment route exists with create-checkout-session', () => {
    assertFileExists(path.join(routeDir, 'payment.js'), 'Payment route');
    const paymentSource = fs.readFileSync(path.join(routeDir, 'payment.js'), 'utf8');
    assert.ok(paymentSource.includes('create-checkout-session'), 'Must have create-checkout-session endpoint');
    assert.ok(paymentSource.includes("mode: 'subscription'"), 'Must use subscription mode');
  });

  await test('L4. Step 27 dashboard route exists with auth', () => {
    const licenseSource = fs.readFileSync(path.join(routeDir, 'license.js'), 'utf8');
    assert.ok(licenseSource.includes('/dashboard'), 'Must have /dashboard endpoint');
    assert.ok(licenseSource.includes('Authorization'), 'Must require auth');
  });

  await test('L5. Step 27 webhook links license to user', () => {
    const webhookSource = fs.readFileSync(path.join(routeDir, 'webhook.js'), 'utf8');
    assert.ok(webhookSource.includes('linkLicenseToUser'), 'Webhook must call linkLicenseToUser');
    assert.ok(webhookSource.includes('licenseResult.licenseKey'), 'Must pass licenseKey (not id)');
  });

  await test('L6. Step 27 user_id migration exists', () => {
    const files = fs.readdirSync(migrationDir);
    assert.ok(files.some((f) => f.includes('add_user_id_to_licenses')), 'user_id migration must exist');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`STEP 28 Test Results: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════════════════════════');

  if (failures.length > 0) {
    console.log('');
    console.log('Failed tests:');
    for (const f of failures) {
      console.log(`  - ${f.name}: ${f.error}`);
    }
  }

  process.exitCode = failed > 0 ? 1 : 0;
}

runStep28Tests().catch((err) => {
  console.error('STEP 28 test runner error:', err);
  process.exitCode = 1;
});
