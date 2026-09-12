'use strict';

/**
 * Scheduler Service — Phase 3A
 *
 * Lightweight, singleton background loop that promotes due scheduled jobs
 * and hands them off to the existing BatchQueueManager.
 *
 * Guarantees:
 *  - Exactly one active loop instance
 *  - Duplicate execution protection (in-flight set + atomic status transitions)
 *  - Deterministic restart recovery
 *  - Concurrency limit preserved (<= 2 via BatchQueueManager)
 *  - Non-destructive source handling
 */

const { EventEmitter } = require('events');
const { getBatchQueueManager } = require('../../engine/batchQueue');
const {
  SCHEDULE_STATUS,
  getSchedules,
  updateScheduleStatus,
  cancelSchedule,
  deleteSchedule,
  pauseSchedule,
  resumeSchedule,
} = require('./scheduleManager');

class SchedulerService extends EventEmitter {
  constructor(options = {}) {
    super();
    this._intervalMs = options.intervalMs || 1000;
    this._customDir = options.customDir || null;
    this._timer = null;
    this._running = false;
    this._queue = options.queueInstance || null;
    /** In-flight schedule IDs to prevent duplicate execution */
    this._inFlightScheduleIds = new Set();
    /** Mapping: batchItemId -> scheduleId */
    this._batchItemToScheduleId = new Map();
    /** Bound event handlers for cleanup */
    this._onItemUpdateBound = this._handleBatchItemUpdate.bind(this);
  }

  get isRunning() {
    return this._running;
  }

  get intervalMs() {
    return this._intervalMs;
  }

  setCustomDir(dir) {
    this._customDir = dir;
  }

  /**
   * Starts the scheduler service and initiates the polling loop.
   * Performs startup reconciliation on persisted schedules.
   */
  start() {
    if (this._running) return;
    this._running = true;

    // Connect to BatchQueueManager
    const q = this._getQueue();
    q.removeListener('itemUpdate', this._onItemUpdateBound);
    q.on('itemUpdate', this._onItemUpdateBound);

    // Startup recovery check
    this._reconcileOnStartup();

    // Start background check loop
    this._timer = setInterval(() => {
      this._checkDueSchedules();
    }, this._intervalMs);

    // Initial check immediately
    this._checkDueSchedules();
  }

  /**
   * Stops the background polling loop.
   */
  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this._running = false;
    const q = this._getQueue();
    q.removeListener('itemUpdate', this._onItemUpdateBound);
    this._inFlightScheduleIds.clear();
    this._batchItemToScheduleId.clear();
  }

  /**
   * Reconciles persisted schedules on startup (Requirement 7).
   * - If a schedule was left in PROCESSING when app closed, mark it FAILED (interrupted).
   * - If a SCHEDULED job is past due, it will be promoted on the first check.
   */
  _reconcileOnStartup() {
    try {
      const all = getSchedules(this._customDir);
      for (const item of all) {
        if (item.status === SCHEDULE_STATUS.PROCESSING) {
          updateScheduleStatus(
            item.id,
            SCHEDULE_STATUS.FAILED,
            { error: 'Export interrupted by application shutdown' },
            this._customDir
          );
        }
      }
    } catch (err) {
      console.error('[SchedulerService] Startup reconciliation error:', err.message);
    }
  }

  /**
   * Periodic check: finds all SCHEDULED jobs that are due and promotes them.
   */
  _checkDueSchedules() {
    if (!this._running) return;

    try {
      const all = getSchedules(this._customDir);
      const now = Date.now();

      for (const item of all) {
        if (item.status !== SCHEDULE_STATUS.SCHEDULED) continue;

        const dueTime = new Date(item.scheduledAt).getTime();
        if (isNaN(dueTime)) continue;

        // If scheduled time has arrived or passed
        if (dueTime <= now) {
          this._promoteAndExecute(item);
        }
      }
    } catch (err) {
      console.error('[SchedulerService] Loop check error:', err.message);
    }
  }

  /**
   * Promotes a due SCHEDULED job to READY, then dispatches to the BatchQueueManager.
   * Atomic check-and-set using _inFlightScheduleIds prevents duplicate triggers.
   *
   * @param {Object} scheduleItem
   */
  _promoteAndExecute(scheduleItem) {
    const id = scheduleItem.id;
    if (this._inFlightScheduleIds.has(id)) {
      return; // Already in-flight
    }
    this._inFlightScheduleIds.add(id);

    try {
      // 1. Promote to READY
      const readySchedule = updateScheduleStatus(id, SCHEDULE_STATUS.READY, {}, this._customDir);
      this.emit('scheduleUpdate', readySchedule);

      // 2. Map to BatchQueueManager item format
      const qItem = {
        inputPath: readySchedule.sourcePath,
        outputPath: readySchedule.outputPath,
        outputDir: readySchedule.outputDirectory,
        operation: readySchedule.exportType, // 'cut' | 'reel' | 'split'
        mode: readySchedule.exportOptions?.mode || 'blur',
        aspectRatio: readySchedule.exportOptions?.aspectRatio || (readySchedule.exportType === 'reel' ? '9:16' : undefined),
        start: readySchedule.exportOptions?.start || 0,
        duration: readySchedule.exportOptions?.duration,
        interval: readySchedule.exportOptions?.interval || 30,
        generateThumbnail: Boolean(readySchedule.exportOptions?.generateThumbnail),
        thumbnailTitle: readySchedule.exportOptions?.thumbnailTitle || `${readySchedule.profileSnapshot?.name || 'Schedule'} - Export`,
        variation: readySchedule.variationPreset && readySchedule.variationPreset.enabled ? readySchedule.variationPreset : undefined,
        // Tag metadata to link back to schedule
        bulkPlanId: readySchedule.planId || null,
        bulkJobId: readySchedule.jobId || null,
        scheduleId: readySchedule.id,
        profileId: readySchedule.profileSnapshot?.id || null,
        profileName: readySchedule.profileSnapshot?.name || null,
        platform: readySchedule.profileSnapshot?.platform || null,
      };

      // 3. Submit to existing BatchQueueManager
      const queue = this._getQueue();
      const createdItems = queue.addItems([qItem]);
      if (!createdItems || createdItems.length === 0) {
        throw new Error('Failed to add item to batch queue');
      }

      const created = createdItems[0];
      this._batchItemToScheduleId.set(created.id, id);

      // 4. Update schedule status to PROCESSING
      const processingSchedule = updateScheduleStatus(
        id,
        SCHEDULE_STATUS.PROCESSING,
        { batchItemId: created.id },
        this._customDir
      );
      this.emit('scheduleUpdate', processingSchedule);

      // 5. Ensure batch queue is running
      queue.startQueue();
    } catch (err) {
      this._inFlightScheduleIds.delete(id);
      try {
        const failedSchedule = updateScheduleStatus(
          id,
          SCHEDULE_STATUS.FAILED,
          { error: err.message },
          this._customDir
        );
        this.emit('scheduleUpdate', failedSchedule);
      } catch (_) {}
    }
  }

  /**
   * Handles batch queue item updates to update schedule state.
   */
  _handleBatchItemUpdate({ item }) {
    if (!item || !item.id) return;

    const scheduleId = this._batchItemToScheduleId.get(item.id) || item.scheduleId;
    if (!scheduleId) return;

    try {
      const schedule = getSchedules(this._customDir).find(s => s.id === scheduleId);
      if (!schedule) return;

      // Update progress during processing
      if (item.status === 'PROCESSING') {
        const percent = item.progress || 0;
        // Avoid persisting every progress tick to disk if not needed, but emit event
        this.emit('scheduleProgress', { id: scheduleId, progress: percent });
      } else if (item.status === 'DONE') {
        this._inFlightScheduleIds.delete(scheduleId);
        this._batchItemToScheduleId.delete(item.id);
        const updated = updateScheduleStatus(
          scheduleId,
          SCHEDULE_STATUS.COMPLETED,
          {
            progress: 100,
            result: item.result,
            outputPath: item.result?.outputPath || schedule.outputPath,
          },
          this._customDir
        );
        this.emit('scheduleUpdate', updated);
      } else if (item.status === 'ERROR') {
        this._inFlightScheduleIds.delete(scheduleId);
        this._batchItemToScheduleId.delete(item.id);
        const updated = updateScheduleStatus(
          scheduleId,
          SCHEDULE_STATUS.FAILED,
          {
            progress: 0,
            error: item.error || 'Export processing failed',
          },
          this._customDir
        );
        this.emit('scheduleUpdate', updated);
      } else if (item.status === 'CANCELLED') {
        this._inFlightScheduleIds.delete(scheduleId);
        this._batchItemToScheduleId.delete(item.id);
        const updated = updateScheduleStatus(
          scheduleId,
          SCHEDULE_STATUS.CANCELLED,
          {
            progress: 0,
            error: 'Cancelled by user',
          },
          this._customDir
        );
        this.emit('scheduleUpdate', updated);
      }
    } catch (err) {
      console.error(`[SchedulerService] Error handling batch item ${item.id}:`, err.message);
    }
  }

  /**
   * Cancels a schedule safely.
   * If it is currently PROCESSING, delegates to the BatchQueueManager.
   *
   * @param {string} id
   * @returns {Object} updated schedule
   */
  cancelScheduleJob(id) {
    if (!id) throw new Error('Schedule id is required');

    const schedule = getSchedules(this._customDir).find(s => s.id === id);
    if (!schedule) {
      throw new Error(`Schedule not found: ${id}`);
    }

    // If active in queue, cancel batch queue item
    if (schedule.status === SCHEDULE_STATUS.PROCESSING && schedule.batchItemId) {
      const queue = this._getQueue();
      queue.cancelItem(schedule.batchItemId);
    }

    this._inFlightScheduleIds.delete(id);

    const cancelled = cancelSchedule(id, this._customDir);
    this.emit('scheduleUpdate', cancelled);
    return cancelled;
  }

  _getQueue() {
    return this._queue || getBatchQueueManager();
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────

let _serviceInstance = null;

function getSchedulerService(options) {
  if (!_serviceInstance) {
    _serviceInstance = new SchedulerService(options);
  }
  return _serviceInstance;
}

module.exports = {
  SchedulerService,
  getSchedulerService,
};
