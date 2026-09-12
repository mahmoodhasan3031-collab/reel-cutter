import React, { useState, useEffect, useCallback } from 'react'
import {
  Layers,
  CheckSquare,
  Square,
  Trash2,
  ChevronUp,
  ChevronDown,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Clock,
  SlidersHorizontal,
  Play,
  XCircle,
  Ban,
  FolderOpen,
  Info,
} from 'lucide-react'

const MAX_BULK_PROFILES = 10
const MIN_BULK_PROFILES = 1

const PLATFORM_COLORS = {
  Facebook: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
  Instagram: 'text-pink-400 border-pink-500/30 bg-pink-500/10',
  YouTube: 'text-red-400 border-red-500/30 bg-red-500/10',
  TikTok: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10',
  Other: 'text-zinc-400 border-zinc-700 bg-zinc-800/40',
}

/**
 * Safely extracts filename from a full path or name string in browser context.
 */
function getFilename(fullPathOrName) {
  if (!fullPathOrName || typeof fullPathOrName !== 'string') return ''
  return fullPathOrName.replace(/\\/g, '/').split('/').pop() || fullPathOrName
}

/**
 * MultiProfileSelector Component — Phase 2C-3
 *
 * Allows selecting multiple enabled Page Profiles for bulk export planning and execution.
 * Generates an immutable, validated job plan with preview, reordering, and removal,
 * and executes bulk export jobs using the native Batch Queue engine.
 */
export default function MultiProfileSelector({
  videoPath,
  exportType = 'cut',
  exportOptions = {},
  disabled = false,
  onPlanCreated,
  onExecutingChange,
}) {
  const [profiles, setProfiles] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(false)
  const [creatingPlan, setCreatingPlan] = useState(false)
  const [error, setError] = useState(null)
  const [validationMessage, setValidationMessage] = useState(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const [jobStates, setJobStates] = useState({})
  const [overallProgress, setOverallProgress] = useState(0)
  const [executionSummary, setExecutionSummary] = useState(null)

  useEffect(() => {
    onExecutingChange?.(isExecuting)
  }, [isExecuting, onExecutingChange])

  // Fetch only enabled profiles from main process
  const fetchProfiles = useCallback(async () => {
    if (!window.api?.getProfiles) return
    try {
      setLoading(true)
      setError(null)
      const res = await window.api.getProfiles()
      const list = res?.profiles || (Array.isArray(res) ? [...res] : [])
      const enabledOnly = list.filter(p => p.enabled !== false)
      setProfiles(enabledOnly)

      // Remove any previously selected IDs that no longer exist or got disabled
      setSelectedIds(prev => prev.filter(id => enabledOnly.some(p => p.id === id)))
    } catch (err) {
      setError('Failed to load profiles')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProfiles()
  }, [fetchProfiles])

  // Toggle individual profile selection
  const handleToggleProfile = (profileId) => {
    if (disabled || isExecuting) return
    setError(null)
    setValidationMessage(null)
    setSelectedIds(prev => {
      if (prev.includes(profileId)) {
        return prev.filter(id => id !== profileId)
      } else {
        if (prev.length >= MAX_BULK_PROFILES) {
          setError(`Maximum ${MAX_BULK_PROFILES} profiles can be selected per export plan`)
          return prev
        }
        return [...prev, profileId]
      }
    })
  }

  const handleSelectAll = () => {
    if (disabled || isExecuting) return
    setError(null)
    setValidationMessage(null)
    const allIds = profiles.map(p => p.id).slice(0, MAX_BULK_PROFILES)
    setSelectedIds(allIds)
  }

  const handleDeselectAll = () => {
    if (disabled || isExecuting) return
    setError(null)
    setValidationMessage(null)
    setSelectedIds([])
  }

  // Create immutable export job plan via IPC
  const handleCreatePlan = async () => {
    if (disabled || isExecuting) return

    if (selectedIds.length === 0) {
      setValidationMessage('Please select at least 1 enabled Page Profile to create a bulk export plan.')
      return
    }

    if (!videoPath) {
      setValidationMessage('Please select a source video file above first.')
      return
    }

    try {
      setCreatingPlan(true)
      setError(null)
      setValidationMessage(null)
      setExecutionSummary(null)

      const res = await window.api.createBulkExportPlan({
        sourcePath: videoPath,
        exportType,
        profileIds: selectedIds,
        outputDir: exportOptions.outputDir || undefined,
      })

      if (res.success && res.plan) {
        setPlan(res.plan)
        // Reset job states for new plan
        const initStates = {}
        res.plan.jobs.forEach(j => {
          initStates[j.jobId] = { status: 'READY', progress: 0, error: null, outputPath: j.outputPath }
        })
        setJobStates(initStates)
        onPlanCreated?.(res.plan)
      } else {
        setError(res.error || 'Failed to create export plan')
      }
    } catch (err) {
      setError(err.message || 'Error creating bulk export plan')
    } finally {
      setCreatingPlan(false)
    }
  }

  // Remove a job from active plan
  const handleRemoveJob = (jobId) => {
    if (disabled || isExecuting || !plan || !Array.isArray(plan.jobs)) return
    const filteredJobs = plan.jobs.filter(j => j.jobId !== jobId)

    if (filteredJobs.length === 0) {
      handleClearPlan()
      return
    }

    const reorderedJobs = filteredJobs.map((j, idx) => ({ ...j, orderIndex: idx + 1 }))
    const updatedPlan = {
      ...plan,
      totalJobs: reorderedJobs.length,
      jobs: reorderedJobs,
    }

    setPlan(updatedPlan)
    // Also update selectedIds to keep selection in sync
    const remainingProfileIds = reorderedJobs.map(j => j.profileId)
    setSelectedIds(remainingProfileIds)
    onPlanCreated?.(updatedPlan)
  }

  // Reorder a job in plan (Up / Down)
  const handleMoveJob = (index, direction) => {
    if (disabled || isExecuting || !plan || !Array.isArray(plan.jobs)) return
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= plan.jobs.length) return

    const newJobs = [...plan.jobs]
    const [moved] = newJobs.splice(index, 1)
    newJobs.splice(targetIndex, 0, moved)

    const reordered = newJobs.map((j, idx) => ({ ...j, orderIndex: idx + 1 }))
    const updatedPlan = {
      ...plan,
      jobs: reordered,
    }

    setPlan(updatedPlan)
    onPlanCreated?.(updatedPlan)
  }

  // Subscribe to Batch Queue push events for real-time progress and status updates
  useEffect(() => {
    const handleItemUpdate = (data) => {
      const item = data?.item || data
      if (!item || !item.bulkJobId) return

      setJobStates(prev => ({
        ...prev,
        [item.bulkJobId]: {
          status: item.status,
          progress: Math.min(100, Math.max(0, Math.round(Number(item.progress) || 0))),
          error: item.error || null,
          outputPath: item.outputPath || null,
        },
      }))
    }

    const handleQueueUpdate = (state) => {
      if (!state) return
      if (typeof state.overallProgress === 'number') {
        const p = Math.min(100, Math.max(0, Math.round(state.overallProgress)))
        setOverallProgress(isNaN(p) ? 0 : p)
      }
    }

    const handleQueueDone = (state) => {
      setIsExecuting(false)
      if (state) {
        setExecutionSummary({
          completed: state.doneCount || 0,
          failed: state.errorCount || 0,
          cancelled: state.cancelledCount || 0,
          total: state.totalCount || (plan?.jobs?.length || 0),
        })
      }
    }

    window.api?.onBatchItemUpdate?.(handleItemUpdate)
    window.api?.onBatchQueueUpdate?.(handleQueueUpdate)
    window.api?.onBatchQueueDone?.(handleQueueDone)

    return () => {
      window.api?.off?.('batch:itemUpdate')
      window.api?.off?.('batch:queueUpdate')
      window.api?.off?.('batch:queueDone')
    }
  }, [plan])

  // Execute bulk export using existing Batch Queue via IPC
  const handleStartBulkExport = async () => {
    if (disabled || isExecuting || !plan || !plan.jobs || plan.jobs.length === 0) return
    try {
      setIsExecuting(true)
      setError(null)
      setValidationMessage(null)
      setExecutionSummary(null)
      setOverallProgress(0)

      // Initialize all job states to QUEUED
      const initStates = {}
      plan.jobs.forEach(j => {
        initStates[j.jobId] = { status: 'QUEUED', progress: 0, error: null, outputPath: j.outputPath }
      })
      setJobStates(initStates)

      const res = await window.api.executeBulkExport({
        plan,
        options: exportOptions,
      })

      if (!res.success) {
        setIsExecuting(false)
        setError(res.error || 'Failed to start bulk export execution')
      }
    } catch (err) {
      setIsExecuting(false)
      setError(err.message || 'Error executing bulk export')
    }
  }

  // Cancel entire bulk operation
  const handleCancelBulkExport = async () => {
    if (!plan || !plan.planId) return
    try {
      await window.api.cancelBulkExport(plan.planId)
    } catch (err) {
      setError(err.message || 'Error cancelling bulk export')
    }
  }

  // Cancel single job in bulk operation
  const handleCancelJob = async (jobId) => {
    try {
      await window.api.cancelBulkJob(jobId)
    } catch (err) {
      setError(err.message || 'Error cancelling job')
    }
  }

  // Open output file location in file explorer
  const handleShowInFolder = (filePath) => {
    if (!filePath || !window.api?.showInFolder) return
    window.api.showInFolder(filePath)
  }

  const getDisplayStatus = (rawStatus) => {
    const status = (rawStatus || '').toUpperCase()
    switch (status) {
      case 'WAITING':
      case 'QUEUED':
        return { label: 'Queued', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' }
      case 'PROCESSING':
        return { label: 'Processing', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30' }
      case 'DONE':
      case 'COMPLETED':
        return { label: 'Completed', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' }
      case 'ERROR':
      case 'FAILED':
        return { label: 'Failed', color: 'bg-red-500/10 text-red-400 border-red-500/30' }
      case 'CANCELLED':
        return { label: 'Cancelled', color: 'bg-zinc-800 text-zinc-400 border-zinc-700' }
      case 'READY':
      default:
        return { label: 'Ready', color: 'bg-zinc-800 text-zinc-300 border-zinc-700' }
    }
  }

  const handleClearPlan = () => {
    setPlan(null)
    setJobStates({})
    setIsExecuting(false)
    setExecutionSummary(null)
    setOverallProgress(0)
    setError(null)
    setValidationMessage(null)
    onPlanCreated?.(null)
  }

  const formatPresetSummary = (preset) => {
    if (!preset || typeof preset !== 'object') return 'Default variation'
    const parts = []
    const b = Number(preset.brightness || 0)
    const sat = Number(preset.saturation ?? 1)
    const hue = Number(preset.hue || 0)
    const pitch = Number(preset.pitch || 0)
    const sp = Number(preset.speed ?? 1.0)
    const crop = Number(preset.crop || 0)
    const mode = preset.mode || preset.reframeMode || 'center'
    const cleanMeta = preset.cleanMetadata !== false

    if (Math.abs(b) > 0.001) parts.push(`${b > 0 ? '+' : ''}${b.toFixed(2)} bright`)
    if (Math.abs(sat - 1) > 0.001) parts.push(`${sat.toFixed(2)}x sat`)
    if (Math.abs(hue) > 0.5) parts.push(`${Math.round(hue)}° hue`)
    if (Math.abs(pitch) > 0.001) parts.push(`${pitch > 0 ? '+' : ''}${pitch.toFixed(1)}% pitch`)
    if (Math.abs(sp - 1.0) > 0.001) parts.push(`${sp.toFixed(2)}x speed`)
    if (crop > 0.001) parts.push(`${crop.toFixed(1)}% crop (${mode})`)
    else if (mode && mode !== 'center') parts.push(`${mode} reframe`)
    if (!cleanMeta) parts.push('keep meta')

    return parts.length > 0 ? parts.join(', ') : 'Default parameters'
  }

  // Current workflow step for breadcrumbs
  const currentStep = isExecuting || executionSummary ? 3 : plan && plan.jobs?.length > 0 ? 2 : 1

  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 space-y-4">
      {/* Header with expand toggle */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setIsExpanded(v => !v)}
          className="flex items-center gap-2 text-left focus:outline-none group"
        >
          <div className="p-1.5 rounded-lg bg-brand-500/10 text-brand-400 group-hover:bg-brand-500/20 transition-colors">
            <Layers size={15} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-200">
                Bulk Multi-Profile Export Plan
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-brand-500/20 text-brand-300 font-bold border border-brand-500/30">
                Bulk Export
              </span>
              {selectedIds.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                  {selectedIds.length} Selected
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-500">
              Select multiple Page Profiles to generate and execute an immutable multi-export plan
            </p>
          </div>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchProfiles}
            disabled={disabled || loading || isExecuting}
            className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors rounded disabled:opacity-30"
            title="Refresh profiles"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            onClick={() => setIsExpanded(v => !v)}
            className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="space-y-4 pt-1 animate-fade-in border-t border-zinc-800/80">
          {/* Step Indicator */}
          <div className="grid grid-cols-3 gap-2 pt-1">
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-colors ${
              currentStep === 1
                ? 'bg-brand-500/10 border-brand-500/30 text-brand-300'
                : 'bg-zinc-950 border-zinc-800/80 text-zinc-500'
            }`}>
              <span className="w-4 h-4 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold">1</span>
              <span className="truncate">Select Profiles</span>
            </div>
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-colors ${
              currentStep === 2
                ? 'bg-brand-500/10 border-brand-500/30 text-brand-300'
                : 'bg-zinc-950 border-zinc-800/80 text-zinc-500'
            }`}>
              <span className="w-4 h-4 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold">2</span>
              <span className="truncate">Review Plan</span>
            </div>
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-colors ${
              currentStep === 3
                ? 'bg-brand-500/10 border-brand-500/30 text-brand-300'
                : 'bg-zinc-950 border-zinc-800/80 text-zinc-500'
            }`}>
              <span className="w-4 h-4 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold">3</span>
              <span className="truncate">Export & Results</span>
            </div>
          </div>

          {/* Error display */}
          {error && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-[11px] text-red-300">
              <AlertCircle size={14} className="shrink-0 mt-0.5 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Validation Notice */}
          {validationMessage && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300">
              <Info size={14} className="shrink-0 mt-0.5 text-amber-400" />
              <span>{validationMessage}</span>
            </div>
          )}

          {/* Profile Selection List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">
                Select Enabled Profiles ({selectedIds.length}/{MAX_BULK_PROFILES} selected)
              </span>
              <div className="flex gap-2 text-[10px]">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  disabled={disabled || isExecuting || profiles.length === 0}
                  className="text-brand-400 hover:text-brand-300 disabled:opacity-50 transition-colors"
                >
                  Select All
                </button>
                <span className="text-zinc-600">|</span>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  disabled={disabled || isExecuting || selectedIds.length === 0}
                  className="text-zinc-400 hover:text-zinc-200 disabled:opacity-50 transition-colors"
                >
                  Clear Selection
                </button>
              </div>
            </div>

            {profiles.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                {profiles.map(p => {
                  const isChecked = selectedIds.includes(p.id)
                  const colorClass = PLATFORM_COLORS[p.platform] || PLATFORM_COLORS.Other
                  return (
                    <div
                      key={p.id}
                      onClick={() => handleToggleProfile(p.id)}
                      className={`flex items-center gap-2.5 p-2 rounded-lg border text-xs cursor-pointer transition-colors select-none ${
                        isChecked
                          ? 'bg-brand-600/10 border-brand-500/40 text-zinc-100'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                      } ${isExecuting ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {isChecked ? (
                        <CheckSquare size={14} className="text-brand-400 shrink-0" />
                      ) : (
                        <Square size={14} className="text-zinc-600 shrink-0" />
                      )}
                      <span className="truncate flex-1 font-medium">{p.name}</span>
                      <span className={`text-[9px] uppercase px-1.5 py-0.2 rounded border font-semibold shrink-0 ${colorClass}`}>
                        {p.platform}
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="p-3 text-center text-xs text-zinc-500 border border-dashed border-zinc-800 rounded-lg">
                No enabled Page Profiles available. Create or enable profiles in Page Profiles to use bulk export.
              </div>
            )}
          </div>

          {/* Action: Create Plan */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-zinc-500">
              {selectedIds.length === 0 ? (
                <span className="text-amber-400/80">Select profiles above to prepare export plan</span>
              ) : (
                <>Selected: <strong className="text-zinc-300">{selectedIds.length}</strong> profile(s)</>
              )}
            </span>
            <button
              type="button"
              onClick={handleCreatePlan}
              disabled={disabled || isExecuting || creatingPlan || selectedIds.length < MIN_BULK_PROFILES}
              className="px-3.5 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-semibold text-white transition-colors flex items-center gap-1.5 shadow-md shadow-brand-900/20"
            >
              {creatingPlan ? (
                <>
                  <RefreshCw size={12} className="animate-spin" />
                  <span>Generating Plan…</span>
                </>
              ) : (
                <>
                  <Layers size={13} />
                  <span>{plan ? 'Update Export Plan' : 'Create Export Plan'}</span>
                </>
              )}
            </button>
          </div>

          {/* Plan Preview Section */}
          {plan && plan.jobs && plan.jobs.length > 0 && (
            <div className="space-y-3 pt-3 border-t border-zinc-800/80">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
                  <CheckCircle2 size={14} className="text-emerald-400" />
                  <span>Export Plan: {plan.jobs.length} Planned Jobs ({exportType.toUpperCase()})</span>
                </div>
                {!isExecuting && (
                  <button
                    type="button"
                    onClick={handleClearPlan}
                    className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    Clear Plan
                  </button>
                )}
              </div>

              {/* Overall Execution Progress / Controls */}
              {isExecuting ? (
                <div className="space-y-2.5 p-3 rounded-lg bg-zinc-950 border border-brand-500/30 animate-fade-in">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <RefreshCw size={13} className="animate-spin text-brand-400" />
                      <span className="font-semibold text-zinc-200">
                        Exporting Bulk Queue… ({overallProgress}%)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleCancelBulkExport}
                      className="px-2 py-0.5 rounded text-[11px] font-semibold bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/30 transition-colors flex items-center gap-1"
                      title="Cancel remaining jobs in this bulk export plan"
                    >
                      <Ban size={11} />
                      <span>Cancel All</span>
                    </button>
                  </div>

                  <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full bg-brand-500 transition-all duration-300 rounded-full"
                      style={{ width: `${Math.min(100, Math.max(0, overallProgress))}%` }}
                    />
                  </div>
                </div>
              ) : executionSummary ? (
                <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 space-y-2 animate-fade-in">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={15} className="text-emerald-400" />
                      <span className="font-semibold text-zinc-200">
                        Bulk Export Complete
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleStartBulkExport}
                      className="px-2.5 py-1 rounded bg-brand-600 hover:bg-brand-500 text-[11px] font-semibold text-white transition-colors"
                    >
                      Export Again
                    </button>
                  </div>

                  <div className="grid grid-cols-4 gap-2 pt-1 text-center">
                    <div className="p-1.5 rounded bg-zinc-900/60 border border-zinc-800">
                      <p className="text-[10px] text-zinc-500">Total</p>
                      <p className="text-xs font-bold text-zinc-200">{executionSummary.total || plan.jobs.length}</p>
                    </div>
                    <div className="p-1.5 rounded bg-emerald-500/5 border border-emerald-500/20">
                      <p className="text-[10px] text-emerald-400">Completed</p>
                      <p className="text-xs font-bold text-emerald-300">{executionSummary.completed}</p>
                    </div>
                    <div className="p-1.5 rounded bg-red-500/5 border border-red-500/20">
                      <p className="text-[10px] text-red-400">Failed</p>
                      <p className="text-xs font-bold text-red-300">{executionSummary.failed}</p>
                    </div>
                    <div className="p-1.5 rounded bg-zinc-800/40 border border-zinc-700/50">
                      <p className="text-[10px] text-zinc-400">Cancelled</p>
                      <p className="text-xs font-bold text-zinc-300">{executionSummary.cancelled}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleStartBulkExport}
                  disabled={disabled || isExecuting || plan.jobs.length === 0}
                  className="w-full py-2.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-bold text-white transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40"
                >
                  <Play size={13} className="fill-current" />
                  <span>Start Bulk Export ({plan.jobs.length} Profiles)</span>
                </button>
              )}

              {/* Job List Preview */}
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {plan.jobs.map((job, idx) => {
                  const colorClass = PLATFORM_COLORS[job.platform] || PLATFORM_COLORS.Other
                  const jobState = jobStates[job.jobId]
                  const rawStatus = jobState?.status || job.status || 'READY'
                  const displayStatus = getDisplayStatus(rawStatus)
                  const progress = Math.min(100, Math.max(0, Math.round(Number(jobState?.progress) || 0)))
                  const isProcessing = (rawStatus || '').toUpperCase() === 'PROCESSING'
                  const isWaiting = ['WAITING', 'QUEUED'].includes((rawStatus || '').toUpperCase())
                  const isDone = ['DONE', 'COMPLETED'].includes((rawStatus || '').toUpperCase())
                  const isFailed = ['ERROR', 'FAILED'].includes((rawStatus || '').toUpperCase())
                  const isCancelled = (rawStatus || '').toUpperCase() === 'CANCELLED'
                  const displayFilename = getFilename(jobState?.outputPath || job.outputFilename)

                  return (
                    <div
                      key={job.jobId}
                      className={`p-2.5 rounded-lg bg-zinc-950 border text-xs transition-colors ${
                        isProcessing
                          ? 'border-brand-500/40 shadow-sm shadow-brand-500/10'
                          : isDone
                          ? 'border-emerald-500/30'
                          : isFailed
                          ? 'border-red-500/30'
                          : isCancelled
                          ? 'border-zinc-800 opacity-60'
                          : 'border-zinc-800'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="font-mono text-zinc-500 text-[11px] mt-0.5 w-4">
                          {idx + 1}.
                        </span>

                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-zinc-100 truncate">
                              {job.profileName}
                            </span>
                            <span className={`text-[9px] uppercase px-1.5 py-0.2 rounded border font-semibold shrink-0 ${colorClass}`}>
                              {job.platform}
                            </span>
                            <span className={`ml-auto text-[9px] px-1.5 py-0.2 rounded border font-bold uppercase shrink-0 ${displayStatus.color}`}>
                              {displayStatus.label}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                            <SlidersHorizontal size={10} className="text-brand-400 shrink-0" />
                            <span className="truncate">
                              {formatPresetSummary(job.variationPreset)}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[9px] font-mono text-zinc-500 truncate" title={jobState?.outputPath || job.outputFilename}>
                              Output: {displayFilename}
                            </p>
                            {isDone && (jobState?.outputPath || job.outputPath) && (
                              <button
                                type="button"
                                onClick={() => handleShowInFolder(jobState?.outputPath || job.outputPath)}
                                className="text-[10px] text-brand-400 hover:text-brand-300 flex items-center gap-1 transition-colors shrink-0"
                                title="Open file location in Explorer"
                              >
                                <FolderOpen size={11} />
                                <span>Show in Folder</span>
                              </button>
                            )}
                          </div>

                          {jobState?.error && (
                            <p className="text-[10px] text-red-400 font-medium">
                              Error: {jobState.error}
                            </p>
                          )}
                        </div>

                        {/* Controls: Reorder/Remove or Cancel */}
                        <div className="flex items-center gap-1 shrink-0 ml-1 mt-0.5">
                          {isExecuting ? (
                            (isProcessing || isWaiting) && (
                              <button
                                type="button"
                                onClick={() => handleCancelJob(job.jobId)}
                                className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                                title="Cancel this job"
                              >
                                <XCircle size={14} />
                              </button>
                            )
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => handleMoveJob(idx, -1)}
                                disabled={disabled || idx === 0}
                                className="p-1 text-zinc-500 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                title="Move up in execution order"
                              >
                                <ChevronUp size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMoveJob(idx, 1)}
                                disabled={disabled || idx === plan.jobs.length - 1}
                                className="p-1 text-zinc-500 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                title="Move down in execution order"
                              >
                                <ChevronDown size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveJob(job.jobId)}
                                disabled={disabled}
                                className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                                title="Remove from export plan"
                              >
                                <Trash2 size={12} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Per-job progress bar while processing */}
                      {isProcessing && (
                        <div className="space-y-1 pt-1.5 mt-1 border-t border-zinc-800/60">
                          <div className="flex items-center justify-between text-[10px] text-zinc-400">
                            <span className="flex items-center gap-1">
                              <RefreshCw size={10} className="animate-spin text-brand-400" />
                              Exporting profile variation…
                            </span>
                            <span className="font-mono text-brand-300 font-bold">{progress}%</span>
                          </div>
                          <div className="w-full h-1 rounded-full bg-zinc-800 overflow-hidden">
                            <div
                              className="h-full bg-brand-400 transition-all duration-200 rounded-full"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {!isExecuting && (
                <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/80 text-[10px] text-zinc-400 flex items-start gap-2">
                  <Info size={13} className="text-brand-400 shrink-0 mt-0.5" />
                  <span>
                    Jobs use immutable profile snapshots. If you modify presets in Page Profiles, click &quot;Update Export Plan&quot; to refresh snapshots.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
