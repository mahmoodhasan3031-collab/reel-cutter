'use strict';

/**
 * Phase 5J — UI Timestamp Improvement Regression Tests
 *
 * Verifies:
 * 1. Timestamp remains unchanged in storage after creation and reload
 * 2. UI formatter displays both date and time
 * 3. Invalid/missing timestamp has safe fallback
 * 4. Sorting still uses the authoritative timestamp
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  createExportHistoryRecord,
  getExportHistory,
  clearExportHistory,
} = require('../src/main/history/exportHistoryManager');

// ── Helpers ─────────────────────────────────────────────────────────────────
function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rc_timestamp_test_'));
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

// ── Tests ───────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, error: err.message });
    console.log(`  ❌ ${name}`);
    console.log(`     ${err.message}`);
  }
}

async function run() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Phase 5J — UI Timestamp Improvement Regression Tests');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Dynamic import for ESM module
  const mod = await import('../src/renderer/src/utils/formatDateTime.mjs');
  const formatDateTime = mod.formatDateTime;

  let dir = null;

  try {
    dir = tmpDir();

    // ── 1. Timestamp remains unchanged in storage ───────────────────────────
    test('1: createdAt timestamp is persisted and unchanged after reload', () => {
      clearExportHistory(dir);
      createExportHistoryRecord({
        exportType: 'cut',
        source: { name: 'test.mp4', path: '/videos/test.mp4' },
        output: { path: '/out/test_cut.mp4', filename: 'test_cut.mp4', directory: '/out' },
        status: 'COMPLETED',
      }, dir);
      const { records } = getExportHistory({}, dir);
      const first = records[0].createdAt;
      const r2 = getExportHistory({}, dir).records;
      const r3 = getExportHistory({}, dir).records;
      assert.strictEqual(r2[0].createdAt, first, 'createdAt should be unchanged after reload');
      assert.strictEqual(r3[0].createdAt, first, 'createdAt should be unchanged after second reload');
    });

    test('2: createdAt is a valid ISO string with time component', () => {
      clearExportHistory(dir);
      createExportHistoryRecord({
        exportType: 'cut',
        source: { name: 'test.mp4', path: '/videos/test.mp4' },
        output: { path: '/out/test_cut.mp4', filename: 'test_cut.mp4', directory: '/out' },
        status: 'COMPLETED',
      }, dir);
      const { records } = getExportHistory({}, dir);
      const ts = records[0].createdAt;
      assert.ok(typeof ts === 'string', 'createdAt should be a string');
      assert.ok(ts.includes('T'), `createdAt should contain time separator "T": "${ts}"`);
      const d = new Date(ts);
      assert.ok(!isNaN(d.getTime()), `createdAt should be valid ISO: "${ts}"`);
    });

    // ── 2. UI formatter displays both date and time ─────────────────────────
    test('3: formatDateTime includes date and time components', () => {
      const result = formatDateTime('2026-09-15T17:42:00.000Z');
      assert.ok(result.includes('/'), `Expected date separator in "${result}"`);
      assert.ok(result.includes(':'), `Expected time separator in "${result}"`);
      assert.ok(
        result.includes('AM') || result.includes('PM'),
        `Expected AM/PM in "${result}"`
      );
    });

    test('4: formatDateTime output matches expected pattern M/D/YYYY, H:MM AM/PM', () => {
      const result = formatDateTime('2026-09-15T17:42:00.000Z');
      assert.ok(
        /^\d{1,2}\/\d{1,2}\/\d{4},?\s+\d{1,2}:\d{2}\s+(AM|PM)$/i.test(result),
        `Expected "M/D/YYYY, H:MM AM/PM" pattern in "${result}"`
      );
    });

    test('5: formatDateTime output is longer than date-only output', () => {
      const dateOnly = new Date('2026-09-15T17:42:00.000Z').toLocaleDateString();
      const dateTime = formatDateTime('2026-09-15T17:42:00.000Z');
      assert.ok(dateTime.length > dateOnly.length, `DateTime "${dateTime}" should be longer than date-only "${dateOnly}"`);
    });

    // ── 3. Invalid/missing timestamp has safe fallback ──────────────────────
    test('6: formatDateTime returns "-" for null', () => {
      assert.strictEqual(formatDateTime(null), '-');
    });

    test('7: formatDateTime returns "-" for undefined', () => {
      assert.strictEqual(formatDateTime(undefined), '-');
    });

    test('8: formatDateTime returns "-" for empty string', () => {
      assert.strictEqual(formatDateTime(''), '-');
    });

    test('9: formatDateTime returns "-" for non-string input', () => {
      assert.strictEqual(formatDateTime(12345), '-');
      assert.strictEqual(formatDateTime({}), '-');
      assert.strictEqual(formatDateTime([]), '-');
    });

    test('10: formatDateTime returns "-" for invalid date string', () => {
      assert.strictEqual(formatDateTime('not-a-date'), '-');
    });

    test('11: formatDateTime returns "-" for prototype pollution attempts', () => {
      assert.strictEqual(formatDateTime('__proto__'), '-');
      assert.strictEqual(formatDateTime('constructor'), '-');
    });

    // ── 4. Sorting still uses the authoritative timestamp ──────────────────
    test('12: Records are sorted by createdAt in newest-first order', () => {
      clearExportHistory(dir);
      const r1 = createExportHistoryRecord({
        exportType: 'cut',
        source: { name: 'first.mp4', path: '/videos/first.mp4' },
        output: { path: '/out/first_cut.mp4', filename: 'first_cut.mp4', directory: '/out' },
        status: 'COMPLETED',
      }, dir);
      const r2 = createExportHistoryRecord({
        exportType: 'cut',
        source: { name: 'second.mp4', path: '/videos/second.mp4' },
        output: { path: '/out/second_cut.mp4', filename: 'second_cut.mp4', directory: '/out' },
        status: 'COMPLETED',
      }, dir);
      const r3 = createExportHistoryRecord({
        exportType: 'cut',
        source: { name: 'third.mp4', path: '/videos/third.mp4' },
        output: { path: '/out/third_cut.mp4', filename: 'third_cut.mp4', directory: '/out' },
        status: 'COMPLETED',
      }, dir);
      const { records } = getExportHistory({}, dir);
      assert.strictEqual(records[0].id, r3.id, 'Newest record should be first');
      assert.strictEqual(records[1].id, r2.id, 'Middle record should be second');
      assert.strictEqual(records[2].id, r1.id, 'Oldest record should be last');
    });

    test('13: Sorting uses ISO timestamps, not formatted strings', () => {
      clearExportHistory(dir);
      createExportHistoryRecord({
        exportType: 'cut',
        source: { name: 'summer.mp4', path: '/videos/summer.mp4' },
        output: { path: '/out/summer_cut.mp4', filename: 'summer_cut.mp4', directory: '/out' },
        status: 'COMPLETED',
      }, dir);
      createExportHistoryRecord({
        exportType: 'cut',
        source: { name: 'winter.mp4', path: '/videos/winter.mp4' },
        output: { path: '/out/winter_cut.mp4', filename: 'winter_cut.mp4', directory: '/out' },
        status: 'COMPLETED',
      }, dir);
      const { records } = getExportHistory({}, dir);
      const ts1 = new Date(records[0].createdAt).getTime();
      const ts2 = new Date(records[1].createdAt).getTime();
      assert.ok(ts1 >= ts2, `First record (${records[0].createdAt}) should be newer than second (${records[1].createdAt})`);
    });

    // ── 5. Formatter is pure — does not mutate input ───────────────────────
    test('14: formatDateTime does not mutate the input string', () => {
      const input = '2026-09-15T17:42:00.000Z';
      const original = input.slice(0);
      formatDateTime(input);
      assert.strictEqual(input, original, 'Input string must not be mutated');
    });

    // ── 6. Format is consistent across calls ───────────────────────────────
    test('15: Same timestamp produces same formatted output', () => {
      const ts = '2026-09-15T17:42:00.000Z';
      const r1 = formatDateTime(ts);
      const r2 = formatDateTime(ts);
      assert.strictEqual(r1, r2, 'Formatting must be deterministic');
    });

  } finally {
    cleanup(dir);
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════════════════════════');

  if (failed > 0) {
    console.log('\nFailures:');
    for (const f of failures) {
      console.log(`  ❌ ${f.name}`);
      console.log(`     ${f.error}`);
    }
    process.exit(1);
  }
}

run();
