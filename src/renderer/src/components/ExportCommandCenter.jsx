import { useState, useEffect, useCallback } from 'react'
import {
  LayoutDashboard, RefreshCw, AlertTriangle, CheckCircle2, XCircle,
  Clock, Package, Users, Play, Pause, Square, Search, Filter,
  ArrowRight, Zap, Shield, Globe, Scissors, Film, SplitSquareHorizontal,
  Calendar, BarChart3, RotateCcw, FileOutput, Eye
} from 'lucide-react'

const SEVERITY_COLORS = {
  ERROR: 'text-red-400 bg-red-500/10 border-red-500/30',
  WARNING: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  INFO: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
}

const STATUS_COLORS = {
  COMPLETED: 'text-green-400',
  FAILED: 'text-red-400',
  CANCELLED: 'text-zinc-400',
  PROCESSING: 'text-blue-400',
  WAITING: 'text-amber-400',
  SKIPPED: 'text-zinc-500',
  SCHEDULED: 'text-purple-400',
  READY: 'text-purple-400',
  PAUSED: 'text-amber-400',
}

const OP_ICONS = { cut: Scissors, reel: Film, split: SplitSquareHorizontal }

function StatCard({ label, value, icon: Icon, color = 'text-zinc-100', onClick }) {
  return (
    <button
      onClick={onClick}
      className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-left hover:border-zinc-700 transition-colors"
    >
      <div className="flex items-center gap-1.5 text-zinc-400 text-[10px] mb-1">
        {Icon && <Icon className="w-3 h-3" />}
        <span>{label}</span>
      </div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
    </button>
  )
}

function SectionHeader({ icon: Icon, title, right, count }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-zinc-100 font-semibold text-sm">
        {Icon && <Icon className="w-4 h-4 text-brand-400" />}
        {title}
        {count !== undefined && (
          <span className="text-xs text-zinc-500 font-normal">({count})</span>
        )}
      </div>
      {right}
    </div>
  )
}

function EmptyState({ message, icon: Icon }) {
  return (
    <div className="text-center py-6 text-zinc-500 text-xs flex flex-col items-center gap-2">
      {Icon && <Icon className="w-5 h-5 text-zinc-600" />}
      {message}
    </div>
  )
}

function ProgressBar({ value, max = 100 }) {
  const pct = max > 0 ? Math.min(Math.round((value / max) * 100), 100) : 0
  return (
    <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-brand-500 to-brand-400 rounded-full transition-all duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function QuickAction({ icon: Icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-300 hover:text-zinc-100 hover:border-zinc-700 hover:bg-zinc-800 transition-all"
    >
      {Icon && <Icon className="w-3.5 h-3.5 text-brand-400" />}
      <span>{label}</span>
      <ArrowRight className="w-3 h-3 text-zinc-600 ml-auto" />
    </button>
  )
}

export default function ExportCommandCenter({ onNavigate }) {
  const [snapshot, setSnapshot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [retrying, setRetrying] = useState(null)

  const fetchSnapshot = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const options = {}
      if (filter !== 'all') options.filter = filter
      if (search) options.search = search

      const result = await window.api.getCommandCenterSnapshot(options)
      if (result.success) {
        setSnapshot(result.snapshot)
      } else {
        setError(result.error || 'Failed to load command center')
      }
    } catch (err) {
      setError(err.message || 'Failed to load command center')
    } finally {
      setLoading(false)
    }
  }, [filter, search])

  useEffect(() => { fetchSnapshot() }, [fetchSnapshot])

  const handleRetry = async (historyId) => {
    setRetrying(historyId)
    try {
      await window.api.retryCommandCenterFailed(historyId)
      await fetchSnapshot()
    } catch (_) {}
    setRetrying(null)
  }

  const handleExportAgain = async (historyId) => {
    setRetrying(historyId)
    try {
      await window.api.exportAgainCommandCenterMissing(historyId)
      await fetchSnapshot()
    } catch (_) {}
    setRetrying(null)
  }

  if (loading && !snapshot) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-zinc-400 text-sm flex items-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Loading command center...
        </div>
      </div>
    )
  }

  if (error && !snapshot) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3">
          <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
          <div className="text-zinc-400 text-sm">{error}</div>
          <button onClick={fetchSnapshot} className="px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white text-xs rounded-lg transition-colors">
            Retry
          </button>
        </div>
      </div>
    )
  }

  const s = snapshot || {}
  const q = s.queue || {}
  const sch = s.scheduled || {}
  const att = s.attention || { items: [] }
  const rec = s.recent || { items: [] }
  const oh = s.outputHealth || {}
  const rv = s.recovery || {}
  const et = s.exportTypes || {}
  const pf = s.profiles || { active: [], withFailures: [] }
  const ov = s.overview || {}

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <LayoutDashboard className="w-5 h-5 text-brand-400" />
          <h2 className="text-lg font-bold text-zinc-100">Export Command Center</h2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchSnapshot} className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Processing" value={ov.processing || 0} icon={Play} color={ov.processing > 0 ? 'text-blue-400' : 'text-zinc-400'} />
        <StatCard label="Queued" value={ov.queued || 0} icon={Package} color={ov.queued > 0 ? 'text-amber-400' : 'text-zinc-400'} />
        <StatCard label="Scheduled" value={ov.scheduled || 0} icon={Calendar} color={ov.scheduled > 0 ? 'text-purple-400' : 'text-zinc-400'} />
        <StatCard label="Attention" value={ov.attention || 0} icon={AlertTriangle} color={ov.attention > 0 ? 'text-red-400' : 'text-green-400'} />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-0.5">
          {['all', 'active', 'attention', 'recent'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 text-xs rounded-md transition-colors capitalize ${
                filter === f
                  ? 'bg-brand-600/20 text-brand-400'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search source, profile..."
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
          />
        </div>
      </div>

      {/* Active Work */}
      <div className="space-y-3">
        <SectionHeader icon={Play} title="Active Work" count={(q.processingCount || 0) + (q.waitingCount || 0)} />
        {q.available === false ? (
          <EmptyState message={q.error || 'Queue unavailable'} icon={Package} />
        ) : (q.active && q.active.length > 0) || (q.queued && q.queued.length > 0) ? (
          <div className="space-y-2">
            {q.active && q.active.map(item => (
              <div key={item.id} className="bg-zinc-900 border border-blue-500/20 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                    <span className="text-xs text-zinc-200 font-medium">{item.source}</span>
                    {item.profile && <span className="text-[10px] text-zinc-500">{item.profile}</span>}
                  </div>
                  <span className="text-[10px] text-blue-400">{item.progress}%</span>
                </div>
                <ProgressBar value={item.progress} />
                <div className="flex items-center gap-3 text-[10px] text-zinc-500">
                  <span className="capitalize">{item.operation}</span>
                  {item.platform && <span>{item.platform}</span>}
                  {item.bulkPlanId && <span className="text-brand-400">Bulk</span>}
                </div>
              </div>
            ))}
            {q.queued && q.queued.map(item => (
              <div key={item.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-3 h-3 text-amber-400" />
                  <span className="text-xs text-zinc-300">{item.source}</span>
                  {item.profile && <span className="text-[10px] text-zinc-500">{item.profile}</span>}
                  <span className="ml-auto text-[10px] text-amber-400 capitalize">{item.operation}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState message="No exports are running." icon={Package} />
        )}
        {q.isRunning && (
          <div className="text-[10px] text-zinc-500">
            Concurrency: {q.concurrency}/{q.maxConcurrency} | Overall: {q.overallProgress}%
          </div>
        )}
      </div>

      {/* Attention */}
      <div className="space-y-3">
        <SectionHeader icon={AlertTriangle} title="Attention" count={att.items.length} />
        {att.items.length > 0 ? (
          <div className="space-y-2">
            {att.items.slice(0, 10).map((item, i) => (
              <div key={`${item.historyId}-${i}`} className={`border rounded-xl p-3 space-y-1 ${SEVERITY_COLORS[item.severity] || 'border-zinc-800'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">{item.type.replace(/_/g, ' ')}</span>
                    <span className="text-[10px] opacity-60">{item.severity}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {item.type === 'FAILED_EXPORT' && (
                      <button
                        onClick={() => handleRetry(item.historyId)}
                        disabled={retrying === item.historyId}
                        className="px-2 py-0.5 text-[10px] bg-red-500/20 text-red-300 rounded hover:bg-red-500/30 transition-colors disabled:opacity-50"
                      >
                        {retrying === item.historyId ? '...' : 'Retry'}
                      </button>
                    )}
                    {item.type === 'MISSING_OUTPUT' && (
                      <button
                        onClick={() => handleExportAgain(item.historyId)}
                        disabled={retrying === item.historyId}
                        className="px-2 py-0.5 text-[10px] bg-amber-500/20 text-amber-300 rounded hover:bg-amber-500/30 transition-colors disabled:opacity-50"
                      >
                        {retrying === item.historyId ? '...' : 'Export Again'}
                      </button>
                    )}
                  </div>
                </div>
                <div className="text-[10px] opacity-70">{item.reason}</div>
                <div className="flex items-center gap-3 text-[10px] opacity-50">
                  {item.source && <span>{item.source}</span>}
                  {item.profile && <span>{item.profile}</span>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState message="No issues need attention." icon={CheckCircle2} />
        )}
      </div>

      {/* Recent Activity */}
      <div className="space-y-3">
        <SectionHeader icon={Clock} title="Recent Activity" count={rec.items.length} />
        {rec.items.length > 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left px-3 py-2 text-zinc-400 font-medium">Source</th>
                  <th className="text-left px-3 py-2 text-zinc-400 font-medium">Profile</th>
                  <th className="text-left px-3 py-2 text-zinc-400 font-medium">Type</th>
                  <th className="text-left px-3 py-2 text-zinc-400 font-medium">Status</th>
                  <th className="text-left px-3 py-2 text-zinc-400 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {rec.items.map((item, i) => (
                  <tr key={item.id || i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    <td className="px-3 py-2 text-zinc-200 truncate max-w-[120px]" title={item.source}>{item.source || '-'}</td>
                    <td className="px-3 py-2 text-zinc-300 truncate max-w-[80px]">{item.profile || '-'}</td>
                    <td className="px-3 py-2 text-zinc-400 capitalize">{item.exportType || '-'}</td>
                    <td className={`px-3 py-2 font-medium ${STATUS_COLORS[item.status] || 'text-zinc-400'}`}>{item.status}</td>
                    <td className="px-3 py-2 text-zinc-500">{item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState message="No recent exports." icon={Clock} />
        )}
      </div>

      {/* Secondary Row: Recovery + Output Health */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recovery Summary */}
        <div className="space-y-3">
          <SectionHeader icon={Shield} title="Recovery" />
          <div className="grid grid-cols-2 gap-2">
            <StatCard label="Failed" value={rv.failed || 0} icon={XCircle} color="text-red-400" />
            <StatCard label="Retry Ready" value={rv.retryReady || 0} icon={RotateCcw} color="text-amber-400" />
            <StatCard label="Missing Output" value={rv.missingOutputs || 0} icon={FileOutput} color="text-amber-400" />
            <StatCard label="Recently Recovered" value={rv.recentlyRecovered || 0} icon={CheckCircle2} color="text-green-400" />
          </div>
        </div>

        {/* Output Health */}
        <div className="space-y-3">
          <SectionHeader icon={Eye} title="Output Health" />
          <div className="grid grid-cols-2 gap-2">
            <StatCard label="Available" value={oh.available || 0} icon={CheckCircle2} color="text-green-400" />
            <StatCard label="Missing" value={oh.missing || 0} icon={XCircle} color="text-red-400" />
            <StatCard label="Invalid Path" value={oh.invalidPath || 0} icon={AlertTriangle} color="text-amber-400" />
            <StatCard label="Inaccessible" value={oh.inaccessible || 0} icon={Shield} color="text-amber-400" />
          </div>
        </div>
      </div>

      {/* Export Types + Profiles */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Export Types */}
        <div className="space-y-3">
          <SectionHeader icon={Package} title="Export Types" />
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {[
              { label: 'Cut', value: et.cut || 0, icon: Scissors },
              { label: 'Reel', value: et.reel || 0, icon: Film },
              { label: 'Split', value: et.split || 0, icon: SplitSquareHorizontal },
              { label: 'Bulk', value: et.bulk || 0, icon: Package },
              { label: 'Scheduled', value: et.scheduled || 0, icon: Calendar },
            ].map(t => (
              <div key={t.label} className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-center">
                <t.icon className="w-3.5 h-3.5 text-zinc-500 mx-auto mb-1" />
                <div className="text-sm font-bold text-zinc-100">{t.value}</div>
                <div className="text-[10px] text-zinc-500">{t.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Profiles */}
        <div className="space-y-3">
          <SectionHeader icon={Users} title="Profiles" />
          {pf.active && pf.active.length > 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 space-y-1.5 max-h-[200px] overflow-y-auto">
              {pf.active.slice(0, 8).map((p, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-zinc-200 truncate">{p.name}</span>
                    {p.platform && <span className="text-[10px] text-zinc-500">{p.platform}</span>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-zinc-400">{p.total}</span>
                    {p.failed > 0 && <span className="text-red-400 text-[10px]">{p.failed}F</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState message="No profile data." icon={Users} />
          )}
        </div>
      </div>

      {/* Schedule Summary */}
      {sch.available && sch.totalCount > 0 && (
        <div className="space-y-3">
          <SectionHeader icon={Calendar} title="Schedule" count={sch.upcomingCount} />
          {sch.items && sch.items.length > 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left px-3 py-2 text-zinc-400 font-medium">Source</th>
                    <th className="text-left px-3 py-2 text-zinc-400 font-medium">Profile</th>
                    <th className="text-left px-3 py-2 text-zinc-400 font-medium">Type</th>
                    <th className="text-left px-3 py-2 text-zinc-400 font-medium">Scheduled</th>
                    <th className="text-left px-3 py-2 text-zinc-400 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sch.items.slice(0, 5).map((item, i) => (
                    <tr key={item.id || i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                      <td className="px-3 py-2 text-zinc-200 truncate max-w-[120px]">{item.source || '-'}</td>
                      <td className="px-3 py-2 text-zinc-300">{item.profile || '-'}</td>
                      <td className="px-3 py-2 text-zinc-400 capitalize">{item.exportType || '-'}</td>
                      <td className="px-3 py-2 text-zinc-400">{item.scheduledAt ? new Date(item.scheduledAt).toLocaleString() : '-'}</td>
                      <td className={`px-3 py-2 font-medium ${STATUS_COLORS[item.status] || 'text-zinc-400'}`}>{item.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState message="No upcoming scheduled exports." icon={Calendar} />
          )}
        </div>
      )}

      {/* Quick Actions */}
      <div className="space-y-3">
        <SectionHeader icon={Zap} title="Quick Actions" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <QuickAction icon={Play} label="New Export" onClick={() => onNavigate?.('cut')} />
          <QuickAction icon={Package} label="Bulk Export" onClick={() => onNavigate?.('batch_queue')} />
          <QuickAction icon={Calendar} label="Schedule" onClick={() => onNavigate?.('schedule')} />
          <QuickAction icon={Clock} label="History" onClick={() => onNavigate?.('recovery')} />
          <QuickAction icon={Shield} label="Recovery" onClick={() => onNavigate?.('recovery')} />
          <QuickAction icon={BarChart3} label="Intelligence" onClick={() => onNavigate?.('dashboard')} />
        </div>
      </div>
    </div>
  )
}
