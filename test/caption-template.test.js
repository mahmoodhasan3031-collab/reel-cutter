'use strict';

/**
 * Phase 4B-1 — Caption Template Library Test Suite
 *
 * Covers:
 *  A. Built-in templates exist
 *  B. Exactly 5 required built-ins exist (Clean, Bold, Minimal, Promo, Social)
 *  C. Built-in IDs are stable/deterministic
 *  D. Built-ins cannot be deleted
 *  E. Built-ins cannot be directly modified
 *  F. Built-ins can be duplicated
 *  G. Custom template creation
 *  H. Name validation (required, string, 1-100 chars, trimmed)
 *  I. Description validation (string, max 300 chars, trimmed)
 *  J. Overlay validation (re-uses authoritative textOverlayValidator)
 *  K. Maximum 5 overlays enforced
 *  L. Deep clone behavior (no shared references to overlays)
 *  M. Custom update (modify name, desc, overlays)
 *  N. Custom delete
 *  O. Search/filter behavior
 *  P. Corrupt persistence recovery (safe recovery without crash)
 *  Q. Atomic persistence (writes via temp file + rename)
 *  R. Reset built-ins (restores canonical definitions without deleting custom)
 *  S. Duplicate template independence (subsequent mutations do not affect source)
 *  T. Renderer/main IPC contract simulation
 *  U. No arbitrary font path accepted in template overlays
 *  V. Unexpected payload rejection (functions, non-objects)
 *  W. Template data remains serializable (JSON safe)
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

console.log('======================================================');
console.log('🧪 Running Phase 4B-1 Caption Template Tests');
console.log('======================================================\n');

let passedCount = 0;
let totalCount = 0;
const testQueue = [];

function test(name, fn) {
  testQueue.push({ name, fn });
}

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rc_caption_tpl_test_'));
}

function cleanupTmpDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (_) {}
}

const sampleValidOverlay = {
  text: 'Sample Caption',
  fontFamily: 'Arial',
  fontSize: 48,
  fontWeight: 'normal',
  color: '#FFFFFF',
  opacity: 1,
  backgroundColor: '#000000',
  backgroundOpacity: 0.5,
  outlineColor: '#000000',
  outlineWidth: 1,
  position: 'bottom',
  alignment: 'center',
  startTime: 0,
  endTime: null,
  enabled: true
};

// ── Test Definitions ─────────────────────────────────────────────────────────

// A. Built-in templates exist
test('A. Built-in templates exist and load properly', () => {
  const tmp = makeTmpDir();
  try {
    const list = getCaptionTemplates(tmp);
    assert.ok(Array.isArray(list));
    assert.ok(list.length >= 5);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// B. Exactly 5 required built-ins exist
test('B. Exactly 5 required built-ins exist (Clean, Bold, Minimal, Promo, Social)', () => {
  const tmp = makeTmpDir();
  try {
    const list = getCaptionTemplates(tmp);
    const builtins = list.filter(t => t.isBuiltIn);
    assert.strictEqual(builtins.length, 5);
    const names = builtins.map(b => b.name);
    assert.ok(names.includes('Clean'));
    assert.ok(names.includes('Bold'));
    assert.ok(names.includes('Minimal'));
    assert.ok(names.includes('Promo'));
    assert.ok(names.includes('Social'));
  } finally {
    cleanupTmpDir(tmp);
  }
});

// C. Built-in IDs are stable/deterministic
test('C. Built-in IDs are stable/deterministic across multiple invocations', () => {
  const tmp1 = makeTmpDir();
  const tmp2 = makeTmpDir();
  try {
    const list1 = getCaptionTemplates(tmp1).filter(t => t.isBuiltIn);
    const list2 = getCaptionTemplates(tmp2).filter(t => t.isBuiltIn);
    assert.deepStrictEqual(list1.map(t => t.id), list2.map(t => t.id));
    assert.strictEqual(list1[0].id, 'tpl_builtin_clean');
    assert.strictEqual(list1[1].id, 'tpl_builtin_bold');
    assert.strictEqual(list1[2].id, 'tpl_builtin_minimal');
    assert.strictEqual(list1[3].id, 'tpl_builtin_promo');
    assert.strictEqual(list1[4].id, 'tpl_builtin_social');
  } finally {
    cleanupTmpDir(tmp1);
    cleanupTmpDir(tmp2);
  }
});

// D. Built-ins cannot be deleted
test('D. Built-ins cannot be deleted (throws error)', () => {
  const tmp = makeTmpDir();
  try {
    assert.throws(() => {
      deleteCaptionTemplate('tpl_builtin_clean', tmp);
    }, /Built-in templates cannot be deleted/);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// E. Built-ins cannot be directly modified
test('E. Built-ins cannot be directly modified (throws error)', () => {
  const tmp = makeTmpDir();
  try {
    assert.throws(() => {
      updateCaptionTemplate('tpl_builtin_bold', { name: 'Hacked Bold' }, tmp);
    }, /Built-in templates cannot be modified/);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// F. Built-ins can be duplicated
test('F. Built-ins can be duplicated to create new custom templates', () => {
  const tmp = makeTmpDir();
  try {
    const dup = duplicateCaptionTemplate('tpl_builtin_clean', {}, tmp);
    assert.ok(dup.id);
    assert.notStrictEqual(dup.id, 'tpl_builtin_clean');
    assert.strictEqual(dup.name, 'Clean Copy');
    assert.strictEqual(dup.isBuiltIn, false);
    assert.strictEqual(dup.overlays.length, 1);
    assert.strictEqual(dup.overlays[0].fontFamily, 'Arial');

    // Appears in custom templates list
    const all = getCaptionTemplates(tmp);
    assert.strictEqual(all.length, 6);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// G. Custom template creation
test('G. Custom template creation saves and returns validated template', () => {
  const tmp = makeTmpDir();
  try {
    const created = createCaptionTemplate({
      name: 'Custom Brand Title',
      description: 'Top header for educational reels',
      overlays: [sampleValidOverlay]
    }, tmp);

    assert.ok(created.id);
    assert.strictEqual(created.name, 'Custom Brand Title');
    assert.strictEqual(created.description, 'Top header for educational reels');
    assert.strictEqual(created.isBuiltIn, false);
    assert.strictEqual(created.overlays.length, 1);

    const retrieved = getCaptionTemplate(created.id, tmp);
    assert.deepStrictEqual(retrieved.name, created.name);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// H. Name validation
test('H. Name validation enforces type, non-empty, and length limits', () => {
  assert.throws(() => validateTemplateName(''), /cannot be empty/);
  assert.throws(() => validateTemplateName('   '), /cannot be empty/);
  assert.throws(() => validateTemplateName(null), /must be a string/);
  assert.throws(() => validateTemplateName(123), /must be a string/);
  assert.throws(() => validateTemplateName('A'.repeat(MAX_NAME_LENGTH + 1)), /cannot exceed 100 characters/);
  assert.strictEqual(validateTemplateName('  Valid Name  '), 'Valid Name');
});

// I. Description validation
test('I. Description validation handles length limits and trimming', () => {
  assert.strictEqual(validateTemplateDescription(null), '');
  assert.strictEqual(validateTemplateDescription(undefined), '');
  assert.strictEqual(validateTemplateDescription('  A description  '), 'A description');
  assert.throws(() => validateTemplateDescription(123), /must be a string/);
  assert.throws(() => validateTemplateDescription('A'.repeat(MAX_DESCRIPTION_LENGTH + 1)), /cannot exceed 300 characters/);
});

// J. Overlay validation
test('J. Overlay validation utilizes textOverlayValidator correctly', () => {
  assert.throws(() => {
    validateTemplateInput({
      name: 'Bad Overlay',
      overlays: [{ ...sampleValidOverlay, fontSize: 300 }] // Max is 160
    });
  }, /Font size must be between/);

  assert.throws(() => {
    validateTemplateInput({
      name: 'Empty Overlays',
      overlays: []
    });
  }, /Template must contain at least one overlay/);
});

// K. Maximum 5 overlays
test('K. Maximum 5 overlays limit enforced on templates', () => {
  const six = [
    sampleValidOverlay, sampleValidOverlay, sampleValidOverlay,
    sampleValidOverlay, sampleValidOverlay, sampleValidOverlay
  ];
  assert.throws(() => {
    validateTemplateInput({
      name: 'Too Many',
      overlays: six
    });
  }, /Template cannot contain more than 5 overlays/);

  const five = [
    sampleValidOverlay, sampleValidOverlay, sampleValidOverlay,
    sampleValidOverlay, sampleValidOverlay
  ];
  const ok = validateTemplateInput({ name: 'Five OK', overlays: five });
  assert.strictEqual(ok.overlays.length, 5);
});

// L. Deep clone behavior
test('L. Deep clone behavior prevents cross-referencing and mutable leaks', () => {
  const tmp = makeTmpDir();
  try {
    const inputOverlay = { ...sampleValidOverlay, text: 'Initial Text' };
    const created = createCaptionTemplate({
      name: 'Clone Test',
      overlays: [inputOverlay]
    }, tmp);

    // Mutate the original in-memory object
    inputOverlay.text = 'MUTATED IN MEMORY';

    // Verify stored record did not change
    const fetched = getCaptionTemplate(created.id, tmp);
    assert.strictEqual(fetched.overlays[0].text, 'Initial Text');
  } finally {
    cleanupTmpDir(tmp);
  }
});

// M. Custom update
test('M. Custom update modifies custom template name, description, and overlays', () => {
  const tmp = makeTmpDir();
  try {
    const created = createCaptionTemplate({
      name: 'Original Name',
      description: 'Original Desc',
      overlays: [sampleValidOverlay]
    }, tmp);

    const updated = updateCaptionTemplate(created.id, {
      name: 'Updated Name',
      description: 'Updated Desc',
      overlays: [{ ...sampleValidOverlay, fontSize: 36 }]
    }, tmp);

    assert.strictEqual(updated.name, 'Updated Name');
    assert.strictEqual(updated.description, 'Updated Desc');
    assert.strictEqual(updated.overlays[0].fontSize, 36);

    const fetched = getCaptionTemplate(created.id, tmp);
    assert.strictEqual(fetched.name, 'Updated Name');
  } finally {
    cleanupTmpDir(tmp);
  }
});

// N. Custom delete
test('N. Custom delete removes template from persistence file', () => {
  const tmp = makeTmpDir();
  try {
    const created = createCaptionTemplate({
      name: 'To Be Deleted',
      overlays: [sampleValidOverlay]
    }, tmp);

    assert.ok(getCaptionTemplate(created.id, tmp));
    const delResult = deleteCaptionTemplate(created.id, tmp);
    assert.strictEqual(delResult.success, true);
    assert.strictEqual(getCaptionTemplate(created.id, tmp), null);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// O. Search/filter behavior
test('O. Search and filter logic handles built-in, custom, and keyword searches', () => {
  const tmp = makeTmpDir();
  try {
    createCaptionTemplate({
      name: 'High Impact Gaming',
      description: 'Neon styled caption for stream clips',
      overlays: [sampleValidOverlay]
    }, tmp);

    createCaptionTemplate({
      name: 'Podcast Dialogue',
      description: 'Lower third dialogue overlay',
      overlays: [sampleValidOverlay]
    }, tmp);

    const all = getCaptionTemplates(tmp);
    // Filter custom only
    const customOnly = all.filter(t => !t.isBuiltIn);
    assert.strictEqual(customOnly.length, 2);

    // Search by name
    const gaming = all.filter(t => t.name.toLowerCase().includes('gaming'));
    assert.strictEqual(gaming.length, 1);
    assert.strictEqual(gaming[0].name, 'High Impact Gaming');

    // Search by description
    const stream = all.filter(t => t.description.toLowerCase().includes('stream'));
    assert.strictEqual(stream.length, 1);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// P. Corrupt persistence recovery
test('P. Corrupt persistence recovery handles invalid JSON safely without crashing', () => {
  const tmp = makeTmpDir();
  try {
    const filePath = getCaptionTemplatesFilePath(tmp);
    // Write corrupted JSON content
    fs.writeFileSync(filePath, '{ corrupt_broken_json: [}}', 'utf8');

    // Should not throw, should recover with canonical built-ins
    const recovered = getCaptionTemplates(tmp);
    assert.ok(Array.isArray(recovered));
    assert.strictEqual(recovered.length, 5);
    assert.strictEqual(recovered[0].id, 'tpl_builtin_clean');
  } finally {
    cleanupTmpDir(tmp);
  }
});

// Q. Atomic persistence
test('Q. Atomic persistence creates valid JSON and leaves no temporary remnants', () => {
  const tmp = makeTmpDir();
  try {
    createCaptionTemplate({
      name: 'Atomic Test 1',
      overlays: [sampleValidOverlay]
    }, tmp);

    const filePath = getCaptionTemplatesFilePath(tmp);
    assert.ok(fs.existsSync(filePath));

    // Ensure no dangling .tmp files in folder
    const files = fs.readdirSync(tmp);
    const tmpFiles = files.filter(f => f.includes('.tmp'));
    assert.strictEqual(tmpFiles.length, 0);

    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.strictEqual(content.templates.length, 1);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// R. Reset built-ins
test('R. Reset built-ins restores canonical templates without deleting custom templates', () => {
  const tmp = makeTmpDir();
  try {
    createCaptionTemplate({
      name: 'My Custom Preset',
      overlays: [sampleValidOverlay]
    }, tmp);

    const resetList = resetCaptionTemplates(tmp);
    const builtins = resetList.filter(t => t.isBuiltIn);
    const custom = resetList.filter(t => !t.isBuiltIn);

    assert.strictEqual(builtins.length, 5);
    assert.strictEqual(custom.length, 1);
    assert.strictEqual(custom[0].name, 'My Custom Preset');
  } finally {
    cleanupTmpDir(tmp);
  }
});

// S. Duplicate template independence
test('S. Duplicate template independence ensures mutations do not affect source', () => {
  const tmp = makeTmpDir();
  try {
    const custom1 = createCaptionTemplate({
      name: 'Parent Preset',
      description: 'Parent Desc',
      overlays: [{ ...sampleValidOverlay, text: 'Parent Text' }]
    }, tmp);

    const child = duplicateCaptionTemplate(custom1.id, { name: 'Child Preset' }, tmp);
    assert.strictEqual(child.name, 'Child Preset');
    assert.strictEqual(child.overlays[0].text, 'Parent Text');

    // Mutate child
    updateCaptionTemplate(child.id, {
      name: 'Child Mutated',
      overlays: [{ ...sampleValidOverlay, text: 'Child New Text' }]
    }, tmp);

    // Verify parent is unaffected
    const parentFetched = getCaptionTemplate(custom1.id, tmp);
    assert.strictEqual(parentFetched.name, 'Parent Preset');
    assert.strictEqual(parentFetched.overlays[0].text, 'Parent Text');
  } finally {
    cleanupTmpDir(tmp);
  }
});

// T. Renderer/main IPC contract simulation
test('T. Renderer/main IPC contract returns standardized { success, ... } structure', async () => {
  const tmp = makeTmpDir();
  try {
    // Simulating IPC list handler
    const listRes = (() => {
      try {
        const templates = getCaptionTemplates(tmp);
        return { success: true, templates };
      } catch (err) {
        return { success: false, error: err.message, templates: [] };
      }
    })();
    assert.strictEqual(listRes.success, true);
    assert.ok(Array.isArray(listRes.templates));

    // Simulating IPC create handler
    const createRes = (() => {
      try {
        const template = createCaptionTemplate({
          name: 'IPC Template',
          overlays: [sampleValidOverlay]
        }, tmp);
        return { success: true, template };
      } catch (err) {
        return { success: false, error: err.message };
      }
    })();
    assert.strictEqual(createRes.success, true);
    assert.strictEqual(createRes.template.name, 'IPC Template');
  } finally {
    cleanupTmpDir(tmp);
  }
});

// U. No arbitrary font path
test('U. No arbitrary font path accepted in template overlays', () => {
  const maliciousFonts = ['/etc/passwd', 'C:\\Fonts\\hack.ttf', '..\\fonts\\malicious.ttf'];
  for (const f of maliciousFonts) {
    assert.throws(() => {
      validateTemplateInput({
        name: 'Evil Font',
        overlays: [{ ...sampleValidOverlay, fontFamily: f }]
      });
    }, /Arbitrary font paths are not allowed/);
  }
});

// V. Unexpected payload rejection
test('V. Unexpected payload rejection rejects functions and invalid root structures', () => {
  assert.throws(() => validateTemplateInput(null), /must be a non-null object/);
  assert.throws(() => validateTemplateInput([]), /must be a non-null object/);
  assert.throws(() => validateTemplateInput('string'), /must be a non-null object/);
  assert.throws(() => {
    validateTemplateInput({
      name: 'Func Injection',
      overlays: [sampleValidOverlay],
      malicious: () => console.log('hacked')
    });
  }, /functions are not allowed/);
});

// W. Template data remains serializable
test('W. Template data remains serializable without circular references', () => {
  const tmp = makeTmpDir();
  try {
    const tpl = createCaptionTemplate({
      name: 'Serializable Check',
      description: 'Validates JSON roundtrip',
      overlays: [sampleValidOverlay]
    }, tmp);

    const serialized = JSON.stringify(tpl);
    const parsed = JSON.parse(serialized);
    assert.strictEqual(parsed.name, 'Serializable Check');
    assert.strictEqual(parsed.overlays.length, 1);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// ── Runner ───────────────────────────────────────────────────────────────────

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
  console.log(`📊 Caption Template Test Results: ${passedCount} / ${totalCount} passed`);
  console.log(`======================================================\n`);
}

runAll().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
