'use strict';

/**
 * Caption History Manager — Phase 4B-7
 *
 * Persistent local history store for caption quality analyses.
 * Manages atomic persistence, recovery from corruption, 500-record FIFO limit,
 * CRUD operations, search, sort, filtering, dashboard metrics, deterministic insights,
 * read-only comparisons, and re-analysis.
 *
 * Storage location: %APPDATA%/Reel Cutter/caption-quality-history.json
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { analyzeCaption, MAX_CAPTION_LENGTH } = require('./captionQualityAnalyzer');

const CAPTION_HISTORY_FILENAME = 'caption-quality-history.json';
const MAX_HISTORY_LIMIT = 500;

let _counter = 0;
function generateHistoryId() {
  return `cqh_${Date.now()}_${++_counter}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Resolves the path to caption-quality-history.json.
 * @param {string} [customDir]
 * @returns {string}
 */
function getHistoryFilePath(customDir) {
  if (customDir) {
    return path.join(customDir, CAPTION_HISTORY_FILENAME);
  }
  try {
    const userData = app?.getPath ? app.getPath('userData') : path.join(process.cwd(), '.appdata');
    return path.join(userData, CAPTION_HISTORY_FILENAME);
  } catch {
    return path.join(process.cwd(), CAPTION_HISTORY_FILENAME);
  }
}

/**
 * Validates and sanitizes a history record candidate.
 * Throws if invalid.
 * @param {Object} raw
 * @returns {Object} Validated record
 */
function validateHistoryRecordInput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('History record must be a valid object');
  }

  if (raw.caption === undefined || raw.caption === null || typeof raw.caption !== 'string') {
    throw new Error('caption is required and must be a string');
  }
  const caption = raw.caption.trim();
  if (caption.length === 0) {
    throw new Error('Caption cannot be empty');
  }
  if (caption.length > MAX_CAPTION_LENGTH) {
    throw new Error(`Caption exceeds maximum length of ${MAX_CAPTION_LENGTH} characters`);
  }

  // If score and signals are already provided (e.g. from quality analysis)
  let score = raw.score;
  let grade = raw.grade;
  let signals = raw.signals;
  let strengths = Array.isArray(raw.strengths) ? raw.strengths.map(String) : [];
  let suggestions = Array.isArray(raw.suggestions) ? raw.suggestions.map(String) : [];

  if (typeof score !== 'number' || !signals || typeof signals !== 'object') {
    // Automatically analyze if missing
    const analysis = analyzeCaption({
      caption,
      topic: raw.topic,
      language: raw.language,
      tone: raw.tone,
      platform: raw.platform,
    });
    score = analysis.score;
    grade = analysis.grade;
    signals = analysis.signals;
    strengths = analysis.strengths;
    suggestions = analysis.suggestions;
  } else {
    // Validate provided score & signals
    if (score < 0 || score > 100 || !Number.isFinite(score)) {
      throw new Error('Score must be a number between 0 and 100');
    }
    const reqSignals = ['readability', 'relevance', 'clarity', 'cta', 'structure'];
    for (const sig of reqSignals) {
      const val = signals[sig];
      if (typeof val !== 'number' || val < 0 || val > 100 || !Number.isFinite(val)) {
        throw new Error(`Signal "${sig}" must be a number between 0 and 100`);
      }
    }
    if (!['A', 'B', 'C', 'D', 'F'].includes(grade)) {
      throw new Error(`Invalid grade "${grade}"`);
    }
  }

  return {
    caption,
    score: Math.round(score),
    grade,
    signals: {
      readability: Math.round(signals.readability),
      relevance: Math.round(signals.relevance),
      clarity: Math.round(signals.clarity),
      cta: Math.round(signals.cta),
      structure: Math.round(signals.structure),
    },
    strengths,
    suggestions,
    topic: typeof raw.topic === 'string' ? raw.topic.trim().slice(0, 500) : null,
    language: typeof raw.language === 'string' ? raw.language.trim().toLowerCase() : 'english',
    tone: typeof raw.tone === 'string' ? raw.tone.trim().toLowerCase() : null,
    length: typeof raw.length === 'string' ? raw.length.trim().toLowerCase() : null,
    platform: typeof raw.platform === 'string' ? raw.platform.trim().toLowerCase() : null,
    profileId: typeof raw.profileId === 'string' ? raw.profileId.trim().slice(0, 100) : null,
    profileName: typeof raw.profileName === 'string' ? raw.profileName.trim().slice(0, 100) : null,
  };
}

/**
 * Loads history records from disk with automatic error recovery.
 * @param {string} [customDir]
 * @returns {Array<Object>}
 */
function loadHistory(customDir) {
  const filePath = getHistoryFilePath(customDir);
  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) {
      return [];
    }
    const parsed = JSON.parse(raw);
    const candidateList = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.history)
      ? parsed.history
      : [];

    const validList = [];
    for (const item of candidateList) {
      if (!item || typeof item !== 'object' || !item.id) continue;
      try {
        const validated = validateHistoryRecordInput(item);
        validList.push({
          id: String(item.id),
          createdAt: item.createdAt || new Date().toISOString(),
          updatedAt: item.updatedAt || new Date().toISOString(),
          ...validated,
        });
      } catch (err) {
        // Skip corrupt individual record without throwing
      }
    }
    return validList;
  } catch (err) {
    // Recover safely from corrupt JSON by returning empty valid state
    return [];
  }
}

/**
 * Atomically saves history records to disk.
 * @param {Array<Object>} records
 * @param {string} [customDir]
 */
function saveHistory(records, customDir) {
  const filePath = getHistoryFilePath(customDir);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Enforce FIFO limit
  const trimmed = records.slice(0, MAX_HISTORY_LIMIT);

  const payload = JSON.stringify(
    {
      version: 1,
      updatedAt: new Date().toISOString(),
      history: trimmed,
    },
    null,
    2
  );

  const tempPath = `${filePath}.tmp.${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  try {
    fs.writeFileSync(tempPath, payload, 'utf8');
    try {
      fs.renameSync(tempPath, filePath);
    } catch (renameErr) {
      // Fallback if atomic rename fails on Windows lock
      fs.writeFileSync(filePath, payload, 'utf8');
      try { fs.unlinkSync(tempPath); } catch (_) {}
    }
  } catch (writeErr) {
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) {}
    throw writeErr;
  }
}

// ── Public CRUD Operations ──────────────────────────────────────────────────

/**
 * Creates and persists a new history record.
 * @param {Object} rawInput
 * @param {string} [customDir]
 * @returns {Object} Created history record
 */
function createHistoryRecord(rawInput, customDir) {
  const validated = validateHistoryRecordInput(rawInput);
  const existing = loadHistory(customDir);

  const now = new Date().toISOString();
  const record = {
    id: generateHistoryId(),
    createdAt: now,
    updatedAt: now,
    ...validated,
  };

  // Prepend to list (newest first)
  const updated = [record, ...existing];

  // Enforce MAX_HISTORY_LIMIT
  if (updated.length > MAX_HISTORY_LIMIT) {
    updated.splice(MAX_HISTORY_LIMIT);
  }

  saveHistory(updated, customDir);
  return JSON.parse(JSON.stringify(record));
}

/**
 * Retrieves history with optional filtering, searching, and sorting.
 * @param {Object} [options]
 * @param {string} [options.search]
 * @param {string} [options.grade]
 * @param {string} [options.platform]
 * @param {string} [options.profileId]
 * @param {'newest'|'oldest'|'highest'|'lowest'} [options.sort='newest']
 * @param {string} [customDir]
 * @returns {Array<Object>}
 */
function getHistory(options = {}, customDir) {
  if (typeof options === 'string') {
    const tmp = options;
    options = (customDir && typeof customDir === 'object') ? customDir : {};
    customDir = tmp;
  }
  let list = loadHistory(customDir);

  // Filter: Search
  if (options.search && typeof options.search === 'string') {
    const q = options.search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          (r.caption && r.caption.toLowerCase().includes(q)) ||
          (r.topic && r.topic.toLowerCase().includes(q)) ||
          (r.profileName && r.profileName.toLowerCase().includes(q))
      );
    }
  }

  // Filter: Grade
  if (options.grade && typeof options.grade === 'string') {
    const g = options.grade.trim().toUpperCase();
    if (['A', 'B', 'C', 'D', 'F'].includes(g)) {
      list = list.filter((r) => r.grade === g);
    }
  }

  // Filter: Platform
  if (options.platform && typeof options.platform === 'string') {
    const p = options.platform.trim().toLowerCase();
    if (p) {
      list = list.filter((r) => r.platform && r.platform.toLowerCase() === p);
    }
  }

  // Filter: ProfileId
  if (options.profileId && typeof options.profileId === 'string') {
    const pid = options.profileId.trim();
    if (pid) {
      list = list.filter((r) => r.profileId === pid);
    }
  }

  // Sort
  const sortMode = (options.sort || options.sortBy || 'newest').toString().toLowerCase();
  list.sort((a, b) => {
    if (sortMode === 'oldest' || sortMode === 'date_asc') {
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    }
    if (sortMode === 'highest' || sortMode === 'score_desc' || sortMode === 'highest_score') {
      return b.score - a.score;
    }
    if (sortMode === 'lowest' || sortMode === 'score_asc' || sortMode === 'lowest_score') {
      return a.score - b.score;
    }
    // Default 'newest' / 'date_desc'
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return JSON.parse(JSON.stringify(list));
}

/**
 * Gets a single history record by ID.
 * @param {string} id
 * @param {string} [customDir]
 * @returns {Object|null}
 */
function getHistoryRecord(id, customDir) {
  if (typeof id !== 'string') {
    throw new Error('History record id must be a string');
  }
  if (!id.trim()) {
    throw new Error('History record id is required and must be a string');
  }
  const list = loadHistory(customDir);
  const found = list.find((r) => r.id === id);
  return found ? JSON.parse(JSON.stringify(found)) : null;
}

/**
 * Deletes a history record by ID.
 * @param {string} id
 * @param {string} [customDir]
 * @returns {{ success: boolean, id: string }}
 */
function deleteHistoryRecord(id, customDir) {
  if (id === null || id === undefined || (typeof id === 'string' && !id.trim())) {
    throw new Error('History record id is required and must be a string');
  }
  if (typeof id !== 'string') {
    throw new Error('History record id must be a string');
  }
  const list = loadHistory(customDir);
  const initialLen = list.length;
  const filtered = list.filter((r) => r.id !== id);
  if (filtered.length === initialLen) {
    throw new Error(`History record not found: ${id}`);
  }
  saveHistory(filtered, customDir);
  return { success: true, id };
}

/**
 * Clears all history records.
 * @param {string} [customDir]
 * @returns {{ success: boolean, count: number }}
 */
function clearHistory(customDir) {
  const list = loadHistory(customDir);
  const count = list.length;
  saveHistory([], customDir);
  return { success: true, count };
}

// ── Dashboard Metrics & Insights ────────────────────────────────────────────

/**
 * Computes dashboard aggregate metrics.
 * @param {string} [customDir]
 * @returns {Object} Dashboard metrics
 */
function getDashboardMetrics(customDir) {
  const list = loadHistory(customDir);
  const totalCount = list.length;

  if (totalCount === 0) {
    return {
      totalCount: 0,
      averageScore: 0,
      highestScore: 0,
      lowestScore: 0,
      improvementOpportunities: 0,
      averageSignals: {
        readability: 0,
        relevance: 0,
        clarity: 0,
        cta: 0,
        structure: 0,
      },
      weakestSignal: null,
      gradeDistribution: { A: 0, B: 0, C: 0, D: 0, F: 0 },
      recentRecords: [],
    };
  }

  const scores = list.map((r) => r.score);
  const averageScore = Math.round(scores.reduce((a, b) => a + b, 0) / totalCount);
  const highestScore = Math.max(...scores);
  const lowestScore = Math.min(...scores);
  const improvementOpportunities = list.filter((r) => r.score < 80).length;

  const sumSignals = { readability: 0, relevance: 0, clarity: 0, cta: 0, structure: 0 };
  const gradeDistribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };

  for (const r of list) {
    if (r.signals) {
      sumSignals.readability += r.signals.readability || 0;
      sumSignals.relevance += r.signals.relevance || 0;
      sumSignals.clarity += r.signals.clarity || 0;
      sumSignals.cta += r.signals.cta || 0;
      sumSignals.structure += r.signals.structure || 0;
    }
    if (gradeDistribution[r.grade] !== undefined) {
      gradeDistribution[r.grade]++;
    }
  }

  const averageSignals = {
    readability: Math.round(sumSignals.readability / totalCount),
    relevance: Math.round(sumSignals.relevance / totalCount),
    clarity: Math.round(sumSignals.clarity / totalCount),
    cta: Math.round(sumSignals.cta / totalCount),
    structure: Math.round(sumSignals.structure / totalCount),
  };

  // Determine weakest signal
  let weakestSignal = 'readability';
  let minSigVal = averageSignals.readability;
  for (const [sig, val] of Object.entries(averageSignals)) {
    if (val < minSigVal) {
      minSigVal = val;
      weakestSignal = sig;
    }
  }

  // Recent 5 records
  const recentRecords = list
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  return {
    totalCount,
    averageScore,
    highestScore,
    lowestScore,
    improvementOpportunities,
    averageSignals,
    weakestSignal,
    gradeDistribution,
    recentRecords,
  };
}

/**
 * Generates deterministic heuristic insights from history data.
 * @param {string} [customDir]
 * @returns {Array<string>}
 */
function getQualityInsights(customDirOrMetrics) {
  let metrics;
  if (customDirOrMetrics && typeof customDirOrMetrics === 'object' && typeof customDirOrMetrics.totalCount === 'number') {
    metrics = customDirOrMetrics;
  } else {
    metrics = getDashboardMetrics(typeof customDirOrMetrics === 'string' ? customDirOrMetrics : undefined);
  }
  if (metrics.totalCount === 0) {
    return ['No caption analyses recorded yet. Analyze and save your first caption to generate intelligence insights.'];
  }

  const insights = [];

  // Overall quality insight
  if (metrics.averageScore >= 85) {
    insights.push(`Your overall caption quality is consistently strong with an average score of ${metrics.averageScore}/100.`);
  } else if (metrics.averageScore >= 70) {
    insights.push(`Current quality data shows moderate performance at an average of ${metrics.averageScore}/100 with clear opportunities for refinement.`);
  } else {
    insights.push(`Recent captions average ${metrics.averageScore}/100. Focusing on structure and clearer messaging will elevate quality.`);
  }

  // Weakest signal insight
  const sigNames = {
    readability: 'Readability',
    relevance: 'Topic Relevance',
    clarity: 'Clarity & Focus',
    cta: 'CTA Quality',
    structure: 'Formatting & Structure',
  };
  if (metrics.weakestSignal) {
    const weakName = sigNames[metrics.weakestSignal] || metrics.weakestSignal;
    const weakVal = metrics.averageSignals[metrics.weakestSignal];
    if (metrics.weakestSignal === 'cta') {
      insights.push(`${weakName} is currently your lowest average signal (${weakVal}/100). Adding clear calls-to-action (e.g. "Follow for more", "Share this") can improve performance readiness.`);
    } else if (metrics.weakestSignal === 'readability') {
      insights.push(`${weakName} is currently your lowest average signal (${weakVal}/100). Try shortening long sentences into 10–15 word chunks.`);
    } else if (metrics.weakestSignal === 'clarity') {
      insights.push(`${weakName} averages ${weakVal}/100. Watch out for repetitive vocabulary and excessive emojis.`);
    } else {
      insights.push(`${weakName} averages ${weakVal}/100, representing your primary area for content quality improvement.`);
    }
  }

  // Strongest signal insight
  let strongestSignal = 'readability';
  let maxSigVal = -1;
  for (const [sig, val] of Object.entries(metrics.averageSignals)) {
    if (val > maxSigVal) {
      maxSigVal = val;
      strongestSignal = sig;
    }
  }
  if (maxSigVal >= 80) {
    const strongName = sigNames[strongestSignal] || strongestSignal;
    insights.push(`${strongName} is your highest performing signal (${maxSigVal}/100), showing consistent strength.`);
  }

  // Improvement count insight
  if (metrics.improvementOpportunities > 0) {
    insights.push(`${metrics.improvementOpportunities} of your ${metrics.totalCount} saved caption analyses could benefit from AI-assisted improvement.`);
  }

  return insights.slice(0, 4);
}

// ── Comparison & Re-Analysis ────────────────────────────────────────────────

/**
 * Performs a read-only side-by-side comparison between two history records.
 * Never mutates any record, template, or profile.
 * @param {string} idA
 * @param {string} idB
 * @param {string} [customDir]
 * @returns {Object} Comparison result
 */
function compareCaptions(idA, idB, customDir) {
  if (!idA || !idB) {
    throw new Error('Both caption IDs (idA and idB) are required for comparison');
  }
  if (idA === idB) {
    throw new Error('Cannot compare a caption analysis with itself');
  }

  const recordA = getHistoryRecord(idA, customDir);
  if (!recordA) throw new Error(`Caption record A not found: ${idA}`);

  const recordB = getHistoryRecord(idB, customDir);
  if (!recordB) throw new Error(`Caption record B not found: ${idB}`);

  const scoreDiff = recordB.score - recordA.score;
  const betterOverall = scoreDiff > 0 ? 'B' : scoreDiff < 0 ? 'A' : 'EQUAL';

  const signalDiffs = {
    readability: recordB.signals.readability - recordA.signals.readability,
    relevance: recordB.signals.relevance - recordA.signals.relevance,
    clarity: recordB.signals.clarity - recordA.signals.clarity,
    cta: recordB.signals.cta - recordA.signals.cta,
    structure: recordB.signals.structure - recordA.signals.structure,
  };

  // Find strongest difference
  let strongestSignal = 'clarity';
  let maxDiffAbs = -1;
  let strongestDiffVal = 0;

  for (const [sig, diff] of Object.entries(signalDiffs)) {
    if (Math.abs(diff) > maxDiffAbs) {
      maxDiffAbs = Math.abs(diff);
      strongestSignal = sig;
      strongestDiffVal = diff;
    }
  }

  const winner = strongestDiffVal > 0 ? 'B' : strongestDiffVal < 0 ? 'A' : 'EQUAL';

  return {
    captionA: recordA,
    captionB: recordB,
    scoreDiff,
    betterOverall,
    signalDiffs,
    signalComparisons: signalDiffs,
    strongestDifference: {
      signal: strongestSignal,
      diff: strongestDiffVal,
      absDiff: maxDiffAbs,
      winner,
    },
    verdict: 'Higher quality score based on the current heuristic.',
  };
}

/**
 * Re-analyzes an existing caption record using the current quality analyzer.
 * Returns the fresh analysis result without mutating the saved history record.
 * @param {string} id
 * @param {string} [customDir]
 * @returns {Object} Re-analysis result
 */
function reanalyzeHistoryRecord(id, customDir) {
  const record = getHistoryRecord(id, customDir);
  if (!record) {
    throw new Error(`Caption record not found: ${id}`);
  }

  const freshAnalysis = analyzeCaption({
    caption: record.caption,
    topic: record.topic,
    language: record.language,
    tone: record.tone,
    platform: record.platform,
  });

  return {
    recordId: record.id,
    caption: record.caption,
    previousScore: record.score,
    previousGrade: record.grade,
    newScore: freshAnalysis.score,
    newGrade: freshAnalysis.grade,
    newSignals: freshAnalysis.signals,
    newStrengths: freshAnalysis.strengths,
    newSuggestions: freshAnalysis.suggestions,
  };
}

module.exports = {
  createHistoryRecord,
  getHistory,
  getHistoryRecord,
  deleteHistoryRecord,
  clearHistory,
  getDashboardMetrics,
  getQualityInsights,
  compareCaptions,
  reanalyzeHistoryRecord,
  validateHistoryRecordInput,
  MAX_HISTORY_LIMIT,
};
