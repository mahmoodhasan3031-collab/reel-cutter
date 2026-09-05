import { useState, useEffect, useRef } from 'react'
import {
  Layers,
  Play,
  Pause,
  Plus,
  Trash2,
  Square,
  Sparkles,
  Lock,
  FolderOpen,
  CheckCircle,
  AlertCircle,
  Clock,
  Loader2,
  Film,
  Sliders,
  ChevronDown,
  ChevronRight,
  UploadCloud,
  Check,
} from 'lucide-react'
import ProgressBar from './ProgressBar'
import { hasFeature } from '../utils/features'

const VALID_EXTENSIONS = ['.mp4', '.mkv', '.mov', '.avi', '.webm', '.m4v', '.flv']

const ASPECT_OPTIONS = [
  { id: '9:16', label: '9:16' },
  { id: '1:1',  label: '1:1' },
  { id: '4:5',  label: '4:5' },
  { id: '16:9', label: '16:9' },
]

const QUALITY_OPTIONS = [
  { id: '1080p', label: '1080p Full HD' },
  { id: '4k',    label: '4K Ultra HD' },
]

const OP_OPTIONS = [
  { id: 'reel',  label: 'Make Reel (9:16)' },
  { id: 'split', label: 'Split into Segments' },
  { id: 'cut',   label: 'Cut Clip' },
]

export default function BatchQueuePanel({
  licenseTier = 'standard',
  onOpenUpgrade,
}) {
  const isPro = hasFeature(licenseTier, 'batch_queue')
  const [queueState, setQueueState] = useState({
    items: [],
    totalCount: 0,
    runningCount: 0,
    waitingCount: 0,
    doneCount: 0,
    errorCount: 0,
    isRunning: false,
    concurrency: 1,
  })

  const [expandedItemId, setExpandedItemId] = useState(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef(null)

  // Fetch initial queue state & subscribe to push events
  useEffect(() => {
    if (!isPro) return

    window.api.batchGetState?.().then((res) => {
      if (res && res.success && res.state) {
        setQueueState(res.state)
      }
    })

    const handleItemUpdate = ({ item }) => {
      setQueueState((prev) => {
        const nextItems = prev.items.map((it) => (it.id === item.id ? item : it))
        return { ...prev, items: nextItems }
      })
    }

    const handleQueueUpdate = (state) => {
      if (state) setQueueState(state)
    }

    const handleQueueDone = (state) => {
      if (state) setQueueState(state)
    }

    window.api.onBatchItemUpdate?.(handleItemUpdate)
    window.api.onBatchQueueUpdate?.(handleQueueUpdate)
    window.api.onBatchQueueDone?.(handleQueueDone)

    return () => {
      window.api.off?.('batch:itemUpdate')
      window.api.off?.('batch:queueUpdate')
      window.api.off?.('batch:queueDone')
    }
  }, [isPro])

  // ── Drag and drop multi-file handler ─────────────────────────────────────────

  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = async (e) => {
    e.preventDefault()
    setIsDragOver(false)

    if (!isPro) {
      onOpenUpgrade?.('pro', 'Batch Queue')
      return
    }

    const files = Array.from(e.dataTransfer.files || [])
    const validFiles = files.filter((f) => {
      const ext = (f.name.slice(f.name.lastIndexOf('.')) || '').toLowerCase()
      return VALID_EXTENSIONS.includes(ext)
    })

    if (validFiles.length === 0) return

    const itemsToAdd = validFiles.map((f) => ({
      inputPath: f.path,
      operation: 'reel',
      mode: 'blur',
      aspectRatio: '9:16',
      quality: '1080p',
      duration: 30,
      interval: 30,
      useSmartCrop: false,
      generateThumbnail: false,
    }))

    const res = await window.api.batchAdd(itemsToAdd)
    if (res && res.success && res.state) {
      setQueueState(res.state)
    }
  }

  // ── Browse multi-files ───────────────────────────────────────────────────────

  const handleBrowseFiles = async () => {
    if (!isPro) {
      onOpenUpgrade?.('pro', 'Batch Queue')
      return
    }

    const filePaths = await window.api.selectFiles?.()
    if (!filePaths || filePaths.length === 0) return

    const itemsToAdd = filePaths.map((p) => ({
      inputPath: p,
      operation: 'reel',
      mode: 'blur',
      aspectRatio: '9:16',
      quality: '1080p',
      duration: 30,
      interval: 30,
      useSmartCrop: false,
      generateThumbnail: false,
    }))

    const res = await window.api.batchAdd(itemsToAdd)
    if (res && res.success && res.state) {
      setQueueState(res.state)
    }
  }

  // ── Queue Actions ────────────────────────────────────────────────────────────

  const handleStartQueue = async () => {
    const res = await window.api.batchStart()
    if (res && res.success && res.state) {
      setQueueState(res.state)
    }
  }

  const handlePauseQueue = async () => {
    const res = await window.api.batchPause()
    if (res && res.success && res.state) {
      setQueueState(res.state)
    }
  }

  const handleClearCompleted = async () => {
    const res = await window.api.batchClearCompleted()
    if (res && res.success && res.state) {
      setQueueState(res.state)
    }
  }

  const handleCancelAll = async () => {
    const res = await window.api.batchCancelAll()
    if (res && res.success && res.state) {
      setQueueState(res.state)
    }
  }

  const handleRemoveItem = async (id) => {
    const res = await window.api.batchRemove(id)
    if (res && res.success && res.state) {
      setQueueState(res.state)
    }
  }

  const handleCancelItem = async (id) => {
    const res = await window.api.batchCancelItem(id)
    if (res && res.success && res.state) {
      setQueueState(res.state)
    }
  }

  const handleUpdateItem = async (id, updates) => {
    const res = await window.api.batchUpdateItem(id, updates)
    if (res && res.success && res.state) {
      setQueueState(res.state)
    }
  }

  const handleToggleConcurrency = async () => {
    const nextConcurrency = queueState.concurrency === 1 ? 2 : 1
    const res = await window.api.batchSetConcurrency(nextConcurrency)
    if (res && res.success && res.state) {
      setQueueState(res.state)
    }
  }

  // ── Locked State for Non-Pro ─────────────────────────────────────────────────

  if (!isPro) {
    return (
      <div className="flex flex-col gap-5 animate-slide-up max-w-3xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
              <Layers size={18} className="text-brand-400" />
              Batch Queue
              <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-brand-600/20 text-brand-300 border border-brand-500/30">
                PRO FEATURE
              </span>
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Automate rendering of multiple video files and queued splits with background concurrency.
            </p>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 flex flex-col items-center text-center relative overflow-hidden">
          <div className="w-14 h-14 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 mb-4 shadow-inner">
            <Lock size={24} className="text-brand-400" />
          </div>

          <h3 className="text-sm font-bold text-zinc-100 mb-1">
            Batch Queue is locked on your current plan
          </h3>
          <p className="text-xs text-zinc-400 max-w-md mb-6 leading-relaxed">
            Upgrade your Reel Cutter license to the Pro tier ($30 one-time) to queue multiple videos, configure independent per-video settings, and process jobs sequentially or with 2x concurrency.
          </p>

          <button
            onClick={() => onOpenUpgrade?.('pro', 'Batch Queue')}
            className="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-brand-900/40 transition-colors flex items-center gap-2"
          >
            <Sparkles size={14} />
            Unlock with Pro ($30)
          </button>
        </div>
      </div>
    )
  }

  // ── Overall Progress Calculation ─────────────────────────────────────────────

  const overallPercent =
    queueState.totalCount > 0
      ? Math.round(((queueState.doneCount + queueState.errorCount) / queueState.totalCount) * 100)
      : 0

  return (
    <div className="flex flex-col gap-5 animate-slide-up max-w-4xl pb-12">
      {/* Header Bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
            <Layers size={18} className="text-brand-400" />
            Batch Processing Queue
            <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-brand-600/20 text-brand-300 border border-brand-500/30">
              PRO
            </span>
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Process multiple videos with independent durations, crop styles, and AI enhancements.
          </p>
        </div>

        {/* Concurrency Selector */}
        <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl p-1.5">
          <span className="text-[11px] text-zinc-400 pl-2">Mode:</span>
          <button
            type="button"
            onClick={handleToggleConcurrency}
            className="px-2.5 py-1 text-xs rounded-lg font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors flex items-center gap-1.5"
            title="Toggle between sequential (1 job) and parallel (2 jobs max)"
          >
            <span className="w-2 h-2 rounded-full bg-brand-400" />
            {queueState.concurrency === 1 ? 'Sequential (1 Job)' : 'Parallel (2 Max)'}
          </button>
        </div>
      </div>

      {/* Queue Stats Card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-4">
            <span className="text-zinc-400">
              Total: <strong className="text-zinc-200">{queueState.totalCount}</strong>
            </span>
            <span className="text-amber-400/90">
              Waiting: <strong>{queueState.waitingCount}</strong>
            </span>
            <span className="text-brand-400">
              Processing: <strong>{queueState.runningCount}</strong>
            </span>
            <span className="text-emerald-400">
              Done: <strong>{queueState.doneCount}</strong>
            </span>
            {queueState.errorCount > 0 && (
              <span className="text-rose-400">
                Errors: <strong>{queueState.errorCount}</strong>
              </span>
            )}
          </div>

          <div className="text-xs text-zinc-400 font-mono">
            {queueState.doneCount} of {queueState.totalCount} completed
          </div>
        </div>

        {/* Overall progress bar */}
        {queueState.totalCount > 0 && (
          <div className="space-y-1">
            <ProgressBar progress={overallPercent} />
          </div>
        )}

        {/* Primary Controls */}
        <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={handleBrowseFiles}
              className="px-3.5 py-1.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Plus size={14} /> Add Videos
            </button>

            {queueState.isRunning ? (
              <button
                onClick={handlePauseQueue}
                className="px-3.5 py-1.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
              >
                <Pause size={14} /> Pause Queue
              </button>
            ) : (
              <button
                onClick={handleStartQueue}
                disabled={queueState.waitingCount === 0}
                className="px-3.5 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 disabled:opacity-40 disabled:pointer-events-none text-emerald-300 border border-emerald-500/40 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
              >
                <Play size={14} /> Start Queue
              </button>
            )}

            {queueState.runningCount > 0 && (
              <button
                onClick={handleCancelAll}
                className="px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
              >
                <Square size={13} /> Cancel All
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {(queueState.doneCount > 0 || queueState.errorCount > 0) && (
              <button
                onClick={handleClearCompleted}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors"
              >
                <Trash2 size={13} /> Clear Completed
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Drop Zone (always available) */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleBrowseFiles}
        className={`border-2 border-dashed rounded-2xl p-6 transition-all cursor-pointer flex flex-col items-center justify-center gap-2 text-center ${
          isDragOver
            ? 'border-brand-500 bg-brand-500/10 scale-[1.005]'
            : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900/60'
        }`}
      >
        <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400">
          <UploadCloud size={20} className={isDragOver ? 'text-brand-400' : ''} />
        </div>
        <p className="text-xs font-semibold text-zinc-200">
          Drag & drop multiple videos here, or <span className="text-brand-400 underline">browse</span>
        </p>
        <p className="text-[10px] text-zinc-500">Supports .mp4, .mkv, .mov, .avi, .webm</p>
      </div>

      {/* Queue Items List */}
      <div className="space-y-3">
        {queueState.items.length === 0 ? (
          <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-8 text-center text-zinc-500 text-xs">
            Queue is empty. Add videos above to start batch processing.
          </div>
        ) : (
          queueState.items.map((item, index) => {
            const isExpanded = expandedItemId === item.id
            const isWaiting = item.status === 'WAITING'
            const isProcessing = item.status === 'PROCESSING'
            const isDone = item.status === 'DONE'
            const isError = item.status === 'ERROR'

            return (
              <div
                key={item.id}
                className={`bg-zinc-900 border rounded-2xl p-4 transition-all space-y-3 ${
                  isProcessing
                    ? 'border-brand-500/50 bg-brand-950/10 ring-1 ring-brand-500/20'
                    : isError
                    ? 'border-rose-900/50 bg-rose-950/10'
                    : isDone
                    ? 'border-emerald-900/40 bg-emerald-950/5'
                    : 'border-zinc-800'
                }`}
              >
                {/* Main Row */}
                <div className="flex items-center gap-3">
                  {/* Queue Position */}
                  <span className="text-xs font-mono font-bold text-zinc-500 w-6">
                    #{index + 1}
                  </span>

                  {/* Icon */}
                  <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400 shrink-0">
                    <Film size={16} />
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold text-zinc-200 truncate" title={item.inputPath}>
                        {item.filename}
                      </p>

                      {/* Status Badge */}
                      {isWaiting && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium flex items-center gap-1">
                          <Clock size={10} /> Waiting
                        </span>
                      )}
                      {isProcessing && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/30 font-medium flex items-center gap-1 animate-pulse">
                          <Loader2 size={10} className="animate-spin" /> Processing ({item.progress}%)
                        </span>
                      )}
                      {isDone && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium flex items-center gap-1">
                          <CheckCircle size={10} /> Done
                        </span>
                      )}
                      {isError && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium flex items-center gap-1">
                          <AlertCircle size={10} /> Error
                        </span>
                      )}
                    </div>

                    {/* Settings Summary Chips */}
                    <div className="flex items-center gap-1.5 flex-wrap mt-1 text-[10px] text-zinc-400">
                      <span className="px-1.5 py-0.5 bg-zinc-800 rounded font-medium uppercase">
                        {item.operation}
                      </span>
                      <span className="px-1.5 py-0.5 bg-zinc-800 rounded font-medium">
                        {item.aspectRatio}
                      </span>
                      <span className="px-1.5 py-0.5 bg-zinc-800 rounded font-medium uppercase">
                        {item.quality}
                      </span>
                      {item.mode === 'smart_crop' && (
                        <span className="px-1.5 py-0.5 bg-brand-600/20 text-brand-300 border border-brand-500/30 rounded font-medium flex items-center gap-0.5">
                          <Sparkles size={8} /> Smart Crop
                        </span>
                      )}
                      {item.generateThumbnail && (
                        <span className="px-1.5 py-0.5 bg-purple-600/20 text-purple-300 border border-purple-500/30 rounded font-medium">
                          Pro Cover
                        </span>
                      )}
                      {item.duration && (
                        <span className="text-zinc-500">{item.duration}s</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Settings Editor Toggle for WAITING items */}
                    {isWaiting && (
                      <button
                        onClick={() => setExpandedItemId(isExpanded ? null : item.id)}
                        className={`p-1.5 rounded-lg border text-xs transition-colors flex items-center gap-1 ${
                          isExpanded
                            ? 'bg-brand-600/20 text-brand-300 border-brand-500/40'
                            : 'bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border-zinc-700'
                        }`}
                        title="Edit per-video settings"
                      >
                        <Sliders size={13} />
                        <span className="text-[10px] pr-0.5">Settings</span>
                        {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      </button>
                    )}

                    {/* Show in folder for DONE items */}
                    {isDone && item.result?.outputPath && (
                      <button
                        onClick={() => window.api.showInFolder?.(item.result.outputPath)}
                        className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
                        title="Show output in file explorer"
                      >
                        <FolderOpen size={14} />
                      </button>
                    )}

                    {/* Cancel button for PROCESSING item */}
                    {isProcessing && (
                      <button
                        onClick={() => handleCancelItem(item.id)}
                        className="p-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 transition-colors"
                        title="Cancel this job"
                      >
                        <Square size={13} />
                      </button>
                    )}

                    {/* Remove button for WAITING or ERROR or DONE items */}
                    {!isProcessing && (
                      <button
                        onClick={() => handleRemoveItem(item.id)}
                        className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-rose-900/30 hover:text-rose-400 text-zinc-400 border border-zinc-700/60 transition-colors"
                        title="Remove from queue"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress bar for actively processing item */}
                {isProcessing && (
                  <div className="pt-1">
                    <ProgressBar progress={item.progress || 0} />
                    {item.currentSegment && item.totalSegments && (
                      <p className="text-[10px] text-zinc-500 mt-1 text-right font-mono">
                        Segment {item.currentSegment} of {item.totalSegments}
                      </p>
                    )}
                  </div>
                )}

                {/* Error message card */}
                {isError && item.error && (
                  <div className="bg-rose-950/30 border border-rose-800/40 rounded-xl p-2.5 text-xs text-rose-300 flex items-start gap-2">
                    <AlertCircle size={14} className="mt-0.5 shrink-0 text-rose-400" />
                    <p className="leading-snug break-all">{item.error}</p>
                  </div>
                )}

                {/* Per-Video Settings Editor (Collapsible) */}
                {isExpanded && isWaiting && (
                  <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-3.5 space-y-3 pt-3 animate-fade-in text-xs">
                    <p className="text-[11px] font-semibold text-zinc-300 border-b border-zinc-800 pb-1.5 flex items-center gap-1.5">
                      <Sliders size={12} className="text-brand-400" />
                      Individual Settings for: <span className="text-zinc-100 font-mono">{item.filename}</span>
                    </p>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {/* Operation Type */}
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-400">Operation</label>
                        <select
                          value={item.operation}
                          onChange={(e) => handleUpdateItem(item.id, { operation: e.target.value })}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-1.5 text-xs text-zinc-200"
                        >
                          {OP_OPTIONS.map((o) => (
                            <option key={o.id} value={o.id}>{o.label}</option>
                          ))}
                        </select>
                      </div>

                      {/* Aspect Ratio */}
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-400">Aspect Ratio</label>
                        <select
                          value={item.aspectRatio}
                          onChange={(e) => handleUpdateItem(item.id, { aspectRatio: e.target.value })}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-1.5 text-xs text-zinc-200"
                        >
                          {ASPECT_OPTIONS.map((a) => (
                            <option key={a.id} value={a.id}>{a.label}</option>
                          ))}
                        </select>
                      </div>

                      {/* Quality */}
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-400">Quality</label>
                        <select
                          value={item.quality}
                          onChange={(e) => handleUpdateItem(item.id, { quality: e.target.value })}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-1.5 text-xs text-zinc-200"
                        >
                          {QUALITY_OPTIONS.map((q) => (
                            <option key={q.id} value={q.id}>{q.label}</option>
                          ))}
                        </select>
                      </div>

                      {/* Segment / Clip Duration */}
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-400">
                          {item.operation === 'split' ? 'Interval (seconds)' : 'Duration (seconds)'}
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="3600"
                          value={item.operation === 'split' ? item.interval : (item.duration || 30)}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 30
                            handleUpdateItem(item.id, item.operation === 'split' ? { interval: val } : { duration: val })
                          }}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-1.5 text-xs text-zinc-200"
                        />
                      </div>

                      {/* Smart Crop Toggle */}
                      <div className="space-y-1 flex flex-col justify-end">
                        <label className="flex items-center gap-2 cursor-pointer p-1.5 rounded-lg bg-zinc-900 border border-zinc-700/60 hover:border-zinc-600">
                          <input
                            type="checkbox"
                            checked={item.mode === 'smart_crop'}
                            onChange={(e) => handleUpdateItem(item.id, { useSmartCrop: e.target.checked })}
                            className="rounded border-zinc-700 text-brand-600 focus:ring-brand-500"
                          />
                          <span className="text-[11px] text-zinc-300 flex items-center gap-1 font-medium">
                            <Sparkles size={11} className="text-brand-400" /> Smart Crop (AI)
                          </span>
                        </label>
                      </div>

                      {/* Pro Thumbnail Toggle */}
                      <div className="space-y-1 flex flex-col justify-end">
                        <label className="flex items-center gap-2 cursor-pointer p-1.5 rounded-lg bg-zinc-900 border border-zinc-700/60 hover:border-zinc-600">
                          <input
                            type="checkbox"
                            checked={!!item.generateThumbnail}
                            onChange={(e) => handleUpdateItem(item.id, { useThumbnail: e.target.checked })}
                            className="rounded border-zinc-700 text-brand-600 focus:ring-brand-500"
                          />
                          <span className="text-[11px] text-zinc-300 font-medium">
                            Pro Thumbnail Cover
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
