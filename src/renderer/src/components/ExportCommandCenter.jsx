import { useState, useEffect, useCallback, useMemo } from 'react'
import { formatDateTime } from '../utils/formatDateTime.mjs'
import {
  LayoutDashboard, RefreshCw, AlertTriangle, CheckCircle2, XCircle,
  Clock, Package, Users, Play, Pause, Square, Search, Filter,
  ArrowRight, Zap, Shield, Globe, Scissors, Film, SplitSquareHorizontal,
  Calendar, BarChart3, RotateCcw, FileOutput, Eye, CheckSquare, Square as SquareIcon,
  Trash2, PlayCircle, AlertOctagon, Ban, FolderOpen, History, Settings, ChevronDown, ChevronUp
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

const ACTION_RESULT_COLORS = {
  SUCCESS: 'text-green-400 bg-green-500/10',
  FAILED: 'text-red-400 bg-red-500/10',
  SKIPPED: 'text-amber-400 bg-amber-500/10',
  INVALID: 'text-zinc-400 bg-zinc-500/10',
  DUPLICATE: 'text-zinc-500 bg-zinc-500/10',
}

function StatCard({ label, value, icon: Icon, color = 'text-zinc-100', onClick, selected }) {
  return (
    <button
      onClick={onClick}
      className={`bg-zinc-900 border rounded-xl p-3 text-left hover:border-zinc-700 transition-colors ${
        selected ? 'border-brand-500/50 bg-brand-500/5' : 'border-zinc-800'
      }`}
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

function QuickAction({ icon: Icon, label, onClick, badge }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-300 hover:text-zinc-100 hover:border-zinc-700 hover:bg-zinc-800 transition-all relative"
    >
      {Icon && <Icon className="w-3.5 h-3.5 text-brand-400" />}
      <span>{label}</span>
      {badge > 0 && (
        <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
      <ArrowRight className="w-3 h-3 text-zinc-600 ml-auto" />
    </button>
  )
}

function ConfirmationDialog({ title, message, onConfirm, onCancel, confirmLabel = 'Confirm', loading, preflight }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-md w-full mx-4 space-y-4">
        <div className="flex items-center gap-3">
          <AlertOctagon className="w-5 h-5 text-amber-400" />
          <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
        </div>
        <p className="text-xs text-zinc-400">{message}</p>
        {preflight && (
          <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3 space-y-1.5">
            <div className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider">Recovery Preflight</div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-sm font-bold text-green-400">{preflight.ready?.length || 0}</div>
                <div className="text-[9px] text-zinc-500">Ready</div>
              </div>
              <div>
                <div className="text-sm font-bold text-amber-400">{preflight.blocked?.length || 0}</div>
                <div className="text-[9px] text-zinc-500">Blocked</div>
              </div>
              <div>
                <div className="text-sm font-bold text-zinc-400">{preflight.duplicates?.length || 0}</div>
                <div className="text-[9px] text-zinc-500">Duplicates</div>
              </div>
            </div>
            {preflight.blocked && preflight.blocked.length > 0 && (
              <div className="max-h-[60px] overflow-y-auto space-y-0.5">
                {preflight.blocked.slice(0, 3).map((b, i) => (
                  <div key={i} className="text-[9px] text-amber-400/70 truncate">
                    {b.id}: {b.reason}
                  </div>
                ))}
                {preflight.blocked.length > 3 && (
                  <div className="text-[9px] text-zinc-500">+{preflight.blocked.length - 3} more</div>
                )}
              </div>
            )}
          </div>
        )}
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-1.5 text-xs bg-brand-600 hover:bg-brand-500 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function ExecutionSummary({ summary, results, onClose }) {
  if (!summary) return null
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
          <CheckCircle2 className="w-4 h-4 text-green-400" />
          Execution Complete
        </div>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-xs">Dismiss</button>
      </div>
      <div className="grid grid-cols-5 gap-2 text-center">
        <div><div className="text-lg font-bold text-zinc-100">{summary.total}</div><div className="text-[10px] text-zinc-500">Total</div></div>
        <div><div className="text-lg font-bold text-green-400">{summary.completed}</div><div className="text-[10px] text-zinc-500">Started</div></div>
        <div><div className="text-lg font-bold text-red-400">{summary.failed}</div><div className="text-[10px] text-zinc-500">Failed</div></div>
        <div><div className="text-lg font-bold text-amber-400">{summary.skipped}</div><div className="text-[10px] text-zinc-500">Skipped</div></div>
        <div><div className="text-lg font-bold text-zinc-400">{summary.total - summary.completed - summary.failed - summary.skipped}</div><div className="text-[10px] text-zinc-500">Other</div></div>
      </div>
      {results && results.length > 0 && (
        <div className="max-h-[150px] overflow-y-auto space-y-1">
          {results.map((r, i) => (
            <div key={i} className={`flex items-center justify-between text-[10px] px-2 py-1 rounded ${ACTION_RESULT_COLORS[r.status] || 'text-zinc-400'}`}>
              <span className="truncate max-w-[200px]">{r.id}</span>
              <span className="font-medium">{r.status}{r.error ? `: ${r.error}` : r.reason ? `: ${r.reason}` : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SelectableRecord({ item, selected, onToggle, onRetry, onExportAgain, onOpenFolder, retrying }) {
  return (
    <div className={`border rounded-xl p-3 space-y-1 transition-colors ${
      selected ? 'border-brand-500/50 bg-brand-500/5' : 'border-zinc-800 bg-zinc-900'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onToggle(item.id)}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {selected ? <CheckSquare className="w-4 h-4 text-brand-400" /> : <SquareIcon className="w-4 h-4" />}
          </button>
          <span className="text-xs text-zinc-200 font-medium truncate max-w-[150px]">{item.source || '-'}</span>
          {item.profile && <span className="text-[10px] text-zinc-500">{item.profile}</span>}
        </div>
        <div className="flex items-center gap-1">
          <span className={`text-[10px] font-medium ${STATUS_COLORS[item.status] || 'text-zinc-400'}`}>{item.status}</span>
          {item.status === 'FAILED' && (
            <button
              onClick={() => onRetry(item.id)}
              disabled={retrying === item.id}
              className="px-2 py-0.5 text-[10px] bg-red-500/20 text-red-300 rounded hover:bg-red-500/30 transition-colors disabled:opacity-50"
            >
              {retrying === item.id ? '...' : 'Retry'}
            </button>
          )}
          {item.status === 'COMPLETED' && item.hasMissingOutput && (
            <button
              onClick={() => onExportAgain(item.id)}
              disabled={retrying === item.id}
              className="px-2 py-0.5 text-[10px] bg-amber-500/20 text-amber-300 rounded hover:bg-amber-500/30 transition-colors disabled:opacity-50"
            >
              {retrying === item.id ? '...' : 'Export Again'}
            </button>
          )}
          {item.outputPath && (
            <button
              onClick={() => onOpenFolder?.(item.outputPath)}
              className="px-1.5 py-0.5 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
              title="Open output folder"
            >
              <FolderOpen className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 text-[10px] text-zinc-500">
        <span className="capitalize">{item.exportType || '-'}</span>
        {item.platform && <span>{item.platform}</span>}
        {item.createdAt && <span>{formatDateTime(item.createdAt)}</span>}
      </div>
    </div>
  )
}

export default function ExportCommandCenter({ onNavigate }) {
  const [snapshot, setSnapshot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [retrying, setRetrying] = useState(null)

  // Phase 5J: Workflow state
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [confirmDialog, setConfirmDialog] = useState(null)
  const [executing, setExecuting] = useState(false)
  const [executionResult, setExecutionResult] = useState(null)
  const [workflowFilter, setWorkflowFilter] = useState('all')
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [advancedFilters, setAdvancedFilters] = useState({
    profileId: '',
    platform: '',
    exportType: '',
    dateFrom: '',
    dateTo: '',
    recoveryState: '',
    attentionState: '',
  })

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

  // Phase 5J: Bulk selection
  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = (ids) => {
    setSelectedIds(prev => {
      if (prev.size === ids.length) return new Set()
      return new Set(ids)
    })
  }

  // Phase 5J: Bulk actions
  const handleBulkRetry = async () => {
    if (selectedIds.size === 0) return
    try {
      const ids = Array.from(selectedIds)
      const preflight = await window.api.planWorkflowBulk('retry', ids)
      const readyCount = preflight.ready?.length || 0
      const blockedCount = preflight.blocked?.length || 0
      const duplicateCount = preflight.duplicates?.length || 0
      let message = `Retry ${readyCount} eligible record(s)?`
      if (blockedCount > 0) message += ` ${blockedCount} will be skipped (blocked).`
      if (duplicateCount > 0) message += ` ${duplicateCount} duplicate(s) removed.`
      setConfirmDialog({
        title: 'Retry Failed Exports',
        message,
        action: 'retry',
        confirmLabel: `Retry ${readyCount} Record(s)`,
        preflight,
      })
    } catch (_) {
      setConfirmDialog({
        title: 'Retry Failed Exports',
        message: `Retry ${selectedIds.size} selected failed export(s)? This will create new history records for each retry.`,
        action: 'retry',
        confirmLabel: `Retry ${selectedIds.size} Record(s)`,
      })
    }
  }

  const handleBulkExportAgain = async () => {
    if (selectedIds.size === 0) return
    try {
      const ids = Array.from(selectedIds)
      const preflight = await window.api.planWorkflowBulk('export_again', ids)
      const readyCount = preflight.ready?.length || 0
      const blockedCount = preflight.blocked?.length || 0
      const duplicateCount = preflight.duplicates?.length || 0
      let message = `Re-export ${readyCount} eligible record(s) with missing outputs?`
      if (blockedCount > 0) message += ` ${blockedCount} will be skipped (blocked).`
      if (duplicateCount > 0) message += ` ${duplicateCount} duplicate(s) removed.`
      setConfirmDialog({
        title: 'Export Again',
        message,
        action: 'export_again',
        confirmLabel: `Export Again ${readyCount} Record(s)`,
        preflight,
      })
    } catch (_) {
      setConfirmDialog({
        title: 'Export Again',
        message: `Re-export ${selectedIds.size} selected record(s) with missing outputs? This will create new history records.`,
        action: 'export_again',
        confirmLabel: `Export Again ${selectedIds.size} Record(s)`,
      })
    }
  }

  const executeBulkAction = async (actionType) => {
    setExecuting(true)
    setConfirmDialog(null)
    try {
      const ids = Array.from(selectedIds)
      const result = await window.api.executeWorkflowBulk(actionType, ids)
      if (result.success) {
        setExecutionResult(result)
        setSelectedIds(new Set())
        await fetchSnapshot()
      }
    } catch (_) {}
    setExecuting(false)
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
  const wf = s.workflow || {}

  // Build selectable records from recent activity
  const selectableRecords = rec.items.map(item => ({
    ...item,
    hasMissingOutput: item.status === 'COMPLETED' && (!item.outputPath || item.outputPath === ''),
  }))

  // Filter selectable records by workflow filter
  const filteredRecords = selectableRecords.filter(r => {
    if (workflowFilter === 'all') return true
    if (workflowFilter === 'failed') return r.status === 'FAILED'
    if (workflowFilter === 'retry_ready') return r.status === 'FAILED'
    if (workflowFilter === 'missing_output') return r.status === 'COMPLETED' && r.hasMissingOutput
    if (workflowFilter === 'completed') return r.status === 'COMPLETED'
    return true
  })

  const allIds = filteredRecords.map(r => r.id).filter(Boolean)
  const allSelected = allIds.length > 0 && allIds.every(id => selectedIds.has(id))

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      {/* Confirmation Dialog */}
      {confirmDialog && (
        <ConfirmationDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel}
          loading={executing}
          onConfirm={() => executeBulkAction(confirmDialog.action)}
          onCancel={() => setConfirmDialog(null)}
        />
      )}

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

      {/* Execution Summary */}
      {executionResult && (
        <ExecutionSummary
          summary={executionResult.summary}
          results={executionResult.results}
          onClose={() => setExecutionResult(null)}
        />
      )}

      {/* Executing Progress */}
      {executing && (
        <div className="bg-brand-500/10 border border-brand-500/30 rounded-xl p-3 flex items-center gap-3">
          <RefreshCw className="w-4 h-4 text-brand-400 animate-spin" />
          <span className="text-xs text-brand-300">Executing bulk action...</span>
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Processing" value={ov.processing || 0} icon={Play} color={ov.processing > 0 ? 'text-blue-400' : 'text-zinc-400'} />
        <StatCard label="Queued" value={ov.queued || 0} icon={Package} color={ov.queued > 0 ? 'text-amber-400' : 'text-zinc-400'} />
        <StatCard label="Scheduled" value={ov.scheduled || 0} icon={Calendar} color={ov.scheduled > 0 ? 'text-purple-400' : 'text-zinc-400'} />
        <StatCard label="Attention" value={ov.attention || 0} icon={AlertTriangle} color={ov.attention > 0 ? 'text-red-400' : 'text-green-400'} />
      </div>

      {/* Phase 5J: Workflow Summary Cards */}
      {wf && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Retry Ready"
            value={wf.recovery ? wf.recovery.retryReady || 0 : rv.retryReady || 0}
            icon={RotateCcw}
            color="text-amber-400"
          />
          <StatCard
            label="Export Again"
            value={wf.recovery ? wf.recovery.exportAgainReady || 0 : rv.missingOutputs || 0}
            icon={FileOutput}
            color="text-amber-400"
          />
          <StatCard
            label="Blocked"
            value={wf.attention ? wf.attention.blockedRecovery || 0 : 0}
            icon={Ban}
            color="text-red-400"
          />
          <StatCard
            label="Needs Attention"
            value={wf.attention ? wf.attention.needsAttention || 0 : ov.attention || 0}
            icon={AlertTriangle}
            color="text-red-400"
          />
        </div>
      )}

      {/* Filters */}
      <div className="space-y-2">
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
          <button
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-900 border border-zinc-800 rounded-lg transition-colors"
          >
            <Filter className="w-3 h-3" />
            Advanced
            {showAdvancedFilters ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
        {showAdvancedFilters && (
          <div className="flex items-center gap-2 flex-wrap bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
            <select
              value={advancedFilters.exportType}
              onChange={e => setAdvancedFilters(prev => ({ ...prev, exportType: e.target.value }))}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-[10px] text-zinc-300"
            >
              <option value="">All Types</option>
              <option value="cut">Cut</option>
              <option value="reel">Reel</option>
              <option value="split">Split</option>
            </select>
            <select
              value={advancedFilters.recoveryState}
              onChange={e => setAdvancedFilters(prev => ({ ...prev, recoveryState: e.target.value }))}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-[10px] text-zinc-300"
            >
              <option value="">All Recovery</option>
              <option value="retry_ready">Retry Ready</option>
              <option value="missing_output">Missing Output</option>
              <option value="blocked">Blocked</option>
            </select>
            <select
              value={advancedFilters.attentionState}
              onChange={e => setAdvancedFilters(prev => ({ ...prev, attentionState: e.target.value }))}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-[10px] text-zinc-300"
            >
              <option value="">All Attention</option>
              <option value="needs_attention">Needs Attention</option>
              <option value="normal">Normal</option>
              <option value="archived">Archived</option>
            </select>
            <input
              type="date"
              value={advancedFilters.dateFrom}
              onChange={e => setAdvancedFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-[10px] text-zinc-300"
              placeholder="From"
            />
            <input
              type="date"
              value={advancedFilters.dateTo}
              onChange={e => setAdvancedFilters(prev => ({ ...prev, dateTo: e.target.value }))}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-[10px] text-zinc-300"
              placeholder="To"
            />
            <button
              onClick={() => setAdvancedFilters({ profileId: '', platform: '', exportType: '', dateFrom: '', dateTo: '', recoveryState: '', attentionState: '' })}
              className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Clear
            </button>
          </div>
        )}
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

      {/* Phase 5J: Bulk Action Toolbar */}
      {selectedIds.size > 0 && (
        <div className="bg-brand-500/10 border border-brand-500/30 rounded-xl p-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckSquare className="w-4 h-4 text-brand-400" />
            <span className="text-xs text-brand-300 font-medium">{selectedIds.size} record(s) selected</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleBulkRetry}
              disabled={executing}
              className="px-3 py-1.5 text-[10px] bg-red-500/20 text-red-300 rounded-lg hover:bg-red-500/30 transition-colors disabled:opacity-50"
            >
              Retry Selected
            </button>
            <button
              onClick={handleBulkExportAgain}
              disabled={executing}
              className="px-3 py-1.5 text-[10px] bg-amber-500/20 text-amber-300 rounded-lg hover:bg-amber-500/30 transition-colors disabled:opacity-50"
            >
              Export Again Selected
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-3 py-1.5 text-[10px] text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}

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

      {/* Phase 5J: Selectable Records with Workflow Filters */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <SectionHeader icon={Clock} title="Recent Activity" count={rec.items.length} />
          <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-0.5">
            {[
              { key: 'all', label: 'All' },
              { key: 'failed', label: 'Failed' },
              { key: 'retry_ready', label: 'Retry Ready' },
              { key: 'missing_output', label: 'Missing' },
              { key: 'completed', label: 'Completed' },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => { setWorkflowFilter(f.key); setSelectedIds(new Set()) }}
                className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                  workflowFilter === f.key
                    ? 'bg-brand-600/20 text-brand-400'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        {filteredRecords.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <button
                onClick={() => selectAll(allIds)}
                className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1"
              >
                {allSelected ? <CheckSquare className="w-3 h-3" /> : <SquareIcon className="w-3 h-3" />}
                Select all ({allIds.length})
              </button>
              {selectedIds.size > 0 && (
                <span className="text-[10px] text-brand-400">{selectedIds.size} selected</span>
              )}
            </div>
            {filteredRecords.map((item, i) => (
              <SelectableRecord
                key={item.id || i}
                item={item}
                selected={selectedIds.has(item.id)}
                onToggle={toggleSelect}
                onRetry={handleRetry}
                onExportAgain={handleExportAgain}
                onOpenFolder={(path) => {
                  if (path && window.api?.showInFolder) {
                    window.api.showInFolder(path)
                  }
                }}
                retrying={retrying}
              />
            ))}
          </div>
        ) : (
          <EmptyState message="No records match filters." icon={Clock} />
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
          <QuickAction
            icon={RotateCcw}
            label="Retry Failed"
            onClick={() => {
              const failedIds = rec.items.filter(r => r.status === 'FAILED').map(r => r.id).filter(Boolean)
              if (failedIds.length > 0) {
                setSelectedIds(new Set(failedIds))
                handleBulkRetry()
              }
            }}
            badge={rec.items.filter(r => r.status === 'FAILED').length}
          />
          <QuickAction
            icon={FileOutput}
            label="Export Again"
            onClick={() => {
              const missingIds = rec.items.filter(r => r.status === 'COMPLETED' && (!r.outputPath || r.outputPath === '')).map(r => r.id).filter(Boolean)
              if (missingIds.length > 0) {
                setSelectedIds(new Set(missingIds))
                handleBulkExportAgain()
              }
            }}
            badge={rec.items.filter(r => r.status === 'COMPLETED' && (!r.outputPath || r.outputPath === '')).length}
          />
          <QuickAction icon={BarChart3} label="Intelligence" onClick={() => onNavigate?.('dashboard')} />
        </div>
      </div>
    </div>
  )
}
