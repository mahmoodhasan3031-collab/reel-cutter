'use strict';

const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');

const {
  SUPPORTED_PLATFORMS,
  MAX_NAME_LENGTH,
  validateProfileName,
  validatePlatform,
  loadProfiles,
  listProfiles,
  createProfile,
  updateProfile,
  deleteProfile,
  duplicateProfile,
  setSelectedProfile,
} = require('../src/main/profiles/profileManager');

console.log('======================================================');
console.log('Running Page Profile Manager Test Suite (Phase 2A)');
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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'reel-pm-'));
}
function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

// 1. Constants
test('SUPPORTED_PLATFORMS has 5 entries', function() {
  assert.strictEqual(SUPPORTED_PLATFORMS.length, 5);
  assert.ok(SUPPORTED_PLATFORMS.includes('Facebook'));
  assert.ok(SUPPORTED_PLATFORMS.includes('Instagram'));
  assert.ok(SUPPORTED_PLATFORMS.includes('YouTube'));
  assert.ok(SUPPORTED_PLATFORMS.includes('TikTok'));
  assert.ok(SUPPORTED_PLATFORMS.includes('Other'));
});

test('MAX_NAME_LENGTH is 80', function() {
  assert.strictEqual(MAX_NAME_LENGTH, 80);
});

// 2. Name Validation
test('validateProfileName accepts normal name', function() {
  assert.strictEqual(validateProfileName('My Page'), 'My Page');
});

test('validateProfileName trims whitespace', function() {
  assert.strictEqual(validateProfileName('  trimmed  '), 'trimmed');
});

test('validateProfileName rejects empty string', function() {
  assert.throws(function() { validateProfileName(''); }, /empty/i);
});

test('validateProfileName rejects whitespace-only', function() {
  assert.throws(function() { validateProfileName('   '); }, /empty/i);
});

test('validateProfileName rejects name over 80 chars', function() {
  assert.throws(function() { validateProfileName('A'.repeat(81)); }, /80/);
});

test('validateProfileName accepts exactly 80 chars', function() {
  assert.strictEqual(validateProfileName('B'.repeat(80)).length, 80);
});

test('validateProfileName rejects non-string', function() {
  assert.throws(function() { validateProfileName(42); }, /string/i);
});

// 3. Platform Validation
test('validatePlatform normalises case', function() {
  assert.strictEqual(validatePlatform('youtube'), 'YouTube');
  assert.strictEqual(validatePlatform('INSTAGRAM'), 'Instagram');
  assert.strictEqual(validatePlatform('tiktok'), 'TikTok');
});

test('validatePlatform returns Other for unknown', function() {
  assert.strictEqual(validatePlatform('snapchat'), 'Other');
});

test('validatePlatform returns Other for null', function() {
  assert.strictEqual(validatePlatform(null), 'Other');
});

// 4. createProfile
test('createProfile returns profile with all required fields', function() {
  var dir = tmpDir();
  try {
    var p = createProfile({ name: 'FB Page', platform: 'Facebook', enabled: true }, dir);
    assert.ok(p.id);
    assert.strictEqual(p.name, 'FB Page');
    assert.strictEqual(p.platform, 'Facebook');
    assert.strictEqual(p.enabled, true);
    assert.ok(p.createdAt);
    assert.ok(p.updatedAt);
    assert.ok(p.variationPreset);
  } finally { cleanup(dir); }
});

test('createProfile persists to disk', function() {
  var dir = tmpDir();
  try {
    createProfile({ name: 'Persist', platform: 'YouTube' }, dir);
    var raw = JSON.parse(fs.readFileSync(path.join(dir, 'profiles.json'), 'utf8'));
    assert.strictEqual(raw.profiles.length, 1);
  } finally { cleanup(dir); }
});

test('createProfile auto-selects first profile', function() {
  var dir = tmpDir();
  try {
    var p = createProfile({ name: 'First', platform: 'Instagram' }, dir);
    var list = listProfiles(dir);
    assert.strictEqual(list.selectedProfileId, p.id);
  } finally { cleanup(dir); }
});

test('createProfile does not auto-select when profiles exist', function() {
  var dir = tmpDir();
  try {
    var first = createProfile({ name: 'First', platform: 'Facebook' }, dir);
    createProfile({ name: 'Second', platform: 'TikTok' }, dir);
    var list = listProfiles(dir);
    assert.strictEqual(list.selectedProfileId, first.id);
  } finally { cleanup(dir); }
});

test('createProfile rejects empty name', function() {
  var dir = tmpDir();
  try {
    assert.throws(function() { createProfile({ name: '' }, dir); }, /empty/i);
  } finally { cleanup(dir); }
});

test('createProfile generates unique IDs', function() {
  var dir = tmpDir();
  try {
    var p1 = createProfile({ name: 'Alpha', platform: 'Facebook' }, dir);
    var p2 = createProfile({ name: 'Beta', platform: 'Instagram' }, dir);
    assert.notStrictEqual(p1.id, p2.id);
  } finally { cleanup(dir); }
});

// 5. listProfiles
test('listProfiles returns empty when no file', function() {
  var dir = tmpDir();
  try {
    var list = listProfiles(dir);
    assert.strictEqual(list.length, 0);
    assert.strictEqual(list.selectedProfileId, null);
  } finally { cleanup(dir); }
});

test('listProfiles returns all profiles', function() {
  var dir = tmpDir();
  try {
    createProfile({ name: 'P1', platform: 'Facebook' }, dir);
    createProfile({ name: 'P2', platform: 'YouTube' }, dir);
    var list = listProfiles(dir);
    assert.strictEqual(list.length, 2);
  } finally { cleanup(dir); }
});

// 6. updateProfile
test('updateProfile updates name while preserving ID', function() {
  var dir = tmpDir();
  try {
    var p = createProfile({ name: 'Original', platform: 'Facebook' }, dir);
    var upd = updateProfile(p.id, { name: 'Renamed' }, dir);
    assert.strictEqual(upd.id, p.id);
    assert.strictEqual(upd.name, 'Renamed');
  } finally { cleanup(dir); }
});

test('updateProfile preserves createdAt', function() {
  var dir = tmpDir();
  try {
    var p = createProfile({ name: 'TS Test', platform: 'Instagram' }, dir);
    var upd = updateProfile(p.id, { name: 'TS Updated' }, dir);
    assert.strictEqual(upd.createdAt, p.createdAt);
  } finally { cleanup(dir); }
});

test('updateProfile throws for non-existent ID', function() {
  var dir = tmpDir();
  try {
    assert.throws(function() { updateProfile('ghost', { name: 'X' }, dir); }, /not found/i);
  } finally { cleanup(dir); }
});

test('updateProfile can toggle enabled status', function() {
  var dir = tmpDir();
  try {
    var p = createProfile({ name: 'Toggle', platform: 'TikTok', enabled: true }, dir);
    var dis = updateProfile(p.id, { enabled: false }, dir);
    assert.strictEqual(dis.enabled, false);
    var en = updateProfile(p.id, { enabled: true }, dir);
    assert.strictEqual(en.enabled, true);
  } finally { cleanup(dir); }
});

// 7. deleteProfile
test('deleteProfile removes profile from disk', function() {
  var dir = tmpDir();
  try {
    var p = createProfile({ name: 'Delete Me', platform: 'Facebook' }, dir);
    deleteProfile(p.id, dir);
    var list = listProfiles(dir);
    assert.ok(!list.some(function(x) { return x.id === p.id; }));
  } finally { cleanup(dir); }
});

test('deleteProfile throws for non-existent ID', function() {
  var dir = tmpDir();
  try {
    assert.throws(function() { deleteProfile('ghost', dir); }, /not found/i);
  } finally { cleanup(dir); }
});

test('deleteProfile selects next profile when active is deleted', function() {
  var dir = tmpDir();
  try {
    var p1 = createProfile({ name: 'First', platform: 'Facebook' }, dir);
    var p2 = createProfile({ name: 'Second', platform: 'YouTube' }, dir);
    setSelectedProfile(p1.id, dir);
    deleteProfile(p1.id, dir);
    var list = listProfiles(dir);
    assert.strictEqual(list.selectedProfileId, p2.id);
  } finally { cleanup(dir); }
});

test('deleteProfile sets selectedProfileId to null when last removed', function() {
  var dir = tmpDir();
  try {
    var p = createProfile({ name: 'Only', platform: 'TikTok' }, dir);
    deleteProfile(p.id, dir);
    var list = listProfiles(dir);
    assert.strictEqual(list.selectedProfileId, null);
  } finally { cleanup(dir); }
});

// 8. duplicateProfile
test('duplicateProfile creates clone with new unique ID', function() {
  var dir = tmpDir();
  try {
    var p = createProfile({ name: 'Original', platform: 'Facebook' }, dir);
    var dup = duplicateProfile(p.id, dir);
    assert.notStrictEqual(dup.id, p.id);
    assert.strictEqual(dup.platform, p.platform);
  } finally { cleanup(dir); }
});

test('duplicateProfile appends Copy suffix', function() {
  var dir = tmpDir();
  try {
    var p = createProfile({ name: 'MyPage', platform: 'Instagram' }, dir);
    var dup = duplicateProfile(p.id, dir);
    assert.strictEqual(dup.name, 'MyPage Copy');
  } finally { cleanup(dir); }
});

test('duplicateProfile generates numbered suffix on collision', function() {
  var dir = tmpDir();
  try {
    var p = createProfile({ name: 'MyPage', platform: 'Instagram' }, dir);
    var dup1 = duplicateProfile(p.id, dir);
    assert.strictEqual(dup1.name, 'MyPage Copy');
    var dup2 = duplicateProfile(p.id, dir);
    assert.strictEqual(dup2.name, 'MyPage Copy 2');
  } finally { cleanup(dir); }
});

test('duplicateProfile throws for non-existent ID', function() {
  var dir = tmpDir();
  try {
    assert.throws(function() { duplicateProfile('missing', dir); }, /not found/i);
  } finally { cleanup(dir); }
});

// 9. setSelectedProfile
test('setSelectedProfile sets active profile', function() {
  var dir = tmpDir();
  try {
    var p1 = createProfile({ name: 'A', platform: 'Facebook' }, dir);
    var p2 = createProfile({ name: 'B', platform: 'YouTube' }, dir);
    setSelectedProfile(p2.id, dir);
    var list = listProfiles(dir);
    assert.strictEqual(list.selectedProfileId, p2.id);
  } finally { cleanup(dir); }
});

test('setSelectedProfile allows deselect with null', function() {
  var dir = tmpDir();
  try {
    createProfile({ name: 'A', platform: 'Facebook' }, dir);
    setSelectedProfile(null, dir);
    var list = listProfiles(dir);
    assert.strictEqual(list.selectedProfileId, null);
  } finally { cleanup(dir); }
});

test('setSelectedProfile throws for non-existent ID', function() {
  var dir = tmpDir();
  try {
    assert.throws(function() { setSelectedProfile('ghost', dir); }, /non-existent/i);
  } finally { cleanup(dir); }
});

// 10. Variation preset bounds
test('createProfile rejects brightness > 1.0', function() {
  var dir = tmpDir();
  try {
    assert.throws(function() { createProfile({ name: 'B', variationPreset: { brightness: 1.5 } }, dir); }, /brightness/i);
  } finally { cleanup(dir); }
});

test('createProfile rejects saturation > 3.0', function() {
  var dir = tmpDir();
  try {
    assert.throws(function() { createProfile({ name: 'S', variationPreset: { saturation: 5 } }, dir); }, /saturation/i);
  } finally { cleanup(dir); }
});

test('createProfile rejects hue < -180', function() {
  var dir = tmpDir();
  try {
    assert.throws(function() { createProfile({ name: 'H', variationPreset: { hue: -200 } }, dir); }, /hue/i);
  } finally { cleanup(dir); }
});

test('createProfile rejects pitch > 3.0', function() {
  var dir = tmpDir();
  try {
    assert.throws(function() { createProfile({ name: 'P', variationPreset: { pitch: 5 } }, dir); }, /pitch/i);
  } finally { cleanup(dir); }
});

test('createProfile rejects speed > 1.05', function() {
  var dir = tmpDir();
  try {
    assert.throws(function() { createProfile({ name: 'Sp', variationPreset: { speed: 2 } }, dir); }, /speed/i);
  } finally { cleanup(dir); }
});

test('createProfile rejects invalid reframe mode', function() {
  var dir = tmpDir();
  try {
    assert.throws(function() { createProfile({ name: 'M', variationPreset: { mode: 'diagonal' } }, dir); }, /reframe mode/i);
  } finally { cleanup(dir); }
});

// 11. Persistence roundtrip
test('profiles persist across loadProfiles calls', function() {
  var dir = tmpDir();
  try {
    var p = createProfile({ name: 'Persistent', platform: 'TikTok' }, dir);
    var data = loadProfiles(dir);
    assert.strictEqual(data.profiles.length, 1);
    assert.strictEqual(data.profiles[0].id, p.id);
  } finally { cleanup(dir); }
});

// 12. Malformed / missing file recovery
test('listProfiles recovers from corrupt JSON', function() {
  var dir = tmpDir();
  try {
    fs.writeFileSync(path.join(dir, 'profiles.json'), '{bad json!', 'utf8');
    var list = listProfiles(dir);
    assert.strictEqual(list.length, 0);
    assert.strictEqual(list.selectedProfileId, null);
  } finally { cleanup(dir); }
});

test('listProfiles recovers from non-array profiles field', function() {
  var dir = tmpDir();
  try {
    fs.writeFileSync(path.join(dir, 'profiles.json'), JSON.stringify({ profiles: 'invalid', selectedProfileId: null }), 'utf8');
    var list = listProfiles(dir);
    assert.strictEqual(list.length, 0);
  } finally { cleanup(dir); }
});

test('listProfiles normalises unknown platform to Other', function() {
  var dir = tmpDir();
  try {
    fs.writeFileSync(path.join(dir, 'profiles.json'), JSON.stringify({ selectedProfileId: null, profiles: [{ id: 'x1', name: 'Test', platform: 'Snapchat', enabled: true }] }), 'utf8');
    var list = listProfiles(dir);
    assert.strictEqual(list[0].platform, 'Other');
  } finally { cleanup(dir); }
});

test('listProfiles filters out profiles with no id field', function() {
  var dir = tmpDir();
  try {
    fs.writeFileSync(path.join(dir, 'profiles.json'), JSON.stringify({ selectedProfileId: null, profiles: [{ id: 'valid', name: 'Valid', platform: 'Facebook', enabled: true }, { name: 'No ID', platform: 'YouTube' }] }), 'utf8');
    var list = listProfiles(dir);
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].id, 'valid');
  } finally { cleanup(dir); }
});

// 13. Zero-regression check
test('variation validator rejects non-object input', function() {
  var v = require('../src/engine/variation/validator');
  assert.throws(function() { v.validateProductVariationConfig('bad'); }, /object/i);
});

test('variation validator returns defaults for null input', function() {
  var v = require('../src/engine/variation/validator');
  var result = v.validateProductVariationConfig(null);
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.config.enabled, false);
});

// Summary
console.log('');
console.log('======================================================');
process.stdout.write('Results: ' + passed + ' passed, ' + failed + ' failed\n');

if (failed > 0) {
  console.log('FAILED TESTS:');
  errors.forEach(function(e) { process.stdout.write('   - ' + e.name + ': ' + e.err.message + '\n'); });
  console.log('======================================================');
  process.exit(1);
} else {
  console.log('All Phase 2A profile tests PASSED');
  console.log('======================================================');
}