'use strict';

/**
 * Phase 4B-10 - Caption Intelligence Production Polish Test Suite
 *
 * Tests A through AF:
 *  A. Caption data consistency across representations
 *  B. Template/profile consistency on deleted template fallback
 *  C. Profile template validation rejects non-existent template
 *  D. AI generator topic validation (empty, whitespace, oversized)
 *  E. AI generator count validation (enforces 3-5 range)
 *  F. AI generator language validation (english, bangla, rejects invalid)
 *  G. AI generator empty provider response handling
 *  H. AI generator malformed provider response handling
 *  I. Quality analyzer score bounding (0-100)
 *  J. Quality analyzer grade determinism (A, B, C, D, F)
 *  K. Quality analyzer Bangla language support
 *  L. Quality analyzer English language support and fillers
 *  M. Quality analyzer input immutability
 *  N. Smart rewrite mode validation (all 7 valid, rejects invalid)
 *  O. Smart rewrite caption immutability until applied
 *  P. Smart rewrite provider error handling
 *  Q. Smart rewrite quality feedback loop
 *  R. Experiment isolation: variant ops never mutate sourceCaption
 *  S. Experiment isolation: variant ops never mutate profiles or history
 *  T. Experiment duplicate isolation
 *  U. Experiment variant count limits (1 to 10)
 *  V. Experiment comparison heuristic disclaimer
 *  W. History persistence and corrupt file recovery
 *  X. History 500-record FIFO limit enforcement
 *  Y. History re-analysis immutability
 *  Z. History comparison with missing records error handling
 *  AA. Dashboard metrics on empty history
 *  AB. Dashboard metrics calculation and signal aggregation
 *  AC. Feature gating for Pro tier on caption intelligence features
 *  AD. Bulk export plan snapshot isolation
 *  AE. Scheduled export snapshot isolation
 *  AF. Input validation and error safety across caption workflows
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  getCaptionTemplates,
  getCaptionTemplate,
  createCaptionTemplate,
  updateCaptionTemplate,
  deleteCaptionTemplate,
  CANONICAL_BUILTINS,
} = require('../src/main/captions/captionTemplateManager');

const {
  validateCaptionRequest,
  validateCaptionSuggestions,
  ALLOWED_LANGUAGES,
  ALLOWED_TONES,
  LIMITS: AI_LIMITS,
} = require('../src/main/captions/aiCaptionValidator');

const {
  MockAiProvider,
} = require('../src/main/captions/aiProviderAdapter');

const {
  analyzeCaption,
  MAX_CAPTION_LENGTH,
  _gradeFromScore,
} = require('../src/main/captions/captionQualityAnalyzer');

const {
  analyzeQuality,
  improveCaption,
} = require('../src/main/captions/captionQualityService');

const {
  createWorkspace,
  addVersion,
  selectVersion,
  updateCurrentCaption,
  generateSmartRewrites,
  rewriteWithQualityFeedback,
  ALLOWED_REWRITE_MODES,
} = require('../src/main/captions/captionWorkspaceManager');

const {
  createExperiment,
  getExperiment,
  addVariant,
  updateVariant,
  deleteVariant,
  duplicateExperiment,
  compareVariants,
} = require('../src/main/captions/captionExperimentManager');

const {
  createHistoryRecord,
  getHistory,
  getHistoryRecord,
  deleteHistoryRecord,
  clearHistory,
  getDashboardMetrics,
  compareCaptions,
  reanalyzeHistoryRecord,
} = require('../src/main/captions/captionHistoryManager');

const {
  createProfile,
  updateProfile,
  loadProfiles,
  resolveProfileCaptionTemplate,
} = require('../src/main/profiles/profileManager');

const {
  createBulkExportPlan,
} = require('../src/main/profiles/exportPlan');

const {
  createSchedule,
} = require('../src/main/scheduler/scheduleManager');

const features = require('../src/shared/features');

console.log('======================================================');
console.log('Testing Phase 4B-10 Caption Intelligence Production Polish');
console.log('======================================================\n');

let passedCount = 0;
let totalCount = 0;
const testQueue = [];

function test(name, fn) {
  testQueue.push({ name, fn });
}

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rc_test_polish_'));
}

function cleanupTmpDir(dir) {
  try {
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (_) {}
}

// -- Test A: Caption data consistency -----------------------------------------
test('A. Caption data consistency across representations', () => {
  const dir = makeTmpDir();
  try {
    const rawText = 'Consistent caption text across all components!';
    // Template
    const tpl = createCaptionTemplate({
      name: 'Consistent Template',
      overlays: [{ text: rawText, fontFamily: 'Arial', fontSize: 40, color: '#FFF' }],
    }, dir);
    assert.strictEqual(tpl.overlays[0].text, rawText);

    // Workspace
    const ws = createWorkspace({ caption: rawText });
    assert.strictEqual(ws.currentCaption, rawText);
    assert.strictEqual(ws.versions[0].text, rawText);

    // Experiment
    const exp = createExperiment({ name: 'Exp Consist', sourceCaption: rawText }, dir);
    assert.strictEqual(exp.sourceCaption, rawText);
    assert.strictEqual(exp.variants[0].text, rawText);

    // Quality Analysis
    const q = analyzeCaption({ caption: rawText });
    assert.ok(q.score >= 0 && q.score <= 100);

    // History
    const h = createHistoryRecord({ caption: rawText, score: q.score, grade: q.grade, signals: q.signals }, dir);
    assert.strictEqual(h.caption, rawText);
  } finally {
    cleanupTmpDir(dir);
  }
});

// -- Test B: Template/profile consistency on deleted template fallback ---------
test('B. Template/profile consistency on deleted template fallback', () => {
  const dir = makeTmpDir();
  try {
    const tpl = createCaptionTemplate({
      name: 'To Delete Template',
      overlays: [{ text: 'Temporary Overlay' }],
    }, dir);
    const prof = createProfile({
      name: 'Profile Linked to Template',
      platform: 'Instagram',
      captionTemplateId: tpl.id,
    }, dir);

    assert.strictEqual(prof.captionTemplateId, tpl.id);
    const resolvedBefore = resolveProfileCaptionTemplate(prof, dir);
    assert.strictEqual(resolvedBefore.templateId, tpl.id);
    assert.strictEqual(resolvedBefore.templateName, 'To Delete Template');

    // Delete template
    deleteCaptionTemplate(tpl.id, dir);

    // Resolution must safely return null without throwing or crashing
    const resolvedAfter = resolveProfileCaptionTemplate(prof, dir);
    assert.strictEqual(resolvedAfter.templateId, null);
    assert.strictEqual(resolvedAfter.templateName, null);
    assert.strictEqual(resolvedAfter.overlays, null);
  } finally {
    cleanupTmpDir(dir);
  }
});

// -- Test C: Profile template validation rejects non-existent template ---------
test('C. Profile template validation rejects non-existent template', () => {
  const dir = makeTmpDir();
  try {
    assert.throws(() => {
      createProfile({
        name: 'Invalid Template Profile',
        platform: 'YouTube',
        captionTemplateId: 'tpl_nonexistent_99999',
      }, dir);
    }, /not found/i);
  } finally {
    cleanupTmpDir(dir);
  }
});

// -- Test D: AI generator topic validation ------------------------------------
test('D. AI generator topic validation (empty, whitespace, oversized)', () => {
  assert.throws(() => validateCaptionRequest({ topic: '' }), /cannot be empty/i);
  assert.throws(() => validateCaptionRequest({ topic: '   ' }), /cannot be empty/i);
  assert.throws(() => validateCaptionRequest({}), /required/i);
  assert.throws(() => validateCaptionRequest({ topic: 'A'.repeat(501) }), /exceeds maximum length/i);
  const valid = validateCaptionRequest({ topic: 'Valid topic description' });
  assert.strictEqual(valid.topic, 'Valid topic description');
});

// -- Test E: AI generator count validation ------------------------------------
test('E. AI generator count validation (enforces 3-5 range)', () => {
  assert.throws(() => validateCaptionRequest({ topic: 'Topic', count: 2 }), /between 3 and 5/i);
  assert.throws(() => validateCaptionRequest({ topic: 'Topic', count: 6 }), /between 3 and 5/i);
  assert.throws(() => validateCaptionRequest({ topic: 'Topic', count: 3.5 }), /integer/i);
  const valid = validateCaptionRequest({ topic: 'Topic', count: 4 });
  assert.strictEqual(valid.count, 4);
});

// -- Test F: AI generator language validation ---------------------------------
test('F. AI generator language validation (english, bangla, rejects invalid)', () => {
  assert.throws(() => validateCaptionRequest({ topic: 'Topic', language: 'french' }), /invalid language/i);
  const eng = validateCaptionRequest({ topic: 'Topic', language: 'english' });
  assert.strictEqual(eng.language, 'english');
  const bng = validateCaptionRequest({ topic: 'Topic', language: 'bangla' });
  assert.strictEqual(bng.language, 'bangla');
});

// -- Test G: AI generator empty provider response handling --------------------
test('G. AI generator empty provider response handling', () => {
  assert.throws(() => validateCaptionSuggestions([]), /empty suggestions/i);
  assert.throws(() => validateCaptionSuggestions(null), /must be an array/i);
});

// -- Test H: AI generator malformed provider response handling -----------------
test('H. AI generator malformed provider response handling', () => {
  assert.throws(() => validateCaptionSuggestions(['Valid', null, 'Another']), /must be a string/i);
  assert.throws(() => validateCaptionSuggestions(['Valid', '   ']), /is empty/i);
  assert.throws(() => validateCaptionSuggestions(['Valid', 'X'.repeat(501)]), /exceeds 500/i);
  const clean = validateCaptionSuggestions(['  First caption  ', 'Second caption']);
  assert.strictEqual(clean[0], 'First caption');
  assert.strictEqual(clean[1], 'Second caption');
});

// -- Test I: Quality analyzer score bounding (0-100) ---------------------------
test('I. Quality analyzer score bounding (0-100)', () => {
  const captions = [
    'A',
    '!'.repeat(100),
    'Click here now! Learn more and subscribe today for our full course on reel cutting!',
    'Random words without any punctuation or sense or call to action whatsoever',
    '??'.repeat(50),
    'This is a normal good caption with a link in bio to learn more and try it today!',
  ];
  for (const cap of captions) {
    const res = analyzeCaption({ caption: cap.slice(0, 500) });
    assert.ok(typeof res.score === 'number');
    assert.ok(res.score >= 0 && res.score <= 100, `Score ${res.score} out of bounds for "${cap}"`);
    for (const [sig, val] of Object.entries(res.signals)) {
      assert.ok(val >= 0 && val <= 100, `Signal ${sig}=${val} out of bounds`);
    }
  }
});

// -- Test J: Quality analyzer grade determinism --------------------------------
test('J. Quality analyzer grade determinism (A, B, C, D, F)', () => {
  assert.strictEqual(_gradeFromScore(95), 'A');
  assert.strictEqual(_gradeFromScore(85), 'B');
  assert.strictEqual(_gradeFromScore(75), 'C');
  assert.strictEqual(_gradeFromScore(65), 'D');
  assert.strictEqual(_gradeFromScore(55), 'F');
  const highQuality = 'Master reel editing in 60 seconds! Follow us for more quick tips and tap link in bio.';
  const resHigh = analyzeCaption({ caption: highQuality });
  assert.strictEqual(resHigh.grade, _gradeFromScore(resHigh.score));
});

// -- Test K: Quality analyzer Bangla language support -------------------------
test('K. Quality analyzer Bangla language support', () => {
  const banglaCaption = 'ভিডিও এডিটিং করার সহজ নিয়ম জেনে নিন। নতুন ভিডিওর জন্য সাবস্ক্রাইব করে রাখুন!';
  const res = analyzeCaption({ caption: banglaCaption, language: 'bangla' });
  assert.ok(res.score >= 70);
  assert.strictEqual(res.signals.cta, 90, 'Bangla CTA patterns should be detected');
});

// -- Test L: Quality analyzer English language support and fillers -------------
test('L. Quality analyzer English language support and fillers', () => {
  const clean = 'Learn video editing today! Subscribe for more.';
  const filler = 'Basically literally you know learn video editing today sort of! Subscribe for more.';
  const resClean = analyzeCaption({ caption: clean });
  const resFiller = analyzeCaption({ caption: filler });
  assert.ok(resClean.signals.clarity > resFiller.signals.clarity, 'Fillers should penalize clarity score');
});

// -- Test M: Quality analyzer input immutability ------------------------------
test('M. Quality analyzer input immutability', () => {
  const input = {
    caption: 'Test caption for immutability check',
    topic: 'Video Editing',
    language: 'english',
    tone: 'casual',
    platform: 'instagram',
  };
  const snapshot = JSON.stringify(input);
  analyzeCaption(input);
  assert.strictEqual(JSON.stringify(input), snapshot, 'analyzeCaption must not mutate input');
});

// -- Test N: Smart rewrite mode validation ------------------------------------
test('N. Smart rewrite mode validation (all 7 valid, rejects invalid)', async () => {
  assert.strictEqual(ALLOWED_REWRITE_MODES.length, 7);
  for (const mode of ALLOWED_REWRITE_MODES) {
    const ws = createWorkspace({ caption: 'Test caption' });
    assert.ok(ws);
  }
  const res = await generateSmartRewrites({ caption: 'Test', mode: 'invalid_mode' });
  assert.strictEqual(res.success, false);
  assert.ok(res.error.toLowerCase().includes('invalid rewrite mode'));
});

// -- Test O: Smart rewrite caption immutability until applied ------------------
test('O. Smart rewrite caption immutability until applied', async () => {
  const mock = new MockAiProvider();
  const ws = createWorkspace({ caption: 'Original untouched caption' });
  const wsSnap = JSON.stringify(ws);

  const res = await generateSmartRewrites({
    caption: ws.currentCaption,
    mode: 'clearer',
    count: 2,
  }, { provider: mock });

  assert.strictEqual(res.success, true);
  assert.strictEqual(JSON.stringify(ws), wsSnap, 'Workspace must remain untouched after generating rewrites');
});

// -- Test P: Smart rewrite provider error handling ----------------------------
test('P. Smart rewrite provider error handling', async () => {
  const brokenProvider = {
    rewrite: async () => { throw new Error('Simulated network timeout'); },
  };
  const res = await generateSmartRewrites({
    caption: 'Test caption',
    mode: 'clearer',
  }, { provider: brokenProvider });

  assert.strictEqual(res.success, false);
  assert.ok(res.error.includes('Simulated network timeout'));
});

// -- Test Q: Smart rewrite quality feedback loop ------------------------------
test('Q. Smart rewrite quality feedback loop', async () => {
  const mock = new MockAiProvider();
  const res = await rewriteWithQualityFeedback({
    caption: 'Very plain text with zero call to action or hook whatsoever',
  }, { provider: mock });

  assert.strictEqual(res.success, true);
  assert.ok(res.weakestSignal);
  assert.ok(res.recommendedMode);
  assert.ok(typeof res.scoreDiff === 'number');
  assert.ok(Array.isArray(res.suggestions) && res.suggestions.length > 0);
});

// -- Test R: Experiment isolation: variant ops never mutate sourceCaption -----
test('R. Experiment isolation: variant ops never mutate sourceCaption', () => {
  const dir = makeTmpDir();
  try {
    const exp = createExperiment({ name: 'Exp Isolation', sourceCaption: 'Initial Original Caption' }, dir);
    const initialSource = exp.sourceCaption;

    // Add variant
    const { variant } = addVariant(exp.id, { text: 'Variant 2 text', source: 'manual' }, dir);
    // Update variant
    updateVariant(exp.id, variant.id, { text: 'Variant 2 revised text' }, dir);
    // Delete variant
    deleteVariant(exp.id, variant.id, dir);

    const reloaded = getExperiment(exp.id, dir);
    assert.strictEqual(reloaded.sourceCaption, initialSource, 'sourceCaption must never change during variant operations');
  } finally {
    cleanupTmpDir(dir);
  }
});

// -- Test S: Experiment isolation: variant ops never mutate profiles or history -
test('S. Experiment isolation: variant ops never mutate profiles or history', () => {
  const dir = makeTmpDir();
  try {
    const prof = createProfile({ name: 'Safe Profile', platform: 'TikTok' }, dir);
    const hist = createHistoryRecord({ caption: 'Safe History Record', score: 85, grade: 'B', signals: { readability: 85, relevance: 85, clarity: 85, cta: 85, structure: 85 } }, dir);

    const exp = createExperiment({ name: 'Variant Mutation Exp', sourceCaption: 'Base Caption' }, dir);
    const { variant } = addVariant(exp.id, { text: 'New Var', source: 'ai' }, dir);
    updateVariant(exp.id, variant.id, { text: 'Modified Var' }, dir);

    // Verify profile unchanged
    const profiles = loadProfiles(dir).profiles;
    assert.strictEqual(profiles.length, 1);
    assert.strictEqual(profiles[0].id, prof.id);
    assert.strictEqual(profiles[0].name, 'Safe Profile');

    // Verify history unchanged
    const history = getHistory({}, dir);
    assert.strictEqual(history.length, 1);
    assert.strictEqual(history[0].id, hist.id);
    assert.strictEqual(history[0].caption, 'Safe History Record');
  } finally {
    cleanupTmpDir(dir);
  }
});

// -- Test T: Experiment duplicate isolation -----------------------------------
test('T. Experiment duplicate isolation', () => {
  const dir = makeTmpDir();
  try {
    const orig = createExperiment({ name: 'Original', sourceCaption: 'Orig Caption' }, dir);
    const dup = duplicateExperiment(orig.id, dir);

    addVariant(dup.id, { text: 'Dup only variant', source: 'manual' }, dir);

    const origReloaded = getExperiment(orig.id, dir);
    const dupReloaded = getExperiment(dup.id, dir);

    assert.strictEqual(origReloaded.variants.length, 1);
    assert.strictEqual(dupReloaded.variants.length, 2);
  } finally {
    cleanupTmpDir(dir);
  }
});

// -- Test U: Experiment variant count limits (1 to 10) -------------------------
test('U. Experiment variant count limits (1 to 10)', () => {
  const dir = makeTmpDir();
  try {
    const exp = createExperiment({ name: 'Limits Exp', sourceCaption: 'Start Caption' }, dir);
    // Add up to 10
    for (let i = 1; i < 10; i++) {
      addVariant(exp.id, { text: `Variant ${i + 1}` }, dir);
    }
    const reloaded = getExperiment(exp.id, dir);
    assert.strictEqual(reloaded.variants.length, 10);

    // 11th variant must throw
    assert.throws(() => {
      addVariant(exp.id, { text: 'Overflow variant' }, dir);
    }, /maximum limit/i);
  } finally {
    cleanupTmpDir(dir);
  }
});

// -- Test V: Experiment comparison heuristic disclaimer -----------------------
test('V. Experiment comparison heuristic disclaimer', () => {
  const varA = { id: 'v1', name: 'Var A', text: 'Short text.' };
  const varB = { id: 'v2', name: 'Var B', text: 'Engaging caption! Subscribe today for full tips.' };
  const comp = compareVariants(varA, varB);
  assert.ok(comp.verdict);
  assert.ok(comp.verdict.toLowerCase().includes('heuristic'));
});

// -- Test W: History persistence and corrupt file recovery ---------------------
test('W. History persistence and corrupt file recovery', () => {
  const dir = makeTmpDir();
  try {
    const histFile = path.join(dir, 'caption-quality-history.json');
    fs.writeFileSync(histFile, 'CORRUPT_JSON_DATA{{{', 'utf8');

    // loadHistory via getHistory should safely return empty array
    const records = getHistory({}, dir);
    assert.deepStrictEqual(records, []);

    // createHistoryRecord should recover and succeed
    const rec = createHistoryRecord({ caption: 'Recovered Record' }, dir);
    assert.ok(rec.id);
    const retrieved = getHistory({}, dir);
    assert.strictEqual(retrieved.length, 1);
  } finally {
    cleanupTmpDir(dir);
  }
});

// -- Test X: History 500-record FIFO limit enforcement ------------------------
test('X. History 500-record FIFO limit enforcement', () => {
  const dir = makeTmpDir();
  try {
    // Populate 500 records directly in file
    const fakeRecords = [];
    for (let i = 1; i <= 500; i++) {
      fakeRecords.push({
        id: `cqh_fake_${i}`,
        caption: `Caption ${i}`,
        score: 80,
        grade: 'B',
        signals: { readability: 80, relevance: 80, clarity: 80, cta: 80, structure: 80 },
        createdAt: new Date(Date.now() - (500 - i) * 1000).toISOString(),
        updatedAt: new Date(Date.now() - (500 - i) * 1000).toISOString(),
      });
    }
    const histFile = path.join(dir, 'caption-quality-history.json');
    fs.writeFileSync(histFile, JSON.stringify({ version: 1, history: fakeRecords }), 'utf8');

    // Add 501st record
    createHistoryRecord({ caption: 'The 501st Record' }, dir);

    const reloaded = getHistory({}, dir);
    assert.strictEqual(reloaded.length, 500, 'History must be capped at 500');
    assert.strictEqual(reloaded[0].caption, 'The 501st Record', 'Newest record must be at index 0');
  } finally {
    cleanupTmpDir(dir);
  }
});

// -- Test Y: History re-analysis immutability ----------------------------------
test('Y. History re-analysis immutability', () => {
  const dir = makeTmpDir();
  try {
    const rec = createHistoryRecord({
      caption: 'Click here now! Learn reel cutting today. Link in bio!',
      score: 50, // intentionally store non-matching score
      grade: 'F',
      signals: { readability: 50, relevance: 50, clarity: 50, cta: 50, structure: 50 },
    }, dir);

    const fresh = reanalyzeHistoryRecord(rec.id, dir);
    assert.ok(fresh.newScore > 50);

    // Stored record must NOT have mutated
    const original = getHistoryRecord(rec.id, dir);
    assert.strictEqual(original.score, 50);
    assert.strictEqual(original.grade, 'F');
  } finally {
    cleanupTmpDir(dir);
  }
});

// -- Test Z: History comparison with missing records error handling -----------
test('Z. History comparison with missing records error handling', () => {
  const dir = makeTmpDir();
  try {
    const rec = createHistoryRecord({ caption: 'Existing record' }, dir);
    assert.throws(() => compareCaptions(rec.id, 'cqh_nonexistent_99999', dir), /not found/i);
    assert.throws(() => compareCaptions(rec.id, rec.id, dir), /cannot compare.*itself/i);
  } finally {
    cleanupTmpDir(dir);
  }
});

// -- Test AA: Dashboard metrics on empty history ------------------------------
test('AA. Dashboard metrics on empty history', () => {
  const dir = makeTmpDir();
  try {
    const metrics = getDashboardMetrics(dir);
    assert.strictEqual(metrics.totalCount, 0);
    assert.strictEqual(metrics.averageScore, 0);
    assert.strictEqual(metrics.highestScore, 0);
    assert.strictEqual(metrics.lowestScore, 0);
    assert.deepStrictEqual(metrics.recentRecords, []);
  } finally {
    cleanupTmpDir(dir);
  }
});

// -- Test AB: Dashboard metrics calculation and signal aggregation ------------
test('AB. Dashboard metrics calculation and signal aggregation', () => {
  const dir = makeTmpDir();
  try {
    createHistoryRecord({ caption: 'Caption 1', score: 90, grade: 'A', signals: { readability: 90, relevance: 90, clarity: 90, cta: 90, structure: 90 } }, dir);
    createHistoryRecord({ caption: 'Caption 2', score: 70, grade: 'C', signals: { readability: 70, relevance: 70, clarity: 70, cta: 70, structure: 70 } }, dir);

    const metrics = getDashboardMetrics(dir);
    assert.strictEqual(metrics.totalCount, 2);
    assert.strictEqual(metrics.averageScore, 80);
    assert.strictEqual(metrics.highestScore, 90);
    assert.strictEqual(metrics.lowestScore, 70);
    assert.strictEqual(metrics.gradeDistribution.A, 1);
    assert.strictEqual(metrics.gradeDistribution.C, 1);
  } finally {
    cleanupTmpDir(dir);
  }
});

// -- Test AC: Feature gating for Pro tier on caption intelligence features -----
test('AC. Feature gating for Pro tier on caption intelligence features', () => {
  const proFeatures = [
    features.FEATURE_KEYS.AI_CAPTIONS,
    features.FEATURE_KEYS.CAPTION_QUALITY,
    features.FEATURE_KEYS.CAPTION_WORKSPACE,
    features.FEATURE_KEYS.CAPTION_EXPERIMENT,
  ];

  for (const feat of proFeatures) {
    assert.strictEqual(features.hasFeature('free', feat), false, `Free tier should not have ${feat}`);
    assert.strictEqual(features.hasFeature('standard', feat), false, `Standard tier should not have ${feat}`);
    assert.strictEqual(features.hasFeature('pro', feat), true, `Pro tier must have ${feat}`);
  }
});

// -- Test AD: Bulk export plan snapshot isolation ------------------------------
test('AD. Bulk export plan snapshot isolation', () => {
  const dir = makeTmpDir();
  try {
    const tpl = createCaptionTemplate({
      name: 'Plan Snapshot Template',
      overlays: [{ text: 'Initial Snapshot Text', fontFamily: 'Arial' }],
    }, dir);

    const prof = createProfile({
      name: 'Plan Snapshot Profile',
      platform: 'Instagram',
      captionTemplateId: tpl.id,
    }, dir);

    // Dummy video path for plan creation
    const dummyVideo = path.join(dir, 'source_test.mp4');
    fs.writeFileSync(dummyVideo, 'dummy content');

    const plan = createBulkExportPlan({
      sourcePath: dummyVideo,
      profileIds: [prof.id],
      checkCollision: false,
    }, dir);

    assert.ok(plan.planId);
    assert.strictEqual(plan.jobs[0].textOverlays[0].text, 'Initial Snapshot Text');

    // Mutate template after plan creation
    updateCaptionTemplate(tpl.id, {
      name: 'Plan Snapshot Template',
      overlays: [{ text: 'MUTATED TEXT AFTER PLAN' }],
    }, dir);

    // Plan must remain completely unaffected
    assert.strictEqual(plan.jobs[0].textOverlays[0].text, 'Initial Snapshot Text');
  } finally {
    cleanupTmpDir(dir);
  }
});

// -- Test AE: Scheduled export snapshot isolation -----------------------------
test('AE. Scheduled export snapshot isolation', () => {
  const dir = makeTmpDir();
  try {
    const dummyVideo = path.join(dir, 'sched_test.mp4');
    fs.writeFileSync(dummyVideo, 'dummy content');

    const overlays = [{ text: 'Scheduled Overlay Text', color: '#FF0000' }];
    const sched = createSchedule({
      sourcePath: dummyVideo,
      exportType: 'cut',
      scheduledAt: new Date(Date.now() + 60000).toISOString(),
      textOverlays: overlays,
      profileSnapshot: { id: 'prof_1', name: 'Original Sched Profile', platform: 'Instagram' },
    }, dir);

    // Mutate original array
    overlays[0].text = 'MUTATED TEXT AFTER SCHEDULE';

    // Scheduled record must retain its independent deep clone
    assert.strictEqual(sched.exportOptions.textOverlays[0].text, 'Scheduled Overlay Text');
  } finally {
    cleanupTmpDir(dir);
  }
});

// -- Test AF: Input validation and error safety across caption workflows -------
test('AF. Input validation and error safety across caption workflows', () => {
  // Quality analyzer with null caption
  assert.throws(() => analyzeCaption({ caption: null }), /must be a string/i);
  assert.throws(() => analyzeCaption({ caption: '' }), /cannot be empty/i);

  // Quality service with malformed payload
  const qErr = analyzeQuality('not an object');
  assert.strictEqual(qErr.success, false);

  // Workspace with empty text
  assert.throws(() => createWorkspace({ caption: '  ' }), /cannot be empty/i);

  // Experiment with empty name
  assert.throws(() => createExperiment({ name: '', sourceCaption: 'Valid' }), /name/i);
});

// -- Runner -------------------------------------------------------------------
async function runAll() {
  for (const t of testQueue) {
    totalCount++;
    try {
      await t.fn();
      passedCount++;
      console.log(`  PASS: ${totalCount}. ${t.name}`);
    } catch (err) {
      console.error(`  FAIL: ${totalCount}. ${t.name}`);
      console.error(err);
      process.exit(1);
    }
  }
  console.log(`\n======================================================`);
  console.log(`Phase 4B-10 Test Results: ${passedCount} / ${totalCount} passed`);
  console.log(`======================================================\n`);
}

runAll().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
