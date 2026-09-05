'use strict';
/**
 * Batch Queue Manager — Phase 5.3
 *
 * Manages a session-scoped in-memory queue of video processing jobs.
 * Supports configurable concurrency: sequential (1) by default, maximum 2 concurrent.
 * Uses EventEmitter to push status updates to the Electron main process,
 * which forwards them to the renderer via IPC push events.
 *
 * Architecture:
 *   BatchQueueManager
 *     .addItems(items)        → add jobs to queue
 *     .updateItem(id, data)   → edit settings of a waiting job
 *     .removeItem(id)         → remove a waiting job
 *     .clearCompleted()       → remove DONE/ERROR jobs
 *     .startQueue()           → start/resume processing
 *     .pauseQueue()           → stop starting new jobs
 *     .cancelItem(id)         → safely cancel active or waiting job & kill FFmpeg
 *     .cancelAll()            → cancel all jobs & clear waiting
 *     .setConcurrency(n)      → configure concurrency (1 or 2, max 2)
 *     .getState()             → full state snapshot
 *
 * Job lifecycle:
 *   WAITING → PROCESSING → DONE
 *                        → ERROR
 */

const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs');
const { cutClip, splitIntoReels } = require('./cutter');
const { resolveDimensions } = require('./formatter');

// ─── Status Constants ─────────────────────────────────────────────────────────

const STATUS = {
  WAITING: 'WAITING',
  PROCESSING: 'PROCESSING',
  DONE: 'DONE',
  ERROR: 'ERROR',
};

// ─── Configuration ────────────────────────────────────────────────────────────

const MAX_CONCURRENCY = 2;
const DEFAULT_CONCURRENCY = 1; // Sequential by default per requirement

// ─── Helpers ─────────────────────────────────────────────────────────────────

let _idCounter = 0;
function generateId() {
  return `bq_${Date.now()}_${++_idCounter}`;
}

function autoOutputPath(inputPath, operation, mode) {
  const dir = path.dirname(inputPath);
  const base = path.basename(inputPath, path.extname(inputPath));
  const suffix = operation === 'reel' ? `_${mode || 'reel'}` : `_cut`;
  return path.join(dir, `${base}${suffix}.mp4`);
}

// ─── BatchQueueManager ────────────────────────────────────────────────────────

class BatchQueueManager extends EventEmitter {
  constructor(options = {}) {
    super();
    /** @type {Map<string, Object>} */
    this._items = new Map();
    /** @type {string[]} ordered IDs */
    this._order = [];
    /** Number of currently running jobs */
    this._runningCount = 0;
    /** Whether queue is actively processing */
    this._running = false;
    /** Current concurrency setting (1 or 2, max 2) */
    this._concurrency = Math.max(1, Math.min(MAX_CONCURRENCY, options.concurrency || DEFAULT_CONCURRENCY));
    /** Active fluent-ffmpeg commands: itemId -> cmd */
    this._activeCmds = new Map();
    /** Cancellation flags */
    this._cancelFlags = new Set();
  }

  // ── Concurrency Controls ───────────────────────────────────────────────────

  setConcurrency(concurrency) {
    this._concurrency = Math.max(1, Math.min(MAX_CONCURRENCY, Number(concurrency) || 1));
    this._emitQueueUpdate();
    if (this._running) {
      this._scheduleNext();
    }
  }

  getConcurrency() {
    return this._concurrency;
  }

  // ── Queue Management ───────────────────────────────────────────────────────

  /**
   * Add multiple items with per-item settings.
   */
  addItems(rawItems) {
    const created = [];
    for (const raw of rawItems) {
      if (!raw || !raw.inputPath) continue;

      const id = generateId();
      const aspectRatio = raw.aspectRatio || '9:16';
      const quality = raw.quality || '1080p';
      const dimensions = resolveDimensions(aspectRatio, quality);

      let mode = raw.mode || 'blur';
      if (raw.useSmartCrop || raw.smartCrop) {
        mode = 'smart_crop';
      }

      const item = {
        id,
        inputPath: raw.inputPath,
        filename: path.basename(raw.inputPath),
        outputDir: raw.outputDir || null,
        outputPath: raw.outputPath || null,
        operation: raw.operation || 'reel', // 'reel' | 'cut' | 'split'
        mode,
        aspectRatio,
        quality,
        start: raw.start !== undefined ? raw.start : 0,
        duration: raw.duration !== undefined ? raw.duration : null,
        interval: raw.interval !== undefined ? raw.interval : 30,
        width: raw.width || dimensions.width,
        height: raw.height || dimensions.height,
        generateThumbnail: !!(raw.generateThumbnail || raw.useThumbnail),
        thumbnailTitle: raw.thumbnailTitle || path.basename(raw.inputPath, path.extname(raw.inputPath)),
        status: STATUS.WAITING,
        progress: 0,
        currentSegment: null,
        totalSegments: null,
        error: null,
        result: null,
        addedAt: Date.now(),
        startedAt: null,
        finishedAt: null,
      };

      this._items.set(id, item);
      this._order.push(id);
      created.push(item);
    }

    this._emitQueueUpdate();
    return created;
  }

  /**
   * Update settings for an individual item while in WAITING status.
   */
  updateItem(id, updates = {}) {
    const item = this._items.get(id);
    if (!item || item.status !== STATUS.WAITING) return false;

    if (updates.aspectRatio || updates.quality) {
      const ar = updates.aspectRatio || item.aspectRatio;
      const q = updates.quality || item.quality;
      const dims = resolveDimensions(ar, q);
      item.width = dims.width;
      item.height = dims.height;
    }

    if (updates.useSmartCrop !== undefined) {
      item.mode = updates.useSmartCrop ? 'smart_crop' : (updates.mode || 'blur');
    }

    if (updates.useThumbnail !== undefined) {
      item.generateThumbnail = !!updates.useThumbnail;
    }

    Object.assign(item, updates);
    this._emitItemUpdate(item);
    this._emitQueueUpdate();
    return true;
  }

  /**
   * Remove a WAITING item from the queue.
   */
  removeItem(id) {
    const item = this._items.get(id);
    if (!item) return false;
    if (item.status === STATUS.PROCESSING) {
      return false; // Cannot remove active job; cancel it instead
    }
    this._items.delete(id);
    this._order = this._order.filter((i) => i !== id);
    this._emitQueueUpdate();
    return true;
  }

  /**
   * Clear all DONE and ERROR items.
   */
  clearCompleted() {
    const toRemove = [];
    for (const [id, item] of this._items) {
      if (item.status === STATUS.DONE || item.status === STATUS.ERROR) {
        toRemove.push(id);
      }
    }
    for (const id of toRemove) {
      this._items.delete(id);
      this._order = this._order.filter((i) => i !== id);
    }
    this._emitQueueUpdate();
    return toRemove.length;
  }

  /**
   * Safely cancel a single item.
   * If WAITING, removes it immediately.
   * If PROCESSING, marks cancelled and terminates FFmpeg cleanly.
   */
  cancelItem(id) {
    const item = this._items.get(id);
    if (!item) return false;

    if (item.status === STATUS.WAITING) {
      return this.removeItem(id);
    }

    if (item.status === STATUS.PROCESSING) {
      this._cancelFlags.add(id);
      const cmd = this._activeCmds.get(id);
      if (cmd && typeof cmd.kill === 'function') {
        try {
          cmd.kill('SIGKILL');
        } catch (_) {}
      }
      return true;
    }

    return false;
  }

  /**
   * Cancel all running and remove all waiting jobs.
   */
  cancelAll() {
    for (const [id, item] of this._items) {
      if (item.status === STATUS.PROCESSING) {
        this._cancelFlags.add(id);
        const cmd = this._activeCmds.get(id);
        if (cmd && typeof cmd.kill === 'function') {
          try { cmd.kill('SIGKILL'); } catch (_) {}
        }
      }
    }

    // Remove waiting items
    for (const [id, item] of this._items) {
      if (item.status === STATUS.WAITING) {
        this._items.delete(id);
        this._order = this._order.filter((i) => i !== id);
      }
    }

    this._running = false;
    this._emitQueueUpdate();
  }

  /**
   * Start or resume the queue.
   */
  startQueue() {
    this._running = true;
    this._scheduleNext();
    this._emitQueueUpdate();
  }

  /**
   * Pause the queue (currently active jobs finish, waiting jobs pause).
   */
  pauseQueue() {
    this._running = false;
    this._emitQueueUpdate();
  }

  /**
   * Snapshot of queue state for renderer & tests.
   */
  getState() {
    const items = this._order.map((id) => this._items.get(id)).filter(Boolean);
    const totalCount = items.length;
    const runningCount = this._runningCount;
    const waitingCount = items.filter((i) => i.status === STATUS.WAITING).length;
    const doneCount = items.filter((i) => i.status === STATUS.DONE).length;
    const errorCount = items.filter((i) => i.status === STATUS.ERROR).length;

    return {
      items,
      totalCount,
      runningCount,
      waitingCount,
      doneCount,
      errorCount,
      isRunning: this._running,
      concurrency: this._concurrency,
      maxConcurrency: MAX_CONCURRENCY,
    };
  }

  // ── Scheduling Engine ──────────────────────────────────────────────────────

  _scheduleNext() {
    if (!this._running) return;

    while (this._runningCount < this._concurrency) {
      const nextId = this._order.find((id) => {
        const item = this._items.get(id);
        return item && item.status === STATUS.WAITING;
      });

      if (!nextId) break;
      this._processItem(nextId);
    }
  }

  async _processItem(id) {
    const item = this._items.get(id);
    if (!item || item.status !== STATUS.WAITING) return;

    item.status = STATUS.PROCESSING;
    item.startedAt = Date.now();
    item.progress = 0;
    this._runningCount++;
    this._emitItemUpdate(item);
    this._emitQueueUpdate();

    try {
      if (this._cancelFlags.has(id)) {
        throw new Error('Cancelled by user');
      }

      const onProgress = (percent) => {
        if (item.status !== STATUS.PROCESSING) return;
        item.progress = Math.min(100, Math.max(0, Math.round(percent)));
        this._emitItemUpdate(item);
      };

      const onCommand = (cmd) => {
        this._activeCmds.set(id, cmd);
      };

      let result;
      const op = item.operation;

      if (op === 'split') {
        const outDir = item.outputDir || path.dirname(item.inputPath);
        const segments = await splitIntoReels(item.inputPath, outDir, {
          interval: item.interval || 30,
          reel: true,
          mode: item.mode || 'blur',
          width: item.width,
          height: item.height,
          generateThumbnail: item.generateThumbnail,
          thumbnailTitle: item.thumbnailTitle || undefined,
          onOverallProgress: ({ current, total, start, duration }) => {
            item.currentSegment = current;
            item.totalSegments = total;
            onProgress(Math.round((current / total) * 100));
          },
        });
        result = { segments, outputPath: outDir };
      } else {
        const outPath = item.outputPath || autoOutputPath(item.inputPath, op, item.mode);
        const cutOpts = {
          start: item.start || 0,
          duration: item.duration || undefined,
          reel: op === 'reel',
          mode: item.mode || 'blur',
          width: item.width,
          height: item.height,
          generateThumbnail: item.generateThumbnail,
          thumbnailTitle: item.thumbnailTitle || undefined,
          onProgress,
          onCommand,
        };

        result = await cutClip(item.inputPath, outPath, cutOpts);
        result = { ...result, outputPath: result.outputPath };
      }

      if (this._cancelFlags.has(id)) {
        throw new Error('Cancelled by user');
      }

      item.status = STATUS.DONE;
      item.progress = 100;
      item.result = result;
      item.finishedAt = Date.now();
    } catch (err) {
      item.status = STATUS.ERROR;
      item.error = err.message || 'Processing failed';
      item.finishedAt = Date.now();
    } finally {
      this._cancelFlags.delete(id);
      this._activeCmds.delete(id);
      this._runningCount--;
      this._emitItemUpdate(item);
      this._emitQueueUpdate();

      // Check if entire queue is finished
      const allDone = this._order.every((oid) => {
        const o = this._items.get(oid);
        return !o || o.status === STATUS.DONE || o.status === STATUS.ERROR;
      });

      if (allDone) {
        this._running = false;
        this.emit('queueDone', this.getState());
      } else {
        this._scheduleNext();
      }
    }
  }

  // ── Events ─────────────────────────────────────────────────────────────────

  _emitItemUpdate(item) {
    this.emit('itemUpdate', { item: { ...item } });
  }

  _emitQueueUpdate() {
    this.emit('queueUpdate', this.getState());
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _instance = null;

function getBatchQueueManager() {
  if (!_instance) _instance = new BatchQueueManager();
  return _instance;
}

module.exports = {
  getBatchQueueManager,
  BatchQueueManager,
  STATUS,
  MAX_CONCURRENCY,
  resolveDimensions,
  autoOutputPath,
};
