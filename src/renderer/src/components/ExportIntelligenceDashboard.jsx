import { useState, useEffect, useCallback } from 'react'
import {
  BarChart3, TrendingUp, Users, Globe, Layers, RefreshCw,
  Download, AlertTriangle, CheckCircle2, XCircle, Clock,
  ArrowUpDown, Filter, Calendar, ChevronDown, FileJson,
  FileText, Shield, Activity, Zap, Target, Package
} from 'lucide-react'

const TIME_RANGES = [
  { value: 'all', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: 'last7', label: 'Last 7 Days' },
  { value: 'last30', label: 'Last 30 Days' },
  { value: 'custom', label: 'Custom' },
]

const STATUS_BADGES = {
  COMPLETED: { bg: 'bg-green-500/10 text-green-400 border-green-500/30', icon: CheckCircle2 },
  FAILED: { bg: 'bg-red-500/10 text-red-400 border-red-500/30', icon: XCircle },
  CANCELLED: { bg: 'bg-zinc-800 text-zinc-400 border-zinc-700', icon: XCircle },
  SKIPPED: { bg: 'bg-amber-500/10 text-amber-400 border-amber-500/30', icon: AlertTriangle },
}

function StatCard({ label, value, icon: Icon, color = 'text-zinc-100', subtext }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
      <div className="flex items-center gap-2 text-zinc-400 text-xs">
        {Icon && <Icon className="w-3.5 h-3.5" />}
        <span>{label}</span>
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {subtext && <div className="text-xs text-zinc-500">{subtext}</div>}
    </div>
  )
}

function MiniBar({ items, maxVal }) {
  const max = maxVal || Math.max(...items.map(i => i.value), 1)
  return (
    <div className="flex items-end gap-1 h-16">
      {items.map((item, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div
            className="w-full rounded-t bg-brand-500/40 min-h-[2px]"
            style={{ height: `${Math.max((item.value / max) * 100, 2)}%` }}
            title={`${item.label}: ${item.value}`}
          />
          {item.label && (
            <span className="text-[9px] text-zinc-500 truncate w-full text-center" title={item.label}>
              {item.label.length > 6 ? item.label.slice(0, 6) + '..' : item.label}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

function SectionHeader({ icon: Icon, title, right }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-zinc-100 font-semibold text-sm">
        {Icon && <Icon className="w-4 h-4 text-brand-400" />}
        {title}
      </div>
      {right}
    </div>
  )
}

function EmptyState({ message }) {
  return (
    <div className="text-center py-8 text-zinc-500 text-sm">
      {message || 'No data available'}
    </div>
  )
}

export default function ExportIntelligenceDashboard({ licenseTier = 'standard', onOpenUpgrade }) {
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [timeRange, setTimeRange] = useState('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [profileCompareIds, setProfileCompareIds] = useState([])
  const [profileCompareResult, setProfileCompareResult] = useState(null)
  const [presetCompareIds, setPresetCompareIds] = useState([])
  const [presetCompareType, setPresetCompareType] = useState('export')
  const [presetCompareResult, setPresetCompareResult] = useState(null)
  const [showFilters, setShowFilters] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [platformFilter, setPlatformFilter] = useState('')
  const [exportTypeFilter, setExportTypeFilter] = useState('')

  const fetchAnalytics = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const options = { timeRange }
      if (timeRange === 'custom') {
        options.dateFrom = customFrom || undefined
        options.dateTo = customTo || undefined
      }
      const filters = {}
      if (statusFilter) filters.status = statusFilter
      if (platformFilter) filters.platform = platformFilter
      if (exportTypeFilter) filters.exportType = exportTypeFilter
      if (Object.keys(filters).length > 0) options.filters = filters

      const result = await window.api.getAnalyticsDashboard(options)
      if (result.success) {
        setAnalytics(result.analytics)
      } else {
        setError(result.error || 'Failed to load analytics')
      }
    } catch (err) {
      setError(err.message || 'Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }, [timeRange, customFrom, customTo, statusFilter, platformFilter, exportTypeFilter])

  useEffect(() => { fetchAnalytics() }, [fetchAnalytics])

  const handleExportJSON = async () => {
    try {
      const result = await window.api.exportAnalyticsJSON({ timeRange })
      if (result.success && result.data) {
        const blob = new Blob([result.data], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `export-analytics-${Date.now()}.json`
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (_) {}
  }

  const handleExportCSV = async () => {
    try {
      const result = await window.api.exportAnalyticsCSV({ timeRange })
      if (result.success && result.data) {
        const blob = new Blob([result.data], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `export-analytics-${Date.now()}.csv`
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (_) {}
  }

  const handleProfileCompare = async () => {
    if (profileCompareIds.length < 2) return
    try {
      const result = await window.api.compareAnalyticsProfiles(profileCompareIds)
      if (result.success) setProfileCompareResult(result)
    } catch (_) {}
  }

  const handlePresetCompare = async () => {
    if (presetCompareIds.length < 2) return
    try {
      const result = await window.api.compareAnalyticsPresets(presetCompareIds, presetCompareType)
      if (result.success) setPresetCompareResult(result)
    } catch (_) {}
  }

  if (loading && !analytics) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-zinc-400 text-sm flex items-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Loading analytics...
        </div>
      </div>
    )
  }

  if (error && !analytics) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3">
          <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
          <div className="text-zinc-400 text-sm">{error}</div>
          <button
            onClick={fetchAnalytics}
            className="px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white text-xs rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  const a = analytics || {}
  const ov = a.overview || {}

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-5 h-5 text-brand-400" />
          <h2 className="text-lg font-bold text-zinc-100">Export Intelligence Dashboard</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchAnalytics}
            className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-2 rounded-lg transition-colors ${showFilters ? 'bg-brand-600/20 text-brand-400' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'}`}
            title="Filters"
          >
            <Filter className="w-4 h-4" />
          </button>
          <button
            onClick={handleExportJSON}
            className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
            title="Export JSON"
          >
            <FileJson className="w-4 h-4" />
          </button>
          <button
            onClick={handleExportCSV}
            className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
            title="Export CSV"
          >
            <FileText className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Time Range */}
      <div className="flex items-center gap-3 flex-wrap">
        <Calendar className="w-4 h-4 text-zinc-400" />
        {TIME_RANGES.map(tr => (
          <button
            key={tr.value}
            onClick={() => setTimeRange(tr.value)}
            className={`px-3 py-1 text-xs rounded-lg border transition-colors ${
              timeRange === tr.value
                ? 'bg-brand-600/20 text-brand-400 border-brand-600/30'
                : 'bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-zinc-600'
            }`}
          >
            {tr.label}
          </button>
        ))}
        {timeRange === 'custom' && (
          <>
            <input
              type="date"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              className="bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-zinc-200"
            />
            <span className="text-zinc-500 text-xs">to</span>
            <input
              type="date"
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
              className="bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-zinc-200"
            />
          </>
        )}
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-4 flex-wrap">
          <span className="text-xs text-zinc-400 font-medium">Filters:</span>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-zinc-200"
          >
            <option value="">All Status</option>
            <option value="COMPLETED">Completed</option>
            <option value="FAILED">Failed</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="SKIPPED">Skipped</option>
          </select>
          <select
            value={platformFilter}
            onChange={e => setPlatformFilter(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-zinc-200"
          >
            <option value="">All Platforms</option>
            {(a.platformAnalytics?.byPlatform || []).map(p => (
              <option key={p.platform} value={p.platform}>{p.platform}</option>
            ))}
          </select>
          <select
            value={exportTypeFilter}
            onChange={e => setExportTypeFilter(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-zinc-200"
          >
            <option value="">All Types</option>
            {(a.exportTypeAnalytics?.byType || []).map(t => (
              <option key={t.type} value={t.type}>{t.type}</option>
            ))}
          </select>
          {(statusFilter || platformFilter || exportTypeFilter) && (
            <button
              onClick={() => { setStatusFilter(''); setPlatformFilter(''); setExportTypeFilter('') }}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Clear filters
            </button>
          )}
          <div className="text-xs text-zinc-500 ml-auto">
            Showing {a.filteredRecordCount || 0} records
          </div>
        </div>
      )}

      {/* Section 1: Overview */}
      <div className="space-y-3">
        <SectionHeader icon={Target} title="Overview" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Total Exports" value={ov.total || 0} icon={Package} />
          <StatCard label="Completed" value={ov.completed || 0} icon={CheckCircle2} color="text-green-400" />
          <StatCard label="Failed" value={ov.failed || 0} icon={XCircle} color="text-red-400" />
          <StatCard label="Success Rate" value={`${ov.successRate || 0}%`} icon={TrendingUp} color={ov.successRate >= 80 ? 'text-green-400' : ov.successRate >= 50 ? 'text-amber-400' : 'text-red-400'} />
          <StatCard label="Retries" value={ov.retryCount || 0} icon={ArrowUpDown} />
          <StatCard label="Needs Attention" value={(ov.failed || 0) + (ov.missingOutputCount || 0)} icon={AlertTriangle} color={((ov.failed || 0) + (ov.missingOutputCount || 0)) > 0 ? 'text-amber-400' : 'text-green-400'} />
        </div>
      </div>

      {/* Section 2: Activity */}
      {a.timeAnalytics && (
        <div className="space-y-3">
          <SectionHeader icon={Activity} title="Activity" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Today" value={a.timeAnalytics.today || 0} icon={Clock} />
            <StatCard label="Yesterday" value={a.timeAnalytics.yesterday || 0} icon={Clock} />
            <StatCard label="Last 7 Days" value={a.timeAnalytics.last7Days || 0} icon={Clock} />
            <StatCard label="Last 30 Days" value={a.timeAnalytics.last30Days || 0} icon={Clock} />
          </div>
          {a.timeAnalytics.daily && Object.keys(a.timeAnalytics.daily).length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="text-xs text-zinc-400 mb-2">Daily Activity</div>
              <MiniBar
                items={Object.entries(a.timeAnalytics.daily)
                  .sort((a, b) => a[0].localeCompare(b[0]))
                  .slice(-14)
                  .map(([k, v]) => ({ label: k.slice(5), value: v }))}
              />
            </div>
          )}
        </div>
      )}

      {/* Section 3: Profiles */}
      {a.profileAnalytics && a.profileAnalytics.byProfile && a.profileAnalytics.byProfile.length > 0 && (
        <div className="space-y-3">
          <SectionHeader icon={Users} title="Profiles" />
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left px-4 py-2 text-zinc-400 font-medium">Profile</th>
                  <th className="text-right px-4 py-2 text-zinc-400 font-medium">Total</th>
                  <th className="text-right px-4 py-2 text-zinc-400 font-medium">Completed</th>
                  <th className="text-right px-4 py-2 text-zinc-400 font-medium">Failed</th>
                  <th className="text-right px-4 py-2 text-zinc-400 font-medium">Rate</th>
                  <th className="text-right px-4 py-2 text-zinc-400 font-medium">Retries</th>
                </tr>
              </thead>
              <tbody>
                {a.profileAnalytics.byProfile.map((p, i) => (
                  <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    <td className="px-4 py-2 text-zinc-200">{p.name}</td>
                    <td className="px-4 py-2 text-right text-zinc-300">{p.total}</td>
                    <td className="px-4 py-2 text-right text-green-400">{p.completed}</td>
                    <td className="px-4 py-2 text-right text-red-400">{p.failed}</td>
                    <td className="px-4 py-2 text-right text-zinc-300">{p.successRate}%</td>
                    <td className="px-4 py-2 text-right text-zinc-300">{p.retryCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Section 4: Platforms */}
      {a.platformAnalytics && a.platformAnalytics.byPlatform && a.platformAnalytics.byPlatform.length > 0 && (
        <div className="space-y-3">
          <SectionHeader icon={Globe} title="Platforms" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {a.platformAnalytics.byPlatform.map((p, i) => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-1">
                <div className="text-xs text-zinc-400">{p.platform}</div>
                <div className="text-lg font-bold text-zinc-100">{p.total}</div>
                <div className="text-xs text-zinc-500">{p.successRate}% success</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section 5: Presets */}
      {a.presetAnalytics && (
        <div className="space-y-3">
          <SectionHeader icon={Layers} title="Presets" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Export Presets */}
            {a.presetAnalytics.exportPresets && a.presetAnalytics.exportPresets.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                <div className="text-xs text-zinc-400 font-medium">Export Presets</div>
                {a.presetAnalytics.exportPresets.slice(0, 5).map((p, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-zinc-300 truncate">{p.name}</span>
                    <span className="text-zinc-500">{p.usageCount}</span>
                  </div>
                ))}
              </div>
            )}
            {/* Variation Presets */}
            {a.presetAnalytics.variationPresets && a.presetAnalytics.variationPresets.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                <div className="text-xs text-zinc-400 font-medium">Variation Presets</div>
                {a.presetAnalytics.variationPresets.slice(0, 5).map((p, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-zinc-300 truncate">{p.name}</span>
                    <span className="text-zinc-500">{p.usageCount}</span>
                  </div>
                ))}
              </div>
            )}
            {/* Caption Templates */}
            {a.presetAnalytics.captionTemplates && a.presetAnalytics.captionTemplates.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                <div className="text-xs text-zinc-400 font-medium">Caption Templates</div>
                {a.presetAnalytics.captionTemplates.slice(0, 5).map((p, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-zinc-300 truncate">{p.name}</span>
                    <span className="text-zinc-500">{p.usageCount}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Section 6: Recovery */}
      {a.recoveryAnalytics && (
        <div className="space-y-3">
          <SectionHeader icon={Shield} title="Recovery" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Failed" value={a.recoveryAnalytics.failed || 0} icon={XCircle} color="text-red-400" />
            <StatCard label="Retry Attempts" value={a.recoveryAnalytics.retryAttempts || 0} icon={ArrowUpDown} />
            <StatCard label="Successful" value={a.recoveryAnalytics.successfulRetries || 0} icon={CheckCircle2} color="text-green-400" />
            <StatCard label="Recovery Rate" value={`${a.recoveryAnalytics.recoverySuccessRate || 0}%`} icon={TrendingUp} color="text-green-400" />
          </div>
        </div>
      )}

      {/* Section 7: Bulk Exports */}
      {a.bulkAnalytics && a.bulkAnalytics.totalBulkJobs > 0 && (
        <div className="space-y-3">
          <SectionHeader icon={Package} title="Bulk Exports" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total Jobs" value={a.bulkAnalytics.totalBulkJobs || 0} icon={Package} />
            <StatCard label="Completed" value={a.bulkAnalytics.completedBulkJobs || 0} icon={CheckCircle2} color="text-green-400" />
            <StatCard label="Failed" value={a.bulkAnalytics.failedBulkJobs || 0} icon={XCircle} color="text-red-400" />
            <StatCard label="Success Rate" value={`${a.bulkAnalytics.bulkSuccessRate || 0}%`} icon={TrendingUp} />
          </div>
          {a.bulkAnalytics.profilesUsed && a.bulkAnalytics.profilesUsed.length > 0 && (
            <div className="text-xs text-zinc-500">
              Profiles used: {a.bulkAnalytics.profilesUsed.join(', ')}
            </div>
          )}
        </div>
      )}

      {/* Section 8: Scheduled Exports */}
      {a.scheduledAnalytics && a.scheduledAnalytics.scheduledExports > 0 && (
        <div className="space-y-3">
          <SectionHeader icon={Clock} title="Scheduled Exports" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Scheduled" value={a.scheduledAnalytics.scheduledExports || 0} icon={Clock} />
            <StatCard label="Completed" value={a.scheduledAnalytics.completedScheduled || 0} icon={CheckCircle2} color="text-green-400" />
            <StatCard label="Failed" value={a.scheduledAnalytics.failedScheduled || 0} icon={XCircle} color="text-red-400" />
            <StatCard label="Success Rate" value={`${a.scheduledAnalytics.scheduledSuccessRate || 0}%`} icon={TrendingUp} />
          </div>
        </div>
      )}

      {/* Section 9: Output Health */}
      {a.outputHealthAnalytics && a.outputHealthAnalytics.total > 0 && (
        <div className="space-y-3">
          <SectionHeader icon={Activity} title="Output Health" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Available" value={a.outputHealthAnalytics.available || 0} icon={CheckCircle2} color="text-green-400" />
            <StatCard label="Missing" value={a.outputHealthAnalytics.missing || 0} icon={XCircle} color="text-red-400" />
            <StatCard label="Invalid Path" value={a.outputHealthAnalytics.invalidPath || 0} icon={AlertTriangle} color="text-amber-400" />
            <StatCard label="Inaccessible" value={a.outputHealthAnalytics.inaccessible || 0} icon={Shield} color="text-amber-400" />
          </div>
        </div>
      )}

      {/* Section 10: Workflow Insights */}
      {(a.insights?.length > 0 || a.attentionSignals?.length > 0) && (
        <div className="space-y-3">
          <SectionHeader icon={Zap} title="Workflow Insights" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {a.insights && a.insights.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                <div className="text-xs text-zinc-400 font-medium mb-1">Insights</div>
                {a.insights.map((insight, i) => (
                  <div key={i} className="text-xs text-zinc-300 flex items-start gap-2">
                    <span className="text-brand-400 mt-0.5">&#8226;</span>
                    <span>{insight.text}</span>
                  </div>
                ))}
              </div>
            )}
            {a.attentionSignals && a.attentionSignals.length > 0 && (
              <div className="bg-zinc-900 border border-amber-500/20 rounded-xl p-4 space-y-2">
                <div className="text-xs text-amber-400 font-medium mb-1">Needs Attention</div>
                {a.attentionSignals.map((signal, i) => (
                  <div key={i} className="text-xs text-zinc-300 flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                    <span>{signal.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Profile Comparison */}
      <div className="space-y-3">
        <SectionHeader icon={Users} title="Profile Comparison" right={
          <button
            onClick={handleProfileCompare}
            disabled={profileCompareIds.length < 2}
            className="px-3 py-1 text-xs bg-brand-600 hover:bg-brand-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-lg transition-colors"
          >
            Compare
          </button>
        } />
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          {a.profileAnalytics?.byProfile ? (
            <div className="flex flex-wrap gap-2">
              {a.profileAnalytics.byProfile.map((p, i) => (
                <label key={i} className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded border-zinc-700 text-brand-600 focus:ring-brand-500"
                    checked={profileCompareIds.includes(p.profileId || p.name)}
                    onChange={e => {
                      const id = p.profileId || p.name
                      setProfileCompareIds(prev =>
                        e.target.checked ? [...prev, id] : prev.filter(x => x !== id)
                      )
                    }}
                  />
                  {p.name}
                </label>
              ))}
            </div>
          ) : (
            <EmptyState message="No profiles to compare" />
          )}
          {profileCompareResult && profileCompareResult.comparisons && (
            <div className="mt-3">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left px-2 py-1 text-zinc-400">Profile</th>
                    <th className="text-right px-2 py-1 text-zinc-400">Exports</th>
                    <th className="text-right px-2 py-1 text-zinc-400">Completed</th>
                    <th className="text-right px-2 py-1 text-zinc-400">Failed</th>
                    <th className="text-right px-2 py-1 text-zinc-400">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {profileCompareResult.comparisons.map((c, i) => (
                    <tr key={i} className="border-b border-zinc-800/50">
                      <td className="px-2 py-1 text-zinc-200">{c.name}</td>
                      <td className="px-2 py-1 text-right text-zinc-300">{c.exportCount}</td>
                      <td className="px-2 py-1 text-right text-green-400">{c.completed}</td>
                      <td className="px-2 py-1 text-right text-red-400">{c.failed}</td>
                      <td className="px-2 py-1 text-right text-zinc-300">{c.successRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Preset Comparison */}
      <div className="space-y-3">
        <SectionHeader icon={Layers} title="Preset Comparison" right={
          <div className="flex items-center gap-2">
            <select
              value={presetCompareType}
              onChange={e => setPresetCompareType(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-zinc-200"
            >
              <option value="export">Export Presets</option>
              <option value="variation">Variation Presets</option>
            </select>
            <button
              onClick={handlePresetCompare}
              disabled={presetCompareIds.length < 2}
              className="px-3 py-1 text-xs bg-brand-600 hover:bg-brand-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-lg transition-colors"
            >
              Compare
            </button>
          </div>
        } />
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          {a.presetAnalytics && (presetCompareType === 'export' ? a.presetAnalytics.exportPresets : a.presetAnalytics.variationPresets) ? (
            <div className="flex flex-wrap gap-2">
              {(presetCompareType === 'export' ? a.presetAnalytics.exportPresets : a.presetAnalytics.variationPresets).map((p, i) => (
                <label key={i} className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded border-zinc-700 text-brand-600 focus:ring-brand-500"
                    checked={presetCompareIds.includes(p.id || p.name)}
                    onChange={e => {
                      const id = p.id || p.name
                      setPresetCompareIds(prev =>
                        e.target.checked ? [...prev, id] : prev.filter(x => x !== id)
                      )
                    }}
                  />
                  {p.name}
                </label>
              ))}
            </div>
          ) : (
            <EmptyState message="No presets to compare" />
          )}
          {presetCompareResult && presetCompareResult.comparisons && (
            <div className="mt-3">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left px-2 py-1 text-zinc-400">Preset</th>
                    <th className="text-right px-2 py-1 text-zinc-400">Usage</th>
                    <th className="text-right px-2 py-1 text-zinc-400">Completed</th>
                    <th className="text-right px-2 py-1 text-zinc-400">Failed</th>
                    <th className="text-right px-2 py-1 text-zinc-400">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {presetCompareResult.comparisons.map((c, i) => (
                    <tr key={i} className="border-b border-zinc-800/50">
                      <td className="px-2 py-1 text-zinc-200">{c.name}</td>
                      <td className="px-2 py-1 text-right text-zinc-300">{c.usageCount}</td>
                      <td className="px-2 py-1 text-right text-green-400">{c.completed}</td>
                      <td className="px-2 py-1 text-right text-red-400">{c.failed}</td>
                      <td className="px-2 py-1 text-right text-zinc-300">{c.successRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Export Type Breakdown */}
      {a.exportTypeAnalytics && a.exportTypeAnalytics.byType && a.exportTypeAnalytics.byType.length > 0 && (
        <div className="space-y-3">
          <SectionHeader icon={Layers} title="Export Types" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {a.exportTypeAnalytics.byType.map((t, i) => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-1">
                <div className="text-xs text-zinc-400 capitalize">{t.type}</div>
                <div className="text-lg font-bold text-zinc-100">{t.total}</div>
                <div className="text-xs text-zinc-500">{t.successRate}% success</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
