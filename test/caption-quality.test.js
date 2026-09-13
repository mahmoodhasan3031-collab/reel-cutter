'use strict';

/**
 * Phase 4B-6 — Caption Quality & Intelligence Test Suite
 *
 * Tests A through AJ:
 *  A. Valid caption analysis
 *  B. Empty caption rejection
 *  C. Maximum caption length
 *  D. Score always 0–100
 *  E. Signal scores always 0–100
 *  F. Grade mapping
 *  G. Readability scoring
 *  H. Bangla caption handling
 *  I. English caption handling
 *  J. Topic relevance with topic
 *  K. Relevance without topic
 *  L. CTA detection
 *  M. No-CTA informational caption handling
 *  N. Repetition detection
 *  O. Excessive punctuation detection
 *  P. Excessive emoji detection
 *  Q. Quality suggestions generation
 *  R. Original caption remains immutable during analysis
 *  S. Improve request validation
 *  T. Mock AI improvement
 *  U. Malformed improvement response
 *  V. AI timeout handling
 *  W. AI provider error handling
 *  X. Improved caption validation
 *  Y. Apply improved caption
 *  Z. Text overlay integration
 *  AA. Save improved caption as custom template
 *  AB. Built-in template immutability
 *  AC. Profile-aware analysis
 *  AD. Bulk quality analysis
 *  AE. Bulk improvement
 *  AF. Bulk snapshot isolation
 *  AG. Profile mutation does not change snapshot
 *  AH. Template mutation does not change snapshot
 *  AI. IPC validation
 *  AJ. Existing feature regression
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  analyzeCaption,
  _scoreReadability,
  _scoreRelevance,
  _scoreClarity,
  _scoreCta,
  _scoreStructure,
  _gradeFromScore,
  MAX_CAPTION_LENGTH,
} = require('../src/main/captions/captionQualityAnalyzer');

const {
  analyzeQuality,
  improveCaption,
  analyzeBulkQuality,
} = require('../src/main/captions/captionQualityService');

const {
  applyCaptionToOverlays,
} = require('../src/main/captions/aiCaptionService');

const {
  MockAiProvider,
  setActiveProvider,
  resetToDefaultProvider,
} = require('../src/main/captions/aiProviderAdapter');

const {
  createProfile,
  updateProfile,
  listProfiles,
} = require('../src/main/profiles/profileManager');

const {
  createCaptionTemplate,
  updateCaptionTemplate,
  getCaptionTemplate,
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
console.log('🧪 Running Phase 4B-6 Caption Quality & Intelligence Tests');
console.log('======================================================\n');

let passedCount = 0;
let totalCount = 0;
const testQueue = [];

function test(name, fn) {
  testQueue.push({ name, fn });
}

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rc_test_caption_quality_'));
}

function cleanupTmpDir(dir) {
  try {
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (_) {}
}

// A. Valid caption analysis
test('A. Valid caption analysis returns valid structured result', () => {
  const result = analyzeCaption({
    caption: 'Discover the top 3 productivity habits that will transform your daily workflow. Start today!',
    topic: 'productivity habits',
    language: 'english',
    tone: 'promotional',
  });

  assert.strictEqual(typeof result.score, 'number');
  assert.ok(result.score >= 0 && result.score <= 100);
  assert.ok(['A', 'B', 'C', 'D', 'F'].includes(result.grade));
  assert.ok(result.signals && typeof result.signals === 'object');
  assert.ok(Array.isArray(result.strengths));
  assert.ok(Array.isArray(result.suggestions));
});

// B. Empty caption rejection
test('B. Empty caption rejection (empty string, whitespace, null)', () => {
  assert.throws(() => analyzeCaption({ caption: '' }), /Caption cannot be empty/);
  assert.throws(() => analyzeCaption({ caption: '   ' }), /Caption cannot be empty/);
  assert.throws(() => analyzeCaption({ caption: null }), /Caption must be a string/);
  assert.throws(() => analyzeCaption({}), /Caption must be a string/);
});

// C. Maximum caption length
test('C. Maximum caption length enforcement (500 chars)', () => {
  const overMax = 'a'.repeat(MAX_CAPTION_LENGTH + 1);
  assert.throws(() => analyzeCaption({ caption: overMax }), /exceeds maximum length/);

  const exactMax = 'a'.repeat(MAX_CAPTION_LENGTH);
  const result = analyzeCaption({ caption: exactMax });
  assert.ok(result.score >= 0 && result.score <= 100);
});

// D. Score always 0-100
test('D. Score is always bounded within [0, 100]', () => {
  const samples = [
    '!',
    'a',
    'Short caption.',
    'Very well constructed caption with good flow, great readability, clear relevance to video editing, and strong call to action. Subscribe now!',
    'Repeated repeated repeated repeated repeated repeated repeated repeated words words words words words words words words ??????!!!!! 🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀',
  ];

  for (const s of samples) {
    const res = analyzeCaption({ caption: s });
    assert.ok(res.score >= 0 && res.score <= 100, `Score ${res.score} out of bounds for "${s}"`);
  }
});

// E. Signal scores always 0-100
test('E. Signal scores (readability, relevance, clarity, cta, structure) all 0-100', () => {
  const res = analyzeCaption({
    caption: 'Learn how to master video editing fast! Tap the link in bio to explore more.',
    topic: 'video editing',
  });

  for (const [sig, val] of Object.entries(res.signals)) {
    assert.ok(typeof val === 'number', `${sig} is not a number`);
    assert.ok(val >= 0 && val <= 100, `${sig} = ${val} is not in [0, 100]`);
  }
});

// F. Grade mapping
test('F. Grade mapping (A >= 90, B >= 80, C >= 70, D >= 60, F < 60)', () => {
  assert.strictEqual(_gradeFromScore(95), 'A');
  assert.strictEqual(_gradeFromScore(90), 'A');
  assert.strictEqual(_gradeFromScore(89), 'B');
  assert.strictEqual(_gradeFromScore(80), 'B');
  assert.strictEqual(_gradeFromScore(79), 'C');
  assert.strictEqual(_gradeFromScore(70), 'C');
  assert.strictEqual(_gradeFromScore(69), 'D');
  assert.strictEqual(_gradeFromScore(60), 'D');
  assert.strictEqual(_gradeFromScore(59), 'F');
  assert.strictEqual(_gradeFromScore(0), 'F');
});

// G. Readability scoring
test('G. Readability scoring penalizes overly long sentences and words', () => {
  const readable = 'Easy steps to edit your video.\nKeep cuts short and clean.';
  const complex = 'Supercalifragilisticexpialidocious institutionalization counterrevolutionaries compartmentalization antidisestablishmentarianism incomprehensibilities.' +
    ' Furthermore notwithstanding nevertheless whereas extraterritoriality.';

  const rScore1 = _scoreReadability(readable);
  const rScore2 = _scoreReadability(complex);
  assert.ok(rScore1 > rScore2, `Expected readable (${rScore1}) > complex (${rScore2})`);
});

// H. Bangla caption handling
test('H. Bangla caption handling does not crash and produces valid metrics', () => {
  const banglaCaption = 'ভিডিও এডিটিং করার সহজ নিয়ম জেনে নিন। নতুন ভিডিওর জন্য সাবস্ক্রাইব করে রাখুন!';
  const res = analyzeCaption({
    caption: banglaCaption,
    language: 'bangla',
    topic: 'ভিডিও এডিটিং',
  });

  assert.ok(res.score >= 0 && res.score <= 100);
  assert.ok(['A', 'B', 'C', 'D', 'F'].includes(res.grade));
  assert.ok(res.signals.readability > 0);
  assert.ok(res.signals.cta >= 85); // contains সাবস্ক্রাইব
});

// I. English caption handling
test('I. English caption handling produces valid metrics', () => {
  const engCaption = 'Check out these 3 easy video editing tips to instantly upgrade your reels! Follow for more daily guides.';
  const res = analyzeCaption({
    caption: engCaption,
    language: 'english',
    topic: 'video editing',
  });

  assert.ok(res.score >= 0 && res.score <= 100);
  assert.ok(res.signals.cta >= 85); // contains 'follow'
  assert.ok(res.strengths.length > 0);
});

// J. Topic relevance with topic
test('J. Topic relevance scoring with matching and non-matching topics', () => {
  const caption = 'Mastering the art of landscape photography with simple lighting tricks.';
  const matchingScore = _scoreRelevance(caption, 'landscape photography');
  const nonMatchingScore = _scoreRelevance(caption, 'cooking gourmet pasta recipes');

  assert.ok(matchingScore > nonMatchingScore, `Expected matching (${matchingScore}) > nonMatching (${nonMatchingScore})`);
});

// K. Relevance without topic
test('K. Relevance without topic returns neutral baseline (70)', () => {
  const score1 = _scoreRelevance('Any caption here', null);
  const score2 = _scoreRelevance('Any caption here', '');
  const score3 = _scoreRelevance('Any caption here', undefined);

  assert.strictEqual(score1, 70);
  assert.strictEqual(score2, 70);
  assert.strictEqual(score3, 70);
});

// L. CTA detection
test('L. CTA detection identifies common English and Bangla action calls', () => {
  const cta1 = _scoreCta('Follow for daily updates and tips!', 'casual');
  const cta2 = _scoreCta('Share this video with someone who needs it!', 'casual');
  const ctaBangla = _scoreCta('আরও ভিডিওর জন্য চ্যানেলটি সাবস্ক্রাইব করুন!', 'casual');

  assert.ok(cta1 >= 85);
  assert.ok(cta2 >= 85);
  assert.ok(ctaBangla >= 85);
});

// M. No-CTA informational caption handling
test('M. No-CTA informational caption is not heavily penalized', () => {
  const informational = _scoreCta('The sun is a star at the center of the Solar System.', 'educational');
  const promotionalNoCta = _scoreCta('Best product on the market! Get the maximum performance!', 'promotional');

  assert.ok(informational >= 70, `Informational score was ${informational}`);
  assert.ok(informational > promotionalNoCta, `Expected informational (${informational}) > promotional without CTA (${promotionalNoCta})`);
});

// N. Repetition detection
test('N. Repetition detection penalizes heavily repeated phrases', () => {
  const clean = 'A distinct sentence with unique vocabulary throughout the entire thought.';
  const repetitive = 'Buy now buy now buy now buy now buy now buy now buy now product product product product.';

  const cClean = _scoreClarity(clean);
  const cRep = _scoreClarity(repetitive);
  assert.ok(cClean > cRep, `Expected clean (${cClean}) > repetitive (${cRep})`);
});

// O. Excessive punctuation detection
test('O. Excessive punctuation detection penalizes multiple exclamation/question marks', () => {
  const normal = 'Great video on cutting reels!';
  const excessive = 'Great video on cutting reels!!!!!!! WOW????? Really???????';

  const sNormal = _scoreClarity(normal);
  const sExcess = _scoreClarity(excessive);
  assert.ok(sNormal > sExcess, `Expected normal (${sNormal}) > excessive (${sExcess})`);
});

// P. Excessive emoji detection
test('P. Excessive emoji detection penalizes excessive emoji usage', () => {
  const normal = 'Nice tutorial! ✨';
  const excessive = 'Nice tutorial! 🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🚀🚀🚀👀👀👀';

  const sNormal = _scoreClarity(normal);
  const sExcess = _scoreClarity(excessive);
  assert.ok(sNormal > sExcess, `Expected normal (${sNormal}) > excessive (${sExcess})`);
});

// Q. Quality suggestions generation
test('Q. Quality suggestions generated when signals are suboptimal', () => {
  const weakCaption = 'Buy buy buy buy buy buy buy buy buy buy buy buy buy buy buy buy buy buy buy buy buy buy buy buy buy buy buy buy buy buy buy buy buy buy buy buy buy buy buy buy buy buy buy buy buy buy buy buy buy buy buy buy';
  const res = analyzeCaption({ caption: weakCaption });
  assert.ok(Array.isArray(res.suggestions));
  assert.ok(res.suggestions.length > 0);
});

// R. Original caption remains immutable during analysis
test('R. Original caption remains immutable during analysis', () => {
  const original = 'Immutable test caption. Learn more today!';
  const copy = original.slice();
  analyzeCaption({ caption: original, topic: 'immutable' });
  assert.strictEqual(original, copy);
});

// S. Improve request validation
test('S. Improve request validation checks payload correctness', async () => {
  const res1 = await improveCaption({});
  assert.strictEqual(res1.success, false);
  assert.ok(/caption is required/.test(res1.error));

  const res2 = await improveCaption({ caption: '' });
  assert.strictEqual(res2.success, false);
  assert.ok(/cannot be empty/.test(res2.error));
});

// T. Mock AI improvement
test('T. Mock AI improvement generates improved caption and comparative scores', async () => {
  resetToDefaultProvider();
  const res = await improveCaption({
    caption: 'Check out video tips.',
    topic: 'video editing tips',
    language: 'english',
    tone: 'casual',
  });

  assert.strictEqual(res.success, true);
  assert.ok(typeof res.original === 'string');
  assert.ok(typeof res.improved === 'string');
  assert.ok(typeof res.originalScore === 'number');
  assert.ok(typeof res.improvedScore === 'number');
  assert.ok(res.improved.length > 0);
});

// U. Malformed improvement response
test('U. Malformed improvement response from provider is caught and handled safely', async () => {
  const malformedProvider = new MockAiProvider({ forceMalformed: true });
  const res = await improveCaption(
    { caption: 'Valid test caption' },
    { provider: malformedProvider }
  );

  assert.strictEqual(res.success, false);
  assert.ok(res.error);
});

// V. AI timeout handling
test('V. AI timeout handling gracefully returns error on timeout', async () => {
  const timeoutProvider = new MockAiProvider({ forceTimeout: true });
  const res = await improveCaption(
    { caption: 'Valid test caption' },
    { provider: timeoutProvider }
  );

  assert.strictEqual(res.success, false);
  assert.ok(/timed out/.test(res.error));
});

// W. AI provider error handling
test('W. AI provider error handling captures upstream failures', async () => {
  const errorProvider = new MockAiProvider({ forceError: 'Simulated cloud failure' });
  const res = await improveCaption(
    { caption: 'Valid test caption' },
    { provider: errorProvider }
  );

  assert.strictEqual(res.success, false);
  assert.strictEqual(res.error, 'Simulated cloud failure');
});

// X. Improved caption validation
test('X. Improved caption conforms to overlay limits (non-empty, max 500 chars)', async () => {
  resetToDefaultProvider();
  const res = await improveCaption({
    caption: 'Short caption.',
    language: 'english',
    tone: 'educational',
  });

  assert.strictEqual(res.success, true);
  assert.ok(res.improved.length > 0);
  assert.ok(res.improved.length <= MAX_CAPTION_LENGTH);
});

// Y. Apply improved caption
test('Y. Apply improved caption updates existing overlays without mutating original', () => {
  const existingOverlays = [
    {
      id: 'ov_1',
      text: 'Original Text',
      fontFamily: 'Arial',
      fontSize: 48,
      fontWeight: 'bold',
      color: '#FFFFFF',
      enabled: true,
    },
  ];

  const updated = applyCaptionToOverlays('Improved Text Here!', existingOverlays);

  // Original array remains intact
  assert.strictEqual(existingOverlays[0].text, 'Original Text');
  // New array has improved text
  assert.strictEqual(updated[0].text, 'Improved Text Here!');
  // Styling is preserved
  assert.strictEqual(updated[0].fontSize, 48);
  assert.strictEqual(updated[0].fontWeight, 'bold');
});

// Z. Text overlay integration
test('Z. Text overlay integration creates valid overlay when starting with empty array', () => {
  const result = applyCaptionToOverlays('Brand New Overlay Text', []);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].text, 'Brand New Overlay Text');
  assert.strictEqual(result[0].enabled, true);
  assert.ok(result[0].id);
});

// AA. Save improved caption as custom template
test('AA. Save improved caption as custom template succeeds', () => {
  const tmpDir = makeTmpDir();
  try {
    const template = createCaptionTemplate(
      {
        name: `Quality Test Template ${Date.now()}`,
        description: 'Template created from quality intelligence',
        overlays: [
          {
            text: 'Quality Tested Caption',
            fontSize: 42,
            fontFamily: 'Verdana',
          },
        ],
      },
      tmpDir
    );

    assert.ok(template.id);
    assert.strictEqual(template.isBuiltIn, false);
    assert.strictEqual(template.overlays[0].text, 'Quality Tested Caption');
  } finally {
    cleanupTmpDir(tmpDir);
  }
});

// AB. Built-in template immutability
test('AB. Built-in templates cannot be modified or overwritten by quality improvements', () => {
  const tmpDir = makeTmpDir();
  try {
    const builtinId = CANONICAL_BUILTINS[0].id;
    assert.throws(() => {
      updateCaptionTemplate(builtinId, { name: 'Attempted Overwrite' }, tmpDir);
    }, /Built-in templates cannot be modified/i);
  } finally {
    cleanupTmpDir(tmpDir);
  }
});

// AC. Profile-aware analysis
test('AC. Profile-aware analysis incorporates platform and tone context', () => {
  const res1 = analyzeQuality({
    caption: 'Visit our site to sign up now!',
    platform: 'facebook',
    tone: 'promotional',
    profileId: 'prof_fb_123',
  });

  assert.strictEqual(res1.success, true);
  assert.strictEqual(res1.metadata.platform, 'facebook');
  assert.strictEqual(res1.metadata.profileId, 'prof_fb_123');
});

// AD. Bulk quality analysis
test('AD. Bulk quality analysis processes multiple profiles and provides summary', () => {
  const bulkPayload = {
    entries: [
      {
        profileId: 'p1',
        profileName: 'TikTok Profile',
        caption: 'Follow for daily tips! ✨',
      },
      {
        profileId: 'p2',
        profileName: 'YouTube Profile',
        caption: 'Subscribe to our channel for comprehensive weekly breakdowns.',
      },
    ],
  };

  const res = analyzeBulkQuality(bulkPayload);
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.results.length, 2);
  assert.strictEqual(res.summary.totalEntries, 2);
  assert.strictEqual(res.summary.analyzed, 2);
  assert.ok(res.summary.averageScore >= 0);
});

// AE. Bulk improvement
test('AE. Bulk improvement handles individual profile improvements explicitly', async () => {
  resetToDefaultProvider();
  const entries = [
    { caption: 'Quick video tip 1', profileId: 'p1', topic: 'video editing' },
    { caption: 'Quick video tip 2', profileId: 'p2', topic: 'color grading' },
  ];

  const results = [];
  for (const entry of entries) {
    const imp = await improveCaption(entry);
    assert.strictEqual(imp.success, true);
    results.push(imp);
  }

  assert.strictEqual(results.length, 2);
  assert.notStrictEqual(results[0].improved, '');
  assert.notStrictEqual(results[1].improved, '');
});

// AF. Bulk snapshot isolation
test('AF. Bulk export plan with captions preserves snapshot isolation', () => {
  const tmpDir = makeTmpDir();

  try {
    const prof = createProfile({ name: 'Quality Bulk Profile', platform: 'Instagram' }, tmpDir);
    const tpl = createCaptionTemplate({
      name: 'Plan Caption Template',
      overlays: [{ text: 'Snapshot Caption Before Edit', fontSize: 36 }],
    }, tmpDir);

    updateProfile(prof.id, { captionTemplateId: tpl.id }, tmpDir);

    const plan = createBulkExportPlan(
      {
        sourcePath: 'dummy.mp4',
        profileIds: [prof.id],
      },
      tmpDir
    );

    assert.strictEqual(plan.jobs.length, 1);
    const jobOverlay = plan.jobs[0].textOverlays[0];
    assert.strictEqual(jobOverlay.text, 'Snapshot Caption Before Edit');

    // Mutate template
    updateCaptionTemplate(tpl.id, { name: 'Mutated Template Name', overlays: [{ text: 'MUTATED TEXT' }] }, tmpDir);

    // Plan remains isolated
    assert.strictEqual(plan.jobs[0].textOverlays[0].text, 'Snapshot Caption Before Edit');
  } finally {
    cleanupTmpDir(tmpDir);
  }
});

// AG. Profile mutation does not change snapshot
test('AG. Profile mutation after plan creation does not change snapshot', () => {
  const tmpProfiles = makeTmpDir();
  try {
    const prof = createProfile({ name: 'Original Name', platform: 'YouTube' }, tmpProfiles);
    const plan = createBulkExportPlan(
      {
        sourcePath: 'dummy.mp4',
        profileIds: [prof.id],
      },
      tmpProfiles
    );

    assert.strictEqual(plan.jobs[0].profileName, 'Original Name');

    // Mutate profile
    updateProfile(prof.id, { name: 'CHANGED NAME' }, tmpProfiles);

    // Plan profileName remains unchanged
    assert.strictEqual(plan.jobs[0].profileName, 'Original Name');
  } finally {
    cleanupTmpDir(tmpProfiles);
  }
});

// AH. Template mutation does not change snapshot
test('AH. Template mutation after plan creation does not change snapshot', () => {
  const tmpDir = makeTmpDir();
  try {
    const tpl = createCaptionTemplate({
      name: 'Isolation Template',
      overlays: [{ text: 'Immutable Plan Text' }],
    }, tmpDir);
    const prof = createProfile({ name: 'Prof', platform: 'Other', captionTemplateId: tpl.id }, tmpDir);

    const plan = createBulkExportPlan(
      { sourcePath: 'dummy.mp4', profileIds: [prof.id] },
      tmpDir
    );

    // Mutate template overlays
    updateCaptionTemplate(tpl.id, { overlays: [{ text: 'NEW POST-PLAN TEXT' }] }, tmpDir);

    // Plan text unchanged
    assert.strictEqual(plan.jobs[0].textOverlays[0].text, 'Immutable Plan Text');
  } finally {
    cleanupTmpDir(tmpDir);
  }
});

// AI. IPC validation
test('AI. IPC payload validation rejects invalid or malicious inputs', () => {
  const invalidPayloads = [
    null,
    undefined,
    12345,
    { caption: 999 },
    { caption: '' },
    { caption: 'Valid', language: 'unsupported_lang' },
    { caption: 'Valid', tone: 'unsupported_tone' },
    { caption: 'Valid', platform: 'unsupported_platform' },
  ];

  for (const p of invalidPayloads) {
    const res = analyzeQuality(p);
    assert.strictEqual(res.success, false, `Expected failure for payload: ${JSON.stringify(p)}`);
  }
});

// AJ. Existing feature regression
test('AJ. Existing feature regression: Pro tier has caption_quality; Basic/Standard do not', () => {
  assert.strictEqual(hasFeature('pro', 'caption_quality'), true);
  assert.strictEqual(hasFeature('pro', FEATURE_KEYS.CAPTION_QUALITY), true);
  assert.strictEqual(hasFeature('pro', 'caption quality'), true);
  assert.strictEqual(hasFeature('pro', 'Caption Quality & Intelligence'), true);

  assert.strictEqual(hasFeature('basic', 'caption_quality'), false);
  assert.strictEqual(hasFeature('standard', 'caption_quality'), false);

  // Existing features remain intact
  assert.strictEqual(hasFeature('basic', 'cutting'), true);
  assert.strictEqual(hasFeature('standard', '4k_export'), true);
  assert.strictEqual(hasFeature('pro', 'ai_captions'), true);
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
  console.log(`📊 Phase 4B-6 Test Results: ${passedCount} / ${totalCount} passed`);
  console.log(`======================================================\n`);
}

runAll().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
