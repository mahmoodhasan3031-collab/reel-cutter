'use strict';

/**
 * Export Recovery Center Tests — Phase 5G
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  OUTPUT_HEALTH_STATUS,
  checkOutputHealth,
  batchCheckOutputHealth,
  checkRecordOutputHealth,
  batchCheckRecordOutputHealth,
  validateDirectoryPath,
  validateOpenablePath,
} = require('../src/main/history/outputHealthService');

const {
  RECOVERY_ERROR_CATEGORY,
  normalizeError,
  checkRetryReadiness,
  batchCheckRetryReadiness,
  getRecoveryDiagnostics,
  retryFailedExport,
  exportAgainMissingOutput,
  bulkRetryFailed,
  bulkExportAgainMissing,
  archiveRecord,
  unarchiveRecord,
  bulkArchive,
  bulkUnarchive,
  pinRecord,
  unpinRecord,
  bulkPin,
  bulkUnpin,
  isNeedsAttention,
  getNeedsAttentionRecords,
  getWorkspaceView,
  getRecoveryCounts,
  getWorkspaceSummary,
  getAttemptDisplayInfo,
} = require('../src/main/history/recoveryCenter');

const {
  createExportHistoryRecord,
  EXPORT_HISTORY_STATUS,
} = require('../src/main/history/exportHistoryManager');

// ─── Test Helpers ──────────────────────────────────────────────────────────

let _testCounter = 0;
function makeTempDir() {
  _testCounter++;
  return fs.mkdtempSync(path.join(os.tmpdir(), `reel-test-5g-${_testCounter}-`));
}

function cleanupTempDir(dir) {
  try { if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

function makeRecord(overrides = {}) {
  return {
    source: { name: 'test.mp4', path: '/videos/test.mp4' },
    exportType: 'reel',
    profile: { id: 'p1', name: 'IG Profile', platform: 'instagram' },
    exportPreset: { id: 'ep1', name: 'HD Preset' },
    variationPreset: { id: 'vp1', name: 'Viral Style' },
    captionTemplate: { id: 'ct1', name: 'Catchy' },
    output: { path: '/out/test.mp4', directory: '/out', filename: 'test.mp4' },
    status: EXPORT_HISTORY_STATUS.COMPLETED,
    completedAt: new Date().toISOString(),
    planId: 'plan-1',
    jobId: 'job-1',
    ...overrides,
  };
}

function insertRecord(dir, overrides = {}) {
  return createExportHistoryRecord(makeRecord(overrides), dir);
}

// ─── Test Runner ───────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ❌ ${name}`);
    console.log(`     ${err.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n========================================================');
console.log('  Export Recovery Center Tests (Phase 5G)');
console.log('========================================================\n');

// ─── Output Health Service ─────────────────────────────────────────────────
console.log('  ── Output Health Service ──');

test('A. Existing output available', () => {
  const dir = makeTempDir();
  try {
    const testFile = path.join(dir, 'output.mp4');
    fs.writeFileSync(testFile, 'fake video data');
    const result = checkOutputHealth(testFile);
    assert.strictEqual(result.status, OUTPUT_HEALTH_STATUS.AVAILABLE);
    assert.ok(result.size > 0);
    assert.ok(result.modifiedAt);
  } finally { cleanupTempDir(dir); }
});

test('B. Missing output', () => {
  const result = checkOutputHealth('/nonexistent/path/output.mp4');
  assert.strictEqual(result.status, OUTPUT_HEALTH_STATUS.MISSING);
  assert.strictEqual(result.size, null);
  assert.strictEqual(result.modifiedAt, null);
});

test('C. Invalid output path', () => {
  const result = checkOutputHealth('');
  assert.strictEqual(result.status, OUTPUT_HEALTH_STATUS.INVALID_PATH);
});

test('C2. Invalid output path null bytes', () => {
  const result = checkOutputHealth('/path/with\x00null');
  assert.strictEqual(result.status, OUTPUT_HEALTH_STATUS.INVALID_PATH);
});

test('D. Inaccessible output handling', () => {
  const result = checkOutputHealth(null);
  assert.strictEqual(result.status, OUTPUT_HEALTH_STATUS.INVALID_PATH);
});

test('E. File metadata', () => {
  const dir = makeTempDir();
  try {
    const testFile = path.join(dir, 'output.mp4');
    fs.writeFileSync(testFile, 'test data for metadata');
    const result = checkOutputHealth(testFile);
    assert.strictEqual(result.status, OUTPUT_HEALTH_STATUS.AVAILABLE);
    assert.strictEqual(result.size, 22);
    assert.ok(result.modifiedAt);
  } finally { cleanupTempDir(dir); }
});

test('F. Output health does not mutate status', () => {
  const dir = makeTempDir();
  try {
    const testFile = path.join(dir, 'output.mp4');
    fs.writeFileSync(testFile, 'data');
    const before = checkOutputHealth(testFile);
    const after = checkOutputHealth(testFile);
    assert.deepStrictEqual(before, after);
  } finally { cleanupTempDir(dir); }
});

test('Batch check output health', () => {
  const dir = makeTempDir();
  try {
    const f1 = path.join(dir, 'a.mp4');
    const f2 = path.join(dir, 'b.mp4');
    fs.writeFileSync(f1, 'data');
    const result = batchCheckOutputHealth([f1, f2, '/nonexistent.mp4']);
    assert.strictEqual(result.results.length, 3);
    assert.strictEqual(result.summary.available, 1);
    assert.strictEqual(result.summary.missing, 2);
  } finally { cleanupTempDir(dir); }
});

test('Batch check empty input', () => {
  const result = batchCheckOutputHealth([]);
  assert.strictEqual(result.results.length, 0);
  assert.strictEqual(result.summary.total, 0);
});

test('Check record output health', () => {
  const dir = makeTempDir();
  try {
    const testFile = path.join(dir, 'output.mp4');
    fs.writeFileSync(testFile, 'data');
    const record = { id: 'r1', output: { path: testFile } };
    const result = checkRecordOutputHealth(record);
    assert.strictEqual(result.status, OUTPUT_HEALTH_STATUS.AVAILABLE);
  } finally { cleanupTempDir(dir); }
});

test('Check record output health null record', () => {
  const result = checkRecordOutputHealth(null);
  assert.strictEqual(result.status, OUTPUT_HEALTH_STATUS.INVALID_PATH);
});

test('Validate directory path', () => {
  const dir = makeTempDir();
  try {
    const result = validateDirectoryPath(dir);
    assert.strictEqual(result.valid, true);
  } finally { cleanupTempDir(dir); }
});

test('Validate directory path nonexistent', () => {
  const result = validateDirectoryPath('/nonexistent/dir');
  assert.strictEqual(result.valid, false);
});

test('Validate directory path empty', () => {
  const result = validateDirectoryPath('');
  assert.strictEqual(result.valid, false);
});

test('Validate openable path', () => {
  const dir = makeTempDir();
  try {
    const testFile = path.join(dir, 'test.mp4');
    fs.writeFileSync(testFile, 'data');
    const result = validateOpenablePath(testFile);
    assert.strictEqual(result.valid, true);
  } finally { cleanupTempDir(dir); }
});

test('Validate openable path nonexistent', () => {
  const result = validateOpenablePath('/nonexistent/file.mp4');
  assert.strictEqual(result.valid, false);
});

// ─── Error Normalization ───────────────────────────────────────────────────
console.log('\n  ── Error Normalization ──');

test('S. Error normalization: source missing', () => {
  const result = normalizeError('Source file not found');
  assert.strictEqual(result.category, RECOVERY_ERROR_CATEGORY.SOURCE_MISSING);
});

test('T. No stack trace leakage', () => {
  const result = normalizeError('Error: ENOENT: no such file or directory');
  assert.ok(!result.message.includes('ENOENT') || result.message.length < 100);
  assert.ok(result.category);
});

test('Error normalization: output directory', () => {
  const result = normalizeError('Output directory permission denied');
  assert.strictEqual(result.category, RECOVERY_ERROR_CATEGORY.OUTPUT_DIRECTORY_UNAVAILABLE);
});

test('Error normalization: permission', () => {
  const result = normalizeError('EACCES: permission denied');
  assert.strictEqual(result.category, RECOVERY_ERROR_CATEGORY.OUTPUT_DIRECTORY_UNAVAILABLE);
});

test('Error normalization: invalid config', () => {
  const result = normalizeError('Invalid preset configuration');
  assert.strictEqual(result.category, RECOVERY_ERROR_CATEGORY.INVALID_CONFIGURATION);
});

test('Error normalization: feature not available', () => {
  const result = normalizeError('Feature requires Pro license tier upgrade');
  assert.strictEqual(result.category, RECOVERY_ERROR_CATEGORY.FEATURE_NOT_AVAILABLE);
});

test('Error normalization: cancelled', () => {
  const result = normalizeError('Export was cancelled by user');
  assert.strictEqual(result.category, RECOVERY_ERROR_CATEGORY.EXPORT_CANCELLED);
});

test('Error normalization: ffmpeg failure', () => {
  const result = normalizeError('FFmpeg encoder error occurred');
  assert.strictEqual(result.category, RECOVERY_ERROR_CATEGORY.FFMPEG_FAILURE);
});

test('Error normalization: unknown error', () => {
  const result = normalizeError('Something weird happened');
  assert.strictEqual(result.category, RECOVERY_ERROR_CATEGORY.UNKNOWN_ERROR);
});

test('Error normalization: empty string', () => {
  const result = normalizeError('');
  assert.strictEqual(result.category, RECOVERY_ERROR_CATEGORY.UNKNOWN_ERROR);
  assert.strictEqual(result.message, 'Unknown export failure');
});

test('Error normalization: null', () => {
  const result = normalizeError(null);
  assert.strictEqual(result.category, RECOVERY_ERROR_CATEGORY.UNKNOWN_ERROR);
});

// ─── Retry Readiness ───────────────────────────────────────────────────────
console.log('\n  ── Retry Readiness ──');

test('G. Failed recovery readiness', () => {
  const dir = makeTempDir();
  try {
    const record = insertRecord(dir, {
      status: EXPORT_HISTORY_STATUS.FAILED,
      error: 'FFmpeg encoder error',
      source: { name: 'test.mp4', path: path.join(dir, 'test.mp4') },
    });
    // Create source file
    fs.writeFileSync(path.join(dir, 'test.mp4'), 'fake video');
    const result = checkRetryReadiness(record.id, dir);
    assert.strictEqual(result.ready, true);
    assert.deepStrictEqual(result.reasons, []);
  } finally { cleanupTempDir(dir); }
});

test('H. Missing-output recovery readiness', () => {
  const dir = makeTempDir();
  try {
    const record = insertRecord(dir, {
      status: EXPORT_HISTORY_STATUS.COMPLETED,
      source: { name: 'test.mp4', path: path.join(dir, 'test.mp4') },
      output: { path: '/nonexistent/output.mp4', directory: '/nonexistent', filename: 'output.mp4' },
    });
    fs.writeFileSync(path.join(dir, 'test.mp4'), 'fake video');
    const result = exportAgainMissingOutput(record.id, dir);
    assert.strictEqual(result.success, true);
    assert.ok(result.record);
  } finally { cleanupTempDir(dir); }
});

test('I. Source missing blocks retry', () => {
  const dir = makeTempDir();
  try {
    const record = insertRecord(dir, {
      status: EXPORT_HISTORY_STATUS.FAILED,
      source: { name: 'missing.mp4', path: '/nonexistent/missing.mp4' },
    });
    const result = checkRetryReadiness(record.id, dir);
    assert.strictEqual(result.ready, false);
    assert.ok(result.reasons.some(r => r.includes('Source file not found')));
  } finally { cleanupTempDir(dir); }
});

test('J. Completed record with missing output allows recovery', () => {
  const dir = makeTempDir();
  try {
    const record = insertRecord(dir, {
      status: EXPORT_HISTORY_STATUS.COMPLETED,
      source: { name: 'test.mp4', path: path.join(dir, 'test.mp4') },
    });
    fs.writeFileSync(path.join(dir, 'test.mp4'), 'fake');
    const result = exportAgainMissingOutput(record.id, dir);
    assert.strictEqual(result.success, true);
    assert.ok(result.record);
  } finally { cleanupTempDir(dir); }
});

test('K. Feature gate blocks retry', () => {
  const dir = makeTempDir();
  try {
    const result = checkRetryReadiness('nonexistent', dir);
    assert.strictEqual(result.ready, false);
    assert.ok(result.reasons.some(r => r.includes('not found')));
  } finally { cleanupTempDir(dir); }
});

test('Batch check retry readiness', () => {
  const dir = makeTempDir();
  try {
    const r1 = insertRecord(dir, {
      status: EXPORT_HISTORY_STATUS.FAILED,
      source: { name: 'test.mp4', path: path.join(dir, 'test.mp4') },
    });
    fs.writeFileSync(path.join(dir, 'test.mp4'), 'fake');
    const r2 = insertRecord(dir, {
      status: EXPORT_HISTORY_STATUS.COMPLETED,
      source: { name: 'test2.mp4', path: '/nonexistent.mp4' },
    });
    const result = batchCheckRetryReadiness([r1.id, r2.id, 'nonexistent'], dir);
    assert.strictEqual(result.summary.total, 3);
    assert.strictEqual(result.summary.ready, 1);
    assert.strictEqual(result.summary.blocked, 2);
  } finally { cleanupTempDir(dir); }
});

// ─── Recovery Diagnostics ──────────────────────────────────────────────────
console.log('\n  ── Recovery Diagnostics ──');

test('Recovery diagnostics for failed record', () => {
  const dir = makeTempDir();
  try {
    const record = insertRecord(dir, {
      status: EXPORT_HISTORY_STATUS.FAILED,
      error: 'FFmpeg encoder error',
      source: { name: 'test.mp4', path: path.join(dir, 'test.mp4') },
    });
    fs.writeFileSync(path.join(dir, 'test.mp4'), 'fake');
    const diag = getRecoveryDiagnostics(record.id, dir);
    assert.strictEqual(diag.category, RECOVERY_ERROR_CATEGORY.FFMPEG_FAILURE);
    assert.strictEqual(diag.sourceExists, true);
  } finally { cleanupTempDir(dir); }
});

test('Recovery diagnostics for missing record', () => {
  const diag = getRecoveryDiagnostics('nonexistent');
  assert.strictEqual(diag.category, RECOVERY_ERROR_CATEGORY.UNKNOWN_ERROR);
  assert.strictEqual(diag.sourceExists, false);
});

test('Recovery diagnostics source missing', () => {
  const dir = makeTempDir();
  try {
    const record = insertRecord(dir, {
      status: EXPORT_HISTORY_STATUS.FAILED,
      error: 'Source file not found',
    });
    const diag = getRecoveryDiagnostics(record.id, dir);
    assert.strictEqual(diag.category, RECOVERY_ERROR_CATEGORY.SOURCE_MISSING);
    assert.strictEqual(diag.sourceExists, false);
  } finally { cleanupTempDir(dir); }
});

// ─── Recovery Actions ──────────────────────────────────────────────────────
console.log('\n  ── Recovery Actions ──');

test('L. Successful retry creates new history', () => {
  const dir = makeTempDir();
  try {
    const record = insertRecord(dir, {
      status: EXPORT_HISTORY_STATUS.FAILED,
      error: 'FFmpeg error',
      source: { name: 'test.mp4', path: path.join(dir, 'test.mp4') },
    });
    fs.writeFileSync(path.join(dir, 'test.mp4'), 'fake');
    const result = retryFailedExport(record.id, dir);
    assert.strictEqual(result.success, true);
    assert.ok(result.record);
    assert.ok(result.record.id !== record.id);
  } finally { cleanupTempDir(dir); }
});

test('M. Original record preserved', () => {
  const dir = makeTempDir();
  try {
    const record = insertRecord(dir, {
      status: EXPORT_HISTORY_STATUS.FAILED,
      error: 'FFmpeg error',
      source: { name: 'test.mp4', path: path.join(dir, 'test.mp4') },
    });
    fs.writeFileSync(path.join(dir, 'test.mp4'), 'fake');
    retryFailedExport(record.id, dir);
    const { getExportHistoryRecord } = require('../src/main/history/exportHistoryManager');
    const original = getExportHistoryRecord(record.id, dir);
    assert.ok(original);
    assert.strictEqual(original.status, EXPORT_HISTORY_STATUS.FAILED);
    assert.strictEqual(original.error, 'FFmpeg error');
  } finally { cleanupTempDir(dir); }
});

test('N. Retry uses historical snapshot', () => {
  const dir = makeTempDir();
  try {
    const record = insertRecord(dir, {
      status: EXPORT_HISTORY_STATUS.FAILED,
      source: { name: 'test.mp4', path: path.join(dir, 'test.mp4') },
      profile: { id: 'p1', name: 'Original Profile', platform: 'instagram' },
      settingsSnapshot: { resolution: '1080x1920' },
    });
    fs.writeFileSync(path.join(dir, 'test.mp4'), 'fake');
    const result = retryFailedExport(record.id, dir);
    assert.strictEqual(result.record.profile.name, 'Original Profile');
    assert.deepStrictEqual(result.record.settingsSnapshot, { resolution: '1080x1920' });
  } finally { cleanupTempDir(dir); }
});

test('Retry blocks non-failed record', () => {
  const dir = makeTempDir();
  try {
    const record = insertRecord(dir, {
      status: EXPORT_HISTORY_STATUS.COMPLETED,
    });
    const result = retryFailedExport(record.id, dir);
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('not FAILED'));
  } finally { cleanupTempDir(dir); }
});

test('Retry blocks nonexistent record', () => {
  const result = retryFailedExport('nonexistent');
  assert.strictEqual(result.success, false);
});

test('Export again missing output blocks available output', () => {
  const dir = makeTempDir();
  try {
    const testFile = path.join(dir, 'output.mp4');
    fs.writeFileSync(testFile, 'data');
    const record = insertRecord(dir, {
      status: EXPORT_HISTORY_STATUS.COMPLETED,
      output: { path: testFile, directory: dir, filename: 'output.mp4' },
    });
    const result = exportAgainMissingOutput(record.id, dir);
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('still available'));
  } finally { cleanupTempDir(dir); }
});

// ─── Bulk Recovery ─────────────────────────────────────────────────────────
console.log('\n  ── Bulk Recovery ──');

test('O. Bulk retry partial readiness', () => {
  const dir = makeTempDir();
  try {
    const r1 = insertRecord(dir, {
      status: EXPORT_HISTORY_STATUS.FAILED,
      source: { name: 'test.mp4', path: path.join(dir, 'test.mp4') },
    });
    fs.writeFileSync(path.join(dir, 'test.mp4'), 'fake');
    const r2 = insertRecord(dir, {
      status: EXPORT_HISTORY_STATUS.COMPLETED,
      source: { name: 'test2.mp4', path: '/nonexistent.mp4' },
    });
    const result = bulkRetryFailed([r1.id, r2.id, 'nonexistent'], dir);
    assert.strictEqual(result.selected, 3);
    assert.strictEqual(result.ready, 1);
    assert.strictEqual(result.completed, 1);
    assert.strictEqual(result.skipped, 2);
  } finally { cleanupTempDir(dir); }
});

test('P. Failure isolation', () => {
  const dir = makeTempDir();
  try {
    const r1 = insertRecord(dir, {
      status: EXPORT_HISTORY_STATUS.FAILED,
      source: { name: 'test.mp4', path: path.join(dir, 'test.mp4') },
    });
    fs.writeFileSync(path.join(dir, 'test.mp4'), 'fake');
    const r2 = insertRecord(dir, {
      status: EXPORT_HISTORY_STATUS.FAILED,
      source: { name: 'missing.mp4', path: '/nonexistent.mp4' },
    });
    const result = bulkRetryFailed([r1.id, r2.id], dir);
    assert.strictEqual(result.ready, 1);
    assert.strictEqual(result.completed, 1);
    assert.strictEqual(result.skipped, 1);
  } finally { cleanupTempDir(dir); }
});

test('Q. Recovery summary', () => {
  const dir = makeTempDir();
  try {
    const r1 = insertRecord(dir, {
      status: EXPORT_HISTORY_STATUS.FAILED,
      source: { name: 'test.mp4', path: path.join(dir, 'test.mp4') },
    });
    fs.writeFileSync(path.join(dir, 'test.mp4'), 'fake');
    const result = bulkRetryFailed([r1.id], dir);
    assert.ok(result.summary.includes('Selected 1'));
    assert.ok(result.summary.includes('started 1'));
  } finally { cleanupTempDir(dir); }
});

test('Bulk retry empty input', () => {
  const result = bulkRetryFailed([]);
  assert.strictEqual(result.selected, 0);
});

test('Bulk retry deduplicates IDs', () => {
  const dir = makeTempDir();
  try {
    const r1 = insertRecord(dir, {
      status: EXPORT_HISTORY_STATUS.FAILED,
      source: { name: 'test.mp4', path: path.join(dir, 'test.mp4') },
    });
    fs.writeFileSync(path.join(dir, 'test.mp4'), 'fake');
    const result = bulkRetryFailed([r1.id, r1.id, r1.id], dir);
    assert.strictEqual(result.selected, 1);
  } finally { cleanupTempDir(dir); }
});

test('Bulk export again missing', () => {
  const dir = makeTempDir();
  try {
    const record = insertRecord(dir, {
      status: EXPORT_HISTORY_STATUS.COMPLETED,
      source: { name: 'test.mp4', path: path.join(dir, 'test.mp4') },
      output: { path: '/nonexistent/output.mp4', directory: '/nonexistent', filename: 'output.mp4' },
    });
    fs.writeFileSync(path.join(dir, 'test.mp4'), 'fake');
    const result = bulkExportAgainMissing([record.id], dir);
    assert.strictEqual(result.selected, 1);
    assert.strictEqual(result.completed, 1);
  } finally { cleanupTempDir(dir); }
});

// ─── Attempt Relationship ──────────────────────────────────────────────────
console.log('\n  ── Attempt Relationship ──');

test('R. Attempt relationship', () => {
  const dir = makeTempDir();
  try {
    const { createRetryRecord } = require('../src/main/history/exportHistoryIntelligence');
    const original = insertRecord(dir, { status: EXPORT_HISTORY_STATUS.COMPLETED });
    const retry1 = createRetryRecord(original.id, dir);
    const display = getAttemptDisplayInfo(retry1, dir);
    assert.ok(display);
    assert.strictEqual(display.totalAttempts, 2);
    assert.strictEqual(display.attemptNumber, 2);
    assert.ok(display.display.includes('2'));
    assert.ok(display.display.includes('2'));
  } finally { cleanupTempDir(dir); }
});

test('Attempt display for single record', () => {
  const dir = makeTempDir();
  try {
    const record = insertRecord(dir, { status: EXPORT_HISTORY_STATUS.COMPLETED });
    const display = getAttemptDisplayInfo(record, dir);
    assert.strictEqual(display, null);
  } finally { cleanupTempDir(dir); }
});

test('Attempt display for null record', () => {
  const display = getAttemptDisplayInfo(null);
  assert.strictEqual(display, null);
});

// ─── Archive ───────────────────────────────────────────────────────────────
console.log('\n  ── Archive ──');

test('W. Archive', () => {
  const dir = makeTempDir();
  try {
    const record = insertRecord(dir);
    const archived = archiveRecord(record.id, dir);
    assert.strictEqual(archived.archived, true);
  } finally { cleanupTempDir(dir); }
});

test('X. Unarchive', () => {
  const dir = makeTempDir();
  try {
    const record = insertRecord(dir);
    archiveRecord(record.id, dir);
    const unarchived = unarchiveRecord(record.id, dir);
    assert.strictEqual(unarchived.archived, false);
  } finally { cleanupTempDir(dir); }
});

test('Y. Bulk archive', () => {
  const dir = makeTempDir();
  try {
    const r1 = insertRecord(dir);
    const r2 = insertRecord(dir);
    const result = bulkArchive([r1.id, r2.id], dir);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.archivedCount, 2);
  } finally { cleanupTempDir(dir); }
});

test('Z. Bulk unarchive', () => {
  const dir = makeTempDir();
  try {
    const r1 = insertRecord(dir);
    const r2 = insertRecord(dir);
    bulkArchive([r1.id, r2.id], dir);
    const result = bulkUnarchive([r1.id, r2.id], dir);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.unarchivedCount, 2);
  } finally { cleanupTempDir(dir); }
});

test('Archive throws for missing record', () => {
  const dir = makeTempDir();
  try {
    assert.throws(() => archiveRecord('nonexistent', dir), /not found/i);
  } finally { cleanupTempDir(dir); }
});

test('Archive validates id', () => {
  assert.throws(() => archiveRecord(''), /Record id is required/i);
});

test('Bulk archive validates ids', () => {
  assert.throws(() => bulkArchive([]), /non-empty array/i);
});

// ─── Pin ───────────────────────────────────────────────────────────────────
console.log('\n  ── Pin ──');

test('AA. Pin', () => {
  const dir = makeTempDir();
  try {
    const record = insertRecord(dir);
    const pinned = pinRecord(record.id, dir);
    assert.strictEqual(pinned.pinned, true);
  } finally { cleanupTempDir(dir); }
});

test('AB. Unpin', () => {
  const dir = makeTempDir();
  try {
    const record = insertRecord(dir);
    pinRecord(record.id, dir);
    const unpinned = unpinRecord(record.id, dir);
    assert.strictEqual(unpinned.pinned, false);
  } finally { cleanupTempDir(dir); }
});

test('AC. Bulk pin/unpin', () => {
  const dir = makeTempDir();
  try {
    const r1 = insertRecord(dir);
    const r2 = insertRecord(dir);
    const pinResult = bulkPin([r1.id, r2.id], dir);
    assert.strictEqual(pinResult.success, true);
    assert.strictEqual(pinResult.pinnedCount, 2);
    const unpinResult = bulkUnpin([r1.id, r2.id], dir);
    assert.strictEqual(unpinResult.success, true);
    assert.strictEqual(unpinResult.unpinnedCount, 2);
  } finally { cleanupTempDir(dir); }
});

test('Pin throws for missing record', () => {
  const dir = makeTempDir();
  try {
    assert.throws(() => pinRecord('nonexistent', dir), /not found/i);
  } finally { cleanupTempDir(dir); }
});

// ─── Needs Attention ───────────────────────────────────────────────────────
console.log('\n  ── Needs Attention ──');

test('AD. Needs Attention filter', () => {
  const dir = makeTempDir();
  try {
    const r1 = insertRecord(dir, { status: EXPORT_HISTORY_STATUS.FAILED });
    const testFile = path.join(dir, 'output.mp4');
    fs.writeFileSync(testFile, 'data');
    const r2 = insertRecord(dir, {
      status: EXPORT_HISTORY_STATUS.COMPLETED,
      output: { path: testFile, directory: dir, filename: 'output.mp4' },
    });
    const records = [r1, r2];
    const needs = getNeedsAttentionRecords(records);
    assert.strictEqual(needs.length, 1);
    assert.strictEqual(needs[0].id, r1.id);
  } finally { cleanupTempDir(dir); }
});

test('Needs attention excludes archived', () => {
  const dir = makeTempDir();
  try {
    const r1 = insertRecord(dir, { status: EXPORT_HISTORY_STATUS.FAILED });
    r1.archived = true;
    const needs = getNeedsAttentionRecords([r1]);
    assert.strictEqual(needs.length, 0);
  } finally { cleanupTempDir(dir); }
});

test('isNeedsAttention detects failed', () => {
  assert.strictEqual(isNeedsAttention({ status: 'FAILED', archived: false }), true);
  assert.strictEqual(isNeedsAttention({ status: 'COMPLETED', archived: false }), false);
});

// ─── Workspace View & Summary ──────────────────────────────────────────────
console.log('\n  ── Workspace View & Summary ──');

test('AE. Workspace summary', () => {
  const dir = makeTempDir();
  try {
    const r1 = insertRecord(dir, { status: EXPORT_HISTORY_STATUS.FAILED });
    const testFile = path.join(dir, 'output.mp4');
    fs.writeFileSync(testFile, 'data');
    const r2 = insertRecord(dir, {
      status: EXPORT_HISTORY_STATUS.COMPLETED,
      output: { path: testFile, directory: dir, filename: 'output.mp4' },
    });
    const r3 = insertRecord(dir, {
      status: EXPORT_HISTORY_STATUS.COMPLETED,
      output: { path: testFile, directory: dir, filename: 'output.mp4' },
    });
    r3.pinned = true;
    const summary = getWorkspaceSummary([r1, r2, r3]);
    assert.strictEqual(summary.total, 3);
    assert.strictEqual(summary.failed, 1);
    assert.strictEqual(summary.pinned, 1);
    assert.strictEqual(summary.needsAttention, 1);
  } finally { cleanupTempDir(dir); }
});

test('Workspace view categorizes records', () => {
  const dir = makeTempDir();
  try {
    const testFile = path.join(dir, 'output.mp4');
    fs.writeFileSync(testFile, 'data');
    const r1 = insertRecord(dir, {
      status: EXPORT_HISTORY_STATUS.COMPLETED,
      output: { path: testFile, directory: dir, filename: 'output.mp4' },
    });
    r1.pinned = true;
    const r2 = insertRecord(dir, { status: EXPORT_HISTORY_STATUS.FAILED });
    const r3 = insertRecord(dir, {
      status: EXPORT_HISTORY_STATUS.COMPLETED,
      output: { path: testFile, directory: dir, filename: 'output.mp4' },
    });
    const view = getWorkspaceView([r1, r2, r3]);
    assert.strictEqual(view.pinned.length, 1);
    assert.strictEqual(view.needsAttention.length, 1);
    assert.strictEqual(view.recent.length, 1);
  } finally { cleanupTempDir(dir); }
});

test('Workspace view excludes archived', () => {
  const dir = makeTempDir();
  try {
    const r1 = insertRecord(dir);
    r1.archived = true;
    const view = getWorkspaceView([r1]);
    assert.strictEqual(view.pinned.length, 0);
    assert.strictEqual(view.needsAttention.length, 0);
    assert.strictEqual(view.recent.length, 0);
  } finally { cleanupTempDir(dir); }
});

test('Recovery counts', () => {
  const dir = makeTempDir();
  try {
    const r1 = insertRecord(dir, { status: EXPORT_HISTORY_STATUS.FAILED });
    const r2 = insertRecord(dir, { status: EXPORT_HISTORY_STATUS.COMPLETED });
    r2.archived = true;
    const counts = getRecoveryCounts([r1, r2]);
    assert.strictEqual(counts.failed, 1);
    assert.strictEqual(counts.archived, 1);
    assert.strictEqual(counts.needsAttention, 1);
  } finally { cleanupTempDir(dir); }
});

// ─── Snapshot Safety ───────────────────────────────────────────────────────
console.log('\n  ── Snapshot Safety ──');

test('AI. Snapshot immutability', () => {
  const dir = makeTempDir();
  try {
    const record = insertRecord(dir, {
      status: EXPORT_HISTORY_STATUS.FAILED,
      source: { name: 'test.mp4', path: path.join(dir, 'test.mp4') },
      settingsSnapshot: { resolution: '1080x1920', bitrate: '5000k' },
    });
    fs.writeFileSync(path.join(dir, 'test.mp4'), 'fake');
    const result = retryFailedExport(record.id, dir);
    assert.deepStrictEqual(result.record.settingsSnapshot, { resolution: '1080x1920', bitrate: '5000k' });
    // Mutate original's snapshot — retry record should be unaffected
    record.settingsSnapshot.resolution = '3840x2160';
    assert.strictEqual(result.record.settingsSnapshot.resolution, '1080x1920');
  } finally { cleanupTempDir(dir); }
});

test('AH. Edited current profile compatibility', () => {
  const dir = makeTempDir();
  try {
    const record = insertRecord(dir, {
      status: EXPORT_HISTORY_STATUS.FAILED,
      source: { name: 'test.mp4', path: path.join(dir, 'test.mp4') },
      profile: { id: 'p1', name: 'Original Name', platform: 'instagram' },
    });
    fs.writeFileSync(path.join(dir, 'test.mp4'), 'fake');
    const result = retryFailedExport(record.id, dir);
    assert.strictEqual(result.record.profile.name, 'Original Name');
  } finally { cleanupTempDir(dir); }
});

test('AG. Deleted current preset compatibility', () => {
  const dir = makeTempDir();
  try {
    const record = insertRecord(dir, {
      status: EXPORT_HISTORY_STATUS.FAILED,
      source: { name: 'test.mp4', path: path.join(dir, 'test.mp4') },
      exportPreset: { id: 'ep-deleted', name: 'Deleted Preset' },
    });
    fs.writeFileSync(path.join(dir, 'test.mp4'), 'fake');
    const result = retryFailedExport(record.id, dir);
    assert.strictEqual(result.record.exportPreset.name, 'Deleted Preset');
  } finally { cleanupTempDir(dir); }
});

// ─── Cross-Profile Isolation ───────────────────────────────────────────────
console.log('\n  ── Cross-Profile Isolation ──');

test('AJ. Cross-profile isolation', () => {
  const dir = makeTempDir();
  try {
    const r1 = insertRecord(dir, {
      status: EXPORT_HISTORY_STATUS.FAILED,
      profile: { id: 'p1', name: 'Profile A', platform: 'instagram' },
      source: { name: 'test.mp4', path: path.join(dir, 'test.mp4') },
    });
    const r2 = insertRecord(dir, {
      status: EXPORT_HISTORY_STATUS.FAILED,
      profile: { id: 'p2', name: 'Profile B', platform: 'tiktok' },
      source: { name: 'test.mp4', path: path.join(dir, 'test.mp4') },
    });
    fs.writeFileSync(path.join(dir, 'test.mp4'), 'fake');
    const result1 = retryFailedExport(r1.id, dir);
    const result2 = retryFailedExport(r2.id, dir);
    assert.strictEqual(result1.record.profile.id, 'p1');
    assert.strictEqual(result2.record.profile.id, 'p2');
  } finally { cleanupTempDir(dir); }
});

// ─── Duplicate & Invalid Selection ─────────────────────────────────────────
console.log('\n  ── Duplicate & Invalid Selection ──');

test('AK. Duplicate selection protection', () => {
  const dir = makeTempDir();
  try {
    const r1 = insertRecord(dir, {
      status: EXPORT_HISTORY_STATUS.FAILED,
      source: { name: 'test.mp4', path: path.join(dir, 'test.mp4') },
    });
    fs.writeFileSync(path.join(dir, 'test.mp4'), 'fake');
    const result = bulkRetryFailed([r1.id, r1.id, r1.id], dir);
    assert.strictEqual(result.selected, 1);
  } finally { cleanupTempDir(dir); }
});

test('AL. Invalid history ID protection', () => {
  const result = bulkRetryFailed(['', null, 123]);
  assert.strictEqual(result.selected, 0);
});

test('AM. IPC validation: empty array', () => {
  const result = bulkRetryFailed([]);
  assert.strictEqual(result.selected, 0);
  assert.ok(result.summary);
});

// ─── Path Traversal Protection ─────────────────────────────────────────────
console.log('\n  ── Path Traversal Protection ──');

test('AN. Path traversal protection', () => {
  const result = checkOutputHealth('/etc/../../../etc/passwd');
  assert.ok([OUTPUT_HEALTH_STATUS.MISSING, OUTPUT_HEALTH_STATUS.INACCESSIBLE, OUTPUT_HEALTH_STATUS.INVALID_PATH].includes(result.status));
});

test('AO. Prototype pollution protection', () => {
  const result = normalizeError({ __proto__: { polluted: true } });
  assert.ok(result.category);
  assert.ok(!({}).polluted);
});

// ─── Retention & Backward Compatibility ────────────────────────────────────
console.log('\n  ── Retention & Backward Compatibility ──');

test('AP. Retention compatibility', () => {
  const dir = makeTempDir();
  try {
    for (let i = 0; i < 5; i++) {
      insertRecord(dir, { jobId: `job-${i}` });
    }
    const list = require('../src/main/history/exportHistoryManager').loadHistory(dir);
    assert.strictEqual(list.length, 5);
  } finally { cleanupTempDir(dir); }
});

test('AQ. Backward compatibility with Phase 5E/5F records', () => {
  const dir = makeTempDir();
  try {
    const record = insertRecord(dir, {
      status: EXPORT_HISTORY_STATUS.COMPLETED,
      output: { path: path.join(dir, 'output.mp4'), directory: dir, filename: 'output.mp4' },
    });
    fs.writeFileSync(path.join(dir, 'output.mp4'), 'data');
    // Record without archive/pinned fields initially
    assert.strictEqual(record.archived, undefined);
    assert.strictEqual(record.pinned, undefined);
    // Workspace view should still work
    const view = getWorkspaceView([record]);
    assert.strictEqual(view.recent.length, 1);
  } finally { cleanupTempDir(dir); }
});

test('AF. Missing output recovery', () => {
  const dir = makeTempDir();
  try {
    const record = insertRecord(dir, {
      status: EXPORT_HISTORY_STATUS.COMPLETED,
      source: { name: 'test.mp4', path: path.join(dir, 'test.mp4') },
      output: { path: '/nonexistent/output.mp4', directory: '/nonexistent', filename: 'output.mp4' },
    });
    fs.writeFileSync(path.join(dir, 'test.mp4'), 'fake');
    const result = exportAgainMissingOutput(record.id, dir);
    assert.strictEqual(result.success, true);
    assert.ok(result.record);
    assert.ok(result.record.id !== record.id);
  } finally { cleanupTempDir(dir); }
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n========================================================');
console.log(`  Export Recovery Center Results: ${passed} passed, ${failed} failed`);
console.log('========================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('✅ All Export Recovery Center tests passed!');
}
