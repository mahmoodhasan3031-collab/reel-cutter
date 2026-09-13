'use strict';

/**
 * AI Caption Validator — Phase 4B-5
 *
 * Enforces strict validation on AI caption generation requests and provider responses.
 * Prevents prompt injection / oversized inputs and ensures all outputs conform to safe,
 * renderable text overlay constraints.
 */

const ALLOWED_LANGUAGES = ['english', 'bangla'];
const ALLOWED_TONES = ['professional', 'casual', 'educational', 'promotional', 'storytelling'];
const ALLOWED_LENGTHS = ['short', 'medium', 'long'];
const ALLOWED_PLATFORMS = ['facebook', 'instagram', 'youtube', 'tiktok', 'other'];

const LIMITS = {
  minTopicLength: 1,
  maxTopicLength: 500,
  minCount: 3,
  maxCount: 5,
  defaultCount: 3,
  maxCaptionLength: 500,
};

/**
 * Validates and normalizes an AI caption generation request.
 *
 * @param {Object} raw
 * @returns {Object} Normalized request
 */
function validateCaptionRequest(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Caption request must be a valid object');
  }

  // Topic validation
  if (raw.topic === undefined || raw.topic === null || typeof raw.topic !== 'string') {
    throw new Error('Topic / Video description is required and must be a string');
  }

  const topic = raw.topic.trim();
  if (topic.length < LIMITS.minTopicLength) {
    throw new Error('Topic / Video description cannot be empty');
  }

  if (topic.length > LIMITS.maxTopicLength) {
    throw new Error(`Topic exceeds maximum length of ${LIMITS.maxTopicLength} characters (got ${topic.length})`);
  }

  // Language validation
  let language = 'english';
  if (raw.language !== undefined && raw.language !== null) {
    if (typeof raw.language !== 'string') {
      throw new Error('Language must be a string');
    }
    const normLang = raw.language.trim().toLowerCase();
    if (!ALLOWED_LANGUAGES.includes(normLang)) {
      throw new Error(`Invalid language "${raw.language}". Allowed: ${ALLOWED_LANGUAGES.join(', ')}`);
    }
    language = normLang;
  }

  // Tone validation
  let tone = 'casual';
  if (raw.tone !== undefined && raw.tone !== null) {
    if (typeof raw.tone !== 'string') {
      throw new Error('Tone must be a string');
    }
    const normTone = raw.tone.trim().toLowerCase();
    if (!ALLOWED_TONES.includes(normTone)) {
      throw new Error(`Invalid tone "${raw.tone}". Allowed: ${ALLOWED_TONES.join(', ')}`);
    }
    tone = normTone;
  }

  // Length validation
  let length = 'medium';
  if (raw.length !== undefined && raw.length !== null) {
    if (typeof raw.length !== 'string') {
      throw new Error('Length must be a string');
    }
    const normLength = raw.length.trim().toLowerCase();
    if (!ALLOWED_LENGTHS.includes(normLength)) {
      throw new Error(`Invalid length "${raw.length}". Allowed: ${ALLOWED_LENGTHS.join(', ')}`);
    }
    length = normLength;
  }

  // Platform validation (optional)
  let platform = null;
  if (raw.platform !== undefined && raw.platform !== null && raw.platform !== '') {
    if (typeof raw.platform !== 'string') {
      throw new Error('Platform must be a string');
    }
    const normPlat = raw.platform.trim().toLowerCase();
    if (!ALLOWED_PLATFORMS.includes(normPlat)) {
      throw new Error(`Invalid platform "${raw.platform}". Allowed: ${ALLOWED_PLATFORMS.join(', ')}`);
    }
    platform = normPlat;
  }

  // Profile ID validation (optional)
  let profileId = null;
  if (raw.profileId !== undefined && raw.profileId !== null && raw.profileId !== '') {
    if (typeof raw.profileId !== 'string') {
      throw new Error('profileId must be a string');
    }
    const cleanId = raw.profileId.trim();
    if (cleanId.length > 100) {
      throw new Error('profileId is too long');
    }
    profileId = cleanId;
  }

  // Count validation (bounded 3..5, default 3)
  let count = LIMITS.defaultCount;
  if (raw.count !== undefined && raw.count !== null) {
    const num = Number(raw.count);
    if (!Number.isInteger(num) || num < LIMITS.minCount || num > LIMITS.maxCount) {
      throw new Error(`Suggestion count must be an integer between ${LIMITS.minCount} and ${LIMITS.maxCount}`);
    }
    count = num;
  }

  return {
    topic,
    language,
    tone,
    length,
    platform,
    profileId,
    count,
  };
}

/**
 * Validates caption suggestions returned by a provider before exposing to renderer.
 *
 * @param {*} rawSuggestions
 * @param {Object} [options]
 * @param {number} [options.maxCount=5]
 * @returns {string[]} Validated, sanitized suggestions
 */
function validateCaptionSuggestions(rawSuggestions, options = {}) {
  if (!Array.isArray(rawSuggestions)) {
    throw new Error('AI provider output must be an array of caption suggestions');
  }

  if (rawSuggestions.length === 0) {
    throw new Error('AI provider returned empty suggestions');
  }

  const maxCount = options.maxCount || LIMITS.maxCount;
  // Truncate/reject excess
  const listToValidate = rawSuggestions.slice(0, maxCount);

  const clean = [];
  for (let i = 0; i < listToValidate.length; i++) {
    const item = listToValidate[i];
    if (item === undefined || item === null || typeof item !== 'string') {
      throw new Error(`Caption suggestion at index ${i} must be a string`);
    }

    const trimmed = item.trim();
    if (trimmed.length === 0) {
      throw new Error(`Caption suggestion at index ${i} is empty`);
    }

    if (trimmed.length > LIMITS.maxCaptionLength) {
      throw new Error(`Caption suggestion at index ${i} exceeds ${LIMITS.maxCaptionLength} characters`);
    }

    clean.push(trimmed);
  }

  return clean;
}

module.exports = {
  ALLOWED_LANGUAGES,
  ALLOWED_TONES,
  ALLOWED_LENGTHS,
  ALLOWED_PLATFORMS,
  LIMITS,
  validateCaptionRequest,
  validateCaptionSuggestions,
};
