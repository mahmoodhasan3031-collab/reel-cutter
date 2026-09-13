'use strict';

/**
 * Caption Quality Service — Phase 4B-6
 *
 * Orchestrates caption quality analysis and AI-assisted improvement.
 * Reuses the existing AI provider abstraction (Phase 4B-5) — no new provider system.
 *
 * Public API:
 *   analyzeQuality(rawPayload)          - validate + analyze a caption
 *   improveCaption(rawPayload, options) - request AI improvement via existing provider
 *   analyzeBulkQuality(bulkPayload)     - analyze quality for multiple profile captions
 */

const { analyzeCaption, MAX_CAPTION_LENGTH } = require('./captionQualityAnalyzer');
const { getActiveProvider } = require('./aiProviderAdapter');
const { validateCaptionSuggestions } = require('./aiCaptionValidator');

// Allowed values for validation
const ALLOWED_LANGUAGES = ['english', 'bangla'];
const ALLOWED_TONES = ['professional', 'casual', 'educational', 'promotional', 'storytelling'];
const ALLOWED_PLATFORMS = ['facebook', 'instagram', 'youtube', 'tiktok', 'other'];

/**
 * Validates and normalises a quality analysis payload.
 * @param {Object} raw
 * @returns {{ caption, topic, language, tone, platform, profileId }}
 */
function validateQualityPayload(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Quality analysis payload must be a valid object');
  }
  if (raw.caption === undefined || raw.caption === null || typeof raw.caption !== 'string') {
    throw new Error('caption is required and must be a string');
  }
  const caption = raw.caption.trim();
  if (caption.length === 0) throw new Error('Caption cannot be empty');
  if (caption.length > MAX_CAPTION_LENGTH) {
    throw new Error(`Caption exceeds maximum length of ${MAX_CAPTION_LENGTH} characters`);
  }

  let topic = null;
  if (raw.topic !== undefined && raw.topic !== null && raw.topic !== '') {
    if (typeof raw.topic !== 'string') throw new Error('topic must be a string');
    const t = raw.topic.trim();
    if (t.length > 500) throw new Error('topic exceeds 500 characters');
    topic = t;
  }

  let language = 'english';
  if (raw.language !== undefined && raw.language !== null && raw.language !== '') {
    const lang = String(raw.language).trim().toLowerCase();
    if (!ALLOWED_LANGUAGES.includes(lang)) throw new Error(`Invalid language "${raw.language}"`);
    language = lang;
  }

  let tone = null;
  if (raw.tone !== undefined && raw.tone !== null && raw.tone !== '') {
    const t = String(raw.tone).trim().toLowerCase();
    if (!ALLOWED_TONES.includes(t)) throw new Error(`Invalid tone "${raw.tone}"`);
    tone = t;
  }

  let platform = null;
  if (raw.platform !== undefined && raw.platform !== null && raw.platform !== '') {
    const p = String(raw.platform).trim().toLowerCase();
    if (!ALLOWED_PLATFORMS.includes(p)) throw new Error(`Invalid platform "${raw.platform}"`);
    platform = p;
  }

  let profileId = null;
  if (raw.profileId !== undefined && raw.profileId !== null && raw.profileId !== '') {
    if (typeof raw.profileId !== 'string') throw new Error('profileId must be a string');
    const pid = raw.profileId.trim();
    if (pid.length > 100) throw new Error('profileId is too long');
    profileId = pid;
  }

  return { caption, topic, language, tone, platform, profileId };
}

/**
 * Analyzes caption quality.
 *
 * @param {Object} rawPayload
 * @returns {{ success, score, grade, signals, strengths, suggestions, metadata }}
 */
function analyzeQuality(rawPayload) {
  try {
    const validated = validateQualityPayload(rawPayload);
    const result = analyzeCaption(validated);
    return {
      success: true,
      score:       result.score,
      grade:       result.grade,
      signals:     result.signals,
      strengths:   result.strengths,
      suggestions: result.suggestions,
      metadata: {
        caption:  validated.caption,
        topic:    validated.topic,
        language: validated.language,
        tone:     validated.tone,
        platform: validated.platform,
        profileId: validated.profileId,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err.message || 'Caption quality analysis failed',
      code:  err.code  || 'ANALYSIS_ERROR',
    };
  }
}

/**
 * Analyzes quality for multiple captions in a bulk payload.
 *
 * @param {Object} bulkPayload
 * @param {Array<{ caption, profileId, profileName, topic?, tone?, platform? }>} bulkPayload.entries
 * @returns {{ success, results, summary }}
 */
function analyzeBulkQuality(bulkPayload) {
  try {
    if (!bulkPayload || typeof bulkPayload !== 'object') {
      throw new Error('Bulk quality payload must be an object');
    }
    const { entries } = bulkPayload;
    if (!Array.isArray(entries) || entries.length === 0) {
      throw new Error('entries must be a non-empty array');
    }

    const results = [];
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue;
      const res = analyzeQuality(entry);
      results.push({
        profileId:   entry.profileId   || null,
        profileName: entry.profileName || 'Profile',
        caption:     entry.caption     || '',
        ...res,
      });
    }

    const scores = results.filter((r) => r.success).map((r) => r.score);
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

    return {
      success: true,
      results,
      summary: {
        totalEntries: entries.length,
        analyzed:     results.filter((r) => r.success).length,
        averageScore: avgScore,
        failed:       results.filter((r) => !r.success).length,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err.message || 'Bulk quality analysis failed',
    };
  }
}

/**
 * Requests an AI-improved version of a caption.
 * Reuses the existing AI provider from Phase 4B-5 — no new provider created.
 *
 * @param {Object} rawPayload
 * @param {Object} [options] - { provider } for test injection
 * @returns {Promise<{ success, original, originalScore, improved, improvedScore, metadata }>}
 */
async function improveCaption(rawPayload, options = {}) {
  try {
    const validated = validateQualityPayload(rawPayload);

    // Analyze original quality before improvement
    const originalResult = analyzeCaption(validated);

    // Build an improvement-specific topic string from caption if no topic provided
    const derivedTopic = validated.topic || validated.caption.slice(0, 80);

    // Build improvement request using the existing caption and quality findings
    const improvementRequest = {
      topic: `Improve this caption. Original caption: "${validated.caption}". Quality findings: ${validated.suggestions ? '' : ''} ${originalResult.suggestions.join('; ')}. Keep the same language and intent. Topic context: ${derivedTopic}`,
      language: validated.language || 'english',
      tone:     validated.tone     || 'casual',
      length:   'medium',
      platform: validated.platform || null,
      count:    3,
    };

    // Validate topic length (must stay within 500 chars for the provider)
    if (improvementRequest.topic.length > 500) {
      improvementRequest.topic = improvementRequest.topic.slice(0, 500);
    }

    const provider = options.provider || getActiveProvider();
    const rawSuggestions = await provider.generate(improvementRequest);
    const cleanSuggestions = validateCaptionSuggestions(rawSuggestions, { maxCount: 3 });

    // Use the first suggestion as the improved caption
    const improved = cleanSuggestions[0];

    // Analyze improved quality
    const improvedResult = analyzeCaption({
      caption:  improved,
      topic:    validated.topic,
      language: validated.language,
      tone:     validated.tone,
      platform: validated.platform,
    });

    return {
      success:       true,
      original:      validated.caption,
      originalScore: originalResult.score,
      improved,
      improvedScore: improvedResult.score,
      metadata: {
        topic:     validated.topic,
        language:  validated.language,
        tone:      validated.tone,
        platform:  validated.platform,
        profileId: validated.profileId,
        provider:  provider.name || 'custom',
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err.message || 'Caption improvement failed',
      code:  err.code   || 'IMPROVEMENT_ERROR',
    };
  }
}

module.exports = {
  analyzeQuality,
  improveCaption,
  analyzeBulkQuality,
};
