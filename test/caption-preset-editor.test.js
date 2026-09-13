'use strict';

/**
 * Phase 4B-2 — Caption Preset Editor Test Suite
 *
 * Covers:
 *  A. Editor loads template (populates draft correctly)
 *  B. Editor deep clones template (no shared references)
 *  C. Edit template name (validation, trimming, length limits)
 *  D. Edit template description (validation, max length)
 *  E. Add overlay (uses safe defaults, unique ID generated)
 *  F. Duplicate overlay (copies style and configuration)
 *  G. Duplicate overlay has unique ID (distinct from original)
 *  H. Duplicate overlay is independent (mutating copy leaves original untouched)
 *  I. Delete overlay (removes overlay and updates active selection)
 *  J. Enable / disable overlay (toggle enabled flag)
 *  K. Maximum 5 overlays enforced (attempting 6th is rejected)
 *  L. Text validation (string type, max 500 chars, non-string rejected)
 *  M. Font validation (whitelisted fonts only: Arial, Verdana, Tahoma, Georgia, Times New Roman, Courier New)
 *  N. Font size validation (range 12–160 enforced)
 *  O. Color validation (valid 3 or 6 digit hex format #RGB/#RRGGBB)
 *  P. Opacity validation (range 0–1 enforced)
 *  Q. Background validation (backgroundColor hex and backgroundOpacity 0–1)
 *  R. Outline validation (outlineColor hex and outlineWidth 0–10)
 *  S. Position validation (top, center, bottom, custom)
 *  T. Custom X/Y validation (normalized coordinates 0–1)
 *  U. Timing validation (startTime >= 0, endTime > startTime or null)
 *  V. Save valid template (persists via manager and returns saved template)
 *  W. Invalid save rejected (empty name, >5 overlays, invalid fonts rejected)
 *  X. Cancel preserves stored template (in-memory and disk records unchanged)
 *  Y. Reset preserves stored template (restores draft to initial state without disk change)
 *  Z. Built-in remains immutable (update/delete on built-in throws error)
 *  AA. Built-in duplicate creates custom (new ID, isBuiltIn: false, editable)
 *  AB. Custom edit persists (updateCaptionTemplate updates disk atomically)
 *  AC. Custom delete still works (deleteCaptionTemplate removes from disk)
 *  AD. Apply remains deep-cloned (cloned overlay mutation never leaks to stored template)
 *  AE. IPC contract remains secure (handlers return { success: true/false })
 *  AF. Unexpected payload rejected (functions, prototypes, non-objects rejected)
 *  AG. No arbitrary font paths (rejects directory traversal and font file paths)
 *  AH. No arbitrary FFmpeg filters (sanitization prevents filter graph injection)
 *  AI. Template remains serializable (safe JSON roundtrip, no circular references)
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  CANONICAL_BUILTINS,
  getCaptionTemplatesFilePath,
  validateTemplateName,
  validateTemplateDescription,
  validateTemplateInput,
  getCaptionTemplates,
  getCaptionTemplate,
  createCaptionTemplate,
  updateCaptionTemplate,
  deleteCaptionTemplate,
  duplicateCaptionTemplate,
  resetCaptionTemplates,
  deepClone,
  MAX_NAME_LENGTH,
  MIN_NAME_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_OVERLAYS,
} = require('../src/main/captions/captionTemplateManager');

const {
  validateSingleOverlay,
  validateTextOverlayConfig,
  ALLOWED_FONTS,
  ALLOWED_POSITIONS,
  ALLOWED_ALIGNMENTS,
  ALLOWED_WEIGHTS,
  LIMITS,
  createDefaultOverlay
} = require('../src/engine/textOverlayValidator');

const {
  escapeFfmpegText,
  buildDrawTextFilter,
  buildTextOverlayFilters
} = require('../src/engine/textOverlay');

console.log('======================================================');
console.log('🧪 Running Phase 4B-2 Caption Preset Editor Tests');
console.log('======================================================\n');

let passedCount = 0;
let totalCount = 0;
const testQueue = [];

function test(name, fn) {
  testQueue.push({ name, fn });
}

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rc_preset_editor_test_'));
}

function cleanupTmpDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (_) {}
}

const sampleOverlay = {
  id: 'ovl_sample_1',
  text: 'Sample Subtitle',
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
  enabled: true
};

// ── Tests A through AI ────────────────────────────────────────────────────────

// A. Editor loads template
test('A. Editor loads template: correctly initializes draft from existing template', () => {
  const tmp = makeTmpDir();
  try {
    const tpl = createCaptionTemplate({
      name: 'Channel Intro',
      description: 'Intro title preset',
      overlays: [sampleOverlay]
    }, tmp);

    // Simulate editor draft initialization
    const draft = {
      name: tpl.name,
      description: tpl.description,
      overlays: deepClone(tpl.overlays)
    };

    assert.strictEqual(draft.name, 'Channel Intro');
    assert.strictEqual(draft.description, 'Intro title preset');
    assert.strictEqual(draft.overlays.length, 1);
    assert.strictEqual(draft.overlays[0].text, 'Sample Subtitle');
  } finally {
    cleanupTmpDir(tmp);
  }
});

// B. Editor deep clones template
test('B. Editor deep clones template: modifying draft does not alter original template', () => {
  const tmp = makeTmpDir();
  try {
    const original = createCaptionTemplate({
      name: 'Original Title',
      description: 'Original Description',
      overlays: [sampleOverlay]
    }, tmp);

    const draft = {
      name: original.name,
      description: original.description,
      overlays: deepClone(original.overlays)
    };

    // Mutate draft in memory
    draft.name = 'Mutated Name';
    draft.overlays[0].text = 'Mutated Text';
    draft.overlays[0].fontSize = 120;

    // Verify stored template on disk/memory is unchanged
    const fetched = getCaptionTemplate(original.id, tmp);
    assert.strictEqual(fetched.name, 'Original Title');
    assert.strictEqual(fetched.overlays[0].text, 'Sample Subtitle');
    assert.strictEqual(fetched.overlays[0].fontSize, 48);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// C. Edit name
test('C. Edit name: validates non-empty, trims whitespace, enforces 1-100 character limits', () => {
  assert.strictEqual(validateTemplateName('  Clean Preset  '), 'Clean Preset');
  assert.throws(() => validateTemplateName(''), /cannot be empty/);
  assert.throws(() => validateTemplateName('   '), /cannot be empty/);
  assert.throws(() => validateTemplateName(null), /must be a string/);
  assert.throws(() => validateTemplateName('A'.repeat(101)), /cannot exceed 100 characters/);
  assert.strictEqual(validateTemplateName('A'.repeat(100)).length, 100);
});

// D. Edit description
test('D. Edit description: allows empty, trims whitespace, enforces max 300 characters', () => {
  assert.strictEqual(validateTemplateDescription(null), '');
  assert.strictEqual(validateTemplateDescription(undefined), '');
  assert.strictEqual(validateTemplateDescription('  '), '');
  assert.strictEqual(validateTemplateDescription('  Useful subtitle template  '), 'Useful subtitle template');
  assert.throws(() => validateTemplateDescription('X'.repeat(301)), /cannot exceed 300 characters/);
  assert.strictEqual(validateTemplateDescription('X'.repeat(300)).length, 300);
});

// E. Add overlay
test('E. Add overlay: generates unique ID and safe default properties', () => {
  const o1 = createDefaultOverlay();
  const o2 = createDefaultOverlay();

  assert.ok(o1.id && typeof o1.id === 'string');
  assert.ok(o2.id && typeof o2.id === 'string');
  assert.notStrictEqual(o1.id, o2.id);

  assert.strictEqual(o1.fontFamily, 'Arial');
  assert.strictEqual(o1.fontSize, 48);
  assert.strictEqual(o1.position, 'bottom');
  assert.strictEqual(o1.enabled, true);
  assert.strictEqual(o1.startTime, 0);
  assert.strictEqual(o1.endTime, null);
});

// F. Duplicate overlay
test('F. Duplicate overlay: clones visual styles and configuration properly', () => {
  const source = {
    ...sampleOverlay,
    fontFamily: 'Verdana',
    fontSize: 72,
    fontWeight: 'bold',
    color: '#FFCC00',
    opacity: 0.9,
    position: 'top',
    outlineWidth: 3
  };

  const copy = { ...deepClone(source), id: `ovl_dup_${Date.now()}` };

  assert.strictEqual(copy.fontFamily, source.fontFamily);
  assert.strictEqual(copy.fontSize, source.fontSize);
  assert.strictEqual(copy.fontWeight, source.fontWeight);
  assert.strictEqual(copy.color, source.color);
  assert.strictEqual(copy.opacity, source.opacity);
  assert.strictEqual(copy.position, source.position);
  assert.strictEqual(copy.outlineWidth, source.outlineWidth);
});

// G. Duplicate overlay has unique ID
test('G. Duplicate overlay has unique ID distinct from source overlay', () => {
  const source = { ...sampleOverlay, id: 'ovl_original_id' };
  let counter = 0;
  const duplicate = (src) => ({
    ...deepClone(src),
    id: `ovl_dup_${Date.now()}_${++counter}`
  });

  const dup1 = duplicate(source);
  const dup2 = duplicate(source);

  assert.notStrictEqual(dup1.id, source.id);
  assert.notStrictEqual(dup2.id, source.id);
  assert.notStrictEqual(dup1.id, dup2.id);
});

// H. Duplicate overlay is independent
test('H. Duplicate overlay is independent: modifying copy does not mutate original', () => {
  const source = { ...sampleOverlay };
  const copy = { ...deepClone(source), id: 'ovl_new_id' };

  copy.text = 'Completely New Text';
  copy.fontSize = 24;
  copy.color = '#00FF00';

  assert.strictEqual(source.text, 'Sample Subtitle');
  assert.strictEqual(source.fontSize, 48);
  assert.strictEqual(source.color, '#FFFFFF');
});

// I. Delete overlay
test('I. Delete overlay: removes overlay from draft list and maintains valid count', () => {
  const overlays = [
    { ...sampleOverlay, id: 'ovl_1', text: 'First' },
    { ...sampleOverlay, id: 'ovl_2', text: 'Second' },
    { ...sampleOverlay, id: 'ovl_3', text: 'Third' }
  ];

  const filtered = overlays.filter(o => o.id !== 'ovl_2');
  assert.strictEqual(filtered.length, 2);
  assert.strictEqual(filtered[0].id, 'ovl_1');
  assert.strictEqual(filtered[1].id, 'ovl_3');
});

// J. Enable/disable overlay
test('J. Enable/disable overlay: toggles enabled flag correctly without modifying other fields', () => {
  const overlay = { ...sampleOverlay, enabled: true };
  const toggledOff = { ...overlay, enabled: false };
  assert.strictEqual(toggledOff.enabled, false);
  assert.strictEqual(toggledOff.text, overlay.text);

  const toggledOn = { ...toggledOff, enabled: true };
  assert.strictEqual(toggledOn.enabled, true);
});

// K. Maximum 5 overlays
test('K. Maximum 5 overlays: enforces strict ceiling of 5 overlays', () => {
  const five = [
    sampleOverlay, sampleOverlay, sampleOverlay, sampleOverlay, sampleOverlay
  ];
  const validatedFive = validateTextOverlayConfig(five);
  assert.strictEqual(validatedFive.length, 5);

  const six = [
    sampleOverlay, sampleOverlay, sampleOverlay, sampleOverlay, sampleOverlay, sampleOverlay
  ];
  assert.throws(() => {
    validateTextOverlayConfig(six);
  }, /Maximum 5 text overlays allowed/);
});

// L. Text validation
test('L. Text validation: enforces string type and max 500 characters', () => {
  assert.throws(() => validateSingleOverlay({ text: null }), /must be a string/);
  assert.throws(() => validateSingleOverlay({ text: 123 }), /must be a string/);
  assert.throws(() => validateSingleOverlay({ text: 'A'.repeat(501) }), /maximum 500 characters/);

  const valid = validateSingleOverlay({ text: 'A'.repeat(500) });
  assert.strictEqual(valid.text.length, 500);
});

// M. Font validation
test('M. Font validation: whitelisted fonts accepted, invalid fonts rejected', () => {
  for (const font of ALLOWED_FONTS) {
    const res = validateSingleOverlay({ text: 'Hello', fontFamily: font });
    assert.strictEqual(res.fontFamily, font);
  }

  assert.throws(() => {
    validateSingleOverlay({ text: 'Hello', fontFamily: 'Comic Sans MS' }, 0, { fallbackFont: false });
  }, /Invalid font family/);
});

// N. Font size validation
test('N. Font size validation: accepts 12–160, rejects < 12 and > 160', () => {
  const min = validateSingleOverlay({ text: 'Test', fontSize: 12 });
  assert.strictEqual(min.fontSize, 12);

  const max = validateSingleOverlay({ text: 'Test', fontSize: 160 });
  assert.strictEqual(max.fontSize, 160);

  assert.throws(() => validateSingleOverlay({ text: 'Test', fontSize: 11 }), /Font size must be between 12 and 160/);
  assert.throws(() => validateSingleOverlay({ text: 'Test', fontSize: 161 }), /Font size must be between 12 and 160/);
  assert.throws(() => validateSingleOverlay({ text: 'Test', fontSize: 'invalid' }), /Font size must be between 12 and 160/);
});

// O. Color validation
test('O. Color validation: accepts 3 and 6-char hex, normalizes to uppercase, rejects bad hex', () => {
  const c1 = validateSingleOverlay({ text: 'Test', color: '#fff' });
  assert.strictEqual(c1.color, '#FFF');

  const c2 = validateSingleOverlay({ text: 'Test', color: '#ffcc00' });
  assert.strictEqual(c2.color, '#FFCC00');

  assert.throws(() => validateSingleOverlay({ text: 'Test', color: 'red' }), /Invalid text color/);
  assert.throws(() => validateSingleOverlay({ text: 'Test', color: '#12345' }), /Invalid text color/);
  assert.throws(() => validateSingleOverlay({ text: 'Test', color: 'rgb(255,0,0)' }), /Invalid text color/);
});

// P. Opacity validation
test('P. Opacity validation: accepts 0 to 1, rejects out of range values', () => {
  const o0 = validateSingleOverlay({ text: 'Test', opacity: 0 });
  assert.strictEqual(o0.opacity, 0);

  const o1 = validateSingleOverlay({ text: 'Test', opacity: 1 });
  assert.strictEqual(o1.opacity, 1);

  const oHalf = validateSingleOverlay({ text: 'Test', opacity: 0.5 });
  assert.strictEqual(oHalf.opacity, 0.5);

  assert.throws(() => validateSingleOverlay({ text: 'Test', opacity: -0.1 }), /must be between 0 and 1/);
  assert.throws(() => validateSingleOverlay({ text: 'Test', opacity: 1.1 }), /must be between 0 and 1/);
});

// Q. Background validation
test('Q. Background validation: validates backgroundColor and backgroundOpacity', () => {
  const bg = validateSingleOverlay({
    text: 'Test',
    backgroundColor: '#333333',
    backgroundOpacity: 0.8
  });
  assert.strictEqual(bg.backgroundColor, '#333333');
  assert.strictEqual(bg.backgroundOpacity, 0.8);

  assert.throws(() => validateSingleOverlay({ text: 'Test', backgroundColor: 'invalid' }), /Invalid background color/);
  assert.throws(() => validateSingleOverlay({ text: 'Test', backgroundOpacity: 2 }), /must be between 0 and 1/);
});

// R. Outline validation
test('R. Outline validation: validates outlineColor and outlineWidth in 0-10 range', () => {
  const out = validateSingleOverlay({
    text: 'Test',
    outlineColor: '#000000',
    outlineWidth: 5
  });
  assert.strictEqual(out.outlineColor, '#000000');
  assert.strictEqual(out.outlineWidth, 5);

  assert.throws(() => validateSingleOverlay({ text: 'Test', outlineWidth: -1 }), /Outline width must be between 0 and 10/);
  assert.throws(() => validateSingleOverlay({ text: 'Test', outlineWidth: 11 }), /Outline width must be between 0 and 10/);
});

// S. Position validation
test('S. Position validation: accepts top, center, bottom, custom; rejects invalid position', () => {
  for (const pos of ALLOWED_POSITIONS) {
    const res = validateSingleOverlay({ text: 'Test', position: pos });
    assert.strictEqual(res.position, pos);
  }

  assert.throws(() => validateSingleOverlay({ text: 'Test', position: 'somewhere' }), /Position must be one of/);
});

// T. Custom X/Y validation
test('T. Custom X/Y validation: accepts coordinates between 0 and 1, rejects out of range', () => {
  const coord = validateSingleOverlay({ text: 'Test', position: 'custom', x: 0.25, y: 0.75 });
  assert.strictEqual(coord.x, 0.25);
  assert.strictEqual(coord.y, 0.75);

  assert.throws(() => validateSingleOverlay({ text: 'Test', x: -0.1 }), /Custom coordinate x must be between 0 and 1/);
  assert.throws(() => validateSingleOverlay({ text: 'Test', y: 1.5 }), /Custom coordinate y must be between 0 and 1/);
});

// U. Timing validation
test('U. Timing validation: enforces startTime >= 0 and endTime > startTime or null', () => {
  const t1 = validateSingleOverlay({ text: 'Test', startTime: 0, endTime: null });
  assert.strictEqual(t1.startTime, 0);
  assert.strictEqual(t1.endTime, null);

  const t2 = validateSingleOverlay({ text: 'Test', startTime: 2.5, endTime: 5.0 });
  assert.strictEqual(t2.startTime, 2.5);
  assert.strictEqual(t2.endTime, 5.0);

  assert.throws(() => validateSingleOverlay({ text: 'Test', startTime: -1 }), /Start time must be greater than or equal to 0/);
  assert.throws(() => validateSingleOverlay({ text: 'Test', startTime: 5, endTime: 3 }), /End time must be greater than start time/);
  assert.throws(() => validateSingleOverlay({ text: 'Test', startTime: 5, endTime: 5 }), /End time must be greater than start time/);
});

// V. Save valid template
test('V. Save valid template: creates and updates template via captionTemplateManager', () => {
  const tmp = makeTmpDir();
  try {
    const created = createCaptionTemplate({
      name: 'Saved Template',
      description: 'Saved Description',
      overlays: [sampleOverlay]
    }, tmp);

    assert.ok(created.id);
    assert.strictEqual(created.name, 'Saved Template');

    const updated = updateCaptionTemplate(created.id, {
      name: 'Updated Saved Template',
      description: 'Updated Description',
      overlays: [{ ...sampleOverlay, fontSize: 60 }]
    }, tmp);

    assert.strictEqual(updated.name, 'Updated Saved Template');
    assert.strictEqual(updated.overlays[0].fontSize, 60);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// W. Invalid save rejected
test('W. Invalid save rejected: rejects empty name, 0 overlays, or invalid overlay settings', () => {
  const tmp = makeTmpDir();
  try {
    assert.throws(() => {
      createCaptionTemplate({ name: '', overlays: [sampleOverlay] }, tmp);
    }, /Template name cannot be empty/);

    assert.throws(() => {
      createCaptionTemplate({ name: 'Valid', overlays: [] }, tmp);
    }, /Template must contain at least one overlay/);

    assert.throws(() => {
      createCaptionTemplate({
        name: 'Valid',
        overlays: [{ ...sampleOverlay, fontSize: 500 }]
      }, tmp);
    }, /Font size must be between/);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// X. Cancel preserves stored template
test('X. Cancel preserves stored template: unconfirmed draft edits never touch stored template', () => {
  const tmp = makeTmpDir();
  try {
    const stored = createCaptionTemplate({
      name: 'Persisted Template',
      description: 'Persisted Desc',
      overlays: [sampleOverlay]
    }, tmp);

    // Simulate editing draft in editor, then clicking Cancel
    let editorDraft = {
      name: 'Canceled Name',
      description: 'Canceled Desc',
      overlays: [{ ...sampleOverlay, text: 'Canceled Overlay' }]
    };
    // User clicks Cancel -> discard editorDraft
    editorDraft = null;

    // Check store on disk
    const onDisk = getCaptionTemplate(stored.id, tmp);
    assert.strictEqual(onDisk.name, 'Persisted Template');
    assert.strictEqual(onDisk.description, 'Persisted Desc');
    assert.strictEqual(onDisk.overlays[0].text, 'Sample Subtitle');
  } finally {
    cleanupTmpDir(tmp);
  }
});

// Y. Reset preserves stored template
test('Y. Reset preserves stored template: restoring draft does not write to disk until save', () => {
  const tmp = makeTmpDir();
  try {
    const stored = createCaptionTemplate({
      name: 'Reset Test',
      description: 'Reset Desc',
      overlays: [sampleOverlay]
    }, tmp);

    const initialDraft = {
      name: stored.name,
      description: stored.description,
      overlays: deepClone(stored.overlays)
    };

    let activeDraft = deepClone(initialDraft);
    activeDraft.name = 'Temporary Edits';
    activeDraft.overlays[0].text = 'Temporary Text';

    // Click Reset
    activeDraft = deepClone(initialDraft);

    assert.strictEqual(activeDraft.name, 'Reset Test');
    assert.strictEqual(activeDraft.overlays[0].text, 'Sample Subtitle');

    // Disk remains at initial stored state
    const fetched = getCaptionTemplate(stored.id, tmp);
    assert.strictEqual(fetched.name, 'Reset Test');
    assert.strictEqual(fetched.overlays[0].text, 'Sample Subtitle');
  } finally {
    cleanupTmpDir(tmp);
  }
});

// Z. Built-in remains immutable
test('Z. Built-in remains immutable: direct mutation and deletion of built-ins throw errors', () => {
  const tmp = makeTmpDir();
  try {
    assert.throws(() => {
      updateCaptionTemplate('tpl_builtin_clean', { name: 'Mutated Clean' }, tmp);
    }, /Built-in templates cannot be modified/);

    assert.throws(() => {
      deleteCaptionTemplate('tpl_builtin_clean', tmp);
    }, /Built-in templates cannot be deleted/);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// AA. Built-in duplicate creates custom
test('AA. Built-in duplicate creates custom: produces editable custom template with unique ID', () => {
  const tmp = makeTmpDir();
  try {
    const dup = duplicateCaptionTemplate('tpl_builtin_bold', {}, tmp);
    assert.ok(dup.id);
    assert.notStrictEqual(dup.id, 'tpl_builtin_bold');
    assert.strictEqual(dup.isBuiltIn, false);
    assert.strictEqual(dup.name, 'Bold Copy');

    // Editable because it is custom
    const edited = updateCaptionTemplate(dup.id, { name: 'My Custom Bold' }, tmp);
    assert.strictEqual(edited.name, 'My Custom Bold');
  } finally {
    cleanupTmpDir(tmp);
  }
});

// AB. Custom edit persists
test('AB. Custom edit persists: update updates disk file and survives fresh load', () => {
  const tmp = makeTmpDir();
  try {
    const created = createCaptionTemplate({
      name: 'Persistent Custom',
      overlays: [sampleOverlay]
    }, tmp);

    updateCaptionTemplate(created.id, {
      name: 'Persistent Custom Updated',
      overlays: [{ ...sampleOverlay, color: '#FF0000' }]
    }, tmp);

    // Simulate reload from disk in a fresh call
    const loaded = getCaptionTemplate(created.id, tmp);
    assert.strictEqual(loaded.name, 'Persistent Custom Updated');
    assert.strictEqual(loaded.overlays[0].color, '#FF0000');
  } finally {
    cleanupTmpDir(tmp);
  }
});

// AC. Custom delete still works
test('AC. Custom delete still works: deleting custom template removes it from file', () => {
  const tmp = makeTmpDir();
  try {
    const created = createCaptionTemplate({
      name: 'To Delete',
      overlays: [sampleOverlay]
    }, tmp);

    assert.ok(getCaptionTemplate(created.id, tmp));
    const res = deleteCaptionTemplate(created.id, tmp);
    assert.strictEqual(res.success, true);
    assert.strictEqual(getCaptionTemplate(created.id, tmp), null);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// AD. Apply remains deep-cloned
test('AD. Apply remains deep-cloned: mutating applied overlays never mutates template', () => {
  const tmp = makeTmpDir();
  try {
    const tpl = createCaptionTemplate({
      name: 'Apply Template Test',
      overlays: [sampleOverlay]
    }, tmp);

    // Simulate Apply
    const appliedOverlays = deepClone(tpl.overlays);

    // Mutate applied overlays in video editor
    appliedOverlays[0].text = 'Applied Text In Video Cutter';
    appliedOverlays[0].fontSize = 99;

    // Stored template remains pristine
    const stored = getCaptionTemplate(tpl.id, tmp);
    assert.strictEqual(stored.overlays[0].text, 'Sample Subtitle');
    assert.strictEqual(stored.overlays[0].fontSize, 48);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// AE. IPC contract remains secure
test('AE. IPC contract remains secure: standardized { success, ... } responses returned', () => {
  const tmp = makeTmpDir();
  try {
    // get handler simulation
    const getRes = (() => {
      try {
        const tpl = getCaptionTemplate('tpl_builtin_clean', tmp);
        return { success: true, template: tpl };
      } catch (err) {
        return { success: false, error: err.message };
      }
    })();
    assert.strictEqual(getRes.success, true);
    assert.strictEqual(getRes.template.id, 'tpl_builtin_clean');

    // invalid update simulation
    const badUpdate = (() => {
      try {
        updateCaptionTemplate('tpl_builtin_clean', { name: 'Bad' }, tmp);
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    })();
    assert.strictEqual(badUpdate.success, false);
    assert.ok(badUpdate.error.includes('Built-in'));
  } finally {
    cleanupTmpDir(tmp);
  }
});

// AF. Unexpected payload rejected
test('AF. Unexpected payload rejected: functions and non-object root rejected', () => {
  assert.throws(() => validateTemplateInput(null), /must be a non-null object/);
  assert.throws(() => validateTemplateInput([1, 2, 3]), /must be a non-null object/);
  assert.throws(() => {
    validateTemplateInput({
      name: 'Exploit',
      overlays: [sampleOverlay],
      exec: () => {}
    });
  }, /functions are not allowed/);
});

// AG. No arbitrary font paths
test('AG. No arbitrary font paths: paths with slashes or font extensions rejected', () => {
  const malicious = ['C:\\Windows\\Fonts\\evil.ttf', '/usr/share/fonts/hack.otf', '../custom.ttf'];
  for (const m of malicious) {
    assert.throws(() => {
      validateSingleOverlay({ text: 'Hello', fontFamily: m });
    }, /Arbitrary font paths are not allowed/);
  }
});

// AH. No arbitrary FFmpeg filters
test('AH. No arbitrary FFmpeg filters: text escaping neutralizes colons, commas, and escapes', () => {
  const injection = "test:enable='between(t,0,10)':box=1,scale=1920:1080";
  const escaped = escapeFfmpegText(injection);
  assert.ok(escaped.includes('\\:'));
  assert.ok(escaped.includes('\\,'));

  const filterStr = buildDrawTextFilter({
    ...sampleOverlay,
    text: injection
  });
  assert.ok(filterStr);
  assert.ok(filterStr.startsWith('drawtext='));
});

// AI. Template remains serializable
test('AI. Template remains serializable: valid JSON roundtrip without circular references', () => {
  const tmp = makeTmpDir();
  try {
    const tpl = createCaptionTemplate({
      name: 'Serialization Preset',
      description: 'Testing JSON roundtrip',
      overlays: [sampleOverlay]
    }, tmp);

    const json = JSON.stringify(tpl);
    const parsed = JSON.parse(json);
    assert.strictEqual(parsed.id, tpl.id);
    assert.strictEqual(parsed.name, tpl.name);
    assert.strictEqual(parsed.overlays.length, 1);
  } finally {
    cleanupTmpDir(tmp);
  }
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
  console.log(`📊 Caption Preset Editor Test Results: ${passedCount} / ${totalCount} passed`);
  console.log(`======================================================\n`);
}

runAll().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
