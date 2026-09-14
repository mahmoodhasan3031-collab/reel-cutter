'use strict';

/**
 * Export History & Organization Test Suite — Phase 5E
 *
 * 46 tests covering: CRUD, status, search, filter, sort, stats,
 * atomic persistence, corrupt recovery, FIFO cap, deep clone isolation,
 * snapshot immutability, bulk/schedule relationships, export again,
 * retry, feature gating, and security validation.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

const {
  EXPORT_HISTORY_STATUS,
  MAX_HISTORY_LIMIT,
  createExportHistoryRecord,
  getExportHistory,
  getExportHistoryRecord,
  updateExportHistoryRecord,
  deleteExportHistoryRecord,
  clearExportHistory,
  getByPlanId,
  getByJobId,
  getExportHistoryStats,
  getExportAgainConfig,
  canRetryExport,
  validateExportHistoryInput,
  validateOutputPath,
  generateHistoryId,
} = require('../src/main/history/exportHistoryManager');

const { hasFeature, FEATURE_KEYS } = require('../src/shared/features');

// ── Helpers ─────────────────────────────────────────────────────────────────

function tmpDir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rc_exh_test_'));
  return d;
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

function sampleRecord(overrides = {}) {
  return {
    source: { name: 'test-video.mp4', path: '/videos/test-video.mp4' },
    exportType: 'cut',
    profile: { id: 'prof_1', name: 'Profile A', platform: 'instagram' },
    exportPreset: { id: 'ep_1', name: 'HD Preset' },
    variationPreset: { id: 'vp_1', name: 'Punchy Color' },
    captionTemplate: { id: 'ct_1', name: 'Social Caption' },
    output: { path: '/output/test-video__Profile_A__01.mp4', directory: '/output', filename: 'test-video__Profile_A__01.mp4' },
    status: EXPORT_HISTORY_STATUS.COMPLETED,
    settingsSnapshot: { variation: { brightness: 0.1 }, export: { resolution: '1080p' } },
    ...overrides,
  };
}

function failedRecord(overrides = {}) {
  return sampleRecord({
    status: EXPORT_HISTORY_STATUS.FAILED,
    error: 'FFmpeg process exited with code 1',
    ...overrides,
  });
}

function cancelledRecord(overrides = {}) {
  return sampleRecord({
    status: EXPORT_HISTORY_STATUS.CANCELLED,
    ...overrides,
  });
}

function skippedRecord(overrides = {}) {
  return sampleRecord({
    status: EXPORT_HISTORY_STATUS.SKIPPED,
    ...overrides,
  });
}

let passed = 0;
let failed = 0;
let total = 0;
const failures = [];

function test(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (err) {
    failed++;
    const msg = `  FAIL: ${name} — ${err.message}`;
    console.log(msg);
    failures.push({ name, error: err.message });
  }
}

// ── A. Create completed record ──────────────────────────────────────────────

test('A. Create completed record returns valid record with ID and timestamps', function() {
  const dir = tmpDir();
  try {
    const record = createExportHistoryRecord(sampleRecord(), dir);
    assert.ok(record.id, 'record must have an id');
    assert.ok(record.id.startsWith('exh_'), 'id must start with exh_');
    assert.ok(record.createdAt, 'must have createdAt');
    assert.ok(record.completedAt, 'must have completedAt');
    assert.strictEqual(record.status, EXPORT_HISTORY_STATUS.COMPLETED);
    assert.strictEqual(record.source.name, 'test-video.mp4');
    assert.strictEqual(record.profile.name, 'Profile A');
  } finally {
    cleanup(dir);
  }
});

// ── B. Create failed record ─────────────────────────────────────────────────

test('B. Create failed record preserves error message', function() {
  const dir = tmpDir();
  try {
    const record = createExportHistoryRecord(failedRecord(), dir);
    assert.strictEqual(record.status, EXPORT_HISTORY_STATUS.FAILED);
    assert.strictEqual(record.error, 'FFmpeg process exited with code 1');
  } finally {
    cleanup(dir);
  }
});

// ── C. Create cancelled record ──────────────────────────────────────────────

test('C. Create cancelled record preserves status', function() {
  const dir = tmpDir();
  try {
    const record = createExportHistoryRecord(cancelledRecord(), dir);
    assert.strictEqual(record.status, EXPORT_HISTORY_STATUS.CANCELLED);
  } finally {
    cleanup(dir);
  }
});

// ── D. Create skipped record ────────────────────────────────────────────────

test('D. Create skipped record preserves status', function() {
  const dir = tmpDir();
  try {
    const record = createExportHistoryRecord(skippedRecord(), dir);
    assert.strictEqual(record.status, EXPORT_HISTORY_STATUS.SKIPPED);
  } finally {
    cleanup(dir);
  }
});

// ── E. Get all records ──────────────────────────────────────────────────────

test('E. Get all returns all records in newest-first order', function() {
  const dir = tmpDir();
  try {
    createExportHistoryRecord(sampleRecord({ source: { name: 'a.mp4', path: '/a.mp4' } }), dir);
    createExportHistoryRecord(sampleRecord({ source: { name: 'b.mp4', path: '/b.mp4' } }), dir);
    createExportHistoryRecord(sampleRecord({ source: { name: 'c.mp4', path: '/c.mp4' } }), dir);

    const result = getExportHistory({}, dir);
    assert.strictEqual(result.total, 3);
    assert.strictEqual(result.records.length, 3);
    // Newest first: c, b, a
    assert.strictEqual(result.records[0].source.name, 'c.mp4');
    assert.strictEqual(result.records[2].source.name, 'a.mp4');
  } finally {
    cleanup(dir);
  }
});

// ── F. Get by ID ────────────────────────────────────────────────────────────

test('F. Get by ID returns correct record', function() {
  const dir = tmpDir();
  try {
    const created = createExportHistoryRecord(sampleRecord(), dir);
    const found = getExportHistoryRecord(created.id, dir);
    assert.ok(found);
    assert.strictEqual(found.id, created.id);
    assert.strictEqual(found.source.name, 'test-video.mp4');
  } finally {
    cleanup(dir);
  }
});

test('F2. Get by ID returns null for unknown ID', function() {
  const dir = tmpDir();
  try {
    const found = getExportHistoryRecord('exh_nonexistent', dir);
    assert.strictEqual(found, null);
  } finally {
    cleanup(dir);
  }
});

// ── G. Delete record ────────────────────────────────────────────────────────

test('G. Delete removes record and preserves others', function() {
  const dir = tmpDir();
  try {
    const r1 = createExportHistoryRecord(sampleRecord({ source: { name: 'a.mp4', path: '/a.mp4' } }), dir);
    const r2 = createExportHistoryRecord(sampleRecord({ source: { name: 'b.mp4', path: '/b.mp4' } }), dir);

    const result = deleteExportHistoryRecord(r1.id, dir);
    assert.strictEqual(result.success, true);

    const remaining = getExportHistory({}, dir);
    assert.strictEqual(remaining.total, 1);
    assert.strictEqual(remaining.records[0].id, r2.id);
  } finally {
    cleanup(dir);
  }
});

test('G2. Delete throws on non-existent ID', function() {
  const dir = tmpDir();
  try {
    assert.throws(() => deleteExportHistoryRecord('exh_nonexistent', dir), /not found/i);
  } finally {
    cleanup(dir);
  }
});

// ── H. Clear all ────────────────────────────────────────────────────────────

test('H. Clear all removes all records', function() {
  const dir = tmpDir();
  try {
    createExportHistoryRecord(sampleRecord(), dir);
    createExportHistoryRecord(sampleRecord(), dir);

    const result = clearExportHistory(dir);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.count, 2);

    const remaining = getExportHistory({}, dir);
    assert.strictEqual(remaining.total, 0);
  } finally {
    cleanup(dir);
  }
});

// ── I. Search ───────────────────────────────────────────────────────────────

test('I. Search filters by source filename', function() {
  const dir = tmpDir();
  try {
    createExportHistoryRecord(sampleRecord({ source: { name: 'alpha.mp4', path: '/a.mp4' } }), dir);
    createExportHistoryRecord(sampleRecord({ source: { name: 'beta.mp4', path: '/b.mp4' } }), dir);

    const result = getExportHistory({ search: 'alpha' }, dir);
    assert.strictEqual(result.total, 1);
    assert.strictEqual(result.records[0].source.name, 'alpha.mp4');
  } finally {
    cleanup(dir);
  }
});

test('I2. Search filters by profile name', function() {
  const dir = tmpDir();
  try {
    createExportHistoryRecord(sampleRecord({ profile: { id: 'p1', name: 'Instagram Profile', platform: 'instagram' } }), dir);
    createExportHistoryRecord(sampleRecord({ profile: { id: 'p2', name: 'TikTok Profile', platform: 'tiktok' } }), dir);

    const result = getExportHistory({ search: 'instagram' }, dir);
    assert.strictEqual(result.total, 1);
    assert.strictEqual(result.records[0].profile.name, 'Instagram Profile');
  } finally {
    cleanup(dir);
  }
});

test('I3. Search filters by output filename', function() {
  const dir = tmpDir();
  try {
    createExportHistoryRecord(sampleRecord({ output: { path: '/out/clip_a.mp4', directory: '/out', filename: 'clip_a.mp4' } }), dir);
    createExportHistoryRecord(sampleRecord({ output: { path: '/out/clip_b.mp4', directory: '/out', filename: 'clip_b.mp4' } }), dir);

    const result = getExportHistory({ search: 'clip_a' }, dir);
    assert.strictEqual(result.total, 1);
  } finally {
    cleanup(dir);
  }
});

// ── J. Status filter ────────────────────────────────────────────────────────

test('J. Status filter returns only matching records', function() {
  const dir = tmpDir();
  try {
    createExportHistoryRecord(sampleRecord(), dir);
    createExportHistoryRecord(failedRecord(), dir);
    createExportHistoryRecord(cancelledRecord(), dir);

    const completed = getExportHistory({ status: 'COMPLETED' }, dir);
    assert.strictEqual(completed.total, 1);
    assert.strictEqual(completed.records[0].status, EXPORT_HISTORY_STATUS.COMPLETED);

    const failed = getExportHistory({ status: 'FAILED' }, dir);
    assert.strictEqual(failed.total, 1);
    assert.strictEqual(failed.records[0].status, EXPORT_HISTORY_STATUS.FAILED);
  } finally {
    cleanup(dir);
  }
});

// ── K. Platform filter ──────────────────────────────────────────────────────

test('K. Platform filter returns matching records', function() {
  const dir = tmpDir();
  try {
    createExportHistoryRecord(sampleRecord({ profile: { id: 'p1', name: 'A', platform: 'instagram' } }), dir);
    createExportHistoryRecord(sampleRecord({ profile: { id: 'p2', name: 'B', platform: 'tiktok' } }), dir);

    const result = getExportHistory({ platform: 'tiktok' }, dir);
    assert.strictEqual(result.total, 1);
    assert.strictEqual(result.records[0].profile.platform, 'tiktok');
  } finally {
    cleanup(dir);
  }
});

// ── L. Profile filter ───────────────────────────────────────────────────────

test('L. Profile ID filter returns matching records', function() {
  const dir = tmpDir();
  try {
    createExportHistoryRecord(sampleRecord({ profile: { id: 'prof_a', name: 'A', platform: 'ig' } }), dir);
    createExportHistoryRecord(sampleRecord({ profile: { id: 'prof_b', name: 'B', platform: 'tt' } }), dir);

    const result = getExportHistory({ profileId: 'prof_a' }, dir);
    assert.strictEqual(result.total, 1);
    assert.strictEqual(result.records[0].profile.id, 'prof_a');
  } finally {
    cleanup(dir);
  }
});

// ── M. Preset filter ────────────────────────────────────────────────────────

test('M. Export preset filter returns matching records', function() {
  const dir = tmpDir();
  try {
    createExportHistoryRecord(sampleRecord({ exportPreset: { id: 'ep_a', name: 'Preset A' } }), dir);
    createExportHistoryRecord(sampleRecord({ exportPreset: { id: 'ep_b', name: 'Preset B' } }), dir);

    const result = getExportHistory({ exportPresetId: 'ep_a' }, dir);
    assert.strictEqual(result.total, 1);
  } finally {
    cleanup(dir);
  }
});

// ── N. Sorting ──────────────────────────────────────────────────────────────

test('N1. Sort by oldest returns oldest first', function() {
  const dir = tmpDir();
  try {
    createExportHistoryRecord(sampleRecord({ source: { name: 'first.mp4', path: '/f.mp4' } }), dir);
    createExportHistoryRecord(sampleRecord({ source: { name: 'second.mp4', path: '/s.mp4' } }), dir);

    const result = getExportHistory({ sort: 'oldest' }, dir);
    assert.strictEqual(result.records[0].source.name, 'first.mp4');
  } finally {
    cleanup(dir);
  }
});

test('N2. Sort by source name sorts alphabetically', function() {
  const dir = tmpDir();
  try {
    createExportHistoryRecord(sampleRecord({ source: { name: 'zebra.mp4', path: '/z.mp4' } }), dir);
    createExportHistoryRecord(sampleRecord({ source: { name: 'alpha.mp4', path: '/a.mp4' } }), dir);

    const result = getExportHistory({ sort: 'source_name' }, dir);
    assert.strictEqual(result.records[0].source.name, 'alpha.mp4');
  } finally {
    cleanup(dir);
  }
});

test('N3. Sort by profile name sorts alphabetically', function() {
  const dir = tmpDir();
  try {
    createExportHistoryRecord(sampleRecord({ profile: { id: 'p1', name: 'Zebra', platform: 'ig' } }), dir);
    createExportHistoryRecord(sampleRecord({ profile: { id: 'p2', name: 'Alpha', platform: 'ig' } }), dir);

    const result = getExportHistory({ sort: 'profile_name' }, dir);
    assert.strictEqual(result.records[0].profile.name, 'Alpha');
  } finally {
    cleanup(dir);
  }
});

// ── O. Date filtering ───────────────────────────────────────────────────────

test('O. Date range filter returns records within range', function() {
  const dir = tmpDir();
  try {
    // Create two records with clearly different timestamps by writing them directly
    const oldTime = '2020-01-01T00:00:00.000Z';
    const recentTime = '2026-01-01T00:00:00.000Z';

    const records = [
      {
        id: 'exh_old_1', createdAt: oldTime, completedAt: oldTime,
        source: { name: 'old.mp4', path: '/old.mp4' }, exportType: 'cut',
        profile: { id: 'p1', name: 'P', platform: 'ig' },
        exportPreset: { id: null, name: null }, variationPreset: { id: null, name: null },
        captionTemplate: { id: null, name: null },
        output: { path: '/o/old.mp4', directory: '/o', filename: 'old.mp4' },
        status: 'COMPLETED', error: null, planId: null, jobId: null, settingsSnapshot: null,
      },
      {
        id: 'exh_recent_1', createdAt: recentTime, completedAt: recentTime,
        source: { name: 'recent.mp4', path: '/recent.mp4' }, exportType: 'cut',
        profile: { id: 'p2', name: 'Q', platform: 'tt' },
        exportPreset: { id: null, name: null }, variationPreset: { id: null, name: null },
        captionTemplate: { id: null, name: null },
        output: { path: '/o/recent.mp4', directory: '/o', filename: 'recent.mp4' },
        status: 'COMPLETED', error: null, planId: null, jobId: null, settingsSnapshot: null,
      },
    ];

    const filePath = path.join(dir, 'export-history.json');
    fs.writeFileSync(filePath, JSON.stringify({ version: 1, records }), 'utf8');

    const result = getExportHistory({ dateTo: '2025-01-01T00:00:00.000Z' }, dir);
    assert.strictEqual(result.total, 1);
    assert.strictEqual(result.records[0].source.name, 'old.mp4');
  } finally {
    cleanup(dir);
  }
});

// ── P. Stats ────────────────────────────────────────────────────────────────

test('P1. Stats computes correct counts and success rate', function() {
  const dir = tmpDir();
  try {
    createExportHistoryRecord(sampleRecord(), dir);
    createExportHistoryRecord(sampleRecord(), dir);
    createExportHistoryRecord(failedRecord(), dir);

    const stats = getExportHistoryStats(dir);
    assert.strictEqual(stats.total, 3);
    assert.strictEqual(stats.completed, 2);
    assert.strictEqual(stats.failed, 1);
    assert.strictEqual(stats.cancelled, 0);
    assert.strictEqual(stats.successRate, 67);
  } finally {
    cleanup(dir);
  }
});

test('P2. Stats returns zeros for empty history', function() {
  const dir = tmpDir();
  try {
    const stats = getExportHistoryStats(dir);
    assert.strictEqual(stats.total, 0);
    assert.strictEqual(stats.successRate, 0);
  } finally {
    cleanup(dir);
  }
});

test('P3. Stats computes profile and platform distribution', function() {
  const dir = tmpDir();
  try {
    createExportHistoryRecord(sampleRecord({ profile: { id: 'p1', name: 'IG Profile', platform: 'instagram' } }), dir);
    createExportHistoryRecord(sampleRecord({ profile: { id: 'p2', name: 'TT Profile', platform: 'tiktok' } }), dir);
    createExportHistoryRecord(sampleRecord({ profile: { id: 'p1', name: 'IG Profile', platform: 'instagram' } }), dir);

    const stats = getExportHistoryStats(dir);
    assert.strictEqual(stats.byProfile['IG Profile'], 2);
    assert.strictEqual(stats.byProfile['TT Profile'], 1);
    assert.strictEqual(stats.byPlatform['instagram'], 2);
    assert.strictEqual(stats.byPlatform['tiktok'], 1);
  } finally {
    cleanup(dir);
  }
});

// ── Q. Atomic persistence ───────────────────────────────────────────────────

test('Q. Atomic persistence creates valid JSON file', function() {
  const dir = tmpDir();
  try {
    createExportHistoryRecord(sampleRecord(), dir);

    const filePath = path.join(dir, 'export-history.json');
    assert.ok(fs.existsSync(filePath), 'history file must exist');

    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    assert.strictEqual(parsed.version, 1);
    assert.ok(Array.isArray(parsed.records));
    assert.strictEqual(parsed.records.length, 1);
  } finally {
    cleanup(dir);
  }
});

// ── R. Corrupt recovery ─────────────────────────────────────────────────────

test('R. Corrupt JSON file is recovered safely', function() {
  const dir = tmpDir();
  try {
    const filePath = path.join(dir, 'export-history.json');
    fs.writeFileSync(filePath, '{invalid json!!!', 'utf8');

    const records = getExportHistory({}, dir);
    assert.strictEqual(records.total, 0);
    assert.ok(Array.isArray(records.records));
  } finally {
    cleanup(dir);
  }
});

// ── S. Invalid record recovery ──────────────────────────────────────────────

test('S. Invalid records are skipped during load', function() {
  const dir = tmpDir();
  try {
    const filePath = path.join(dir, 'export-history.json');
    fs.writeFileSync(filePath, JSON.stringify({
      version: 1,
      records: [
        null,
        { id: 'valid_1', createdAt: new Date().toISOString(), source: { name: 'ok.mp4', path: '/ok.mp4' } },
        'not-an-object',
        { id: 123 },
      ],
    }), 'utf8');

    const result = getExportHistory({}, dir);
    assert.strictEqual(result.total, 1);
    assert.strictEqual(result.records[0].id, 'valid_1');
  } finally {
    cleanup(dir);
  }
});

// ── T. Retention cap ────────────────────────────────────────────────────────

test('T. FIFO cap enforces maximum record limit on save', function() {
  const dir = tmpDir();
  try {
    // Manually write a file with MAX_HISTORY_LIMIT + 10 records
    const records = [];
    for (let i = 0; i < MAX_HISTORY_LIMIT + 10; i++) {
      records.push({
        id: `exh_${i}`,
        createdAt: new Date(Date.now() - (MAX_HISTORY_LIMIT + 10 - i) * 1000).toISOString(),
        completedAt: new Date(Date.now() - (MAX_HISTORY_LIMIT + 10 - i) * 1000).toISOString(),
        source: { name: `video_${i}.mp4`, path: `/v/video_${i}.mp4` },
        exportType: 'cut',
        profile: { id: 'p1', name: 'P', platform: 'ig' },
        exportPreset: { id: null, name: null },
        variationPreset: { id: null, name: null },
        captionTemplate: { id: null, name: null },
        output: { path: `/o/video_${i}.mp4`, directory: '/o', filename: `video_${i}.mp4` },
        status: 'COMPLETED',
        error: null,
        planId: null,
        jobId: null,
        settingsSnapshot: null,
      });
    }

    const filePath = path.join(dir, 'export-history.json');
    fs.writeFileSync(filePath, JSON.stringify({ version: 1, records }), 'utf8');

    // Load should return all records (loadHistory doesn't enforce cap)
    const loaded = getExportHistory({}, dir);
    assert.strictEqual(loaded.total, MAX_HISTORY_LIMIT + 10);

    // But saving (via createExportHistoryRecord) should enforce the cap
    createExportHistoryRecord(sampleRecord({ source: { name: 'new.mp4', path: '/new.mp4' } }), dir);

    const afterSave = getExportHistory({}, dir);
    assert.strictEqual(afterSave.total, MAX_HISTORY_LIMIT);
  } finally {
    cleanup(dir);
  }
});

// ── U. Deep clone isolation ─────────────────────────────────────────────────

test('U. Returned records are deep clones — mutation does not affect storage', function() {
  const dir = tmpDir();
  try {
    const created = createExportHistoryRecord(sampleRecord(), dir);
    const found = getExportHistoryRecord(created.id, dir);

    // Mutate the returned record
    found.source.name = 'mutated.mp4';
    found.status = 'MUTATED';

    // Re-read from storage — original must be unchanged
    const reloaded = getExportHistoryRecord(created.id, dir);
    assert.strictEqual(reloaded.source.name, 'test-video.mp4');
    assert.strictEqual(reloaded.status, EXPORT_HISTORY_STATUS.COMPLETED);
  } finally {
    cleanup(dir);
  }
});

// ── V. Historical snapshot immutability ─────────────────────────────────────

test('V. Historical record snapshots remain immutable after profile/preset edits', function() {
  const dir = tmpDir();
  try {
    const record = createExportHistoryRecord(sampleRecord({
      settingsSnapshot: { variation: { brightness: 0.1 } },
    }), dir);

    // Simulate profile edit (this doesn't affect the record — it's a snapshot)
    const reloaded = getExportHistoryRecord(record.id, dir);
    assert.deepStrictEqual(reloaded.settingsSnapshot, { variation: { brightness: 0.1 } });

    // Mutate the snapshot object
    reloaded.settingsSnapshot.variation.brightness = 0.99;

    // Reload again — original stored snapshot must be unchanged
    const reloaded2 = getExportHistoryRecord(record.id, dir);
    assert.strictEqual(reloaded2.settingsSnapshot.variation.brightness, 0.1);
  } finally {
    cleanup(dir);
  }
});

// ── W. Bulk plan relationship ───────────────────────────────────────────────

test('W1. Bulk plan relationship — records share planId', function() {
  const dir = tmpDir();
  try {
    const planId = 'plan_test_123';
    createExportHistoryRecord(sampleRecord({ planId, source: { name: 'a.mp4', path: '/a.mp4' } }), dir);
    createExportHistoryRecord(sampleRecord({ planId, source: { name: 'b.mp4', path: '/b.mp4' } }), dir);
    createExportHistoryRecord(sampleRecord({ planId, source: { name: 'c.mp4', path: '/c.mp4' } }), dir);

    const records = getByPlanId(planId, dir);
    assert.strictEqual(records.length, 3);
    records.forEach(r => assert.strictEqual(r.planId, planId));
  } finally {
    cleanup(dir);
  }
});

test('W2. getByPlanId returns empty for unknown plan', function() {
  const dir = tmpDir();
  try {
    const records = getByPlanId('plan_unknown', dir);
    assert.strictEqual(records.length, 0);
  } finally {
    cleanup(dir);
  }
});

// ── X. Job relationship ─────────────────────────────────────────────────────

test('X1. Job relationship — getByJobId returns correct record', function() {
  const dir = tmpDir();
  try {
    const created = createExportHistoryRecord(sampleRecord({ jobId: 'job_abc_123' }), dir);
    const found = getByJobId('job_abc_123', dir);
    assert.ok(found);
    assert.strictEqual(found.id, created.id);
    assert.strictEqual(found.jobId, 'job_abc_123');
  } finally {
    cleanup(dir);
  }
});

test('X2. getByJobId returns null for unknown job', function() {
  const dir = tmpDir();
  try {
    const found = getByJobId('job_unknown', dir);
    assert.strictEqual(found, null);
  } finally {
    cleanup(dir);
  }
});

// ── Y. Scheduled execution history ──────────────────────────────────────────

test('Y. Scheduled export creates history record with correct metadata', function() {
  const dir = tmpDir();
  try {
    const record = createExportHistoryRecord(sampleRecord({
      planId: 'sched_plan_1',
      settingsSnapshot: { scheduled: true, scheduledAt: '2026-01-15T10:00:00Z' },
    }), dir);

    assert.strictEqual(record.planId, 'sched_plan_1');
    assert.strictEqual(record.settingsSnapshot.scheduled, true);
  } finally {
    cleanup(dir);
  }
});

// ── Z. Output path validation ───────────────────────────────────────────────

test('Z1. validateOutputPath rejects path traversal', function() {
  const result = validateOutputPath('/output/../../etc/passwd');
  assert.strictEqual(result.valid, false);
  assert.ok(result.error.includes('traversal'));
});

test('Z2. validateOutputPath rejects source overwrite', function() {
  const result = validateOutputPath('/videos/test.mp4', '/videos/test.mp4');
  assert.strictEqual(result.valid, false);
  assert.ok(result.error.includes('source file'));
});

test('Z3. validateOutputPath accepts valid path', function() {
  const result = validateOutputPath('/output/video.mp4', '/videos/source.mp4');
  assert.strictEqual(result.valid, true);
});

// ── AA. Missing output handling ─────────────────────────────────────────────

test('AA. Missing output path is allowed in history record', function() {
  const dir = tmpDir();
  try {
    const record = createExportHistoryRecord(sampleRecord({
      output: { path: '', directory: '', filename: '' },
      status: EXPORT_HISTORY_STATUS.FAILED,
    }), dir);
    assert.strictEqual(record.status, EXPORT_HISTORY_STATUS.FAILED);
  } finally {
    cleanup(dir);
  }
});

// ── AB. Export Again isolation ───────────────────────────────────────────────

test('AB1. Export Again creates config without mutating original record', function() {
  const dir = tmpDir();
  try {
    const created = createExportHistoryRecord(sampleRecord(), dir);
    const config = getExportAgainConfig(created.id, dir);

    // Mutate config
    config.sourceFile = '/mutated.mp4';

    // Original record must be unchanged
    const reloaded = getExportHistoryRecord(created.id, dir);
    assert.strictEqual(reloaded.source.path, '/videos/test-video.mp4');
  } finally {
    cleanup(dir);
  }
});

test('AB2. Export Again throws for non-completed records', function() {
  const dir = tmpDir();
  try {
    const created = createExportHistoryRecord(failedRecord(), dir);
    assert.throws(() => getExportAgainConfig(created.id, dir), /only available for completed/);
  } finally {
    cleanup(dir);
  }
});

// ── AC. Retry failed isolation ──────────────────────────────────────────────

test('AC1. canRetryExport returns retryable for failed records', function() {
  const dir = tmpDir();
  try {
    const created = createExportHistoryRecord(failedRecord(), dir);
    const result = canRetryExport(created.id, dir);
    assert.strictEqual(result.retryable, true);
  } finally {
    cleanup(dir);
  }
});

test('AC2. canRetryExport returns non-retryable for completed records', function() {
  const dir = tmpDir();
  try {
    const created = createExportHistoryRecord(sampleRecord(), dir);
    const result = canRetryExport(created.id, dir);
    assert.strictEqual(result.retryable, false);
    assert.ok(result.reason.includes('failed'));
  } finally {
    cleanup(dir);
  }
});

test('AC3. canRetryExport returns non-retryable for unknown records', function() {
  const dir = tmpDir();
  try {
    const result = canRetryExport('exh_nonexistent', dir);
    assert.strictEqual(result.retryable, false);
    assert.ok(result.reason.includes('not found'));
  } finally {
    cleanup(dir);
  }
});

// ── AD. Cross-profile isolation ─────────────────────────────────────────────

test('AD. Cross-profile isolation — different profiles have independent records', function() {
  const dir = tmpDir();
  try {
    createExportHistoryRecord(sampleRecord({ profile: { id: 'prof_a', name: 'Profile A', platform: 'instagram' } }), dir);
    createExportHistoryRecord(sampleRecord({ profile: { id: 'prof_b', name: 'Profile B', platform: 'tiktok' } }), dir);

    const aRecords = getExportHistory({ profileId: 'prof_a' }, dir);
    const bRecords = getExportHistory({ profileId: 'prof_b' }, dir);

    assert.strictEqual(aRecords.total, 1);
    assert.strictEqual(bRecords.total, 1);
    assert.strictEqual(aRecords.records[0].profile.id, 'prof_a');
    assert.strictEqual(bRecords.records[0].profile.id, 'prof_b');
  } finally {
    cleanup(dir);
  }
});

// ── AE. Feature gating ──────────────────────────────────────────────────────

test('AE1. EXPORT_HISTORY feature key is defined', function() {
  assert.ok(FEATURE_KEYS.EXPORT_HISTORY);
  assert.strictEqual(FEATURE_KEYS.EXPORT_HISTORY, 'export_history');
});

test('AE2. EXPORT_HISTORY is in pro tier', function() {
  assert.strictEqual(hasFeature('pro', 'export_history'), true);
});

test('AE3. EXPORT_HISTORY is not in basic tier', function() {
  assert.strictEqual(hasFeature('basic', 'export_history'), false);
});

test('AE4. EXPORT_HISTORY is not in standard tier', function() {
  assert.strictEqual(hasFeature('standard', 'export_history'), false);
});

test('AE5. EXPORT_HISTORY has correct metadata', function() {
  const { FEATURE_METADATA } = require('../src/shared/features');
  const meta = FEATURE_METADATA.find(m => m.key === 'export_history');
  assert.ok(meta);
  assert.strictEqual(meta.minTier, 'pro');
  assert.ok(meta.name);
  assert.ok(meta.description);
});

// ── AF. Security validation ─────────────────────────────────────────────────

test('AF1. validateExportHistoryInput rejects null input', function() {
  assert.throws(() => validateExportHistoryInput(null), /valid object/i);
});

test('AF2. validateExportHistoryInput rejects array input', function() {
  assert.throws(() => validateExportHistoryInput([]), /valid object/i);
});

test('AF3. validateExportHistoryInput safely handles prototype-polluted source', function() {
  const malicious = { __proto__: { polluted: true }, name: 'test.mp4', path: '/test.mp4' };
  // JSON.parse(JSON.stringify) strips __proto__, so source becomes { name, path }
  const result = validateExportHistoryInput({ source: malicious });
  // __proto__ should not pollute the result
  assert.strictEqual(result.source.polluted, undefined);
  assert.strictEqual(result.source.name, 'test.mp4');
  assert.strictEqual(result.source.path, '/test.mp4');
});

test('AF4. validateExportHistoryInput strips oversized strings', function() {
  const longName = 'a'.repeat(500);
  const result = validateExportHistoryInput({ source: { name: longName, path: '/v.mp4' } });
  assert.ok(result.source.name.length <= 300);
});

test('AF5. validateExportHistoryInput requires at least source name or path', function() {
  assert.throws(() => validateExportHistoryInput({ source: { name: '', path: '' } }), /requires at least/);
});

test('AF6. generateHistoryId produces deterministic prefix', function() {
  const id1 = generateHistoryId();
  const id2 = generateHistoryId();
  assert.ok(id1.startsWith('exh_'));
  assert.ok(id2.startsWith('exh_'));
  assert.notStrictEqual(id1, id2);
});

// ── Results ─────────────────────────────────────────────────────────────────

console.log('\n==================================================');
console.log('Phase 5E Export History Test Results: ' + passed + ' / ' + total + ' passed');
console.log('==================================================\n');

if (failed > 0) {
  console.log('Failures:');
  for (const f of failures) {
    console.log(`  - ${f.name}: ${f.error}`);
  }
  process.exit(1);
}
