import { useState, useEffect, useCallback, useRef } from 'react'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import VideoDropzone from './components/VideoDropzone'
import VideoInfo from './components/VideoInfo'
import CutPanel from './components/CutPanel'
import ReelPanel from './components/ReelPanel'
import SplitPanel from './components/SplitPanel'
import SettingsPanel from './components/SettingsPanel'
import ActivationScreen from './components/ActivationScreen'
import OfflineBanner from './components/OfflineBanner'
import UpgradeModal from './components/UpgradeModal'
import ProFeaturePlaceholder from './components/ProFeaturePlaceholder'
import BatchQueuePanel from './components/BatchQueuePanel'
import PageProfilesPanel from './components/PageProfilesPanel'
import SchedulePanel from './components/SchedulePanel'
import ExportIntelligenceDashboard from './components/ExportIntelligenceDashboard'
import ExportCommandCenter from './components/ExportCommandCenter'
import WorkflowRecipeSelector from './components/WorkflowRecipeSelector'
import WorkflowRecipeEditor from './components/WorkflowRecipeEditor'
import BulkScheduleModal from './components/BulkScheduleModal'
import UpdateNotification from './components/UpdateNotification'
import { Loader2 } from 'lucide-react'
import { hasFeature } from './utils/features'

export default function App() {
  const [view, setView] = useState('drop') // 'drop' | 'info' | 'cut' | 'reel' | 'split' | 'settings' | 'ai_thumbnails' | 'batch_queue' | 'dashboard' | 'command_center'
  const [videoPath, setVideoPath] = useState(null)
  const [metadata, setMetadata] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)

  // ─── Global Export State (Bug #1 fix — survives panel unmount) ─────────────
  const [exportResult, setExportResult] = useState(null)
  const [exportError, setExportError] = useState(null)
  const [thumbnailPreview, setThumbnailPreview] = useState(null)
  const [segments, setSegments] = useState([])
  const activeExportOpRef = useRef(null)

  // ─── Workflow Recipe State (Phase 5K) ─────────────────────────────────────
  const [isRecipeEditorOpen, setIsRecipeEditorOpen] = useState(false)
  const [editingRecipe, setEditingRecipe] = useState(null)
  const [appliedRecipeSnapshot, setAppliedRecipeSnapshot] = useState(null)

  // ─── Bulk Schedule Modal State (Phase 5L bug fix) ─────────────────────────
  const [isBulkScheduleModalOpen, setIsBulkScheduleModalOpen] = useState(false)
  const [bulkScheduleRecipe, setBulkScheduleRecipe] = useState(null)

  // ─── Upgrade Modal State ──────────────────────────────────────────────────
  const [upgradeModal, setUpgradeModal] = useState({
    isOpen: false,
    requiredTier: 'standard',
    featureName: 'Premium Feature',
  })

  const handleOpenUpgrade = (requiredTier = 'standard', featureName = 'This feature') => {
    setUpgradeModal({
      isOpen: true,
      requiredTier,
      featureName,
    })
  }

  const handleCloseUpgrade = () => {
    setUpgradeModal((prev) => ({ ...prev, isOpen: false }))
  }

  // ─── License State ──────────────────────────────────────────────────────────
  const [licenseState, setLicenseState] = useState({
    isChecking: true,
    isValid: false,
    tier: 'standard',
    status: null,
    maskedKey: null,
    shortHwid: null,
    isOffline: false,
    gracePeriodRemainingHours: null,
  })

  useEffect(() => {
    checkInitialLicense()

    const handleStatusChanged = (res) => {
      if (!res) return
      if (res.isValid) {
        setLicenseState((prev) => ({
          ...prev,
          isValid: true,
          tier: res.tier || prev.tier,
          status: res.status || 'active',
          maskedKey: res.maskedKey || prev.maskedKey,
          shortHwid: res.shortHwid || prev.shortHwid,
          isOffline: !!res.isOffline,
          gracePeriodRemainingHours: res.gracePeriodRemainingHours,
        }))
      } else {
        setLicenseState((prev) => ({
          ...prev,
          isValid: false,
          status: res.reason || 'unactivated',
          isOffline: false,
          gracePeriodRemainingHours: null,
        }))
      }
    }

    window.api.onLicenseStatusChanged?.(handleStatusChanged)

    const handleOnline = () => {
      window.api.notifyOnline?.().then((res) => {
        if (res) handleStatusChanged(res)
      }).catch(() => {})
    }
    window.addEventListener('online', handleOnline)

    return () => {
      window.api.off?.('license:statusChanged')
      window.removeEventListener('online', handleOnline)
    }
  }, [])

  // ─── Global IPC listeners for export progress (Bug #1 fix) ────────────────
  // These persist across panel unmount — the progress/result always reach App.
  useEffect(() => {
    const handleProgress = ({ percent }) => {
      setProgress(percent)
    }

    const handleDone = (data) => {
      setIsProcessing(false)
      setProgress(0)
      activeExportOpRef.current = null

      if (data.operation === 'split') {
        setSegments(prev => [...prev, ...(data.segments || [])])
        setExportResult(prev => prev || data)
      } else {
        setExportResult(data)
        setExportError(null)
      }

      if (data.thumbnailPath) {
        window.api.readImageBase64?.(data.thumbnailPath).then(url => {
          if (url) setThumbnailPreview(url)
        }).catch(() => {})
      }
    }

    const handleError = (data) => {
      setIsProcessing(false)
      setProgress(0)
      activeExportOpRef.current = null
      setExportError(data.error || 'Export failed')
    }

    const handleSegment = (seg) => {
      setSegments(prev => [...prev, seg])
    }

    window.api.onProgress(handleProgress)
    window.api.onDone(handleDone)
    window.api.onError(handleError)
    window.api.onSegment(handleSegment)

    return () => {
      window.api.off('video:progress')
      window.api.off('video:done')
      window.api.off('video:error')
      window.api.off('video:segment')
    }
  }, [])

  const checkInitialLicense = async () => {
    setLicenseState((prev) => ({ ...prev, isChecking: true }))
    try {
      const res = await window.api.checkLicense()
      if (res && res.isValid) {
        setLicenseState({
          isChecking: false,
          isValid: true,
          tier: res.tier || 'standard',
          status: res.status || 'active',
          maskedKey: res.maskedKey,
          shortHwid: res.shortHwid,
          isOffline: !!res.isOffline,
          gracePeriodRemainingHours: res.gracePeriodRemainingHours,
        })
      } else {
        setLicenseState({
          isChecking: false,
          isValid: false,
          tier: 'standard',
          status: res?.reason || 'unactivated',
          maskedKey: null,
          shortHwid: null,
          isOffline: false,
          gracePeriodRemainingHours: null,
        })
      }
    } catch (err) {
      setLicenseState({
        isChecking: false,
        isValid: false,
        tier: 'standard',
        status: 'error',
        maskedKey: null,
        shortHwid: null,
        isOffline: false,
        gracePeriodRemainingHours: null,
      })
    }
  }

  const handleActivated = (licenseData) => {
    setLicenseState({
      isChecking: false,
      isValid: true,
      tier: licenseData.tier || 'standard',
      status: licenseData.status || 'active',
      maskedKey: licenseData.maskedKey,
      shortHwid: licenseData.shortHwid,
      isOffline: false,
      gracePeriodRemainingHours: null,
    })
    setView('drop')
  }

  const handleDeactivate = () => {
    setLicenseState({
      isChecking: false,
      isValid: false,
      tier: 'standard',
      status: 'unactivated',
      maskedKey: null,
      shortHwid: null,
      isOffline: false,
      gracePeriodRemainingHours: null,
    })
    setVideoPath(null)
    setMetadata(null)
    setView('drop')
  }

  const handleFileLoaded = (filePath, meta) => {
    setVideoPath(filePath)
    setMetadata(meta)
    setView('cut')
  }

  const handleChangeFile = () => {
    setVideoPath(null)
    setMetadata(null)
    setView('drop')
  }

  // ─── Global export handler (Bug #1 fix) ───────────────────────────────────
  // Panels call this with their config; the IPC call lives here so progress
  // and result survive panel unmount / navigation.
  const handleStartExport = useCallback(async (opType, config) => {
    if (isProcessing) return
    setIsProcessing(true)
    setProgress(0)
    setExportResult(null)
    setExportError(null)
    setThumbnailPreview(null)
    if (opType === 'split') setSegments([])
    activeExportOpRef.current = opType

    try {
      if (opType === 'cut') {
        await window.api.cut(config)
      } else if (opType === 'reel') {
        await window.api.reel(config)
      } else if (opType === 'split') {
        await window.api.split(config)
      } else {
        throw new Error(`Unknown export type: ${opType}`)
      }
      // onDone/onError handlers (set up in useEffect above) own the result
    } catch (err) {
      setIsProcessing(false)
      setProgress(0)
      setExportError(err.message)
      activeExportOpRef.current = null
    }
  }, [isProcessing])

  const hasVideo = !!videoPath

  // ─── Workflow Recipe Handlers (Phase 5K) ──────────────────────────────────
  const handleApplyRecipe = useCallback((recipe) => {
    if (!recipe) return
    const snap = {
      mode: recipe.outputSettings?.mode || 'blur',
      aspectRatio: recipe.outputSettings?.aspectRatio || '9:16',
      resolution: recipe.outputSettings?.resolution || '1080p',
      interval: recipe.outputSettings?.interval,
      textOverlays: Array.isArray(recipe.textOverlays) ? recipe.textOverlays : [],
      recipeId: recipe.id,
      recipeName: recipe.name,
    }
    setAppliedRecipeSnapshot(snap)
    if (recipe.exportType && ['cut', 'reel', 'split'].includes(recipe.exportType)) {
      setView(hasVideo ? recipe.exportType : 'drop')
    }
    window.api.applyWorkflowRecipe?.(recipe.id).catch(() => {})
  }, [hasVideo])

  const handleRecipeEditorSave = useCallback(async (recipeData) => {
    try {
      if (editingRecipe?.id && !editingRecipe?.isBuiltIn) {
        await window.api.updateWorkflowRecipe(editingRecipe.id, recipeData)
      } else {
        await window.api.createWorkflowRecipe(recipeData)
      }
      setIsRecipeEditorOpen(false)
      setEditingRecipe(null)
    } catch (err) {
      console.error('[App] Recipe save failed:', err)
    }
  }, [editingRecipe])

  const handleRecipeEditorCancel = useCallback(() => {
    setIsRecipeEditorOpen(false)
    setEditingRecipe(null)
  }, [])

  const handleOpenRecipeEditor = useCallback((recipe = null) => {
    setEditingRecipe(recipe)
    setIsRecipeEditorOpen(true)
  }, [])

  const handleDeleteRecipe = useCallback(async (recipe) => {
    if (!recipe || recipe.isBuiltIn) return
    try {
      await window.api.deleteWorkflowRecipe(recipe.id)
    } catch (err) {
      console.error('[App] Recipe delete failed:', err)
    }
  }, [])

  const handleDuplicateRecipe = useCallback(async (recipe) => {
    if (!recipe) return
    try {
      const dup = await window.api.duplicateWorkflowRecipe(recipe.id)
      if (dup) {
        setEditingRecipe(dup)
        setIsRecipeEditorOpen(true)
      }
    } catch (err) {
      console.error('[App] Recipe duplicate failed:', err)
    }
  }, [])

  // ─── Recipe Automation Handlers (Phase 5L) ─────────────────────────────────
  const isRecipeAutomationPro = hasFeature(licenseState.tier, 'recipe_automation')

  const handleRecipeBulkExport = useCallback(async (recipe) => {
    if (!recipe) return
    setEditingRecipe(recipe)
    setView('batch_queue')
  }, [])

  const handleRecipeSchedule = useCallback(async (recipe) => {
    if (!recipe) return
    setEditingRecipe(recipe)
    setView('schedule')
  }, [])

  const handleRecipeBulkSchedule = useCallback(async (recipe) => {
    if (!recipe) return
    setBulkScheduleRecipe(recipe)
    setIsBulkScheduleModalOpen(true)
  }, [])

  const isRecipePro = hasFeature(licenseState.tier, 'workflow_recipes')
  const isCommandCenterPro = hasFeature(licenseState.tier, 'export_command_center')
  const isDashboardPro = hasFeature(licenseState.tier, 'export_intelligence_dashboard')

  const isPro = hasFeature(licenseState.tier, 'ai_thumbnails')

  const sharedProps = {
    videoPath,
    metadata,
    progress,
    isProcessing,
    setIsProcessing,
    setProgress,
    licenseTier: licenseState.tier,
    onOpenUpgrade: handleOpenUpgrade,
    onStartExport: handleStartExport,
    exportResult,
    exportError,
    thumbnailPreview,
    appliedRecipeSnapshot,
    onClearRecipe: () => setAppliedRecipeSnapshot(null),
  }

  // ─── 1. Checking Splash ─────────────────────────────────────────────────────
  if (licenseState.isChecking) {
    return (
      <div className="flex flex-col h-screen overflow-hidden bg-zinc-950 text-zinc-100">
        <TitleBar />
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <Loader2 size={32} className="animate-spin text-brand-500" />
          <p className="text-xs text-zinc-500 tracking-wider uppercase font-medium">
            Verifying Hardware & License…
          </p>
        </div>
      </div>
    )
  }

  // ─── 2. License Required (Locked State) ──────────────────────────────────────
  if (!licenseState.isValid) {
    return (
      <div className="flex flex-col h-screen overflow-hidden bg-zinc-950 text-zinc-100">
        <TitleBar />
        <ActivationScreen onActivated={handleActivated} />
      </div>
    )
  }

  // ─── 3. Main Dashboard (Unlocked State) ─────────────────────────────────────
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      {/* Custom title bar */}
      <TitleBar />

      {/* Auto-Updater Notification Banner */}
      <UpdateNotification />

      {/* Offline grace period indicator banner if offline */}
      {licenseState.isOffline && (
        <OfflineBanner remainingHours={licenseState.gracePeriodRemainingHours} />
      )}

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          view={view}
          setView={setView}
          hasVideo={hasVideo}
          licenseTier={licenseState.tier}
          isOffline={licenseState.isOffline}
          onOpenUpgrade={handleOpenUpgrade}
        />

        {/* Main content area */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Settings View */}
          {view === 'settings' && (
            <div className="flex-1 overflow-y-auto p-6">
              <SettingsPanel
                license={licenseState}
                onLicenseUpdate={(updated) =>
                  setLicenseState((prev) => ({
                    ...prev,
                    tier: updated.tier,
                    isOffline: !!updated.isOffline,
                    gracePeriodRemainingHours: updated.gracePeriodRemainingHours,
                  }))
                }
                onDeactivate={handleDeactivate}
                onOpenUpgrade={handleOpenUpgrade}
              />
            </div>
          )}

          {/* AI Thumbnails Pro View */}
          {view === 'ai_thumbnails' && (
            <div className="flex-1 overflow-y-auto p-6">
              <ProFeaturePlaceholder
                type="ai_thumbnails"
                isUnlocked={isPro}
                onOpenUpgrade={handleOpenUpgrade}
                videoPath={videoPath}
              />
            </div>
          )}

          {/* Batch Queue Pro View */}
          {view === 'batch_queue' && (
            <div className="flex-1 overflow-y-auto p-6">
              <BatchQueuePanel
                licenseTier={licenseState.tier}
                onOpenUpgrade={handleOpenUpgrade}
              />
            </div>
          )}

          {/* Page Profiles View */}
          {view === 'profiles' && (
            <div className="flex-1 overflow-y-auto p-6">
              <PageProfilesPanel />
            </div>
          )}

          {/* Schedule View (Phase 3A) */}
          {view === 'schedule' && (
            <div className="flex-1 overflow-y-auto p-6">
              <SchedulePanel
                defaultVideoPath={videoPath}
                defaultExportType="cut"
              />
            </div>
          )}

          {/* Export Intelligence Dashboard (Phase 5H) */}
          {view === 'dashboard' && (
            <div className="flex-1 overflow-y-auto p-6">
              {isDashboardPro ? (
                <ExportIntelligenceDashboard
                  licenseTier={licenseState.tier}
                  onOpenUpgrade={handleOpenUpgrade}
                />
              ) : (
                <ProFeaturePlaceholder
                  type="dashboard"
                  isUnlocked={false}
                  onOpenUpgrade={handleOpenUpgrade}
                />
              )}
            </div>
          )}

          {/* Export Command Center (Phase 5I) */}
          {view === 'command_center' && (
            <div className="flex-1 overflow-y-auto p-6">
              {isCommandCenterPro ? (
                <ExportCommandCenter
                  onNavigate={setView}
                />
              ) : (
                <ProFeaturePlaceholder
                  type="command_center"
                  isUnlocked={false}
                  onOpenUpgrade={handleOpenUpgrade}
                />
              )}
            </div>
          )}

          {/* Workflow Recipes (Phase 5K) */}
          {view === 'workflow_recipes' && (
            <div className="flex-1 overflow-y-auto p-6">
              {isRecipePro ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold text-zinc-100">Workflow Recipes</h2>
                    <button
                      onClick={() => handleOpenRecipeEditor(null)}
                      className="px-3 py-1.5 text-xs bg-brand-600 hover:bg-brand-500 text-white rounded transition-colors"
                    >
                      + New Recipe
                    </button>
                  </div>
                  <WorkflowRecipeSelector
                    onApply={handleApplyRecipe}
                    onEdit={(r) => handleOpenRecipeEditor(r)}
                    onCreate={() => handleOpenRecipeEditor(null)}
                    onDelete={handleDeleteRecipe}
                    onDuplicate={handleDuplicateRecipe}
                    onBulkExport={isRecipeAutomationPro ? handleRecipeBulkExport : undefined}
                    onSchedule={isRecipeAutomationPro ? handleRecipeSchedule : undefined}
                    onBulkSchedule={isRecipeAutomationPro ? handleRecipeBulkSchedule : undefined}
                  />
                  {isRecipeEditorOpen && (
                    <WorkflowRecipeEditor
                      recipe={editingRecipe}
                      onSave={handleRecipeEditorSave}
                      onCancel={handleRecipeEditorCancel}
                    />
                  )}
                </div>
              ) : (
                <ProFeaturePlaceholder
                  type="workflow_recipes"
                  isUnlocked={false}
                  onOpenUpgrade={handleOpenUpgrade}
                />
              )}
            </div>
          )}

          {/* Drop view — full panel */}
          {view === 'drop' && (
            <VideoDropzone onFileLoaded={handleFileLoaded} />
          )}

          {/* Video Tool views */}
          {view !== 'drop' &&
            view !== 'settings' &&
            view !== 'ai_thumbnails' &&
            view !== 'batch_queue' &&
            view !== 'profiles' &&
            view !== 'schedule' &&
            view !== 'dashboard' &&
            view !== 'command_center' &&
            view !== 'workflow_recipes' &&
            hasVideo && (
              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                <VideoInfo
                  videoPath={videoPath}
                  metadata={metadata}
                  onChangeFile={handleChangeFile}
                />

                <div className="border-t border-zinc-800" />

                {view === 'info' && <InfoPanel metadata={metadata} />}
                {view === 'cut' && <CutPanel {...sharedProps} />}
                {view === 'reel' && <ReelPanel {...sharedProps} />}
                {view === 'split' && <SplitPanel {...sharedProps} segments={segments} setSegments={setSegments} />}
              </div>
            )}
        </main>
      </div>

      {/* Global processing overlay */}
      {isProcessing && (
        <div className="h-1 w-full progress-gradient animate-pulse" />
      )}

      {/* Upgrade Modal */}
      <UpgradeModal
        isOpen={upgradeModal.isOpen}
        onClose={handleCloseUpgrade}
        requiredTier={upgradeModal.requiredTier}
        featureName={upgradeModal.featureName}
      />

      {/* Bulk Schedule Modal (Phase 5L bug fix) */}
      {isBulkScheduleModalOpen && bulkScheduleRecipe && (
        <BulkScheduleModal
          recipe={bulkScheduleRecipe}
          onClose={() => {
            setIsBulkScheduleModalOpen(false)
            setBulkScheduleRecipe(null)
          }}
          onCreated={() => {
            setIsBulkScheduleModalOpen(false)
            setBulkScheduleRecipe(null)
          }}
        />
      )}
    </div>
  )
}

function InfoPanel({ metadata }) {
  if (!metadata) return null
  return (
    <div className="text-center py-6 animate-fade-in">
      <p className="text-sm text-zinc-500">
        Full video metadata shown above. Use the sidebar to cut, reel, or split.
      </p>
    </div>
  )
}
