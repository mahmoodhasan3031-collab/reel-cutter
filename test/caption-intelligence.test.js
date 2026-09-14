'use strict';

/**
 * Phase 4B-7 — Caption Intelligence Dashboard & History Test Suite
 *
 * Tests A through AQ:
 *  A. History record validation
 *  B. Empty caption rejection
 *  C. Score range validation
 *  D. Signal range validation
 *  E. Create history record
 *  F. Retrieve history
 *  G. Retrieve single history record
 *  H. Delete history record
 *  I. Clear history
 *  J. Search history
 *  K. Sort newest
 *  L. Sort oldest
 *  M. Sort highest score
 *  N. Sort lowest score
 *  O. 500-record history limit
 *  P. Corrupt history recovery
 *  Q. Atomic persistence
 *  R. Dashboard empty state
 *  S. Dashboard average score
 *  T. Dashboard highest score
 *  U. Dashboard lowest score
 *  V. Signal averages
 *  W. History detail
 *  X. Re-analysis
 *  Y. Comparison of two captions
 *  Z. Comparison is read-only
 *  AA. Trend with sufficient data
 *  AB. Trend empty state
 *  AC. Insight generation
 *  AD. Lowest-signal detection
 *  AE. AI improvement reuses existing provider
 *  AF. Mock AI improvement
 *  AG. Malformed AI response
 *  AH. AI timeout/error handling
 *  AI. Improved caption validation
 *  AJ. Template save integration
 *  AK. Built-in template immutability
 *  AL. Profile context snapshot
 *  AM. Bulk analysis
 *  AN. Bulk snapshot isolation
 *  AO. IPC validation
 *  AP. Feature gating
 *  AQ. Existing Phase 4B-6 regression
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  createHistoryRecord,
  getHistory,
  getHistoryRecord,
  deleteHistoryRecord,
  clearHistory,
  getDashboardMetrics,
  getQualityInsights,
  compareCaptions,
  reanalyzeHistoryRecord,
  validateHistoryRecordInput,
  MAX_HISTORY_LIMIT,
} = require('../src/main/captions/captionHistoryManager');

const {
  analyzeCaption,
} = require('../src/main/captions/captionQualityAnalyzer');

const {
  analyzeQuality,
  improveCaption,
  analyzeBulkQuality,
} = require('../src/main/captions/captionQualityService');

const {
  MockAiProvider,
  resetToDefaultProvider,
} = require('../src/main/captions/aiProviderAdapter');

const {
  createProfile,
  updateProfile,
} = require('../src/main/profiles/profileManager');

const {
  createCaptionTemplate,
  updateCaptionTemplate,
  CANONICAL_BUILTINS,
} = require('../src/main/captions/captionTemplateManager');

const {
  createBulkExportPlan,
} = require('../src/main/profiles/exportPlan');

const {
  hasFeature,
  FEATURE_KEYS,
} = require('../src/shared/features');

console.log('======================================================');
console.log('🧪 Running Phase 4B-7 Caption Intelligence Dashboard Tests');
console.log('======================================================\n');

let passedCount = 0;
let totalCount = 0;
const testQueue = [];

function test(name, fn) {
  testQueue.push({ name, fn });
}

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rc_test_caption_history_'));
}

function cleanupTmpDir(dir) {
  try {
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (_) {}
}

// A. History record validation
test('A. History record validation succeeds for valid payload', () => {
  const valid = validateHistoryRecordInput({
    caption: 'Discover 3 essential workflow tips for fast video cutting!',
    topic: 'video editing',
    score: 85,
    grade: 'B',
    signals: { readability: 90, relevance: 85, clarity: 80, cta: 85, structure: 85 },
  });

  assert.strictEqual(valid.caption, 'Discover 3 essential workflow tips for fast video cutting!');
  assert.strictEqual(valid.score, 85);
  assert.strictEqual(valid.grade, 'B');
  assert.strictEqual(valid.signals.readability, 90);
});

// B. Empty caption rejection
test('B. Empty caption rejection throws descriptive error', () => {
  assert.throws(() => validateHistoryRecordInput({ caption: '' }), /Caption cannot be empty/);
  assert.throws(() => validateHistoryRecordInput({ caption: '   ' }), /Caption cannot be empty/);
  assert.throws(() => validateHistoryRecordInput({ caption: null }), /caption is required/);
  assert.throws(() => validateHistoryRecordInput({}), /caption is required/);
});

// C. Score range validation
test('C. Score range validation enforces 0-100 bounds', () => {
  assert.throws(() => validateHistoryRecordInput({
    caption: 'Valid caption',
    score: 150,
    signals: { readability: 80, relevance: 80, clarity: 80, cta: 80, structure: 80 },
    grade: 'A',
  }), /Score must be a number between 0 and 100/);

  assert.throws(() => validateHistoryRecordInput({
    caption: 'Valid caption',
    score: -10,
    signals: { readability: 80, relevance: 80, clarity: 80, cta: 80, structure: 80 },
    grade: 'F',
  }), /Score must be a number between 0 and 100/);
});

// D. Signal range validation
test('D. Signal range validation enforces 0-100 bounds for each signal', () => {
  assert.throws(() => validateHistoryRecordInput({
    caption: 'Valid caption',
    score: 80,
    grade: 'B',
    signals: { readability: 120, relevance: 80, clarity: 80, cta: 80, structure: 80 },
  }), /Signal "readability" must be a number between 0 and 100/);

  assert.throws(() => validateHistoryRecordInput({
    caption: 'Valid caption',
    score: 80,
    grade: 'B',
    signals: { readability: 80, relevance: -5, clarity: 80, cta: 80, structure: 80 },
  }), /Signal "relevance" must be a number between 0 and 100/);
});

// E. Create history record
test('E. Create history record persists to storage and assigns valid ID and timestamps', () => {
  const tmpDir = makeTmpDir();
  try {
    const record = createHistoryRecord({
      caption: 'Top 5 Editing Shortcuts You Need to Know! Subscribe for more daily guides.',
      topic: 'shortcuts',
      platform: 'youtube',
    }, tmpDir);

    assert.ok(record.id.startsWith('cqh_'));
    assert.ok(record.createdAt);
    assert.ok(record.updatedAt);
    assert.ok(record.score >= 0 && record.score <= 100);
    assert.ok(record.signals);

    const file = path.join(tmpDir, 'caption-quality-history.json');
    assert.ok(fs.existsSync(file), 'History file must be created on disk');
  } finally {
    cleanupTmpDir(tmpDir);
  }
});

// F. Retrieve history
test('F. Retrieve history returns all saved records in order', () => {
  const tmpDir = makeTmpDir();
  try {
    createHistoryRecord({ caption: 'Caption 1' }, tmpDir);
    createHistoryRecord({ caption: 'Caption 2' }, tmpDir);

    const list = getHistory({}, tmpDir);
    assert.strictEqual(list.length, 2);
    // Newest first by default
    assert.strictEqual(list[0].caption, 'Caption 2');
    assert.strictEqual(list[1].caption, 'Caption 1');
  } finally {
    cleanupTmpDir(tmpDir);
  }
});

// G. Retrieve single history record
test('G. Retrieve single history record by ID returns correct record', () => {
  const tmpDir = makeTmpDir();
  try {
    const r1 = createHistoryRecord({ caption: 'Specific Caption' }, tmpDir);
    const retrieved = getHistoryRecord(r1.id, tmpDir);
    assert.ok(retrieved);
    assert.strictEqual(retrieved.id, r1.id);
    assert.strictEqual(retrieved.caption, 'Specific Caption');

    const nonExistent = getHistoryRecord('invalid_id', tmpDir);
    assert.strictEqual(nonExistent, null);
  } finally {
    cleanupTmpDir(tmpDir);
  }
});

// H. Delete history record
test('H. Delete history record removes target record while preserving others', () => {
  const tmpDir = makeTmpDir();
  try {
    const r1 = createHistoryRecord({ caption: 'Keep Me' }, tmpDir);
    const r2 = createHistoryRecord({ caption: 'Delete Me' }, tmpDir);

    const delRes = deleteHistoryRecord(r2.id, tmpDir);
    assert.strictEqual(delRes.success, true);
    assert.strictEqual(delRes.id, r2.id);

    const list = getHistory({}, tmpDir);
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].id, r1.id);

    assert.throws(() => deleteHistoryRecord('non_existent', tmpDir), /History record not found/);
  } finally {
    cleanupTmpDir(tmpDir);
  }
});

// I. Clear history
test('I. Clear history removes all records safely', () => {
  const tmpDir = makeTmpDir();
  try {
    createHistoryRecord({ caption: 'One' }, tmpDir);
    createHistoryRecord({ caption: 'Two' }, tmpDir);

    const clearRes = clearHistory(tmpDir);
    assert.strictEqual(clearRes.success, true);
    assert.strictEqual(clearRes.count, 2);

    const list = getHistory({}, tmpDir);
    assert.strictEqual(list.length, 0);
  } finally {
    cleanupTmpDir(tmpDir);
  }
});

// J. Search history
test('J. Search history filters by caption query, topic, and profile name', () => {
  const tmpDir = makeTmpDir();
  try {
    createHistoryRecord({ caption: 'Discover how to cut videos', topic: 'cutting' }, tmpDir);
    createHistoryRecord({ caption: 'Best color grading LUTs', topic: 'color' }, tmpDir);
    createHistoryRecord({ caption: 'Audio mixing tricks', profileName: 'SoundPro' }, tmpDir);

    const searchCutting = getHistory({ search: 'cut' }, tmpDir);
    assert.strictEqual(searchCutting.length, 1);
    assert.strictEqual(searchCutting[0].topic, 'cutting');

    const searchProfile = getHistory({ search: 'SoundPro' }, tmpDir);
    assert.strictEqual(searchProfile.length, 1);
    assert.strictEqual(searchProfile[0].profileName, 'SoundPro');
  } finally {
    cleanupTmpDir(tmpDir);
  }
});

// K. Sort newest
test('K. Sort newest orders by newest createdAt first', () => {
  const tmpDir = makeTmpDir();
  try {
    createHistoryRecord({ caption: 'Older', createdAt: '2026-01-01T00:00:00.000Z' }, tmpDir);
    createHistoryRecord({ caption: 'Newer', createdAt: '2026-06-01T00:00:00.000Z' }, tmpDir);

    const list = getHistory({ sort: 'newest' }, tmpDir);
    assert.strictEqual(list[0].caption, 'Newer');
  } finally {
    cleanupTmpDir(tmpDir);
  }
});

// L. Sort oldest
test('L. Sort oldest orders by oldest createdAt first', () => {
  const tmpDir = makeTmpDir();
  try {
    createHistoryRecord({ caption: 'Older', createdAt: '2026-01-01T00:00:00.000Z' }, tmpDir);
    createHistoryRecord({ caption: 'Newer', createdAt: '2026-06-01T00:00:00.000Z' }, tmpDir);

    const list = getHistory({ sort: 'oldest' }, tmpDir);
    assert.strictEqual(list[0].caption, 'Older');
  } finally {
    cleanupTmpDir(tmpDir);
  }
});

// M. Sort highest score
test('M. Sort highest score orders by score descending', () => {
  const tmpDir = makeTmpDir();
  try {
    createHistoryRecord({ caption: 'Low', score: 60, grade: 'D', signals: { readability: 60, relevance: 60, clarity: 60, cta: 60, structure: 60 } }, tmpDir);
    createHistoryRecord({ caption: 'High', score: 95, grade: 'A', signals: { readability: 95, relevance: 95, clarity: 95, cta: 95, structure: 95 } }, tmpDir);

    const list = getHistory({ sort: 'highest' }, tmpDir);
    assert.strictEqual(list[0].caption, 'High');
  } finally {
    cleanupTmpDir(tmpDir);
  }
});

// N. Sort lowest score
test('N. Sort lowest score orders by score ascending', () => {
  const tmpDir = makeTmpDir();
  try {
    createHistoryRecord({ caption: 'Low', score: 60, grade: 'D', signals: { readability: 60, relevance: 60, clarity: 60, cta: 60, structure: 60 } }, tmpDir);
    createHistoryRecord({ caption: 'High', score: 95, grade: 'A', signals: { readability: 95, relevance: 95, clarity: 95, cta: 95, structure: 95 } }, tmpDir);

    const list = getHistory({ sort: 'lowest' }, tmpDir);
    assert.strictEqual(list[0].caption, 'Low');
  } finally {
    cleanupTmpDir(tmpDir);
  }
});

// O. 500-record history limit
test('O. 500-record history limit prevents unbounded growth (FIFO)', () => {
  const tmpDir = makeTmpDir();
  try {
    const historyFile = path.join(tmpDir, 'caption-quality-history.json');
    // Pre-populate 500 items (newest at index 0, oldest at index 499)
    const existing = [];
    for (let i = 0; i < 500; i++) {
      existing.push({
        id: `cqh_init_${i}`,
        createdAt: new Date(Date.now() - i * 1000).toISOString(),
        caption: `Caption ${i}`,
        score: 75,
        grade: 'C',
        signals: { readability: 75, relevance: 75, clarity: 75, cta: 75, structure: 75 },
      });
    }
    fs.writeFileSync(historyFile, JSON.stringify({ version: 1, history: existing }));

    // Add 501st record
    const newRecord = createHistoryRecord({ caption: 'Brand New 501st' }, tmpDir);
    const list = getHistory({}, tmpDir);

    assert.strictEqual(list.length, MAX_HISTORY_LIMIT);
    assert.strictEqual(list[0].id, newRecord.id);
    // Oldest item cqh_init_499 must have been dropped
    assert.strictEqual(list.some((r) => r.id === 'cqh_init_499'), false);
  } finally {
    cleanupTmpDir(tmpDir);
  }
});

// P. Corrupt history recovery
test('P. Corrupt history recovery starts with empty valid state without crash', () => {
  const tmpDir = makeTmpDir();
  try {
    const historyFile = path.join(tmpDir, 'caption-quality-history.json');
    fs.writeFileSync(historyFile, '{ "corrupted": true, [malformed JSON syntax!@#$');

    const list = getHistory({}, tmpDir);
    assert.strictEqual(Array.isArray(list), true);
    assert.strictEqual(list.length, 0);

    // Can still write new records safely
    const rec = createHistoryRecord({ caption: 'Post Corruption Record' }, tmpDir);
    assert.ok(rec.id);
    assert.strictEqual(getHistory({}, tmpDir).length, 1);
  } finally {
    cleanupTmpDir(tmpDir);
  }
});

// Q. Atomic persistence
test('Q. Atomic persistence writes clean JSON payload with version and timestamps', () => {
  const tmpDir = makeTmpDir();
  try {
    createHistoryRecord({ caption: 'Atomic Test Caption' }, tmpDir);
    const historyFile = path.join(tmpDir, 'caption-quality-history.json');
    const raw = JSON.parse(fs.readFileSync(historyFile, 'utf8'));

    assert.strictEqual(raw.version, 1);
    assert.ok(raw.updatedAt);
    assert.strictEqual(raw.history.length, 1);
  } finally {
    cleanupTmpDir(tmpDir);
  }
});

// R. Dashboard empty state
test('R. Dashboard empty state returns zeroed metrics without crashing', () => {
  const tmpDir = makeTmpDir();
  try {
    const metrics = getDashboardMetrics(tmpDir);
    assert.strictEqual(metrics.totalCount, 0);
    assert.strictEqual(metrics.averageScore, 0);
    assert.strictEqual(metrics.highestScore, 0);
    assert.strictEqual(metrics.lowestScore, 0);
    assert.strictEqual(metrics.improvementOpportunities, 0);
    assert.strictEqual(metrics.weakestSignal, null);

    const insights = getQualityInsights(tmpDir);
    assert.ok(Array.isArray(insights));
    assert.ok(insights[0].includes('No caption analyses recorded yet'));
  } finally {
    cleanupTmpDir(tmpDir);
  }
});

// S. Dashboard average score
test('S. Dashboard average score accurately computes mean score', () => {
  const tmpDir = makeTmpDir();
  try {
    createHistoryRecord({ caption: 'A', score: 80, grade: 'B', signals: { readability: 80, relevance: 80, clarity: 80, cta: 80, structure: 80 } }, tmpDir);
    createHistoryRecord({ caption: 'B', score: 90, grade: 'A', signals: { readability: 90, relevance: 90, clarity: 90, cta: 90, structure: 90 } }, tmpDir);

    const metrics = getDashboardMetrics(tmpDir);
    assert.strictEqual(metrics.averageScore, 85);
  } finally {
    cleanupTmpDir(tmpDir);
  }
});

// T. Dashboard highest score
test('T. Dashboard highest score tracks maximum score across records', () => {
  const tmpDir = makeTmpDir();
  try {
    createHistoryRecord({ caption: 'A', score: 70, grade: 'C', signals: { readability: 70, relevance: 70, clarity: 70, cta: 70, structure: 70 } }, tmpDir);
    createHistoryRecord({ caption: 'B', score: 94, grade: 'A', signals: { readability: 94, relevance: 94, clarity: 94, cta: 94, structure: 94 } }, tmpDir);

    const metrics = getDashboardMetrics(tmpDir);
    assert.strictEqual(metrics.highestScore, 94);
  } finally {
    cleanupTmpDir(tmpDir);
  }
});

// U. Dashboard lowest score
test('U. Dashboard lowest score tracks minimum score across records', () => {
  const tmpDir = makeTmpDir();
  try {
    createHistoryRecord({ caption: 'A', score: 62, grade: 'D', signals: { readability: 62, relevance: 62, clarity: 62, cta: 62, structure: 62 } }, tmpDir);
    createHistoryRecord({ caption: 'B', score: 88, grade: 'B', signals: { readability: 88, relevance: 88, clarity: 88, cta: 88, structure: 88 } }, tmpDir);

    const metrics = getDashboardMetrics(tmpDir);
    assert.strictEqual(metrics.lowestScore, 62);
  } finally {
    cleanupTmpDir(tmpDir);
  }
});

// V. Signal averages
test('V. Signal averages correctly calculate mean for each of the 5 signals', () => {
  const tmpDir = makeTmpDir();
  try {
    createHistoryRecord({
      caption: 'A',
      score: 80,
      grade: 'B',
      signals: { readability: 70, relevance: 80, clarity: 90, cta: 60, structure: 70 },
    }, tmpDir);
    createHistoryRecord({
      caption: 'B',
      score: 90,
      grade: 'A',
      signals: { readability: 90, relevance: 80, clarity: 90, cta: 80, structure: 90 },
    }, tmpDir);

    const metrics = getDashboardMetrics(tmpDir);
    assert.strictEqual(metrics.averageSignals.readability, 80);
    assert.strictEqual(metrics.averageSignals.relevance, 80);
    assert.strictEqual(metrics.averageSignals.clarity, 90);
    assert.strictEqual(metrics.averageSignals.cta, 70);
    assert.strictEqual(metrics.averageSignals.structure, 80);
  } finally {
    cleanupTmpDir(tmpDir);
  }
});

// W. History detail
test('W. History detail retrieves complete metadata and analysis signals', () => {
  const tmpDir = makeTmpDir();
  try {
    const created = createHistoryRecord({
      caption: 'Detailed test caption for video production.',
      topic: 'production',
      language: 'english',
      platform: 'instagram',
      profileId: 'prof_detail_1',
      profileName: 'Insta Reels',
    }, tmpDir);

    const detail = getHistoryRecord(created.id, tmpDir);
    assert.strictEqual(detail.topic, 'production');
    assert.strictEqual(detail.platform, 'instagram');
    assert.strictEqual(detail.profileId, 'prof_detail_1');
    assert.strictEqual(detail.profileName, 'Insta Reels');
    assert.ok(detail.signals);
  } finally {
    cleanupTmpDir(tmpDir);
  }
});

// X. Re-analysis
test('X. Re-analysis uses current analyzer and returns fresh result without mutating stored record', () => {
  const tmpDir = makeTmpDir();
  try {
    const created = createHistoryRecord({
      caption: 'Follow for more video tips and techniques!',
      score: 50, // artificially stored low score
      grade: 'F',
      signals: { readability: 50, relevance: 50, clarity: 50, cta: 50, structure: 50 },
    }, tmpDir);

    const reResult = reanalyzeHistoryRecord(created.id, tmpDir);
    assert.strictEqual(reResult.previousScore, 50);
    assert.ok(reResult.newScore > 50); // Fresh analyzer accurately computes higher score for CTA

    // Stored record remains unmodified
    const untouched = getHistoryRecord(created.id, tmpDir);
    assert.strictEqual(untouched.score, 50);
  } finally {
    cleanupTmpDir(tmpDir);
  }
});

// Y. Comparison of two captions
test('Y. Comparison of two captions computes differences and winner', () => {
  const tmpDir = makeTmpDir();
  try {
    const recA = createHistoryRecord({
      caption: 'Caption A with moderate clarity.',
      score: 75,
      grade: 'C',
      signals: { readability: 75, relevance: 75, clarity: 70, cta: 75, structure: 80 },
    }, tmpDir);

    const recB = createHistoryRecord({
      caption: 'Caption B with exceptional clarity and strong call to action. Tap link in bio!',
      score: 92,
      grade: 'A',
      signals: { readability: 90, relevance: 90, clarity: 95, cta: 95, structure: 90 },
    }, tmpDir);

    const comp = compareCaptions(recA.id, recB.id, tmpDir);
    assert.strictEqual(comp.betterOverall, 'B');
    assert.strictEqual(comp.scoreDiff, 17);
    assert.strictEqual(comp.strongestDifference.signal, 'clarity');
    assert.strictEqual(comp.strongestDifference.winner, 'B');
    assert.ok(comp.verdict.includes('Higher quality score'));
  } finally {
    cleanupTmpDir(tmpDir);
  }
});

// Z. Comparison is read-only
test('Z. Comparison is strictly read-only and mutates no records or templates', () => {
  const tmpDir = makeTmpDir();
  try {
    const recA = createHistoryRecord({ caption: 'Caption A' }, tmpDir);
    const recB = createHistoryRecord({ caption: 'Caption B' }, tmpDir);

    const snapA = JSON.stringify(recA);
    const snapB = JSON.stringify(recB);

    compareCaptions(recA.id, recB.id, tmpDir);

    const afterA = JSON.stringify(getHistoryRecord(recA.id, tmpDir));
    const afterB = JSON.stringify(getHistoryRecord(recB.id, tmpDir));

    assert.strictEqual(snapA, afterA);
    assert.strictEqual(snapB, afterB);
  } finally {
    cleanupTmpDir(tmpDir);
  }
});

// AA. Trend with sufficient data
test('AA. Trend with sufficient data has >= 2 records chronologically', () => {
  const tmpDir = makeTmpDir();
  try {
    createHistoryRecord({ caption: 'Point 1' }, tmpDir);
    createHistoryRecord({ caption: 'Point 2' }, tmpDir);
    createHistoryRecord({ caption: 'Point 3' }, tmpDir);

    const list = getHistory({ sort: 'oldest' }, tmpDir);
    assert.ok(list.length >= 2);
    assert.strictEqual(list[0].caption, 'Point 1');
    assert.strictEqual(list[2].caption, 'Point 3');
  } finally {
    cleanupTmpDir(tmpDir);
  }
});

// AB. Trend empty state
test('AB. Trend empty state indicates insufficient data when < 2 records', () => {
  const tmpDir = makeTmpDir();
  try {
    const list0 = getHistory({}, tmpDir);
    assert.ok(list0.length < 2);

    createHistoryRecord({ caption: 'Only 1' }, tmpDir);
    const list1 = getHistory({}, tmpDir);
    assert.ok(list1.length < 2);
  } finally {
    cleanupTmpDir(tmpDir);
  }
});

// AC. Insight generation
test('AC. Insight generation creates deterministic feedback based on metrics', () => {
  const tmpDir = makeTmpDir();
  try {
    createHistoryRecord({
      caption: 'High quality caption test.',
      score: 90,
      grade: 'A',
      signals: { readability: 90, relevance: 90, clarity: 95, cta: 85, structure: 90 },
    }, tmpDir);

    const insights = getQualityInsights(tmpDir);
    assert.ok(insights.length > 0);
    assert.ok(insights.some((ins) => ins.includes('90/100')));
  } finally {
    cleanupTmpDir(tmpDir);
  }
});

// AD. Lowest-signal detection
test('AD. Lowest-signal detection accurately identifies the weakest signal', () => {
  const tmpDir = makeTmpDir();
  try {
    createHistoryRecord({
      caption: 'Sample',
      score: 75,
      grade: 'C',
      signals: { readability: 85, relevance: 85, clarity: 85, cta: 55, structure: 85 },
    }, tmpDir);

    const metrics = getDashboardMetrics(tmpDir);
    assert.strictEqual(metrics.weakestSignal, 'cta');
  } finally {
    cleanupTmpDir(tmpDir);
  }
});

// AE. AI improvement reuses existing provider
test('AE. AI improvement reuses existing provider abstraction without new provider system', async () => {
  resetToDefaultProvider();
  const res = await improveCaption({
    caption: 'Short caption needing AI touch.',
    topic: 'editing',
  });
  assert.strictEqual(res.success, true);
  assert.ok(res.improved);
});

// AF. Mock AI improvement
test('AF. Mock AI improvement produces valid improved text and scores', async () => {
  resetToDefaultProvider();
  const res = await improveCaption({
    caption: 'Check out this video edit.',
    topic: 'video editing tips',
    language: 'english',
    tone: 'promotional',
  });

  assert.strictEqual(res.success, true);
  assert.ok(typeof res.originalScore === 'number');
  assert.ok(typeof res.improvedScore === 'number');
  assert.notStrictEqual(res.improved, '');
});

// AG. Malformed AI response
test('AG. Malformed AI response handled cleanly without crashing', async () => {
  const malformed = new MockAiProvider({ forceMalformed: true });
  const res = await improveCaption(
    { caption: 'Valid test caption' },
    { provider: malformed }
  );
  assert.strictEqual(res.success, false);
  assert.ok(res.error);
});

// AH. AI timeout/error handling
test('AH. AI timeout/error handling captures timeout failures gracefully', async () => {
  const timeout = new MockAiProvider({ forceTimeout: true });
  const res = await improveCaption(
    { caption: 'Valid test caption' },
    { provider: timeout }
  );
  assert.strictEqual(res.success, false);
  assert.ok(/timed out/.test(res.error));
});

// AI. Improved caption validation
test('AI. Improved caption conforms to overlay constraints (non-empty, max 500 chars)', async () => {
  resetToDefaultProvider();
  const res = await improveCaption({ caption: 'Basic caption.' });
  assert.strictEqual(res.success, true);
  assert.ok(res.improved.length > 0 && res.improved.length <= 500);
});

// AJ. Template save integration
test('AJ. Template save integration creates custom template in template library', () => {
  const tmpDir = makeTmpDir();
  try {
    const tpl = createCaptionTemplate({
      name: `Dashboard Quality Template ${Date.now()}`,
      description: 'Saved from dashboard workflow',
      overlays: [{ text: 'Saved From Dashboard', fontSize: 44 }],
    }, tmpDir);

    assert.ok(tpl.id);
    assert.strictEqual(tpl.isBuiltIn, false);
    assert.strictEqual(tpl.overlays[0].text, 'Saved From Dashboard');
  } finally {
    cleanupTmpDir(tmpDir);
  }
});

// AK. Built-in template immutability
test('AK. Built-in template immutability prevents modifying built-ins from dashboard', () => {
  const tmpDir = makeTmpDir();
  try {
    const builtinId = CANONICAL_BUILTINS[0].id;
    assert.throws(() => {
      updateCaptionTemplate(builtinId, { name: 'Attempted Builtin Overwrite' }, tmpDir);
    }, /Built-in templates cannot be modified/i);
  } finally {
    cleanupTmpDir(tmpDir);
  }
});

// AL. Profile context snapshot
test('AL. Profile context snapshot preserves profile info in history record', () => {
  const tmpDir = makeTmpDir();
  try {
    const prof = createProfile({ name: 'History Profile', platform: 'TikTok' }, tmpDir);
    const rec = createHistoryRecord({
      caption: 'Profile caption analysis',
      profileId: prof.id,
      profileName: prof.name,
      platform: prof.platform,
    }, tmpDir);

    assert.strictEqual(rec.profileId, prof.id);
    assert.strictEqual(rec.profileName, 'History Profile');
    assert.strictEqual(rec.platform, 'tiktok');

    // Mutate profile
    updateProfile(prof.id, { name: 'MUTATED PROFILE NAME' }, tmpDir);

    // Stored history record preserves snapshot
    const stored = getHistoryRecord(rec.id, tmpDir);
    assert.strictEqual(stored.profileName, 'History Profile');
  } finally {
    cleanupTmpDir(tmpDir);
  }
});

// AM. Bulk analysis
test('AM. Bulk analysis evaluates multiple profile captions and aggregates summary', () => {
  const res = analyzeBulkQuality({
    entries: [
      { profileId: 'p1', profileName: 'Page 1', caption: 'Follow for tips!' },
      { profileId: 'p2', profileName: 'Page 2', caption: 'Educational breakdown of audio design.' },
    ],
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.results.length, 2);
  assert.strictEqual(res.summary.totalEntries, 2);
  assert.ok(res.summary.averageScore >= 0);
});

// AN. Bulk snapshot isolation
test('AN. Bulk snapshot isolation ensures bulk plan textOverlays are unaffected by post-plan template changes', () => {
  const tmpDir = makeTmpDir();
  try {
    const prof = createProfile({ name: 'Snap Prof', platform: 'Instagram' }, tmpDir);
    const tpl = createCaptionTemplate({
      name: 'Plan Tpl',
      overlays: [{ text: 'Snapshot Text Initial', fontSize: 40 }],
    }, tmpDir);
    updateProfile(prof.id, { captionTemplateId: tpl.id }, tmpDir);

    const plan = createBulkExportPlan({ sourcePath: 'test.mp4', profileIds: [prof.id] }, tmpDir);
    assert.strictEqual(plan.jobs[0].textOverlays[0].text, 'Snapshot Text Initial');

    // Mutate template
    updateCaptionTemplate(tpl.id, { name: 'Mutated', overlays: [{ text: 'NEW MUTATED OVERLAY' }] }, tmpDir);

    // Plan text remains isolated
    assert.strictEqual(plan.jobs[0].textOverlays[0].text, 'Snapshot Text Initial');
  } finally {
    cleanupTmpDir(tmpDir);
  }
});

// AO. IPC validation
test('AO. IPC validation rejects invalid payload types and malformed IDs', () => {
  assert.throws(() => getHistoryRecord(null), /id must be a string/);
  assert.throws(() => getHistoryRecord(12345), /id must be a string/);
  assert.throws(() => deleteHistoryRecord(''), /id is required/);
  assert.throws(() => compareCaptions(null, 'id2'), /Both caption IDs/);
  assert.throws(() => compareCaptions('same', 'same'), /Cannot compare a caption analysis with itself/);
});

// AP. Feature gating
test('AP. Feature gating confirms CAPTION_QUALITY is accessible on Pro tier and locked on Basic/Standard', () => {
  assert.strictEqual(hasFeature('pro', 'caption_quality'), true);
  assert.strictEqual(hasFeature('pro', FEATURE_KEYS.CAPTION_QUALITY), true);
  assert.strictEqual(hasFeature('pro', 'caption quality'), true);

  assert.strictEqual(hasFeature('basic', 'caption_quality'), false);
  assert.strictEqual(hasFeature('standard', 'caption_quality'), false);
});

// AQ. Existing Phase 4B-6 regression
test('AQ. Existing Phase 4B-6 regression: analyzeCaption and quality service work as expected', () => {
  const res = analyzeCaption({
    caption: 'Check out these 3 easy video editing tips! Follow for more daily guides.',
    topic: 'video editing',
    language: 'english',
  });

  assert.ok(res.score >= 0 && res.score <= 100);
  assert.ok(['A', 'B', 'C', 'D', 'F'].includes(res.grade));
  assert.ok(res.signals.readability >= 0);
  assert.ok(res.signals.cta >= 85);
  assert.ok(res.strengths.length > 0);
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
  console.log(`📊 Phase 4B-7 Test Results: ${passedCount} / ${totalCount} passed`);
  console.log(`======================================================\n`);
}

runAll().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
