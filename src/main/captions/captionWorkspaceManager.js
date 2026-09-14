'use strict';

/**
 * Caption Workspace & Smart Rewrite Manager — Phase 4B-8
 *
 * Implements a unified caption workspace with:
 * - Immutable version history and version selection
 * - 7 Smart Rewrite modes (clearer, shorter, professional, casual, promotional, better_hook, stronger_cta)
 * - Reuse of existing AI provider abstraction (MockAiProvider & HttpAiProvider)
 * - Quality score integration & "Improve Using Quality Feedback" loop
 * - Read-only version comparison
 * - Bulk smart rewrite with snapshot isolation
 * - Integrations with Text Overlay, Caption Templates, and Caption History
 */

const { analyzeCaption, MAX_CAPTION_LENGTH } = require('./captionQualityAnalyzer');
const { getActiveProvider, MockAiProvider, HttpAiProvider } = require('./aiProviderAdapter');
const { validateCaptionSuggestions } = require('./aiCaptionValidator');
const { applyCaptionToOverlays } = require('./aiCaptionService');
const { createCaptionTemplate } = require('./captionTemplateManager');
const { createHistoryRecord } = require('./captionHistoryManager');

// ── Constants & Limits ───────────────────────────────────────────────────────

const ALLOWED_REWRITE_MODES = [
  'clearer',
  'shorter',
  'professional',
  'casual',
  'promotional',
  'better_hook',
  'stronger_cta',
];

const ALLOWED_LANGUAGES = ['english', 'bangla'];
const ALLOWED_TONES = ['professional', 'casual', 'educational', 'promotional', 'storytelling'];
const ALLOWED_LENGTHS = ['short', 'medium', 'long'];
const ALLOWED_PLATFORMS = ['facebook', 'instagram', 'youtube', 'tiktok', 'other'];
const ALLOWED_SOURCES = ['original', 'manual', 'ai', 'improved', 'rewrite'];

const LIMITS = {
  maxCaptionLength: MAX_CAPTION_LENGTH || 500,
  maxTopicLength: 500,
  minSuggestions: 1,
  maxSuggestions: 5,
  defaultSuggestions: 3,
};

// ── Workspace Model & Versioning ────────────────────────────────────────────

/**
 * Creates a new validated caption workspace.
 *
 * @param {Object} initialData
 * @param {string} initialData.caption - Initial/draft caption text
 * @param {string} [initialData.topic]
 * @param {string} [initialData.language='english']
 * @param {string} [initialData.tone='casual']
 * @param {string} [initialData.length='medium']
 * @param {string} [initialData.platform]
 * @param {string} [initialData.profileId]
 * @param {string} [initialData.profileName]
 * @param {Object} [initialData.qualityResult]
 * @returns {Object} Validated workspace object
 */
function createWorkspace(initialData = {}) {
  if (!initialData || typeof initialData !== 'object' || Array.isArray(initialData)) {
    throw new Error('Workspace initial data must be an object');
  }

  const rawCaption = initialData.currentCaption || initialData.caption;
  if (rawCaption === undefined || rawCaption === null || typeof rawCaption !== 'string') {
    throw new Error('Caption is required and must be a string');
  }

  const caption = rawCaption.trim();
  if (caption.length === 0) {
    throw new Error('Caption cannot be empty');
  }
  if (caption.length > LIMITS.maxCaptionLength) {
    throw new Error(`Caption exceeds maximum length of ${LIMITS.maxCaptionLength} characters (got ${caption.length})`);
  }

  let topic = null;
  if (initialData.topic !== undefined && initialData.topic !== null && initialData.topic !== '') {
    if (typeof initialData.topic !== 'string') throw new Error('Topic must be a string');
    const t = initialData.topic.trim();
    if (t.length > LIMITS.maxTopicLength) throw new Error(`Topic exceeds ${LIMITS.maxTopicLength} characters`);
    topic = t;
  }

  let language = 'english';
  if (initialData.language !== undefined && initialData.language !== null && initialData.language !== '') {
    const l = String(initialData.language).trim().toLowerCase();
    if (!ALLOWED_LANGUAGES.includes(l)) throw new Error(`Invalid language "${initialData.language}". Allowed: ${ALLOWED_LANGUAGES.join(', ')}`);
    language = l;
  }

  let tone = 'casual';
  if (initialData.tone !== undefined && initialData.tone !== null && initialData.tone !== '') {
    const t = String(initialData.tone).trim().toLowerCase();
    if (!ALLOWED_TONES.includes(t)) throw new Error(`Invalid tone "${initialData.tone}". Allowed: ${ALLOWED_TONES.join(', ')}`);
    tone = t;
  }

  let length = 'medium';
  if (initialData.length !== undefined && initialData.length !== null && initialData.length !== '') {
    const len = String(initialData.length).trim().toLowerCase();
    if (!ALLOWED_LENGTHS.includes(len)) throw new Error(`Invalid length "${initialData.length}". Allowed: ${ALLOWED_LENGTHS.join(', ')}`);
    length = len;
  }

  let platform = null;
  if (initialData.platform !== undefined && initialData.platform !== null && initialData.platform !== '') {
    const p = String(initialData.platform).trim().toLowerCase();
    if (!ALLOWED_PLATFORMS.includes(p)) throw new Error(`Invalid platform "${initialData.platform}". Allowed: ${ALLOWED_PLATFORMS.join(', ')}`);
    platform = p;
  }

  let profileId = null;
  if (initialData.profileId && typeof initialData.profileId === 'string') {
    profileId = initialData.profileId.trim();
  }

  let profileName = null;
  if (initialData.profileName && typeof initialData.profileName === 'string') {
    profileName = initialData.profileName.trim();
  }

  // Initial quality analysis if not pre-computed
  let qualityResult = initialData.qualityResult || null;
  if (!qualityResult) {
    try {
      qualityResult = analyzeCaption({
        caption,
        topic,
        language,
        tone,
        platform,
      });
    } catch (_) {
      qualityResult = null;
    }
  }

  const now = new Date().toISOString();
  const workspaceId = `cws_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const initialVersionId = `v_orig_${Date.now()}`;

  const initialVersion = {
    id: initialVersionId,
    text: caption,
    source: 'original',
    mode: null,
    qualityResult: qualityResult ? JSON.parse(JSON.stringify(qualityResult)) : null,
    createdAt: now,
  };

  const workspace = {
    id: workspaceId,
    originalCaption: caption,
    currentCaption: caption,
    topic,
    language,
    tone,
    length,
    platform,
    profileId,
    profileName,
    qualityResult: qualityResult ? JSON.parse(JSON.stringify(qualityResult)) : null,
    versions: [initialVersion],
    selectedVersionId: initialVersionId,
    createdAt: now,
    updatedAt: now,
  };

  return JSON.parse(JSON.stringify(workspace));
}

/**
 * Validates a workspace object.
 *
 * @param {Object} workspace
 * @returns {boolean}
 */
function validateWorkspace(workspace) {
  if (!workspace || typeof workspace !== 'object' || Array.isArray(workspace)) {
    throw new Error('Workspace must be a valid object');
  }
  if (!workspace.id || typeof workspace.id !== 'string') {
    throw new Error('Workspace id is required and must be a string');
  }
  if (!workspace.currentCaption || typeof workspace.currentCaption !== 'string') {
    throw new Error('Workspace currentCaption is required and must be a string');
  }
  if (!Array.isArray(workspace.versions) || workspace.versions.length === 0) {
    throw new Error('Workspace must have at least one version in versions array');
  }
  if (!workspace.selectedVersionId || typeof workspace.selectedVersionId !== 'string') {
    throw new Error('Workspace selectedVersionId is required and must be a string');
  }
  const exists = workspace.versions.some((v) => v.id === workspace.selectedVersionId);
  if (!exists) {
    throw new Error(`selectedVersionId "${workspace.selectedVersionId}" does not exist in versions list`);
  }
  return true;
}

/**
 * Adds an immutable new version to the workspace without mutating previous versions.
 *
 * @param {Object} workspace - Current workspace object
 * @param {Object} versionData - { text, source, mode?, qualityResult? }
 * @returns {Object} Deep-cloned workspace with new version appended
 */
function addVersion(workspace, versionData = {}) {
  validateWorkspace(workspace);

  if (!versionData || typeof versionData !== 'object') {
    throw new Error('versionData must be an object');
  }
  if (!versionData.text || typeof versionData.text !== 'string') {
    throw new Error('Version text is required and must be a string');
  }
  const text = versionData.text.trim();
  if (text.length === 0) {
    throw new Error('Version text cannot be empty');
  }
  if (text.length > LIMITS.maxCaptionLength) {
    throw new Error(`Version text exceeds ${LIMITS.maxCaptionLength} characters`);
  }

  const source = versionData.source || 'manual';
  if (!ALLOWED_SOURCES.includes(source)) {
    throw new Error(`Invalid version source "${source}". Allowed: ${ALLOWED_SOURCES.join(', ')}`);
  }

  let qualityResult = versionData.qualityResult || null;
  if (!qualityResult) {
    try {
      qualityResult = analyzeCaption({
        caption: text,
        topic: workspace.topic,
        language: workspace.language,
        tone: workspace.tone,
        platform: workspace.platform,
      });
    } catch (_) {
      qualityResult = null;
    }
  }

  const now = new Date().toISOString();
  const newVersionId = `v_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const newVersion = {
    id: newVersionId,
    text,
    source,
    mode: versionData.mode || null,
    qualityResult: qualityResult ? JSON.parse(JSON.stringify(qualityResult)) : null,
    createdAt: now,
  };

  const cloned = JSON.parse(JSON.stringify(workspace));
  cloned.versions.push(newVersion);
  cloned.currentCaption = text;
  cloned.selectedVersionId = newVersionId;
  cloned.qualityResult = qualityResult ? JSON.parse(JSON.stringify(qualityResult)) : null;
  cloned.updatedAt = now;

  return cloned;
}

/**
 * Selects a version from history and sets it as current caption.
 * Existing versions remain intact and unmutated.
 *
 * @param {Object} workspace
 * @param {string} versionId
 * @returns {Object} Deep-cloned workspace with selected version active
 */
function selectVersion(workspace, versionId) {
  validateWorkspace(workspace);

  if (!versionId || typeof versionId !== 'string') {
    throw new Error('versionId is required and must be a string');
  }

  const targetVersion = workspace.versions.find((v) => v.id === versionId);
  if (!targetVersion) {
    throw new Error(`Version not found: ${versionId}`);
  }

  const cloned = JSON.parse(JSON.stringify(workspace));
  cloned.currentCaption = targetVersion.text;
  cloned.selectedVersionId = targetVersion.id;
  cloned.qualityResult = targetVersion.qualityResult ? JSON.parse(JSON.stringify(targetVersion.qualityResult)) : null;
  cloned.updatedAt = new Date().toISOString();

  return cloned;
}

/**
 * Updates current caption text, optionally saving a manual version.
 *
 * @param {Object} workspace
 * @param {string} newText
 * @param {Object} [options]
 * @param {boolean} [options.saveVersion=false]
 * @returns {Object} Deep-cloned workspace
 */
function updateCurrentCaption(workspace, newText, options = {}) {
  validateWorkspace(workspace);

  if (typeof newText !== 'string') {
    throw new Error('Caption text must be a string');
  }
  const text = newText.trim();
  if (text.length === 0) {
    throw new Error('Caption cannot be empty');
  }
  if (text.length > LIMITS.maxCaptionLength) {
    throw new Error(`Caption exceeds ${LIMITS.maxCaptionLength} characters`);
  }

  let qualityResult = null;
  try {
    qualityResult = analyzeCaption({
      caption: text,
      topic: workspace.topic,
      language: workspace.language,
      tone: workspace.tone,
      platform: workspace.platform,
    });
  } catch (_) {
    qualityResult = null;
  }

  let cloned = JSON.parse(JSON.stringify(workspace));
  cloned.currentCaption = text;
  cloned.qualityResult = qualityResult;
  cloned.updatedAt = new Date().toISOString();

  if (options.saveVersion) {
    cloned = addVersion(cloned, {
      text,
      source: 'manual',
      qualityResult,
    });
  }

  return cloned;
}

// ── Smart Rewrite Validation & Execution ────────────────────────────────────

/**
 * Validates a smart rewrite request.
 *
 * @param {Object} raw
 * @returns {Object} Normalized request
 */
function validateRewriteRequest(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Rewrite request must be a valid object');
  }

  if (raw.caption === undefined || raw.caption === null || typeof raw.caption !== 'string') {
    throw new Error('Caption is required and must be a string');
  }
  const caption = raw.caption.trim();
  if (caption.length === 0) {
    throw new Error('Caption cannot be empty');
  }
  if (caption.length > LIMITS.maxCaptionLength) {
    throw new Error(`Caption exceeds maximum length of ${LIMITS.maxCaptionLength} characters`);
  }

  if (!raw.mode || typeof raw.mode !== 'string') {
    throw new Error('Rewrite mode is required and must be a string');
  }
  const mode = raw.mode.trim().toLowerCase();
  if (!ALLOWED_REWRITE_MODES.includes(mode)) {
    throw new Error(`Invalid rewrite mode "${raw.mode}". Allowed modes: ${ALLOWED_REWRITE_MODES.join(', ')}`);
  }

  let language = 'english';
  if (raw.language !== undefined && raw.language !== null && raw.language !== '') {
    const l = String(raw.language).trim().toLowerCase();
    if (!ALLOWED_LANGUAGES.includes(l)) {
      throw new Error(`Invalid language "${raw.language}". Allowed: ${ALLOWED_LANGUAGES.join(', ')}`);
    }
    language = l;
  }

  let tone = 'casual';
  if (raw.tone !== undefined && raw.tone !== null && raw.tone !== '') {
    const t = String(raw.tone).trim().toLowerCase();
    if (!ALLOWED_TONES.includes(t)) {
      throw new Error(`Invalid tone "${raw.tone}". Allowed: ${ALLOWED_TONES.join(', ')}`);
    }
    tone = t;
  }

  let length = 'medium';
  if (raw.length !== undefined && raw.length !== null && raw.length !== '') {
    const len = String(raw.length).trim().toLowerCase();
    if (!ALLOWED_LENGTHS.includes(len)) {
      throw new Error(`Invalid length "${raw.length}". Allowed: ${ALLOWED_LENGTHS.join(', ')}`);
    }
    length = len;
  }

  let platform = null;
  if (raw.platform !== undefined && raw.platform !== null && raw.platform !== '') {
    const p = String(raw.platform).trim().toLowerCase();
    if (!ALLOWED_PLATFORMS.includes(p)) {
      throw new Error(`Invalid platform "${raw.platform}". Allowed: ${ALLOWED_PLATFORMS.join(', ')}`);
    }
    platform = p;
  }

  let topic = null;
  if (raw.topic !== undefined && raw.topic !== null && raw.topic !== '') {
    if (typeof raw.topic !== 'string') throw new Error('Topic must be a string');
    const t = raw.topic.trim();
    if (t.length > LIMITS.maxTopicLength) throw new Error(`Topic exceeds ${LIMITS.maxTopicLength} characters`);
    topic = t;
  }

  let count = LIMITS.defaultSuggestions;
  if (raw.count !== undefined && raw.count !== null) {
    const num = Number(raw.count);
    if (!Number.isInteger(num) || num < LIMITS.minSuggestions || num > LIMITS.maxSuggestions) {
      throw new Error(`Suggestion count must be an integer between ${LIMITS.minSuggestions} and ${LIMITS.maxSuggestions}`);
    }
    count = num;
  }

  let profileId = null;
  if (raw.profileId && typeof raw.profileId === 'string') {
    profileId = raw.profileId.trim();
  }

  let profileName = null;
  if (raw.profileName && typeof raw.profileName === 'string') {
    profileName = raw.profileName.trim();
  }

  let qualityFeedback = [];
  if (Array.isArray(raw.qualityFeedback)) {
    qualityFeedback = raw.qualityFeedback.filter((f) => typeof f === 'string' && f.trim());
  }

  return {
    caption,
    mode,
    language,
    tone,
    length,
    platform,
    topic,
    count,
    profileId,
    profileName,
    qualityFeedback,
  };
}

/**
 * Generates smart rewrites for a caption using the active AI provider.
 * Each suggestion is validated and scored using the quality analyzer.
 *
 * @param {Object} rawRequest
 * @param {Object} [options] - { provider } for test injection
 * @returns {Promise<Object>}
 */
async function generateSmartRewrites(rawRequest, options = {}) {
  try {
    const validated = validateRewriteRequest(rawRequest);
    const provider = options.provider || getActiveProvider();

    // Analyze original caption quality
    const originalAnalysis = analyzeCaption({
      caption: validated.caption,
      topic: validated.topic,
      language: validated.language,
      tone: validated.tone,
      platform: validated.platform,
    });

    // Invoke provider rewrite method (or fallback to generate)
    let rawSuggestions;
    if (typeof provider.rewrite === 'function') {
      rawSuggestions = await provider.rewrite(validated);
    } else if (typeof provider.generate === 'function') {
      rawSuggestions = await provider.generate(validated);
    } else {
      throw new Error('Provider must implement rewrite() or generate() method');
    }

    // Validate provider suggestions
    const cleanSuggestions = validateCaptionSuggestions(rawSuggestions, {
      maxCount: validated.count,
    });

    // Score each suggestion
    const scoredSuggestions = cleanSuggestions.map((text, idx) => {
      const analysis = analyzeCaption({
        caption: text,
        topic: validated.topic,
        language: validated.language,
        tone: validated.tone,
        platform: validated.platform,
      });
      return {
        id: `sug_${idx + 1}_${Date.now()}`,
        text,
        score: analysis.score,
        grade: analysis.grade,
        signals: analysis.signals,
        strengths: analysis.strengths,
        suggestions: analysis.suggestions,
        analysis,
      };
    });

    return {
      success: true,
      mode: validated.mode,
      original: validated.caption,
      originalScore: originalAnalysis.score,
      originalGrade: originalAnalysis.grade,
      originalAnalysis,
      suggestions: scoredSuggestions,
      metadata: {
        mode: validated.mode,
        topic: validated.topic,
        language: validated.language,
        tone: validated.tone,
        length: validated.length,
        platform: validated.platform,
        profileId: validated.profileId,
        count: scoredSuggestions.length,
        provider: provider.name || 'custom',
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err.message || 'Smart rewrite generation failed',
      code: err.code || 'REWRITE_ERROR',
    };
  }
}

/**
 * Smart Rewrite + Quality Feedback loop.
 * Analyzes caption, extracts weakest signals and suggestions,
 * passes quality context to rewrite engine, and returns before/after.
 *
 * @param {Object} rawRequest
 * @param {Object} [options]
 * @returns {Promise<Object>}
 */
async function rewriteWithQualityFeedback(rawRequest, options = {}) {
  try {
    const caption = typeof rawRequest?.caption === 'string' ? rawRequest.caption.trim() : '';
    if (!caption) throw new Error('Caption cannot be empty');

    // Step 1: Analyze current caption
    const analysis = analyzeCaption({
      caption,
      topic: rawRequest.topic,
      language: rawRequest.language,
      tone: rawRequest.tone,
      platform: rawRequest.platform,
    });

    // Step 2: Determine weakest signal
    let weakestSignal = 'clarity';
    let minVal = 101;
    for (const [sig, val] of Object.entries(analysis.signals)) {
      if (val < minVal) {
        minVal = val;
        weakestSignal = sig;
      }
    }

    // Step 3: Map weakest signal to recommended rewrite mode if not explicitly chosen
    let mode = rawRequest.mode;
    if (!mode || !ALLOWED_REWRITE_MODES.includes(mode)) {
      if (weakestSignal === 'cta') mode = 'stronger_cta';
      else if (weakestSignal === 'relevance') mode = 'better_hook';
      else if (weakestSignal === 'readability') mode = 'clearer';
      else if (weakestSignal === 'structure') mode = 'clearer';
      else mode = 'clearer';
    }

    // Step 4: Run smart rewrites with feedback
    const rewriteResult = await generateSmartRewrites({
      ...rawRequest,
      mode,
      qualityFeedback: analysis.suggestions,
    }, options);

    if (!rewriteResult.success) {
      return rewriteResult;
    }

    // Determine top rewrite suggestion
    const topSuggestion = rewriteResult.suggestions[0] || null;

    return {
      success: true,
      original: caption,
      beforeScore: analysis.score,
      beforeGrade: analysis.grade,
      weakestSignal,
      recommendedMode: mode,
      originalAnalysis: analysis,
      suggestions: rewriteResult.suggestions,
      topImproved: topSuggestion ? topSuggestion.text : caption,
      afterScore: topSuggestion ? topSuggestion.score : analysis.score,
      afterGrade: topSuggestion ? topSuggestion.grade : analysis.grade,
      scoreDiff: topSuggestion ? topSuggestion.score - analysis.score : 0,
      metadata: rewriteResult.metadata,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message || 'Quality feedback rewrite failed',
      code: err.code || 'FEEDBACK_REWRITE_ERROR',
    };
  }
}

// ── Comparison ──────────────────────────────────────────────────────────────

/**
 * Performs a read-only side-by-side comparison between two versions.
 * Never mutates any version, record, or template.
 *
 * @param {Object} versionA - First version or { text, qualityResult? }
 * @param {Object} versionB - Second version or { text, qualityResult? }
 * @returns {Object} Read-only comparison result
 */
function compareWorkspaceVersions(versionA, versionB) {
  if (!versionA || typeof versionA !== 'object') {
    throw new Error('Version A must be a valid object');
  }
  if (!versionB || typeof versionB !== 'object') {
    throw new Error('Version B must be a valid object');
  }

  const textA = (versionA.text || versionA.caption || '').trim();
  const textB = (versionB.text || versionB.caption || '').trim();

  if (!textA) throw new Error('Version A has no caption text');
  if (!textB) throw new Error('Version B has no caption text');

  const analysisA = versionA.qualityResult || analyzeCaption({ caption: textA });
  const analysisB = versionB.qualityResult || analyzeCaption({ caption: textB });

  const scoreDiff = analysisB.score - analysisA.score;
  const winner = scoreDiff > 0 ? 'B' : scoreDiff < 0 ? 'A' : 'EQUAL';

  const signalDiffs = {
    readability: analysisB.signals.readability - analysisA.signals.readability,
    relevance: analysisB.signals.relevance - analysisA.signals.relevance,
    clarity: analysisB.signals.clarity - analysisA.signals.clarity,
    cta: analysisB.signals.cta - analysisA.signals.cta,
    structure: analysisB.signals.structure - analysisA.signals.structure,
  };

  let strongestSignal = 'clarity';
  let maxAbsDiff = -1;
  let strongestVal = 0;
  for (const [sig, diff] of Object.entries(signalDiffs)) {
    if (Math.abs(diff) > maxAbsDiff) {
      maxAbsDiff = Math.abs(diff);
      strongestSignal = sig;
      strongestVal = diff;
    }
  }

  const verdict = winner === 'EQUAL'
    ? 'Both caption versions demonstrate equal overall quality under the current heuristic.'
    : `Higher quality score according to the current heuristic (${winner === 'B' ? 'Version B' : 'Version A'} leads by ${Math.abs(scoreDiff)} point(s)).`;

  return {
    versionA: {
      id: versionA.id || 'A',
      text: textA,
      score: analysisA.score,
      grade: analysisA.grade,
      signals: analysisA.signals,
    },
    versionB: {
      id: versionB.id || 'B',
      text: textB,
      score: analysisB.score,
      grade: analysisB.grade,
      signals: analysisB.signals,
    },
    scoreDiff,
    winner,
    betterOverall: winner,
    signalDiffs,
    signalComparisons: signalDiffs,
    strongestDifference: {
      signal: strongestSignal,
      diff: strongestVal,
      winner: strongestVal > 0 ? 'B' : strongestVal < 0 ? 'A' : 'EQUAL',
    },
    verdict,
  };
}

// ── Bulk Smart Rewrite ──────────────────────────────────────────────────────

/**
 * Bulk smart rewrite for multi-profile workflows with snapshot isolation.
 *
 * @param {Object} bulkInput
 * @param {Array<{ profileId, profileName, platform?, caption, mode? }>} bulkInput.entries
 * @param {string} [bulkInput.defaultMode='clearer']
 * @param {Object} [options]
 * @returns {Promise<Object>}
 */
async function bulkSmartRewrite(bulkInput = {}, options = {}) {
  try {
    if (!bulkInput || typeof bulkInput !== 'object') {
      throw new Error('Bulk smart rewrite input must be an object');
    }

    const items = bulkInput.entries || bulkInput.items || (Array.isArray(bulkInput) ? bulkInput : []);
    const defaultMode = bulkInput.defaultMode || 'clearer';
    if (!Array.isArray(items) || items.length === 0) {
      return {
        success: true,
        results: [],
        summary: {
          totalEntries: 0,
          processed: 0,
        },
      };
    }

    // Snapshot isolation: deep clone upfront
    const isolatedEntries = JSON.parse(JSON.stringify(items));
    const results = [];

    for (const item of isolatedEntries) {
      if (!item || typeof item !== 'object') continue;
      const caption = item.caption || item.currentCaption || '';
      if (!caption.trim()) continue;

      const mode = item.mode || defaultMode;
      const res = await generateSmartRewrites({
        caption,
        mode,
        platform: item.platform || null,
        topic: item.topic || null,
        language: item.language || 'english',
        tone: item.tone || 'casual',
        profileId: item.profileId || null,
        profileName: item.profileName || null,
        count: 3,
      }, options);

      if (res.success) {
        results.push({
          profileId: item.profileId || null,
          profileName: item.profileName || 'Profile',
          platform: item.platform || 'other',
          originalCaption: caption,
          mode: res.mode,
          originalScore: res.originalScore,
          originalGrade: res.originalGrade,
          suggestions: res.suggestions,
          selectedSuggestion: res.suggestions[0] || null,
        });
      }
    }

    return {
      success: true,
      results,
      summary: {
        totalEntries: isolatedEntries.length,
        processed: results.length,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err.message || 'Bulk smart rewrite failed',
    };
  }
}

// ── Integrations ────────────────────────────────────────────────────────────

/**
 * Applies a caption text to text overlays, preserving existing styling.
 *
 * @param {string} captionText
 * @param {Array<Object>} existingOverlays
 * @param {Object} [styleOverrides]
 * @returns {Array<Object>}
 */
function applyWorkspaceCaptionToOverlays(captionText, existingOverlays = [], styleOverrides = {}) {
  return applyCaptionToOverlays(captionText, existingOverlays, styleOverrides);
}

/**
 * Saves a workspace caption as a custom template in the Template Library.
 *
 * @param {Object} payload - { name, description?, overlays: [...], customDir? }
 * @param {string} [customDir]
 * @returns {Object} Created template
 */
function saveWorkspaceAsTemplate(payload, customDir) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Template payload must be an object');
  }
  return createCaptionTemplate({
    name: payload.name,
    description: payload.description || 'Saved from Caption Workspace',
    overlays: payload.overlays || [],
  }, customDir || payload.customDir);
}

/**
 * Saves a workspace caption and quality analysis to persistent history.
 *
 * @param {Object} payload - { caption, score, grade, signals, strengths, suggestions, ... }
 * @param {string} [customDir]
 * @returns {Object} Created history record
 */
function saveWorkspaceToHistory(payload, customDir) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('History payload must be an object');
  }
  return createHistoryRecord(payload, customDir || payload.customDir);
}

module.exports = {
  createWorkspace,
  validateWorkspace,
  addVersion,
  selectVersion,
  updateCurrentCaption,
  validateRewriteRequest,
  generateSmartRewrites,
  rewriteWithQualityFeedback,
  compareWorkspaceVersions,
  bulkSmartRewrite,
  applyWorkspaceCaptionToOverlays,
  saveWorkspaceAsTemplate,
  saveWorkspaceToHistory,
  ALLOWED_REWRITE_MODES,
  ALLOWED_LANGUAGES,
  ALLOWED_TONES,
  ALLOWED_LENGTHS,
  ALLOWED_PLATFORMS,
  ALLOWED_SOURCES,
  LIMITS,
};
