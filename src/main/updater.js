'use strict';
/**
 * Auto-Updater Manager — Phase 6
 *
 * Configures electron-updater with GitHub Releases provider.
 * Implements:
 *  - Check for updates on launch
 *  - Detect newer versions
 *  - User notification via IPC push events
 *  - 1-click download
 *  - 1-click install & restart
 *  - Strict video-processing guard: REFUSES download/install while any FFmpeg job is active
 *  - Graceful error handling (offline, dev environment, network issues)
 */

const { getBatchQueueManager } = require('../engine/batchQueue');

// ─── Update States ────────────────────────────────────────────────────────────

const UPDATE_STATUS = {
  IDLE: 'idle',
  CHECKING: 'checking',
  NOT_AVAILABLE: 'not-available',
  AVAILABLE: 'available',
  DOWNLOADING: 'downloading',
  DOWNLOADED: 'downloaded',
  INSTALLING: 'installing',
  ERROR: 'error',
};

// ─── Lazy Electron-Updater Loader ─────────────────────────────────────────────

let _updaterModule = null;

function getUnderlyingUpdater() {
  if (!_updaterModule) {
    try {
      const { autoUpdater } = require('electron-updater');
      _updaterModule = autoUpdater;
    } catch (_) {
      // In pure Node.js CLI (e.g. unit test runner) where electron.app is absent
      _updaterModule = null;
    }
  }
  return _updaterModule;
}

// ─── Active Job Tracking ──────────────────────────────────────────────────────

let _activeSingleJobs = 0;

function markJobStarted() {
  _activeSingleJobs++;
}

function markJobFinished() {
  _activeSingleJobs = Math.max(0, _activeSingleJobs - 1);
}

function isVideoProcessingActive() {
  if (_activeSingleJobs > 0) return true;
  try {
    const bq = getBatchQueueManager();
    if (bq && bq.getState().runningCount > 0) return true;
  } catch (_) {}
  return false;
}

// ─── Auto-Updater Controller ──────────────────────────────────────────────────

class AppUpdater {
  constructor() {
    this._status = UPDATE_STATUS.IDLE;
    this._info = null;
    this._progress = null;
    this._error = null;
    this._window = null;

    const u = getUnderlyingUpdater();
    if (u) {
      u.autoDownload = false; // Manual one-click download per requirement
      u.autoInstallOnAppQuit = false;
      this._setupListeners(u);
    }
  }

  setWindow(win) {
    this._window = win;
  }

  getStatus() {
    return {
      status: this._status,
      info: this._info,
      progress: this._progress,
      error: this._error,
      isProcessingActive: isVideoProcessingActive(),
    };
  }

  _notify() {
    const data = this.getStatus();
    if (this._window && !this._window.isDestroyed()) {
      this._window.webContents.send('updater:status', data);
    }
  }

  _setupListeners(updater) {
    if (!updater) return;

    updater.on('checking-for-update', () => {
      this._status = UPDATE_STATUS.CHECKING;
      this._error = null;
      this._notify();
    });

    updater.on('update-available', (info) => {
      this._status = UPDATE_STATUS.AVAILABLE;
      this._info = {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes || 'Bug fixes and performance improvements.',
      };
      this._error = null;
      this._notify();
    });

    updater.on('update-not-available', (info) => {
      this._status = UPDATE_STATUS.NOT_AVAILABLE;
      this._info = {
        version: info ? info.version : null,
      };
      this._error = null;
      this._notify();
    });

    updater.on('download-progress', (progressObj) => {
      this._status = UPDATE_STATUS.DOWNLOADING;
      this._progress = {
        percent: Math.round(progressObj.percent || 0),
        transferred: progressObj.transferred || 0,
        total: progressObj.total || 0,
        bytesPerSecond: progressObj.bytesPerSecond || 0,
      };
      this._notify();
    });

    updater.on('update-downloaded', (info) => {
      this._status = UPDATE_STATUS.DOWNLOADED;
      this._info = {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes,
      };
      this._progress = { percent: 100 };
      this._error = null;
      this._notify();
    });

    updater.on('error', (err) => {
      this._status = UPDATE_STATUS.ERROR;
      this._error = err ? err.message || String(err) : 'Update check failed';
      this._notify();
    });
  }

  /**
   * Check for updates from GitHub releases.
   */
  async checkForUpdates() {
    this._status = UPDATE_STATUS.CHECKING;
    this._error = null;
    this._notify();

    const u = getUnderlyingUpdater();
    if (!u) {
      this._status = UPDATE_STATUS.NOT_AVAILABLE;
      this._notify();
      return { success: true, result: null };
    }

    try {
      const res = await u.checkForUpdates();
      return { success: true, result: res ? res.updateInfo : null };
    } catch (err) {
      this._status = UPDATE_STATUS.ERROR;
      this._error = err.message || 'Unable to check for updates';
      this._notify();
      return { success: false, error: this._error };
    }
  }

  /**
   * 1-Click Download.
   * Refuses to download if active video processing is running.
   */
  async downloadUpdate() {
    if (isVideoProcessingActive()) {
      const msg = 'Cannot download update while video processing is active. Please wait for current jobs to complete.';
      this._error = msg;
      this._notify();
      return { success: false, error: msg, blockedByProcessing: true };
    }

    const u = getUnderlyingUpdater();
    if (!u) {
      return { success: true };
    }

    try {
      this._status = UPDATE_STATUS.DOWNLOADING;
      this._error = null;
      this._notify();

      await u.downloadUpdate();
      return { success: true };
    } catch (err) {
      this._status = UPDATE_STATUS.ERROR;
      this._error = err.message || 'Download failed';
      this._notify();
      return { success: false, error: this._error };
    }
  }

  /**
   * 1-Click Install & Restart.
   * Refuses to install/quit if active video processing is running.
   */
  quitAndInstall() {
    if (isVideoProcessingActive()) {
      const msg = 'Cannot install update while video processing is active. Please wait for current jobs to finish.';
      this._error = msg;
      this._notify();
      return { success: false, error: msg, blockedByProcessing: true };
    }

    this._status = UPDATE_STATUS.INSTALLING;
    this._notify();

    const u = getUnderlyingUpdater();
    if (!u) {
      return { success: true };
    }

    // Small delay to allow renderer to render the "Installing" state
    setTimeout(() => {
      try {
        u.quitAndInstall(false, true);
      } catch (err) {
        this._status = UPDATE_STATUS.ERROR;
        this._error = err.message;
        this._notify();
      }
    }, 400);

    return { success: true };
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _instance = null;

function getAppUpdater() {
  if (!_instance) _instance = new AppUpdater();
  return _instance;
}

module.exports = {
  getAppUpdater,
  AppUpdater,
  UPDATE_STATUS,
  markJobStarted,
  markJobFinished,
  isVideoProcessingActive,
};
