'use strict';

/**
 * Caption Quality Analyzer — Phase 4B-6
 *
 * Deterministic, offline quality analysis for video captions.
 * Scores 5 independent signals (each 0-100) and combines them into
 * a weighted overall score. Supports English and Bangla without crashing.
 *
 * Quality signals:
 *   readability  - sentence/word length heuristic
 *   relevance    - keyword overlap with supplied topic (neutral 70 if no topic)
 *   clarity      - repetition, filler, excessive emoji/punctuation
 *   cta          - presence/quality of call-to-action
 *   structure    - paragraph breaks, formatting, length
 *
 * Score: 0-100   Grade: A (>=90) B (>=80) C (>=70) D (>=60) F (<60)
 */

// Unicode range for Bangla characters (U+0980-U+09FF)
const BANGLA_REGEX = /[\u0980-\u09FF]/;

const MAX_CAPTION_LENGTH = 500;

// English CTA keyword patterns
const ENGLISH_CTA_PATTERNS = [
  'learn more', 'try it', 'start today', 'comment below', 'leave a comment',
  'share this', 'share with', 'follow', 'follow us', 'follow me', 'subscribe',
  'save this', 'save the', 'visit', 'check it out', 'check out', 'click',
  'tap the', 'download', 'sign up', 'get started', 'join us', 'find out',
  'read more', 'watch', 'hit the', 'drop a', 'let us know', 'tell us',
  'dm us', 'link in bio', 'swipe', 'turn on', 'notifications',
];

// Bangla CTA keyword patterns
const BANGLA_CTA_PATTERNS = [
  'জানুন', 'শেয়ার করুন', 'শেয়ার', 'ফলো', 'সাবস্ক্রাইব', 'ক্লিক',
  'কমেন্ট', 'মন্তব্য', 'ডাউনলোড', 'দেখুন', 'সেভ', 'লাইক', 'নোটিফিকেশন',
  'বেল আইকন', 'পাশে থাকুন', 'বন্ধুদের', 'সাবস্ক্রাইব করুন', 'জানান',
];

// English filler phrases to penalise
const ENGLISH_FILLERS = [
  'basically', 'literally', 'actually', 'you know', 'kind of', 'sort of',
  'like,', 'just saying', 'honestly', 'so yeah', 'i mean',
];

// Signal weights (must sum to 1.0)
const SIGNAL_WEIGHTS = {
  readability: 0.20,
  relevance:   0.20,
  clarity:     0.20,
  cta:         0.20,
  structure:   0.20,
};

// Helpers
function isBangla(text) { return BANGLA_REGEX.test(text); }
function clamp(n, min = 0, max = 100) { return Math.max(min, Math.min(max, Math.round(n))); }

function splitSentences(text) {
  return text.split(/(?<=[.!?।])\s+/).filter((s) => s.trim().length > 0);
}
function splitWords(text) {
  return text.trim().split(/\s+/).filter((w) => w.length > 0);
}
function countEmojis(text) {
  const emojiRegex = /[\u{1F300}-\u{1FFFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
  return (text.match(emojiRegex) || []).length;
}
function countRepetitions(words) {
  const freq = {};
  for (const w of words) {
    const lw = w.toLowerCase().replace(/[^a-z0-9\u0980-\u09FF]/g, '');
    if (lw.length >= 3) { freq[lw] = (freq[lw] || 0) + 1; }
  }
  let excess = 0;
  for (const count of Object.values(freq)) {
    if (count > 1) { excess += (count - 1); }
  }
  return excess;
}
function gradeFromScore(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

// Signal Scorers
function scoreReadability(text) {
  const words = splitWords(text);
  if (words.length === 0) return 0;
  const bangla = isBangla(text);
  const sentences = splitSentences(text);
  const avgWordsPerSentence = words.length / Math.max(sentences.length, 1);
  let score = 100;
  if (bangla) {
    if (avgWordsPerSentence > 30) score -= 30;
    else if (avgWordsPerSentence > 20) score -= 15;
    if (words.length < 3) score -= 15;
  } else {
    if (avgWordsPerSentence > 25) score -= 30;
    else if (avgWordsPerSentence > 18) score -= 15;
    const avgCharsPerWord = words.reduce((sum, w) => sum + w.replace(/[^a-zA-Z]/g, '').length, 0) / Math.max(words.length, 1);
    if (avgCharsPerWord > 10) score -= 20;
    else if (avgCharsPerWord > 8) score -= 10;
    if (words.length < 3) score -= 20;
  }
  if (text.length > 450) score -= 15;
  else if (text.length > 350) score -= 5;
  return clamp(score);
}

function scoreRelevance(text, topic) {
  if (!topic || typeof topic !== 'string' || topic.trim().length === 0) return 70;
  const topicWords = splitWords(topic.toLowerCase()).map((w) => w.replace(/[^a-z0-9\u0980-\u09FF]/g, '')).filter((w) => w.length > 2);
  if (topicWords.length === 0) return 70;
  const captionLower = text.toLowerCase();
  const matchedWords = topicWords.filter((tw) => captionLower.includes(tw));
  const ratio = matchedWords.length / topicWords.length;
  return clamp(40 + ratio * 60);
}

function scoreClarity(text) {
  let score = 100;
  const words = splitWords(text);
  const repetitions = countRepetitions(words);
  if (repetitions > 5) score -= 25;
  else if (repetitions > 3) score -= 15;
  else if (repetitions > 1) score -= 8;
  const excessivePunct = (text.match(/[!?]{2,}/g) || []).length;
  if (excessivePunct > 3) score -= 20;
  else if (excessivePunct > 1) score -= 10;
  const emojiCount = countEmojis(text);
  if (emojiCount > 8) score -= 25;
  else if (emojiCount > 5) score -= 10;
  if (!isBangla(text)) {
    const lowerText = text.toLowerCase();
    const fillerCount = ENGLISH_FILLERS.filter((f) => lowerText.includes(f)).length;
    if (fillerCount > 2) score -= 15;
    else if (fillerCount > 0) score -= 5;
  }
  const sentences = splitSentences(text).map((s) => s.trim().toLowerCase());
  const uniqueSentences = new Set(sentences);
  if (uniqueSentences.size < sentences.length) {
    score -= (sentences.length - uniqueSentences.size) * 10;
  }
  return clamp(score);
}

function scoreCta(text, tone) {
  const lowerText = text.toLowerCase();
  const bangla = isBangla(text);
  const patterns = bangla ? BANGLA_CTA_PATTERNS : ENGLISH_CTA_PATTERNS;
  const foundPatterns = patterns.filter((p) => lowerText.includes(p.toLowerCase()));
  const hasCta = foundPatterns.length > 0;
  if (foundPatterns.length > 3) return clamp(hasCta ? 75 : 50);
  if (hasCta) return 90;
  const promotionalTones = ['promotional'];
  const neutralTones = ['educational', 'professional', 'storytelling', 'informational'];
  if (tone && promotionalTones.includes(tone.toLowerCase())) return 55;
  if (tone && neutralTones.includes(tone.toLowerCase())) return 72;
  return 68;
}

function scoreStructure(text) {
  let score = 100;
  const lines = text.split(/\n/).filter((l) => l.trim().length > 0);
  const words = splitWords(text);
  if (words.length < 3) return 30;
  if (lines.length === 1 && text.length > 200) score -= 20;
  if (lines.length > 8) score -= 15;
  if (lines.length >= 2 && lines.length <= 4 && text.length > 50) score += 5;
  if (words.length < 5) score -= 20;
  else if (words.length < 8) score -= 10;
  if (text.length > 480) score -= 20;
  else if (text.length > 380) score -= 8;
  return clamp(score);
}

// Strength / Suggestion Generators
function buildStrengths(signals, hasCta, hasGoodRelevance) {
  const strengths = [];
  if (signals.readability >= 80) strengths.push('Clear, readable sentence structure');
  if (signals.relevance   >= 80) strengths.push('Relevant to the stated topic');
  if (signals.clarity     >= 80) strengths.push('Focused message with minimal repetition');
  if (signals.cta         >= 85) strengths.push('Includes an effective call-to-action');
  if (signals.structure   >= 80) strengths.push('Well-structured format with good pacing');
  if (hasCta)                    strengths.push('Contains a clear action prompt');
  if (hasGoodRelevance)          strengths.push('Caption stays on-topic');
  return [...new Set(strengths)].slice(0, 4);
}

function buildSuggestions(signals, hasCta, tone, text) {
  const suggestions = [];
  if (signals.readability < 70) suggestions.push('Shorten sentences — aim for 10-15 words each for better readability');
  if (signals.relevance   < 60) suggestions.push('Make the caption more relevant to the video topic');
  if (signals.clarity     < 70) {
    const reps = countRepetitions(splitWords(text));
    if (reps > 2) suggestions.push('Reduce repeated words or phrases');
    if ((text.match(/[!?]{2,}/g) || []).length > 1) suggestions.push('Limit excessive exclamation or question marks');
    if (countEmojis(text) > 5) suggestions.push('Use fewer emojis — 2-3 is ideal');
  }
  if (!hasCta && tone === 'promotional') suggestions.push('Add a clear call-to-action (e.g. "Follow for more" or "Share this")');
  if (!hasCta && !tone) suggestions.push('Consider adding a call-to-action to encourage engagement');
  if (signals.structure < 70) {
    if (text.length > 200 && !text.includes('\n')) suggestions.push('Break the caption into 2-3 shorter paragraphs');
    if (splitWords(text).length < 5) suggestions.push('Expand the caption — add more context or a hook');
  }
  if (suggestions.length === 0) suggestions.push('Strong caption — consider A/B testing slight variations for best results');
  return suggestions.slice(0, 4);
}

// Public API
function analyzeCaption({ caption, topic, language, tone, platform } = {}) {
  if (typeof caption !== 'string') throw new Error('Caption must be a string');
  const text = caption.trim();
  if (text.length === 0) throw new Error('Caption cannot be empty');
  if (text.length > MAX_CAPTION_LENGTH) throw new Error(`Caption exceeds maximum length of ${MAX_CAPTION_LENGTH} characters (got ${text.length})`);

  const signals = {
    readability: scoreReadability(text),
    relevance:   scoreRelevance(text, topic),
    clarity:     scoreClarity(text),
    cta:         scoreCta(text, tone),
    structure:   scoreStructure(text),
  };

  const rawScore =
    signals.readability * SIGNAL_WEIGHTS.readability +
    signals.relevance   * SIGNAL_WEIGHTS.relevance   +
    signals.clarity     * SIGNAL_WEIGHTS.clarity     +
    signals.cta         * SIGNAL_WEIGHTS.cta         +
    signals.structure   * SIGNAL_WEIGHTS.structure;

  const score = clamp(rawScore);
  const grade = gradeFromScore(score);

  const lowerText = text.toLowerCase();
  const ctaPatterns = isBangla(text) ? BANGLA_CTA_PATTERNS : ENGLISH_CTA_PATTERNS;
  const hasCta = ctaPatterns.some((p) => lowerText.includes(p.toLowerCase()));
  const hasGoodRelevance = signals.relevance >= 75;

  const strengths   = buildStrengths(signals, hasCta, hasGoodRelevance);
  const suggestions = buildSuggestions(signals, hasCta, tone, text);

  return { score, grade, signals, strengths, suggestions };
}

module.exports = {
  analyzeCaption,
  _scoreReadability: scoreReadability,
  _scoreRelevance:   scoreRelevance,
  _scoreClarity:     scoreClarity,
  _scoreCta:         scoreCta,
  _scoreStructure:   scoreStructure,
  _gradeFromScore:   gradeFromScore,
  MAX_CAPTION_LENGTH,
};
