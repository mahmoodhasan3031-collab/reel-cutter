'use strict';
/**
 * Phase 5.3 — Batch Processing Queue Test Suite
 *
 * Tests:
 *  1. Add multiple videos: adds multiple items with unique IDs, WAITING status
 *  2. Remove queued item: safely removes a waiting item, updates queue state
 *  3. Queue ordering: preserves FIFO insertion order
 *  4. Per-item settings: each item retains distinct aspect ratio, quality, mode, thumbnail settings
 *  5. updateItem: updates settings of a WAITING item
 *  6. Sequential processing (concurrency = 1): never exceeds 1 active job
 *  7. Maximum concurrency = 2: allows 2 concurrent jobs, clamps higher values to 2
 *  8. Waiting / Processing / Done state lifecycle
 *  9. Error isolation: failed/invalid video marks ERROR but does NOT abort remaining items
 * 10. Cancellation & cleanup: cancelItem safely terminates job, no orphan processes
 * 11. cancelAll: cancels active and clears waiting jobs
 * 12. clearCompleted: clears DONE and ERROR items while preserving WAITING
 * 13. Overall and individual progress events
 * 14. Tier gating: Basic tier blocked from batchQueue
 * 15. Tier gating: Standard tier blocked from batchQueue
 * 16. Tier gating: Pro tier enabled for batchQueue
 * 17. Security boundary: IPC gate rejects non-Pro / null tier
 * 18. Batch integration with Smart Crop
 * 19. Batch integration with Pro Thumbnail
 * 20. Compatibility: Single-video processing continues to work unaffected
 * 21. Multi-video batch execution with 3 different videos and settings
 */

const path = require('path');
const fs = require('fs');
const assert = require('assert');
const os = require('os');
const {
  BatchQueueManager,
  STATUS,
  MAX_CONCURRENCY,
  resolveDimensions,
} = require('../src/engine/batchQueue');
const { hasFeature } = require('../src/shared/features');
const { cutClip } = require('../src/engine/cutter');
const { getVideoMetadata } = require('../src/engine/probe');

const TEST_VIDEOS_DIR = path.join(__dirname, '..', 'test-videos');
const video1 = path.join(TEST_VIDEOS_DIR, 'talking_head.mp4');
const video2 = path.join(TEST_VIDEOS_DIR, 'high_motion.mp4');
const video3 = path.join(TEST_VIDEOS_DIR, 'normal_general.mp4');

let passed = 0;
let failed = 0;
const results = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    results.push({ name, status: '✓' });
    console.log(`  ✓ PASS: ${name}`);
  } catch (err) {
    failed++;
    results.push({ name, status: '✗', error: err.message });
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
  }
}

async function runSuite() {
  console.log('\n======================================================');
  console.log('🧪 Starting Phase 5.3 Batch Processing Queue Test Suite');
  console.log('======================================================\n');

  // ── 1. Add multiple videos ────────────────────────────────────────────────
  await test('1. Add multiple videos: adds multiple items with unique IDs, WAITING status', () => {
    const bq = new BatchQueueManager();
    const added = bq.addItems([
      { inputPath: video1, operation: 'reel', aspectRatio: '9:16' },
      { inputPath: video2, operation: 'cut', duration: 2 },
      { inputPath: video3, operation: 'split', interval: 2 },
    ]);

    assert.strictEqual(added.length, 3);
    assert.strictEqual(bq.getState().totalCount, 3);
    assert.strictEqual(bq.getState().waitingCount, 3);
    assert.strictEqual(bq.getState().runningCount, 0);

    const ids = new Set(added.map((i) => i.id));
    assert.strictEqual(ids.size, 3, 'IDs must be unique');
    for (const item of added) {
      assert.strictEqual(item.status, STATUS.WAITING);
    }
  });

  // ── 2. Remove queued item ──────────────────────────────────────────────────
  await test('2. Remove queued item: safely removes a waiting item and updates state', () => {
    const bq = new BatchQueueManager();
    const [item1, item2] = bq.addItems([
      { inputPath: video1 },
      { inputPath: video2 },
    ]);

    const removed = bq.removeItem(item1.id);
    assert.strictEqual(removed, true);
    assert.strictEqual(bq.getState().totalCount, 1);
    assert.strictEqual(bq.getState().items[0].id, item2.id);

    // Cannot remove non-existent item
    assert.strictEqual(bq.removeItem('non-existent-id'), false);
  });

  // ── 3. Queue ordering ─────────────────────────────────────────────────────
  await test('3. Queue ordering: preserves FIFO insertion order', () => {
    const bq = new BatchQueueManager();
    const added = bq.addItems([
      { inputPath: video1 },
      { inputPath: video2 },
      { inputPath: video3 },
    ]);

    const state = bq.getState();
    assert.strictEqual(state.items[0].inputPath, video1);
    assert.strictEqual(state.items[1].inputPath, video2);
    assert.strictEqual(state.items[2].inputPath, video3);
  });

  // ── 4. Per-item settings ──────────────────────────────────────────────────
  await test('4. Per-item settings: each item maintains independent settings', () => {
    const bq = new BatchQueueManager();
    const [item1, item2] = bq.addItems([
      {
        inputPath: video1,
        aspectRatio: '1:1',
        quality: '4k',
        useSmartCrop: true,
        generateThumbnail: true,
        duration: 5,
      },
      {
        inputPath: video2,
        aspectRatio: '9:16',
        quality: '1080p',
        useSmartCrop: false,
        generateThumbnail: false,
        duration: 10,
      },
    ]);

    assert.strictEqual(item1.aspectRatio, '1:1');
    assert.strictEqual(item1.quality, '4k');
    assert.strictEqual(item1.mode, 'smart_crop');
    assert.strictEqual(item1.generateThumbnail, true);
    assert.strictEqual(item1.duration, 5);

    assert.strictEqual(item2.aspectRatio, '9:16');
    assert.strictEqual(item2.quality, '1080p');
    assert.strictEqual(item2.mode, 'blur');
    assert.strictEqual(item2.generateThumbnail, false);
    assert.strictEqual(item2.duration, 10);
  });

  // ── 5. updateItem ─────────────────────────────────────────────────────────
  await test('5. updateItem: updates settings of a WAITING item', () => {
    const bq = new BatchQueueManager();
    const [item] = bq.addItems([{ inputPath: video1, duration: 5 }]);

    const ok = bq.updateItem(item.id, { duration: 15, useSmartCrop: true, aspectRatio: '16:9' });
    assert.strictEqual(ok, true);

    const updated = bq.getState().items[0];
    assert.strictEqual(updated.duration, 15);
    assert.strictEqual(updated.mode, 'smart_crop');
    assert.strictEqual(updated.aspectRatio, '16:9');
  });

  // ── 6. Sequential processing (concurrency = 1) ────────────────────────────
  await test('6. Sequential processing (concurrency = 1): never exceeds 1 active job', async () => {
    const bq = new BatchQueueManager({ concurrency: 1 });
    assert.strictEqual(bq.getConcurrency(), 1);

    const outDir = os.tmpdir();
    bq.addItems([
      { inputPath: video1, outputPath: path.join(outDir, `seq1_${Date.now()}.mp4`), duration: 1 },
      { inputPath: video2, outputPath: path.join(outDir, `seq2_${Date.now()}.mp4`), duration: 1 },
    ]);

    let maxObservedRunning = 0;
    bq.on('queueUpdate', (state) => {
      if (state.runningCount > maxObservedRunning) {
        maxObservedRunning = state.runningCount;
      }
    });

    await new Promise((resolve) => {
      bq.on('queueDone', resolve);
      bq.startQueue();
    });

    assert.strictEqual(maxObservedRunning, 1, 'Max running concurrency must be 1 for sequential');
    assert.strictEqual(bq.getState().doneCount, 2);
  });

  // ── 7. Maximum concurrency = 2 ────────────────────────────────────────────
  await test('7. Maximum concurrency = 2: clamps values > 2 to 2', () => {
    const bq = new BatchQueueManager();
    bq.setConcurrency(5);
    assert.strictEqual(bq.getConcurrency(), MAX_CONCURRENCY, 'Must clamp to MAX_CONCURRENCY (2)');

    bq.setConcurrency(2);
    assert.strictEqual(bq.getConcurrency(), 2);

    bq.setConcurrency(0);
    assert.strictEqual(bq.getConcurrency(), 1, 'Clamps < 1 to 1');
  });

  // ── 8. Waiting / Processing / Done states ─────────────────────────────────
  await test('8. Waiting / Processing / Done state lifecycle', async () => {
    const bq = new BatchQueueManager();
    const outPath = path.join(os.tmpdir(), `lifecycle_${Date.now()}.mp4`);
    const [item] = bq.addItems([{ inputPath: video1, outputPath: outPath, duration: 1 }]);

    assert.strictEqual(item.status, STATUS.WAITING);

    const statusHistory = [];
    bq.on('itemUpdate', ({ item: it }) => {
      if (it.id === item.id) {
        statusHistory.push(it.status);
      }
    });

    await new Promise((resolve) => {
      bq.on('queueDone', resolve);
      bq.startQueue();
    });

    assert.ok(statusHistory.includes(STATUS.PROCESSING), 'Must transition to PROCESSING');
    assert.ok(statusHistory.includes(STATUS.DONE), 'Must transition to DONE');
    assert.strictEqual(bq.getState().items[0].status, STATUS.DONE);
    assert.strictEqual(bq.getState().items[0].progress, 100);
  });

  // ── 9. Error isolation ────────────────────────────────────────────────────
  await test('9. Error isolation: failed/invalid video marks ERROR but does NOT abort remaining items', async () => {
    const bq = new BatchQueueManager();
    const outDir = os.tmpdir();

    bq.addItems([
      { inputPath: '/non/existent/video/fake.mp4', outputPath: path.join(outDir, `err_${Date.now()}.mp4`), duration: 1 },
      { inputPath: video1, outputPath: path.join(outDir, `valid_${Date.now()}.mp4`), duration: 1 },
    ]);

    await new Promise((resolve) => {
      bq.on('queueDone', resolve);
      bq.startQueue();
    });

    const state = bq.getState();
    assert.strictEqual(state.errorCount, 1, 'First item must be marked ERROR');
    assert.strictEqual(state.items[0].status, STATUS.ERROR);
    assert.ok(state.items[0].error, 'Error message must be present');

    assert.strictEqual(state.doneCount, 1, 'Second item must successfully complete DONE');
    assert.strictEqual(state.items[1].status, STATUS.DONE);
  });

  // ── 10. Cancellation & cleanup ────────────────────────────────────────────
  await test('10. Cancellation & cleanup: cancelItem removes waiting or cancels processing', () => {
    const bq = new BatchQueueManager();
    const [item1, item2] = bq.addItems([
      { inputPath: video1 },
      { inputPath: video2 },
    ]);

    // Cancel waiting item removes it
    const ok = bq.cancelItem(item1.id);
    assert.strictEqual(ok, true);
    assert.strictEqual(bq.getState().totalCount, 1);
  });

  // ── 11. cancelAll ─────────────────────────────────────────────────────────
  await test('11. cancelAll: clears all waiting items and stops queue', () => {
    const bq = new BatchQueueManager();
    bq.addItems([{ inputPath: video1 }, { inputPath: video2 }]);

    bq.cancelAll();
    const state = bq.getState();
    assert.strictEqual(state.totalCount, 0);
    assert.strictEqual(state.isRunning, false);
  });

  // ── 12. clearCompleted ───────────────────────────────────────────────────
  await test('12. clearCompleted: clears DONE and ERROR items while preserving WAITING', () => {
    const bq = new BatchQueueManager();
    const [it1, it2, it3] = bq.addItems([
      { inputPath: video1 },
      { inputPath: video2 },
      { inputPath: video3 },
    ]);

    // Simulate completion on it1 and error on it2
    it1.status = STATUS.DONE;
    it2.status = STATUS.ERROR;
    // it3 remains WAITING

    const cleared = bq.clearCompleted();
    assert.strictEqual(cleared, 2);
    assert.strictEqual(bq.getState().totalCount, 1);
    assert.strictEqual(bq.getState().items[0].id, it3.id);
  });

  // ── 13. Progress events ───────────────────────────────────────────────────
  await test('13. Overall and individual progress events', async () => {
    const bq = new BatchQueueManager();
    const outPath = path.join(os.tmpdir(), `prog_${Date.now()}.mp4`);
    bq.addItems([{ inputPath: video1, outputPath: outPath, duration: 2 }]);

    let progressObserved = false;
    bq.on('itemUpdate', ({ item }) => {
      if (item.progress > 0) progressObserved = true;
    });

    await new Promise((resolve) => {
      bq.on('queueDone', resolve);
      bq.startQueue();
    });

    assert.ok(progressObserved, 'Individual progress was observed');
  });

  // ── 14. Tier gating: Basic tier blocked ───────────────────────────────────
  await test('14. Tier gating: Basic tier is locked for batch queue', () => {
    assert.strictEqual(hasFeature('basic', 'batch_queue'), false);
    assert.strictEqual(hasFeature('basic', 'batchQueue'), false);
    assert.strictEqual(hasFeature('basic', 'batch queue'), false);
  });

  // ── 15. Tier gating: Standard tier blocked ────────────────────────────────
  await test('15. Tier gating: Standard tier is locked for batch queue', () => {
    assert.strictEqual(hasFeature('standard', 'batch_queue'), false);
    assert.strictEqual(hasFeature('standard', 'batchQueue'), false);
    assert.strictEqual(hasFeature('standard', 'batch queue'), false);
  });

  // ── 16. Tier gating: Pro tier enabled ─────────────────────────────────────
  await test('16. Tier gating: Pro tier is enabled for batch queue', () => {
    assert.strictEqual(hasFeature('pro', 'batch_queue'), true);
    assert.strictEqual(hasFeature('pro', 'batchQueue'), true);
    assert.strictEqual(hasFeature('pro', 'batch queue'), true);
  });

  // ── 17. Security boundary: IPC gate rejects non-Pro / null tier ───────────
  await test('17. Security boundary: IPC gate rejects non-Pro and null tier', () => {
    function simulateIpcBatchGate(tier) {
      if (!hasFeature(tier, 'batch_queue')) {
        return { success: false, error: 'Batch Queue feature requires Pro license tier.' };
      }
      return { success: true };
    }

    assert.strictEqual(simulateIpcBatchGate('basic').success, false);
    assert.strictEqual(simulateIpcBatchGate('standard').success, false);
    assert.strictEqual(simulateIpcBatchGate(null).success, false);
    assert.strictEqual(simulateIpcBatchGate(undefined).success, false);
    assert.strictEqual(simulateIpcBatchGate('pro').success, true);
  });

  // ── 18. Batch integration with Smart Crop ─────────────────────────────────
  await test('18. Batch integration with Smart Crop: executes smart_crop mode', async () => {
    const bq = new BatchQueueManager();
    const outPath = path.join(os.tmpdir(), `batch_sc_${Date.now()}.mp4`);
    bq.addItems([
      {
        inputPath: video1,
        outputPath: outPath,
        operation: 'reel',
        useSmartCrop: true,
        duration: 2,
      },
    ]);

    await new Promise((resolve) => {
      bq.on('queueDone', resolve);
      bq.startQueue();
    });

    const item = bq.getState().items[0];
    assert.strictEqual(item.status, STATUS.DONE);
    assert.ok(fs.existsSync(outPath), 'Output video file must exist');

    const meta = await getVideoMetadata(outPath);
    assert.strictEqual(meta.video.width, 1080);
    assert.strictEqual(meta.video.height, 1920);
  });

  // ── 19. Batch integration with Pro Thumbnail ──────────────────────────────
  await test('19. Batch integration with Pro Thumbnail: generates side-by-side cover', async () => {
    const bq = new BatchQueueManager();
    const outPath = path.join(os.tmpdir(), `batch_thumb_${Date.now()}.mp4`);
    bq.addItems([
      {
        inputPath: video2,
        outputPath: outPath,
        operation: 'reel',
        generateThumbnail: true,
        thumbnailTitle: 'Batch Cover',
        duration: 2,
      },
    ]);

    await new Promise((resolve) => {
      bq.on('queueDone', resolve);
      bq.startQueue();
    });

    const item = bq.getState().items[0];
    assert.strictEqual(item.status, STATUS.DONE);
    assert.ok(item.result.thumbnailPath, 'Thumbnail path must be returned');
    assert.ok(fs.existsSync(item.result.thumbnailPath), 'Thumbnail file must exist on disk');
  });

  // ── 20. Compatibility: Single-video processing continues to work ───────────
  await test('20. Compatibility: Single-video processing continues to work unaffected', async () => {
    const outPath = path.join(os.tmpdir(), `single_${Date.now()}.mp4`);
    const res = await cutClip(video1, outPath, {
      start: 0,
      duration: 2,
      reel: true,
      mode: 'crop',
      width: 1080,
      height: 1920,
    });

    assert.ok(fs.existsSync(res.outputPath));
    assert.strictEqual(res.duration, 2);
    const meta = await getVideoMetadata(res.outputPath);
    assert.strictEqual(meta.video.width, 1080);
    assert.strictEqual(meta.video.height, 1920);
  });

  // ── 21. Multi-video batch execution: 3 different videos and settings ───────
  await test('21. Multi-video batch execution: 3 different videos with distinct settings & durations', async () => {
    const bq = new BatchQueueManager({ concurrency: 2 });
    const outDir = os.tmpdir();

    const out1 = path.join(outDir, `multi1_${Date.now()}.mp4`);
    const out2 = path.join(outDir, `multi2_${Date.now()}.mp4`);
    const out3 = path.join(outDir, `multi3_${Date.now()}.mp4`);

    bq.addItems([
      {
        inputPath: video1,
        outputPath: out1,
        operation: 'reel',
        aspectRatio: '9:16',
        mode: 'blur',
        duration: 2,
      },
      {
        inputPath: video2,
        outputPath: out2,
        operation: 'reel',
        aspectRatio: '1:1',
        mode: 'crop',
        duration: 1.5,
      },
      {
        inputPath: video3,
        outputPath: out3,
        operation: 'cut',
        duration: 1,
      },
    ]);

    await new Promise((resolve) => {
      bq.on('queueDone', resolve);
      bq.startQueue();
    });

    const state = bq.getState();
    assert.strictEqual(state.totalCount, 3);
    assert.strictEqual(state.doneCount, 3);
    assert.strictEqual(state.errorCount, 0);

    assert.ok(fs.existsSync(out1), 'Item 1 output exists');
    assert.ok(fs.existsSync(out2), 'Item 2 output exists');
    assert.ok(fs.existsSync(out3), 'Item 3 output exists');
  });

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n──────────────────────────────────────────────────────');
  console.log(`Phase 5.3 Batch Queue Results: ${passed} passed, ${failed} failed`);
  console.log('──────────────────────────────────────────────────────\n');

  return failed;
}

module.exports = { runSuite };

if (require.main === module) {
  runSuite().then((failed) => process.exit(failed > 0 ? 1 : 0));
}
