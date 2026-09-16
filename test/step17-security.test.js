'use strict';

/**
 * STEP 17 — Security Regression Tests
 *
 * Tests:
 *  A. Video IPC path validation (all 7 handlers)
 *  B. Production mock-license lock
 *  C. Electron navigation security guards (source verification)
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const srcMain = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'index.js'), 'utf8');
const srcPreload = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload', 'index.js'), 'utf8');
const supabaseClient = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'license', 'supabaseClient.js'), 'utf8');

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

async function runTests() {
  console.log('');
  console.log('======================================================');
  console.log('🛡️  STEP 17 Security Regression Tests');
  console.log('======================================================');
  console.log('');

  // ─── A. Video IPC Path Validation ─────────────────────────────────────────

  console.log('─── A. Video IPC Path Validation ───');

  await test('A1. validateVideoInputPath function exists in index.js', () => {
    assert.ok(srcMain.includes('function validateVideoInputPath'), 'validateVideoInputPath must exist');
  });

  await test('A2. validateVideoOutputPath function exists in index.js', () => {
    assert.ok(srcMain.includes('function validateVideoOutputPath'), 'validateVideoOutputPath must exist');
  });

  await test('A3. video:probe validates input path', () => {
    const handler = srcMain.match(/ipcMain\.handle\('video:probe'[^}]+\}/);
    assert.ok(handler, 'video:probe handler must exist');
    assert.ok(handler[0].includes('validateVideoInputPath'), 'video:probe must call validateVideoInputPath');
  });

  await test('A4. video:cut validates input and output paths', () => {
    const handler = srcMain.match(/ipcMain\.handle\('video:cut'[^}]+\{[\s\S]*?markJobStarted/);
    assert.ok(handler, 'video:cut handler must exist');
    assert.ok(handler[0].includes('validateVideoInputPath'), 'video:cut must validate input path');
    assert.ok(handler[0].includes('validateVideoOutputPath'), 'video:cut must validate output path');
  });

  await test('A5. video:reel validates input and output paths', () => {
    const handler = srcMain.match(/ipcMain\.handle\('video:reel'[^}]+\{[\s\S]*?markJobStarted/);
    assert.ok(handler, 'video:reel handler must exist');
    assert.ok(handler[0].includes('validateVideoInputPath'), 'video:reel must validate input path');
    assert.ok(handler[0].includes('validateVideoOutputPath'), 'video:reel must validate output path');
  });

  await test('A6. video:split validates input and output paths', () => {
    const handler = srcMain.match(/ipcMain\.handle\('video:split'[^}]+\{[\s\S]*?markJobStarted/);
    assert.ok(handler, 'video:split handler must exist');
    assert.ok(handler[0].includes('validateVideoInputPath'), 'video:split must validate input path');
    assert.ok(handler[0].includes('validateVideoOutputPath'), 'video:split must validate output path');
  });

  await test('A7. video:variation validates input and output paths', () => {
    const handler = srcMain.match(/ipcMain\.handle\('video:variation'[^}]+\{[\s\S]*?markJobStarted/);
    assert.ok(handler, 'video:variation handler must exist');
    assert.ok(handler[0].includes('validateVideoInputPath'), 'video:variation must validate input path');
    assert.ok(handler[0].includes('validateVideoOutputPath'), 'video:variation must validate output path');
  });

  await test('A8. video:generateThumbnail validates input and output paths', () => {
    const thumbSection = srcMain.substring(
      srcMain.indexOf("ipcMain.handle('video:generateThumbnail'"),
      srcMain.indexOf("ipcMain.handle('video:aiThumbnails'")
    );
    assert.ok(thumbSection.includes('validateVideoInputPath'), 'video:generateThumbnail must validate input path');
    assert.ok(thumbSection.includes('validateVideoOutputPath'), 'video:generateThumbnail must validate output path');
  });

  await test('A9. video:smartCrop validates input and output paths', () => {
    const handler = srcMain.match(/ipcMain\.handle\('video:smartCrop'[^}]+\{[\s\S]*?markJobStarted/);
    assert.ok(handler, 'video:smartCrop handler must exist');
    assert.ok(handler[0].includes('validateVideoInputPath'), 'video:smartCrop must validate input path');
    assert.ok(handler[0].includes('validateVideoOutputPath'), 'video:smartCrop must validate output path');
  });

  await test('A10. validateVideoInputPath rejects traversal (..)', () => {
    assert.ok(srcMain.includes("if (filePath.includes('..')) return null"), 'safePath must reject traversal');
  });

  await test('A11. validateVideoInputPath checks file existence', () => {
    assert.ok(srcMain.includes('fs.statSync(safe)'), 'validateVideoInputPath must stat the file');
    assert.ok(srcMain.includes('stat.isFile()'), 'validateVideoInputPath must verify it is a file');
  });

  await test('A12. validateVideoInputPath checks media extension', () => {
    assert.ok(srcMain.includes('isAllowedMediaExtension(safe)'), 'validateVideoInputPath must check extension');
  });

  await test('A13. video:cut uses validated paths for cutClip', () => {
    const reelSection = srcMain.substring(
      srcMain.indexOf("ipcMain.handle('video:cut'"),
      srcMain.indexOf("ipcMain.handle('video:reel'")
    );
    assert.ok(reelSection.includes('inputCheck.path'), 'video:cut must pass inputCheck.path to cutClip');
    assert.ok(reelSection.includes('outputCheck.path'), 'video:cut must pass outputCheck.path to cutClip');
  });

  await test('A14. video:reel uses validated paths for cutClip', () => {
    const splitSection = srcMain.substring(
      srcMain.indexOf("ipcMain.handle('video:reel'"),
      srcMain.indexOf("ipcMain.handle('video:split'")
    );
    assert.ok(splitSection.includes('inputCheck.path'), 'video:reel must pass inputCheck.path to cutClip');
    assert.ok(splitSection.includes('outputCheck.path'), 'video:reel must pass outputCheck.path to cutClip');
  });

  await test('A15. video:split uses validated paths for splitIntoReels', () => {
    const variationSection = srcMain.substring(
      srcMain.indexOf("ipcMain.handle('video:split'"),
      srcMain.indexOf("ipcMain.handle('video:variation'")
    );
    assert.ok(variationSection.includes('inputCheck.path'), 'video:split must pass inputCheck.path to splitIntoReels');
    assert.ok(variationSection.includes('outputCheck.path'), 'video:split must pass outputCheck.path to splitIntoReels');
  });

  await test('A16. video:variation uses validated paths for runVariationPipeline', () => {
    const thumbSection = srcMain.substring(
      srcMain.indexOf("ipcMain.handle('video:variation'"),
      srcMain.indexOf("ipcMain.handle('video:readImageBase64'")
    );
    assert.ok(thumbSection.includes('inputCheck.path'), 'video:variation must pass inputCheck.path');
    assert.ok(thumbSection.includes('outputCheck.path'), 'video:variation must pass outputCheck.path');
  });

  await test('A17. video:smartCrop uses validated paths for cutClip', () => {
    const batchSection = srcMain.substring(
      srcMain.indexOf("ipcMain.handle('video:smartCrop'"),
      srcMain.indexOf("ipcMain.handle('video:batchQueue'")
    );
    assert.ok(batchSection.includes('inputCheck.path'), 'video:smartCrop must pass inputCheck.path');
    assert.ok(batchSection.includes('outputCheck.path'), 'video:smartCrop must pass outputCheck.path');
  });

  await test('A18. video:generateThumbnail uses validated paths', () => {
    const thumbHandler = srcMain.substring(
      srcMain.indexOf("ipcMain.handle('video:generateThumbnail'"),
      srcMain.indexOf("ipcMain.handle('video:aiThumbnails'")
    );
    assert.ok(thumbHandler.includes('inputCheck.path'), 'video:generateThumbnail must pass inputCheck.path');
    assert.ok(thumbHandler.includes('outputCheck.path'), 'video:generateThumbnail must pass outputCheck.path');
  });

  console.log('');

  // ─── B. Production Mock-License Lock ──────────────────────────────────────

  console.log('─── B. Production Mock-License Lock ───');

  await test('B1. getEffectiveTier function exists in index.js', () => {
    assert.ok(srcMain.includes('function getEffectiveTier'), 'getEffectiveTier must exist');
  });

  await test('B2. getEffectiveTier gates with app.isPackaged', () => {
    assert.ok(srcMain.includes('if (app.isPackaged) return null'), 'getEffectiveTier must return null when packaged');
  });

  await test('B3. checkExportHistoryAccess uses getEffectiveTier', () => {
    const section = srcMain.substring(
      srcMain.indexOf('async function checkExportHistoryAccess'),
      srcMain.indexOf('async function checkExportHistoryAccess') + 300
    );
    assert.ok(section.includes('getEffectiveTier(license)'), 'checkExportHistoryAccess must use getEffectiveTier');
    assert.ok(!section.includes('REEL_CUTTER_TEST_PRO'), 'checkExportHistoryAccess must not have raw REEL_CUTTER_TEST_PRO');
  });

  await test('B4. checkDashboardAccess uses getEffectiveTier', () => {
    const section = srcMain.substring(
      srcMain.indexOf('async function checkDashboardAccess'),
      srcMain.indexOf('async function checkDashboardAccess') + 300
    );
    assert.ok(section.includes('getEffectiveTier(license)'), 'checkDashboardAccess must use getEffectiveTier');
    assert.ok(!section.includes('REEL_CUTTER_TEST_PRO'), 'checkDashboardAccess must not have raw REEL_CUTTER_TEST_PRO');
  });

  await test('B5. checkCommandCenterAccess uses getEffectiveTier', () => {
    const section = srcMain.substring(
      srcMain.indexOf('async function checkCommandCenterAccess'),
      srcMain.indexOf('async function checkCommandCenterAccess') + 300
    );
    assert.ok(section.includes('getEffectiveTier(license)'), 'checkCommandCenterAccess must use getEffectiveTier');
    assert.ok(!section.includes('REEL_CUTTER_TEST_PRO'), 'checkCommandCenterAccess must not have raw REEL_CUTTER_TEST_PRO');
  });

  await test('B6. checkAiCaptionProAccess uses getEffectiveTier', () => {
    const section = srcMain.substring(
      srcMain.indexOf('async function checkAiCaptionProAccess'),
      srcMain.indexOf('async function checkAiCaptionProAccess') + 300
    );
    assert.ok(section.includes('getEffectiveTier(license)'), 'checkAiCaptionProAccess must use getEffectiveTier');
    assert.ok(!section.includes('REEL_CUTTER_TEST_PRO'), 'checkAiCaptionProAccess must not have raw REEL_CUTTER_TEST_PRO');
  });

  await test('B7. checkCaptionQualityProAccess uses getEffectiveTier', () => {
    const section = srcMain.substring(
      srcMain.indexOf('async function checkCaptionQualityProAccess'),
      srcMain.indexOf('async function checkCaptionQualityProAccess') + 300
    );
    assert.ok(section.includes('getEffectiveTier(license)'), 'checkCaptionQualityProAccess must use getEffectiveTier');
    assert.ok(!section.includes('REEL_CUTTER_TEST_PRO'), 'checkCaptionQualityProAccess must not have raw REEL_CUTTER_TEST_PRO');
  });

  await test('B8. checkVariationPresetsAccess uses getEffectiveTier', () => {
    const section = srcMain.substring(
      srcMain.indexOf('async function checkVariationPresetsAccess'),
      srcMain.indexOf('async function checkVariationPresetsAccess') + 300
    );
    assert.ok(section.includes('getEffectiveTier(license)'), 'checkVariationPresetsAccess must use getEffectiveTier');
    assert.ok(!section.includes('REEL_CUTTER_TEST_PRO'), 'checkVariationPresetsAccess must not have raw REEL_CUTTER_TEST_PRO');
  });

  await test('B9. checkExportPresetsAccess uses getEffectiveTier', () => {
    const section = srcMain.substring(
      srcMain.indexOf('async function checkExportPresetsAccess'),
      srcMain.indexOf('async function checkExportPresetsAccess') + 300
    );
    assert.ok(section.includes('getEffectiveTier(license)'), 'checkExportPresetsAccess must use getEffectiveTier');
    assert.ok(!section.includes('REEL_CUTTER_TEST_PRO'), 'checkExportPresetsAccess must not have raw REEL_CUTTER_TEST_PRO');
  });

  await test('B10. checkWorkflowRecipeAccess uses getEffectiveTier', () => {
    const section = srcMain.substring(
      srcMain.indexOf('async function checkWorkflowRecipeAccess'),
      srcMain.indexOf('async function checkWorkflowRecipeAccess') + 300
    );
    assert.ok(section.includes('getEffectiveTier(license)'), 'checkWorkflowRecipeAccess must use getEffectiveTier');
    assert.ok(!section.includes('REEL_CUTTER_TEST_PRO'), 'checkWorkflowRecipeAccess must not have raw REEL_CUTTER_TEST_PRO');
  });

  await test('B11. checkRecipeAutomationAccess uses getEffectiveTier', () => {
    const section = srcMain.substring(
      srcMain.indexOf('async function checkRecipeAutomationAccess'),
      srcMain.indexOf('async function checkRecipeAutomationAccess') + 300
    );
    assert.ok(section.includes('getEffectiveTier(license)'), 'checkRecipeAutomationAccess must use getEffectiveTier');
    assert.ok(!section.includes('REEL_CUTTER_TEST_PRO'), 'checkRecipeAutomationAccess must not have raw REEL_CUTTER_TEST_PRO');
  });

  await test('B12. REEL_CUTTER_TEST_PRO only exists in getEffectiveTier (centralized)', () => {
    const matches = srcMain.match(/REEL_CUTTER_TEST_PRO/g);
    assert.ok(matches, 'REEL_CUTTER_TEST_PRO must exist somewhere');
    assert.strictEqual(matches.length, 1, 'REEL_CUTTER_TEST_PRO must appear exactly once (in getEffectiveTier)');
  });

  await test('B13. supabaseClient detects packaged mode', () => {
    assert.ok(supabaseClient.includes('isPackaged'), 'supabaseClient must detect packaged mode');
    assert.ok(supabaseClient.includes('app.isPackaged'), 'supabaseClient must use app.isPackaged');
  });

  await test('B14. supabaseClient fetchLicense fails closed in packaged builds', () => {
    const fetchSection = supabaseClient.substring(
      supabaseClient.indexOf('async function fetchLicense'),
      supabaseClient.indexOf('async function bindLicenseHwid')
    );
    assert.ok(fetchSection.includes('if (isPackaged)'), 'fetchLicense must check isPackaged');
    assert.ok(fetchSection.includes('License verification requires internet'), 'fetchLicense must show appropriate error');
  });

  await test('B15. supabaseClient bindLicenseHwid fails closed in packaged builds', () => {
    const bindSection = supabaseClient.substring(
      supabaseClient.indexOf('async function bindLicenseHwid'),
      supabaseClient.indexOf('module.exports')
    );
    assert.ok(bindSection.includes('if (isPackaged)'), 'bindLicenseHwid must check isPackaged');
    assert.ok(bindSection.includes('License activation requires internet'), 'bindLicenseHwid must show appropriate error');
  });

  await test('B16. supabaseClient mock keys still exist for dev/test', () => {
    assert.ok(supabaseClient.includes('PRO-REEL-7890-ABCD-1234'), 'Mock key PRO must exist');
    assert.ok(supabaseClient.includes('STD-REEL-4567-EFGH-5678'), 'Mock key STD must exist');
    assert.ok(supabaseClient.includes('BAS-REEL-1234-IJKL-9012'), 'Mock key BAS must exist');
  });

  console.log('');

  // ─── C. Electron Navigation Security Guards ───────────────────────────────

  console.log('─── C. Electron Navigation Security Guards ───');

  await test('C1. will-navigate handler exists in index.js', () => {
    assert.ok(srcMain.includes("'will-navigate'"), 'will-navigate handler must exist');
  });

  await test('C2. will-navigate prevents navigation', () => {
    assert.ok(srcMain.includes('event.preventDefault()'), 'will-navigate must call event.preventDefault()');
  });

  await test('C3. setWindowOpenHandler exists in index.js', () => {
    assert.ok(srcMain.includes('setWindowOpenHandler'), 'setWindowOpenHandler must exist');
  });

  await test('C4. setWindowOpenHandler denies new windows', () => {
    assert.ok(srcMain.includes("action: 'deny'"), 'setWindowOpenHandler must deny new windows');
  });

  await test('C5. No shell.openExternal in source code', () => {
    assert.ok(!srcMain.includes('shell.openExternal'), 'shell.openExternal must not be used');
  });

  await test('C6. No window.open in preload', () => {
    assert.ok(!srcPreload.includes('window.open'), 'preload must not expose window.open');
  });

  await test('C7. No eval or Function constructor in preload', () => {
    assert.ok(!srcPreload.includes('eval('), 'preload must not use eval');
    assert.ok(!srcPreload.includes('new Function'), 'preload must not use Function constructor');
  });

  await test('C8. contextIsolation is enabled', () => {
    assert.ok(srcMain.includes('contextIsolation: true'), 'contextIsolation must be true');
  });

  await test('C9. nodeIntegration is disabled', () => {
    assert.ok(srcMain.includes('nodeIntegration: false'), 'nodeIntegration must be false');
  });

  await test('C10. No webview tags in renderer', () => {
    const rendererFiles = fs.readdirSync(path.join(__dirname, '..', 'src', 'renderer', 'src', 'components'));
    for (const file of rendererFiles) {
      if (file.endsWith('.jsx') || file.endsWith('.js')) {
        const content = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'src', 'components', file), 'utf8');
        assert.ok(!content.includes('<webview'), `${file} must not contain webview tags`);
      }
    }
  });

  // ─── Summary ──────────────────────────────────────────────────────────────

  console.log('');
  console.log('======================================================');
  console.log(`🛡️  STEP 17 Security Test Results: ${passed} / ${passed + failed} passed`);
  console.log('======================================================');
  console.log('');

  if (failures.length > 0) {
    console.log('Failed tests:');
    failures.forEach((f) => console.log(`  ✗ ${f.name}: ${f.error}`));
    console.log('');
  }

  return failed === 0;
}

runTests().then((success) => {
  process.exit(success ? 0 : 1);
}).catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
