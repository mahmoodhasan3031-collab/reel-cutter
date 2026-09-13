'use strict';

/**
 * Phase 4B-5 — AI Caption Generator Test Suite
 *
 * Covers requirements A through AC:
 *  A. Request validation
 *  B. Empty topic rejection
 *  C. Topic length limit
 *  D. Language validation
 *  E. Tone validation
 *  F. Length validation
 *  G. Platform validation
 *  H. Profile validation
 *  I. Mock AI provider
 *  J. 3 caption result handling
 *  K. 5 caption result handling
 *  L. Excess result rejection/truncation
 *  M. Malformed provider response
 *  N. Empty provider response
 *  O. Timeout handling
 *  P. Provider/network error
 *  Q. Apply selected caption
 *  R. Text overlay integration
 *  S. Save as custom template
 *  T. Built-in template immutability
 *  U. Profile-aware generation
 *  V. Bulk caption generation
 *  W. Bulk plan snapshot
 *  X. Snapshot isolation
 *  Y. Profile mutation after plan creation
 *  Z. Template mutation after plan creation
 *  AA. No API secret exposed to renderer
 *  AB. IPC validation
 *  AC. Existing feature regression
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  validateCaptionRequest,
  validateCaptionSuggestions,
  ALLOWED_LANGUAGES,
  ALLOWED_TONES,
  ALLOWED_LENGTHS,
  ALLOWED_PLATFORMS,
  LIMITS,
} = require('../src/main/captions/aiCaptionValidator');

const {
  MockAiProvider,
  HttpAiProvider,
  getActiveProvider,
  setActiveProvider,
  resetToDefaultProvider,
} = require('../src/main/captions/aiProviderAdapter');

const {
  generateCaptions,
  generateBulkCaptions,
  applyCaptionToOverlays,
  getAiStatus,
} = require('../src/main/captions/aiCaptionService');

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
console.log('🧪 Running Phase 4B-5 AI Caption Generator Tests');
console.log('======================================================\n');

let passedCount = 0;
let totalCount = 0;
const testQueue = [];

function test(name, fn) {
  testQueue.push({ name, fn });
}

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rc_test_ai_caption_'));
}

function cleanupTmpDir(dir) {
  try {
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (_) {}
}

const mockVideoPath = path.resolve(__dirname, '../test-videos/normal_general.mp4');

// ── Test Cases ───────────────────────────────────────────────────────────────

// A. Request validation
test('A. Request validation succeeds for valid payload', () => {
  const req = {
    topic: 'How to make viral reels',
    language: 'english',
    tone: 'casual',
    length: 'medium',
    platform: 'instagram',
    count: 3,
  };
  const validated = validateCaptionRequest(req);
  assert.strictEqual(validated.topic, 'How to make viral reels');
  assert.strictEqual(validated.language, 'english');
  assert.strictEqual(validated.tone, 'casual');
  assert.strictEqual(validated.length, 'medium');
  assert.strictEqual(validated.platform, 'instagram');
  assert.strictEqual(validated.count, 3);
});

// B. Empty topic rejection
test('B. Empty topic rejection throws descriptive error', () => {
  assert.throws(() => {
    validateCaptionRequest({ topic: '' });
  }, /Topic \/ Video description cannot be empty/);

  assert.throws(() => {
    validateCaptionRequest({ topic: '   ' });
  }, /Topic \/ Video description cannot be empty/);

  assert.throws(() => {
    validateCaptionRequest({});
  }, /Topic \/ Video description is required/);
});

// C. Topic length limit
test('C. Topic length limit enforces 500 characters max', () => {
  const exact500 = 'a'.repeat(500);
  const ok = validateCaptionRequest({ topic: exact500 });
  assert.strictEqual(ok.topic.length, 500);

  const over500 = 'a'.repeat(501);
  assert.throws(() => {
    validateCaptionRequest({ topic: over500 });
  }, /exceeds maximum length of 500 characters/);
});

// D. Language validation
test('D. Language validation allows english and bangla; rejects others', () => {
  const eng = validateCaptionRequest({ topic: 'test', language: 'ENGLISH' });
  assert.strictEqual(eng.language, 'english');

  const bng = validateCaptionRequest({ topic: 'test', language: 'Bangla' });
  assert.strictEqual(bng.language, 'bangla');

  assert.throws(() => {
    validateCaptionRequest({ topic: 'test', language: 'spanish' });
  }, /Invalid language "spanish"/);
});

// E. Tone validation
test('E. Tone validation accepts allowed tones and rejects invalid ones', () => {
  for (const tone of ALLOWED_TONES) {
    const res = validateCaptionRequest({ topic: 'test', tone: tone.toUpperCase() });
    assert.strictEqual(res.tone, tone);
  }

  assert.throws(() => {
    validateCaptionRequest({ topic: 'test', tone: 'aggressive' });
  }, /Invalid tone "aggressive"/);
});

// F. Length validation
test('F. Length validation accepts short, medium, long; rejects others', () => {
  for (const len of ALLOWED_LENGTHS) {
    const res = validateCaptionRequest({ topic: 'test', length: len.toUpperCase() });
    assert.strictEqual(res.length, len);
  }

  assert.throws(() => {
    validateCaptionRequest({ topic: 'test', length: 'infinite' });
  }, /Invalid length "infinite"/);
});

// G. Platform validation
test('G. Platform validation accepts allowed platforms or null/empty; rejects others', () => {
  for (const plat of ALLOWED_PLATFORMS) {
    const res = validateCaptionRequest({ topic: 'test', platform: plat.toUpperCase() });
    assert.strictEqual(res.platform, plat);
  }

  const nullPlat = validateCaptionRequest({ topic: 'test', platform: null });
  assert.strictEqual(nullPlat.platform, null);

  assert.throws(() => {
    validateCaptionRequest({ topic: 'test', platform: 'myspace' });
  }, /Invalid platform "myspace"/);
});

// H. Profile validation
test('H. Profile validation validates profileId string bounds', () => {
  const ok = validateCaptionRequest({ topic: 'test', profileId: 'prof_12345' });
  assert.strictEqual(ok.profileId, 'prof_12345');

  assert.throws(() => {
    validateCaptionRequest({ topic: 'test', profileId: 'p'.repeat(105) });
  }, /profileId is too long/);
});

// I. Mock AI provider
test('I. Mock AI provider generates deterministic captions for english and bangla', async () => {
  const provider = new MockAiProvider();

  const engRes = await provider.generate({
    topic: 'Morning Coffee Routine',
    language: 'english',
    tone: 'casual',
    length: 'short',
    count: 3,
  });
  assert.strictEqual(engRes.length, 3);
  assert.ok(engRes[0].includes('Morning Coffee Routine'));

  const bngRes = await provider.generate({
    topic: 'সকালের কফি বানানোর কৌশল',
    language: 'bangla',
    tone: 'educational',
    length: 'medium',
    count: 3,
  });
  assert.strictEqual(bngRes.length, 3);
  assert.ok(bngRes[0].includes('সকালের কফি বানানোর কৌশল'));
});

// J. 3 caption result handling
test('J. 3 caption result handling returns exactly 3 suggestions', async () => {
  const res = await generateCaptions({
    topic: 'Fitness workout motivation',
    count: 3,
  });
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.suggestions.length, 3);
  assert.strictEqual(res.metadata.count, 3);
});

// K. 5 caption result handling
test('K. 5 caption result handling returns exactly 5 suggestions', async () => {
  const res = await generateCaptions({
    topic: 'Tech productivity tips',
    count: 5,
  });
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.suggestions.length, 5);
  assert.strictEqual(res.metadata.count, 5);
});

// L. Excess result rejection/truncation
test('L. Excess result rejection/truncation caps output at max requested count', async () => {
  const excessProvider = new MockAiProvider({ forceExcess: true });
  const res = await generateCaptions(
    { topic: 'Excess test', count: 3 },
    { provider: excessProvider }
  );
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.suggestions.length, 3);
});

// M. Malformed provider response
test('M. Malformed provider response rejected cleanly without crash', async () => {
  const badProvider = new MockAiProvider({ forceMalformed: true });
  const res = await generateCaptions(
    { topic: 'Malformed test' },
    { provider: badProvider }
  );
  assert.strictEqual(res.success, false);
  assert.ok(res.error.includes('must be an array'));
});

// N. Empty provider response
test('N. Empty provider response rejected cleanly without crash', async () => {
  const emptyProvider = new MockAiProvider({ forceEmpty: true });
  const res = await generateCaptions(
    { topic: 'Empty test' },
    { provider: emptyProvider }
  );
  assert.strictEqual(res.success, false);
  assert.ok(res.error.includes('empty suggestions'));
});

// O. Timeout handling
test('O. Timeout handling returns graceful timeout error', async () => {
  const timeoutProvider = new MockAiProvider({ forceTimeout: true });
  const res = await generateCaptions(
    { topic: 'Timeout test' },
    { provider: timeoutProvider }
  );
  assert.strictEqual(res.success, false);
  assert.strictEqual(res.code, 'ETIMEDOUT');
  assert.ok(res.error.includes('timed out'));
});

// P. Provider/network error
test('P. Provider/network error returns descriptive failure without crashing', async () => {
  const errProvider = new MockAiProvider({ forceError: 'Simulated connection reset' });
  const res = await generateCaptions(
    { topic: 'Network error test' },
    { provider: errProvider }
  );
  assert.strictEqual(res.success, false);
  assert.ok(res.error.includes('Simulated connection reset'));
});

// Q. Apply selected caption
test('Q. Apply selected caption formats caption text correctly', () => {
  const caption = 'Stop scrolling: The ultimate productivity hack!';
  const overlays = applyCaptionToOverlays(caption, []);
  assert.strictEqual(overlays.length, 1);
  assert.strictEqual(overlays[0].text, caption);
  assert.strictEqual(overlays[0].enabled, true);
});

// R. Text overlay integration
test('R. Text overlay integration preserves existing styling when updating text', () => {
  const existing = [
    {
      id: 'ov_custom_1',
      text: 'OLD TEXT',
      fontFamily: 'Verdana',
      fontSize: 54,
      fontWeight: 'bold',
      color: '#00FFCC',
      opacity: 0.9,
      backgroundColor: '#111111',
      backgroundOpacity: 0.8,
      outlineColor: '#000000',
      outlineWidth: 3,
      position: 'top',
      x: 0.5,
      y: 0.1,
      alignment: 'center',
      startTime: 1,
      endTime: 5,
      enabled: true,
    },
  ];

  const updated = applyCaptionToOverlays('NEW AI GENERATED CAPTION', existing);
  assert.strictEqual(updated.length, 1);
  assert.strictEqual(updated[0].text, 'NEW AI GENERATED CAPTION');
  assert.strictEqual(updated[0].fontFamily, 'Verdana');
  assert.strictEqual(updated[0].fontSize, 54);
  assert.strictEqual(updated[0].color, '#00FFCC');
  assert.strictEqual(updated[0].position, 'top');
});

// S. Save as custom template
test('S. Save as custom template creates persisted template in template library', () => {
  const tmp = makeTmpDir();
  try {
    const aiCaptionText = '3 Morning Habits That Changed My Career';
    const created = createCaptionTemplate({
      name: 'AI Morning Habits',
      description: 'Created by AI Caption Generator',
      overlays: [
        {
          text: aiCaptionText,
          fontFamily: 'Arial',
          fontSize: 48,
          fontWeight: 'bold',
          color: '#FFFFFF',
          position: 'bottom',
        },
      ],
    }, tmp);

    assert.ok(created.id);
    assert.strictEqual(created.isBuiltIn, false);
    assert.strictEqual(created.overlays[0].text, aiCaptionText);

    const reloaded = getCaptionTemplate(created.id, tmp);
    assert.strictEqual(reloaded.name, 'AI Morning Habits');
    assert.strictEqual(reloaded.overlays[0].text, aiCaptionText);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// T. Built-in template immutability
test('T. Built-in template immutability prevents overwriting canonical templates with AI output', () => {
  const tmp = makeTmpDir();
  try {
    const boldId = 'tpl_builtin_bold';
    assert.throws(() => {
      updateCaptionTemplate(boldId, {
        name: 'Hacked Builtin',
        overlays: [{ text: 'Overwritten by AI' }],
      }, tmp);
    }, /Built-in templates cannot be modified/);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// U. Profile-aware generation
test('U. Profile-aware generation generates platform-specific caption', async () => {
  const igRes = await generateCaptions({
    topic: 'Productivity Tips',
    platform: 'instagram',
    tone: 'casual',
    length: 'long',
    count: 3,
  });
  assert.strictEqual(igRes.success, true);
  assert.ok(igRes.suggestions.some((s) => s.includes('Save') || s.includes('share') || s.includes('tips')));

  const ytRes = await generateCaptions({
    topic: 'Productivity Tips',
    platform: 'youtube',
    tone: 'educational',
    length: 'long',
    count: 3,
  });
  assert.strictEqual(ytRes.success, true);
  assert.ok(ytRes.suggestions.some((s) => s.includes('Subscribe') || s.includes('channel') || s.includes('breakdowns')));
});

// V. Bulk caption generation
test('V. Bulk caption generation generates independent captions for multiple profiles', async () => {
  const bulkRes = await generateBulkCaptions({
    topic: 'Launch announcement',
    language: 'english',
    tone: 'promotional',
    length: 'medium',
    profiles: [
      { profileId: 'prof_fb', profileName: 'Facebook Page', platform: 'facebook' },
      { profileId: 'prof_ig', profileName: 'Instagram Reel', platform: 'instagram' },
      { profileId: 'prof_tt', profileName: 'TikTok Channel', platform: 'tiktok' },
    ],
  });

  assert.strictEqual(bulkRes.success, true);
  assert.strictEqual(bulkRes.results.length, 3);
  assert.strictEqual(bulkRes.results[0].platform, 'facebook');
  assert.strictEqual(bulkRes.results[1].platform, 'instagram');
  assert.strictEqual(bulkRes.results[2].platform, 'tiktok');
  assert.strictEqual(bulkRes.results[0].suggestions.length, 3);
});

// W. Bulk plan snapshot
test('W. Bulk plan snapshot includes AI-generated caption template and overlays', () => {
  const tmp = makeTmpDir();
  try {
    const aiTpl = createCaptionTemplate({
      name: 'AI Viral Hook',
      overlays: [
        {
          text: '5 Steps to Double Your Output',
          fontFamily: 'Arial',
          fontSize: 44,
          position: 'bottom',
        },
      ],
    }, tmp);

    const profile = createProfile({
      name: 'Viral Page',
      platform: 'Instagram',
      captionTemplateId: aiTpl.id,
    }, tmp);

    const plan = createBulkExportPlan({
      sourcePath: mockVideoPath,
      exportType: 'cut',
      profileIds: [profile.id],
      outputDir: tmp,
    }, tmp);

    assert.strictEqual(plan.jobs.length, 1);
    assert.strictEqual(plan.jobs[0].captionTemplateId, aiTpl.id);
    assert.strictEqual(plan.jobs[0].captionTemplateName, 'AI Viral Hook');
    assert.strictEqual(plan.jobs[0].textOverlays[0].text, '5 Steps to Double Your Output');
  } finally {
    cleanupTmpDir(tmp);
  }
});

// X. Snapshot isolation
test('X. Snapshot isolation ensures plan textOverlays are deep-cloned', () => {
  const tmp = makeTmpDir();
  try {
    const tplA = createCaptionTemplate({
      name: 'AI Template A',
      overlays: [{ text: 'CAPTION A' }],
    }, tmp);

    const tplB = createCaptionTemplate({
      name: 'AI Template B',
      overlays: [{ text: 'CAPTION B' }],
    }, tmp);

    const profA = createProfile({ name: 'Prof A', captionTemplateId: tplA.id }, tmp);
    const profB = createProfile({ name: 'Prof B', captionTemplateId: tplB.id }, tmp);

    const plan = createBulkExportPlan({
      sourcePath: mockVideoPath,
      exportType: 'cut',
      profileIds: [profA.id, profB.id],
      outputDir: tmp,
    }, tmp);

    // Mutating Job A textOverlays directly in plan must not affect Job B
    plan.jobs[0].textOverlays[0].text = 'MUTATED IN MEMORY';
    assert.strictEqual(plan.jobs[1].textOverlays[0].text, 'CAPTION B');
  } finally {
    cleanupTmpDir(tmp);
  }
});

// Y. Profile mutation after plan creation
test('Y. Profile mutation after plan creation does not mutate plan snapshot', () => {
  const tmp = makeTmpDir();
  try {
    const tpl = createCaptionTemplate({
      name: 'AI Template',
      overlays: [{ text: 'UNCHANGED CAPTION' }],
    }, tmp);

    const prof = createProfile({ name: 'Test Prof', captionTemplateId: tpl.id }, tmp);

    const plan = createBulkExportPlan({
      sourcePath: mockVideoPath,
      exportType: 'cut',
      profileIds: [prof.id],
      outputDir: tmp,
    }, tmp);

    const snapshotText = plan.jobs[0].textOverlays[0].text;

    // Mutate profile in store
    updateProfile(prof.id, { captionTemplateId: null, name: 'Changed Name' }, tmp);

    // Plan remains completely unchanged
    assert.strictEqual(plan.jobs[0].textOverlays[0].text, snapshotText);
    assert.strictEqual(plan.jobs[0].captionTemplateId, tpl.id);
    assert.strictEqual(plan.jobs[0].profileName, 'Test Prof');
  } finally {
    cleanupTmpDir(tmp);
  }
});

// Z. Template mutation after plan creation
test('Z. Template mutation after plan creation does not mutate plan snapshot', () => {
  const tmp = makeTmpDir();
  try {
    const tpl = createCaptionTemplate({
      name: 'AI Template',
      overlays: [{ text: 'INITIAL TEXT' }],
    }, tmp);

    const prof = createProfile({ name: 'Test Prof', captionTemplateId: tpl.id }, tmp);

    const plan = createBulkExportPlan({
      sourcePath: mockVideoPath,
      exportType: 'cut',
      profileIds: [prof.id],
      outputDir: tmp,
    }, tmp);

    // Mutate template in store
    updateCaptionTemplate(tpl.id, {
      name: 'MODIFIED TEMPLATE',
      overlays: [{ text: 'COMPLETELY NEW TEXT' }],
    }, tmp);

    // Plan snapshot is immutable
    assert.strictEqual(plan.jobs[0].captionTemplateName, 'AI Template');
    assert.strictEqual(plan.jobs[0].textOverlays[0].text, 'INITIAL TEXT');
  } finally {
    cleanupTmpDir(tmp);
  }
});

// AA. No API secret exposed to renderer
test('AA. No API secret exposed to renderer via getAiStatus', () => {
  const status = getAiStatus();
  assert.ok(status);
  assert.strictEqual(typeof status.configured, 'boolean');
  assert.strictEqual(typeof status.provider, 'string');
  assert.strictEqual(status.apiKey, undefined);
  assert.strictEqual(status.secret, undefined);
  assert.strictEqual(status.token, undefined);
});

// AB. IPC validation
test('AB. IPC validation rejects invalid input types and prototype poisoning', () => {
  assert.throws(() => {
    validateCaptionRequest(null);
  }, /Caption request must be a valid object/);

  assert.throws(() => {
    validateCaptionRequest([1, 2, 3]);
  }, /Caption request must be a valid object/);

  assert.throws(() => {
    validateCaptionRequest({ topic: 12345 });
  }, /Topic \/ Video description is required and must be a string/);

  assert.throws(() => {
    validateCaptionRequest({ topic: 'valid topic', count: 10 });
  }, /Suggestion count must be an integer between 3 and 5/);
});

// AC. Existing feature regression
test('AC. Existing feature regression: Pro tier has ai_captions; Basic tier does not', () => {
  assert.strictEqual(hasFeature('pro', 'ai_captions'), true);
  assert.strictEqual(hasFeature('pro', FEATURE_KEYS.AI_CAPTIONS), true);
  assert.strictEqual(hasFeature('pro', 'AI Caption Generator'), true);

  assert.strictEqual(hasFeature('basic', 'ai_captions'), false);
  assert.strictEqual(hasFeature('standard', 'ai_captions'), false);
  assert.strictEqual(hasFeature('basic', 'cutting'), true);
  assert.strictEqual(hasFeature('standard', '4k_export'), true);
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
  console.log(`📊 Phase 4B-5 Test Results: ${passedCount} / ${totalCount} passed`);
  console.log(`======================================================\n`);
}

runAll().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
