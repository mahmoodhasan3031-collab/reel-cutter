'use strict';

/**
 * Output Health Service — Phase 5G
 *
 * Safe filesystem metadata checks for export output files.
 * Never reads video content. Never executes arbitrary commands.
 * All checks use fs.statSync only.
 */

const fs = require('fs');
const path = require('path');

// ─── Output Health Status Constants ────────────────────────────────────────

const OUTPUT_HEALTH_STATUS = {
  AVAILABLE: 'AVAILABLE',
  MISSING: 'MISSING',
  INVALID_PATH: 'INVALID_PATH',
  INACCESSIBLE: 'INACCESSIBLE',
};

// ─── Core Health Check ─────────────────────────────────────────────────────

/**
 * Checks the health of a single output file path.
 * Uses fs.statSync only — never reads file content.
 * @param {string} outputPath - Absolute path to the output file
 * @returns {{ status: string, filePath: string, size: number|null, modifiedAt: string|null }}
 */
function checkOutputHealth(outputPath) {
  if (typeof outputPath !== 'string' || !outputPath.trim()) {
    return {
      status: OUTPUT_HEALTH_STATUS.INVALID_PATH,
      filePath: outputPath || '',
      size: null,
      modifiedAt: null,
    };
  }

  const normalized = outputPath.trim();

  // Basic path validity check
  if (normalized.includes('\0') || normalized.length > 2000) {
    return {
      status: OUTPUT_HEALTH_STATUS.INVALID_PATH,
      filePath: normalized,
      size: null,
      modifiedAt: null,
    };
  }

  try {
    const stat = fs.statSync(normalized);
    if (stat.isFile()) {
      return {
        status: OUTPUT_HEALTH_STATUS.AVAILABLE,
        filePath: normalized,
        size: stat.size,
        modifiedAt: stat.mtime instanceof Date ? stat.mtime.toISOString() : null,
      };
    }
    // Path exists but is not a file (directory, symlink to dir, etc.)
    return {
      status: OUTPUT_HEALTH_STATUS.INVALID_PATH,
      filePath: normalized,
      size: null,
      modifiedAt: null,
    };
  } catch (err) {
    if (err.code === 'ENOENT') {
      return {
        status: OUTPUT_HEALTH_STATUS.MISSING,
        filePath: normalized,
        size: null,
        modifiedAt: null,
      };
    }
    // EACCES, EPERM, etc.
    return {
      status: OUTPUT_HEALTH_STATUS.INACCESSIBLE,
      filePath: normalized,
      size: null,
      modifiedAt: null,
    };
  }
}

/**
 * Checks health of multiple output paths in batch.
 * @param {string[]} paths - Array of absolute output paths
 * @returns {{ results: Array<{ status: string, filePath: string, size: number|null, modifiedAt: string|null }>, summary: { total: number, available: number, missing: number, invalidPath: number, inaccessible: number } }}
 */
function batchCheckOutputHealth(paths) {
  if (!Array.isArray(paths) || paths.length === 0) {
    return {
      results: [],
      summary: { total: 0, available: 0, missing: 0, invalidPath: 0, inaccessible: 0 },
    };
  }

  const results = paths.map(p => checkOutputHealth(p));
  const summary = {
    total: results.length,
    available: 0,
    missing: 0,
    invalidPath: 0,
    inaccessible: 0,
  };

  for (const r of results) {
    switch (r.status) {
      case OUTPUT_HEALTH_STATUS.AVAILABLE: summary.available++; break;
      case OUTPUT_HEALTH_STATUS.MISSING: summary.missing++; break;
      case OUTPUT_HEALTH_STATUS.INVALID_PATH: summary.invalidPath++; break;
      case OUTPUT_HEALTH_STATUS.INACCESSIBLE: summary.inaccessible++; break;
    }
  }

  return { results, summary };
}

/**
 * Checks output health for a history record.
 * @param {Object} record - A history record with output.path
 * @returns {{ status: string, filePath: string, size: number|null, modifiedAt: string|null }}
 */
function checkRecordOutputHealth(record) {
  if (!record || typeof record !== 'object') {
    return {
      status: OUTPUT_HEALTH_STATUS.INVALID_PATH,
      filePath: '',
      size: null,
      modifiedAt: null,
    };
  }
  const outputPath = record.output && typeof record.output === 'object'
    ? record.output.path
    : '';
  return checkOutputHealth(outputPath);
}

/**
 * Batch check output health for multiple history records.
 * @param {Object[]} records - Array of history records
 * @returns {{ results: Array<{ recordId: string, status: string, filePath: string, size: number|null, modifiedAt: string|null }>, summary: { total: number, available: number, missing: number, invalidPath: number, inaccessible: number } }}
 */
function batchCheckRecordOutputHealth(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return {
      results: [],
      summary: { total: 0, available: 0, missing: 0, invalidPath: 0, inaccessible: 0 },
    };
  }

  const results = records.map(r => ({
    recordId: r.id || '',
    ...checkRecordOutputHealth(r),
  }));

  const summary = {
    total: results.length,
    available: 0,
    missing: 0,
    invalidPath: 0,
    inaccessible: 0,
  };

  for (const r of results) {
    switch (r.status) {
      case OUTPUT_HEALTH_STATUS.AVAILABLE: summary.available++; break;
      case OUTPUT_HEALTH_STATUS.MISSING: summary.missing++; break;
      case OUTPUT_HEALTH_STATUS.INVALID_PATH: summary.invalidPath++; break;
      case OUTPUT_HEALTH_STATUS.INACCESSIBLE: summary.inaccessible++; break;
    }
  }

  return { results, summary };
}

// ─── Path Validation Helpers ───────────────────────────────────────────────

/**
 * Validates that a path is a safe, absolute, existing directory.
 * @param {string} dirPath
 * @returns {{ valid: boolean, reason: string|null }}
 */
function validateDirectoryPath(dirPath) {
  if (typeof dirPath !== 'string' || !dirPath.trim()) {
    return { valid: false, reason: 'Path is empty or invalid' };
  }
  const normalized = path.normalize(dirPath.trim());
  if (normalized.includes('\0')) {
    return { valid: false, reason: 'Path contains null bytes' };
  }
  try {
    const stat = fs.statSync(normalized);
    if (!stat.isDirectory()) {
      return { valid: false, reason: 'Path is not a directory' };
    }
    return { valid: true, reason: null };
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { valid: false, reason: 'Directory does not exist' };
    }
    return { valid: false, reason: 'Directory is inaccessible' };
  }
}

/**
 * Validates that a path is safe to open (file exists).
 * @param {string} filePath
 * @returns {{ valid: boolean, reason: string|null }}
 */
function validateOpenablePath(filePath) {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    return { valid: false, reason: 'Path is empty or invalid' };
  }
  const normalized = path.normalize(filePath.trim());
  if (normalized.includes('\0')) {
    return { valid: false, reason: 'Path contains null bytes' };
  }
  try {
    const stat = fs.statSync(normalized);
    if (!stat.isFile()) {
      return { valid: false, reason: 'Path is not a file' };
    }
    return { valid: true, reason: null };
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { valid: false, reason: 'File does not exist' };
    }
    return { valid: false, reason: 'File is inaccessible' };
  }
}

// ─── Exports ───────────────────────────────────────────────────────────────

module.exports = {
  OUTPUT_HEALTH_STATUS,
  checkOutputHealth,
  batchCheckOutputHealth,
  checkRecordOutputHealth,
  batchCheckRecordOutputHealth,
  validateDirectoryPath,
  validateOpenablePath,
};
