'use strict';

/**
 * Export History Intelligence Tests — Phase 5F
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  groupRecords,
  getDateBucket,
  createSavedView,
  getSavedViews,
  getSavedView,
  updateSavedView,
  deleteSavedView,
  duplicateSavedView,
  bulkDeleteRecords,
  bulkGetExportAgainConfigs,
  bulkCanRetry,
  createRetryRecord,
  getAttemptHistory,
  addTag,
  removeTag,
  filterByTag,
  setNote,
  getTimeline,
  exportToCSV,
  exportToJSON,
  getFilteredStats,
  getVisibleIds,
  validateTag,
} = require('../src/main/history/exportHistoryIntelligence');

const {
  createExportHistoryRecord,
  EXPORT_HISTORY_STATUS,
} = require('../src/main/history/exportHistoryManager');

// ─── Test Helpers ──────────────────────────────────────────────────────────

let _testCounter = 0;
function makeTempDir() {
  _testCounter++;
  return fs.mkdtempSync(path.join(os.tmpdir(), `reel-test-5f-${_testCounter}-`));
}

function cleanupTempDir(dir) {
  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (_) {}
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

function insertRecords(dir, count, baseOverrides = {}) {
  const records = [];
  for (let i = 0; i < count; i++) {
    records.push(insertRecord(dir, { ...baseOverrides, jobId: `job-${i}` }));
  }
  return records;
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
console.log('  Export History Intelligence Tests (Phase 5F)');
console.log('========================================================\n');

// ─── Grouping ──────────────────────────────────────────────────────────────
console.log('  ── Grouping ──');

test('groupRecords returns empty array for empty input', () => {
  const result = groupRecords([], 'date');
  assert.deepStrictEqual(result, []);
});

test('groupRecords returns empty array for no records', () => {
  const result = groupRecords(null, 'date');
  assert.deepStrictEqual(result, []);
});

test('groupRecords returns empty array for no groupBy', () => {
  const result = groupRecords([{ id: '1' }], null);
  assert.deepStrictEqual(result, []);
});

test('groupRecords groups by date (Today)', () => {
  const records = [
    { id: '1', createdAt: new Date().toISOString(), status: 'completed', profile: { name: 'P1' }, exportPreset: { name: 'EP1' }, variationPreset: { name: 'VP1' }, exportType: 'reel', planId: 'plan1' },
  ];
  const groups = groupRecords(records, 'date');
  assert.strictEqual(groups.length, 1);
  assert.strictEqual(groups[0].key, 'Today');
  assert.strictEqual(groups[0].count, 1);
  assert.strictEqual(groups[0].records.length, 1);
});

test('groupRecords groups by date (Yesterday)', () => {
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  const records = [
    { id: '1', createdAt: yesterday, status: 'completed', profile: { name: 'P1' }, exportPreset: { name: 'EP1' }, variationPreset: { name: 'VP1' }, exportType: 'reel', planId: 'plan1' },
  ];
  const groups = groupRecords(records, 'date');
  assert.strictEqual(groups.length, 1);
  assert.strictEqual(groups[0].key, 'Yesterday');
});

test('groupRecords groups by date (This Week)', () => {
  const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString();
  const records = [
    { id: '1', createdAt: twoDaysAgo, status: 'completed', profile: { name: 'P1' }, exportPreset: { name: 'EP1' }, variationPreset: { name: 'VP1' }, exportType: 'reel', planId: 'plan1' },
  ];
  const groups = groupRecords(records, 'date');
  assert.strictEqual(groups.length, 1);
  assert.strictEqual(groups[0].key, 'This Week');
});

test('groupRecords groups by date (Earlier)', () => {
  const tenDaysAgo = new Date(Date.now() - 10 * 86400000).toISOString();
  const records = [
    { id: '1', createdAt: tenDaysAgo, status: 'completed', profile: { name: 'P1' }, exportPreset: { name: 'EP1' }, variationPreset: { name: 'VP1' }, exportType: 'reel', planId: 'plan1' },
  ];
  const groups = groupRecords(records, 'date');
  assert.strictEqual(groups.length, 1);
  assert.strictEqual(groups[0].key, 'Earlier');
});

test('groupRecords groups by profile', () => {
  const records = [
    { id: '1', createdAt: new Date().toISOString(), profile: { name: 'IG' }, exportPreset: { name: 'EP1' }, variationPreset: { name: 'VP1' }, exportType: 'reel', planId: 'p1', status: 'completed' },
    { id: '2', createdAt: new Date().toISOString(), profile: { name: 'TT' }, exportPreset: { name: 'EP1' }, variationPreset: { name: 'VP1' }, exportType: 'reel', planId: 'p1', status: 'completed' },
  ];
  const groups = groupRecords(records, 'profile');
  assert.strictEqual(groups.length, 2);
  assert.strictEqual(groups.find(g => g.key === 'IG').count, 1);
  assert.strictEqual(groups.find(g => g.key === 'TT').count, 1);
});

test('groupRecords groups by platform', () => {
  const records = [
    { id: '1', createdAt: new Date().toISOString(), profile: { name: 'P1', platform: 'instagram' }, exportPreset: { name: 'EP1' }, variationPreset: { name: 'VP1' }, exportType: 'reel', planId: 'p1', status: 'completed' },
    { id: '2', createdAt: new Date().toISOString(), profile: { name: 'P2', platform: 'tiktok' }, exportPreset: { name: 'EP1' }, variationPreset: { name: 'VP1' }, exportType: 'reel', planId: 'p1', status: 'completed' },
  ];
  const groups = groupRecords(records, 'platform');
  assert.strictEqual(groups.length, 2);
});

test('groupRecords groups by exportPreset', () => {
  const records = [
    { id: '1', createdAt: new Date().toISOString(), profile: { name: 'P1' }, exportPreset: { name: 'HD' }, variationPreset: { name: 'VP1' }, exportType: 'reel', planId: 'p1', status: 'completed' },
    { id: '2', createdAt: new Date().toISOString(), profile: { name: 'P1' }, exportPreset: { name: 'SD' }, variationPreset: { name: 'VP1' }, exportType: 'reel', planId: 'p1', status: 'completed' },
  ];
  const groups = groupRecords(records, 'exportPreset');
  assert.strictEqual(groups.length, 2);
});

test('groupRecords groups by status', () => {
  const records = [
    { id: '1', createdAt: new Date().toISOString(), profile: { name: 'P1' }, exportPreset: { name: 'EP1' }, variationPreset: { name: 'VP1' }, exportType: 'reel', planId: 'p1', status: 'completed' },
    { id: '2', createdAt: new Date().toISOString(), profile: { name: 'P1' }, exportPreset: { name: 'EP1' }, variationPreset: { name: 'VP1' }, exportType: 'reel', planId: 'p1', status: 'failed' },
  ];
  const groups = groupRecords(records, 'status');
  assert.strictEqual(groups.length, 2);
});

test('groupRecords groups by exportType', () => {
  const records = [
    { id: '1', createdAt: new Date().toISOString(), profile: { name: 'P1' }, exportPreset: { name: 'EP1' }, variationPreset: { name: 'VP1' }, exportType: 'reel', planId: 'p1', status: 'completed' },
    { id: '2', createdAt: new Date().toISOString(), profile: { name: 'P1' }, exportPreset: { name: 'EP1' }, variationPreset: { name: 'VP1' }, exportType: 'clip', planId: 'p1', status: 'completed' },
  ];
  const groups = groupRecords(records, 'exportType');
  assert.strictEqual(groups.length, 2);
});

test('groupRecords groups by plan', () => {
  const records = [
    { id: '1', createdAt: new Date().toISOString(), profile: { name: 'P1' }, exportPreset: { name: 'EP1' }, variationPreset: { name: 'VP1' }, exportType: 'reel', planId: 'plan-A', status: 'completed' },
    { id: '2', createdAt: new Date().toISOString(), profile: { name: 'P1' }, exportPreset: { name: 'EP1' }, variationPreset: { name: 'VP1' }, exportType: 'reel', planId: 'plan-B', status: 'completed' },
    { id: '3', createdAt: new Date().toISOString(), profile: { name: 'P1' }, exportPreset: { name: 'EP1' }, variationPreset: { name: 'VP1' }, exportType: 'reel', planId: 'plan-A', status: 'completed' },
  ];
  const groups = groupRecords(records, 'plan');
  assert.strictEqual(groups.length, 2);
  assert.strictEqual(groups.find(g => g.key === 'plan-A').count, 2);
});

test('getDateBucket returns correct bucket', () => {
  assert.strictEqual(getDateBucket(new Date().toISOString()), 'Today');
  assert.strictEqual(getDateBucket(new Date(Date.now() - 86400000).toISOString()), 'Yesterday');
  assert.strictEqual(getDateBucket(new Date(Date.now() - 2 * 86400000).toISOString()), 'This Week');
  assert.strictEqual(getDateBucket(new Date(Date.now() - 10 * 86400000).toISOString()), 'Earlier');
});

// ─── Saved Views CRUD ─────────────────────────────────────────────────────
console.log('\n  ── Saved Views CRUD ──');

test('createSavedView creates a view', () => {
  const dir = makeTempDir();
  try {
    const view = createSavedView({ name: 'My View', query: { status: 'completed' }, sort: 'newest' }, dir);
    assert.ok(view.id);
    assert.ok(view.id.startsWith('view_'));
    assert.strictEqual(view.name, 'My View');
    assert.deepStrictEqual(view.query, { status: 'completed' });
    assert.strictEqual(view.sort, 'newest');
    assert.ok(view.createdAt);
    assert.ok(view.updatedAt);
  } finally { cleanupTempDir(dir); }
});

test('createSavedView validates name', () => {
  const dir = makeTempDir();
  try {
    assert.throws(() => createSavedView({ name: '' }, dir), /name is required/i);
    assert.throws(() => createSavedView({ name: null }, dir), /name is required/i);
  } finally { cleanupTempDir(dir); }
});

test('createSavedView validates input', () => {
  assert.throws(() => createSavedView(null), /must be a valid object/i);
  assert.throws(() => createSavedView('bad'), /must be a valid object/i);
  assert.throws(() => createSavedView([]), /must be a valid object/i);
});

test('getSavedViews returns empty array for no views', () => {
  const dir = makeTempDir();
  try {
    const views = getSavedViews(dir);
    assert.deepStrictEqual(views, []);
  } finally { cleanupTempDir(dir); }
});

test('getSavedViews returns all views', () => {
  const dir = makeTempDir();
  try {
    createSavedView({ name: 'View 1' }, dir);
    createSavedView({ name: 'View 2' }, dir);
    const views = getSavedViews(dir);
    assert.strictEqual(views.length, 2);
    assert.strictEqual(views[0].name, 'View 1');
    assert.strictEqual(views[1].name, 'View 2');
  } finally { cleanupTempDir(dir); }
});

test('getSavedView returns view by id', () => {
  const dir = makeTempDir();
  try {
    const created = createSavedView({ name: 'Test View' }, dir);
    const found = getSavedView(created.id, dir);
    assert.strictEqual(found.id, created.id);
    assert.strictEqual(found.name, 'Test View');
  } finally { cleanupTempDir(dir); }
});

test('getSavedView returns null for missing id', () => {
  const dir = makeTempDir();
  try {
    const result = getSavedView('nonexistent', dir);
    assert.strictEqual(result, null);
  } finally { cleanupTempDir(dir); }
});

test('getSavedView throws for invalid id', () => {
  assert.throws(() => getSavedView(''), /id is required/i);
  assert.throws(() => getSavedView(null), /id is required/i);
});

test('updateSavedView updates fields', () => {
  const dir = makeTempDir();
  try {
    const created = createSavedView({ name: 'Original', sort: 'newest' }, dir);
    const updated = updateSavedView(created.id, { name: 'Updated', sort: 'oldest' }, dir);
    assert.strictEqual(updated.name, 'Updated');
    assert.strictEqual(updated.sort, 'oldest');
    assert.ok(updated.updatedAt >= created.updatedAt);
  } finally { cleanupTempDir(dir); }
});

test('updateSavedView validates name', () => {
  const dir = makeTempDir();
  try {
    const created = createSavedView({ name: 'Test' }, dir);
    assert.throws(() => updateSavedView(created.id, { name: '' }, dir), /name cannot be empty/i);
  } finally { cleanupTempDir(dir); }
});

test('updateSavedView throws for missing view', () => {
  const dir = makeTempDir();
  try {
    assert.throws(() => updateSavedView('nonexistent', { name: 'X' }, dir), /not found/i);
  } finally { cleanupTempDir(dir); }
});

test('updateSavedView validates id', () => {
  assert.throws(() => updateSavedView('', { name: 'X' }), /id is required/i);
  assert.throws(() => updateSavedView(null, { name: 'X' }), /id is required/i);
  assert.throws(() => updateSavedView('x', null), /must be a valid object/i);
});

test('deleteSavedView removes view', () => {
  const dir = makeTempDir();
  try {
    const created = createSavedView({ name: 'To Delete' }, dir);
    const result = deleteSavedView(created.id, dir);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.id, created.id);
    assert.deepStrictEqual(getSavedViews(dir), []);
  } finally { cleanupTempDir(dir); }
});

test('deleteSavedView throws for missing view', () => {
  const dir = makeTempDir();
  try {
    assert.throws(() => deleteSavedView('nonexistent', dir), /not found/i);
  } finally { cleanupTempDir(dir); }
});

test('deleteSavedView validates id', () => {
  assert.throws(() => deleteSavedView(''), /id is required/i);
});

test('duplicateSavedView creates a copy', () => {
  const dir = makeTempDir();
  try {
    const original = createSavedView({ name: 'Original', query: { status: 'failed' }, sort: 'oldest' }, dir);
    const copy = duplicateSavedView(original.id, dir);
    assert.ok(copy.id !== original.id);
    assert.strictEqual(copy.name, 'Original (Copy)');
    assert.deepStrictEqual(copy.query, { status: 'failed' });
    assert.strictEqual(copy.sort, 'oldest');
    assert.strictEqual(getSavedViews(dir).length, 2);
  } finally { cleanupTempDir(dir); }
});

test('duplicateSavedView throws for missing view', () => {
  const dir = makeTempDir();
  try {
    assert.throws(() => duplicateSavedView('nonexistent', dir), /not found/i);
  } finally { cleanupTempDir(dir); }
});

test('saved views persist to disk', () => {
  const dir = makeTempDir();
  try {
    createSavedView({ name: 'Persistent' }, dir);
    const viewsPath = path.join(dir, 'history-views.json');
    assert.ok(fs.existsSync(viewsPath));
    const raw = JSON.parse(fs.readFileSync(viewsPath, 'utf8'));
    assert.strictEqual(raw.version, 1);
    assert.ok(Array.isArray(raw.views));
    assert.strictEqual(raw.views.length, 1);
    assert.strictEqual(raw.views[0].name, 'Persistent');
  } finally { cleanupTempDir(dir); }
});

test('saved views recover from corrupt file', () => {
  const dir = makeTempDir();
  try {
    const viewsPath = path.join(dir, 'history-views.json');
    fs.writeFileSync(viewsPath, 'not-json!!!', 'utf8');
    const views = getSavedViews(dir);
    assert.deepStrictEqual(views, []);
  } finally { cleanupTempDir(dir); }
});

test('name is truncated to 100 chars', () => {
  const dir = makeTempDir();
  try {
    const longName = 'A'.repeat(200);
    const view = createSavedView({ name: longName }, dir);
    assert.strictEqual(view.name.length, 100);
  } finally { cleanupTempDir(dir); }
});

// ─── Bulk Actions ──────────────────────────────────────────────────────────
console.log('\n  ── Bulk Actions ──');

test('bulkDeleteRecords deletes multiple records', () => {
  const dir = makeTempDir();
  try {
    const records = insertRecords(dir, 5);
    const ids = records.slice(0, 3).map(r => r.id);
    const result = bulkDeleteRecords(ids, dir);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.deletedCount, 3);
  } finally { cleanupTempDir(dir); }
});

test('bulkDeleteRecords validates ids', () => {
  assert.throws(() => bulkDeleteRecords([]), /non-empty array/i);
  assert.throws(() => bulkDeleteRecords(null), /non-empty array/i);
  assert.throws(() => bulkDeleteRecords(['valid', '']), /non-empty strings/i);
});

test('bulkDeleteRecords throws if no matching records', () => {
  const dir = makeTempDir();
  try {
    assert.throws(() => bulkDeleteRecords(['nonexistent'], dir), /No matching records/i);
  } finally { cleanupTempDir(dir); }
});

test('bulkGetExportAgainConfigs returns configs for completed records', () => {
  const dir = makeTempDir();
  try {
    const r1 = insertRecord(dir, { status: EXPORT_HISTORY_STATUS.COMPLETED });
    const r2 = insertRecord(dir, { status: EXPORT_HISTORY_STATUS.FAILED });
    const r3 = insertRecord(dir, { status: EXPORT_HISTORY_STATUS.COMPLETED, output: { path: '/out/x.mp4', directory: '/out', filename: 'x.mp4' } });
    const configs = bulkGetExportAgainConfigs([r1.id, r2.id, r3.id], dir);
    assert.strictEqual(configs.length, 3);
    assert.strictEqual(configs[0].available, true);
    assert.strictEqual(configs[1].available, false);
    assert.ok(configs[1].reason.includes('FAILED'));
    assert.strictEqual(configs[2].available, true);
  } finally { cleanupTempDir(dir); }
});

test('bulkGetExportAgainConfigs validates ids', () => {
  assert.throws(() => bulkGetExportAgainConfigs([]), /non-empty array/i);
  assert.throws(() => bulkGetExportAgainConfigs(null), /non-empty array/i);
});

test('bulkCanRetry returns retryable status', () => {
  const dir = makeTempDir();
  try {
    const r1 = insertRecord(dir, { status: EXPORT_HISTORY_STATUS.FAILED });
    const r2 = insertRecord(dir, { status: EXPORT_HISTORY_STATUS.COMPLETED });
    const results = bulkCanRetry([r1.id, r2.id], dir);
    assert.strictEqual(results.length, 2);
    assert.strictEqual(results[0].retryable, true);
    assert.strictEqual(results[1].retryable, false);
  } finally { cleanupTempDir(dir); }
});

test('bulkCanRetry validates ids', () => {
  assert.throws(() => bulkCanRetry([]), /non-empty array/i);
});

// ─── Attempt Relationships ─────────────────────────────────────────────────
console.log('\n  ── Attempt Relationships ──');

test('createRetryRecord creates a retry with correct fields', () => {
  const dir = makeTempDir();
  try {
    const original = insertRecord(dir, { status: EXPORT_HISTORY_STATUS.COMPLETED });
    const retry = createRetryRecord(original.id, dir);
    assert.ok(retry.id !== original.id);
    assert.strictEqual(retry.attemptGroupId, original.id);
    assert.strictEqual(retry.parentHistoryId, original.id);
    assert.strictEqual(retry.attemptNumber, 2);
    assert.strictEqual(retry.status, EXPORT_HISTORY_STATUS.COMPLETED);
  } finally { cleanupTempDir(dir); }
});

test('createRetryRecord chains attempt numbers', () => {
  const dir = makeTempDir();
  try {
    const original = insertRecord(dir, { status: EXPORT_HISTORY_STATUS.COMPLETED, attemptGroupId: 'grp-1', attemptNumber: 1 });
    const retry1 = createRetryRecord(original.id, dir);
    assert.strictEqual(retry1.attemptGroupId, 'grp-1');
    assert.strictEqual(retry1.attemptNumber, 2);
    const retry2 = createRetryRecord(retry1.id, dir);
    assert.strictEqual(retry2.attemptGroupId, 'grp-1');
    assert.strictEqual(retry2.attemptNumber, 3);
  } finally { cleanupTempDir(dir); }
});

test('createRetryRecord throws for missing record', () => {
  const dir = makeTempDir();
  try {
    assert.throws(() => createRetryRecord('nonexistent', dir), /not found/i);
  } finally { cleanupTempDir(dir); }
});

test('getAttemptHistory returns all records in an attempt group', () => {
  const dir = makeTempDir();
  try {
    const original = insertRecord(dir, { status: EXPORT_HISTORY_STATUS.COMPLETED, attemptGroupId: 'grp-1' });
    insertRecord(dir, { status: EXPORT_HISTORY_STATUS.COMPLETED, attemptGroupId: 'grp-1', jobId: 'job-2' });
    insertRecord(dir, { status: EXPORT_HISTORY_STATUS.COMPLETED, attemptGroupId: 'grp-other', jobId: 'job-3' });
    const history = getAttemptHistory('grp-1', dir);
    assert.strictEqual(history.length, 2);
  } finally { cleanupTempDir(dir); }
});

test('getAttemptHistory validates attemptGroupId', () => {
  assert.throws(() => getAttemptHistory(''), /attemptGroupId is required/i);
  assert.throws(() => getAttemptHistory(null), /attemptGroupId is required/i);
});

// ─── Tags ──────────────────────────────────────────────────────────────────
console.log('\n  ── Tags ──');

test('addTag adds a tag to a record', () => {
  const dir = makeTempDir();
  try {
    const record = insertRecord(dir);
    const updated = addTag(record.id, 'urgent', dir);
    assert.deepStrictEqual(updated.tags, ['urgent']);
  } finally { cleanupTempDir(dir); }
});

test('addTag does not duplicate tags', () => {
  const dir = makeTempDir();
  try {
    const record = insertRecord(dir);
    addTag(record.id, 'urgent', dir);
    const updated = addTag(record.id, 'urgent', dir);
    assert.deepStrictEqual(updated.tags, ['urgent']);
  } finally { cleanupTempDir(dir); }
});

test('addTag enforces max tags limit', () => {
  const dir = makeTempDir();
  try {
    const record = insertRecord(dir);
    for (let i = 0; i < 10; i++) addTag(record.id, `tag${i}`, dir);
    assert.throws(() => addTag(record.id, 'tag10', dir), /Maximum 10 tags/i);
  } finally { cleanupTempDir(dir); }
});

test('addTag validates tag format', () => {
  const dir = makeTempDir();
  try {
    const record = insertRecord(dir);
    assert.throws(() => addTag(record.id, '', dir), /Invalid tag/i);
    assert.throws(() => addTag(record.id, 'has spaces', dir), /Invalid tag/i);
    assert.throws(() => addTag(record.id, 'has@special', dir), /Invalid tag/i);
  } finally { cleanupTempDir(dir); }
});

test('addTag normalizes to lowercase', () => {
  const dir = makeTempDir();
  try {
    const record = insertRecord(dir);
    const updated = addTag(record.id, 'URGENT', dir);
    assert.deepStrictEqual(updated.tags, ['urgent']);
  } finally { cleanupTempDir(dir); }
});

test('addTag throws for missing record', () => {
  const dir = makeTempDir();
  try {
    assert.throws(() => addTag('nonexistent', 'tag', dir), /not found/i);
  } finally { cleanupTempDir(dir); }
});

test('removeTag removes a tag', () => {
  const dir = makeTempDir();
  try {
    const record = insertRecord(dir);
    addTag(record.id, 'urgent', dir);
    const updated = removeTag(record.id, 'urgent', dir);
    assert.deepStrictEqual(updated.tags, []);
  } finally { cleanupTempDir(dir); }
});

test('removeTag is a no-op if tag not present', () => {
  const dir = makeTempDir();
  try {
    const record = insertRecord(dir);
    const updated = removeTag(record.id, 'nonexistent', dir);
    assert.ok(!updated.tags || updated.tags.length === 0);
  } finally { cleanupTempDir(dir); }
});

test('removeTag validates tag format', () => {
  assert.throws(() => removeTag('id', ''), /Invalid tag/i);
});

test('filterByTag filters records by tag', () => {
  const records = [
    { id: '1', tags: ['urgent'] },
    { id: '2', tags: ['review'] },
    { id: '3', tags: ['urgent', 'review'] },
  ];
  const filtered = filterByTag(records, 'urgent');
  assert.strictEqual(filtered.length, 2);
  assert.strictEqual(filtered[0].id, '1');
  assert.strictEqual(filtered[1].id, '3');
});

test('filterByTag returns all records for invalid tag', () => {
  const records = [{ id: '1' }, { id: '2' }];
  const filtered = filterByTag(records, '');
  assert.strictEqual(filtered.length, 2);
});

test('validateTag accepts valid tags', () => {
  assert.strictEqual(validateTag('urgent'), 'urgent');
  assert.strictEqual(validateTag('TAG-1'), 'tag-1');
  assert.strictEqual(validateTag('my_tag'), 'my_tag');
});

test('validateTag rejects invalid tags', () => {
  assert.strictEqual(validateTag(''), null);
  assert.strictEqual(validateTag(null), null);
  assert.strictEqual(validateTag(123), null);
  assert.strictEqual(validateTag('has space'), null);
  assert.strictEqual(validateTag('a@b'), null);
});

// ─── Notes ─────────────────────────────────────────────────────────────────
console.log('\n  ── Notes ──');

test('setNote sets a note on a record', () => {
  const dir = makeTempDir();
  try {
    const record = insertRecord(dir);
    const updated = setNote(record.id, 'Great export!', dir);
    assert.strictEqual(updated.note, 'Great export!');
  } finally { cleanupTempDir(dir); }
});

test('setNote clears note with null', () => {
  const dir = makeTempDir();
  try {
    const record = insertRecord(dir);
    setNote(record.id, 'Note', dir);
    const updated = setNote(record.id, null, dir);
    assert.strictEqual(updated.note, null);
  } finally { cleanupTempDir(dir); }
});

test('setNote truncates to 500 chars', () => {
  const dir = makeTempDir();
  try {
    const record = insertRecord(dir);
    const longNote = 'A'.repeat(600);
    const updated = setNote(record.id, longNote, dir);
    assert.strictEqual(updated.note.length, 500);
  } finally { cleanupTempDir(dir); }
});

test('setNote validates id', () => {
  assert.throws(() => setNote('', 'note'), /Record id is required/i);
  assert.throws(() => setNote(null, 'note'), /Record id is required/i);
});

test('setNote validates note type', () => {
  const dir = makeTempDir();
  try {
    const record = insertRecord(dir);
    assert.throws(() => setNote(record.id, 123, dir), /Note must be a string or null/i);
  } finally { cleanupTempDir(dir); }
});

test('setNote throws for missing record', () => {
  const dir = makeTempDir();
  try {
    assert.throws(() => setNote('nonexistent', 'note', dir), /not found/i);
  } finally { cleanupTempDir(dir); }
});

test('setNote with empty string sets null', () => {
  const dir = makeTempDir();
  try {
    const record = insertRecord(dir);
    const updated = setNote(record.id, '   ', dir);
    assert.strictEqual(updated.note, null);
  } finally { cleanupTempDir(dir); }
});

// ─── Timeline ──────────────────────────────────────────────────────────────
console.log('\n  ── Timeline ──');

test('getTimeline groups records by date', () => {
  const records = [
    { id: '1', createdAt: new Date().toISOString() },
    { id: '2', createdAt: new Date(Date.now() - 86400000).toISOString() },
  ];
  const timeline = getTimeline(records);
  assert.strictEqual(timeline.length, 2);
  assert.strictEqual(timeline[0].label, 'Today');
  assert.strictEqual(timeline[1].label, 'Yesterday');
});

test('getTimeline returns empty for no records', () => {
  const timeline = getTimeline([]);
  assert.deepStrictEqual(timeline, []);
});

test('getTimeline sorts newest first within bucket', () => {
  const now = Date.now();
  const records = [
    { id: '1', createdAt: new Date(now - 1000).toISOString() },
    { id: '2', createdAt: new Date(now).toISOString() },
  ];
  const timeline = getTimeline(records);
  assert.strictEqual(timeline[0].label, 'Today');
  assert.strictEqual(timeline[0].records[0].id, '2');
  assert.strictEqual(timeline[0].records[1].id, '1');
});

// ─── History Export ────────────────────────────────────────────────────────
console.log('\n  ── History Export ──');

test('exportToCSV generates valid CSV', () => {
  const records = [
    {
      id: 'rec-1', createdAt: '2025-01-15T10:00:00Z', completedAt: '2025-01-15T10:05:00Z',
      status: 'completed', source: { name: 'test.mp4' }, exportType: 'reel',
      profile: { name: 'IG', platform: 'instagram' }, exportPreset: { name: 'HD' },
      variationPreset: { name: 'Viral' }, captionTemplate: { name: 'Catchy' },
      output: { filename: 'out.mp4', directory: '/out' }, planId: 'p1', jobId: 'j1',
      error: null, tags: ['urgent'], note: 'Good', attemptGroupId: null, attemptNumber: null,
    },
  ];
  const csv = exportToCSV(records);
  const lines = csv.split('\n');
  assert.strictEqual(lines.length, 2);
  assert.ok(lines[0].includes('ID'));
  assert.ok(lines[0].includes('Created'));
  assert.ok(lines[1].includes('rec-1'));
  assert.ok(lines[1].includes('urgent'));
});

test('exportToCSV handles empty array', () => {
  assert.strictEqual(exportToCSV([]), '');
});

test('exportToCSV handles null input', () => {
  assert.strictEqual(exportToCSV(null), '');
});

test('exportToCSV escapes commas and quotes', () => {
  const records = [
    {
      id: '1', createdAt: '2025-01-15T10:00:00Z', completedAt: null, status: 'completed',
      source: { name: 'has, comma' }, exportType: 'reel', profile: { name: 'has "quotes"' },
      exportPreset: { name: null }, variationPreset: { name: null }, captionTemplate: { name: null },
      output: { filename: null, directory: null }, planId: null, jobId: null,
      error: 'line1\nline2', tags: null, note: null, attemptGroupId: null, attemptNumber: null,
    },
  ];
  const csv = exportToCSV(records);
  assert.ok(csv.includes('"has, comma"'));
  assert.ok(csv.includes('"has ""quotes"""'));
  assert.ok(csv.includes('"line1\nline2"'));
});

test('exportToJSON generates valid JSON', () => {
  const records = [{ id: '1', createdAt: '2025-01-15T10:00:00Z' }];
  const json = exportToJSON(records);
  const parsed = JSON.parse(json);
  assert.strictEqual(parsed.count, 1);
  assert.ok(parsed.exportedAt);
  assert.strictEqual(parsed.records[0].id, '1');
});

test('exportToJSON handles empty array', () => {
  const json = exportToJSON([]);
  const parsed = JSON.parse(json);
  assert.strictEqual(parsed.count, 0);
  assert.deepStrictEqual(parsed.records, []);
});

// ─── Enhanced Statistics ───────────────────────────────────────────────────
console.log('\n  ── Enhanced Statistics ──');

test('getFilteredStats computes stats correctly', () => {
  const records = [
    { status: 'COMPLETED', createdAt: new Date().toISOString(), profile: { name: 'IG' }, exportPreset: { name: 'HD' }, exportType: 'reel', attemptNumber: null },
    { status: 'COMPLETED', createdAt: new Date().toISOString(), profile: { name: 'IG' }, exportPreset: { name: 'HD' }, exportType: 'reel', attemptNumber: null },
    { status: 'FAILED', createdAt: new Date().toISOString(), profile: { name: 'TT' }, exportPreset: { name: 'SD' }, exportType: 'clip', attemptNumber: null },
  ];
  const stats = getFilteredStats(records);
  assert.strictEqual(stats.total, 3);
  assert.strictEqual(stats.completed, 2);
  assert.strictEqual(stats.failed, 1);
  assert.strictEqual(stats.successRate, 67);
  assert.strictEqual(stats.mostUsedProfile, 'IG');
  assert.strictEqual(stats.mostUsedExportPreset, 'HD');
  assert.strictEqual(stats.mostCommonExportType, 'reel');
  assert.strictEqual(stats.recentCount, 3);
});

test('getFilteredStats handles empty records', () => {
  const stats = getFilteredStats([]);
  assert.strictEqual(stats.total, 0);
  assert.strictEqual(stats.completed, 0);
  assert.strictEqual(stats.successRate, 0);
  assert.strictEqual(stats.mostUsedProfile, null);
});

test('getFilteredStats counts retry attempts', () => {
  const records = [
    { status: 'completed', createdAt: new Date().toISOString(), profile: { name: 'IG' }, exportPreset: { name: 'HD' }, exportType: 'reel', attemptNumber: 2 },
    { status: 'completed', createdAt: new Date().toISOString(), profile: { name: 'IG' }, exportPreset: { name: 'HD' }, exportType: 'reel', attemptNumber: 3 },
  ];
  const stats = getFilteredStats(records);
  assert.strictEqual(stats.retryCount, 2);
});

test('getFilteredStats handles missing profile/preset', () => {
  const records = [
    { status: 'completed', createdAt: new Date().toISOString(), profile: null, exportPreset: null, exportType: 'reel', attemptNumber: null },
  ];
  const stats = getFilteredStats(records);
  assert.strictEqual(stats.mostUsedProfile, 'Unknown');
  assert.strictEqual(stats.mostUsedExportPreset, 'None');
});

test('getFilteredStats counts cancelled and skipped', () => {
  const records = [
    { status: 'CANCELLED', createdAt: new Date().toISOString(), profile: { name: 'P' }, exportPreset: { name: 'E' }, exportType: 'reel', attemptNumber: null },
    { status: 'SKIPPED', createdAt: new Date().toISOString(), profile: { name: 'P' }, exportPreset: { name: 'E' }, exportType: 'reel', attemptNumber: null },
  ];
  const stats = getFilteredStats(records);
  assert.strictEqual(stats.cancelled, 1);
  assert.strictEqual(stats.skipped, 1);
});

// ─── Multi-select Helpers ──────────────────────────────────────────────────
console.log('\n  ── Multi-select Helpers ──');

test('getVisibleIds filters selected ids to visible only', () => {
  const records = [{ id: '1' }, { id: '2' }, { id: '3' }];
  const selectedIds = ['1', '3', '4'];
  const visible = getVisibleIds(records, selectedIds);
  assert.deepStrictEqual(visible, ['1', '3']);
});

test('getVisibleIds returns empty for empty input', () => {
  assert.deepStrictEqual(getVisibleIds([], ['1']), []);
  assert.deepStrictEqual(getVisibleIds([{ id: '1' }], []), []);
  assert.deepStrictEqual(getVisibleIds([{ id: '1' }], null), []);
});

// ─── Integration with Phase 5E ────────────────────────────────────────────
console.log('\n  ── Integration with Phase 5E ──');

test('createRetryRecord creates a proper Phase 5E record', () => {
  const dir = makeTempDir();
  try {
    const original = insertRecord(dir, {
      source: { name: 'original.mp4', path: '/vid/original.mp4' },
      exportType: 'reel',
      profile: { id: 'p1', name: 'IG', platform: 'instagram' },
      exportPreset: { id: 'ep1', name: 'HD' },
      variationPreset: { id: 'vp1', name: 'Viral' },
      captionTemplate: { id: 'ct1', name: 'Catchy' },
      output: { path: '/out/orig.mp4', directory: '/out', filename: 'orig.mp4' },
      settingsSnapshot: { resolution: '1080x1920' },
      planId: 'plan-1',
      status: EXPORT_HISTORY_STATUS.COMPLETED,
    });
    const retry = createRetryRecord(original.id, dir);
    assert.ok(retry.id.startsWith('exh_'));
    assert.strictEqual(retry.source.name, 'original.mp4');
    assert.strictEqual(retry.exportType, 'reel');
    assert.strictEqual(retry.profile.name, 'IG');
    assert.strictEqual(retry.exportPreset.name, 'HD');
    assert.strictEqual(retry.variationPreset.name, 'Viral');
    assert.strictEqual(retry.captionTemplate.name, 'Catchy');
    assert.strictEqual(retry.settingsSnapshot.resolution, '1080x1920');
    assert.strictEqual(retry.planId, 'plan-1');
    assert.strictEqual(retry.status, EXPORT_HISTORY_STATUS.COMPLETED);
  } finally { cleanupTempDir(dir); }
});

test('tags and notes are added correctly to history records', () => {
  const dir = makeTempDir();
  try {
    const record = insertRecord(dir);
    addTag(record.id, 'test', dir);
    addTag(record.id, 'urgent', dir);
    setNote(record.id, 'Important export', dir);

    const { getExportHistoryRecord } = require('../src/main/history/exportHistoryManager');
    const updated = getExportHistoryRecord(record.id, dir);
    assert.ok(updated);
    assert.deepStrictEqual(updated.tags, ['test', 'urgent']);
    assert.strictEqual(updated.note, 'Important export');
  } finally { cleanupTempDir(dir); }
});

test('getExportHistoryRecord supports records without Phase 5F fields', () => {
  const dir = makeTempDir();
  try {
    const record = insertRecord(dir);
    // Simulate a Phase 5E record without tags/note
    const raw = require('../src/main/history/exportHistoryManager').getExportHistoryRecord(record.id, dir);
    // Should not throw when accessing these fields (they might be undefined)
    const tags = raw.tags || [];
    const note = raw.note || null;
    assert.ok(Array.isArray(tags));
    assert.ok(note === null || typeof note === 'string');
  } finally { cleanupTempDir(dir); }
});

test('bulk actions work with mixed statuses', () => {
  const dir = makeTempDir();
  try {
    const r1 = insertRecord(dir, { status: EXPORT_HISTORY_STATUS.COMPLETED });
    const r2 = insertRecord(dir, { status: EXPORT_HISTORY_STATUS.FAILED });
    const r3 = insertRecord(dir, { status: EXPORT_HISTORY_STATUS.COMPLETED });

    const configs = bulkGetExportAgainConfigs([r1.id, r2.id, r3.id], dir);
    assert.strictEqual(configs.filter(c => c.available).length, 2);

    const retries = bulkCanRetry([r1.id, r2.id, r3.id], dir);
    assert.strictEqual(retries.filter(r => r.retryable).length, 1);
  } finally { cleanupTempDir(dir); }
});

test('attempt history chain is consistent', () => {
  const dir = makeTempDir();
  try {
    const original = insertRecord(dir, { status: EXPORT_HISTORY_STATUS.COMPLETED });
    const retry1 = createRetryRecord(original.id, dir);
    const retry2 = createRetryRecord(retry1.id, dir);

    const history = getAttemptHistory(original.attemptGroupId || original.id, dir);
    assert.ok(history.length >= 2, `Expected at least 2 records, got ${history.length}`);
    const withAttempts = history.filter(r => typeof r.attemptNumber === 'number');
    const sorted = withAttempts.sort((a, b) => a.attemptNumber - b.attemptNumber);
    assert.strictEqual(sorted[0].attemptNumber, 2);
    assert.strictEqual(sorted[sorted.length - 1].attemptNumber, 3);
  } finally { cleanupTempDir(dir); }
});

// ─── Edge Cases ────────────────────────────────────────────────────────────
console.log('\n  ── Edge Cases ──');

test('groupRecords handles null groupBy', () => {
  const records = [{ id: '1', createdAt: new Date().toISOString(), profile: {}, exportPreset: {}, variationPreset: {}, exportType: 'reel', planId: 'p1', status: 'completed' }];
  const groups = groupRecords(records, null);
  assert.deepStrictEqual(groups, []);
});

test('groupRecords handles unknown groupBy', () => {
  const records = [{ id: '1', createdAt: new Date().toISOString(), profile: {}, exportPreset: {}, variationPreset: {}, exportType: 'reel', planId: 'p1', status: 'completed' }];
  const groups = groupRecords(records, 'unknown');
  assert.strictEqual(groups.length, 1);
  assert.strictEqual(groups[0].key, 'All');
});

test('exportToCSV handles records with missing fields', () => {
  const records = [{ id: '1' }];
  const csv = exportToCSV(records);
  const lines = csv.split('\n');
  assert.strictEqual(lines.length, 2);
  assert.ok(lines[1].includes('1'));
});

test('getTimeline handles all dates in same bucket', () => {
  const records = [
    { id: '1', createdAt: new Date().toISOString() },
    { id: '2', createdAt: new Date().toISOString() },
  ];
  const timeline = getTimeline(records);
  assert.strictEqual(timeline.length, 1);
  assert.strictEqual(timeline[0].count, 2);
});

test('saved view handles special characters in query', () => {
  const dir = makeTempDir();
  try {
    const view = createSavedView({ name: 'Test', query: { status: 'completed', tag: 'urgent & important' } }, dir);
    const found = getSavedView(view.id, dir);
    assert.deepStrictEqual(found.query, { status: 'completed', tag: 'urgent & important' });
  } finally { cleanupTempDir(dir); }
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n========================================================');
console.log(`  Export History Intelligence Results: ${passed} passed, ${failed} failed`);
console.log('========================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('✅ All Export History Intelligence tests passed!');
}
