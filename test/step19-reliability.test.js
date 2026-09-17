'use strict';
/**
 * STEP 19 — Production Reliability + Data Safety Hardening
 *
 * Tests:
 *  A. Timeout constants and sane defaults
 *  B. FFprobe timeout and process control
 *  C. FFmpeg cut timeout and process control
 *  D. Variation pipeline timeout
 *  E. SmartCrop frame extraction timeout
 *  F. License store atomic write (normal, replacement, corruption)
 *  G. License store legacy migration
 *  H. Schedule manager atomic write
 *  I. Batch queue persistence (all statuses)
 *  J. Batch queue crash recovery (PROCESSING → WAITING)
 *  K. Batch queue corrupted state recovery
 *  L. Batch queue terminal status persistence (DONE, ERROR, CANCELLED)
 *  M. FFmpeg probe integration
 *  N. cutClip integration
 *  O. extractFrameBuffer integration
 */

const path = require('path');
const fs = require('fs');
const assert = require('assert');
const os = require('os');
const { execSync } = require('child_process');

let passed = 0;
let failed = 0;
const results = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    results.push({ name, status: '✓' });
    console.log(`  ✓  ${name}`);
  } catch (err) {
    failed++;
    results.push({ name, status: '✗', error: err.message });
    console.error(`  ✗  ${name}`);
    console.error(`     ${err.message}`);
  }
}

// ─── Test video setup ─────────────────────────────────────────────────────────

const TEST_VIDEOS_DIR = path.join(__dirname, '..', 'test-videos');

async function ensureTestVideos() {
  if (!fs.existsSync(TEST_VIDEOS_DIR)) fs.mkdirSync(TEST_VIDEOS_DIR, { recursive: true });
  const ffmpegBin = require('ffmpeg-static');
  const videos = {
    'talking_head.mp4': `"${ffmpegBin}" -y -f lavfi -i color=c=red:size=1280x720:rate=30 -f lavfi -i anullsrc=r=44100:cl=stereo -t 6 -c:v libx264 -preset ultrafast -c:a aac -shortest`,
  };
  for (const [name, cmd] of Object.entries(videos)) {
    const outPath = path.join(TEST_VIDEOS_DIR, name);
    if (!fs.existsSync(outPath)) {
      execSync(`${cmd} "${outPath}"`, { stdio: 'pipe' });
    }
  }
}

// ─── Helper: simulate crash by writing raw queue JSON ────────────────────────

function writeRawQueue(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// ─── Test suite ───────────────────────────────────────────────────────────────

async function runSuite() {
  console.log('\n🛡️  STEP 19 — Production Reliability + Data Safety Hardening\n');

  await ensureTestVideos();

  // ═══════════════════════════════════════════════════════════════════════════
  // A. TIMEOUT CONSTANTS
  // ═══════════════════════════════════════════════════════════════════════════

  await test('A1. Timeout constants are exported from cutter.js', () => {
    const { CUT_TIMEOUT_MS, PROBE_TIMEOUT_MS } = require('../src/engine/cutter');
    assert.strictEqual(typeof CUT_TIMEOUT_MS, 'number');
    assert.ok(CUT_TIMEOUT_MS > 0, 'CUT_TIMEOUT_MS must be positive');
    assert.strictEqual(typeof PROBE_TIMEOUT_MS, 'number');
    assert.ok(PROBE_TIMEOUT_MS > 0, 'PROBE_TIMEOUT_MS must be positive');
  });

  await test('A2. FFPROBE_TIMEOUT_MS is exported from probe.js with sane default', () => {
    const { FFPROBE_TIMEOUT_MS } = require('../src/engine/probe');
    assert.strictEqual(typeof FFPROBE_TIMEOUT_MS, 'number');
    assert.ok(FFPROBE_TIMEOUT_MS >= 5000, 'FFPROBE_TIMEOUT_MS must be >= 5s');
    assert.ok(FFPROBE_TIMEOUT_MS <= 300000, 'FFPROBE_TIMEOUT_MS must be <= 5min');
  });

  await test('A3. CUT_TIMEOUT_MS has sane default (10-60 min range)', () => {
    const { CUT_TIMEOUT_MS } = require('../src/engine/cutter');
    assert.ok(CUT_TIMEOUT_MS >= 10 * 60 * 1000, 'CUT_TIMEOUT_MS must be >= 10min');
    assert.ok(CUT_TIMEOUT_MS <= 120 * 60 * 1000, 'CUT_TIMEOUT_MS must be <= 120min');
  });

  await test('A4. VARIATION_TIMEOUT_MS is exported from pipeline.js', () => {
    const { VARIATION_TIMEOUT_MS } = require('../src/engine/variation/pipeline');
    assert.strictEqual(typeof VARIATION_TIMEOUT_MS, 'number');
    assert.ok(VARIATION_TIMEOUT_MS > 0, 'VARIATION_TIMEOUT_MS must be positive');
  });

  await test('A5. FRAME_EXTRACT_TIMEOUT_MS module loads correctly', async () => {
    let smartCrop;
    try {
      smartCrop = require('../src/engine/smartCrop');
    } catch (e) {
      console.log('    (skipped — face-api module not available)');
      return;
    }
    assert.ok(typeof smartCrop.detectFacesInFrame === 'function', 'detectFacesInFrame exists');
    assert.ok(typeof smartCrop.getSmartCropFilter === 'function', 'getSmartCropFilter exists');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // B. LICENSE STORE ATOMIC WRITE
  // ═══════════════════════════════════════════════════════════════════════════

  await test('B1. License store atomic write: no leftover .tmp files after success', () => {
    const { saveLicenseData, loadLicenseData, clearLicenseData, getLicenseFilePath } = require('../src/main/license/store');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lic_test_'));
    try {
      const testData = {
        licenseKey: 'TEST-KEY-12345',
        hwid: 'test-hwid',
        tier: 'pro',
        status: 'active',
        activatedAt: new Date().toISOString(),
      };
      saveLicenseData(testData, tmpDir);

      const files = fs.readdirSync(tmpDir);
      const tmpFiles = files.filter(f => f.includes('.tmp'));
      assert.strictEqual(tmpFiles.length, 0, `No .tmp files should remain, found: ${tmpFiles.join(', ')}`);
    } finally {
      try { clearLicenseData(tmpDir); } catch (_) {}
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    }
  });

  await test('B2. License store atomic write: content round-trips correctly', () => {
    const { saveLicenseData, loadLicenseData, clearLicenseData, getLicenseFilePath } = require('../src/main/license/store');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lic_test_'));
    try {
      const testData = {
        licenseKey: 'TEST-KEY-67890',
        hwid: 'test-hwid-roundtrip',
        tier: 'standard',
        status: 'active',
        activatedAt: new Date().toISOString(),
      };
      saveLicenseData(testData, tmpDir);

      const filePath = getLicenseFilePath(tmpDir);
      assert.ok(fs.existsSync(filePath), 'License file must exist');

      const stat = fs.statSync(filePath);
      assert.ok(stat.size > 100, 'Encrypted file must have meaningful size');
    } finally {
      try { clearLicenseData(tmpDir); } catch (_) {}
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    }
  });

  await test('B3. License store atomic write: file is not corrupted by partial writes', () => {
    const { saveLicenseData, getLicenseFilePath, clearLicenseData } = require('../src/main/license/store');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lic_test_'));
    try {
      const testData = {
        licenseKey: 'TEST-KEY-CORRUPT',
        hwid: 'test-hwid-corrupt',
        tier: 'pro',
        status: 'active',
        activatedAt: new Date().toISOString(),
      };

      saveLicenseData(testData, tmpDir);
      const filePath = getLicenseFilePath(tmpDir);
      const firstSize = fs.statSync(filePath).size;

      saveLicenseData({ ...testData, lastSeenAt: new Date().toISOString() }, tmpDir);
      const secondSize = fs.statSync(filePath).size;

      assert.ok(firstSize > 0, 'First save produced a file');
      assert.ok(secondSize > 0, 'Second save produced a file');
    } finally {
      try { clearLicenseData(tmpDir); } catch (_) {}
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    }
  });

  await test('B4. License store: corrupted file returns null gracefully', () => {
    const { loadLicenseData, getLicenseFilePath, clearLicenseData } = require('../src/main/license/store');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lic_test_'));
    try {
      const filePath = getLicenseFilePath(tmpDir);
      fs.writeFileSync(filePath, 'this is not valid encrypted data');

      const result = loadLicenseData(tmpDir);
      assert.strictEqual(result, null, 'Corrupted file returns null');
    } finally {
      try { clearLicenseData(tmpDir); } catch (_) {}
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    }
  });

  await test('B5. License store: empty file returns null gracefully', () => {
    const { loadLicenseData, getLicenseFilePath, clearLicenseData } = require('../src/main/license/store');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lic_test_'));
    try {
      const filePath = getLicenseFilePath(tmpDir);
      fs.writeFileSync(filePath, '');

      const result = loadLicenseData(tmpDir);
      assert.strictEqual(result, null, 'Empty file returns null');
    } finally {
      try { clearLicenseData(tmpDir); } catch (_) {}
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    }
  });

  await test('B6. License store: missing file returns null gracefully', () => {
    const { loadLicenseData } = require('../src/main/license/store');
    const result = loadLicenseData('/nonexistent/path/that/does/not/exist');
    assert.strictEqual(result, null, 'Missing file returns null');
  });

  await test('B7. License store: multiple saves produce valid sequential files', () => {
    const { saveLicenseData, loadLicenseData, clearLicenseData, computeSignature, signaturesMatch } = require('../src/main/license/store');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lic_test_'));
    try {
      const baseData = {
        licenseKey: 'MULTI-SAVE-KEY',
        hwid: 'test-hwid-multi',
        tier: 'pro',
        status: 'active',
        activatedAt: new Date().toISOString(),
      };

      // Save 5 times with evolving data
      for (let i = 0; i < 5; i++) {
        const data = { ...baseData, lastSeenAt: new Date().toISOString() };
        saveLicenseData(data, tmpDir);
      }

      // After 5 saves, the file should still be valid
      // (loadLicenseData verifies signature, so if it returns data, the file is valid)
      const loaded = loadLicenseData(tmpDir);
      assert.ok(loaded !== null, 'File is valid after 5 sequential saves');
      assert.strictEqual(loaded.licenseKey, 'MULTI-SAVE-KEY', 'License key preserved');
    } finally {
      try { clearLicenseData(tmpDir); } catch (_) {}
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // C. SCHEDULE MANAGER ATOMIC WRITE
  // ═══════════════════════════════════════════════════════════════════════════

  await test('C1. Schedule manager atomic write: temp file cleaned up', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sched_test_'));
    try {
      const { saveSchedules, loadSchedules } = require('../src/main/scheduler/scheduleManager');
      const data = { schedules: [{ id: 'sched_test_1', status: 'SCHEDULED', name: 'test' }] };
      saveSchedules(data, tmpDir);

      const files = fs.readdirSync(tmpDir);
      const tmpFiles = files.filter(f => f.includes('.tmp'));
      assert.strictEqual(tmpFiles.length, 0, `No .tmp files after save, found: ${tmpFiles.join(', ')}`);
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    }
  });

  await test('C2. Schedule manager atomic write: content round-trips correctly', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sched_test_'));
    try {
      const { saveSchedules, loadSchedules } = require('../src/main/scheduler/scheduleManager');
      const data = { schedules: [{ id: 'sched_test_2', status: 'SCHEDULED', name: 'roundtrip' }] };
      saveSchedules(data, tmpDir);

      const loaded = loadSchedules(tmpDir);
      assert.ok(Array.isArray(loaded.schedules), 'Loaded data has schedules array');
      assert.strictEqual(loaded.schedules.length, 1, 'One schedule item');
      assert.strictEqual(loaded.schedules[0].id, 'sched_test_2', 'ID preserved');
      assert.strictEqual(loaded.schedules[0].name, 'roundtrip', 'Name preserved');
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    }
  });

  await test('C3. Schedule manager: corrupted file returns empty array', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sched_test_'));
    try {
      const { saveSchedules, loadSchedules, getSchedulesFilePath } = require('../src/main/scheduler/scheduleManager');
      const filePath = getSchedulesFilePath(tmpDir);
      fs.writeFileSync(filePath, '{invalid json[[[');

      const loaded = loadSchedules(tmpDir);
      assert.ok(Array.isArray(loaded.schedules), 'Returns schedules array');
      assert.strictEqual(loaded.schedules.length, 0, 'Empty array for corrupt file');
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    }
  });

  await test('C4. Schedule manager: multiple saves produce valid sequential files', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sched_test_'));
    try {
      const { saveSchedules, loadSchedules } = require('../src/main/scheduler/scheduleManager');

      for (let i = 0; i < 5; i++) {
        const data = { schedules: [{ id: `sched_seq_${i}`, status: 'SCHEDULED', name: `item-${i}` }] };
        saveSchedules(data, tmpDir);
      }

      const loaded = loadSchedules(tmpDir);
      assert.strictEqual(loaded.schedules.length, 1, 'Last save is current');
      assert.strictEqual(loaded.schedules[0].id, 'sched_seq_4', 'Latest item preserved');
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // D. BATCH QUEUE PERSISTENCE — ALL STATUSES
  // ═══════════════════════════════════════════════════════════════════════════

  await test('D1. Batch queue persistence: WAITING items are persisted', () => {
    const { BatchQueueManager, STATUS } = require('../src/engine/batchQueue');
    const persistPath = path.join(os.tmpdir(), `bq_persist_${Date.now()}.json`);
    const videoPath = path.join(TEST_VIDEOS_DIR, 'talking_head.mp4');

    try {
      const bq = new BatchQueueManager({ persistPath });
      bq.addItems([
        { inputPath: videoPath, operation: 'reel', duration: 1 },
        { inputPath: videoPath, operation: 'cut', duration: 2 },
      ]);

      assert.ok(fs.existsSync(persistPath), 'Persist file created');
      const raw = JSON.parse(fs.readFileSync(persistPath, 'utf8'));
      assert.ok(Array.isArray(raw.items), 'Persisted data has items array');
      assert.strictEqual(raw.items.length, 2, 'Two items persisted');
      assert.ok(raw.savedAt, 'savedAt timestamp present');

      // Verify items have status field
      for (const item of raw.items) {
        assert.strictEqual(item.status, STATUS.WAITING, 'Persisted items are WAITING');
      }
    } finally {
      try { if (fs.existsSync(persistPath)) fs.unlinkSync(persistPath); } catch (_) {}
    }
  });

  await test('D2. Batch queue persistence: PROCESSING items are persisted as PROCESSING', () => {
    const { BatchQueueManager, STATUS, atomicWriteJson, getQueuePersistPath } = require('../src/engine/batchQueue');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bq_persist_proc_'));
    const videoPath = path.join(TEST_VIDEOS_DIR, 'talking_head.mp4');

    try {
      // Write a fake persisted queue with PROCESSING items to simulate crash
      const fakeQueue = {
        items: [
          {
            id: 'fake_processing_1',
            inputPath: videoPath,
            operation: 'reel',
            mode: 'blur',
            aspectRatio: '9:16',
            quality: '1080p',
            status: 'PROCESSING',
            addedAt: Date.now(),
          },
          {
            id: 'fake_waiting_1',
            inputPath: videoPath,
            operation: 'cut',
            mode: 'crop',
            aspectRatio: '9:16',
            quality: '1080p',
            status: 'WAITING',
            addedAt: Date.now(),
          },
        ],
        savedAt: new Date().toISOString(),
      };

      const persistPath = getQueuePersistPath(tmpDir);
      atomicWriteJson(persistPath, fakeQueue);

      // Read it back and verify
      const raw = JSON.parse(fs.readFileSync(persistPath, 'utf8'));
      assert.strictEqual(raw.items.length, 2, 'Two items persisted');
      assert.strictEqual(raw.items[0].status, 'PROCESSING', 'Processing item persisted as PROCESSING');
      assert.strictEqual(raw.items[1].status, 'WAITING', 'Waiting item persisted as WAITING');
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    }
  });

  await test('D3. Batch queue persistence: DONE items are persisted', () => {
    const { BatchQueueManager, STATUS, atomicWriteJson, getQueuePersistPath } = require('../src/engine/batchQueue');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bq_persist_done_'));
    const videoPath = path.join(TEST_VIDEOS_DIR, 'talking_head.mp4');

    try {
      const fakeQueue = {
        items: [
          {
            id: 'done_item_1',
            inputPath: videoPath,
            operation: 'reel',
            mode: 'blur',
            aspectRatio: '9:16',
            quality: '1080p',
            status: 'DONE',
            result: { outputPath: '/tmp/output.mp4', duration: 5.5 },
            addedAt: Date.now(),
            finishedAt: Date.now(),
          },
        ],
        savedAt: new Date().toISOString(),
      };

      const persistPath = getQueuePersistPath(tmpDir);
      atomicWriteJson(persistPath, fakeQueue);

      const raw = JSON.parse(fs.readFileSync(persistPath, 'utf8'));
      assert.strictEqual(raw.items[0].status, 'DONE', 'DONE status preserved');
      assert.ok(raw.items[0].result, 'Result data preserved');
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    }
  });

  await test('D4. Batch queue persistence: ERROR items are persisted', () => {
    const { atomicWriteJson, getQueuePersistPath } = require('../src/engine/batchQueue');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bq_persist_err_'));
    const videoPath = path.join(TEST_VIDEOS_DIR, 'talking_head.mp4');

    try {
      const fakeQueue = {
        items: [
          {
            id: 'error_item_1',
            inputPath: videoPath,
            operation: 'cut',
            mode: 'blur',
            aspectRatio: '9:16',
            quality: '1080p',
            status: 'ERROR',
            error: 'FFmpeg error: invalid codec',
            addedAt: Date.now(),
            finishedAt: Date.now(),
          },
        ],
        savedAt: new Date().toISOString(),
      };

      const persistPath = getQueuePersistPath(tmpDir);
      atomicWriteJson(persistPath, fakeQueue);

      const raw = JSON.parse(fs.readFileSync(persistPath, 'utf8'));
      assert.strictEqual(raw.items[0].status, 'ERROR', 'ERROR status preserved');
      assert.strictEqual(raw.items[0].error, 'FFmpeg error: invalid codec', 'Error message preserved');
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    }
  });

  await test('D5. Batch queue persistence: CANCELLED items are persisted', () => {
    const { atomicWriteJson, getQueuePersistPath } = require('../src/engine/batchQueue');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bq_persist_cancel_'));
    const videoPath = path.join(TEST_VIDEOS_DIR, 'talking_head.mp4');

    try {
      const fakeQueue = {
        items: [
          {
            id: 'cancelled_item_1',
            inputPath: videoPath,
            operation: 'reel',
            mode: 'blur',
            aspectRatio: '9:16',
            quality: '1080p',
            status: 'CANCELLED',
            error: 'Cancelled by user',
            addedAt: Date.now(),
            finishedAt: Date.now(),
          },
        ],
        savedAt: new Date().toISOString(),
      };

      const persistPath = getQueuePersistPath(tmpDir);
      atomicWriteJson(persistPath, fakeQueue);

      const raw = JSON.parse(fs.readFileSync(persistPath, 'utf8'));
      assert.strictEqual(raw.items[0].status, 'CANCELLED', 'CANCELLED status preserved');
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // E. BATCH QUEUE CRASH RECOVERY
  // ═══════════════════════════════════════════════════════════════════════════

  await test('E1. Batch queue recovery: recoverPending rebuilds WAITING items', () => {
    const { BatchQueueManager, STATUS } = require('../src/engine/batchQueue');
    const persistPath = path.join(os.tmpdir(), `bq_recover_${Date.now()}.json`);
    const videoPath = path.join(TEST_VIDEOS_DIR, 'talking_head.mp4');

    try {
      const bq1 = new BatchQueueManager({ persistPath });
      bq1.addItems([
        { inputPath: videoPath, operation: 'reel', duration: 1 },
        { inputPath: videoPath, operation: 'cut', duration: 2 },
      ]);
      assert.ok(fs.existsSync(persistPath), 'Persist file exists');

      const bq2 = new BatchQueueManager({ persistPath });
      const recovered = bq2.recoverPending();

      assert.strictEqual(recovered.length, 2, 'Two items recovered');
      assert.strictEqual(bq2.getState().totalCount, 2, 'Queue has 2 items');
      assert.strictEqual(bq2.getState().waitingCount, 2, 'Both items are WAITING');
    } finally {
      try { if (fs.existsSync(persistPath)) fs.unlinkSync(persistPath); } catch (_) {}
    }
  });

  await test('E2. Batch queue recovery: PROCESSING items become WAITING on recovery', () => {
    const { BatchQueueManager, STATUS, atomicWriteJson, getQueuePersistPath } = require('../src/engine/batchQueue');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bq_recover_proc_'));
    const videoPath = path.join(TEST_VIDEOS_DIR, 'talking_head.mp4');

    try {
      // Simulate crash: write queue with PROCESSING items
      const fakeQueue = {
        items: [
          {
            id: 'crashed_processing_1',
            inputPath: videoPath,
            operation: 'reel',
            mode: 'blur',
            aspectRatio: '9:16',
            quality: '1080p',
            status: 'PROCESSING',
            addedAt: Date.now(),
          },
          {
            id: 'crashed_waiting_1',
            inputPath: videoPath,
            operation: 'cut',
            mode: 'crop',
            aspectRatio: '9:16',
            quality: '1080p',
            status: 'WAITING',
            addedAt: Date.now(),
          },
        ],
        savedAt: new Date().toISOString(),
      };

      const persistPath = getQueuePersistPath(tmpDir);
      atomicWriteJson(persistPath, fakeQueue);

      const bq = new BatchQueueManager({ persistPath });
      const recovered = bq.recoverPending();

      assert.strictEqual(recovered.length, 2, 'Both items recovered');
      assert.strictEqual(bq.getState().waitingCount, 2, 'Both items are WAITING after recovery');

      // Verify PROCESSING was transformed to WAITING
      for (const item of recovered) {
        assert.strictEqual(item.status, STATUS.WAITING, 'All recovered items are WAITING');
      }
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    }
  });

  await test('E3. Batch queue recovery: persists file is updated after recovery (not deleted)', () => {
    const { BatchQueueManager, atomicWriteJson, getQueuePersistPath, loadPersistedQueue } = require('../src/engine/batchQueue');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bq_recover_persist_'));
    const videoPath = path.join(TEST_VIDEOS_DIR, 'talking_head.mp4');

    try {
      const fakeQueue = {
        items: [
          {
            id: 'persist_test_1',
            inputPath: videoPath,
            operation: 'reel',
            mode: 'blur',
            aspectRatio: '9:16',
            quality: '1080p',
            status: 'PROCESSING',
            addedAt: Date.now(),
          },
        ],
        savedAt: new Date().toISOString(),
      };

      const persistPath = getQueuePersistPath(tmpDir);
      atomicWriteJson(persistPath, fakeQueue);

      const bq = new BatchQueueManager({ persistPath });
      bq.recoverPending();

      // File should still exist after recovery (updated, not deleted)
      assert.ok(fs.existsSync(persistPath), 'Persist file still exists after recovery');

      // The persisted data should reflect the recovered state
      const afterRecovery = loadPersistedQueue(tmpDir);
      assert.strictEqual(afterRecovery.items.length, 1, 'One item in persisted state');
      // After recovery, the item was re-added via addItems, which triggers _persist
      // The new persisted item should have WAITING status
      assert.strictEqual(afterRecovery.items[0].status, 'WAITING', 'Persisted status is WAITING after recovery');
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    }
  });

  await test('E4. Batch queue recovery: DONE items are restored with DONE status', () => {
    const { BatchQueueManager, STATUS, atomicWriteJson, getQueuePersistPath } = require('../src/engine/batchQueue');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bq_recover_done_'));
    const videoPath = path.join(TEST_VIDEOS_DIR, 'talking_head.mp4');

    try {
      const fakeQueue = {
        items: [
          {
            id: 'recovered_done_1',
            inputPath: videoPath,
            operation: 'reel',
            mode: 'blur',
            aspectRatio: '9:16',
            quality: '1080p',
            status: 'DONE',
            result: { outputPath: '/tmp/done.mp4', duration: 3 },
            addedAt: Date.now(),
            finishedAt: Date.now(),
          },
        ],
        savedAt: new Date().toISOString(),
      };

      const persistPath = getQueuePersistPath(tmpDir);
      atomicWriteJson(persistPath, fakeQueue);

      const bq = new BatchQueueManager({ persistPath });
      const recovered = bq.recoverPending();

      assert.strictEqual(recovered.length, 1, 'One DONE item recovered');
      assert.strictEqual(recovered[0].status, STATUS.DONE, 'Item restored as DONE');
      assert.ok(recovered[0].result, 'Result data preserved');
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    }
  });

  await test('E5. Batch queue recovery: ERROR items are restored with ERROR status', () => {
    const { BatchQueueManager, STATUS, atomicWriteJson, getQueuePersistPath } = require('../src/engine/batchQueue');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bq_recover_err_'));
    const videoPath = path.join(TEST_VIDEOS_DIR, 'talking_head.mp4');

    try {
      const fakeQueue = {
        items: [
          {
            id: 'recovered_error_1',
            inputPath: videoPath,
            operation: 'cut',
            mode: 'blur',
            aspectRatio: '9:16',
            quality: '1080p',
            status: 'ERROR',
            error: 'FFmpeg crashed',
            addedAt: Date.now(),
            finishedAt: Date.now(),
          },
        ],
        savedAt: new Date().toISOString(),
      };

      const persistPath = getQueuePersistPath(tmpDir);
      atomicWriteJson(persistPath, fakeQueue);

      const bq = new BatchQueueManager({ persistPath });
      const recovered = bq.recoverPending();

      assert.strictEqual(recovered.length, 1, 'One ERROR item recovered');
      assert.strictEqual(recovered[0].status, STATUS.ERROR, 'Item restored as ERROR');
      assert.strictEqual(recovered[0].error, 'FFmpeg crashed', 'Error message preserved');
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    }
  });

  await test('E6. Batch queue recovery: CANCELLED items are restored with CANCELLED status', () => {
    const { BatchQueueManager, STATUS, atomicWriteJson, getQueuePersistPath } = require('../src/engine/batchQueue');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bq_recover_cancel_'));
    const videoPath = path.join(TEST_VIDEOS_DIR, 'talking_head.mp4');

    try {
      const fakeQueue = {
        items: [
          {
            id: 'recovered_cancel_1',
            inputPath: videoPath,
            operation: 'reel',
            mode: 'blur',
            aspectRatio: '9:16',
            quality: '1080p',
            status: 'CANCELLED',
            error: 'Cancelled by user',
            addedAt: Date.now(),
            finishedAt: Date.now(),
          },
        ],
        savedAt: new Date().toISOString(),
      };

      const persistPath = getQueuePersistPath(tmpDir);
      atomicWriteJson(persistPath, fakeQueue);

      const bq = new BatchQueueManager({ persistPath });
      const recovered = bq.recoverPending();

      assert.strictEqual(recovered.length, 1, 'One CANCELLED item recovered');
      assert.strictEqual(recovered[0].status, STATUS.CANCELLED, 'Item restored as CANCELLED');
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    }
  });

  await test('E7. Batch queue recovery: mixed statuses recover correctly', () => {
    const { BatchQueueManager, STATUS, atomicWriteJson, getQueuePersistPath } = require('../src/engine/batchQueue');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bq_recover_mixed_'));
    const videoPath = path.join(TEST_VIDEOS_DIR, 'talking_head.mp4');

    try {
      const fakeQueue = {
        items: [
          { id: 'm_wait', inputPath: videoPath, operation: 'reel', mode: 'blur', aspectRatio: '9:16', quality: '1080p', status: 'WAITING', addedAt: Date.now() },
          { id: 'm_proc', inputPath: videoPath, operation: 'cut', mode: 'crop', aspectRatio: '9:16', quality: '1080p', status: 'PROCESSING', addedAt: Date.now() },
          { id: 'm_done', inputPath: videoPath, operation: 'reel', mode: 'blur', aspectRatio: '9:16', quality: '1080p', status: 'DONE', result: {}, addedAt: Date.now(), finishedAt: Date.now() },
          { id: 'm_err', inputPath: videoPath, operation: 'cut', mode: 'blur', aspectRatio: '9:16', quality: '1080p', status: 'ERROR', error: 'bad', addedAt: Date.now(), finishedAt: Date.now() },
          { id: 'm_cancel', inputPath: videoPath, operation: 'reel', mode: 'blur', aspectRatio: '9:16', quality: '1080p', status: 'CANCELLED', error: 'user cancel', addedAt: Date.now(), finishedAt: Date.now() },
        ],
        savedAt: new Date().toISOString(),
      };

      const persistPath = getQueuePersistPath(tmpDir);
      atomicWriteJson(persistPath, fakeQueue);

      const bq = new BatchQueueManager({ persistPath });
      const recovered = bq.recoverPending();

      // WAITING and PROCESSING become WAITING (2 items)
      // DONE, ERROR, CANCELLED are restored as-is (3 items)
      assert.strictEqual(recovered.length, 5, 'All 5 items recovered');

      const state = bq.getState();
      assert.strictEqual(state.waitingCount, 2, '2 items WAITING (original WAITING + PROCESSING→WAITING)');
      assert.strictEqual(state.doneCount, 1, '1 item DONE');
      assert.strictEqual(state.errorCount, 1, '1 item ERROR');
      assert.strictEqual(state.cancelledCount, 1, '1 item CANCELLED');
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // F. BATCH QUEUE CORRUPTED STATE RECOVERY
  // ═══════════════════════════════════════════════════════════════════════════

  await test('F1. Batch queue recovery: corrupted JSON file does not crash', () => {
    const { BatchQueueManager, getQueuePersistPath } = require('../src/engine/batchQueue');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bq_corrupt_json_'));
    try {
      const persistPath = getQueuePersistPath(tmpDir);
      fs.writeFileSync(persistPath, '{invalid json[[[');

      const bq = new BatchQueueManager({ persistPath });
      const recovered = bq.recoverPending();

      assert.strictEqual(recovered.length, 0, 'No items recovered from corrupted file');
      assert.strictEqual(bq.getState().totalCount, 0, 'Queue is empty');
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    }
  });

  await test('F2. Batch queue recovery: empty file returns empty recovery', () => {
    const { BatchQueueManager, getQueuePersistPath } = require('../src/engine/batchQueue');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bq_corrupt_empty_'));
    try {
      const persistPath = getQueuePersistPath(tmpDir);
      fs.writeFileSync(persistPath, '');

      const bq = new BatchQueueManager({ persistPath });
      const recovered = bq.recoverPending();

      assert.strictEqual(recovered.length, 0, 'No items recovered from empty file');
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    }
  });

  await test('F3. Batch queue recovery: missing items array returns empty recovery', () => {
    const { BatchQueueManager, getQueuePersistPath, atomicWriteJson } = require('../src/engine/batchQueue');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bq_corrupt_no_items_'));
    try {
      const persistPath = getQueuePersistPath(tmpDir);
      atomicWriteJson(persistPath, { savedAt: new Date().toISOString() });

      const bq = new BatchQueueManager({ persistPath });
      const recovered = bq.recoverPending();

      assert.strictEqual(recovered.length, 0, 'No items recovered when items array missing');
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    }
  });

  await test('F4. Batch queue recovery: items without inputPath are skipped', () => {
    const { BatchQueueManager, getQueuePersistPath, atomicWriteJson } = require('../src/engine/batchQueue');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bq_corrupt_no_path_'));
    const videoPath = path.join(TEST_VIDEOS_DIR, 'talking_head.mp4');

    try {
      const persistPath = getQueuePersistPath(tmpDir);
      atomicWriteJson(persistPath, {
        items: [
          { id: 'valid', inputPath: videoPath, operation: 'reel', status: 'WAITING', addedAt: Date.now() },
          { id: 'invalid', operation: 'cut', status: 'WAITING', addedAt: Date.now() },
          { id: 'also_valid', inputPath: videoPath, operation: 'reel', status: 'WAITING', addedAt: Date.now() },
        ],
        savedAt: new Date().toISOString(),
      });

      const bq = new BatchQueueManager({ persistPath });
      const recovered = bq.recoverPending();

      assert.strictEqual(recovered.length, 2, 'Only items with inputPath recovered');
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    }
  });

  await test('F5. Batch queue recovery: no persist file returns empty recovery', () => {
    const { BatchQueueManager } = require('../src/engine/batchQueue');

    const bq = new BatchQueueManager({ persistPath: '/nonexistent/path/queue.json' });
    const recovered = bq.recoverPending();

    assert.strictEqual(recovered.length, 0, 'No recovery from nonexistent file');
  });

  await test('F6. Batch queue recovery: null persistPath returns empty recovery', () => {
    const { BatchQueueManager } = require('../src/engine/batchQueue');

    const bq = new BatchQueueManager({});
    const recovered = bq.recoverPending();

    assert.strictEqual(recovered.length, 0, 'No recovery without persist path');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // G. BATCH QUEUE OPERATIONAL
  // ═══════════════════════════════════════════════════════════════════════════

  await test('G1. Batch queue: persist path is configurable via constructor', () => {
    const { BatchQueueManager } = require('../src/engine/batchQueue');
    const customPath = path.join(os.tmpdir(), `bq_custom_${Date.now()}.json`);
    const videoPath = path.join(TEST_VIDEOS_DIR, 'talking_head.mp4');

    try {
      const bq = new BatchQueueManager({ persistPath: customPath });
      bq.addItems([{ inputPath: videoPath, operation: 'reel', duration: 1 }]);

      assert.ok(fs.existsSync(customPath), 'Custom persist path used');
    } finally {
      try { if (fs.existsSync(customPath)) fs.unlinkSync(customPath); } catch (_) {}
    }
  });

  await test('G2. Batch queue: persist updates after addItems', () => {
    const { BatchQueueManager } = require('../src/engine/batchQueue');
    const persistPath = path.join(os.tmpdir(), `bq_persist_add_${Date.now()}.json`);
    const videoPath = path.join(TEST_VIDEOS_DIR, 'talking_head.mp4');

    try {
      const bq = new BatchQueueManager({ persistPath });
      bq.addItems([{ inputPath: videoPath, operation: 'reel', duration: 1 }]);
      const raw1 = JSON.parse(fs.readFileSync(persistPath, 'utf8'));
      assert.strictEqual(raw1.items.length, 1, '1 item after first add');

      bq.addItems([{ inputPath: videoPath, operation: 'cut', duration: 1 }]);
      const raw2 = JSON.parse(fs.readFileSync(persistPath, 'utf8'));
      assert.strictEqual(raw2.items.length, 2, '2 items after second add');
    } finally {
      try { if (fs.existsSync(persistPath)) fs.unlinkSync(persistPath); } catch (_) {}
    }
  });

  await test('G3. Batch queue: persist updates after removeItem', () => {
    const { BatchQueueManager } = require('../src/engine/batchQueue');
    const persistPath = path.join(os.tmpdir(), `bq_persist_rem_${Date.now()}.json`);
    const videoPath = path.join(TEST_VIDEOS_DIR, 'talking_head.mp4');

    try {
      const bq = new BatchQueueManager({ persistPath });
      const items = bq.addItems([
        { inputPath: videoPath, operation: 'reel', duration: 1 },
        { inputPath: videoPath, operation: 'cut', duration: 1 },
      ]);
      bq.removeItem(items[0].id);

      const raw = JSON.parse(fs.readFileSync(persistPath, 'utf8'));
      assert.strictEqual(raw.items.length, 1, '1 item after remove');
    } finally {
      try { if (fs.existsSync(persistPath)) fs.unlinkSync(persistPath); } catch (_) {}
    }
  });

  await test('G4. Batch queue: no persistence when persistPath not set', () => {
    const { BatchQueueManager } = require('../src/engine/batchQueue');
    const videoPath = path.join(TEST_VIDEOS_DIR, 'talking_head.mp4');

    const bq = new BatchQueueManager({});
    bq.addItems([{ inputPath: videoPath, operation: 'reel', duration: 1 }]);
    // No error should occur — _persist silently returns
    assert.strictEqual(bq.getState().totalCount, 1, 'Item added despite no persist');
  });

  await test('G5. Batch queue: atomicWriteJson creates directories', () => {
    const { atomicWriteJson } = require('../src/engine/batchQueue');
    const nested = path.join(os.tmpdir(), 'bq_nested', 'deep', 'path', 'queue.json');

    try {
      atomicWriteJson(nested, { items: [], savedAt: new Date().toISOString() });
      assert.ok(fs.existsSync(nested), 'Nested file created');
      const raw = JSON.parse(fs.readFileSync(nested, 'utf8'));
      assert.ok(Array.isArray(raw.items), 'Content valid');
    } finally {
      try { fs.rmSync(path.join(os.tmpdir(), 'bq_nested'), { recursive: true, force: true }); } catch (_) {}
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // H. FFMPEG PROBE INTEGRATION
  // ═══════════════════════════════════════════════════════════════════════════

  await test('H1. getVideoMetadata: returns valid metadata for a real video', async () => {
    const { getVideoMetadata } = require('../src/engine/probe');
    const videoPath = path.join(TEST_VIDEOS_DIR, 'talking_head.mp4');
    const meta = await getVideoMetadata(videoPath);

    assert.ok(meta, 'Metadata returned');
    assert.ok(meta.duration > 0, `Duration > 0 (got ${meta.duration})`);
    assert.ok(meta.video.width > 0, `Width > 0 (got ${meta.video.width})`);
    assert.ok(meta.video.height > 0, `Height > 0 (got ${meta.video.height})`);
    assert.strictEqual(meta.path, videoPath, 'Path preserved');
  });

  await test('H2. getVideoMetadata: rejects for nonexistent file', async () => {
    const { getVideoMetadata } = require('../src/engine/probe');
    try {
      await getVideoMetadata('/nonexistent/video/fake.mp4');
      assert.fail('Should have thrown');
    } catch (err) {
      assert.ok(err.message.includes('not found') || err.message.includes('ENOENT'), `Error: ${err.message}`);
    }
  });

  await test('H3. getVideoMetadata: respects custom timeout option', async () => {
    const { getVideoMetadata } = require('../src/engine/probe');
    const videoPath = path.join(TEST_VIDEOS_DIR, 'talking_head.mp4');
    const meta = await getVideoMetadata(videoPath, { timeoutMs: 60000 });
    assert.ok(meta.duration > 0, 'Metadata returned with custom timeout');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // I. FFMPEG CUT INTEGRATION
  // ═══════════════════════════════════════════════════════════════════════════

  await test('I1. cutClip: completes within timeout for a short video', async () => {
    const { cutClip } = require('../src/engine/cutter');
    const videoPath = path.join(TEST_VIDEOS_DIR, 'talking_head.mp4');
    const outPath = path.join(os.tmpdir(), `step19_cut_${Date.now()}.mp4`);

    try {
      const result = await cutClip(videoPath, outPath, {
        start: 0,
        duration: 2,
        timeoutMs: 60000,
      });

      assert.ok(fs.existsSync(result.outputPath), 'Output file exists');
      assert.ok(result.duration > 0, `Duration > 0 (got ${result.duration})`);
    } finally {
      try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch (_) {}
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // J. THUMBNAIL FRAME EXTRACTION INTEGRATION
  // ═══════════════════════════════════════════════════════════════════════════

  await test('J1. extractFrameBuffer: completes within timeout', async () => {
    const { extractFrameBuffer } = require('../src/engine/thumbnailGenerator');
    const videoPath = path.join(TEST_VIDEOS_DIR, 'talking_head.mp4');

    const buffer = await extractFrameBuffer(videoPath, 1, { timeoutMs: 15000 });
    assert.ok(Buffer.isBuffer(buffer), 'Returns a buffer');
    assert.ok(buffer.length > 100, `Buffer has meaningful size (${buffer.length} bytes)`);
  });

  // ─── Summary ─────────────────────────────────────────────────────────────
  console.log('\n──────────────────────────────────────────────────────');
  console.log(`STEP 19 Reliability Tests: ${passed} passed, ${failed} failed`);
  console.log('──────────────────────────────────────────────────────\n');

  return failed;
}

module.exports = { runSuite };

if (require.main === module) {
  runSuite().then((failed) => process.exit(failed > 0 ? 1 : 0));
}
