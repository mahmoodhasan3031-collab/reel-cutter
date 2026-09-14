import React, { useState, useEffect, useCallback } from 'react';

/**
 * CaptionIntelligenceDashboard — Phase 4B-7
 *
 * Full dashboard for Caption Quality Intelligence:
 *  - Overview: Aggregate scores, breakdown, insights, improvement opportunities
 *  - History: Filterable, searchable, sortable list of past analyses
 *  - Detail: In-depth metrics, re-analysis, AI improvement
 *  - Compare: Read-only side-by-side comparison between 2 saved analyses
 *  - Trends: Visual quality score trend over time (SVG)
 *
 * Props:
 *   isOpen: boolean
 *   onClose: Function
 *   onApplyCaption: (text: string) => void
 *   onSaveTemplate: (text: string) => void
 *   onOpenAnalyzer: () => void
 */
export default function CaptionIntelligenceDashboard({
  isOpen,
  onClose,
  onApplyCaption,
  onSaveTemplate,
  onOpenAnalyzer,
}) {
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'history' | 'compare' | 'trends'
  const [metrics, setMetrics] = useState(null);
  const [insights, setInsights] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // History filters & search
  const [search, setSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState('ALL');
  const [platformFilter, setPlatformFilter] = useState('ALL');
  const [sortOption, setSortOption] = useState('newest'); // 'newest' | 'oldest' | 'highest' | 'lowest'

  // Detail view
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [reanalyzedResult, setReanalyzedResult] = useState(null);
  const [reanalyzing, setReanalyzing] = useState(false);

  // Compare view
  const [compareIdA, setCompareIdA] = useState('');
  const [compareIdB, setCompareIdB] = useState('');
  const [comparisonResult, setComparisonResult] = useState(null);
  const [comparing, setComparing] = useState(false);

  // AI improve from dashboard/detail
  const [improving, setImproving] = useState(false);
  const [improveResult, setImproveResult] = useState(null);

  // Fetch metrics and history
  const loadDashboardData = useCallback(async () => {
    if (!window.api?.getCaptionDashboardMetrics) return;
    setLoading(true);
    setError(null);
    try {
      const res = await window.api.getCaptionDashboardMetrics();
      if (res && res.success) {
        setMetrics(res.metrics);
        setInsights(res.insights || []);
      }

      const histRes = await window.api.getCaptionHistory({
        search: search || undefined,
        grade: gradeFilter !== 'ALL' ? gradeFilter : undefined,
        platform: platformFilter !== 'ALL' ? platformFilter : undefined,
        sort: sortOption,
      });
      if (histRes && histRes.success) {
        setHistory(histRes.history || []);
      }
    } catch (err) {
      setError(err.message || 'Failed loading dashboard data');
    } finally {
      setLoading(false);
    }
  }, [search, gradeFilter, platformFilter, sortOption]);

  useEffect(() => {
    if (isOpen) {
      loadDashboardData();
    }
  }, [isOpen, loadDashboardData]);

  // Handle delete record
  const handleDeleteRecord = async (id, e) => {
    if (e) e.stopPropagation();
    if (!window.api?.deleteCaptionHistoryRecord) return;
    try {
      await window.api.deleteCaptionHistoryRecord(id);
      if (selectedRecord?.id === id) {
        setSelectedRecord(null);
      }
      loadDashboardData();
    } catch (err) {
      setError(err.message || 'Failed deleting record');
    }
  };

  // Handle clear all history
  const handleClearHistory = async () => {
    if (!window.api?.clearCaptionHistory) return;
    if (!window.confirm('Are you sure you want to clear all caption history? This cannot be undone.')) return;
    try {
      await window.api.clearCaptionHistory();
      setSelectedRecord(null);
      setComparisonResult(null);
      loadDashboardData();
    } catch (err) {
      setError(err.message || 'Failed clearing history');
    }
  };

  // Handle Re-Analyze
  const handleReanalyze = async (id) => {
    if (!window.api?.reanalyzeCaptionHistory) return;
    setReanalyzing(true);
    setReanalyzedResult(null);
    try {
      const res = await window.api.reanalyzeCaptionHistory(id);
      if (res && res.success) {
        setReanalyzedResult(res.result);
      }
    } catch (err) {
      setError(err.message || 'Re-analysis failed');
    } finally {
      setReanalyzing(false);
    }
  };

  // Handle Compare execution
  const handleRunCompare = useCallback(async (idA, idB) => {
    if (!idA || !idB || !window.api?.compareCaptionHistory) return;
    setComparing(true);
    setComparisonResult(null);
    try {
      const res = await window.api.compareCaptionHistory(idA, idB);
      if (res && res.success) {
        setComparisonResult(res.comparison);
      }
    } catch (err) {
      setError(err.message || 'Comparison failed');
    } finally {
      setComparing(false);
    }
  }, []);

  // Handle Improve Caption from Detail
  const handleImproveRecord = async (record) => {
    if (!record || !window.api?.improveCaptionQuality) return;
    setImproving(true);
    setImproveResult(null);
    try {
      const res = await window.api.improveCaptionQuality({
        caption: record.caption,
        topic: record.topic,
        language: record.language,
        tone: record.tone,
        platform: record.platform,
      });
      if (res && res.success) {
        setImproveResult(res);
      } else {
        setError(res?.error || 'Improvement failed');
      }
    } catch (err) {
      setError(err.message || 'Improvement error');
    } finally {
      setImproving(false);
    }
  };

  // Color Helpers
  function gradeBadgeColor(grade) {
    if (grade === 'A') return '#22c55e';
    if (grade === 'B') return '#84cc16';
    if (grade === 'C') return '#eab308';
    if (grade === 'D') return '#f97316';
    return '#ef4444';
  }

  function scoreColor(score) {
    if (score >= 80) return '#22c55e';
    if (score >= 65) return '#84cc16';
    if (score >= 50) return '#eab308';
    return '#ef4444';
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden text-gray-100">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-950">
          <div className="flex items-center gap-3">
            <span className="text-xl">📈</span>
            <h2 className="text-lg font-bold text-white tracking-wide">
              Caption Intelligence Dashboard
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors text-2xl leading-none px-2"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-gray-800 bg-gray-900 px-6 gap-2 pt-2">
          {[
            { id: 'overview', label: '📊 Overview' },
            { id: 'history', label: `🗂 History (${metrics?.totalCount || 0})` },
            { id: 'compare', label: '⚖️ Compare' },
            { id: 'trends', label: '📈 Trends' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setSelectedRecord(null);
                setImproveResult(null);
              }}
              className={`py-2.5 px-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-400 bg-gray-800/40 rounded-t-md'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Error message */}
        {error && (
          <div className="mx-6 mt-3 p-3 bg-red-900/40 border border-red-700 rounded-lg text-red-300 text-xs flex justify-between items-center">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-white font-bold ml-2">×</button>
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div className="flex flex-col gap-6">
              {metrics && metrics.totalCount > 0 ? (
                <>
                  {/* Top Stats Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 flex flex-col items-center">
                      <span className="text-gray-400 text-xs uppercase tracking-wider mb-1">Average Score</span>
                      <span
                        className="text-3xl font-extrabold"
                        style={{ color: scoreColor(metrics.averageScore) }}
                      >
                        {metrics.averageScore}
                      </span>
                      <span className="text-xs text-gray-500 mt-1">out of 100</span>
                    </div>

                    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 flex flex-col items-center">
                      <span className="text-gray-400 text-xs uppercase tracking-wider mb-1">Best Score</span>
                      <span className="text-3xl font-extrabold text-green-400">
                        {metrics.highestScore}
                      </span>
                      <span className="text-xs text-gray-500 mt-1">Highest recorded</span>
                    </div>

                    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 flex flex-col items-center">
                      <span className="text-gray-400 text-xs uppercase tracking-wider mb-1">Captions Analyzed</span>
                      <span className="text-3xl font-extrabold text-blue-400">
                        {metrics.totalCount}
                      </span>
                      <span className="text-xs text-gray-500 mt-1">Saved records</span>
                    </div>

                    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 flex flex-col items-center">
                      <span className="text-gray-400 text-xs uppercase tracking-wider mb-1">Needs Improvement</span>
                      <span className="text-3xl font-extrabold text-yellow-400">
                        {metrics.improvementOpportunities}
                      </span>
                      <span className="text-xs text-gray-500 mt-1">Score &lt; 80</span>
                    </div>
                  </div>

                  {/* Quality Breakdown & Weakest Signal */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Signal Averages */}
                    <div className="bg-gray-800/80 border border-gray-700 rounded-lg p-5">
                      <h3 className="text-sm font-semibold text-gray-200 mb-4 uppercase tracking-wider">
                        Signal Performance Averages
                      </h3>
                      <div className="space-y-3">
                        {[
                          { key: 'readability', label: 'Readability' },
                          { key: 'relevance', label: 'Topic Relevance' },
                          { key: 'clarity', label: 'Clarity & Focus' },
                          { key: 'cta', label: 'CTA Quality' },
                          { key: 'structure', label: 'Structure & Pacing' },
                        ].map(({ key, label }) => {
                          const val = metrics.averageSignals[key] || 0;
                          const col = scoreColor(val);
                          return (
                            <div key={key}>
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-gray-300">{label}</span>
                                <span style={{ color: col }} className="font-semibold">{val} / 100</span>
                              </div>
                              <div className="w-full bg-gray-700 rounded-full h-1.5">
                                <div
                                  className="h-1.5 rounded-full transition-all duration-500"
                                  style={{ width: `${val}%`, backgroundColor: col }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Improvement Opportunity */}
                    <div className="bg-gray-800/80 border border-gray-700 rounded-lg p-5 flex flex-col justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-yellow-400 mb-2 uppercase tracking-wider flex items-center gap-2">
                          <span>💡</span> Improvement Opportunity
                        </h3>
                        {metrics.weakestSignal ? (
                          <div className="text-xs text-gray-300 space-y-2 mt-3">
                            <p>
                              <strong className="text-white capitalize">{metrics.weakestSignal}</strong> is currently your lowest average signal (
                              <span className="text-yellow-400 font-semibold">{metrics.averageSignals[metrics.weakestSignal]}</span>/100).
                            </p>
                            <p className="text-gray-400">
                              Focusing on refining {metrics.weakestSignal} across upcoming captions will yield the fastest overall content readiness improvements.
                            </p>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400 mt-2">All signals are currently performing well!</p>
                        )}
                      </div>

                      {/* Quick Actions */}
                      <div className="mt-4 pt-4 border-t border-gray-700 flex gap-2">
                        <button
                          onClick={() => setActiveTab('history')}
                          className="flex-1 py-2 px-3 bg-gray-700 hover:bg-gray-600 rounded text-xs font-semibold text-white transition-colors"
                        >
                          View All History
                        </button>
                        <button
                          onClick={() => setActiveTab('compare')}
                          className="flex-1 py-2 px-3 bg-purple-600 hover:bg-purple-500 rounded text-xs font-semibold text-white transition-colors"
                        >
                          Compare Captions
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Insights Section */}
                  {insights && insights.length > 0 && (
                    <div className="bg-gray-800/60 border border-gray-700/80 rounded-lg p-5">
                      <h3 className="text-sm font-semibold text-gray-200 mb-3 uppercase tracking-wider flex items-center gap-2">
                        <span>🧠</span> Intelligence Insights
                      </h3>
                      <ul className="space-y-2">
                        {insights.map((ins, i) => (
                          <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                            <span className="text-blue-400">•</span>
                            <span>{ins}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="text-[11px] text-gray-500 mt-3 italic">
                        Insights are computed deterministically from your saved quality history.
                      </p>
                    </div>
                  )}

                  {/* Recent Captions */}
                  {metrics.recentRecords && metrics.recentRecords.length > 0 && (
                    <div className="bg-gray-800/80 border border-gray-700 rounded-lg p-5">
                      <h3 className="text-sm font-semibold text-gray-200 mb-3 uppercase tracking-wider">
                        Recent Analyzed Captions
                      </h3>
                      <div className="space-y-2">
                        {metrics.recentRecords.map((rec) => (
                          <div
                            key={rec.id}
                            onClick={() => setSelectedRecord(rec)}
                            className="p-3 bg-gray-900/80 hover:bg-gray-900 border border-gray-700/60 rounded-md flex items-center justify-between cursor-pointer transition-colors"
                          >
                            <div className="flex-1 min-w-0 pr-4">
                              <p className="text-sm text-gray-200 truncate">{rec.caption}</p>
                              <span className="text-xs text-gray-500">
                                {new Date(rec.createdAt).toLocaleDateString()} • {rec.platform || 'General'}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span
                                className="text-sm font-bold"
                                style={{ color: scoreColor(rec.score) }}
                              >
                                {rec.score}/100
                              </span>
                              <span
                                className="text-xs font-bold px-2 py-0.5 rounded"
                                style={{
                                  backgroundColor: `${gradeBadgeColor(rec.grade)}22`,
                                  color: gradeBadgeColor(rec.grade),
                                }}
                              >
                                Grade {rec.grade}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                /* Empty state */
                <div className="text-center py-16 px-4">
                  <span className="text-5xl block mb-3">📝</span>
                  <h3 className="text-lg font-bold text-white mb-1">No Caption Analyses Yet</h3>
                  <p className="text-sm text-gray-400 max-w-md mx-auto mb-6">
                    Analyze captions in the Quality panel and click &ldquo;Save Analysis&rdquo; to build your quality intelligence history and unlock aggregate trends.
                  </p>
                  {onOpenAnalyzer && (
                    <button
                      onClick={() => {
                        onClose();
                        onOpenAnalyzer();
                      }}
                      className="py-2.5 px-5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-colors shadow-lg"
                    >
                      Analyze Your First Caption
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* HISTORY TAB */}
          {activeTab === 'history' && !selectedRecord && (
            <div className="flex flex-col gap-4">
              {/* Controls Bar */}
              <div className="flex flex-wrap gap-3 items-center justify-between bg-gray-800 p-3 rounded-lg border border-gray-700">
                {/* Search */}
                <input
                  type="text"
                  placeholder="Search caption, topic, or profile..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="bg-gray-900 border border-gray-700 text-xs rounded px-3 py-2 text-white placeholder-gray-500 flex-1 min-w-[200px]"
                />

                {/* Grade Filter */}
                <select
                  value={gradeFilter}
                  onChange={(e) => setGradeFilter(e.target.value)}
                  className="bg-gray-900 border border-gray-700 text-xs rounded px-3 py-2 text-white"
                >
                  <option value="ALL">All Grades</option>
                  <option value="A">Grade A</option>
                  <option value="B">Grade B</option>
                  <option value="C">Grade C</option>
                  <option value="D">Grade D</option>
                  <option value="F">Grade F</option>
                </select>

                {/* Platform Filter */}
                <select
                  value={platformFilter}
                  onChange={(e) => setPlatformFilter(e.target.value)}
                  className="bg-gray-900 border border-gray-700 text-xs rounded px-3 py-2 text-white"
                >
                  <option value="ALL">All Platforms</option>
                  <option value="facebook">Facebook</option>
                  <option value="instagram">Instagram</option>
                  <option value="youtube">YouTube</option>
                  <option value="tiktok">TikTok</option>
                  <option value="other">Other</option>
                </select>

                {/* Sort */}
                <select
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value)}
                  className="bg-gray-900 border border-gray-700 text-xs rounded px-3 py-2 text-white"
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="highest">Highest Score</option>
                  <option value="lowest">Lowest Score</option>
                </select>

                {history.length > 0 && (
                  <button
                    onClick={handleClearHistory}
                    className="py-1.5 px-2.5 bg-red-900/60 hover:bg-red-800 text-red-200 text-xs rounded border border-red-700 transition-colors"
                  >
                    Clear History
                  </button>
                )}
              </div>

              {/* Records List */}
              {history.length > 0 ? (
                <div className="space-y-2">
                  {history.map((rec) => (
                    <div
                      key={rec.id}
                      onClick={() => setSelectedRecord(rec)}
                      className="bg-gray-800 hover:bg-gray-750 border border-gray-700 rounded-lg p-4 flex items-center justify-between cursor-pointer transition-colors group"
                    >
                      <div className="flex-1 min-w-0 pr-4">
                        <p className="text-sm font-medium text-gray-200 line-clamp-2 mb-1">
                          {rec.caption}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
                          <span>{new Date(rec.createdAt).toLocaleDateString()}</span>
                          {rec.platform && (
                            <span className="bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded capitalize">
                              {rec.platform}
                            </span>
                          )}
                          {rec.profileName && (
                            <span className="bg-gray-700/60 text-gray-300 px-1.5 py-0.5 rounded">
                              {rec.profileName}
                            </span>
                          )}
                          {rec.language && (
                            <span className="capitalize">{rec.language}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span
                            className="text-base font-extrabold block"
                            style={{ color: scoreColor(rec.score) }}
                          >
                            {rec.score}/100
                          </span>
                          <span
                            className="text-[11px] font-bold px-1.5 py-0.5 rounded inline-block"
                            style={{
                              backgroundColor: `${gradeBadgeColor(rec.grade)}22`,
                              color: gradeBadgeColor(rec.grade),
                            }}
                          >
                            Grade {rec.grade}
                          </span>
                        </div>

                        <button
                          onClick={(e) => handleDeleteRecord(rec.id, e)}
                          title="Delete record"
                          className="text-gray-500 hover:text-red-400 p-1 rounded transition-colors text-base"
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500 text-sm">
                  No caption records matching your filter criteria.
                </div>
              )}
            </div>
          )}

          {/* DETAIL VIEW */}
          {selectedRecord && (
            <div className="flex flex-col gap-4">
              <button
                onClick={() => {
                  setSelectedRecord(null);
                  setReanalyzedResult(null);
                  setImproveResult(null);
                }}
                className="self-start text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-semibold"
              >
                ← Back to History List
              </button>

              <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
                <div className="flex justify-between items-start mb-3">
                  <span className="text-xs uppercase text-gray-400 font-semibold tracking-wider">
                    Saved Caption Details
                  </span>
                  <div className="flex items-center gap-2">
                    <span
                      className="text-xl font-extrabold"
                      style={{ color: scoreColor(selectedRecord.score) }}
                    >
                      {selectedRecord.score}/100
                    </span>
                    <span
                      className="text-xs font-bold px-2 py-0.5 rounded"
                      style={{
                        backgroundColor: `${gradeBadgeColor(selectedRecord.grade)}22`,
                        color: gradeBadgeColor(selectedRecord.grade),
                      }}
                    >
                      Grade {selectedRecord.grade}
                    </span>
                  </div>
                </div>

                <p className="text-sm text-gray-100 whitespace-pre-wrap break-words bg-gray-900 p-3 rounded border border-gray-700 mb-3">
                  {selectedRecord.caption}
                </p>

                {/* Metadata tags */}
                <div className="flex flex-wrap gap-2 text-xs text-gray-400 mb-4">
                  <span>Saved: {new Date(selectedRecord.createdAt).toLocaleString()}</span>
                  {selectedRecord.topic && <span>• Topic: &ldquo;{selectedRecord.topic}&rdquo;</span>}
                  {selectedRecord.platform && <span className="capitalize">• Platform: {selectedRecord.platform}</span>}
                  {selectedRecord.language && <span className="capitalize">• Lang: {selectedRecord.language}</span>}
                </div>

                {/* Signal Breakdown */}
                {selectedRecord.signals && (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 bg-gray-900/60 p-3 rounded border border-gray-700/60 mb-4">
                    {Object.entries(selectedRecord.signals).map(([sig, val]) => (
                      <div key={sig} className="text-center">
                        <span className="text-[11px] text-gray-400 capitalize block">{sig}</span>
                        <span className="text-sm font-bold" style={{ color: scoreColor(val) }}>{val}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Strengths & Suggestions */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                  {selectedRecord.strengths?.length > 0 && (
                    <div className="bg-gray-900/50 p-3 rounded border border-gray-700/50">
                      <span className="text-xs text-green-400 font-semibold block mb-1">✓ Strengths</span>
                      <ul className="text-xs text-gray-300 space-y-1">
                        {selectedRecord.strengths.map((s, i) => (
                          <li key={i}>• {s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {selectedRecord.suggestions?.length > 0 && (
                    <div className="bg-gray-900/50 p-3 rounded border border-gray-700/50">
                      <span className="text-xs text-yellow-400 font-semibold block mb-1">• Suggestions</span>
                      <ul className="text-xs text-gray-300 space-y-1">
                        {selectedRecord.suggestions.map((s, i) => (
                          <li key={i}>• {s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-700">
                  <button
                    onClick={() => handleReanalyze(selectedRecord.id)}
                    disabled={reanalyzing}
                    className="py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded transition-colors disabled:opacity-50"
                  >
                    {reanalyzing ? 'Re-analyzing…' : '🔄 Re-Analyze with Current Engine'}
                  </button>

                  <button
                    onClick={() => handleImproveRecord(selectedRecord)}
                    disabled={improving}
                    className="py-2 px-3 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded transition-colors disabled:opacity-50"
                  >
                    {improving ? 'Improving…' : '✨ Improve Caption (AI)'}
                  </button>

                  {onApplyCaption && (
                    <button
                      onClick={() => {
                        onApplyCaption(selectedRecord.caption);
                        onClose();
                      }}
                      className="py-2 px-3 bg-green-700 hover:bg-green-600 text-white text-xs font-semibold rounded transition-colors"
                    >
                      Use in Overlay
                    </button>
                  )}

                  <button
                    onClick={() => handleDeleteRecord(selectedRecord.id)}
                    className="py-2 px-3 bg-red-900 hover:bg-red-800 text-red-200 text-xs font-semibold rounded transition-colors ml-auto"
                  >
                    Delete Record
                  </button>
                </div>

                {/* Re-analysis result callout */}
                {reanalyzedResult && (
                  <div className="mt-4 p-4 bg-gray-900 border border-blue-600/60 rounded-lg">
                    <h4 className="text-xs font-bold text-blue-300 uppercase mb-2">
                      Fresh Re-Analysis Result (Read-Only)
                    </h4>
                    <div className="flex items-center gap-4 text-xs text-gray-200 mb-2">
                      <span>Saved Score: <strong>{reanalyzedResult.previousScore}</strong></span>
                      <span>→</span>
                      <span>Current Score: <strong className="text-blue-400">{reanalyzedResult.newScore}</strong> (Grade {reanalyzedResult.newGrade})</span>
                    </div>
                    <p className="text-[11px] text-gray-400 italic">
                      Re-analysis uses the active quality rules. Your saved history remains unmodified.
                    </p>
                  </div>
                )}

                {/* Improve result callout */}
                {improveResult && (
                  <div className="mt-4 p-4 bg-gray-900 border border-purple-600/60 rounded-lg">
                    <h4 className="text-xs font-bold text-purple-300 uppercase mb-2">
                      AI Improved Version
                    </h4>
                    <p className="text-sm text-gray-100 bg-gray-950 p-2.5 rounded border border-gray-800 mb-2">
                      {improveResult.improved}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-gray-300 mb-3">
                      <span>Before: <strong className="text-gray-200">{improveResult.originalScore}</strong></span>
                      <span>→</span>
                      <span>After: <strong className="text-green-400">{improveResult.improvedScore}</strong></span>
                    </div>
                    <div className="flex gap-2">
                      {onApplyCaption && (
                        <button
                          onClick={() => {
                            onApplyCaption(improveResult.improved);
                            onClose();
                          }}
                          className="py-1.5 px-3 bg-green-600 hover:bg-green-500 text-white text-xs font-semibold rounded"
                        >
                          Use Improved Caption
                        </button>
                      )}
                      {onSaveTemplate && (
                        <button
                          onClick={() => onSaveTemplate(improveResult.improved)}
                          className="py-1.5 px-3 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs font-semibold rounded"
                        >
                          Save as Template
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* COMPARE TAB */}
          {activeTab === 'compare' && (
            <div className="flex flex-col gap-6">
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
                <h3 className="text-sm font-semibold text-gray-200 mb-3 uppercase tracking-wider">
                  Compare Two Saved Captions
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Select Caption A</label>
                    <select
                      value={compareIdA}
                      onChange={(e) => setCompareIdA(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-700 text-xs rounded p-2 text-white"
                    >
                      <option value="">-- Choose Caption A --</option>
                      {history.map((r) => (
                        <option key={r.id} value={r.id} disabled={r.id === compareIdB}>
                          ({r.score} - Grade {r.grade}) {r.caption.slice(0, 50)}...
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Select Caption B</label>
                    <select
                      value={compareIdB}
                      onChange={(e) => setCompareIdB(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-700 text-xs rounded p-2 text-white"
                    >
                      <option value="">-- Choose Caption B --</option>
                      {history.map((r) => (
                        <option key={r.id} value={r.id} disabled={r.id === compareIdA}>
                          ({r.score} - Grade {r.grade}) {r.caption.slice(0, 50)}...
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  onClick={() => handleRunCompare(compareIdA, compareIdB)}
                  disabled={!compareIdA || !compareIdB || compareIdA === compareIdB || comparing}
                  className="py-2 px-5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-semibold rounded transition-colors"
                >
                  {comparing ? 'Comparing…' : '⚖️ Compare Captions'}
                </button>
              </div>

              {/* Comparison Output */}
              {comparisonResult && (
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
                  <div className="grid grid-cols-2 gap-4 pb-4 border-b border-gray-700">
                    <div>
                      <h4 className="text-xs font-bold text-blue-400 uppercase mb-1">Caption A</h4>
                      <p className="text-xs text-gray-200 bg-gray-900 p-2.5 rounded border border-gray-700/60 mb-2 max-h-24 overflow-y-auto">
                        {comparisonResult.captionA.caption}
                      </p>
                      <span className="text-2xl font-extrabold" style={{ color: scoreColor(comparisonResult.captionA.score) }}>
                        {comparisonResult.captionA.score}
                      </span>
                      <span className="text-xs text-gray-400 ml-1">Grade {comparisonResult.captionA.grade}</span>
                    </div>

                    <div>
                      <h4 className="text-xs font-bold text-purple-400 uppercase mb-1">Caption B</h4>
                      <p className="text-xs text-gray-200 bg-gray-900 p-2.5 rounded border border-gray-700/60 mb-2 max-h-24 overflow-y-auto">
                        {comparisonResult.captionB.caption}
                      </p>
                      <span className="text-2xl font-extrabold" style={{ color: scoreColor(comparisonResult.captionB.score) }}>
                        {comparisonResult.captionB.score}
                      </span>
                      <span className="text-xs text-gray-400 ml-1">Grade {comparisonResult.captionB.grade}</span>
                    </div>
                  </div>

                  {/* Signal Differences */}
                  <div className="my-4">
                    <h5 className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">Signal Comparison</h5>
                    <div className="space-y-2">
                      {[
                        { key: 'readability', label: 'Readability' },
                        { key: 'relevance', label: 'Relevance' },
                        { key: 'clarity', label: 'Clarity' },
                        { key: 'cta', label: 'CTA Quality' },
                        { key: 'structure', label: 'Structure' },
                      ].map(({ key, label }) => {
                        const valA = comparisonResult.captionA.signals[key];
                        const valB = comparisonResult.captionB.signals[key];
                        const diff = comparisonResult.signalDiffs[key];
                        return (
                          <div key={key} className="flex items-center justify-between text-xs py-1 px-2 bg-gray-900/50 rounded">
                            <span className="text-gray-300 w-28">{label}</span>
                            <span className="text-blue-300 font-semibold">{valA}</span>
                            <span className={`text-[11px] font-bold ${diff > 0 ? 'text-green-400' : diff < 0 ? 'text-yellow-400' : 'text-gray-400'}`}>
                              {diff > 0 ? `+${diff} (B)` : diff < 0 ? `${diff} (A)` : '0'}
                            </span>
                            <span className="text-purple-300 font-semibold">{valB}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Summary Callout */}
                  <div className="p-3 bg-gray-900 rounded border border-gray-700 flex flex-col gap-1">
                    <div className="text-xs font-semibold text-white">
                      Better Overall:{' '}
                      <span className="text-green-400">
                        {comparisonResult.betterOverall === 'EQUAL'
                          ? 'Equal Score'
                          : `Caption ${comparisonResult.betterOverall}`}
                      </span>
                    </div>
                    {comparisonResult.strongestDifference && (
                      <div className="text-xs text-gray-300">
                        Strongest Difference: <span className="text-blue-300 capitalize">{comparisonResult.strongestDifference.signal}</span> (
                        <span className="font-semibold">
                          {comparisonResult.strongestDifference.diff > 0 ? `+${comparisonResult.strongestDifference.diff}` : comparisonResult.strongestDifference.diff}
                        </span>)
                      </div>
                    )}
                    <p className="text-[11px] text-gray-500 italic mt-1">
                      {comparisonResult.verdict}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TRENDS TAB */}
          {activeTab === 'trends' && (
            <div className="flex flex-col gap-6">
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
                <h3 className="text-sm font-semibold text-gray-200 mb-4 uppercase tracking-wider">
                  Caption Quality Score Trend
                </h3>

                {history.length >= 2 ? (
                  <div>
                    {/* SVG Trend Chart */}
                    <div className="w-full bg-gray-900 border border-gray-700/70 rounded-lg p-4 mb-4">
                      {(() => {
                        // Chronological order for trend
                        const chron = history.slice().reverse();
                        const n = chron.length;
                        const width = 600;
                        const height = 180;
                        const padX = 40;
                        const padY = 25;

                        const pts = chron.map((r, i) => {
                          const x = padX + (i / Math.max(n - 1, 1)) * (width - 2 * padX);
                          const y = height - padY - (r.score / 100) * (height - 2 * padY);
                          return { x, y, score: r.score, label: r.caption.slice(0, 15) };
                        });

                        const pathData = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

                        return (
                          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
                            {/* Grid lines */}
                            <line x1={padX} y1={padY} x2={width - padX} y2={padY} stroke="#374151" strokeDasharray="3" />
                            <line x1={padX} y1={height / 2} x2={width - padX} y2={height / 2} stroke="#374151" strokeDasharray="3" />
                            <line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} stroke="#374151" />

                            {/* Axis Labels */}
                            <text x={padX - 8} y={padY + 4} fill="#6b7280" fontSize="10" textAnchor="end">100</text>
                            <text x={padX - 8} y={height / 2 + 4} fill="#6b7280" fontSize="10" textAnchor="end">50</text>
                            <text x={padX - 8} y={height - padY + 4} fill="#6b7280" fontSize="10" textAnchor="end">0</text>

                            {/* Trend Line */}
                            <path d={pathData} fill="none" stroke="#3b82f6" strokeWidth="2.5" />

                            {/* Data points */}
                            {pts.map((p, i) => (
                              <g key={i}>
                                <circle cx={p.x} cy={p.y} r="4" fill="#3b82f6" stroke="#1e3a8a" strokeWidth="1.5" />
                                <text x={p.x} y={p.y - 7} fill="#93c5fd" fontSize="9" textAnchor="middle" fontWeight="bold">
                                  {p.score}
                                </text>
                              </g>
                            ))}
                          </svg>
                        );
                      })()}
                    </div>
                    <p className="text-xs text-gray-400 text-center">
                      Showing quality trajectory across your last {history.length} saved analyses (oldest to newest).
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-500 text-sm">
                    <span>📉</span>
                    <p className="mt-2 font-medium">Not enough data for a trend yet.</p>
                    <p className="text-xs text-gray-600 mt-1">Save at least 2 caption analyses to visualize score changes over time.</p>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-800 bg-gray-950 flex justify-between items-center text-xs text-gray-400">
          <span>Reel Cutter • Content Quality Intelligence</span>
          <button
            onClick={onClose}
            className="py-1.5 px-4 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded font-medium transition-colors"
          >
            Close Dashboard
          </button>
        </div>

      </div>
    </div>
  );
}
