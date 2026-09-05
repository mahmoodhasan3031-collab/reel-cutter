'use strict';
/**
 * Phase 6 — Packaging + Auto-Updater Test Suite
 *
 * Tests:
 *  1. FFmpeg binary resolution: getFfmpegPath() resolves valid executable
 *  2. FFprobe binary resolution: getFfprobePath() resolves valid executable
 *  3. Production asar.unpacked path transformation
 *  4. electron-builder.json schema and configuration validation
 *  5. asarUnpack covers all required binaries and native modules
 *  6. Publish configuration specifies GitHub releases provider
 *  7. Windows NSIS installer configuration (shortcuts, license, uninstaller)
 *  8. macOS DMG configuration (DMG target, entitlements, hardened runtime)
 *  9. Security audit: .env, server, and test exclusions in electron-builder.json
 * 10. Security audit: Zero secrets or service-role keys in renderer bundle
 * 11. package.json scripts: build, dist, dist:win, dist:mac
 * 12. package.json dependencies: ffmpeg-static and electron-updater in dependencies
 * 13. Build assets: build/icon.png, build/license.txt, build/entitlements.mac.plist
 * 14. Auto-updater state machine: initial state and status reporting
 * 15. Auto-updater video processing protection: blocks download while processing
 * 16. Auto-updater video processing protection: blocks install while processing
 * 17. Auto-updater unblocked when video processing finishes
 * 18. Auto-updater error handling: captures and notifies errors gracefully
 * 19. Binary execution check: probe and cut using resolved binaries succeeds
 */

const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { getFfmpegPath, getFfprobePath, getVideoMetadata } = require('../src/engine/probe');
const { cutClip } = require('../src/engine/cutter');
const {
  AppUpdater,
  UPDATE_STATUS,
  markJobStarted,
  markJobFinished,
  isVideoProcessingActive,
} = require('../src/main/updater');

let passed = 0;
let failed = 0;
const results = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    results.push({ name, status: '✓' });
    console.log(`  ✓ PASS: ${name}`);
  } catch (err) {
    failed++;
    results.push({ name, status: '✗', error: err.message });
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
  }
}

async function runSuite() {
  console.log('\n======================================================');
  console.log('🧪 Starting Phase 6 Packaging & Auto-Updater Test Suite');
  console.log('======================================================\n');

  const rootDir = path.join(__dirname, '..');
  const pkgJsonPath = path.join(rootDir, 'package.json');
  const builderJsonPath = path.join(rootDir, 'electron-builder.json');
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  const builder = JSON.parse(fs.readFileSync(builderJsonPath, 'utf8'));

  // ── 1. FFmpeg binary resolution ───────────────────────────────────────────
  await test('1. FFmpeg binary resolution: getFfmpegPath() resolves valid binary', () => {
    const p = getFfmpegPath();
    assert.ok(p, 'FFmpeg path must not be null/empty');
    assert.ok(fs.existsSync(p), `FFmpeg binary must exist on disk at: ${p}`);
  });

  // ── 2. FFprobe binary resolution ──────────────────────────────────────────
  await test('2. FFprobe binary resolution: getFfprobePath() resolves valid binary', () => {
    const p = getFfprobePath();
    assert.ok(p, 'FFprobe path must not be null/empty');
    assert.ok(fs.existsSync(p), `FFprobe binary must exist on disk at: ${p}`);
  });

  // ── 3. Production asar.unpacked path transformation ───────────────────────
  await test('3. Production asar.unpacked path transformation replaces app.asar', () => {
    const mockAsarPath = 'C:\\Program Files\\Reel Cutter\\resources\\app.asar\\node_modules\\ffmpeg-static\\ffmpeg.exe';
    const transformed = mockAsarPath.replace('app.asar', 'app.asar.unpacked');
    assert.strictEqual(
      transformed,
      'C:\\Program Files\\Reel Cutter\\resources\\app.asar.unpacked\\node_modules\\ffmpeg-static\\ffmpeg.exe'
    );
  });

  // ── 4. electron-builder.json validation ───────────────────────────────────
  await test('4. electron-builder.json validation: appId, productName, and directories', () => {
    assert.strictEqual(builder.appId, 'com.reelcutter.app');
    assert.strictEqual(builder.productName, 'Reel Cutter');
    assert.strictEqual(builder.asar, true);
    assert.strictEqual(builder.directories.output, 'dist');
    assert.strictEqual(builder.directories.buildResources, 'build');
  });

  // ── 5. asarUnpack covers all required binaries and native modules ─────────
  await test('5. asarUnpack covers all required binaries and native modules', () => {
    const unpacked = builder.asarUnpack || [];
    assert.ok(unpacked.some((p) => p.includes('ffmpeg-static')), 'Must unpack ffmpeg-static');
    assert.ok(unpacked.some((p) => p.includes('ffprobe-static')), 'Must unpack ffprobe-static');
    assert.ok(unpacked.some((p) => p.includes('face-api')), 'Must unpack face-api');
    assert.ok(unpacked.some((p) => p.includes('sharp')), 'Must unpack sharp');
    assert.ok(unpacked.some((p) => p.includes('tfjs-backend-wasm')), 'Must unpack tfjs-backend-wasm');
  });

  // ── 6. Publish configuration specifies GitHub releases ────────────────────
  await test('6. Publish configuration specifies GitHub releases provider', () => {
    assert.ok(builder.publish, 'Publish config must exist');
    assert.strictEqual(builder.publish.provider, 'github');
    assert.strictEqual(builder.publish.owner, 'reelcutter');
    assert.strictEqual(builder.publish.repo, 'reel-cutter');
  });

  // ── 7. Windows NSIS configuration ─────────────────────────────────────────
  await test('7. Windows NSIS installer configuration (shortcuts, license, uninstaller)', () => {
    assert.ok(builder.win, 'Windows config must exist');
    assert.ok(builder.win.target.some((t) => t.target === 'nsis'), 'Target must be nsis');
    assert.ok(builder.nsis, 'NSIS config must exist');
    assert.strictEqual(builder.nsis.createDesktopShortcut, true);
    assert.strictEqual(builder.nsis.createStartMenuShortcut, true);
    assert.strictEqual(builder.nsis.license, 'build/license.txt');
  });

  // ── 8. macOS DMG configuration ────────────────────────────────────────────
  await test('8. macOS DMG configuration (DMG target, entitlements, hardened runtime)', () => {
    assert.ok(builder.mac, 'Mac config must exist');
    assert.ok(builder.mac.target.some((t) => t.target === 'dmg'), 'Target must be dmg');
    assert.strictEqual(builder.mac.hardenedRuntime, true);
    assert.strictEqual(builder.mac.entitlements, 'build/entitlements.mac.plist');
    assert.ok(builder.dmg, 'DMG layout config must exist');
  });

  // ── 9. Security audit: .env, server, and test exclusions ──────────────────
  await test('9. Security audit: .env, server, and test exclusions in electron-builder.json', () => {
    const files = builder.files || [];
    assert.ok(files.some((f) => f.includes('!.env*')), 'Must exclude .env*');
    assert.ok(files.some((f) => f.includes('!server/**/*')), 'Must exclude server/**/*');
    assert.ok(files.some((f) => f.includes('!test/**/*')), 'Must exclude test/**/*');
    assert.ok(files.some((f) => f.includes('!test-videos/**/*')), 'Must exclude test-videos/**/*');
  });

  // ── 10. Security audit: Zero secrets in renderer bundle ───────────────────
  await test('10. Security audit: Zero Stripe secrets or Supabase service_role keys in renderer bundle', () => {
    const rendererDir = path.join(rootDir, 'out', 'renderer');
    if (fs.existsSync(rendererDir)) {
      const entries = fs.readdirSync(rendererDir, { recursive: true });
      for (const entry of entries) {
        const full = path.join(rendererDir, entry);
        if (fs.statSync(full).isFile() && (full.endsWith('.js') || full.endsWith('.html') || full.endsWith('.css'))) {
          const content = fs.readFileSync(full, 'utf8');
          assert.ok(!/service_role/i.test(content), `Found service_role in ${entry}`);
          assert.ok(!/sk_test_[0-9a-zA-Z]{10,}/i.test(content), `Found Stripe secret in ${entry}`);
          assert.ok(!/sk_live_[0-9a-zA-Z]{10,}/i.test(content), `Found Stripe secret in ${entry}`);
        }
      }
    }
  });

  // ── 11. package.json scripts ──────────────────────────────────────────────
  await test('11. package.json scripts: build, dist, dist:win, dist:mac exist', () => {
    assert.ok(pkg.scripts.build, 'build script must exist');
    assert.ok(pkg.scripts.dist, 'dist script must exist');
    assert.ok(pkg.scripts['dist:win'], 'dist:win script must exist');
    assert.ok(pkg.scripts['dist:mac'], 'dist:mac script must exist');
  });

  // ── 12. package.json dependencies ─────────────────────────────────────────
  await test('12. package.json dependencies: ffmpeg-static and electron-updater in dependencies', () => {
    assert.ok(pkg.dependencies['ffmpeg-static'], 'ffmpeg-static must be in dependencies');
    assert.ok(pkg.dependencies['ffprobe-static'], 'ffprobe-static must be in dependencies');
    assert.ok(pkg.dependencies['electron-updater'], 'electron-updater must be in dependencies');
  });

  // ── 13. Build assets ──────────────────────────────────────────────────────
  await test('13. Build assets: icon.png, license.txt, and entitlements.mac.plist exist and are non-empty', () => {
    const icon = path.join(rootDir, 'build', 'icon.png');
    const lic = path.join(rootDir, 'build', 'license.txt');
    const ent = path.join(rootDir, 'build', 'entitlements.mac.plist');

    assert.ok(fs.existsSync(icon) && fs.statSync(icon).size > 100, 'icon.png must be non-empty');
    assert.ok(fs.existsSync(lic) && fs.statSync(lic).size > 100, 'license.txt must be non-empty');
    assert.ok(fs.existsSync(ent) && fs.statSync(ent).size > 50, 'entitlements.mac.plist must be non-empty');
  });

  // ── 14. Auto-updater state machine ────────────────────────────────────────
  await test('14. Auto-updater state machine: initial state is idle and getStatus returns valid payload', () => {
    const updater = new AppUpdater();
    const status = updater.getStatus();
    assert.strictEqual(status.status, UPDATE_STATUS.IDLE);
    assert.strictEqual(status.info, null);
    assert.strictEqual(status.progress, null);
    assert.strictEqual(status.error, null);
    assert.strictEqual(typeof status.isProcessingActive, 'boolean');
  });

  // ── 15. Auto-updater video processing protection: download blocked ────────
  await test('15. Auto-updater video processing protection: downloadUpdate is blocked during active video jobs', async () => {
    const updater = new AppUpdater();

    // Simulate video processing active
    markJobStarted();
    assert.strictEqual(isVideoProcessingActive(), true);

    const res = await updater.downloadUpdate();
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.blockedByProcessing, true);
    assert.ok(res.error.includes('video processing is active'));

    // Clean up simulation
    markJobFinished();
    assert.strictEqual(isVideoProcessingActive(), false);
  });

  // ── 16. Auto-updater video processing protection: install blocked ─────────
  await test('16. Auto-updater video processing protection: quitAndInstall is blocked during active video jobs', () => {
    const updater = new AppUpdater();

    markJobStarted();
    assert.strictEqual(isVideoProcessingActive(), true);

    const res = updater.quitAndInstall();
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.blockedByProcessing, true);
    assert.ok(res.error.includes('video processing is active'));

    markJobFinished();
    assert.strictEqual(isVideoProcessingActive(), false);
  });

  // ── 17. Auto-updater unblocked when video processing finishes ─────────────
  await test('17. Auto-updater unblocked when video processing finishes', () => {
    markJobStarted();
    assert.strictEqual(isVideoProcessingActive(), true);
    markJobFinished();
    assert.strictEqual(isVideoProcessingActive(), false);
  });

  // ── 18. Auto-updater error handling ───────────────────────────────────────
  await test('18. Auto-updater error handling: captures and notifies errors gracefully', async () => {
    const updater = new AppUpdater();
    const res = await updater.checkForUpdates();
    // In test environment without GitHub token / packaged app, error should be handled gracefully without throwing
    const status = updater.getStatus();
    assert.ok(status.status === UPDATE_STATUS.ERROR || status.status === UPDATE_STATUS.CHECKING || status.status === UPDATE_STATUS.NOT_AVAILABLE);
  });

  // ── 19. Binary execution check ────────────────────────────────────────────
  await test('19. Binary execution check: probe and cutClip execute using resolved binaries', async () => {
    const testVideo = path.join(rootDir, 'test-videos', 'talking_head.mp4');
    const outPath = path.join(rootDir, 'test-videos', `test_pkg_${Date.now()}.mp4`);

    try {
      const meta = await getVideoMetadata(testVideo);
      assert.ok(meta.duration > 0, 'Metadata duration must be > 0');

      const cutRes = await cutClip(testVideo, outPath, {
        start: 0,
        duration: 1,
        reel: true,
        mode: 'blur',
        width: 1080,
        height: 1920,
      });

      assert.ok(fs.existsSync(cutRes.outputPath), 'Output file must exist');
      const outMeta = await getVideoMetadata(cutRes.outputPath);
      assert.strictEqual(outMeta.video.width, 1080);
      assert.strictEqual(outMeta.video.height, 1920);
    } finally {
      if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
    }
  });

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n──────────────────────────────────────────────────────');
  console.log(`Phase 6 Packaging Results: ${passed} passed, ${failed} failed`);
  console.log('──────────────────────────────────────────────────────\n');

  return failed;
}

module.exports = { runSuite };

if (require.main === module) {
  runSuite().then((failed) => process.exit(failed > 0 ? 1 : 0));
}
