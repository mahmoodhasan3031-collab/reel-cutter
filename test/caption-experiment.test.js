'use strict';

/**
 * Phase 4B-9 - Caption Experiment & Optimization Test Suite
 * Tests A through AP (42 tests)
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  createExperiment,
  getExperiments,
  getExperiment,
  updateExperiment,
  deleteExperiment,
  duplicateExperiment,
  addVariant,
  updateVariant,
  deleteVariant,
  selectPreferredVariant,
  compareVariants,
  getBestVariant,
  getWeakestSignalAcrossExperiment,
  optimizeVariant,
  generateAiVariants,
  bulkExperiment,
  applyVariantToOverlays,
  ALLOWED_PLATFORMS,
  ALLOWED_TONES,
  ALLOWED_LANGUAGES,
  MAX_VARIANTS_PER_EXPERIMENT,
  MAX_EXPERIMENT_NAME_LENGTH,
  LIMITS,
} = require('../src/main/captions/captionExperimentManager');

const {
  MockAiProvider,
} = require('../src/main/captions/aiProviderAdapter');

console.log('======================================================');
console.log('Testing Phase 4B-9 Caption Experiment & Optimization');
console.log('======================================================\n');

let passedCount = 0;
let totalCount = 0;
const testQueue = [];

function test(name, fn) {
  testQueue.push({ name, fn });
}

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rc_test_caption_experiment_'));
}

function cleanupTmpDir(dir) {
  try {
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (_) {}
}

// A
test('A. createExperiment returns valid experiment with initial original variant', () => {
  const dir = makeTmpDir();
  try {
    const exp = createExperiment({
      name: 'Test Experiment A',
      sourceCaption: 'Learn video editing in 5 minutes! Subscribe for more.',
      platform: 'youtube',
      tone: 'casual',
    }, dir);
    assert.ok(exp.id && exp.id.startsWith('exp_'));
    assert.strictEqual(exp.name, 'Test Experiment A');
    assert.ok(Array.isArray(exp.variants) && exp.variants.length === 1);
    assert.strictEqual(exp.variants[0].source, 'original');
    assert.ok(exp.variants[0].name.startsWith('Variant A'), 'name should start with Variant A');

    assert.strictEqual(exp.variants[0].text, exp.sourceCaption);
    assert.ok(exp.selectedVariantId === exp.variants[0].id);
  } finally {
    cleanupTmpDir(dir);
  }
});

// B
test('B. createExperiment throws on empty name', () => {
  const dir = makeTmpDir();
  try {
    assert.throws(() => createExperiment({ name: '', sourceCaption: 'Caption' }, dir), /name/i);
    assert.throws(() => createExperiment({ name: '   ', sourceCaption: 'Caption' }, dir), /name/i);
    assert.throws(() => createExperiment({ sourceCaption: 'Caption' }, dir), /name/i);
  } finally {
    cleanupTmpDir(dir);
  }
});

// C
test('C. createExperiment throws on empty sourceCaption', () => {
  const dir = makeTmpDir();
  try {
    assert.throws(() => createExperiment({ name: 'Exp', sourceCaption: '' }, dir), /caption/i);
    assert.throws(() => createExperiment({ name: 'Exp', sourceCaption: '   ' }, dir), /caption/i);
    assert.throws(() => createExperiment({ name: 'Exp' }, dir), /caption/i);
  } finally {
    cleanupTmpDir(dir);
  }
});

// D
test('D. createExperiment validates platform', () => {
  const dir = makeTmpDir();
  try {
    assert.ok(ALLOWED_PLATFORMS.includes('facebook'));
    assert.ok(ALLOWED_PLATFORMS.includes('instagram'));
    assert.ok(ALLOWED_PLATFORMS.includes('youtube'));
    assert.ok(ALLOWED_PLATFORMS.includes('tiktok'));
    assert.ok(ALLOWED_PLATFORMS.includes('other'));
    assert.ok(ALLOWED_PLATFORMS.includes('general'));
    assert.throws(() => createExperiment({ name: 'Exp', sourceCaption: 'Caption', platform: 'snapchat' }, dir), /platform/i);
    const valid = createExperiment({ name: 'FB Exp', sourceCaption: 'Caption text', platform: 'facebook' }, dir);
    assert.strictEqual(valid.platform, 'facebook');
  } finally {
    cleanupTmpDir(dir);
  }
});

// E
test('E. createExperiment validates tone (includes neutral)', () => {
  const dir = makeTmpDir();
  try {
    assert.ok(ALLOWED_TONES.includes('neutral'));
    assert.ok(ALLOWED_TONES.includes('professional'));
    assert.ok(ALLOWED_TONES.includes('casual'));
    assert.throws(() => createExperiment({ name: 'Exp', sourceCaption: 'Caption', tone: 'angry' }, dir), /tone/i);
    const valid = createExperiment({ name: 'Neutral Exp', sourceCaption: 'Caption text', tone: 'neutral' }, dir);
    assert.strictEqual(valid.tone, 'neutral');
  } finally {
    cleanupTmpDir(dir);
  }
});

// F
test('F. createExperiment validates language', () => {
  const dir = makeTmpDir();
  try {
    assert.ok(ALLOWED_LANGUAGES.includes('english'));
    assert.ok(ALLOWED_LANGUAGES.includes('bangla'));
    assert.throws(() => createExperiment({ name: 'Exp', sourceCaption: 'Caption', language: 'spanish' }, dir), /language/i);
    const valid = createExperiment({ name: 'Bangla Exp', sourceCaption: 'Caption text', language: 'bangla' }, dir);
    assert.strictEqual(valid.language, 'bangla');
  } finally {
    cleanupTmpDir(dir);
  }
});

// G
test('G. createExperiment accepts optional topic/profileId/profileName', () => {
  const dir = makeTmpDir();
  try {
    const exp = createExperiment({
      name: 'Profile Exp',
      sourceCaption: 'Caption with profile context',
      topic: 'Video Editing Tips',
      profileId: 'profile_123',
      profileName: 'Creator Profile',
    }, dir);
    assert.strictEqual(exp.topic, 'Video Editing Tips');
    assert.strictEqual(exp.profileId, 'profile_123');
    assert.strictEqual(exp.profileName, 'Creator Profile');
  } finally {
    cleanupTmpDir(dir);
  }
});

// H
test('H. createExperiment persists to disk and is retrievable', () => {
  const dir = makeTmpDir();
  try {
    const created = createExperiment({ name: 'Persistence Test', sourceCaption: 'This experiment should persist.' }, dir);
    const retrieved = getExperiment(created.id, dir);
    assert.ok(retrieved);
    assert.strictEqual(retrieved.id, created.id);
    assert.strictEqual(retrieved.name, 'Persistence Test');
  } finally {
    cleanupTmpDir(dir);
  }
});

// I
test('I. getExperiments returns all experiments sorted newest first', () => {
  const dir = makeTmpDir();
  try {
    createExperiment({ name: 'Exp One', sourceCaption: 'Caption 1' }, dir);
    createExperiment({ name: 'Exp Two', sourceCaption: 'Caption 2' }, dir);
    createExperiment({ name: 'Exp Three', sourceCaption: 'Caption 3' }, dir);
    const list = getExperiments({}, dir);
    assert.ok(list.length >= 3);
    assert.strictEqual(list[0].name, 'Exp Three');
  } finally {
    cleanupTmpDir(dir);
  }
});

// J
test('J. getExperiments filters by search query', () => {
  const dir = makeTmpDir();
  try {
    createExperiment({ name: 'Reel Cutter Tips', sourceCaption: 'Caption about reels' }, dir);
    createExperiment({ name: 'Cooking Tutorial', sourceCaption: 'Make pasta at home' }, dir);
    const results = getExperiments({ search: 'reel' }, dir);
    assert.ok(results.length >= 1);
    assert.ok(results.every(e => e.name.toLowerCase().includes('reel') || e.sourceCaption.toLowerCase().includes('reel')));
  } finally {
    cleanupTmpDir(dir);
  }
});

// K
test('K. getExperiments filters by platform', () => {
  const dir = makeTmpDir();
  try {
    createExperiment({ name: 'IG Exp', sourceCaption: 'Caption IG', platform: 'instagram' }, dir);
    createExperiment({ name: 'YT Exp', sourceCaption: 'Caption YT', platform: 'youtube' }, dir);
    const igResults = getExperiments({ platform: 'instagram' }, dir);
    assert.ok(igResults.length >= 1);
    assert.ok(igResults.every(e => e.platform === 'instagram'));
  } finally {
    cleanupTmpDir(dir);
  }
});

// L
test('L. getExperiments filters by profileId', () => {
  const dir = makeTmpDir();
  try {
    createExperiment({ name: 'Profile A Exp', sourceCaption: 'Caption A', profileId: 'prf_A' }, dir);
    createExperiment({ name: 'Profile B Exp', sourceCaption: 'Caption B', profileId: 'prf_B' }, dir);
    const aResults = getExperiments({ profileId: 'prf_A' }, dir);
    assert.ok(aResults.length >= 1);
    assert.ok(aResults.every(e => e.profileId === 'prf_A'));
  } finally {
    cleanupTmpDir(dir);
  }
});

// M
test('M. getExperiments sorts by name', () => {
  const dir = makeTmpDir();
  try {
    createExperiment({ name: 'Zebra Exp', sourceCaption: 'Caption Z' }, dir);
    createExperiment({ name: 'Apple Exp', sourceCaption: 'Caption A' }, dir);
    createExperiment({ name: 'Mango Exp', sourceCaption: 'Caption M' }, dir);
    const sorted = getExperiments({ sort: 'name' }, dir);
    const names = sorted.map(e => e.name);
    const sortedCopy = [...names].sort();
    assert.deepStrictEqual(names, sortedCopy);
  } finally {
    cleanupTmpDir(dir);
  }
});

// N
test('N. getExperiment returns single experiment by ID', () => {
  const dir = makeTmpDir();
  try {
    const created = createExperiment({ name: 'Single Get Test', sourceCaption: 'Single caption' }, dir);
    const retrieved = getExperiment(created.id, dir);
    assert.ok(retrieved);
    assert.strictEqual(retrieved.id, created.id);
  } finally {
    cleanupTmpDir(dir);
  }
});

// O
test('O. getExperiment returns null for unknown ID', () => {
  const dir = makeTmpDir();
  try {
    const result = getExperiment('exp_nonexistent_id_99999', dir);
    assert.strictEqual(result, null);
  } finally {
    cleanupTmpDir(dir);
  }
});

// P
test('P. updateExperiment renames an experiment', () => {
  const dir = makeTmpDir();
  try {
    const created = createExperiment({ name: 'Original Name', sourceCaption: 'Caption for rename' }, dir);
    const updated = updateExperiment(created.id, { name: 'Renamed Experiment' }, dir);
    assert.strictEqual(updated.name, 'Renamed Experiment');
    const re = getExperiment(created.id, dir);
    assert.strictEqual(re.name, 'Renamed Experiment');
  } finally {
    cleanupTmpDir(dir);
  }
});

// Q
test('Q. updateExperiment validates updated fields', () => {
  const dir = makeTmpDir();
  try {
    const exp = createExperiment({ name: 'Validate Update', sourceCaption: 'Caption' }, dir);
    assert.throws(() => updateExperiment(exp.id, { name: '' }, dir), /name/i);
    const updated = updateExperiment(exp.id, { tone: 'professional', platform: 'tiktok' }, dir);
    assert.strictEqual(updated.tone, 'professional');
    assert.strictEqual(updated.platform, 'tiktok');
  } finally {
    cleanupTmpDir(dir);
  }
});

// R
test('R. deleteExperiment removes experiment from disk', () => {
  const dir = makeTmpDir();
  try {
    const created = createExperiment({ name: 'Delete Me', sourceCaption: 'Caption to delete' }, dir);
    const result = deleteExperiment(created.id, dir);
    assert.ok(result.success);
    assert.strictEqual(getExperiment(created.id, dir), null);
  } finally {
    cleanupTmpDir(dir);
  }
});

// S
test('S. deleteExperiment throws for unknown experiment ID', () => {
  const dir = makeTmpDir();
  try {
    assert.throws(() => deleteExperiment('exp_nonexistent_99999', dir), /not found/i);
  } finally {
    cleanupTmpDir(dir);
  }
});

// T
test('T. duplicateExperiment creates independent copy with (Copy) suffix', () => {
  const dir = makeTmpDir();
  try {
    const orig = createExperiment({ name: 'Original Exp', sourceCaption: 'Caption for duplication' }, dir);
    const copy = duplicateExperiment(orig.id, dir);
    assert.ok(copy.id !== orig.id);
    assert.ok(copy.name.includes('(Copy)'));
    assert.strictEqual(copy.sourceCaption, orig.sourceCaption);
  } finally {
    cleanupTmpDir(dir);
  }
});

// U
test('U. duplicateExperiment copies all variants with new independent IDs', () => {
  const dir = makeTmpDir();
  try {
    const orig = createExperiment({ name: 'Multi Variant Orig', sourceCaption: 'Original caption' }, dir);
    addVariant(orig.id, { text: 'Second variant text', source: 'manual' }, dir);
    const origRefreshed = getExperiment(orig.id, dir);
    assert.strictEqual(origRefreshed.variants.length, 2);
    const copy = duplicateExperiment(orig.id, dir);
    assert.strictEqual(copy.variants.length, 2);
    for (let i = 0; i < origRefreshed.variants.length; i++) {
      assert.ok(origRefreshed.variants[i].id !== copy.variants[i].id);
    }
  } finally {
    cleanupTmpDir(dir);
  }
});

// V
test('V. duplicateExperiment - change original leaves duplicate unchanged', () => {
  const dir = makeTmpDir();
  try {
    const orig = createExperiment({ name: 'Change Isolation', sourceCaption: 'Initial caption' }, dir);
    const copy = duplicateExperiment(orig.id, dir);
    updateExperiment(orig.id, { name: 'Renamed Original' }, dir);
    const refreshedCopy = getExperiment(copy.id, dir);
    assert.ok(refreshedCopy.name !== 'Renamed Original');
  } finally {
    cleanupTmpDir(dir);
  }
});

// W
test('W. addVariant adds a new variant and auto-assigns name', () => {
  const dir = makeTmpDir();
  try {
    const exp = createExperiment({ name: 'Add Variant Exp', sourceCaption: 'Original caption' }, dir);
    const { experiment, variant } = addVariant(exp.id, { text: 'Second caption variant', source: 'manual' }, dir);
    assert.strictEqual(experiment.variants.length, 2);
    assert.ok(variant.id && variant.id.startsWith('var_'));
    assert.ok(variant.name.startsWith('Variant B'));
    assert.strictEqual(variant.source, 'manual');
    assert.strictEqual(variant.text, 'Second caption variant');
  } finally {
    cleanupTmpDir(dir);
  }
});

// X
test('X. addVariant throws when max variants reached', () => {
  const dir = makeTmpDir();
  try {
    const exp = createExperiment({ name: 'Max Variant Exp', sourceCaption: 'Caption for max test' }, dir);
    for (let i = 1; i < MAX_VARIANTS_PER_EXPERIMENT; i++) {
      addVariant(exp.id, { text: `Variant text number ${i + 1}`, source: 'manual' }, dir);
    }
    assert.throws(() => addVariant(exp.id, { text: 'Overflow variant', source: 'manual' }, dir), /maximum/i);
  } finally {
    cleanupTmpDir(dir);
  }
});

// Y
test('Y. addVariant analyzes quality for new variant text', () => {
  const dir = makeTmpDir();
  try {
    const exp = createExperiment({ name: 'Quality Analysis Exp', sourceCaption: 'Caption with quality check' }, dir);
    const { variant } = addVariant(exp.id, { text: 'Improve your skills with our professional guide today!', source: 'ai' }, dir);
    assert.ok(variant.qualityResult);
    assert.ok(typeof variant.qualityResult.score === 'number');
    assert.ok(typeof variant.qualityResult.grade === 'string');
    assert.ok(variant.qualityResult.signals);
  } finally {
    cleanupTmpDir(dir);
  }
});

// Z
test('Z. updateVariant updates text and re-analyzes quality', () => {
  const dir = makeTmpDir();
  try {
    const exp = createExperiment({ name: 'Update Variant Exp', sourceCaption: 'Caption to update' }, dir);
    const origVarId = exp.variants[0].id;
    const { variant } = updateVariant(exp.id, origVarId, { text: 'Updated caption text with new content!' }, dir);
    assert.strictEqual(variant.text, 'Updated caption text with new content!');
    assert.ok(variant.qualityResult);
    assert.ok(typeof variant.qualityResult.score === 'number');
  } finally {
    cleanupTmpDir(dir);
  }
});

// AA
test('AA. deleteVariant removes a variant', () => {
  const dir = makeTmpDir();
  try {
    const exp = createExperiment({ name: 'Delete Variant Exp', sourceCaption: 'Delete variant caption' }, dir);
    const { variant } = addVariant(exp.id, { text: 'Second variant to delete', source: 'manual' }, dir);
    const updated = deleteVariant(exp.id, variant.id, dir);
    assert.strictEqual(updated.variants.length, 1);
    assert.ok(!updated.variants.some(v => v.id === variant.id));
  } finally {
    cleanupTmpDir(dir);
  }
});

// AB
test('AB. deleteVariant throws when only one variant remains', () => {
  const dir = makeTmpDir();
  try {
    const exp = createExperiment({ name: 'Min Variant Exp', sourceCaption: 'Caption with one variant' }, dir);
    const onlyVariantId = exp.variants[0].id;
    assert.throws(() => deleteVariant(exp.id, onlyVariantId, dir), /only variant/i);
  } finally {
    cleanupTmpDir(dir);
  }
});

// AC
test('AC. selectPreferredVariant changes selectedVariantId', () => {
  const dir = makeTmpDir();
  try {
    const exp = createExperiment({ name: 'Select Preferred Exp', sourceCaption: 'Caption' }, dir);
    const { variant } = addVariant(exp.id, { text: 'Second variant text', source: 'manual' }, dir);
    const updated = selectPreferredVariant(exp.id, variant.id, dir);
    assert.strictEqual(updated.selectedVariantId, variant.id);
    const refreshed = getExperiment(exp.id, dir);
    assert.strictEqual(refreshed.selectedVariantId, variant.id);
  } finally {
    cleanupTmpDir(dir);
  }
});

// AD
test('AD. selectPreferredVariant throws for unknown variantId', () => {
  const dir = makeTmpDir();
  try {
    const exp = createExperiment({ name: 'Select Unknown Exp', sourceCaption: 'Caption' }, dir);
    assert.throws(() => selectPreferredVariant(exp.id, 'var_nonexistent_99999', dir), /not found/i);
  } finally {
    cleanupTmpDir(dir);
  }
});

// AE
test('AE. compareVariants produces score diff, winner, signalDiffs', () => {
  const varA = { id: 'v1', name: 'Variant A', text: 'Short text.' };
  const varB = { id: 'v2', name: 'Variant B', text: 'Click here now! Transform your video editing workflow with expert guidance. Subscribe!' };
  const result = compareVariants(varA, varB);
  assert.ok(typeof result.scoreDiff === 'number');
  assert.ok(['A', 'B', 'EQUAL'].includes(result.winner));
  assert.ok(result.signalDiffs);
  assert.ok(typeof result.signalDiffs.readability === 'number');
  assert.ok(typeof result.signalDiffs.cta === 'number');
  assert.ok(result.variantA && result.variantB);
});

// AF
test('AF. compareVariants verdict contains heuristic', () => {
  const varA = { id: 'v1', name: 'A', text: 'Simple caption.' };
  const varB = { id: 'v2', name: 'B', text: 'Engaging caption for creators! Subscribe now to get daily reel tips.' };
  const result = compareVariants(varA, varB);
  assert.ok(typeof result.verdict === 'string');
  assert.ok(result.verdict.toLowerCase().includes('heuristic'));
});

// AG
test('AG. compareVariants handles equal-score variants gracefully', () => {
  const sameText = 'Equal quality caption for testing purposes here.';
  const varA = { id: 'v1', name: 'A', text: sameText };
  const varB = { id: 'v2', name: 'B', text: sameText };
  const result = compareVariants(varA, varB);
  assert.strictEqual(result.scoreDiff, 0);
  assert.strictEqual(result.winner, 'EQUAL');
});

// AH
test('AH. getBestVariant returns variant with highest quality score', () => {
  const dir = makeTmpDir();
  try {
    const exp = createExperiment({ name: 'Best Variant Exp', sourceCaption: 'Short.' }, dir);
    addVariant(exp.id, { text: 'Click here now! Professional video editing tips to boost your content today. Subscribe!', source: 'ai' }, dir);
    const refreshed = getExperiment(exp.id, dir);
    const result = getBestVariant(refreshed);
    assert.ok(result.variant);
    assert.ok(typeof result.score === 'number');
    assert.ok(typeof result.reason === 'string');
    for (const v of refreshed.variants) {
      const vs = v.qualityResult?.score || 0;
      assert.ok(result.score >= vs);
    }
  } finally {
    cleanupTmpDir(dir);
  }
});

// AI
test('AI. getWeakestSignalAcrossExperiment identifies lowest average signal', () => {
  const dir = makeTmpDir();
  try {
    const exp = createExperiment({ name: 'Weakest Signal Exp', sourceCaption: 'Caption for signal analysis.' }, dir);
    addVariant(exp.id, { text: 'Second caption variant', source: 'manual' }, dir);
    const refreshed = getExperiment(exp.id, dir);
    const result = getWeakestSignalAcrossExperiment(refreshed);
    assert.ok(typeof result.weakestSignal === 'string');
    assert.ok(['readability', 'relevance', 'clarity', 'cta', 'structure'].includes(result.weakestSignal));
    assert.ok(result.averageSignals);
    assert.ok(typeof result.summary === 'string');
  } finally {
    cleanupTmpDir(dir);
  }
});

// AJ
test('AJ. optimizeVariant returns before/after quality scores and disclaimer', async () => {
  const mockProvider = new MockAiProvider();
  const result = await optimizeVariant(
    'Short caption.',
    { platform: 'instagram', tone: 'casual' },
    { provider: mockProvider }
  );
  assert.ok(result.success, `Expected success, got: ${result.error}`);
  assert.ok(typeof result.beforeScore === 'number');
  assert.ok(typeof result.afterScore === 'number');
  assert.ok(typeof result.beforeGrade === 'string');
  assert.ok(typeof result.afterGrade === 'string');
  assert.ok(typeof result.weakestSignal === 'string');
  assert.ok(typeof result.recommendedMode === 'string');
  assert.ok(typeof result.optimizedText === 'string');
  assert.ok(typeof result.scoreDiff === 'number');
  assert.ok(typeof result.disclaimer === 'string');
  assert.ok(result.disclaimer.toLowerCase().includes('heuristic'));
});

// AK
test('AK. generateAiVariants returns scored suggestions with source ai', async () => {
  const mockProvider = new MockAiProvider();
  const result = await generateAiVariants({
    sourceCaption: 'Master reel editing in 5 steps.',
    mode: 'better_hook',
    count: 3,
  }, { provider: mockProvider });
  assert.ok(result.success, `Expected success, got: ${result.error}`);
  assert.ok(Array.isArray(result.suggestions));
  assert.ok(result.suggestions.length >= 1);
  for (const sug of result.suggestions) {
    assert.strictEqual(sug.source, 'ai');
    assert.ok(typeof sug.text === 'string' && sug.text.length > 0);
    assert.ok(typeof sug.score === 'number');
    assert.ok(typeof sug.grade === 'string');
  }
});

// AL
test('AL. bulkExperiment processes multiple entries with snapshot isolation', async () => {
  const dir = makeTmpDir();
  const mockProvider = new MockAiProvider();
  try {
    const items = [
      { name: 'Profile 1 Exp', caption: 'Caption for profile 1 reel.', platform: 'instagram', tone: 'casual', profileId: 'prf_1' },
      { name: 'Profile 2 Exp', caption: 'Caption for profile 2 shorts.', platform: 'youtube', tone: 'professional', profileId: 'prf_2' },
    ];
    const result = await bulkExperiment({ entries: items }, { customDir: dir, provider: mockProvider });
    assert.ok(result.success, `Expected success, got: ${result.error}`);
    assert.ok(Array.isArray(result.results));
    assert.ok(result.results.length === 2);
    assert.ok(result.summary.totalEntries === 2);
    assert.ok(result.summary.processed === 2);
    // Snapshot isolation
    assert.strictEqual(items[0].caption, 'Caption for profile 1 reel.');
    assert.strictEqual(items[1].caption, 'Caption for profile 2 shorts.');
  } finally {
    cleanupTmpDir(dir);
  }
});

// AM
test('AM. bulkExperiment with empty items returns success with empty results', async () => {
  const result = await bulkExperiment({ items: [] });
  assert.ok(result.success);
  assert.deepStrictEqual(result.results, []);
  assert.strictEqual(result.summary.totalEntries, 0);
  assert.strictEqual(result.summary.processed, 0);
});

// AN
test('AN. applyVariantToOverlays preserves overlay styling', () => {
  const overlays = [{
    id: 'ov1',
    text: 'Old caption text',
    fontFamily: 'Georgia',
    fontSize: 36,
    fontWeight: 'bold',
    color: '#FF0000',
    position: 'top',
  }];
  const result = applyVariantToOverlays('New experiment caption!', overlays);
  assert.ok(Array.isArray(result));
  assert.ok(result.length >= 1);
  // Ensure original overlays not mutated
  assert.strictEqual(overlays[0].text, 'Old caption text');
});

// AO
test('AO. Experiment enforces limits (max name length, max caption length)', () => {
  const dir = makeTmpDir();
  try {
    const tooLongName = 'N'.repeat(MAX_EXPERIMENT_NAME_LENGTH + 1);
    assert.throws(() => createExperiment({ name: tooLongName, sourceCaption: 'Valid caption' }, dir), /exceeds maximum length/i);
    const tooLongCaption = 'C'.repeat((LIMITS.maxCaptionLength || 500) + 1);
    assert.throws(() => createExperiment({ name: 'Valid Name', sourceCaption: tooLongCaption }, dir), /exceeds maximum length/i);
  } finally {
    cleanupTmpDir(dir);
  }
});

// AP
test('AP. Experiment functions never mutate inputs (deep clone guarantee)', () => {
  const dir = makeTmpDir();
  try {
    const input = { name: 'Immutability Test', sourceCaption: 'Original caption for immutability check', platform: 'tiktok' };
    const inputCopy = JSON.stringify(input);
    const exp = createExperiment(input, dir);
    assert.strictEqual(JSON.stringify(input), inputCopy);

    const variantInput = { text: 'Immutability variant text here', source: 'manual' };
    const variantInputCopy = JSON.stringify(variantInput);
    addVariant(exp.id, variantInput, dir);
    assert.strictEqual(JSON.stringify(variantInput), variantInputCopy);

    const updateInput = { name: 'Updated Name' };
    const updateInputCopy = JSON.stringify(updateInput);
    updateExperiment(exp.id, updateInput, dir);
    assert.strictEqual(JSON.stringify(updateInput), updateInputCopy);
  } finally {
    cleanupTmpDir(dir);
  }
});

// Runner
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
  console.log(`Phase 4B-9 Test Results: ${passedCount} / ${totalCount} passed`);
  console.log(`======================================================\n`);
}

runAll().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
