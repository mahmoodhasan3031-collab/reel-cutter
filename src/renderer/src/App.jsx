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
import { Loader2 } from 'lucide-react'

export default function App() {
  const [view, setView] = useState('drop') // 'drop' | 'info' | 'cut' | 'reel' | 'split' | 'settings'
  const [videoPath, setVideoPath] = useState(null)
  const [metadata, setMetadata] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)

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

  // Validate license on startup
  useEffect(() => {
    checkInitialLicense()
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
    setView('cut') // jump straight to Cut after loading
  }

  const handleChangeFile = () => {
    setVideoPath(null)
    setMetadata(null)
    setView('drop')
  }

  const hasVideo = !!videoPath
  const sharedProps = { videoPath, metadata, progress, isProcessing, setIsProcessing, setProgress }

  // ─── 1. Initial Checking Splash ─────────────────────────────────────────────
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
        />

        {/* Main content area */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Settings View (Accessible anytime) */}
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
              />
            </div>
          )}

          {/* Drop view — full panel */}
          {view === 'drop' && (
            <VideoDropzone onFileLoaded={handleFileLoaded} />
          )}

          {/* Video Tool views */}
          {view !== 'drop' && view !== 'settings' && hasVideo && (
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Video info card (always visible at top) */}
              <VideoInfo
                videoPath={videoPath}
                metadata={metadata}
                onChangeFile={handleChangeFile}
              />

              {/* Divider */}
              <div className="border-t border-zinc-800" />

              {/* Active tool panel */}
              {view === 'info' && <InfoPanel metadata={metadata} />}
              {view === 'cut' && <CutPanel {...sharedProps} />}
              {view === 'reel' && <ReelPanel {...sharedProps} />}
              {view === 'split' && <SplitPanel {...sharedProps} />}
            </div>
          )}
        </main>
      </div>

      {/* Global processing overlay (subtle bottom bar) */}
      {isProcessing && (
        <div className="h-1 w-full progress-gradient animate-pulse" />
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
