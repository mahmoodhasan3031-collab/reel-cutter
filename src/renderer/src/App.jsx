import { useState, useEffect } from 'react'
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
import UpdateNotification from './components/UpdateNotification'
import { Loader2 } from 'lucide-react'
import { hasFeature } from './utils/features'

export default function App() {
  const [view, setView] = useState('drop') // 'drop' | 'info' | 'cut' | 'reel' | 'split' | 'settings' | 'ai_thumbnails' | 'batch_queue'
  const [videoPath, setVideoPath] = useState(null)
  const [metadata, setMetadata] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)

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

  const hasVideo = !!videoPath
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
                {view === 'split' && <SplitPanel {...sharedProps} />}
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
