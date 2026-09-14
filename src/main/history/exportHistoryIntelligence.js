'use strict';

/**
 * Export History Intelligence — Phase 5F
 *
 * Extends Phase 5E Export History with:
 * - Grouping (date, profile, platform, preset, status, exportType, plan)
 * - Saved Views (CRUD, persistence, corrupt recovery)
 * - Multi-select & bulk actions (delete, export-again, retry)
 * - Attempt relationships (attemptGroupId, parentHistoryId, attemptNumber)
 * - Tags & Notes
 * - Timeline ordering
 * - History export (CSV/JSON)
 * - Enhanced statistics & insights
 *
 * Storage: %APPDATA%/Reel Cutter/history-views.json
 */

const fs = require('fs');
const path = require('path');

const {
  EXPORT_HISTORY_STATUS,
  loadHistory,
  getExportHistoryRecord,
  saveHistory,
  createExportHistoryRecord,
  getExportHistoryStats,
  generateHistoryId,
} = require('./exportHistoryManager');

// ─── Saved Views Persistence ───────────────────────────────────────────────

const VIEWS_FILENAME = 'history-views.json';

function getViewsFilePath(customDir) {
  if (customDir) {
    return path.join(customDir, VIEWS_FILENAME);
  }
  try {
    const { app } = require('electron');
    const userData = app?.getPath ? app.getPath('userData') : path.join(process.cwd(), '.appdata');
    return path.join(userData, VIEWS_FILENAME);
  } catch {
    return path.join(process.cwd(), VIEWS_FILENAME);
  }
}

function loadViews(customDir) {
  const filePath = getViewsFilePath(customDir);
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) return [];
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.views) ? parsed.views : [];
    return list.filter(v => v && typeof v === 'object' && v.id);
  } catch {
    return [];
  }
}

function saveViews(views, customDir) {
  const filePath = getViewsFilePath(customDir);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const payload = JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), views }, null, 2);
  const tempPath = `${filePath}.tmp.${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  try {
    fs.writeFileSync(tempPath, payload, 'utf8');
    try { fs.renameSync(tempPath, filePath); } catch (_) {
      fs.writeFileSync(filePath, payload, 'utf8');
      try { fs.unlinkSync(tempPath); } catch (_) {}
    }
  } catch (writeErr) {
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) {}
    throw writeErr;
  }
}

// ─── Grouping ──────────────────────────────────────────────────────────────

function getDateBucket(dateStr) {
  const now = new Date();
  const d = new Date(dateStr);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000);
  const startOfWeek = new Date(startOfToday.getTime() - 6 * 86400000);

  if (d >= startOfToday) return 'Today';
  if (d >= startOfYesterday) return 'Yesterday';
  if (d >= startOfWeek) return 'This Week';
  return 'Earlier';
}

function groupRecords(records, groupBy) {
  if (!groupBy || !Array.isArray(records) || records.length === 0) {
    return [];
  }

  const groups = new Map();

  for (const record of records) {
    let key;
    switch (groupBy) {
      case 'date':
        key = getDateBucket(record.createdAt);
        break;
      case 'profile':
        key = (record.profile && record.profile.name) || 'Unknown Profile';
        break;
      case 'platform':
        key = (record.profile && record.profile.platform) || 'Unknown Platform';
        break;
      case 'exportPreset':
        key = (record.exportPreset && record.exportPreset.name) || 'No Preset';
        break;
      case 'variationPreset':
        key = (record.variationPreset && record.variationPreset.name) || 'No Variation Preset';
        break;
      case 'status':
        key = record.status || 'Unknown';
        break;
      case 'exportType':
        key = record.exportType || 'Unknown';
        break;
      case 'plan':
        key = record.planId || 'No Plan';
        break;
      default:
        key = 'All';
    }

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(record);
  }

  // Sort groups by a meaningful order
  const groupOrder = ['Today', 'Yesterday', 'This Week', 'Earlier'];
  const sortedKeys = [...groups.keys()].sort((a, b) => {
    const aIdx = groupOrder.indexOf(a);
    const bIdx = groupOrder.indexOf(b);
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    if (aIdx !== -1) return -1;
    if (bIdx !== -1) return 1;
    return a.localeCompare(b);
  });

  return sortedKeys.map(key => ({
    key,
    records: groups.get(key),
    count: groups.get(key).length,
  }));
}

// ─── Saved Views CRUD ──────────────────────────────────────────────────────

let _viewCounter = 0;
function generateViewId() {
  return `view_${Date.now()}_${++_viewCounter}_${Math.random().toString(36).slice(2, 7)}`;
}

function validateViewInput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Saved view must be a valid object');
  }
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 100) : '';
  if (!name) {
    throw new Error('View name is required');
  }
  return {
    name,
    query: raw.query && typeof raw.query === 'object' ? JSON.parse(JSON.stringify(raw.query)) : {},
    filters: raw.filters && typeof raw.filters === 'object' ? JSON.parse(JSON.stringify(raw.filters)) : {},
    sort: typeof raw.sort === 'string' ? raw.sort : 'newest',
    grouping: typeof raw.grouping === 'string' ? raw.grouping : null,
  };
}

function createSavedView(rawInput, customDir) {
  const validated = validateViewInput(rawInput);
  const existing = loadViews(customDir);
  const now = new Date().toISOString();
  const view = {
    id: generateViewId(),
    createdAt: now,
    updatedAt: now,
    ...validated,
  };
  const updated = [...existing, view];
  saveViews(updated, customDir);
  return JSON.parse(JSON.stringify(view));
}

function getSavedViews(customDir) {
  return JSON.parse(JSON.stringify(loadViews(customDir)));
}

function getSavedView(id, customDir) {
  if (typeof id !== 'string' || !id.trim()) throw new Error('View id is required');
  const views = loadViews(customDir);
  const found = views.find(v => v.id === id);
  return found ? JSON.parse(JSON.stringify(found)) : null;
}

function updateSavedView(id, updates, customDir) {
  if (typeof id !== 'string' || !id.trim()) throw new Error('View id is required');
  if (!updates || typeof updates !== 'object') throw new Error('Updates must be a valid object');

  const views = loadViews(customDir);
  const idx = views.findIndex(v => v.id === id);
  if (idx === -1) throw new Error(`Saved view not found: ${id}`);

  const view = views[idx];
  if (updates.name !== undefined) {
    const name = typeof updates.name === 'string' ? updates.name.trim() : '';
    if (!name) throw new Error('View name cannot be empty');
    view.name = name.slice(0, 100);
  }
  if (updates.query !== undefined) view.query = JSON.parse(JSON.stringify(updates.query));
  if (updates.filters !== undefined) view.filters = JSON.parse(JSON.stringify(updates.filters));
  if (updates.sort !== undefined) view.sort = updates.sort;
  if (updates.grouping !== undefined) view.grouping = updates.grouping;
  view.updatedAt = new Date().toISOString();

  saveViews(views, customDir);
  return JSON.parse(JSON.stringify(view));
}

function deleteSavedView(id, customDir) {
  if (typeof id !== 'string' || !id.trim()) throw new Error('View id is required');
  const views = loadViews(customDir);
  const initialLen = views.length;
  const filtered = views.filter(v => v.id !== id);
  if (filtered.length === initialLen) throw new Error(`Saved view not found: ${id}`);
  saveViews(filtered, customDir);
  return { success: true, id };
}

function duplicateSavedView(id, customDir) {
  const source = getSavedView(id, customDir);
  if (!source) throw new Error(`Saved view not found: ${id}`);
  const newView = createSavedView({
    name: `${source.name} (Copy)`,
    query: source.query,
    filters: source.filters,
    sort: source.sort,
    grouping: source.grouping,
  }, customDir);
  return newView;
}

// ─── Bulk Actions ──────────────────────────────────────────────────────────

function validateIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error('ids must be a non-empty array of strings');
  }
  for (const id of ids) {
    if (typeof id !== 'string' || !id.trim()) {
      throw new Error('All ids must be non-empty strings');
    }
  }
  return ids.map(id => id.trim());
}

function bulkDeleteRecords(ids, customDir) {
  const validIds = validateIds(ids);
  const list = loadHistory(customDir);
  const idSet = new Set(validIds);
  const filtered = list.filter(r => !idSet.has(r.id));
  const deletedCount = list.length - filtered.length;
  if (deletedCount === 0) throw new Error('No matching records found');
  saveHistory(filtered, customDir);
  return { success: true, deletedCount };
}

function bulkGetExportAgainConfigs(ids, customDir) {
  const validIds = validateIds(ids);
  const results = [];
  for (const id of validIds) {
    const record = getExportHistoryRecord(id, customDir);
    if (!record) {
      results.push({ id, available: false, reason: 'Record not found' });
      continue;
    }
    if (record.status !== EXPORT_HISTORY_STATUS.COMPLETED) {
      results.push({ id, available: false, reason: `Status is ${record.status}, not COMPLETED` });
      continue;
    }
    if (!record.output || !record.output.path) {
      results.push({ id, available: false, reason: 'No output path' });
      continue;
    }
    results.push({
      id,
      available: true,
      source: record.source ? JSON.parse(JSON.stringify(record.source)) : null,
      exportType: record.exportType,
      profile: record.profile ? JSON.parse(JSON.stringify(record.profile)) : null,
      exportPreset: record.exportPreset ? JSON.parse(JSON.stringify(record.exportPreset)) : null,
      variationPreset: record.variationPreset ? JSON.parse(JSON.stringify(record.variationPreset)) : null,
      captionTemplate: record.captionTemplate ? JSON.parse(JSON.stringify(record.captionTemplate)) : null,
      settingsSnapshot: record.settingsSnapshot ? JSON.parse(JSON.stringify(record.settingsSnapshot)) : null,
      previousOutputPath: record.output.path,
    });
  }
  return results;
}

function bulkCanRetry(ids, customDir) {
  const validIds = validateIds(ids);
  const results = [];
  for (const id of validIds) {
    const record = getExportHistoryRecord(id, customDir);
    if (!record) {
      results.push({ id, retryable: false, reason: 'Record not found' });
      continue;
    }
    if (record.status !== EXPORT_HISTORY_STATUS.FAILED) {
      results.push({ id, retryable: false, reason: `Status is ${record.status}` });
      continue;
    }
    if (!record.source || !record.source.path) {
      results.push({ id, retryable: false, reason: 'No source path' });
      continue;
    }
    results.push({ id, retryable: true });
  }
  return results;
}

// ─── Attempt Relationships ─────────────────────────────────────────────────

function createRetryRecord(originalId, customDir) {
  const original = getExportHistoryRecord(originalId, customDir);
  if (!original) throw new Error(`Original record not found: ${originalId}`);

  // Determine attempt group
  const attemptGroupId = original.attemptGroupId || original.id;
  const parentHistoryId = original.id;
  const attemptNumber = (original.attemptNumber || 1) + 1;

  const now = new Date().toISOString();
  const record = {
    source: original.source ? JSON.parse(JSON.stringify(original.source)) : { name: '', path: '' },
    exportType: original.exportType,
    profile: original.profile ? JSON.parse(JSON.stringify(original.profile)) : { id: null, name: null, platform: null },
    exportPreset: original.exportPreset ? JSON.parse(JSON.stringify(original.exportPreset)) : { id: null, name: null },
    variationPreset: original.variationPreset ? JSON.parse(JSON.stringify(original.variationPreset)) : { id: null, name: null },
    captionTemplate: original.captionTemplate ? JSON.parse(JSON.stringify(original.captionTemplate)) : { id: null, name: null },
    output: original.output ? JSON.parse(JSON.stringify(original.output)) : { path: '', directory: '', filename: '' },
    status: EXPORT_HISTORY_STATUS.COMPLETED,
    error: null,
    planId: original.planId,
    jobId: null,
    settingsSnapshot: original.settingsSnapshot ? JSON.parse(JSON.stringify(original.settingsSnapshot)) : null,
    attemptGroupId,
    parentHistoryId,
    attemptNumber,
    completedAt: now,
  };

  return createExportHistoryRecord(record, customDir);
}

function getAttemptHistory(attemptGroupId, customDir) {
  if (typeof attemptGroupId !== 'string' || !attemptGroupId.trim()) {
    throw new Error('attemptGroupId is required');
  }
  const list = loadHistory(customDir);
  const matched = list.filter(r => r.attemptGroupId === attemptGroupId || r.id === attemptGroupId);
  return JSON.parse(JSON.stringify(matched));
}

// ─── Tags ──────────────────────────────────────────────────────────────────

const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 50;
const TAG_PATTERN = /^[a-zA-Z0-9_\-]+$/;

function validateTag(tag) {
  if (typeof tag !== 'string') return null;
  const t = tag.trim().toLowerCase();
  if (!t || t.length > MAX_TAG_LENGTH) return null;
  if (!TAG_PATTERN.test(t)) return null;
  return t;
}

function addTag(id, tag, customDir) {
  if (typeof id !== 'string' || !id.trim()) throw new Error('Record id is required');
  const validatedTag = validateTag(tag);
  if (!validatedTag) throw new Error('Invalid tag: use alphanumeric, hyphens, underscores only');

  const list = loadHistory(customDir);
  const idx = list.findIndex(r => r.id === id);
  if (idx === -1) throw new Error(`History record not found: ${id}`);

  const record = list[idx];
  if (!Array.isArray(record.tags)) record.tags = [];
  if (record.tags.includes(validatedTag)) {
    return JSON.parse(JSON.stringify(record));
  }
  if (record.tags.length >= MAX_TAGS) {
    throw new Error(`Maximum ${MAX_TAGS} tags per record`);
  }
  record.tags.push(validatedTag);
  record.updatedAt = new Date().toISOString();
  saveHistory(list, customDir);
  return JSON.parse(JSON.stringify(record));
}

function removeTag(id, tag, customDir) {
  if (typeof id !== 'string' || !id.trim()) throw new Error('Record id is required');
  const validatedTag = validateTag(tag);
  if (!validatedTag) throw new Error('Invalid tag');

  const list = loadHistory(customDir);
  const idx = list.findIndex(r => r.id === id);
  if (idx === -1) throw new Error(`History record not found: ${id}`);

  const record = list[idx];
  if (!Array.isArray(record.tags) || !record.tags.includes(validatedTag)) {
    return JSON.parse(JSON.stringify(record));
  }
  record.tags = record.tags.filter(t => t !== validatedTag);
  record.updatedAt = new Date().toISOString();
  saveHistory(list, customDir);
  return JSON.parse(JSON.stringify(record));
}

function filterByTag(records, tag) {
  const validatedTag = validateTag(tag);
  if (!validatedTag) return records;
  return records.filter(r => Array.isArray(r.tags) && r.tags.includes(validatedTag));
}

// ─── Notes ─────────────────────────────────────────────────────────────────

const MAX_NOTE_LENGTH = 500;

function setNote(id, note, customDir) {
  if (typeof id !== 'string' || !id.trim()) throw new Error('Record id is required');

  const list = loadHistory(customDir);
  const idx = list.findIndex(r => r.id === id);
  if (idx === -1) throw new Error(`History record not found: ${id}`);

  const record = list[idx];
  if (note === null || note === undefined) {
    record.note = null;
  } else if (typeof note === 'string') {
    const cleaned = note.trim().slice(0, MAX_NOTE_LENGTH);
    record.note = cleaned || null;
  } else {
    throw new Error('Note must be a string or null');
  }
  record.updatedAt = new Date().toISOString();
  saveHistory(list, customDir);
  return JSON.parse(JSON.stringify(record));
}

// ─── Timeline ──────────────────────────────────────────────────────────────

function getTimeline(records) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000);
  const startOfWeek = new Date(startOfToday.getTime() - 6 * 86400000);

  const buckets = { Today: [], Yesterday: [], 'This Week': [], Earlier: [] };

  for (const record of records) {
    const d = new Date(record.createdAt);
    if (d >= startOfToday) buckets.Today.push(record);
    else if (d >= startOfYesterday) buckets.Yesterday.push(record);
    else if (d >= startOfWeek) buckets['This Week'].push(record);
    else buckets.Earlier.push(record);
  }

  // Sort within each bucket: newest first
  for (const key of Object.keys(buckets)) {
    buckets[key].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  return Object.entries(buckets)
    .filter(([_, records]) => records.length > 0)
    .map(([label, records]) => ({ label, records: records.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), count: records.length }));
}

// ─── History Export ────────────────────────────────────────────────────────

function exportToCSV(records) {
  if (!Array.isArray(records) || records.length === 0) return '';

  const headers = [
    'ID', 'Created', 'Completed', 'Status', 'Source', 'Export Type',
    'Profile', 'Platform', 'Export Preset', 'Variation Preset',
    'Caption Template', 'Output File', 'Output Directory',
    'Plan ID', 'Job ID', 'Error', 'Tags', 'Note',
    'Attempt Group', 'Attempt Number',
  ];

  const escapeCSV = (val) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = records.map(r => [
    r.id,
    r.createdAt,
    r.completedAt,
    r.status,
    r.source ? r.source.name : '',
    r.exportType,
    r.profile ? r.profile.name : '',
    r.profile ? r.profile.platform : '',
    r.exportPreset ? r.exportPreset.name : '',
    r.variationPreset ? r.variationPreset.name : '',
    r.captionTemplate ? r.captionTemplate.name : '',
    r.output ? r.output.filename : '',
    r.output ? r.output.directory : '',
    r.planId || '',
    r.jobId || '',
    r.error || '',
    Array.isArray(r.tags) ? r.tags.join('; ') : '',
    r.note || '',
    r.attemptGroupId || '',
    r.attemptNumber || '',
  ].map(escapeCSV).join(','));

  return [headers.join(','), ...rows].join('\n');
}

function exportToJSON(records) {
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    count: records.length,
    records: records.map(r => JSON.parse(JSON.stringify(r))),
  }, null, 2);
}

// ─── Enhanced Statistics ───────────────────────────────────────────────────

function getFilteredStats(records) {
  const total = records.length;
  if (total === 0) {
    return {
      total: 0, completed: 0, failed: 0, cancelled: 0, skipped: 0,
      successRate: 0, retryCount: 0, mostUsedProfile: null,
      mostUsedExportPreset: null, mostCommonExportType: null,
      recentCount: 0,
    };
  }

  let completed = 0, failed = 0, cancelled = 0, skipped = 0, retryCount = 0;
  const profileCounts = {}, presetCounts = {}, typeCounts = {};

  const sevenDaysAgo = Date.now() - 7 * 86400000;
  let recentCount = 0;

  for (const r of records) {
    if (r.status === EXPORT_HISTORY_STATUS.COMPLETED) completed++;
    else if (r.status === EXPORT_HISTORY_STATUS.FAILED) failed++;
    else if (r.status === EXPORT_HISTORY_STATUS.CANCELLED) cancelled++;
    else if (r.status === EXPORT_HISTORY_STATUS.SKIPPED) skipped++;

    if (r.attemptNumber && r.attemptNumber > 1) retryCount++;

    const pName = (r.profile && r.profile.name) || 'Unknown';
    profileCounts[pName] = (profileCounts[pName] || 0) + 1;

    const prName = (r.exportPreset && r.exportPreset.name) || 'None';
    presetCounts[prName] = (presetCounts[prName] || 0) + 1;

    const tName = r.exportType || 'Unknown';
    typeCounts[tName] = (typeCounts[tName] || 0) + 1;

    if (new Date(r.createdAt).getTime() >= sevenDaysAgo) recentCount++;
  }

  const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  const mostUsedProfile = Object.entries(profileCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const mostUsedExportPreset = Object.entries(presetCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const mostCommonExportType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  return {
    total, completed, failed, cancelled, skipped,
    successRate, retryCount, mostUsedProfile,
    mostUsedExportPreset, mostCommonExportType, recentCount,
  };
}

// ─── Multi-select Helpers ──────────────────────────────────────────────────

function getVisibleIds(records, selectedIds) {
  if (!Array.isArray(selectedIds)) return [];
  const visibleIds = new Set(records.map(r => r.id));
  return selectedIds.filter(id => visibleIds.has(id));
}

// ─── Exports ───────────────────────────────────────────────────────────────

module.exports = {
  // Grouping
  groupRecords,
  getDateBucket,

  // Saved Views
  createSavedView,
  getSavedViews,
  getSavedView,
  updateSavedView,
  deleteSavedView,
  duplicateSavedView,

  // Bulk Actions
  bulkDeleteRecords,
  bulkGetExportAgainConfigs,
  bulkCanRetry,

  // Attempt Relationships
  createRetryRecord,
  getAttemptHistory,

  // Tags
  addTag,
  removeTag,
  filterByTag,
  validateTag,

  // Notes
  setNote,

  // Timeline
  getTimeline,

  // Export
  exportToCSV,
  exportToJSON,

  // Enhanced Stats
  getFilteredStats,

  // Multi-select
  getVisibleIds,
};
