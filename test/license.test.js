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
  revalidateOnlineSilently,
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

  // ─── Test 11: Clock rollback protection in validateStartup ───────────────
  await test('11. Clock rollback: Rejects offline startup if system clock is moved behind lastValidatedAt', async () => {
    cleanup();
    resetMockDb();
    await activateLicense('PRO-REEL-7890-ABCD-1234', TEST_DIR);

    // Manipulate stored license so lastValidatedAt is in the future relative to simulated check
    const stored = loadLicenseData(TEST_DIR);
    const oneHourInFuture = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    stored.lastValidatedAt = oneHourInFuture;
    stored.lastSeenAt = oneHourInFuture;
    saveLicenseData(stored, TEST_DIR);

    setSimulateOffline(true);
    const result = await validateStartup(TEST_DIR);
    setSimulateOffline(false);

    assert.strictEqual(result.isValid, false, 'Should fail validation when clock rolled back');
    assert.strictEqual(result.reason, 'CLOCK_TAMPERED', 'Reason must be CLOCK_TAMPERED');
    assert(result.error.toLowerCase().includes('rollback') || result.error.toLowerCase().includes('clock'), 'Error must mention clock rollback');
  });

  // ─── Test 12: Monotonic lastSeenAt tracking ──────────────────────────────
  await test('12. Clock rollback: Rejects offline startup if clock is behind lastSeenAt even if within 72h', async () => {
    cleanup();
    resetMockDb();
    await activateLicense('PRO-REEL-7890-ABCD-1234', TEST_DIR);

    // Stored was validated 10h ago, but lastSeen was 30m in the future
    const stored = loadLicenseData(TEST_DIR);
    stored.lastValidatedAt = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString();
    stored.lastSeenAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    saveLicenseData(stored, TEST_DIR);

    setSimulateOffline(true);
    const result = await validateStartup(TEST_DIR);
    setSimulateOffline(false);

    assert.strictEqual(result.isValid, false, 'Should fail when now < lastSeenAt');
    assert.strictEqual(result.reason, 'CLOCK_TAMPERED');
  });

  // ─── Test 13: getLicenseInfo offline grace-period expiry enforcement ─────
  await test('13. IPC feature gating: getLicenseInfo returns isValid = false when grace period is expired (> 72h)', async () => {
    cleanup();
    resetMockDb();
    await activateLicense('PRO-REEL-7890-ABCD-1234', TEST_DIR);

    // Manipulate lastValidatedAt to 75 hours ago
    const stored = loadLicenseData(TEST_DIR);
    stored.lastValidatedAt = new Date(Date.now() - 75 * 60 * 60 * 1000).toISOString();
    stored.lastSeenAt = stored.lastValidatedAt;
    saveLicenseData(stored, TEST_DIR);

    const info = await getLicenseInfo(TEST_DIR);
    assert.strictEqual(info.isValid, false, 'getLicenseInfo must be invalid when grace period expired');
    assert.strictEqual(info.reason, 'GRACE_PERIOD_EXPIRED');
    assert.strictEqual(info.gracePeriodRemainingHours, 0);
    assert.deepStrictEqual(info.features, {}, 'Features must be empty when invalid');
  });

  // ─── Test 14: getLicenseInfo clock rollback enforcement ──────────────────
  await test('14. IPC feature gating: getLicenseInfo returns isValid = false when clock rollback detected', async () => {
    cleanup();
    resetMockDb();
    await activateLicense('PRO-REEL-7890-ABCD-1234', TEST_DIR);

    const stored = loadLicenseData(TEST_DIR);
    stored.lastSeenAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // 2h in future
    saveLicenseData(stored, TEST_DIR);

    const info = await getLicenseInfo(TEST_DIR);
    assert.strictEqual(info.isValid, false, 'getLicenseInfo must be invalid when clock rolled back');
    assert.strictEqual(info.reason, 'CLOCK_TAMPERED');
    assert.strictEqual(info.status, 'clock_tampered');
    assert.deepStrictEqual(info.features, {}, 'Features must be empty when invalid');
  });

  // ─── Test 15: Silent online revalidation ─────────────────────────────────
  await test('15. Silent revalidation: Revalidates online with Supabase and resets grace window', async () => {
    cleanup();
    resetMockDb();
    await activateLicense('PRO-REEL-7890-ABCD-1234', TEST_DIR);

    // Simulate was offline for 24h
    const stored = loadLicenseData(TEST_DIR);
    stored.lastValidatedAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    stored.lastSeenAt = stored.lastValidatedAt;
    saveLicenseData(stored, TEST_DIR);

    // Call silent revalidation while online
    const result = await revalidateOnlineSilently(TEST_DIR);
    assert.strictEqual(result.isValid, true);
    assert.strictEqual(result.isOffline, false);
    assert.strictEqual(result.gracePeriodRemainingHours, MAX_OFFLINE_GRACE_PERIOD_HOURS);

    // Verify stored timestamp was updated to recent timestamp
    const updated = loadLicenseData(TEST_DIR);
    const updatedDiff = Math.abs(Date.now() - new Date(updated.lastValidatedAt).getTime());
    assert(updatedDiff < 5000, 'lastValidatedAt must be updated to recent timestamp');
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
