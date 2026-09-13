import React, { useState, useEffect, useCallback, useMemo } from 'react'
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
  SlidersHorizontal,
  Play,
  XCircle,
  Ban,
  FolderOpen,
  Info,
  RotateCcw,
  Sparkles,
  Palette,
  Volume2,
  Gauge,
  Crop,
  ShieldCheck,
  Calendar,
  Clock,
  X,
  Loader2,
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

const REFRAME_MODES = [
  { id: 'center', label: 'Center' },
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
  { id: 'top', label: 'Top' },
  { id: 'bottom', label: 'Bottom' },
]

/**
 * Safe neutral baseline variation settings.
 */
const NEUTRAL_VARIATION = {
  brightness: 0.0,
  saturation: 1.0,
  hue: 0.0,
  pitch: 0.0,
  speed: 1.00,
  mode: 'center',
  crop: 0.0,
  cleanMetadata: true,
}

/**
 * Curated preset templates for quick, safe export-time variation.
 * Legitimate creative repurposed looks (no evasion/bypasses).
 */
const BULK_TEMPLATES = [
  {
    id: 'neutral',
    name: 'Neutral',
    description: 'Safe baseline (no color, pitch, or speed shift)',
    values: { brightness: 0.0, saturation: 1.0, hue: 0.0, pitch: 0.0, speed: 1.00, mode: 'center', crop: 0.0, cleanMetadata: true },
  },
  {
    id: 'lightColor',
    name: 'Light Color',
    description: '+5% brightness, 1.05x saturation',
    values: { brightness: 0.05, saturation: 1.05, hue: 0.0, pitch: 0.0, speed: 1.00, mode: 'center', crop: 0.0, cleanMetadata: true },
  },
  {
    id: 'punchyColor',
    name: 'Punchy Color',
    description: '+5% brightness, 1.15x saturation',
    values: { brightness: 0.05, saturation: 1.15, hue: 0.0, pitch: 0.0, speed: 1.00, mode: 'center', crop: 0.0, cleanMetadata: true },
  },
  {
    id: 'subtleMotion',
    name: 'Subtle Motion',
    description: '1.02x speed, 1% reframe crop',
    values: { brightness: 0.0, saturation: 1.0, hue: 0.0, pitch: 0.0, speed: 1.02, mode: 'center', crop: 1.0, cleanMetadata: true },
  },
]

/**
 * Safely extracts filename from a full path or name string in browser context.
 */
function getFilename(fullPathOrName) {
  if (!fullPathOrName || typeof fullPathOrName !== 'string') return ''
  return fullPathOrName.replace(/\\/g, '/').split('/').pop() || fullPathOrName
}

/**
 * Compares two variation presets to detect if an export override differs from saved preset.
 */
function arePresetsEqual(a, b) {
  if (!a && !b) return true
  if (!a || !b) return false
  return (
    Math.abs(Number(a.brightness || 0) - Number(b.brightness || 0)) < 0.001 &&
    Math.abs(Number(a.saturation ?? 1) - Number(b.saturation ?? 1)) < 0.001 &&
    Math.abs(Number(a.hue || 0) - Number(b.hue || 0)) < 0.5 &&
    Math.abs(Number(a.pitch || 0) - Number(b.pitch || 0)) < 0.001 &&
    Math.abs(Number(a.speed ?? 1.0) - Number(b.speed ?? 1.0)) < 0.001 &&
    Math.abs(Number(a.crop || 0) - Number(b.crop || 0)) < 0.001 &&
    (a.mode || 'center') === (b.mode || 'center') &&
    (a.cleanMetadata !== false) === (b.cleanMetadata !== false)
  )
}

/**
 * Formats a variation preset into concise, readable descriptors.
 */
function formatPresetSummary(preset) {
  if (!preset || typeof preset !== 'object') return 'Neutral defaults'
  const parts = []
  const b = Number(preset.brightness || 0)
  const sat = Number(preset.saturation ?? 1)
  const hue = Number(preset.hue || 0)
  const pitch = Number(preset.pitch || 0)
  const sp = Number(preset.speed ?? 1.0)
  const crop = Number(preset.crop || 0)
  const mode = preset.mode || preset.reframeMode || 'center'
  const cleanMeta = preset.cleanMetadata !== false

  if (Math.abs(b) > 0.001) parts.push(`${b > 0 ? '+' : ''}${Math.round(b * 100)}% bright`)
  if (Math.abs(sat - 1) > 0.001) parts.push(`${Math.round(sat * 100)}% sat`)
  if (Math.abs(hue) > 0.5) parts.push(`${Math.round(hue)}° hue`)
  if (Math.abs(pitch) > 0.001) parts.push(`${pitch > 0 ? '+' : ''}${pitch.toFixed(1)}% pitch`)
  if (Math.abs(sp - 1.0) > 0.001) parts.push(`${sp.toFixed(2)}x speed`)
  if (crop > 0.001) parts.push(`${crop.toFixed(1)}% crop (${mode})`)
  else if (mode && mode !== 'center') parts.push(`${mode} reframe`)
  if (!cleanMeta) parts.push('keep meta')

  return parts.length > 0 ? parts.join(', ') : 'Neutral defaults'
}

/**
 * MultiProfileSelector Component — Phase 2D
 *
 * Multi-profile selection with export-time variation control, preset templates,
 * non-destructive profile overrides, and immutable batch export execution.
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

  // Phase 2D: Export-time variation overrides (profileId -> override variation object)
  const [exportOverrides, setExportOverrides] = useState({})
  const [expandedEditorProfileId, setExpandedEditorProfileId] = useState(null)
  const [bulkApplySuccessMsg, setBulkApplySuccessMsg] = useState(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState('lightColor')

  // Phase 3C: Bulk Scheduling Modal State
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [scheduleStartDate, setScheduleStartDate] = useState('')
  const [scheduleStartTime, setScheduleStartTime] = useState('')
  const [scheduleGap, setScheduleGap] = useState(15)
  const [customGap, setCustomGap] = useState('')
  const [isScheduling, setIsScheduling] = useState(false)
  const [scheduleError, setScheduleError] = useState(null)
  const [scheduleSuccess, setScheduleSuccess] = useState(null)

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
        if (expandedEditorProfileId === profileId) setExpandedEditorProfileId(null)
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
    setExpandedEditorProfileId(null)
  }

  // ── Phase 2D: Variation Override Management ────────────────────────────────

  const getActiveProfileVariation = useCallback((profileId) => {
    if (exportOverrides[profileId]) {
      return exportOverrides[profileId]
    }
    const profile = profiles.find(p => p.id === profileId)
    return profile?.variationPreset || { ...NEUTRAL_VARIATION }
  }, [exportOverrides, profiles])

  const handleUpdateProfileVariation = (profileId, key, value) => {
    if (disabled || isExecuting) return
    const current = getActiveProfileVariation(profileId)
    setExportOverrides(prev => ({
      ...prev,
      [profileId]: {
        ...current,
        [key]: value,
      },
    }))
  }

  const handleRestoreProfilePreset = (profileId) => {
    if (disabled || isExecuting) return
    setExportOverrides(prev => {
      const next = { ...prev }
      delete next[profileId]
      return next
    })
    setBulkApplySuccessMsg('Restored profile to saved preset')
    setTimeout(() => setBulkApplySuccessMsg(null), 3000)
  }

  const handleResetProfileVariation = (profileId) => {
    if (disabled || isExecuting) return
    setExportOverrides(prev => ({
      ...prev,
      [profileId]: { ...NEUTRAL_VARIATION },
    }))
    setBulkApplySuccessMsg('Reset variation to safe neutral defaults')
    setTimeout(() => setBulkApplySuccessMsg(null), 3000)
  }

  const handleApplyTemplateToSelected = (templateId) => {
    if (disabled || isExecuting || selectedIds.length === 0) return
    const tmpl = BULK_TEMPLATES.find(t => t.id === templateId)
    if (!tmpl) return

    const newOverrides = {}
    selectedIds.forEach(id => {
      newOverrides[id] = { ...tmpl.values }
    })
    setExportOverrides(prev => ({
      ...prev,
      ...newOverrides,
    }))
    setBulkApplySuccessMsg(`Applied "${tmpl.name}" preset to ${selectedIds.length} selected profile(s)`)
    setTimeout(() => setBulkApplySuccessMsg(null), 3500)
  }

  const handleRestoreAllToSavedPresets = () => {
    if (disabled || isExecuting || selectedIds.length === 0) return
    setExportOverrides(prev => {
      const next = { ...prev }
      selectedIds.forEach(id => delete next[id])
      return next
    })
    setBulkApplySuccessMsg(`Restored all ${selectedIds.length} selected profile(s) to saved presets`)
    setTimeout(() => setBulkApplySuccessMsg(null), 3500)
  }

  // Create or Update immutable export job plan via IPC
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
        variationOverrides: exportOverrides,
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

  // Phase 3C: Open Bulk Schedule Modal
  const handleOpenScheduleModal = () => {
    if (!plan || !plan.jobs || plan.jobs.length === 0) return
    const future = new Date(Date.now() + 5 * 60 * 1000)
    const dateStr = future.toISOString().split('T')[0]
    const hours = String(future.getHours()).padStart(2, '0')
    const mins = String(future.getMinutes()).padStart(2, '0')
    setScheduleStartDate(dateStr)
    setScheduleStartTime(`${hours}:${mins}`)
    setScheduleGap(15)
    setCustomGap('')
    setScheduleError(null)
    setScheduleSuccess(null)
    setShowScheduleModal(true)
  }

  // Phase 3C: Confirm & Create Bulk Schedule
  const handleConfirmBulkSchedule = async (e) => {
    e.preventDefault()
    setScheduleError(null)
    setScheduleSuccess(null)

    if (!scheduleStartDate || !scheduleStartTime) {
      setScheduleError('Please select both start date and time.')
      return
    }

    const startDateTime = new Date(`${scheduleStartDate}T${scheduleStartTime}`)
    if (isNaN(startDateTime.getTime())) {
      setScheduleError('Invalid start date or time format.')
      return
    }

    const gapVal = scheduleGap === 'custom' ? Number(customGap) : Number(scheduleGap)
    if (!Number.isInteger(gapVal) || gapVal < 1 || gapVal > 1440) {
      setScheduleError('Time gap must be an integer between 1 and 1440 minutes.')
      return
    }

    setIsScheduling(true)
    try {
      const res = await window.api.createBulkSchedule({
        plan,
        startAt: startDateTime.toISOString(),
        gapMinutes: gapVal,
        options: exportOptions,
      })

      if (res && res.success) {
        setScheduleSuccess(`Successfully created ${res.count} schedule records!`)
        setTimeout(() => {
          setShowScheduleModal(false)
          setScheduleSuccess(null)
        }, 1500)
      } else {
        setScheduleError(res?.error || 'Failed to create bulk schedule')
      }
    } catch (err) {
      setScheduleError(err.message || 'An error occurred while creating bulk schedule')
    } finally {
      setIsScheduling(false)
    }
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
              Select Page Profiles, configure variations &amp; templates, and execute an immutable export plan
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
              <span className="truncate">Review &amp; Variation</span>
            </div>
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-colors ${
              currentStep === 3
                ? 'bg-brand-500/10 border-brand-500/30 text-brand-300'
                : 'bg-zinc-950 border-zinc-800/80 text-zinc-500'
            }`}>
              <span className="w-4 h-4 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold">3</span>
              <span className="truncate">Export &amp; Results</span>
            </div>
          </div>

          {/* Feedback messages */}
          {error && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-[11px] text-red-300">
              <AlertCircle size={14} className="shrink-0 mt-0.5 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {validationMessage && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300">
              <Info size={14} className="shrink-0 mt-0.5 text-amber-400" />
              <span>{validationMessage}</span>
            </div>
          )}

          {bulkApplySuccessMsg && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-[11px] text-emerald-300 animate-fade-in">
              <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
              <span>{bulkApplySuccessMsg}</span>
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

          {/* Phase 2D: Bulk Preset Templates & Global Variation Controls */}
          {selectedIds.length > 0 && (
            <div className="p-3 rounded-lg bg-zinc-950/70 border border-zinc-800/80 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
                  <Sparkles size={13} className="text-brand-400" />
                  <span>Preset Templates &amp; Bulk Variation</span>
                </div>
                <button
                  type="button"
                  onClick={handleRestoreAllToSavedPresets}
                  disabled={disabled || isExecuting}
                  className="text-[10px] text-zinc-400 hover:text-zinc-200 disabled:opacity-40 transition-colors flex items-center gap-1"
                  title="Reset all selected profiles back to their saved profile presets"
                >
                  <RotateCcw size={10} />
                  <span>Restore All Presets</span>
                </button>
              </div>

              <p className="text-[11px] text-zinc-500">
                Choose a creative look or apply a variation to all selected profiles for this export without modifying saved profiles.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {BULK_TEMPLATES.map(tmpl => {
                  const isSelected = selectedTemplateId === tmpl.id
                  return (
                    <button
                      key={tmpl.id}
                      type="button"
                      disabled={disabled || isExecuting}
                      onClick={() => setSelectedTemplateId(tmpl.id)}
                      className={`p-2 rounded-lg border text-left transition-colors flex flex-col justify-between ${
                        isSelected
                          ? 'bg-brand-500/15 border-brand-500/40 text-brand-200'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                      }`}
                    >
                      <div className="font-semibold text-[11px] truncate">{tmpl.name}</div>
                      <div className="text-[9px] text-zinc-500 truncate mt-0.5">{tmpl.description}</div>
                    </button>
                  )
                })}
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => handleApplyTemplateToSelected(selectedTemplateId)}
                  disabled={disabled || isExecuting || selectedIds.length === 0}
                  className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-[11px] font-semibold text-zinc-200 border border-zinc-700 transition-colors flex items-center gap-1.5 disabled:opacity-40"
                  title="Apply this template variation to all currently selected profiles"
                >
                  <SlidersHorizontal size={11} className="text-brand-400" />
                  <span>Apply Variation to Selected</span>
                </button>
                <span className="text-[10px] text-zinc-500">
                  Export override only &bull; Profiles unchanged
                </span>
              </div>
            </div>
          )}

          {/* Phase 2D: Selected Profiles Variation Review & Per-Profile Override Cards */}
          {selectedIds.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-300">
                  Review Selected Profile Variations ({selectedIds.length})
                </span>
                <span className="text-[10px] text-zinc-500">
                  Click &quot;Edit&quot; to adjust export variation individually
                </span>
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {selectedIds.map(profileId => {
                  const profile = profiles.find(p => p.id === profileId)
                  if (!profile) return null

                  const savedPreset = profile.variationPreset || { ...NEUTRAL_VARIATION }
                  const activeVariation = getActiveProfileVariation(profileId)
                  const isOverridden = !arePresetsEqual(savedPreset, activeVariation)
                  const isEditing = expandedEditorProfileId === profileId
                  const colorClass = PLATFORM_COLORS[profile.platform] || PLATFORM_COLORS.Other

                  return (
                    <div
                      key={profile.id}
                      className="p-3 rounded-lg bg-zinc-950 border border-zinc-800/90 text-xs space-y-2 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-semibold text-zinc-100 truncate">{profile.name}</span>
                          <span className={`text-[9px] uppercase px-1.5 py-0.2 rounded border font-semibold shrink-0 ${colorClass}`}>
                            {profile.platform}
                          </span>
                          {isOverridden ? (
                            <span className="text-[9px] px-1.5 py-0.2 rounded border font-bold uppercase shrink-0 bg-amber-500/10 text-amber-400 border-amber-500/30">
                              Export Override
                            </span>
                          ) : (
                            <span className="text-[9px] px-1.5 py-0.2 rounded border font-medium uppercase shrink-0 bg-zinc-800 text-zinc-400 border-zinc-700">
                              Profile Preset
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => setExpandedEditorProfileId(isEditing ? null : profileId)}
                            disabled={disabled || isExecuting}
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-colors ${
                              isEditing
                                ? 'bg-brand-500/20 text-brand-300 border-brand-500/40'
                                : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'
                            }`}
                          >
                            {isEditing ? 'Close' : 'Edit'}
                          </button>
                        </div>
                      </div>

                      {/* Summaries: Saved Preset vs Export Variation */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                        <div className="p-1.5 rounded bg-zinc-900/80 border border-zinc-800/80">
                          <span className="text-[10px] uppercase font-bold text-zinc-500 block">Saved Preset:</span>
                          <span className="text-zinc-300 text-[10px] truncate block">{formatPresetSummary(savedPreset)}</span>
                        </div>
                        <div className={`p-1.5 rounded border ${
                          isOverridden
                            ? 'bg-amber-500/5 border-amber-500/20'
                            : 'bg-zinc-900/80 border-zinc-800/80'
                        }`}>
                          <span className={`text-[10px] uppercase font-bold block ${isOverridden ? 'text-amber-400' : 'text-zinc-500'}`}>
                            Export Variation:
                          </span>
                          <span className="text-zinc-200 text-[10px] truncate block font-medium">
                            {formatPresetSummary(activeVariation)}
                          </span>
                        </div>
                      </div>

                      {/* Expanded Slider / Control Card for this profile */}
                      {isEditing && (
                        <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 space-y-3 animate-fade-in">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {/* Brightness */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-zinc-400 flex items-center gap-1">
                                  <Palette size={11} className="text-brand-400" /> Brightness
                                </span>
                                <span className="font-mono font-bold text-zinc-200">
                                  {Number(activeVariation.brightness || 0) > 0 ? '+' : ''}
                                  {Number(activeVariation.brightness || 0).toFixed(2)}
                                </span>
                              </div>
                              <input
                                type="range"
                                min="-1.0"
                                max="1.0"
                                step="0.01"
                                disabled={disabled || isExecuting}
                                value={activeVariation.brightness || 0}
                                onChange={e => handleUpdateProfileVariation(profileId, 'brightness', parseFloat(e.target.value))}
                                className="w-full accent-brand-500 bg-zinc-800 h-1.5 rounded cursor-pointer"
                              />
                            </div>

                            {/* Saturation */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-zinc-400 flex items-center gap-1">
                                  <Palette size={11} className="text-brand-400" /> Saturation
                                </span>
                                <span className="font-mono font-bold text-zinc-200">
                                  {Number(activeVariation.saturation ?? 1.0).toFixed(2)}x
                                </span>
                              </div>
                              <input
                                type="range"
                                min="0.0"
                                max="3.0"
                                step="0.05"
                                disabled={disabled || isExecuting}
                                value={activeVariation.saturation ?? 1.0}
                                onChange={e => handleUpdateProfileVariation(profileId, 'saturation', parseFloat(e.target.value))}
                                className="w-full accent-brand-500 bg-zinc-800 h-1.5 rounded cursor-pointer"
                              />
                            </div>

                            {/* Hue */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-zinc-400 flex items-center gap-1">
                                  <Palette size={11} className="text-brand-400" /> Hue Shift
                                </span>
                                <span className="font-mono font-bold text-zinc-200">
                                  {Math.round(activeVariation.hue || 0)}°
                                </span>
                              </div>
                              <input
                                type="range"
                                min="-180"
                                max="180"
                                step="1"
                                disabled={disabled || isExecuting}
                                value={activeVariation.hue || 0}
                                onChange={e => handleUpdateProfileVariation(profileId, 'hue', parseInt(e.target.value, 10))}
                                className="w-full accent-brand-500 bg-zinc-800 h-1.5 rounded cursor-pointer"
                              />
                            </div>

                            {/* Audio Pitch */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-zinc-400 flex items-center gap-1">
                                  <Volume2 size={11} className="text-brand-400" /> Audio Pitch
                                </span>
                                <span className="font-mono font-bold text-zinc-200">
                                  {Number(activeVariation.pitch || 0) > 0 ? '+' : ''}
                                  {Number(activeVariation.pitch || 0).toFixed(1)}%
                                </span>
                              </div>
                              <input
                                type="range"
                                min="-3.0"
                                max="3.0"
                                step="0.1"
                                disabled={disabled || isExecuting}
                                value={activeVariation.pitch || 0}
                                onChange={e => handleUpdateProfileVariation(profileId, 'pitch', parseFloat(e.target.value))}
                                className="w-full accent-brand-500 bg-zinc-800 h-1.5 rounded cursor-pointer"
                              />
                            </div>

                            {/* Speed */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-zinc-400 flex items-center gap-1">
                                  <Gauge size={11} className="text-brand-400" /> Speed (1.00x - 1.05x)
                                </span>
                                <span className="font-mono font-bold text-zinc-200">
                                  {Number(activeVariation.speed ?? 1.0).toFixed(2)}x
                                </span>
                              </div>
                              <input
                                type="range"
                                min="1.00"
                                max="1.05"
                                step="0.01"
                                disabled={disabled || isExecuting}
                                value={activeVariation.speed ?? 1.0}
                                onChange={e => handleUpdateProfileVariation(profileId, 'speed', parseFloat(e.target.value))}
                                className="w-full accent-brand-500 bg-zinc-800 h-1.5 rounded cursor-pointer"
                              />
                            </div>

                            {/* Crop */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-zinc-400 flex items-center gap-1">
                                  <Crop size={11} className="text-brand-400" /> Reframe Crop (0% - 2%)
                                </span>
                                <span className="font-mono font-bold text-zinc-200">
                                  {Number(activeVariation.crop || 0).toFixed(1)}%
                                </span>
                              </div>
                              <input
                                type="range"
                                min="0.0"
                                max="2.0"
                                step="0.1"
                                disabled={disabled || isExecuting}
                                value={activeVariation.crop || 0}
                                onChange={e => handleUpdateProfileVariation(profileId, 'crop', parseFloat(e.target.value))}
                                className="w-full accent-brand-500 bg-zinc-800 h-1.5 rounded cursor-pointer"
                              />
                            </div>
                          </div>

                          {/* Reframe Mode & Clean Metadata */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-zinc-800/80">
                            <div>
                              <label className="text-[11px] text-zinc-400 block mb-1">Reframe Alignment</label>
                              <select
                                disabled={disabled || isExecuting}
                                value={activeVariation.mode || 'center'}
                                onChange={e => handleUpdateProfileVariation(profileId, 'mode', e.target.value)}
                                className="w-full px-2 py-1 text-xs rounded bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:border-brand-500"
                              >
                                {REFRAME_MODES.map(m => (
                                  <option key={m.id} value={m.id}>{m.label}</option>
                                ))}
                              </select>
                            </div>

                            <div className="flex items-center">
                              <label className="flex items-center gap-2 cursor-pointer mt-4 select-none">
                                <input
                                  type="checkbox"
                                  disabled={disabled || isExecuting}
                                  checked={activeVariation.cleanMetadata !== false}
                                  onChange={e => handleUpdateProfileVariation(profileId, 'cleanMetadata', e.target.checked)}
                                  className="w-3.5 h-3.5 rounded border-zinc-700 bg-zinc-800 text-brand-600 focus:ring-brand-500"
                                />
                                <span className="text-[11px] text-zinc-300 flex items-center gap-1">
                                  <ShieldCheck size={12} className="text-brand-400" /> Clean Metadata
                                </span>
                              </label>
                            </div>
                          </div>

                          {/* Per-profile Action Buttons */}
                          <div className="flex items-center justify-between pt-1 border-t border-zinc-800/80 text-[10px]">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => handleRestoreProfilePreset(profileId)}
                                disabled={disabled || isExecuting || !isOverridden}
                                className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 disabled:opacity-40 transition-colors flex items-center gap-1"
                                title="Restore this profile to its saved preset"
                              >
                                <RotateCcw size={10} />
                                <span>Restore Profile Preset</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleResetProfileVariation(profileId)}
                                disabled={disabled || isExecuting}
                                className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 disabled:opacity-40 transition-colors"
                                title="Reset to neutral default parameters"
                              >
                                Reset Variation
                              </button>
                            </div>
                            <span className="text-zinc-500 italic">Saved Page Profile is never modified</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Action: Create / Update Plan */}
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
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleStartBulkExport}
                    disabled={disabled || isExecuting || isScheduling || plan.jobs.length === 0}
                    className="w-full py-2.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-bold text-white transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40"
                  >
                    <Play size={13} className="fill-current" />
                    <span>Start Bulk Export ({plan.jobs.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenScheduleModal}
                    disabled={disabled || isExecuting || isScheduling || plan.jobs.length === 0}
                    className="w-full py-2.5 px-3 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-xs font-bold text-white transition-colors flex items-center justify-center gap-2 shadow-lg shadow-brand-950/40"
                  >
                    <Calendar size={13} />
                    <span>Schedule Bulk Export</span>
                  </button>
                </div>
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
                            {job.isOverridden && (
                              <span className="text-[9px] uppercase px-1.5 py-0.2 rounded border font-bold bg-amber-500/10 text-amber-300 border-amber-500/30">
                                Override
                              </span>
                            )}
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
                    Jobs use immutable profile snapshots. Adjusting variations above updates only this export plan. To apply new variation settings, click &quot;Update Export Plan&quot;.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {/* Phase 3C: Schedule Bulk Export Modal */}
      {showScheduleModal && plan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-4 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Calendar size={18} className="text-brand-400" />
                <h2 className="text-sm font-bold text-zinc-100">Schedule Bulk Export ({plan.jobs.length} Profiles)</h2>
              </div>
              <button
                onClick={() => setShowScheduleModal(false)}
                className="p-1 text-zinc-400 hover:text-zinc-100 rounded-lg hover:bg-zinc-800 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleConfirmBulkSchedule} className="flex-1 overflow-y-auto p-5 space-y-4">
              {scheduleError && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-300">
                  <AlertCircle size={14} className="text-red-400 shrink-0" />
                  <span>{scheduleError}</span>
                </div>
              )}

              {scheduleSuccess && (
                <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/30 rounded-xl text-xs text-green-300">
                  <CheckCircle2 size={14} className="text-green-400 shrink-0" />
                  <span>{scheduleSuccess}</span>
                </div>
              )}

              {/* Start Date & Time */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-300">Start Date</label>
                  <input
                    type="date"
                    value={scheduleStartDate}
                    onChange={e => setScheduleStartDate(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-300">Start Time</label>
                  <input
                    type="time"
                    value={scheduleStartTime}
                    onChange={e => setScheduleStartTime(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              {/* Time Gap */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300 flex items-center justify-between">
                  <span>Time Gap Between Jobs</span>
                  <span className="text-[10px] text-zinc-500 font-normal">Min 1m • Max 24h</span>
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[1, 5, 10, 15, 30, 60].map(gap => (
                    <button
                      key={gap}
                      type="button"
                      onClick={() => { setScheduleGap(gap); setCustomGap(''); }}
                      className={`px-2 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                        scheduleGap === gap
                          ? 'bg-brand-600/20 text-brand-300 border-brand-500/50 shadow-sm'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                      }`}
                    >
                      {gap} min
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setScheduleGap('custom')}
                    className={`col-span-2 px-2 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                      scheduleGap === 'custom'
                        ? 'bg-brand-600/20 text-brand-300 border-brand-500/50 shadow-sm'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                    }`}
                  >
                    Custom Gap
                  </button>
                </div>

                {scheduleGap === 'custom' && (
                  <div className="pt-2 flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="1440"
                      placeholder="Minutes (1 - 1440)"
                      value={customGap}
                      onChange={e => setCustomGap(e.target.value)}
                      className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-brand-500"
                    />
                    <span className="text-xs text-zinc-400">minutes</span>
                  </div>
                )}
              </div>

              {/* Past Start Time Warning */}
              {scheduleStartDate && scheduleStartTime && new Date(`${scheduleStartDate}T${scheduleStartTime}`) < new Date() && (
                <div className="flex items-start gap-2 p-2.5 bg-yellow-500/10 border border-yellow-500/30 rounded-xl text-xs text-yellow-300">
                  <AlertCircle size={14} className="text-yellow-400 shrink-0 mt-0.5" />
                  <span>Start time is in the past. Due jobs may begin immediately.</span>
                </div>
              )}

              {/* Timeline Preview */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-zinc-300 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Clock size={13} className="text-brand-400" />
                    Timeline Preview ({plan.jobs.length} Jobs)
                  </span>
                  <span className="text-[10px] text-zinc-500">Order preserved</span>
                </label>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {plan.jobs.map((job, idx) => {
                    const currentGap = scheduleGap === 'custom' ? Number(customGap || 15) : Number(scheduleGap)
                    let scheduledText = 'Pending time'
                    if (scheduleStartDate && scheduleStartTime) {
                      const baseMs = new Date(`${scheduleStartDate}T${scheduleStartTime}`).getTime()
                      if (!isNaN(baseMs)) {
                        const jobMs = baseMs + idx * currentGap * 60 * 1000
                        scheduledText = new Date(jobMs).toLocaleString('en-US', {
                          month: 'short', day: 'numeric',
                          hour: 'numeric', minute: '2-digit', hour12: true,
                        })
                      }
                    }
                    const platformClass = PLATFORM_COLORS[job.platform] || PLATFORM_COLORS.Other

                    return (
                      <div
                        key={job.jobId}
                        className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800/80 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-5 h-5 rounded bg-zinc-800 text-zinc-400 flex items-center justify-center text-[10px] font-bold shrink-0">
                            {idx + 1}
                          </span>
                          <span className="font-semibold text-zinc-200 truncate">{job.profileName}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${platformClass}`}>
                            {job.platform}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-zinc-300 font-mono text-[11px] shrink-0">
                          <Clock size={11} className="text-zinc-500" />
                          <span>{scheduledText}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="pt-2 flex justify-between items-center border-t border-zinc-800">
                <span className="text-xs text-zinc-400">Total: {plan.jobs.length} schedules</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowScheduleModal(false)}
                    className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-semibold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isScheduling}
                    className="flex items-center gap-2 px-5 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-all shadow-lg shadow-brand-900/30"
                  >
                    {isScheduling ? (
                      <><Loader2 size={13} className="animate-spin" /> Scheduling…</>
                    ) : (
                      <><Calendar size={13} /> Confirm &amp; Schedule</>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
