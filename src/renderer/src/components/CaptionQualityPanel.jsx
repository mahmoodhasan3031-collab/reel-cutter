import React, { useState, useCallback } from 'react';

/**
 * CaptionQualityPanel — Phase 4B-6
 *
 * Dark-theme modal component for Caption Quality & Intelligence.
 * Displays quality score, 5 signal bars, strengths, suggestions.
 * Supports optional "Improve Caption" flow via existing AI provider.
 *
 * Props:
 *   caption     {string}          — Current caption text to analyze
 *   topic       {string}          — Optional topic for relevance scoring
 *   tone        {string}          — Optional tone context
 *   platform    {string}          — Optional platform context
 *   profileId   {string}          — Optional profile ID for context
 *   onApply     {Function}        — Called with improved caption string
 *   onSaveTemplate {Function}     — Called with improved caption string to save as template
 *   onClose     {Function}        — Close the panel
 */
export default function CaptionQualityPanel({
  caption = '',
  topic = '',
  tone = '',
  platform = '',
  profileId = '',
  profileName = '',
  onApply,
  onSaveTemplate,
  onClose,
  onOpenDashboard,
}) {
  const [qualityResult, setQualityResult]         = useState(null);
  const [analyzing, setAnalyzing]                 = useState(false);
  const [improving, setImproving]                 = useState(false);
  const [improveResult, setImproveResult]         = useState(null);
  const [analyzeError, setAnalyzeError]           = useState(null);
  const [improveError, setImproveError]           = useState(null);
  const [savingHistory, setSavingHistory]         = useState(false);
  const [historySaved, setHistorySaved]           = useState(false);

  // ── Analyze ──────────────────────────────────────────────────────────────

  const handleAnalyze = useCallback(async () => {
    if (!caption || !caption.trim()) {
      setAnalyzeError('No caption text to analyze.');
      return;
    }
    setAnalyzing(true);
    setAnalyzeError(null);
    setImproveResult(null);
    setHistorySaved(false);
    try {
      const result = await window.api.analyzeCaptionQuality({
        caption: caption.trim(),
        topic:    topic    || undefined,
        tone:     tone     || undefined,
        platform: platform || undefined,
        profileId: profileId || undefined,
      });
      if (result.success) {
        setQualityResult(result);
      } else {
        setAnalyzeError(result.error || 'Analysis failed.');
      }
    } catch (err) {
      setAnalyzeError(err.message || 'Analysis error.');
    } finally {
      setAnalyzing(false);
    }
  }, [caption, topic, tone, platform, profileId]);

  // ── Save to History ───────────────────────────────────────────────────────

  const handleSaveToHistory = useCallback(async () => {
    if (!qualityResult || !window.api?.saveCaptionHistory) return;
    setSavingHistory(true);
    try {
      const res = await window.api.saveCaptionHistory({
        caption: caption.trim(),
        topic: topic || undefined,
        tone: tone || undefined,
        platform: platform || undefined,
        profileId: profileId || undefined,
        profileName: profileName || undefined,
        score: qualityResult.score,
        grade: qualityResult.grade,
        signals: qualityResult.signals,
        strengths: qualityResult.strengths,
        suggestions: qualityResult.suggestions,
      });
      if (res && res.success) {
        setHistorySaved(true);
      } else {
        setAnalyzeError(res?.error || 'Failed to save analysis');
      }
    } catch (err) {
      setAnalyzeError(err.message || 'Failed to save history.');
    } finally {
      setSavingHistory(false);
    }
  }, [qualityResult, caption, topic, tone, platform, profileId, profileName]);

  // ── Improve ──────────────────────────────────────────────────────────────

  const handleImprove = useCallback(async () => {
    if (!caption || !caption.trim()) {
      setImproveError('No caption text to improve.');
      return;
    }
    setImproving(true);
    setImproveError(null);
    setImproveResult(null);
    try {
      const result = await window.api.improveCaptionQuality({
        caption: caption.trim(),
        topic:    topic    || undefined,
        tone:     tone     || undefined,
        platform: platform || undefined,
        profileId: profileId || undefined,
      });
      if (result.success) {
        setImproveResult(result);
      } else {
        setImproveError(result.error || 'Improvement failed.');
      }
    } catch (err) {
      setImproveError(err.message || 'Improvement error.');
    } finally {
      setImproving(false);
    }
  }, [caption, topic, tone, platform, profileId]);

  // ── Apply Improved Caption ────────────────────────────────────────────────

  const handleUseImproved = useCallback(() => {
    if (improveResult && improveResult.improved) {
      if (onApply) onApply(improveResult.improved);
      onClose && onClose();
    }
  }, [improveResult, onApply, onClose]);

  const handleKeepOriginal = useCallback(() => {
    setImproveResult(null);
  }, []);

  const handleSaveAsTemplate = useCallback(() => {
    if (improveResult && improveResult.improved) {
      if (onSaveTemplate) onSaveTemplate(improveResult.improved);
    }
  }, [improveResult, onSaveTemplate]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function gradeColor(grade) {
    if (grade === 'A') return '#22c55e';   // green
    if (grade === 'B') return '#84cc16';   // lime
    if (grade === 'C') return '#eab308';   // yellow
    if (grade === 'D') return '#f97316';   // orange
    return '#ef4444';                       // red (F)
  }

  function scoreBarColor(score) {
    if (score >= 80) return '#22c55e';
    if (score >= 65) return '#84cc16';
    if (score >= 50) return '#eab308';
    return '#ef4444';
  }

  function SignalBar({ label, score }) {
    const color = scoreBarColor(score);
    return (
      <div className="mb-2">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-gray-300">{label}</span>
          <span style={{ color }} className="font-semibold">{score}</span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-1.5">
          <div
            className="h-1.5 rounded-full transition-all duration-500"
            style={{ width: `${score}%`, backgroundColor: color }}
          />
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" role="dialog" aria-modal="true">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-white font-bold text-lg flex items-center gap-2">
            📊 Caption Quality
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Caption preview */}
        <div className="bg-gray-800 rounded-lg p-3">
          <p className="text-gray-400 text-xs mb-1 font-medium uppercase tracking-wide">Caption</p>
          <p className="text-gray-200 text-sm whitespace-pre-wrap break-words line-clamp-4">
            {caption || <span className="text-gray-500 italic">No caption</span>}
          </p>
        </div>

        {/* Note about heuristic */}
        <p className="text-gray-500 text-xs">
          Quality score is a content heuristic — not a clinical or academic measure.
        </p>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleAnalyze}
            disabled={analyzing || !caption?.trim()}
            className="flex-1 py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
          >
            {analyzing ? 'Analyzing…' : '🔍 Analyze Caption'}
          </button>
          <button
            onClick={handleImprove}
            disabled={improving || !caption?.trim()}
            className="flex-1 py-2 px-3 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
          >
            {improving ? 'Improving…' : '✨ Improve Caption'}
          </button>
        </div>

        {/* Analysis error */}
        {analyzeError && (
          <div className="bg-red-900/40 border border-red-700 rounded-lg p-3 text-red-300 text-sm">
            {analyzeError}
          </div>
        )}

        {/* Quality Result */}
        {qualityResult && !improveResult && (
          <div className="flex flex-col gap-4">
            {/* Score circle */}
            <div className="flex items-center justify-center flex-col gap-1">
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center border-4 font-bold text-2xl"
                style={{ borderColor: gradeColor(qualityResult.grade), color: gradeColor(qualityResult.grade) }}
              >
                {qualityResult.score}
              </div>
              <span className="text-gray-400 text-xs">out of 100</span>
              <span
                className="text-lg font-bold"
                style={{ color: gradeColor(qualityResult.grade) }}
              >
                Grade {qualityResult.grade}
              </span>
            </div>

            {/* Signal bars */}
            <div className="bg-gray-800 rounded-lg p-4">
              <p className="text-gray-400 text-xs font-medium uppercase tracking-wide mb-3">Signal Breakdown</p>
              <SignalBar label="Readability"  score={qualityResult.signals.readability} />
              <SignalBar label="Relevance"    score={qualityResult.signals.relevance}   />
              <SignalBar label="Clarity"      score={qualityResult.signals.clarity}     />
              <SignalBar label="CTA Quality"  score={qualityResult.signals.cta}         />
              <SignalBar label="Structure"    score={qualityResult.signals.structure}   />
            </div>

            {/* Strengths */}
            {qualityResult.strengths && qualityResult.strengths.length > 0 && (
              <div className="bg-gray-800 rounded-lg p-4">
                <p className="text-gray-400 text-xs font-medium uppercase tracking-wide mb-2">Strengths</p>
                <ul className="space-y-1">
                  {qualityResult.strengths.map((s, i) => (
                    <li key={i} className="text-green-400 text-sm flex items-start gap-2">
                      <span>✓</span><span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Suggestions */}
            {qualityResult.suggestions && qualityResult.suggestions.length > 0 && (
              <div className="bg-gray-800 rounded-lg p-4">
                <p className="text-gray-400 text-xs font-medium uppercase tracking-wide mb-2">Suggestions</p>
                <ul className="space-y-1">
                  {qualityResult.suggestions.map((s, i) => (
                    <li key={i} className="text-yellow-300 text-sm flex items-start gap-2">
                      <span>•</span><span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {/* Save to History */}
            <div className="pt-2">
              <button
                onClick={handleSaveToHistory}
                disabled={savingHistory || historySaved}
                className={`w-full py-2 px-3 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                  historySaved
                    ? 'bg-green-800/60 text-green-300 border border-green-700/60 cursor-default'
                    : 'bg-gray-800 hover:bg-gray-750 text-gray-200 border border-gray-600'
                }`}
              >
                <span>{historySaved ? '✓' : '💾'}</span>
                {historySaved ? 'Saved to Quality History' : savingHistory ? 'Saving to History…' : 'Save Analysis to History'}
              </button>
            </div>
          </div>
        )}

        {/* Improve error */}
        {improveError && (
          <div className="bg-red-900/40 border border-red-700 rounded-lg p-3 text-red-300 text-sm">
            {improveError}
          </div>
        )}

        {/* Improved Caption Preview */}
        {improveResult && (
          <div className="flex flex-col gap-3">
            <div className="bg-gray-800 rounded-lg p-4">
              <p className="text-gray-400 text-xs font-medium uppercase tracking-wide mb-2">Original Caption</p>
              <p className="text-gray-300 text-sm whitespace-pre-wrap break-words">
                {improveResult.original}
              </p>
              <p className="text-gray-500 text-xs mt-2">
                Quality score: <span className="text-white font-semibold">{improveResult.originalScore}</span>
              </p>
            </div>

            <div className="bg-gray-800 border border-purple-700 rounded-lg p-4">
              <p className="text-purple-400 text-xs font-medium uppercase tracking-wide mb-2">Improved Caption</p>
              <p className="text-gray-100 text-sm whitespace-pre-wrap break-words">
                {improveResult.improved}
              </p>
              <p className="text-gray-500 text-xs mt-2">
                Quality score: <span className="text-green-400 font-semibold">{improveResult.improvedScore}</span>
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleKeepOriginal}
                className="flex-1 py-2 px-3 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium transition-colors"
              >
                Keep Original
              </button>
              <button
                onClick={handleUseImproved}
                className="flex-1 py-2 px-3 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors"
              >
                Use Improved
              </button>
            </div>
            {onSaveTemplate && (
              <button
                onClick={handleSaveAsTemplate}
                className="w-full py-2 px-3 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm font-medium transition-colors border border-gray-600"
              >
                💾 Save as Template
              </button>
            )}
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex gap-2 mt-2">
          {onOpenDashboard && (
            <button
              onClick={() => {
                onClose();
                onOpenDashboard();
              }}
              className="flex-1 py-2 px-3 rounded-lg bg-blue-900/40 hover:bg-blue-800/60 border border-blue-700 text-blue-300 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
            >
              <span>📈</span> Intelligence Dashboard
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 py-2 px-3 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
