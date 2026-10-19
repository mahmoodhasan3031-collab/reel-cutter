const assert = require('assert');
const fs = require('fs');
const path = require('path');

const config = require('../server/config');
const emailService = require('../server/services/emailService');
const licenseGenerator = require('../server/services/licenseGenerator');

/**
 * STEP 97 — Minimum safe fix regressions.
 *
 * Part 1 (website download): the site must advertise the verified v1.0.7
 *   installer — the first release containing the backend HTTP license
 *   transport (commit 5120e89). Installers <= v1.0.6 call Supabase RPCs
 *   directly with the anon key and can no longer activate against
 *   production (both RPCs are service_role-only), so the website must
 *   never advertise them again.
 *
 * Part 2 (email fail-closed): in production, sendLicenseEmail must report
 *   a genuine failure when no provider (Resend/SMTP) is configured, so
 *   deliverLicenseEmail can never record email_status='sent' for a message
 *   that never left the process. Dev/test mock behavior and configured
 *   production behavior must remain unchanged.
 */

const websiteSrcRoot = path.join(__dirname, '..', 'website', 'src');

const VERIFIED_ASSET_PATH = 'releases/download/v1.0.7/Reel-Cutter-Setup-1.0.7.exe';

// The v1.0.7 asset was verified on GitHub Releases before this test was
// written (published 2026-10-07; 274 MB; sha256 58768101...f0af0).
// Advertised tokens from the incompatible older release must not reappear.
const FORBIDDEN_ADVERTISED_TOKENS = [
  'releases/download/v1.0.6',
  'Reel-Cutter-Setup-1.0.6',
  'REEL_CUTTER_V106',
  'version: "1.0.6"',
];

function collectSourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

// Minimal chainable fake for the two Supabase query shapes used by
// getLicenseById / updateLicenseEmailStatus in production.
function makeFakeSupabaseClient(row) {
  let pendingUpdate = null;
  return {
    from() {
      return {
        select() {
          return this;
        },
        or() {
          return this;
        },
        eq() {
          return this;
        },
        update(updates) {
          pendingUpdate = updates;
          return this;
        },
        async single() {
          if (pendingUpdate) {
            Object.assign(row, pendingUpdate);
            pendingUpdate = null;
            return { data: { ...row }, error: null };
          }
          return { data: { ...row }, error: null };
        },
      };
    },
  };
}

async function runStep97Tests() {
  console.log('\n======================================================');
  console.log('🧪 Starting STEP 97 Download & Email Fail-Closed Test Suite');
  console.log('======================================================\n');

  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✓ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ FAIL: ${name}`);
      console.error(`    Error: ${err.message}\n${err.stack}`);
    }
  }

  // ─── Part 1: Website download version ─────────────────────────────────────

  await test('97.1 Website: products.ts advertises the verified v1.0.7 installer asset', () => {
    const productsPath = path.join(websiteSrcRoot, 'data', 'products.ts');
    const src = fs.readFileSync(productsPath, 'utf8');
    assert.ok(
      src.includes(VERIFIED_ASSET_PATH),
      `products.ts must link ${VERIFIED_ASSET_PATH} (asset verified on GitHub Releases)`
    );
    assert.ok(src.includes('version: "1.0.7"'), 'products.ts download.version must be "1.0.7"');
    assert.ok(!src.includes('version: "1.0.6"'), 'products.ts must not advertise version 1.0.6');
  });

  await test('97.2 Website: no source file links or names the incompatible v1.0.6 build', () => {
    const files = collectSourceFiles(websiteSrcRoot);
    assert.ok(files.length > 0, 'expected to find website source files');
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      for (const token of FORBIDDEN_ADVERTISED_TOKENS) {
        assert.ok(
          !content.includes(token),
          `${path.relative(websiteSrcRoot, file)} must not contain "${token}" (incompatible build <= v1.0.6)`
        );
      }
      // Every release-download URL on the site must target v1.0.7.
      const urls = content.match(/releases\/download\/[^"'\s)]+/g) || [];
      for (const url of urls) {
        assert.ok(
          url.startsWith('releases/download/v1.0.7/'),
          `${path.relative(websiteSrcRoot, file)} links a non-v1.0.7 release asset: ${url}`
        );
      }
    }
  });

  await test('97.3 Website: download page metadata and exports use v1.0.7 consistently', () => {
    const downloadPage = fs.readFileSync(
      path.join(websiteSrcRoot, 'app', '(brand)', 'download', 'page.tsx'),
      'utf8'
    );
    assert.ok(downloadPage.includes('v1.0.7'), 'download page must advertise v1.0.7');
    assert.ok(!downloadPage.includes('v1.0.6'), 'download page must not mention v1.0.6');
    assert.ok(
      downloadPage.includes('REEL_CUTTER_DOWNLOAD_URL'),
      'download page must use the version-neutral REEL_CUTTER_DOWNLOAD_URL export'
    );
    // The renamed export must be the one defined in products.ts.
    const productsSrc = fs.readFileSync(path.join(websiteSrcRoot, 'data', 'products.ts'), 'utf8');
    assert.ok(
      productsSrc.includes('export const REEL_CUTTER_DOWNLOAD_URL'),
      'products.ts must export REEL_CUTTER_DOWNLOAD_URL'
    );
  });

  // ─── Part 2: Email provider fail-closed ───────────────────────────────────

  const savedNodeEnv = process.env.NODE_ENV;
  const savedEmailConfig = {
    from: config.email.from,
    resendApiKey: config.email.resendApiKey,
    smtpHost: config.email.smtp.host,
    smtpPort: config.email.smtp.port,
    smtpUser: config.email.smtp.user,
    smtpPass: config.email.smtp.pass,
  };
  const savedFetch = global.fetch;

  const stripProviders = () => {
    config.email.resendApiKey = '';
    config.email.smtp.host = '';
    config.email.smtp.user = '';
    config.email.smtp.pass = '';
  };

  try {
    await test('97.4 Email, production with no provider: sendLicenseEmail fails closed (no mock success)', async () => {
      process.env.NODE_ENV = 'production';
      stripProviders();
      // No network attempt may happen on the unconfigured path.
      global.fetch = async () => {
        throw new Error('network access must not be attempted when no provider is configured');
      };

      const emailLogBefore = emailService.getSentEmails().length;
      const result = await emailService.sendLicenseEmail({
        to: 'customer@example.test',
        licenseKey: licenseGenerator.generateKeyFormat(),
        tier: 'pro',
      });

      assert.strictEqual(result.success, false, 'production without a provider must not report success');
      assert.ok(result.error && /No email provider configured/.test(result.error), 'a clear provider error is required');
      assert.strictEqual(
        emailService.getSentEmails().length,
        emailLogBefore,
        'an unsent email must not be recorded in the sent-email log'
      );
    });

    await test('97.5 Email, production with no provider: deliverLicenseEmail records failed — never sent', async () => {
      process.env.NODE_ENV = 'production';
      stripProviders();
      global.fetch = async () => {
        throw new Error('network access must not be attempted when no provider is configured');
      };

      const row = {
        id: '00000000-0000-4000-8000-000000000097',
        license_key: licenseGenerator.generateKeyFormat(),
        customer_email: 'customer@example.test',
        tier: 'pro',
        status: 'active',
        email_status: 'pending',
        email_sent_at: null,
        email_error: null,
        email_attempts: 0,
        email_last_attempt_at: null,
      };
      licenseGenerator.setSupabaseClientForTests(makeFakeSupabaseClient(row));

      const result = await emailService.deliverLicenseEmail(row.id);

      assert.strictEqual(result.success, false, 'delivery must fail without a provider in production');
      assert.strictEqual(result.email_status, 'failed', 'email_status must be "failed"');
      assert.strictEqual(row.email_status, 'failed', 'persisted email_status must be "failed"');
      assert.notStrictEqual(row.email_status, 'sent', 'email_status must never be "sent" without a provider');
      assert.strictEqual(row.email_sent_at, null, 'email_sent_at must stay null on failure');
    });

    await test('97.6 Email, development/test without provider: mock behavior preserved', async () => {
      delete process.env.NODE_ENV;
      stripProviders();
      licenseGenerator.setSupabaseClientForTests(null); // force in-memory path

      // sendLicenseEmail keeps returning the intentional mock success.
      const emailLogBefore = emailService.getSentEmails().length;
      const sendResult = await emailService.sendLicenseEmail({
        to: 'customer@example.test',
        licenseKey: licenseGenerator.generateKeyFormat(),
        tier: 'basic',
      });
      assert.strictEqual(sendResult.success, true, 'dev/test mock success must be preserved');
      assert.ok(String(sendResult.messageId).startsWith('mock-msg-'), 'mock messageId expected in dev/test');
      assert.strictEqual(emailService.getSentEmails().length, emailLogBefore + 1, 'mock capture logged');

      // deliverLicenseEmail still transitions an in-memory license to 'sent'.
      const license = await licenseGenerator.createLicense({
        tier: 'basic',
        customerEmail: 'customer@example.test',
        transactionId: 'test-tx-step97',
        paymentProvider: 'stripe',
      });
      const result = await emailService.deliverLicenseEmail(license.id);
      assert.strictEqual(result.success, true, 'dev/test delivery must succeed via mock');
      assert.strictEqual(result.email_status, 'sent', 'dev/test email_status transition to sent preserved');

      const stored = await licenseGenerator.getLicenseById(license.id);
      assert.strictEqual(stored.email_status, 'sent', 'in-memory record must reflect sent');
    });

    await test('97.7 Email, production WITH a provider configured: Resend path still succeeds and records sent', async () => {
      process.env.NODE_ENV = 'production';
      stripProviders();
      config.email.resendApiKey = 're_test_dummy_key_for_local_test_only';
      // Stub the Resend HTTP call — no real network, no real email.
      global.fetch = async () => ({
        ok: true,
        json: async () => ({ id: 'resend-stub-message-id' }),
      });

      const sendResult = await emailService.sendLicenseEmail({
        to: 'customer@example.test',
        licenseKey: licenseGenerator.generateKeyFormat(),
        tier: 'pro',
      });
      assert.strictEqual(sendResult.success, true, 'configured production provider must still succeed');
      assert.strictEqual(sendResult.messageId, 'resend-stub-message-id');

      // Full deliver path records 'sent' only because the provider accepted.
      const row = {
        id: '00000000-0000-4000-8000-000000000098',
        license_key: licenseGenerator.generateKeyFormat(),
        customer_email: 'customer@example.test',
        tier: 'pro',
        status: 'active',
        email_status: 'pending',
        email_sent_at: null,
        email_error: null,
        email_attempts: 0,
        email_last_attempt_at: null,
      };
      licenseGenerator.setSupabaseClientForTests(makeFakeSupabaseClient(row));

      const result = await emailService.deliverLicenseEmail(row.id);
      assert.strictEqual(result.success, true, 'configured production delivery must succeed');
      assert.strictEqual(result.email_status, 'sent');
      assert.strictEqual(row.email_status, 'sent', 'email_status=sent is valid only when a provider accepted');
      assert.ok(row.email_sent_at, 'email_sent_at must be recorded on success');
    });
  } finally {
    // Restore every mutation this suite made.
    if (savedNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = savedNodeEnv;
    }
    config.email.from = savedEmailConfig.from;
    config.email.resendApiKey = savedEmailConfig.resendApiKey;
    config.email.smtp.host = savedEmailConfig.smtpHost;
    config.email.smtp.port = savedEmailConfig.smtpPort;
    config.email.smtp.user = savedEmailConfig.smtpUser;
    config.email.smtp.pass = savedEmailConfig.smtpPass;
    global.fetch = savedFetch;
    licenseGenerator.resetSupabaseClientForTests();
    licenseGenerator.clearInMemoryLicenses();
    emailService.clearSentEmails();
  }

  console.log('======================================================');
  console.log(`🧩 STEP 97 Download & Email Fail-Closed Results: ${passed} / ${total} passed`);
  console.log('======================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runStep97Tests().catch((err) => {
  console.error('Unhandled failure:', err);
  process.exit(1);
});
