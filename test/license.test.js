const path = require('path');
const fs = require('fs');
const assert = require('assert');

// Modules under test
const { getHardwareId, getHardwareIdSync, formatShortHwid } = require('../src/main/license/hwid');
const { saveLicenseData, loadLicenseData, clearLicenseData, hasLicenseData } = require('../src/main/license/store');
const { fetchLicense, bindLicenseHwid, resetMockDb, setSimulateOffline } = require('../src/main/license/supabaseClient');
const {
  validateStartup,
  activateLicense,
  deactivateLicense,
  getLicenseInfo,
  maskLicenseKey,
  MAX_OFFLINE_GRACE_PERIOD_HOURS,
} = require('../src/main/license/licenseManager');

const TEST_DIR = path.join(__dirname, '../.test-license-store');

function cleanup() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🧪 Starting Phase 3 Licensing & HWID Test Suite');
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

  // Ensure clean state
  cleanup();
  resetMockDb();

  // ─── Test 1: First launch without license ────────────────────────────────
  await test('1. First launch without license: Application remains locked', async () => {
    cleanup();
    const result = await validateStartup(TEST_DIR);
    assert.strictEqual(result.isValid, false, 'Should not be valid on first launch');
    assert.strictEqual(result.reason, 'NO_LICENSE', 'Reason should be NO_LICENSE');
  });

  // ─── Test 2: Invalid license key rejection ──────────────────────────────
  await test('2. Invalid license: Rejects non-existent license key', async () => {
    cleanup();
    const result = await activateLicense('INVALID-KEY-NOT-EXIST', TEST_DIR);
    assert.strictEqual(result.success, false, 'Invalid key should fail');
    assert(result.error.toLowerCase().includes('invalid'), 'Error should mention invalid license');
    assert.strictEqual(hasLicenseData(TEST_DIR), false, 'Should not save bad license locally');
  });

  // ─── Test 3: Revoked license rejection ──────────────────────────────────
  await test('3. Revoked license: Rejects activation for revoked key', async () => {
    cleanup();
    const result = await activateLicense('PRO-REEL-REVOKED-9999', TEST_DIR);
    assert.strictEqual(result.success, false, 'Revoked key should fail');
    assert(result.error.toLowerCase().includes('revoked'), 'Error should mention revoked');
    assert.strictEqual(hasLicenseData(TEST_DIR), false, 'Should not save revoked license');
  });

  // ─── Test 4: Same license on second computer/HWID rejection ─────────────
  await test('4. Same license on second computer: Rejects key already bound to another HWID', async () => {
    cleanup();
    const result = await activateLicense('PRO-BOUND-ANOTHER-HWID', TEST_DIR);
    assert.strictEqual(result.success, false, 'Should reject multi-device activation');
    assert(result.error.toLowerCase().includes('already bound') || result.error.toLowerCase().includes('another machine'), 'Should mention bound to another machine');
  });

  // ─── Test 5: Valid license activation & HWID binding ────────────────────
  await test('5. Valid license activation: Binds to current HWID and encrypts locally', async () => {
    cleanup();
    const currentHwid = await getHardwareId();
    assert(currentHwid && currentHwid.length > 0, 'HWID must be generated');

    const result = await activateLicense('PRO-REEL-7890-ABCD-1234', TEST_DIR);
    assert.strictEqual(result.success, true, 'Valid activation must succeed');
    assert.strictEqual(result.tier, 'pro', 'Tier must be pro');
    assert.strictEqual(result.status, 'active', 'Status must be active');
    assert.strictEqual(result.maskedKey, '••••-••••-••••-1234', 'Key should be masked');

    // Verify local encrypted storage exists and can be decrypted
    assert.strictEqual(hasLicenseData(TEST_DIR), true, 'License file must exist locally');
    const stored = loadLicenseData(TEST_DIR);
    assert.strictEqual(stored.licenseKey, 'PRO-REEL-7890-ABCD-1234');
    assert.strictEqual(stored.hwid, currentHwid);
    assert.strictEqual(stored.tier, 'pro');
  });

  // ─── Test 6: Restart after successful activation ────────────────────────
  await test('6. Restart after successful activation: Auto-validates and unlocks', async () => {
    // Note: TEST_DIR still has the valid license from Test 5
    const result = await validateStartup(TEST_DIR);
    assert.strictEqual(result.isValid, true, 'Should be valid on restart');
    assert.strictEqual(result.tier, 'pro');
    assert.strictEqual(result.isOffline, false);
    assert.strictEqual(result.maskedKey, '••••-••••-••••-1234');
  });

  // ─── Test 7: Internet disconnected during startup (Grace period < 72h) ──
  await test('7. Internet disconnected during startup: Offline grace period allows access (< 72h)', async () => {
    setSimulateOffline(true);
    const result = await validateStartup(TEST_DIR);
    setSimulateOffline(false);

    assert.strictEqual(result.isValid, true, 'Should remain valid in offline grace period');
    assert.strictEqual(result.isOffline, true, 'Should flag isOffline = true');
    assert(result.gracePeriodRemainingHours >= 71, 'Should have ~72 hours remaining');
  });

  // ─── Test 8: Offline grace period expired (> 72 hours) ───────────────────
  await test('8. Offline grace period expired: Blocks application after 72 hours offline', async () => {
    // Manually manipulate lastValidatedAt to 80 hours in the past
    const stored = loadLicenseData(TEST_DIR);
    const eightyHoursAgo = new Date(Date.now() - 80 * 60 * 60 * 1000).toISOString();
    stored.lastValidatedAt = eightyHoursAgo;
    saveLicenseData(stored, TEST_DIR);

    setSimulateOffline(true);
    const result = await validateStartup(TEST_DIR);
    setSimulateOffline(false);

    assert.strictEqual(result.isValid, false, 'Must block after 72h offline');
    assert.strictEqual(result.reason, 'GRACE_PERIOD_EXPIRED', 'Reason must be GRACE_PERIOD_EXPIRED');
    assert(result.error.toLowerCase().includes('expired'), 'Error message should indicate grace period expired');
  });

  // ─── Test 9: Supabase unavailable during initial activation ─────────────
  await test('9. Supabase unavailable: Rejects initial activation when offline', async () => {
    cleanup();
    setSimulateOffline(true);
    const result = await activateLicense('STD-REEL-4567-EFGH-5678', TEST_DIR);
    setSimulateOffline(false);

    assert.strictEqual(result.success, false, 'Cannot activate without internet connection');
    assert(result.error.toLowerCase().includes('internet'), 'Must indicate internet required');
  });

  // ─── Test 10: Security audit (Preload & Renderer isolation) ──────────────
  await test('10. Security audit: Verify no database secrets or node-machine-id leaked to renderer', () => {
    const preloadSource = fs.readFileSync(path.join(__dirname, '../src/preload/index.js'), 'utf8');

    // Ensure secrets are never referenced in preload
    assert(!preloadSource.includes('SUPABASE_SERVICE_ROLE_KEY'), 'Service role key must not be in preload');
    assert(!preloadSource.includes('supabaseClient'), 'Supabase client must not be in preload');
    assert(!preloadSource.includes('node-machine-id'), 'node-machine-id must not be imported in preload');

    // Ensure only safe channels are exposed
    assert(preloadSource.includes('checkLicense'), 'checkLicense IPC method exposed');
    assert(preloadSource.includes('activateLicense'), 'activateLicense IPC method exposed');
    assert(preloadSource.includes('getLicenseInfo'), 'getLicenseInfo IPC method exposed');
  });

  // Clean up test directory
  cleanup();
  resetMockDb();

  console.log('\n======================================================');
  console.log(`📊 Test Results: ${passed} / ${total} passed`);
  console.log('======================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled test suite failure:', err);
  process.exit(1);
});
