'use strict';

/**
 * Phase 4B-8 — Caption Workspace & Smart Rewrite Test Suite
 *
 * Tests A through AP:
 *  A. createWorkspace returns a valid workspace with initial version
 *  B. createWorkspace with empty caption uses fallback or empty
 *  C. createWorkspace validates platform/tone/language
 *  D. addVersion creates an immutable new version without mutating input
 *  E. addVersion updates workspace.currentCaption and selectedVersionId
 *  F. selectVersion changes currentCaption and selectedVersionId without altering versions array
 *  G. updateCurrentCaption updates caption without saving version if saveVersion is false
 *  H. updateCurrentCaption creates a version when saveVersion is true
 *  I. validateRewriteRequest accepts all 7 valid modes
 *  J. validateRewriteRequest rejects invalid mode
 *  K. validateRewriteRequest validates language (english, bangla)
 *  L. validateRewriteRequest validates tone
 *  M. validateRewriteRequest validates length (short, medium, long)
 *  N. validateRewriteRequest validates count (1-5)
 *  O. validateRewriteRequest clamps or rejects count > 5 or < 1
 *  P. validateRewriteRequest requires caption
 *  Q. MockAiProvider.rewrite implements 'clearer' mode (English)
 *  R. MockAiProvider.rewrite implements 'shorter' mode (English)
 *  S. MockAiProvider.rewrite implements 'professional' mode (English)
 *  T. MockAiProvider.rewrite implements 'casual' mode (English)
 *  U. MockAiProvider.rewrite implements 'promotional' mode (English)
 *  V. MockAiProvider.rewrite implements 'better_hook' mode (English)
 *  W. MockAiProvider.rewrite implements 'stronger_cta' mode (English)
 *  X. MockAiProvider.rewrite supports Bangla for all modes
 *  Y. generateSmartRewrites returns requested count of suggestions
 *  Z. generateSmartRewrites attaches quality scores to suggestions
 *  AA. generateSmartRewrites handles custom provider options
 *  AB. rewriteWithQualityFeedback identifies weakest signal and selects mode
 *  AC. rewriteWithQualityFeedback returns recommendations and scored suggestions
 *  AD. compareWorkspaceVersions computes score diff and determines winner (A, B, or tie)
 *  AE. compareWorkspaceVersions computes signal differences
 *  AF. compareWorkspaceVersions handles equal scores gracefully
 *  AG. compareWorkspaceVersions generates human-readable verdict
 *  AH. bulkSmartRewrite processes multiple profiles with snapshot isolation
 *  AI. bulkSmartRewrite handles empty items array
 *  AJ. bulkSmartRewrite validates each item independently
 *  AK. applyWorkspaceCaptionToOverlays creates valid overlay objects
 *  AL. applyWorkspaceCaptionToOverlays preserves existing overlay styles
 *  AM. saveWorkspaceAsTemplate creates a template with workspace caption
 *  AN. saveWorkspaceToHistory records workspace rewrite in history
 *  AO. Workspace enforces limits (max versions, max caption length)
 *  AP. Workspace functions never mutate inputs (pure functions / deep clone)
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  createWorkspace,
  validateWorkspace,
  addVersion,
  selectVersion,
  updateCurrentCaption,
  validateRewriteRequest,
  generateSmartRewrites,
  rewriteWithQualityFeedback,
  compareWorkspaceVersions,
  bulkSmartRewrite,
  applyWorkspaceCaptionToOverlays,
  saveWorkspaceAsTemplate,
  saveWorkspaceToHistory,
  ALLOWED_REWRITE_MODES,
  ALLOWED_LANGUAGES,
  ALLOWED_TONES,
  ALLOWED_LENGTHS,
  ALLOWED_PLATFORMS,
  LIMITS,
} = require('../src/main/captions/captionWorkspaceManager');

const {
  MockAiProvider,
  getActiveProvider,
} = require('../src/main/captions/aiProviderAdapter');

const {
  getCaptionTemplates,
} = require('../src/main/captions/captionTemplateManager');

const {
  getHistory,
} = require('../src/main/captions/captionHistoryManager');

console.log('======================================================');
console.log('🧪 Running Phase 4B-8 Caption Workspace & Smart Rewrite Tests');
console.log('======================================================\n');

let passedCount = 0;
let totalCount = 0;
const testQueue = [];

function test(name, fn) {
  testQueue.push({ name, fn });
}

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rc_test_caption_workspace_'));
}

function cleanupTmpDir(dir) {
  try {
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (_) {}
}

// A. createWorkspace returns a valid workspace with initial version
test('A. createWorkspace returns a valid workspace with initial version', () => {
  const ws = createWorkspace({
    caption: 'Master reel cutting in 3 easy steps! Follow for more tips.',
    platform: 'instagram',
    tone: 'casual',
  });

  assert.ok(ws.id && ws.id.startsWith('cws_'));
  assert.strictEqual(ws.currentCaption, 'Master reel cutting in 3 easy steps! Follow for more tips.');
  assert.strictEqual(ws.originalCaption, 'Master reel cutting in 3 easy steps! Follow for more tips.');
  assert.strictEqual(ws.platform, 'instagram');
  assert.strictEqual(ws.tone, 'casual');
  assert.strictEqual(ws.language, 'english');
  assert.strictEqual(ws.versions.length, 1);
  assert.strictEqual(ws.selectedVersionId, ws.versions[0].id);
  assert.strictEqual(ws.versions[0].source, 'original');
  assert.strictEqual(ws.versions[0].text, ws.currentCaption);
  assert.ok(ws.versions[0].qualityResult);
  assert.ok(validateWorkspace(ws));
});

// B. createWorkspace with empty caption uses fallback or empty
test('B. createWorkspace with empty caption throws descriptive error', () => {
  assert.throws(() => createWorkspace({ caption: '' }), /Caption cannot be empty/);
  assert.throws(() => createWorkspace({ caption: '   ' }), /Caption cannot be empty/);
  assert.throws(() => createWorkspace({ caption: null }), /Caption is required/);
  assert.throws(() => createWorkspace({}), /Caption is required/);
});

// C. createWorkspace validates platform/tone/language
test('C. createWorkspace validates platform/tone/language', () => {
  assert.throws(() => createWorkspace({ caption: 'Test', platform: 'unsupported_platform' }), /Invalid platform/);
  assert.throws(() => createWorkspace({ caption: 'Test', tone: 'angry_tone' }), /Invalid tone/);
  assert.throws(() => createWorkspace({ caption: 'Test', language: 'spanish' }), /Invalid language/);

  const valid = createWorkspace({
    caption: 'Valid caption for test',
    platform: 'tiktok',
    tone: 'professional',
    language: 'bangla',
    length: 'short',
  });
  assert.strictEqual(valid.platform, 'tiktok');
  assert.strictEqual(valid.tone, 'professional');
  assert.strictEqual(valid.language, 'bangla');
  assert.strictEqual(valid.length, 'short');
});

// D. addVersion creates an immutable new version without mutating input
test('D. addVersion creates an immutable new version without mutating input', () => {
  const ws1 = createWorkspace({ caption: 'Original version text' });
  const ws1Before = JSON.stringify(ws1);

  const ws2 = addVersion(ws1, {
    text: 'Second version text after rewrite',
    source: 'rewrite',
    mode: 'clearer',
  });

  assert.strictEqual(JSON.stringify(ws1), ws1Before, 'Input workspace must not be mutated');
  assert.strictEqual(ws1.versions.length, 1);
  assert.strictEqual(ws2.versions.length, 2);
  assert.strictEqual(ws2.versions[1].text, 'Second version text after rewrite');
  assert.strictEqual(ws2.versions[1].source, 'rewrite');
  assert.strictEqual(ws2.versions[1].mode, 'clearer');
});

// E. addVersion updates workspace.currentCaption and selectedVersionId
test('E. addVersion updates workspace.currentCaption and selectedVersionId', () => {
  const ws = createWorkspace({ caption: 'Original caption' });
  const updated = addVersion(ws, {
    text: 'Updated caption version',
    source: 'manual',
  });

  assert.strictEqual(updated.currentCaption, 'Updated caption version');
  assert.strictEqual(updated.selectedVersionId, updated.versions[1].id);
  assert.strictEqual(updated.versions.length, 2);
});

// F. selectVersion changes currentCaption and selectedVersionId without altering versions array
test('F. selectVersion changes currentCaption and selectedVersionId without altering versions array', () => {
  const ws = createWorkspace({ caption: 'Version 1' });
  const ws2 = addVersion(ws, { text: 'Version 2', source: 'manual' });
  const ws3 = addVersion(ws2, { text: 'Version 3', source: 'rewrite' });

  assert.strictEqual(ws3.currentCaption, 'Version 3');
  assert.strictEqual(ws3.versions.length, 3);

  const selectedFirst = selectVersion(ws3, ws3.versions[0].id);
  assert.strictEqual(selectedFirst.currentCaption, 'Version 1');
  assert.strictEqual(selectedFirst.selectedVersionId, ws3.versions[0].id);
  assert.strictEqual(selectedFirst.versions.length, 3);

  const selectedSecond = selectVersion(selectedFirst, ws3.versions[1].id);
  assert.strictEqual(selectedSecond.currentCaption, 'Version 2');
  assert.strictEqual(selectedSecond.selectedVersionId, ws3.versions[1].id);
  assert.strictEqual(selectedSecond.versions.length, 3);
});

// G. updateCurrentCaption updates caption without saving version if saveVersion is false
test('G. updateCurrentCaption updates caption without saving version if saveVersion is false', () => {
  const ws = createWorkspace({ caption: 'Initial caption' });
  const updated = updateCurrentCaption(ws, 'Edited live in textarea', { saveVersion: false });

  assert.strictEqual(updated.currentCaption, 'Edited live in textarea');
  assert.strictEqual(updated.versions.length, 1);
  assert.strictEqual(updated.versions[0].text, 'Initial caption');
});

// H. updateCurrentCaption creates a version when saveVersion is true
test('H. updateCurrentCaption creates a version when saveVersion is true', () => {
  const ws = createWorkspace({ caption: 'Initial caption' });
  const updated = updateCurrentCaption(ws, 'Saved revision', { saveVersion: true });

  assert.strictEqual(updated.currentCaption, 'Saved revision');
  assert.strictEqual(updated.versions.length, 2);
  assert.strictEqual(updated.versions[1].text, 'Saved revision');
  assert.strictEqual(updated.selectedVersionId, updated.versions[1].id);
});

// I. validateRewriteRequest accepts all 7 valid modes
test('I. validateRewriteRequest accepts all 7 valid modes', () => {
  const modes = ['clearer', 'shorter', 'professional', 'casual', 'promotional', 'better_hook', 'stronger_cta'];
  assert.strictEqual(modes.length, 7);

  for (const mode of modes) {
    const validated = validateRewriteRequest({
      caption: 'Test caption for rewrite validation',
      mode,
    });
    assert.strictEqual(validated.mode, mode);
    assert.strictEqual(validated.caption, 'Test caption for rewrite validation');
  }
});

// J. validateRewriteRequest rejects invalid mode
test('J. validateRewriteRequest rejects invalid mode', () => {
  assert.throws(() => validateRewriteRequest({ caption: 'Valid', mode: 'spam' }), /Invalid rewrite mode/);
  assert.throws(() => validateRewriteRequest({ caption: 'Valid', mode: 'evade' }), /Invalid rewrite mode/);
  assert.throws(() => validateRewriteRequest({ caption: 'Valid', mode: '' }), /Rewrite mode is required/);
  assert.throws(() => validateRewriteRequest({ caption: 'Valid' }), /Rewrite mode is required/);
});

// K. validateRewriteRequest validates language (english, bangla)
test('K. validateRewriteRequest validates language (english, bangla)', () => {
  const en = validateRewriteRequest({ caption: 'Test', mode: 'clearer', language: 'english' });
  assert.strictEqual(en.language, 'english');

  const bn = validateRewriteRequest({ caption: 'Test', mode: 'clearer', language: 'bangla' });
  assert.strictEqual(bn.language, 'bangla');

  assert.throws(() => validateRewriteRequest({ caption: 'Test', mode: 'clearer', language: 'hindi' }), /Invalid language/);
});

// L. validateRewriteRequest validates tone
test('L. validateRewriteRequest validates tone', () => {
  const tones = ['professional', 'casual', 'educational', 'promotional', 'storytelling'];
  for (const tone of tones) {
    const res = validateRewriteRequest({ caption: 'Test', mode: 'clearer', tone });
    assert.strictEqual(res.tone, tone);
  }
  assert.throws(() => validateRewriteRequest({ caption: 'Test', mode: 'clearer', tone: 'aggressive' }), /Invalid tone/);
});

// M. validateRewriteRequest validates length (short, medium, long)
test('M. validateRewriteRequest validates length (short, medium, long)', () => {
  for (const length of ['short', 'medium', 'long']) {
    const res = validateRewriteRequest({ caption: 'Test', mode: 'clearer', length });
    assert.strictEqual(res.length, length);
  }
  assert.throws(() => validateRewriteRequest({ caption: 'Test', mode: 'clearer', length: 'ultra_long' }), /Invalid length/);
});

// N. validateRewriteRequest validates count (1-5)
test('N. validateRewriteRequest validates count (1-5)', () => {
  for (let c = 1; c <= 5; c++) {
    const res = validateRewriteRequest({ caption: 'Test', mode: 'clearer', count: c });
    assert.strictEqual(res.count, c);
  }
});

// O. validateRewriteRequest clamps or rejects count > 5 or < 1
test('O. validateRewriteRequest rejects count > 5 or < 1', () => {
  assert.throws(() => validateRewriteRequest({ caption: 'Test', mode: 'clearer', count: 0 }), /Suggestion count must be an integer between 1 and 5/);
  assert.throws(() => validateRewriteRequest({ caption: 'Test', mode: 'clearer', count: 6 }), /Suggestion count must be an integer between 1 and 5/);
  assert.throws(() => validateRewriteRequest({ caption: 'Test', mode: 'clearer', count: -2 }), /Suggestion count must be an integer between 1 and 5/);
});

// P. validateRewriteRequest requires caption
test('P. validateRewriteRequest requires caption', () => {
  assert.throws(() => validateRewriteRequest({ mode: 'clearer' }), /Caption is required/);
  assert.throws(() => validateRewriteRequest({ caption: '', mode: 'clearer' }), /Caption cannot be empty/);
  assert.throws(() => validateRewriteRequest({ caption: '   ', mode: 'clearer' }), /Caption cannot be empty/);
});

// Q. MockAiProvider.rewrite implements 'clearer' mode (English)
test('Q. MockAiProvider.rewrite implements clearer mode (English)', async () => {
  const provider = new MockAiProvider();
  const suggestions = await provider.rewrite({
    caption: 'Learn video editing easily with this guide.',
    mode: 'clearer',
    language: 'english',
    count: 3,
  });

  assert.ok(Array.isArray(suggestions));
  assert.strictEqual(suggestions.length, 3);
  for (const s of suggestions) {
    assert.ok(typeof s === 'string' && s.length > 5);
  }
});

// R. MockAiProvider.rewrite implements 'shorter' mode (English)
test('R. MockAiProvider.rewrite implements shorter mode (English)', async () => {
  const provider = new MockAiProvider();
  const original = 'Learn video editing easily with this complete comprehensive beginner guide to editing reels.';
  const suggestions = await provider.rewrite({
    caption: original,
    mode: 'shorter',
    language: 'english',
    count: 2,
  });

  assert.strictEqual(suggestions.length, 2);
  for (const s of suggestions) {
    assert.ok(s.length < original.length);
  }
});

// S. MockAiProvider.rewrite implements 'professional' mode (English)
test('S. MockAiProvider.rewrite implements professional mode (English)', async () => {
  const provider = new MockAiProvider();
  const suggestions = await provider.rewrite({
    caption: 'Hey guys check out my cool reel cutter tips!',
    mode: 'professional',
    language: 'english',
    count: 2,
  });

  assert.strictEqual(suggestions.length, 2);
  for (const s of suggestions) {
    assert.ok(typeof s === 'string');
    assert.ok(!s.includes('Hey guys'));
  }
});

// T. MockAiProvider.rewrite implements 'casual' mode (English)
test('T. MockAiProvider.rewrite implements casual mode (English)', async () => {
  const provider = new MockAiProvider();
  const suggestions = await provider.rewrite({
    caption: 'Our enterprise cutting solution streamlines video processing.',
    mode: 'casual',
    language: 'english',
    count: 2,
  });

  assert.strictEqual(suggestions.length, 2);
  for (const s of suggestions) {
    assert.ok(typeof s === 'string');
  }
});

// U. MockAiProvider.rewrite implements 'promotional' mode (English)
test('U. MockAiProvider.rewrite implements promotional mode (English)', async () => {
  const provider = new MockAiProvider();
  const suggestions = await provider.rewrite({
    caption: 'Try cutting reels faster with new automated tools.',
    mode: 'promotional',
    language: 'english',
    count: 2,
  });

  assert.strictEqual(suggestions.length, 2);
  for (const s of suggestions) {
    assert.ok(typeof s === 'string');
    assert.ok(s.length > 10);
  }
});

// V. MockAiProvider.rewrite implements 'better_hook' mode (English)
test('V. MockAiProvider.rewrite implements better_hook mode (English)', async () => {
  const provider = new MockAiProvider();
  const suggestions = await provider.rewrite({
    caption: 'Video cutting is nice.',
    mode: 'better_hook',
    language: 'english',
    count: 2,
  });

  assert.strictEqual(suggestions.length, 2);
  for (const s of suggestions) {
    assert.ok(s.includes('?') || s.includes('!') || s.includes('Stop') || s.includes('Want') || s.includes('Here'));
  }
});

// W. MockAiProvider.rewrite implements 'stronger_cta' mode (English)
test('W. MockAiProvider.rewrite implements stronger_cta mode (English)', async () => {
  const provider = new MockAiProvider();
  const suggestions = await provider.rewrite({
    caption: 'Here are 3 video tips.',
    mode: 'stronger_cta',
    language: 'english',
    count: 2,
  });

  assert.strictEqual(suggestions.length, 2);
  for (const s of suggestions) {
    const lower = s.toLowerCase();
    assert.ok(
      lower.includes('follow') || lower.includes('save') || lower.includes('comment') ||
      lower.includes('tap') || lower.includes('share') || lower.includes('try')
    );
  }
});

// X. MockAiProvider.rewrite supports Bangla for all modes
test('X. MockAiProvider.rewrite supports Bangla for all modes', async () => {
  const provider = new MockAiProvider();
  const modes = ['clearer', 'shorter', 'professional', 'casual', 'promotional', 'better_hook', 'stronger_cta'];

  for (const mode of modes) {
    const suggestions = await provider.rewrite({
      caption: 'সহজেই ভিডিও এডিট করুন এবং দ্রুত রিল তৈরি করুন।',
      mode,
      language: 'bangla',
      count: 2,
    });
    assert.strictEqual(suggestions.length, 2);
    for (const s of suggestions) {
      assert.ok(typeof s === 'string');
      assert.ok(/[\u0980-\u09FF]/.test(s), `Suggestion should contain Bangla characters for mode ${mode}`);
    }
  }
});

// Y. generateSmartRewrites returns requested count of suggestions
test('Y. generateSmartRewrites returns requested count of suggestions', async () => {
  const res2 = await generateSmartRewrites({
    caption: 'Discover fast cutting techniques for creator workflows!',
    mode: 'clearer',
    count: 2,
  });
  assert.strictEqual(res2.success, true);
  assert.strictEqual(res2.suggestions.length, 2);

  const res4 = await generateSmartRewrites({
    caption: 'Discover fast cutting techniques for creator workflows!',
    mode: 'clearer',
    count: 4,
  });
  assert.strictEqual(res4.success, true);
  assert.strictEqual(res4.suggestions.length, 4);
});

// Z. generateSmartRewrites attaches quality scores to suggestions
test('Z. generateSmartRewrites attaches quality scores to suggestions', async () => {
  const res = await generateSmartRewrites({
    caption: 'Learn to edit videos faster today!',
    mode: 'better_hook',
    count: 3,
  });

  assert.strictEqual(res.success, true);
  for (const sug of res.suggestions) {
    assert.ok(sug.id);
    assert.ok(typeof sug.text === 'string');
    assert.ok(typeof sug.score === 'number' && sug.score >= 0 && sug.score <= 100);
    assert.ok(['A', 'B', 'C', 'D', 'F'].includes(sug.grade));
    assert.ok(sug.signals && typeof sug.signals.readability === 'number');
    assert.ok(Array.isArray(sug.strengths));
    assert.ok(Array.isArray(sug.suggestions));
  }
});

// AA. generateSmartRewrites handles custom provider options
test('AA. generateSmartRewrites handles custom provider options', async () => {
  const customProvider = {
    name: 'CustomTestProvider',
    async rewrite(req) {
      return ['Custom rewrite 1: Follow for more!', 'Custom rewrite 2: Tap save!'];
    },
  };

  const res = await generateSmartRewrites({
    caption: 'Original text to rewrite',
    mode: 'clearer',
    count: 2,
  }, { provider: customProvider });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.suggestions.length, 2);
  assert.strictEqual(res.suggestions[0].text, 'Custom rewrite 1: Follow for more!');
  assert.strictEqual(res.metadata.provider, 'CustomTestProvider');
});

// AB. rewriteWithQualityFeedback identifies weakest signal and selects mode
test('AB. rewriteWithQualityFeedback identifies weakest signal and selects mode', async () => {
  // Caption with zero CTA
  const res = await rewriteWithQualityFeedback({
    caption: 'Here is information about cutting video reels without any call to action.',
  });

  assert.strictEqual(res.success, true);
  assert.ok(res.weakestSignal);
  assert.ok(ALLOWED_REWRITE_MODES.includes(res.recommendedMode));
  assert.ok(typeof res.beforeScore === 'number');
  assert.ok(Array.isArray(res.suggestions));
});

// AC. rewriteWithQualityFeedback returns recommendations and scored suggestions
test('AC. rewriteWithQualityFeedback returns recommendations and scored suggestions', async () => {
  const res = await rewriteWithQualityFeedback({
    caption: 'Learn 3 essential editing tips for clean videos.',
    count: 3,
  });

  assert.strictEqual(res.success, true);
  assert.ok(res.suggestions.length > 0);
  assert.ok(typeof res.afterScore === 'number');
  assert.ok(typeof res.scoreDiff === 'number');
  assert.ok(typeof res.topImproved === 'string');
});

// AD. compareWorkspaceVersions computes score diff and determines winner (A, B, or tie)
test('AD. compareWorkspaceVersions computes score diff and determines winner', () => {
  const versionA = {
    id: 'v1',
    text: 'Short video.',
  };
  const versionB = {
    id: 'v2',
    text: 'Master fast reel cutting in 3 easy steps! Follow for daily creator tips.',
  };

  const comp = compareWorkspaceVersions(versionA, versionB);

  assert.ok(comp.versionA && comp.versionB);
  assert.ok(typeof comp.scoreDiff === 'number');
  assert.ok(['A', 'B', 'EQUAL'].includes(comp.winner));
  assert.strictEqual(comp.winner, 'B'); // versionB is much higher quality
  assert.ok(comp.scoreDiff > 0);
});

// AE. compareWorkspaceVersions computes signal differences
test('AE. compareWorkspaceVersions computes signal differences', () => {
  const vA = { text: 'Some basic text without hooks or calls to action.' };
  const vB = { text: 'Want viral reels? Follow @creator for 3 daily cutting secrets!' };

  const comp = compareWorkspaceVersions(vA, vB);

  assert.ok(comp.signalDiffs);
  assert.ok(typeof comp.signalDiffs.readability === 'number');
  assert.ok(typeof comp.signalDiffs.cta === 'number');
  assert.ok(typeof comp.signalDiffs.clarity === 'number');
  assert.ok(comp.signalComparisons); // alias check
});

// AF. compareWorkspaceVersions handles equal scores gracefully
test('AF. compareWorkspaceVersions handles equal scores gracefully', () => {
  const text = 'Discover 3 essential workflow tips for fast video cutting! Save this reel.';
  const vA = { id: 'vA', text };
  const vB = { id: 'vB', text };

  const comp = compareWorkspaceVersions(vA, vB);

  assert.strictEqual(comp.winner, 'EQUAL');
  assert.strictEqual(comp.scoreDiff, 0);
  assert.ok(comp.verdict.includes('equal overall quality'));
});

// AG. compareWorkspaceVersions generates human-readable verdict
test('AG. compareWorkspaceVersions generates human-readable verdict with required heuristic disclaimer', () => {
  const vA = { text: 'Weak caption' };
  const vB = { text: 'Stop scrolling! Here are 3 proven tips to cut videos faster. Follow for more.' };

  const comp = compareWorkspaceVersions(vA, vB);
  assert.ok(comp.verdict);
  assert.ok(comp.verdict.includes('heuristic'));
  assert.ok(comp.verdict.includes('leads by'));
});

// AH. bulkSmartRewrite processes multiple profiles with snapshot isolation
test('AH. bulkSmartRewrite processes multiple profiles with snapshot isolation', async () => {
  const inputEntries = [
    { profileId: 'p1', profileName: 'Tech Reviews', caption: 'Best phones of 2026 reviewed', platform: 'youtube' },
    { profileId: 'p2', profileName: 'Fitness Reels', caption: '3 morning exercises to boost energy', platform: 'instagram' },
  ];

  const originalCopy = JSON.stringify(inputEntries);

  const bulkRes = await bulkSmartRewrite({
    entries: inputEntries,
    defaultMode: 'better_hook',
  });

  assert.strictEqual(JSON.stringify(inputEntries), originalCopy, 'Bulk input entries must not be mutated');
  assert.strictEqual(bulkRes.success, true);
  assert.strictEqual(bulkRes.results.length, 2);
  assert.strictEqual(bulkRes.results[0].profileId, 'p1');
  assert.strictEqual(bulkRes.results[1].profileId, 'p2');
  assert.ok(bulkRes.results[0].suggestions.length > 0);
  assert.ok(bulkRes.results[1].suggestions.length > 0);
});

// AI. bulkSmartRewrite handles empty items array
test('AI. bulkSmartRewrite handles empty items array', async () => {
  const res = await bulkSmartRewrite({ items: [] });
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.results.length, 0);
  assert.strictEqual(res.summary.totalEntries, 0);
  assert.strictEqual(res.summary.processed, 0);
});

// AJ. bulkSmartRewrite validates each item independently
test('AJ. bulkSmartRewrite validates each item independently and skips invalid entries', async () => {
  const entries = [
    { profileId: 'p1', caption: 'Valid reel caption! Follow for daily tutorials.' },
    { profileId: 'p2', caption: '' }, // empty caption, should be skipped
    null, // null entry, should be skipped
    { profileId: 'p3', caption: 'Another valid caption! Save this post.' },
  ];

  const res = await bulkSmartRewrite({ entries });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.results.length, 2);
  assert.strictEqual(res.results[0].profileId, 'p1');
  assert.strictEqual(res.results[1].profileId, 'p3');
});

// AK. applyWorkspaceCaptionToOverlays creates valid overlay objects
test('AK. applyWorkspaceCaptionToOverlays creates valid overlay objects', () => {
  const captionText = 'Transformed caption for overlay presentation';
  const overlays = applyWorkspaceCaptionToOverlays(captionText, []);

  assert.ok(Array.isArray(overlays));
  assert.strictEqual(overlays.length, 1);
  assert.strictEqual(overlays[0].text, captionText);
  assert.ok(overlays[0].id);
  assert.strictEqual(overlays[0].fontFamily, 'Arial');
  assert.strictEqual(overlays[0].enabled, true);
});

// AL. applyWorkspaceCaptionToOverlays preserves existing overlay styles
test('AL. applyWorkspaceCaptionToOverlays preserves existing overlay styles', () => {
  const existing = [
    {
      id: 'custom_overlay_1',
      text: 'Old caption text',
      fontFamily: 'Georgia',
      fontSize: 54,
      fontWeight: 'bold',
      color: '#FFDD00',
      position: 'top',
      enabled: true,
    },
  ];

  const updated = applyWorkspaceCaptionToOverlays('New improved caption text', existing);

  assert.strictEqual(updated.length, 1);
  assert.strictEqual(updated[0].id, 'custom_overlay_1');
  assert.strictEqual(updated[0].text, 'New improved caption text');
  assert.strictEqual(updated[0].fontFamily, 'Georgia');
  assert.strictEqual(updated[0].fontSize, 54);
  assert.strictEqual(updated[0].color, '#FFDD00');
  assert.strictEqual(updated[0].position, 'top');
});

// AM. saveWorkspaceAsTemplate creates a template with workspace caption
test('AM. saveWorkspaceAsTemplate creates a template with workspace caption', () => {
  const tmpDir = makeTmpDir();
  try {
    const template = saveWorkspaceAsTemplate({
      name: 'Workspace Promo Template',
      description: 'Template created from workspace',
      overlays: [
        {
          id: 'ov_1',
          text: 'Exclusive tips for video creators!',
          fontFamily: 'Arial',
          fontSize: 48,
          color: '#FFFFFF',
          position: 'bottom',
          enabled: true,
        },
      ],
      customDir: tmpDir,
    });

    assert.ok(template.id);
    assert.strictEqual(template.name, 'Workspace Promo Template');
    assert.strictEqual(template.isBuiltIn, false);
    assert.strictEqual(template.overlays[0].text, 'Exclusive tips for video creators!');

    const list = getCaptionTemplates(tmpDir);
    const found = list.find((t) => t.id === template.id);
    assert.ok(found);
    assert.strictEqual(found.name, 'Workspace Promo Template');
  } finally {
    cleanupTmpDir(tmpDir);
  }
});

// AN. saveWorkspaceToHistory records workspace rewrite in history
test('AN. saveWorkspaceToHistory records workspace rewrite in history', () => {
  const tmpDir = makeTmpDir();
  try {
    const record = saveWorkspaceToHistory({
      caption: 'Recorded workspace caption with verified metrics',
      score: 88,
      grade: 'B',
      signals: { readability: 85, relevance: 90, clarity: 90, cta: 85, structure: 88 },
      strengths: ['Great readability'],
      suggestions: ['Test different CTA'],
      source: 'workspace',
      customDir: tmpDir,
    });

    assert.ok(record.id);
    assert.strictEqual(record.caption, 'Recorded workspace caption with verified metrics');
    assert.strictEqual(record.score, 88);

    const history = getHistory({}, tmpDir);
    assert.ok(Array.isArray(history));
    assert.ok(history.some((r) => r.id === record.id));
  } finally {
    cleanupTmpDir(tmpDir);
  }
});

// AO. Workspace enforces limits (max versions, max caption length)
test('AO. Workspace enforces limits (max caption length)', () => {
  const longCaption = 'A'.repeat(501);
  assert.throws(() => createWorkspace({ caption: longCaption }), /maximum length/);
  assert.throws(() => validateRewriteRequest({ caption: longCaption, mode: 'clearer' }), /maximum length/);
});

// AP. Workspace functions never mutate inputs (pure functions / deep clone)
test('AP. Workspace functions never mutate inputs (pure functions / deep clone)', () => {
  const initial = {
    caption: 'Pure function test caption',
    platform: 'instagram',
    tone: 'casual',
  };
  const initialCopy = JSON.stringify(initial);
  const ws = createWorkspace(initial);
  assert.strictEqual(JSON.stringify(initial), initialCopy, 'createWorkspace must not mutate input');

  const wsCopy = JSON.stringify(ws);
  const vData = { text: 'Added version', source: 'manual' };
  const vDataCopy = JSON.stringify(vData);

  addVersion(ws, vData);
  assert.strictEqual(JSON.stringify(ws), wsCopy, 'addVersion must not mutate input workspace');
  assert.strictEqual(JSON.stringify(vData), vDataCopy, 'addVersion must not mutate input versionData');

  updateCurrentCaption(ws, 'Edited caption', { saveVersion: false });
  assert.strictEqual(JSON.stringify(ws), wsCopy, 'updateCurrentCaption must not mutate input workspace');
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
  console.log(`📊 Phase 4B-8 Test Results: ${passedCount} / ${totalCount} passed`);
  console.log(`======================================================\n`);
}

runAll().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
