'use strict';

const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');

const {
  JOB_VALIDATION_STATUS,
  validateJobConfiguration,
  validateBulkPlan,
  detectOutputConflicts,
  generatePreflightSummary,
  generatePlanSummaryText,
  duplicatePlan,
  exportAgainPlan,
  getQueueAggregateState,
  retryFailedJobs,
  getExecutionSummary,
  createBulkExportPlan,
} = require('../src/main/profiles/exportPlan');

const { createProfile } = require('../src/main/profiles/profileManager');
const { createVariationPreset } = require('../src/main/variations/variationPresetManager');
const { createExportPreset } = require('../src/main/exportPresets/exportPresetManager');
const { createCaptionTemplate } = require('../src/main/captions/captionTemplateManager');

console.log('======================================================');
console.log('Running Bulk Export Intelligence Test Suite (Phase 5D)');
console.log('======================================================');

let passed = 0;
let failed = 0;
const errors = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    process.stdout.write('  PASS: ' + name + '\n');
  } catch (err) {
    failed++;
    errors.push({ name, err });
    process.stdout.write('  FAIL: ' + name + '\n');
    process.stdout.write('         ' + err.message + '\n');
  }
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'reel-bi-'));
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

function createFakeSource(dir) {
  const src = path.join(dir, 'test_video.mp4');
  fs.writeFileSync(src, 'fake video content');
  return src;
}

function createFakeProfile(dir, name, opts = {}) {
  return createProfile({
    name: name || `Profile ${Date.now()}`,
    platform: opts.platform || 'Facebook',
    enabled: opts.enabled !== false,
    variationPreset: opts.variation || { speed: 1.02, saturation: 1.2 },
    exportPresetId: opts.exportPresetId || null,
    captionTemplateId: opts.captionTemplateId || null,
    variationPresetId: opts.variationPresetId || null,
    overrides: opts.overrides || {},
  }, dir);
}

// ─── JOB_VALIDATION_STATUS constants ───────────────────────────────────────────

test('JOB_VALIDATION_STATUS has 3 values', function() {
  const vals = Object.values(JOB_VALIDATION_STATUS);
  assert.strictEqual(vals.length, 3);
  assert.ok(vals.includes('valid'));
  assert.ok(vals.includes('warning'));
  assert.ok(vals.includes('invalid'));
});

// ─── validateJobConfiguration ──────────────────────────────────────────────────

test('validateJobConfiguration returns INVALID for null job', function() {
  const result = validateJobConfiguration(null, '/fake/source.mp4');
  assert.strictEqual(result.status, JOB_VALIDATION_STATUS.INVALID);
  assert.ok(result.errors.length > 0);
});

test('validateJobConfiguration returns VALID for complete job', function() {
  const dir = tmpDir();
  try {
    const src = createFakeSource(dir);
    const result = validateJobConfiguration({
      jobId: 'job_1',
      profileName: 'Test',
      outputPath: path.join(dir, 'output.mp4'),
      variationPreset: { speed: 1.0, saturation: 1.0, hue: 0, pitch: 0, mode: 'center', crop: 0, cleanMetadata: true, enabled: true },
      exportPresetId: 'ep_1',
      captionTemplateId: 'ct_1',
    }, src);
    assert.strictEqual(result.status, JOB_VALIDATION_STATUS.VALID);
    assert.strictEqual(result.errors.length, 0);
  } finally {
    cleanup(dir);
  }
});

test('validateJobConfiguration returns WARNING for missing export preset', function() {
  const dir = tmpDir();
  try {
    const src = createFakeSource(dir);
    const result = validateJobConfiguration({
      jobId: 'job_1',
      profileName: 'Test',
      outputPath: path.join(dir, 'output.mp4'),
      variationPreset: { speed: 1.0 },
    }, src);
    assert.strictEqual(result.status, JOB_VALIDATION_STATUS.WARNING);
    assert.ok(result.warnings.some(w => w.includes('export preset')));
  } finally {
    cleanup(dir);
  }
});

test('validateJobConfiguration returns INVALID for source overwrite', function() {
  const dir = tmpDir();
  try {
    const src = createFakeSource(dir);
    const result = validateJobConfiguration({
      jobId: 'job_1',
      profileName: 'Test',
      outputPath: src,
      variationPreset: { speed: 1.0 },
    }, src);
    assert.strictEqual(result.status, JOB_VALIDATION_STATUS.INVALID);
    assert.ok(result.errors.some(e => e.includes('source file')));
  } finally {
    cleanup(dir);
  }
});

test('validateJobConfiguration returns INVALID for path traversal', function() {
  const dir = tmpDir();
  try {
    const src = createFakeSource(dir);
    // On Windows, path.join normalizes .. away, so we construct a raw traversal path
    const evilPath = dir + path.sep + '..' + path.sep + '..' + path.sep + 'evil_output.mp4';
    const result = validateJobConfiguration({
      jobId: 'job_1',
      profileName: 'Test',
      outputPath: evilPath,
      variationPreset: { speed: 1.0 },
    }, src);
    assert.strictEqual(result.status, JOB_VALIDATION_STATUS.INVALID);
    assert.ok(result.errors.some(e => e.includes('traversal')));
  } finally {
    cleanup(dir);
  }
});

// ─── validateBulkPlan ──────────────────────────────────────────────────────────

test('validateBulkPlan returns error for null plan', function() {
  const result = validateBulkPlan(null);
  assert.strictEqual(result.invalidJobs, 0);
  assert.ok(result.errors.length > 0);
});

test('validateBulkPlan classifies jobs correctly', function() {
  const dir = tmpDir();
  try {
    const src = createFakeSource(dir);
    const plan = {
      sourceFile: src,
      jobs: [
        { jobId: 'j1', profileName: 'Good', outputPath: path.join(dir, 'out1.mp4'), variationPreset: { speed: 1.0 }, exportPresetId: 'ep1', captionTemplateId: 'ct1' },
        { jobId: 'j2', profileName: 'Warn', outputPath: path.join(dir, 'out2.mp4'), variationPreset: { speed: 1.0 } },
        { jobId: 'j3', profileName: 'Bad', outputPath: src, variationPreset: { speed: 1.0 } },
      ],
    };
    const result = validateBulkPlan(plan);
    assert.strictEqual(result.validJobs, 1);
    assert.strictEqual(result.warningJobs, 1);
    assert.strictEqual(result.invalidJobs, 1);
  } finally {
    cleanup(dir);
  }
});

// ─── detectOutputConflicts ─────────────────────────────────────────────────────

test('detectOutputConflicts returns empty for unique outputs', function() {
  const dir = tmpDir();
  try {
    const plan = {
      sourceFile: path.join(dir, 'src.mp4'),
      jobs: [
        { jobId: 'j1', profileName: 'A', outputPath: path.join(dir, 'a.mp4') },
        { jobId: 'j2', profileName: 'B', outputPath: path.join(dir, 'b.mp4') },
      ],
    };
    const result = detectOutputConflicts(plan);
    assert.strictEqual(result.conflicts.length, 0);
    assert.strictEqual(result.duplicateOutputs.length, 0);
  } finally {
    cleanup(dir);
  }
});

test('detectOutputConflicts detects duplicate outputs', function() {
  const dir = tmpDir();
  try {
    const plan = {
      sourceFile: path.join(dir, 'src.mp4'),
      jobs: [
        { jobId: 'j1', profileName: 'A', outputPath: path.join(dir, 'same.mp4') },
        { jobId: 'j2', profileName: 'B', outputPath: path.join(dir, 'same.mp4') },
      ],
    };
    const result = detectOutputConflicts(plan);
    assert.ok(result.conflicts.some(c => c.type === 'duplicate_output'));
    assert.strictEqual(result.duplicateOutputs.length, 1);
  } finally {
    cleanup(dir);
  }
});

test('detectOutputConflicts detects existing files', function() {
  const dir = tmpDir();
  try {
    const existing = path.join(dir, 'existing.mp4');
    fs.writeFileSync(existing, 'data');
    const plan = {
      sourceFile: path.join(dir, 'src.mp4'),
      jobs: [
        { jobId: 'j1', profileName: 'A', outputPath: existing },
      ],
    };
    const result = detectOutputConflicts(plan);
    assert.ok(result.conflicts.some(c => c.type === 'existing_file'));
  } finally {
    cleanup(dir);
  }
});

test('detectOutputConflicts detects source overwrite', function() {
  const dir = tmpDir();
  try {
    const src = createFakeSource(dir);
    const plan = {
      sourceFile: src,
      jobs: [
        { jobId: 'j1', profileName: 'A', outputPath: src },
      ],
    };
    const result = detectOutputConflicts(plan);
    assert.ok(result.conflicts.some(c => c.type === 'source_overwrite'));
  } finally {
    cleanup(dir);
  }
});

test('detectOutputConflicts detects path traversal', function() {
  const dir = tmpDir();
  try {
    // Construct raw path with .. segments that won't be normalized by path.join
    const evilPath = dir + path.sep + '..' + path.sep + 'evil.mp4';
    const plan = {
      sourceFile: path.join(dir, 'src.mp4'),
      jobs: [
        { jobId: 'j1', profileName: 'A', outputPath: evilPath },
      ],
    };
    const result = detectOutputConflicts(plan);
    assert.ok(result.conflicts.some(c => c.type === 'path_traversal'));
  } finally {
    cleanup(dir);
  }
});

// ─── generatePreflightSummary ──────────────────────────────────────────────────

test('generatePreflightSummary returns zeroed summary for null plan', function() {
  const result = generatePreflightSummary(null);
  assert.strictEqual(result.totalProfiles, 0);
  assert.strictEqual(result.totalJobs, 0);
});

test('generatePreflightSummary computes correct statistics', function() {
  const dir = tmpDir();
  try {
    const src = createFakeSource(dir);
    const plan = {
      sourceFile: src,
      exportType: 'reel',
      jobs: [
        { jobId: 'j1', profileName: 'A', outputPath: path.join(dir, 'a.mp4'), variationPreset: { speed: 1.02 }, exportPresetSnapshot: { settings: { resolution: '1080p', aspectRatio: '9:16' } }, captionTemplateId: 'ct1', isOverridden: true },
        { jobId: 'j2', profileName: 'B', outputPath: path.join(dir, 'b.mp4'), variationPreset: { speed: 1.0 }, exportPresetSnapshot: { settings: { resolution: '4K', aspectRatio: '16:9' } } },
      ],
    };
    const result = generatePreflightSummary(plan);
    assert.strictEqual(result.totalProfiles, 2);
    assert.strictEqual(result.totalJobs, 2);
    assert.strictEqual(result.selectedExportType, 'reel');
    assert.strictEqual(result.resolutionDistribution['1080p'], 1);
    assert.strictEqual(result.resolutionDistribution['4K'], 1);
    assert.strictEqual(result.aspectRatioDistribution['9:16'], 1);
    assert.strictEqual(result.aspectRatioDistribution['16:9'], 1);
    assert.strictEqual(result.captionEnabledCount, 1);
    assert.strictEqual(result.variationEnabledCount, 1);
  } finally {
    cleanup(dir);
  }
});

// ─── generatePlanSummaryText ───────────────────────────────────────────────────

test('generatePlanSummaryText returns string summary', function() {
  const dir = tmpDir();
  try {
    const src = createFakeSource(dir);
    const plan = {
      sourceFile: src,
      exportType: 'cut',
      jobs: [
        { jobId: 'j1', profileName: 'A', outputPath: path.join(dir, 'a.mp4'), variationPreset: { speed: 1.0 }, captionTemplateId: 'ct1' },
      ],
    };
    const text = generatePlanSummaryText(plan);
    assert.ok(typeof text === 'string');
    assert.ok(text.includes('1 Profiles'));
    assert.ok(text.includes('1 Export Jobs'));
    assert.ok(text.includes('Captions: 1'));
  } finally {
    cleanup(dir);
  }
});

// ─── duplicatePlan ─────────────────────────────────────────────────────────────

test('duplicatePlan creates independent deep clone', function() {
  const dir = tmpDir();
  try {
    const src = createFakeSource(dir);
    const plan = {
      planId: 'plan_original',
      sourceFile: src,
      exportType: 'cut',
      totalJobs: 1,
      jobs: [
        { jobId: 'j1', profileId: 'p1', profileName: 'A', orderIndex: 1, variationPreset: { speed: 1.02 } },
      ],
    };
    const cloned = duplicatePlan(plan);
    assert.notStrictEqual(cloned.planId, plan.planId);
    assert.strictEqual(cloned.duplicatedFrom, plan.planId);
    assert.strictEqual(cloned.jobs.length, 1);
    assert.notStrictEqual(cloned.jobs[0].jobId, plan.jobs[0].jobId);
    assert.strictEqual(cloned.jobs[0].profileName, 'A');
    assert.strictEqual(cloned.jobs[0].variationPreset.speed, 1.02);

    cloned.jobs[0].variationPreset.speed = 999;
    assert.strictEqual(plan.jobs[0].variationPreset.speed, 1.02);
  } finally {
    cleanup(dir);
  }
});

test('duplicatePlan throws on invalid input', function() {
  assert.throws(() => duplicatePlan(null), /Invalid plan/);
  assert.throws(() => duplicatePlan({}), /Invalid plan/);
});

// ─── exportAgainPlan ───────────────────────────────────────────────────────────

test('exportAgainPlan creates new plan from previous config', function() {
  const dir = tmpDir();
  try {
    const src = createFakeSource(dir);
    const profile = createFakeProfile(dir, 'Test Profile');

    const previousPlan = {
      planId: 'plan_old',
      sourceFile: src,
      exportType: 'cut',
      jobs: [
        { jobId: 'j1', profileId: profile.id, profileName: 'Test Profile', outputPath: path.join(dir, 'old_output.mp4') },
      ],
    };

    const newPlan = exportAgainPlan(previousPlan, dir);
    assert.ok(newPlan.planId);
    assert.notStrictEqual(newPlan.planId, previousPlan.planId);
    assert.strictEqual(newPlan.sourceFile, src);
    assert.strictEqual(newPlan.exportType, 'cut');
    assert.strictEqual(newPlan.jobs.length, 1);
  } finally {
    cleanup(dir);
  }
});

test('exportAgainPlan throws on invalid input', function() {
  assert.throws(() => exportAgainPlan(null), /Invalid previous plan/);
  assert.throws(() => exportAgainPlan({ jobs: [] }), /No valid profiles/);
});

// ─── getQueueAggregateState ────────────────────────────────────────────────────

test('getQueueAggregateState returns zeros for null queue', function() {
  const result = getQueueAggregateState(null);
  assert.strictEqual(result.pending, 0);
  assert.strictEqual(result.processing, 0);
  assert.strictEqual(result.completed, 0);
  assert.strictEqual(result.failed, 0);
  assert.strictEqual(result.cancelled, 0);
  assert.strictEqual(result.total, 0);
});

test('getQueueAggregateState counts statuses correctly', function() {
  const mockQueue = {
    getState: () => ({
      items: [
        { status: 'WAITING' },
        { status: 'WAITING' },
        { status: 'PROCESSING' },
        { status: 'DONE' },
        { status: 'DONE' },
        { status: 'DONE' },
        { status: 'ERROR' },
        { status: 'CANCELLED' },
      ],
      running: true,
      concurrency: 2,
    }),
  };
  const result = getQueueAggregateState(mockQueue);
  assert.strictEqual(result.pending, 2);
  assert.strictEqual(result.processing, 1);
  assert.strictEqual(result.completed, 3);
  assert.strictEqual(result.failed, 1);
  assert.strictEqual(result.cancelled, 1);
  assert.strictEqual(result.total, 8);
  assert.strictEqual(result.running, true);
  assert.strictEqual(result.concurrency, 2);
});

// ─── retryFailedJobs ───────────────────────────────────────────────────────────

test('retryFailedJobs returns 0 for no failures', function() {
  const mockQueue = {
    getState: () => ({
      items: [
        { status: 'WAITING', bulkPlanId: 'plan_1' },
        { status: 'DONE', bulkPlanId: 'plan_1' },
      ],
    }),
    addItems: (items) => items,
    startQueue: () => {},
  };
  const result = retryFailedJobs(mockQueue, 'plan_1');
  assert.strictEqual(result.retriedCount, 0);
  assert.strictEqual(result.success, true);
});

test('retryFailedJobs re-adds only failed items', function() {
  let addedItems = [];
  const mockQueue = {
    getState: () => ({
      items: [
        { status: 'WAITING', bulkPlanId: 'plan_1', bulkJobId: 'j1', profileName: 'A', outputPath: '/a.mp4' },
        { status: 'DONE', bulkPlanId: 'plan_1', bulkJobId: 'j2' },
        { status: 'ERROR', bulkPlanId: 'plan_1', bulkJobId: 'j3', profileName: 'C', outputPath: '/c.mp4', error: 'fail' },
        { status: 'ERROR', bulkPlanId: 'plan_1', bulkJobId: 'j4', profileName: 'D', outputPath: '/d.mp4', error: 'fail2' },
      ],
    }),
    addItems: (items) => { addedItems = items; return items; },
    startQueue: () => {},
  };
  const result = retryFailedJobs(mockQueue, 'plan_1');
  assert.strictEqual(result.retriedCount, 2);
  assert.strictEqual(addedItems.length, 2);
  assert.ok(addedItems[0].retryAttempt >= 1);
  assert.ok(!addedItems[0].error);
});

test('retryFailedJobs throws on missing planId', function() {
  const mockQueue = { getState: () => ({ items: [] }) };
  assert.throws(() => retryFailedJobs(mockQueue, null), /planId is required/);
});

// ─── getExecutionSummary ───────────────────────────────────────────────────────

test('getExecutionSummary returns empty summary for null queue', function() {
  const result = getExecutionSummary(null, 'plan_1');
  assert.strictEqual(result.total, 0);
  assert.strictEqual(result.completed, 0);
  assert.strictEqual(result.failed, 0);
});

test('getExecutionSummary computes correct counts', function() {
  const mockQueue = {
    getState: () => ({
      items: [
        { bulkPlanId: 'plan_1', bulkJobId: 'j1', profileName: 'A', status: 'DONE', outputPath: '/a.mp4' },
        { bulkPlanId: 'plan_1', bulkJobId: 'j2', profileName: 'B', status: 'ERROR', error: 'failed' },
        { bulkPlanId: 'plan_1', bulkJobId: 'j3', profileName: 'C', status: 'CANCELLED' },
        { bulkPlanId: 'plan_other', bulkJobId: 'j4', profileName: 'D', status: 'DONE' },
      ],
    }),
  };
  const result = getExecutionSummary(mockQueue, 'plan_1');
  assert.strictEqual(result.total, 3);
  assert.strictEqual(result.completed, 1);
  assert.strictEqual(result.failed, 1);
  assert.strictEqual(result.cancelled, 1);
  assert.strictEqual(result.skipped, 0);
  assert.strictEqual(result.results.length, 3);
  assert.ok(result.results.some(r => r.profileName === 'A' && r.status === 'DONE'));
  assert.ok(result.results.some(r => r.profileName === 'B' && r.status === 'ERROR'));
});

// ─── Plan creation with intelligent profiles ───────────────────────────────────

test('createBulkExportPlan works with resolved profile configurations', function() {
  const dir = tmpDir();
  try {
    const src = createFakeSource(dir);
    const profile = createFakeProfile(dir, 'Intelligent Profile', {
      variationPreset: { speed: 1.03, saturation: 1.5 },
      overrides: { brightness: 0.2 },
    });

    const plan = createBulkExportPlan({
      sourcePath: src,
      exportType: 'cut',
      profileIds: [profile.id],
    }, dir);

    assert.strictEqual(plan.totalJobs, 1);
    assert.ok(plan.jobs[0].variationPreset);
    assert.strictEqual(plan.jobs[0].profileName, 'Intelligent Profile');
  } finally {
    cleanup(dir);
  }
});

// ─── Cross-profile isolation ───────────────────────────────────────────────────

test('bulk plan jobs have independent snapshots', function() {
  const dir = tmpDir();
  try {
    const src = createFakeSource(dir);
    const vp1 = createVariationPreset({ name: 'VP A', variation: { enabled: true, speed: 1.02, saturation: 1.2 } }, dir);
    const vp2 = createVariationPreset({ name: 'VP B', variation: { enabled: true, speed: 1.04, saturation: 1.5 } }, dir);
    const p1 = createFakeProfile(dir, 'Profile A', { variationPresetId: vp1.id });
    const p2 = createFakeProfile(dir, 'Profile B', { variationPresetId: vp2.id });

    const plan = createBulkExportPlan({
      sourcePath: src,
      exportType: 'cut',
      profileIds: [p1.id, p2.id],
    }, dir);

    assert.strictEqual(plan.jobs.length, 2);
    assert.notStrictEqual(plan.jobs[0].variationPreset.speed, plan.jobs[1].variationPreset.speed);

    plan.jobs[0].variationPreset.speed = 999;
    assert.notStrictEqual(plan.jobs[1].variationPreset.speed, 999);
  } finally {
    cleanup(dir);
  }
});

// ─── Feature gating ────────────────────────────────────────────────────────────

test('BULK_EXPORT_INTELLIGENCE feature key is defined', function() {
  const { FEATURE_KEYS } = require('../src/shared/features');
  assert.strictEqual(FEATURE_KEYS.BULK_EXPORT_INTELLIGENCE, 'bulk_export_intelligence');
});

test('BULK_EXPORT_INTELLIGENCE is in pro tier', function() {
  const { hasFeature } = require('../src/shared/features');
  assert.strictEqual(hasFeature('pro', 'bulk_export_intelligence'), true);
  assert.strictEqual(hasFeature('standard', 'bulk_export_intelligence'), false);
  assert.strictEqual(hasFeature('basic', 'bulk_export_intelligence'), false);
});

test('BULK_EXPORT_INTELLIGENCE has correct metadata', function() {
  const { FEATURE_METADATA } = require('../src/shared/features');
  const meta = FEATURE_METADATA.find(f => f.key === 'bulk_export_intelligence');
  assert.ok(meta);
  assert.strictEqual(meta.name, 'Intelligent Bulk Export');
  assert.strictEqual(meta.minTier, 'pro');
});

// ─── Security ──────────────────────────────────────────────────────────────────

test('validateJobConfiguration rejects prototype pollution in outputPath', function() {
  const result = validateJobConfiguration({
    jobId: 'j1',
    profileName: 'Test',
    outputPath: '/safe/output.mp4',
    variationPreset: { speed: 1.0, __proto__: { polluted: true } },
  }, '/fake/source.mp4');
  assert.ok(!({}).polluted);
});

test('detectOutputConflicts handles empty jobs array', function() {
  const result = detectOutputConflicts({ jobs: [] });
  assert.strictEqual(result.conflicts.length, 0);
  assert.strictEqual(result.duplicateOutputs.length, 0);
});

test('generatePreflightSummary handles empty jobs', function() {
  const result = generatePreflightSummary({ jobs: [], exportType: 'cut' });
  assert.strictEqual(result.totalJobs, 0);
  assert.strictEqual(result.validJobs, 0);
});

// ─── Caption/Variation compatibility ───────────────────────────────────────────

test('bulk plan preserves caption template snapshots per job', function() {
  const dir = tmpDir();
  try {
    const src = createFakeSource(dir);
    const ct = createCaptionTemplate({ name: 'Test CT', overlays: [{ text: 'Hello', position: 'center' }] }, dir);
    const p = createFakeProfile(dir, 'Caption Profile', { captionTemplateId: ct.id });

    const plan = createBulkExportPlan({
      sourcePath: src,
      exportType: 'cut',
      profileIds: [p.id],
    }, dir);

    assert.strictEqual(plan.jobs[0].captionTemplateId, ct.id);
    assert.strictEqual(plan.jobs[0].captionTemplateName, 'Test CT');
    assert.ok(Array.isArray(plan.jobs[0].textOverlays));
    assert.strictEqual(plan.jobs[0].textOverlays[0].text, 'Hello');
  } finally {
    cleanup(dir);
  }
});

test('bulk plan preserves variation preset snapshots per job', function() {
  const dir = tmpDir();
  try {
    const src = createFakeSource(dir);
    const vp = createVariationPreset({ name: 'Test VP', variation: { enabled: true, speed: 1.03, saturation: 1.5 } }, dir);
    const p = createFakeProfile(dir, 'VP Profile', { variationPresetId: vp.id });

    const plan = createBulkExportPlan({
      sourcePath: src,
      exportType: 'cut',
      profileIds: [p.id],
    }, dir);

    assert.ok(plan.jobs[0].variationPreset);
    assert.strictEqual(plan.jobs[0].variationPreset.speed, 1.03);
    assert.strictEqual(plan.jobs[0].variationPreset.saturation, 1.5);
  } finally {
    cleanup(dir);
  }
});

// ─── Results ───────────────────────────────────────────────────────────────────

console.log('\n' + '='.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);
if (errors.length > 0) {
  console.log('\nFailed tests:');
  errors.forEach(({ name, err }) => {
    console.log(`  - ${name}: ${err.message}`);
  });
}
console.log('='.repeat(50));

if (failed > 0) {
  process.exit(1);
}
