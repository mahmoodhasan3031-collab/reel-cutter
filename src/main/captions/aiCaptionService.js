'use strict';

/**
 * AI Caption Service — Phase 4B-5
 *
 * Orchestrates AI caption generation, validation, provider dispatch,
 * and integration with the existing text overlay and template systems.
 */

const { validateCaptionRequest, validateCaptionSuggestions } = require('./aiCaptionValidator');
const { getActiveProvider, MockAiProvider, HttpAiProvider } = require('./aiProviderAdapter');
const { createDefaultOverlay } = require('../../engine/textOverlayValidator');

/**
 * Generates caption suggestions for a single request.
 *
 * @param {Object} rawRequest
 * @param {Object} [options]
 * @returns {Promise<{ success: boolean, suggestions?: string[], metadata?: Object, error?: string, code?: string }>}
 */
async function generateCaptions(rawRequest, options = {}) {
  try {
    const validatedRequest = validateCaptionRequest(rawRequest);
    const provider = options.provider || getActiveProvider();

    const rawSuggestions = await provider.generate(validatedRequest);
    const cleanSuggestions = validateCaptionSuggestions(rawSuggestions, {
      maxCount: validatedRequest.count,
    });

    return {
      success: true,
      suggestions: cleanSuggestions,
      metadata: {
        topic: validatedRequest.topic,
        language: validatedRequest.language,
        tone: validatedRequest.tone,
        length: validatedRequest.length,
        platform: validatedRequest.platform,
        profileId: validatedRequest.profileId,
        count: cleanSuggestions.length,
        provider: provider.name || 'custom',
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err.message || 'AI caption generation failed',
      code: err.code || 'GENERATION_ERROR',
    };
  }
}

/**
 * Generates caption suggestions across multiple profiles in bulk.
 *
 * @param {Object} bulkInput
 * @param {string} bulkInput.topic
 * @param {string} [bulkInput.language]
 * @param {string} [bulkInput.tone]
 * @param {string} [bulkInput.length]
 * @param {Array<{ profileId: string, profileName: string, platform: string }>} bulkInput.profiles
 * @param {Object} [options]
 * @returns {Promise<{ success: boolean, results?: Array<Object>, error?: string }>}
 */
async function generateBulkCaptions(bulkInput = {}, options = {}) {
  try {
    if (!bulkInput || typeof bulkInput !== 'object') {
      throw new Error('Bulk caption input must be an object');
    }

    const { topic, language, tone, length, profiles } = bulkInput;
    if (!Array.isArray(profiles) || profiles.length === 0) {
      throw new Error('Profiles array must contain at least 1 profile');
    }

    const results = [];
    for (const p of profiles) {
      if (!p || typeof p !== 'object' || !p.profileId) {
        continue;
      }
      const request = {
        topic,
        language,
        tone,
        length,
        platform: p.platform || null,
        profileId: p.profileId,
        count: 3,
      };

      const res = await generateCaptions(request, options);
      if (!res.success) {
        throw new Error(`Failed generating captions for profile "${p.profileName || p.profileId}": ${res.error}`);
      }

      results.push({
        profileId: p.profileId,
        profileName: p.profileName || 'Profile',
        platform: p.platform || 'Other',
        suggestions: res.suggestions,
        selectedCaption: res.suggestions[0] || '',
      });
    }

    return {
      success: true,
      results,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message || 'Bulk AI caption generation failed',
    };
  }
}

/**
 * Applies a caption string into an existing or new textOverlays array.
 * Guaranteed deep clone and snapshot isolation.
 *
 * @param {string} captionText
 * @param {Array<Object>} [existingOverlays=[]]
 * @param {Object} [styleOverrides={}]
 * @returns {Array<Object>}
 */
function applyCaptionToOverlays(captionText, existingOverlays = [], styleOverrides = {}) {
  if (typeof captionText !== 'string' || !captionText.trim()) {
    throw new Error('Caption text cannot be empty');
  }

  const cleanText = captionText.trim();

  if (Array.isArray(existingOverlays) && existingOverlays.length > 0) {
    // Deep clone and update the first overlay's text
    const cloned = JSON.parse(JSON.stringify(existingOverlays));
    cloned[0].text = cleanText;
    cloned[0].enabled = true;
    if (Object.keys(styleOverrides).length > 0) {
      Object.assign(cloned[0], styleOverrides);
    }
    return cloned;
  }

  // Otherwise create a fresh default overlay with this caption
  const newOverlay = createDefaultOverlay({
    text: cleanText,
    ...styleOverrides,
  });
  return [newOverlay];
}

/**
 * Returns safe status about AI configuration (never leaks keys).
 *
 * @returns {{ configured: boolean, provider: string }}
 */
function getAiStatus() {
  const provider = getActiveProvider();
  let configured = true;
  if (provider instanceof HttpAiProvider) {
    configured = provider.isConfigured();
  }
  return {
    configured,
    provider: provider.name || 'mock',
  };
}

module.exports = {
  generateCaptions,
  generateBulkCaptions,
  applyCaptionToOverlays,
  getAiStatus,
};
