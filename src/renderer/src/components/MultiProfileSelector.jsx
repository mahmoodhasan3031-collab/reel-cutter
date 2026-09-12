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
 * MultiProfileSelector Component — Phase 2C-1
 *
 * Allows selecting multiple enabled Page Profiles for bulk export planning.
 * Generates an immutable, validated job plan with preview, reordering, and removal.
 */
export default function MultiProfileSelector({
  videoPath,
  exportType = 'cut',
  disabled = false,
  onPlanCreated,
}) {
  const [profiles, setProfiles] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(false)
  const [creatingPlan, setCreatingPlan] = useState(false)
  const [error, setError] = useState(null)
  const [isExpanded, setIsExpanded] = useState(false)

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
    if (disabled) return
    setError(null)
    setSelectedIds(prev => {
      if (prev.includes(profileId)) {
        return prev.filter(id => id !== profileId)
      } else {
        if (prev.length >= MAX_BULK_PROFILES) {
          setError(`Maximum ${MAX_BULK_PROFILES} profiles can be selected`)
          return prev
        }
        return [...prev, profileId]
      }
    })
  }

  const handleSelectAll = () => {
    if (disabled) return
    setError(null)
    const allIds = profiles.map(p => p.id).slice(0, MAX_BULK_PROFILES)
    setSelectedIds(allIds)
  }

  const handleDeselectAll = () => {
    if (disabled) return
    setError(null)
    setSelectedIds([])
  }

  // Create immutable export job plan via IPC
  const handleCreatePlan = async () => {
    if (disabled || selectedIds.length === 0) return
    if (!videoPath) {
      setError('Please select a source video file first')
      return
    }

    try {
      setCreatingPlan(true)
      setError(null)

      const res = await window.api.createBulkExportPlan({
        sourcePath: videoPath,
        exportType,
        profileIds: selectedIds,
      })

      if (res.success && res.plan) {
        setPlan(res.plan)
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
    if (!plan || !Array.isArray(plan.jobs)) return
    const filteredJobs = plan.jobs.filter(j => j.jobId !== jobId)
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
    if (!plan || !Array.isArray(plan.jobs)) return
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

  const handleClearPlan = () => {
    setPlan(null)
    onPlanCreated?.(null)
  }

  const formatPresetSummary = (preset) => {
    if (!preset) return 'Default variation'
    const parts = []
    const b = Number(preset.brightness || 0)
    const sat = Number(preset.saturation ?? 1)
    const sp = Number(preset.speed ?? 1.0)
    const crop = Number(preset.crop || 0)
    const hue = Number(preset.hue || 0)

    if (Math.abs(b) > 0.001) parts.push(`${b > 0 ? '+' : ''}${b.toFixed(2)} bright`)
    if (Math.abs(sat - 1) > 0.001) parts.push(`${sat.toFixed(2)}x sat`)
    if (Math.abs(hue) > 0.5) parts.push(`${Math.round(hue)}° hue`)
    if (Math.abs(sp - 1.0) > 0.001) parts.push(`${sp.toFixed(2)}x speed`)
    if (crop > 0.001) parts.push(`${crop.toFixed(1)}% crop`)

    return parts.length > 0 ? parts.join(', ') : 'All variation defaults'
  }

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
                Phase 2C-1
              </span>
            </div>
            <p className="text-[11px] text-zinc-500">
              Select multiple Page Profiles to generate an immutable multi-export plan
            </p>
          </div>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchProfiles}
            disabled={disabled || loading}
            className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors rounded"
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
          {/* Error display */}
          {error && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-[11px] text-red-300">
              <AlertCircle size={14} className="shrink-0 mt-0.5 text-red-400" />
              <span>{error}</span>
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
                  disabled={disabled || profiles.length === 0}
                  className="text-brand-400 hover:text-brand-300 disabled:opacity-50"
                >
                  Select All
                </button>
                <span className="text-zinc-600">|</span>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  disabled={disabled || selectedIds.length === 0}
                  className="text-zinc-400 hover:text-zinc-200 disabled:opacity-50"
                >
                  Clear
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
                      className={`flex items-center gap-2.5 p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                        isChecked
                          ? 'bg-brand-600/10 border-brand-500/40 text-zinc-100'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                      }`}
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
                No enabled Page Profiles available. Create profiles in Page Profiles to use bulk export.
              </div>
            )}
          </div>

          {/* Action: Create Plan */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-zinc-500">
              Selected: <strong className="text-zinc-300">{selectedIds.length}</strong> profile(s)
            </span>
            <button
              type="button"
              onClick={handleCreatePlan}
              disabled={disabled || creatingPlan || selectedIds.length < MIN_BULK_PROFILES}
              className="px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-semibold text-white transition-colors flex items-center gap-1.5 shadow-md shadow-brand-900/20"
            >
              {creatingPlan ? (
                <>
                  <RefreshCw size={12} className="animate-spin" />
                  <span>Planning…</span>
                </>
              ) : (
                <>
                  <Layers size={13} />
                  <span>Create Export Plan</span>
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
                  <span>Bulk Export Plan ({plan.jobs.length} Jobs Ready)</span>
                </div>
                <button
                  type="button"
                  onClick={handleClearPlan}
                  className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Clear Plan
                </button>
              </div>

              {/* Job List Preview */}
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {plan.jobs.map((job, idx) => {
                  const colorClass = PLATFORM_COLORS[job.platform] || PLATFORM_COLORS.Other
                  return (
                    <div
                      key={job.jobId}
                      className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 flex items-start gap-2.5 text-xs text-zinc-300"
                    >
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
                          <span className="ml-auto text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold uppercase shrink-0">
                            {job.status}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                          <SlidersHorizontal size={10} className="text-brand-400 shrink-0" />
                          <span className="truncate">
                            {formatPresetSummary(job.variationPreset)}
                          </span>
                        </div>

                        <p className="text-[9px] font-mono text-zinc-600 truncate" title={job.outputFilename}>
                          File: {job.outputFilename}
                        </p>
                      </div>

                      {/* Reorder and Remove Controls */}
                      <div className="flex items-center gap-1 shrink-0 ml-1 mt-0.5">
                        <button
                          type="button"
                          onClick={() => handleMoveJob(idx, -1)}
                          disabled={disabled || idx === 0}
                          className="p-1 text-zinc-500 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Move up"
                        >
                          <ChevronUp size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveJob(idx, 1)}
                          disabled={disabled || idx === plan.jobs.length - 1}
                          className="p-1 text-zinc-500 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Move down"
                        >
                          <ChevronDown size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveJob(job.jobId)}
                          disabled={disabled}
                          className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                          title="Remove from plan"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="p-2 rounded-lg bg-zinc-950/60 border border-zinc-800 text-[10px] text-zinc-400 flex items-center gap-2">
                <Clock size={12} className="text-brand-400 shrink-0" />
                <span>
                  Export plan ready. Jobs take an immutable snapshot of selected profile presets. Bulk FFmpeg execution will be enabled in Phase 2C-2.
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
