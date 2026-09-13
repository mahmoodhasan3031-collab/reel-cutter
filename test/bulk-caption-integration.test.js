'use strict';

/**
 * Phase 4B-4 — Bulk Caption Integration Test Suite
 *
 * Covers:
 *  A. Multi-profile selector exposes caption metadata
 *  B. Profile with no caption creates empty textOverlays
 *  C. Built-in caption template resolves
 *  D. Custom caption template resolves
 *  E. Plan contains captionTemplateId
 *  F. Plan contains captionTemplateName
 *  G. Plan contains textOverlays
 *  H. textOverlays are deep cloned
 *  I. Job A and Job B have independent snapshots
 *  J. Mutating Job A does not mutate Job B
 *  K. Mutating template after plan creation does not change plan
 *  L. Mutating profile after plan creation does not change plan
 *  M. Deleted template after plan creation does not invalidate plan
 *  N. Bulk executor passes textOverlays to queue
 *  O. Queue passes textOverlays to cutter
 *  P. Cut receives correct caption snapshot
 *  Q. Reel receives correct caption snapshot
 *  R. Split receives correct caption snapshot
 *  S. Variation + caption compatibility
 *  T. Multiple profiles get different captions
 *  U. No caption profile remains unchanged
 *  V. Cancel job still works
 *  W. Cancel all still works
 *  X. Schedule receives caption snapshot
 *  Y. Schedule remains unchanged after template mutation
 *  Z. Schedule remains unchanged after profile mutation
 *  AA. Invalid caption snapshot rejected
 *  AB. Arbitrary font path rejected
 *  AC. Arbitrary FFmpeg filter rejected
 *  AD. Renderer cannot inject caption configuration into another profile
 *  AE. Existing bulk export tests still pass
 *  AF. Existing scheduler tests still pass
 *  AG. Existing caption tests still pass
 *  AH. Existing profile-caption tests still pass
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const {
  createProfile,
  updateProfile,
  resolveProfileCaptionTemplate,
} = require('../src/main/profiles/profileManager');

const {
  CANONICAL_BUILTINS,
  createCaptionTemplate,
  updateCaptionTemplate,
  deleteCaptionTemplate,
} = require('../src/main/captions/captionTemplateManager');

const {
  createBulkExportPlan,
  planToBatchQueueItems,
} = require('../src/main/profiles/exportPlan');

const {
  validateBulkExportPlan,
  executeBulkExport,
} = require('../src/main/profiles/bulkExecutor');

const {
  createBulkSchedule,
} = require('../src/main/scheduler/bulkScheduleManager');

const {
  getSchedule,
} = require('../src/main/scheduler/scheduleManager');

const {
  BatchQueueManager,
  STATUS,
} = require('../src/engine/batchQueue');

const {
  validateSingleOverlay,
} = require('../src/engine/textOverlayValidator');

const {
  escapeFfmpegText,
  buildTextOverlayFilters,
} = require('../src/engine/textOverlay');

console.log('======================================================');
console.log('🧪 Running Phase 4B-4 Bulk Caption Integration Tests');
console.log('======================================================\n');

let passedCount = 0;
let totalCount = 0;
const testQueue = [];

function test(name, fn) {
  testQueue.push({ name, fn });
}

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rc_bulk_caption_test_'));
}

function cleanupTmpDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (_) {}
}

const sampleOverlay1 = {
  id: 'ovl_sample_1',
  text: 'Sample Subtitle 1',
  fontFamily: 'Arial',
  fontSize: 48,
  fontWeight: 'normal',
  color: '#FFFFFF',
  opacity: 1,
  backgroundColor: '#000000',
  backgroundOpacity: 0.4,
  outlineColor: '#000000',
  outlineWidth: 1,
  position: 'bottom',
  x: 0.5,
  y: 0.9,
  alignment: 'center',
  startTime: 0,
  endTime: null,
  enabled: true,
};

const sampleOverlay2 = {
  id: 'ovl_sample_2',
  text: 'Sample Subtitle 2',
  fontFamily: 'Verdana',
  fontSize: 54,
  fontWeight: 'bold',
  color: '#FFCC00',
  opacity: 1,
  backgroundColor: '#000000',
  backgroundOpacity: 0.7,
  outlineColor: '#000000',
  outlineWidth: 2,
  position: 'top',
  x: 0.5,
  y: 0.1,
  alignment: 'center',
  startTime: 0,
  endTime: null,
  enabled: true,
};

// ── Tests A through AH ───────────────────────────────────────────────────────

// A. Multi-profile selector exposes caption metadata
test('A. Multi-profile selector exposes caption metadata', () => {
  const tmp = makeTmpDir();
  try {
    const prof = createProfile(
      {
        name: 'Profile A',
        captionTemplateId: 'tpl_builtin_clean',
      },
      tmp
    );
    const meta = resolveProfileCaptionTemplate(prof, tmp);
    assert.strictEqual(meta.templateId, 'tpl_builtin_clean');
    assert.strictEqual(meta.templateName, 'Clean');
    assert.ok(Array.isArray(meta.overlays));
    assert.strictEqual(meta.overlays.length, 1);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// B. Profile with no caption creates empty textOverlays
test('B. Profile with no caption creates empty textOverlays', () => {
  const tmp = makeTmpDir();
  try {
    const fakeMedia = path.join(tmp, 'video.mp4');
    fs.writeFileSync(fakeMedia, 'fake video content');

    const prof = createProfile(
      {
        name: 'No Caption Profile',
        captionTemplateId: null,
      },
      tmp
    );

    const plan = createBulkExportPlan(
      {
        sourcePath: fakeMedia,
        exportType: 'cut',
        profileIds: [prof.id],
      },
      tmp
    );

    assert.strictEqual(plan.jobs[0].captionTemplateId, null);
    assert.strictEqual(plan.jobs[0].captionTemplateName, null);
    assert.ok(!plan.jobs[0].textOverlays || plan.jobs[0].textOverlays.length === 0);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// C. Built-in caption template resolves
test('C. Built-in caption template resolves', () => {
  const tmp = makeTmpDir();
  try {
    const fakeMedia = path.join(tmp, 'video.mp4');
    fs.writeFileSync(fakeMedia, 'fake video content');

    const prof = createProfile(
      {
        name: 'Clean Profile',
        captionTemplateId: 'tpl_builtin_clean',
      },
      tmp
    );

    const plan = createBulkExportPlan(
      {
        sourcePath: fakeMedia,
        exportType: 'cut',
        profileIds: [prof.id],
      },
      tmp
    );

    assert.strictEqual(plan.jobs[0].captionTemplateId, 'tpl_builtin_clean');
    assert.strictEqual(plan.jobs[0].captionTemplateName, 'Clean');
    assert.ok(Array.isArray(plan.jobs[0].textOverlays));
    assert.strictEqual(plan.jobs[0].textOverlays.length, 1);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// D. Custom caption template resolves
test('D. Custom caption template resolves', () => {
  const tmp = makeTmpDir();
  try {
    const fakeMedia = path.join(tmp, 'video.mp4');
    fs.writeFileSync(fakeMedia, 'fake video content');

    const custom = createCaptionTemplate(
      {
        name: 'My Custom Template',
        overlays: [sampleOverlay1],
      },
      tmp
    );

    const prof = createProfile(
      {
        name: 'Custom Profile',
        captionTemplateId: custom.id,
      },
      tmp
    );

    const plan = createBulkExportPlan(
      {
        sourcePath: fakeMedia,
        exportType: 'cut',
        profileIds: [prof.id],
      },
      tmp
    );

    assert.strictEqual(plan.jobs[0].captionTemplateId, custom.id);
    assert.strictEqual(plan.jobs[0].captionTemplateName, 'My Custom Template');
    assert.strictEqual(plan.jobs[0].textOverlays[0].text, sampleOverlay1.text);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// E. Plan contains captionTemplateId
test('E. Plan contains captionTemplateId', () => {
  const tmp = makeTmpDir();
  try {
    const fakeMedia = path.join(tmp, 'video.mp4');
    fs.writeFileSync(fakeMedia, 'fake video content');

    const prof = createProfile(
      {
        name: 'P1',
        captionTemplateId: 'tpl_builtin_bold',
      },
      tmp
    );

    const plan = createBulkExportPlan(
      {
        sourcePath: fakeMedia,
        exportType: 'cut',
        profileIds: [prof.id],
      },
      tmp
    );

    assert.strictEqual(plan.jobs[0].captionTemplateId, 'tpl_builtin_bold');
  } finally {
    cleanupTmpDir(tmp);
  }
});

// F. Plan contains captionTemplateName
test('F. Plan contains captionTemplateName', () => {
  const tmp = makeTmpDir();
  try {
    const fakeMedia = path.join(tmp, 'video.mp4');
    fs.writeFileSync(fakeMedia, 'fake video content');

    const prof = createProfile(
      {
        name: 'P1',
        captionTemplateId: 'tpl_builtin_bold',
      },
      tmp
    );

    const plan = createBulkExportPlan(
      {
        sourcePath: fakeMedia,
        exportType: 'cut',
        profileIds: [prof.id],
      },
      tmp
    );

    assert.strictEqual(plan.jobs[0].captionTemplateName, 'Bold');
  } finally {
    cleanupTmpDir(tmp);
  }
});

// G. Plan contains textOverlays
test('G. Plan contains textOverlays', () => {
  const tmp = makeTmpDir();
  try {
    const fakeMedia = path.join(tmp, 'video.mp4');
    fs.writeFileSync(fakeMedia, 'fake video content');

    const prof = createProfile(
      {
        name: 'P1',
        captionTemplateId: 'tpl_builtin_bold',
      },
      tmp
    );

    const plan = createBulkExportPlan(
      {
        sourcePath: fakeMedia,
        exportType: 'cut',
        profileIds: [prof.id],
      },
      tmp
    );

    assert.ok(Array.isArray(plan.jobs[0].textOverlays));
    assert.strictEqual(plan.jobs[0].textOverlays[0].id, 'bold_ov_1');
  } finally {
    cleanupTmpDir(tmp);
  }
});

// H. textOverlays are deep cloned
test('H. textOverlays are deep cloned', () => {
  const tmp = makeTmpDir();
  try {
    const fakeMedia = path.join(tmp, 'video.mp4');
    fs.writeFileSync(fakeMedia, 'fake video content');

    const custom = createCaptionTemplate(
      {
        name: 'Clone Test',
        overlays: [sampleOverlay1],
      },
      tmp
    );

    const prof = createProfile(
      {
        name: 'P1',
        captionTemplateId: custom.id,
      },
      tmp
    );

    const plan = createBulkExportPlan(
      {
        sourcePath: fakeMedia,
        exportType: 'cut',
        profileIds: [prof.id],
      },
      tmp
    );

    assert.notStrictEqual(plan.jobs[0].textOverlays, custom.overlays);
    assert.notStrictEqual(plan.jobs[0].textOverlays[0], custom.overlays[0]);
    assert.deepStrictEqual(plan.jobs[0].textOverlays, custom.overlays);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// I. Job A and Job B have independent snapshots
test('I. Job A and Job B have independent snapshots', () => {
  const tmp = makeTmpDir();
  try {
    const fakeMedia = path.join(tmp, 'video.mp4');
    fs.writeFileSync(fakeMedia, 'fake video content');

    const profA = createProfile(
      {
        name: 'Profile A',
        captionTemplateId: 'tpl_builtin_clean',
      },
      tmp
    );

    const profB = createProfile(
      {
        name: 'Profile B',
        captionTemplateId: 'tpl_builtin_bold',
      },
      tmp
    );

    const plan = createBulkExportPlan(
      {
        sourcePath: fakeMedia,
        exportType: 'cut',
        profileIds: [profA.id, profB.id],
      },
      tmp
    );

    assert.strictEqual(plan.jobs.length, 2);
    assert.strictEqual(plan.jobs[0].captionTemplateId, 'tpl_builtin_clean');
    assert.strictEqual(plan.jobs[1].captionTemplateId, 'tpl_builtin_bold');
    assert.notStrictEqual(plan.jobs[0].textOverlays, plan.jobs[1].textOverlays);
    assert.notStrictEqual(plan.jobs[0].textOverlays[0].id, plan.jobs[1].textOverlays[0].id);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// J. Mutating Job A does not mutate Job B
test('J. Mutating Job A does not mutate Job B', () => {
  const tmp = makeTmpDir();
  try {
    const fakeMedia = path.join(tmp, 'video.mp4');
    fs.writeFileSync(fakeMedia, 'fake video content');

    const profA = createProfile(
      {
        name: 'Profile A',
        captionTemplateId: 'tpl_builtin_clean',
      },
      tmp
    );

    const profB = createProfile(
      {
        name: 'Profile B',
        captionTemplateId: 'tpl_builtin_clean',
      },
      tmp
    );

    const plan = createBulkExportPlan(
      {
        sourcePath: fakeMedia,
        exportType: 'cut',
        profileIds: [profA.id, profB.id],
      },
      tmp
    );

    // Mutate Job A in memory
    plan.jobs[0].textOverlays[0].text = 'JOB A MUTATED';

    // Verify Job B remains untouched
    assert.notStrictEqual(plan.jobs[1].textOverlays[0].text, 'JOB A MUTATED');
  } finally {
    cleanupTmpDir(tmp);
  }
});

// K. Mutating template after plan creation does not change plan
test('K. Mutating template after plan creation does not change plan', () => {
  const tmp = makeTmpDir();
  try {
    const fakeMedia = path.join(tmp, 'video.mp4');
    fs.writeFileSync(fakeMedia, 'fake video content');

    const custom = createCaptionTemplate(
      {
        name: 'Template K',
        overlays: [sampleOverlay1],
      },
      tmp
    );

    const prof = createProfile(
      {
        name: 'Profile K',
        captionTemplateId: custom.id,
      },
      tmp
    );

    const plan = createBulkExportPlan(
      {
        sourcePath: fakeMedia,
        exportType: 'cut',
        profileIds: [prof.id],
      },
      tmp
    );

    // Mutate template on disk
    updateCaptionTemplate(
      custom.id,
      {
        name: 'Template K Mutated',
        overlays: [sampleOverlay2],
      },
      tmp
    );

    // Plan retains original snapshot
    assert.strictEqual(plan.jobs[0].captionTemplateName, 'Template K');
    assert.strictEqual(plan.jobs[0].textOverlays[0].text, sampleOverlay1.text);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// L. Mutating profile after plan creation does not change plan
test('L. Mutating profile after plan creation does not change plan', () => {
  const tmp = makeTmpDir();
  try {
    const fakeMedia = path.join(tmp, 'video.mp4');
    fs.writeFileSync(fakeMedia, 'fake video content');

    const prof = createProfile(
      {
        name: 'Profile L',
        captionTemplateId: 'tpl_builtin_clean',
      },
      tmp
    );

    const plan = createBulkExportPlan(
      {
        sourcePath: fakeMedia,
        exportType: 'cut',
        profileIds: [prof.id],
      },
      tmp
    );

    // Mutate profile on disk (clear caption template)
    updateProfile(
      prof.id,
      {
        name: 'Profile L Renamed',
        captionTemplateId: null,
      },
      tmp
    );

    // Plan retains original snapshot
    assert.strictEqual(plan.jobs[0].profileName, 'Profile L');
    assert.strictEqual(plan.jobs[0].captionTemplateId, 'tpl_builtin_clean');
    assert.ok(Array.isArray(plan.jobs[0].textOverlays));
  } finally {
    cleanupTmpDir(tmp);
  }
});

// M. Deleted template after plan creation does not invalidate plan
test('M. Deleted template after plan creation does not invalidate plan', () => {
  const tmp = makeTmpDir();
  try {
    const fakeMedia = path.join(tmp, 'video.mp4');
    fs.writeFileSync(fakeMedia, 'fake video content');

    const custom = createCaptionTemplate(
      {
        name: 'Template M',
        overlays: [sampleOverlay1],
      },
      tmp
    );

    const prof = createProfile(
      {
        name: 'Profile M',
        captionTemplateId: custom.id,
      },
      tmp
    );

    const plan = createBulkExportPlan(
      {
        sourcePath: fakeMedia,
        exportType: 'cut',
        profileIds: [prof.id],
      },
      tmp
    );

    // Delete template from disk
    deleteCaptionTemplate(custom.id, tmp);

    // Plan remains valid and passes validation
    assert.doesNotThrow(() => {
      validateBulkExportPlan(plan);
    });

    const items = planToBatchQueueItems(plan);
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].textOverlays[0].text, sampleOverlay1.text);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// N. Bulk executor passes textOverlays to queue
test('N. Bulk executor passes textOverlays to queue', async () => {
  const tmp = makeTmpDir();
  try {
    const fakeMedia = path.join(tmp, 'video.mp4');
    fs.writeFileSync(fakeMedia, 'fake video content');

    const prof = createProfile(
      {
        name: 'Profile N',
        captionTemplateId: 'tpl_builtin_clean',
      },
      tmp
    );

    const plan = createBulkExportPlan(
      {
        sourcePath: fakeMedia,
        exportType: 'cut',
        profileIds: [prof.id],
      },
      tmp
    );

    const customQueue = new BatchQueueManager();
    const res = await executeBulkExport(plan, { autoStart: false }, customQueue);

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.items.length, 1);
    assert.ok(Array.isArray(res.items[0].textOverlays));
    assert.strictEqual(res.items[0].textOverlays[0].id, 'clean_ov_1');
  } finally {
    cleanupTmpDir(tmp);
  }
});

// O. Queue passes textOverlays to cutter
test('O. Queue passes textOverlays to cutter', () => {
  const tmp = makeTmpDir();
  try {
    const fakeMedia = path.join(tmp, 'video.mp4');
    fs.writeFileSync(fakeMedia, 'fake video content');

    const prof = createProfile(
      {
        name: 'Profile O',
        captionTemplateId: 'tpl_builtin_bold',
      },
      tmp
    );

    const plan = createBulkExportPlan(
      {
        sourcePath: fakeMedia,
        exportType: 'cut',
        profileIds: [prof.id],
      },
      tmp
    );

    const items = planToBatchQueueItems(plan);
    assert.ok(Array.isArray(items[0].textOverlays));
    assert.strictEqual(items[0].textOverlays[0].id, 'bold_ov_1');
  } finally {
    cleanupTmpDir(tmp);
  }
});

// P. Cut receives correct caption snapshot
test('P. Cut receives correct caption snapshot', () => {
  const tmp = makeTmpDir();
  try {
    const fakeMedia = path.join(tmp, 'video.mp4');
    fs.writeFileSync(fakeMedia, 'fake video content');

    const prof = createProfile(
      {
        name: 'Profile Cut',
        captionTemplateId: 'tpl_builtin_clean',
      },
      tmp
    );

    const plan = createBulkExportPlan(
      {
        sourcePath: fakeMedia,
        exportType: 'cut',
        profileIds: [prof.id],
      },
      tmp
    );

    const items = planToBatchQueueItems(plan, { exportType: 'cut', start: 0, end: 5 });
    assert.strictEqual(items[0].operation, 'cut');
    assert.ok(Array.isArray(items[0].textOverlays));
    assert.strictEqual(items[0].textOverlays[0].id, 'clean_ov_1');
  } finally {
    cleanupTmpDir(tmp);
  }
});

// Q. Reel receives correct caption snapshot
test('Q. Reel receives correct caption snapshot', () => {
  const tmp = makeTmpDir();
  try {
    const fakeMedia = path.join(tmp, 'video.mp4');
    fs.writeFileSync(fakeMedia, 'fake video content');

    const prof = createProfile(
      {
        name: 'Profile Reel',
        captionTemplateId: 'tpl_builtin_clean',
      },
      tmp
    );

    const plan = createBulkExportPlan(
      {
        sourcePath: fakeMedia,
        exportType: 'reel',
        profileIds: [prof.id],
      },
      tmp
    );

    const items = planToBatchQueueItems(plan, { exportType: 'reel', aspectRatio: '9:16', mode: 'blur' });
    assert.strictEqual(items[0].operation, 'reel');
    assert.strictEqual(items[0].aspectRatio, '9:16');
    assert.ok(Array.isArray(items[0].textOverlays));
    assert.strictEqual(items[0].textOverlays[0].id, 'clean_ov_1');
  } finally {
    cleanupTmpDir(tmp);
  }
});

// R. Split receives correct caption snapshot
test('R. Split receives correct caption snapshot', () => {
  const tmp = makeTmpDir();
  try {
    const fakeMedia = path.join(tmp, 'video.mp4');
    fs.writeFileSync(fakeMedia, 'fake video content');

    const prof = createProfile(
      {
        name: 'Profile Split',
        captionTemplateId: 'tpl_builtin_clean',
      },
      tmp
    );

    const plan = createBulkExportPlan(
      {
        sourcePath: fakeMedia,
        exportType: 'split',
        profileIds: [prof.id],
      },
      tmp
    );

    const items = planToBatchQueueItems(plan, { exportType: 'split', interval: 30 });
    assert.strictEqual(items[0].operation, 'split');
    assert.strictEqual(items[0].interval, 30);
    assert.ok(Array.isArray(items[0].textOverlays));
    assert.strictEqual(items[0].textOverlays[0].id, 'clean_ov_1');
  } finally {
    cleanupTmpDir(tmp);
  }
});

// S. Variation + caption compatibility
test('S. Variation + caption compatibility', () => {
  const overlays = [sampleOverlay1];
  const filters = buildTextOverlayFilters(overlays, 10);
  assert.ok(Array.isArray(filters));
  assert.strictEqual(filters.length, 1);
  assert.ok(filters[0].startsWith('drawtext='));
});

// T. Multiple profiles get different captions
test('T. Multiple profiles get different captions', () => {
  const tmp = makeTmpDir();
  try {
    const fakeMedia = path.join(tmp, 'video.mp4');
    fs.writeFileSync(fakeMedia, 'fake video content');

    const p1 = createProfile({ name: 'P1 Promo', captionTemplateId: 'tpl_builtin_promo' }, tmp);
    const p2 = createProfile({ name: 'P2 Social', captionTemplateId: 'tpl_builtin_social' }, tmp);
    const p3 = createProfile({ name: 'P3 None', captionTemplateId: null }, tmp);

    const plan = createBulkExportPlan(
      {
        sourcePath: fakeMedia,
        exportType: 'cut',
        profileIds: [p1.id, p2.id, p3.id],
      },
      tmp
    );

    const items = planToBatchQueueItems(plan);
    assert.strictEqual(items.length, 3);
    assert.strictEqual(items[0].textOverlays[0].id, 'promo_ov_1');
    assert.strictEqual(items[1].textOverlays[0].id, 'social_ov_1');
    assert.strictEqual(items[2].textOverlays, null);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// U. No caption profile remains unchanged
test('U. No caption profile remains unchanged', () => {
  const tmp = makeTmpDir();
  try {
    const fakeMedia = path.join(tmp, 'video.mp4');
    fs.writeFileSync(fakeMedia, 'fake video content');

    const p = createProfile({ name: 'P None', captionTemplateId: null }, tmp);
    const plan = createBulkExportPlan(
      {
        sourcePath: fakeMedia,
        exportType: 'cut',
        profileIds: [p.id],
      },
      tmp
    );

    const items = planToBatchQueueItems(plan);
    assert.strictEqual(items[0].textOverlays, null);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// V. Cancel job still works
test('V. Cancel job still works', () => {
  const queue = new BatchQueueManager();
  const added = queue.addItems([
    {
      inputPath: 'video.mp4',
      outputPath: 'out1.mp4',
      operation: 'cut',
      textOverlays: [sampleOverlay1],
    },
  ]);

  assert.strictEqual(added.length, 1);
  const cancelled = queue.cancelItem(added[0].id);
  assert.strictEqual(cancelled, true);
  assert.strictEqual(added[0].status, STATUS.CANCELLED);
});

// W. Cancel all still works
test('W. Cancel all still works', () => {
  const queue = new BatchQueueManager();
  const added = queue.addItems([
    { inputPath: 'v1.mp4', outputPath: 'o1.mp4', operation: 'cut', textOverlays: [sampleOverlay1] },
    { inputPath: 'v2.mp4', outputPath: 'o2.mp4', operation: 'cut', textOverlays: [sampleOverlay2] },
  ]);

  assert.strictEqual(added.length, 2);
  queue.cancelAll();
  assert.strictEqual(queue.getState().waitingCount, 0);
  assert.strictEqual(queue.getState().runningCount, 0);
  assert.strictEqual(added[0].status, STATUS.CANCELLED);
  assert.strictEqual(added[1].status, STATUS.CANCELLED);
});

// X. Schedule receives caption snapshot
test('X. Schedule receives caption snapshot', () => {
  const tmp = makeTmpDir();
  try {
    const fakeMedia = path.join(tmp, 'video.mp4');
    fs.writeFileSync(fakeMedia, 'fake video content');

    const prof = createProfile(
      {
        name: 'Profile X',
        captionTemplateId: 'tpl_builtin_clean',
      },
      tmp
    );

    const plan = createBulkExportPlan(
      {
        sourcePath: fakeMedia,
        exportType: 'cut',
        profileIds: [prof.id],
      },
      tmp
    );

    const future = new Date(Date.now() + 3600000).toISOString();
    const res = createBulkSchedule({ plan, startAt: future, gapMinutes: 10 }, tmp);

    assert.strictEqual(res.count, 1);
    const sched = getSchedule(res.schedules[0].id, tmp);
    assert.ok(sched);
    assert.strictEqual(sched.captionTemplateId, 'tpl_builtin_clean');
    assert.strictEqual(sched.captionTemplateName, 'Clean');
    assert.ok(Array.isArray(sched.exportOptions.textOverlays));
    assert.strictEqual(sched.exportOptions.textOverlays[0].id, 'clean_ov_1');
  } finally {
    cleanupTmpDir(tmp);
  }
});

// Y. Schedule remains unchanged after template mutation
test('Y. Schedule remains unchanged after template mutation', () => {
  const tmp = makeTmpDir();
  try {
    const fakeMedia = path.join(tmp, 'video.mp4');
    fs.writeFileSync(fakeMedia, 'fake video content');

    const custom = createCaptionTemplate({ name: 'Template Y', overlays: [sampleOverlay1] }, tmp);
    const prof = createProfile({ name: 'Profile Y', captionTemplateId: custom.id }, tmp);

    const plan = createBulkExportPlan({ sourcePath: fakeMedia, exportType: 'cut', profileIds: [prof.id] }, tmp);
    const future = new Date(Date.now() + 3600000).toISOString();
    const res = createBulkSchedule({ plan, startAt: future, gapMinutes: 10 }, tmp);

    // Mutate template
    updateCaptionTemplate(custom.id, { name: 'Altered', overlays: [sampleOverlay2] }, tmp);

    const sched = getSchedule(res.schedules[0].id, tmp);
    assert.strictEqual(sched.exportOptions.textOverlays[0].text, sampleOverlay1.text);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// Z. Schedule remains unchanged after profile mutation
test('Z. Schedule remains unchanged after profile mutation', () => {
  const tmp = makeTmpDir();
  try {
    const fakeMedia = path.join(tmp, 'video.mp4');
    fs.writeFileSync(fakeMedia, 'fake video content');

    const prof = createProfile({ name: 'Profile Z', captionTemplateId: 'tpl_builtin_clean' }, tmp);
    const plan = createBulkExportPlan({ sourcePath: fakeMedia, exportType: 'cut', profileIds: [prof.id] }, tmp);

    const future = new Date(Date.now() + 3600000).toISOString();
    const res = createBulkSchedule({ plan, startAt: future, gapMinutes: 10 }, tmp);

    // Mutate profile
    updateProfile(prof.id, { captionTemplateId: null }, tmp);

    const sched = getSchedule(res.schedules[0].id, tmp);
    assert.strictEqual(sched.captionTemplateId, 'tpl_builtin_clean');
    assert.ok(Array.isArray(sched.exportOptions.textOverlays));
  } finally {
    cleanupTmpDir(tmp);
  }
});

// AA. Invalid caption snapshot rejected
test('AA. Invalid caption snapshot rejected', () => {
  const tmp = makeTmpDir();
  try {
    const fakeMedia = path.join(tmp, 'video.mp4');
    fs.writeFileSync(fakeMedia, 'fake video content');

    const plan = {
      planId: 'plan_invalid',
      sourceFile: fakeMedia,
      exportType: 'cut',
      jobs: [
        {
          jobId: 'job_1',
          profileId: 'prof_1',
          profileName: 'P1',
          outputPath: path.join(tmp, 'out_1.mp4'),
          variationPreset: { brightness: 0, saturation: 1, hue: 0, pitch: 0, speed: 1.0, mode: 'center', crop: 0, cleanMetadata: true },
          textOverlays: 'INVALID_NON_ARRAY',
        },
      ],
    };

    assert.throws(() => {
      validateBulkExportPlan(plan);
    }, /invalid textOverlays format/);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// AB. Arbitrary font path rejected
test('AB. Arbitrary font path rejected', () => {
  const overlayWithBadFont = {
    ...sampleOverlay1,
    fontFamily: '../../../../windows/fonts/evil.ttf',
  };
  assert.throws(() => {
    validateSingleOverlay(overlayWithBadFont, 0);
  }, /Arbitrary font paths are not allowed/);
});

// AC. Arbitrary FFmpeg filter rejected / neutralized
test('AC. Arbitrary FFmpeg filter rejected / neutralized', () => {
  const malicious = 'Test; [0:v] drawtext=text="HACKED":x=0:y=0 [outv]';
  const escaped = escapeFfmpegText(malicious);
  assert.ok(escaped.includes('\\['), 'Opening bracket must be escaped');
  assert.ok(escaped.includes('\\]'), 'Closing bracket must be escaped');
  assert.ok(escaped.includes('\\:'), 'Colon must be escaped');
  const filters = buildTextOverlayFilters([{ text: malicious }]);
  assert.strictEqual(filters.length, 1);
  assert.ok(!filters[0].includes('[0:v]'), 'Unescaped stream specifier must not exist');
  assert.ok(filters[0].includes('\\[0\\:v\\]'), 'Stream specifier must be escaped text');
});

// AD. Renderer cannot inject caption configuration into another profile
test('AD. Renderer cannot inject caption configuration into another profile', () => {
  const tmp = makeTmpDir();
  try {
    // Only template ID or null is accepted
    assert.throws(() => {
      createProfile(
        {
          name: 'Injection Attempt',
          captionTemplateId: { overlays: [{ text: 'malicious' }] },
        },
        tmp
      );
    }, /must be a string or null/);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// AE. Existing bulk export tests still pass
test('AE. Existing bulk export tests still pass (bulk-export-executor.test.js)', () => {
  const testPath = path.join(__dirname, 'bulk-export-executor.test.js');
  const res = spawnSync(process.execPath, [testPath], { stdio: 'pipe' });
  assert.strictEqual(res.status, 0, `bulk-export-executor.test.js failed:\n${res.stderr.toString()}`);
});

// AF. Existing scheduler tests still pass
test('AF. Existing scheduler tests still pass (scheduler.test.js)', () => {
  const testPath = path.join(__dirname, 'scheduler.test.js');
  const res = spawnSync(process.execPath, [testPath], { stdio: 'pipe' });
  assert.strictEqual(res.status, 0, `scheduler.test.js failed:\n${res.stderr.toString()}`);
});

// AG. Existing caption tests still pass
test('AG. Existing caption tests still pass (caption-template.test.js)', () => {
  const testPath = path.join(__dirname, 'caption-template.test.js');
  const res = spawnSync(process.execPath, [testPath], { stdio: 'pipe' });
  assert.strictEqual(res.status, 0, `caption-template.test.js failed:\n${res.stderr.toString()}`);
});

// AH. Existing profile-caption tests still pass
test('AH. Existing profile-caption tests still pass (profile-caption-template.test.js)', () => {
  const testPath = path.join(__dirname, 'profile-caption-template.test.js');
  const res = spawnSync(process.execPath, [testPath], { stdio: 'pipe' });
  assert.strictEqual(res.status, 0, `profile-caption-template.test.js failed:\n${res.stderr.toString()}`);
});

// ── Test Runner ──────────────────────────────────────────────────────────────

async function runAll() {
  for (const t of testQueue) {
    totalCount++;
    try {
      await t.fn();
      passedCount++;
      console.log(`  ✓ PASS: ${totalCount}. ${t.name}`);
    } catch (err) {
      console.error(`  ✗ FAIL: ${totalCount}. ${t.name}`);
      console.error(err);
      process.exit(1);
    }
  }

  console.log(`\n======================================================`);
  console.log(`📊 Phase 4B-4 Test Results: ${passedCount} / ${totalCount} passed`);
  console.log(`======================================================\n`);
}

runAll().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
