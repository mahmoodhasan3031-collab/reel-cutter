import { useState, useEffect } from 'react'
import {
  Sparkles,
  Download,
  RotateCcw,
  CheckCircle,
  AlertCircle,
  Loader2,
  X,
  ArrowUpCircle,
  ShieldAlert,
} from 'lucide-react'
import ProgressBar from './ProgressBar'

export default function UpdateNotification() {
  const [updateState, setUpdateState] = useState({
    status: 'idle', // 'idle' | 'checking' | 'not-available' | 'available' | 'downloading' | 'downloaded' | 'installing' | 'error'
    info: null,
    progress: null,
    error: null,
    isProcessingActive: false,
  })
  const [isDismissed, setIsDismissed] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    // Initial status fetch
    window.api.getUpdateStatus?.().then((res) => {
      if (res && res.status) {
        setUpdateState(res)
      }
    })

    const handleStatus = (data) => {
      if (data) {
        setUpdateState(data)
        // Auto un-dismiss if a new state arrives (e.g. update becomes available or downloaded)
        if (data.status === 'available' || data.status === 'downloaded' || data.status === 'error') {
          setIsDismissed(false)
        }
      }
    }

    window.api.onUpdateStatus?.(handleStatus)

    return () => {
      window.api.off?.('updater:status')
    }
  }, [])

  const handleDownload = async () => {
    setActionLoading(true)
    try {
      const res = await window.api.downloadUpdate?.()
      if (res && !res.success && res.error) {
        setUpdateState((prev) => ({ ...prev, status: 'error', error: res.error }))
      }
    } catch (err) {
      setUpdateState((prev) => ({ ...prev, status: 'error', error: err.message }))
    } finally {
      setActionLoading(false)
    }
  }

  const handleInstall = async () => {
    setActionLoading(true)
    try {
      const res = await window.api.installUpdate?.()
      if (res && !res.success && res.error) {
        setUpdateState((prev) => ({ ...prev, status: 'error', error: res.error }))
      }
    } catch (err) {
      setUpdateState((prev) => ({ ...prev, status: 'error', error: err.message }))
    } finally {
      setActionLoading(false)
    }
  }

  const { status, info, progress, error, isProcessingActive } = updateState

  // Don't render if idle or dismissed or not-available
  if (isDismissed || status === 'idle' || status === 'not-available') {
    return null
  }

  return (
    <aside aria-label="Update notification" className="relative z-50 bg-gradient-to-r from-brand-950/95 via-zinc-900/95 to-zinc-950/95 border-b border-brand-500/30 px-4 py-2.5 shadow-xl backdrop-blur animate-slide-down">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 flex-wrap text-xs">
        {/* Left Side: Status Icon & Message */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {status === 'checking' && (
            <>
              <Loader2 size={16} className="text-brand-400 animate-spin shrink-0" />
              <span className="text-zinc-300">Checking for updates…</span>
            </>
          )}

          {status === 'available' && (
            <>
              <div className="p-1 rounded-full bg-brand-500/20 text-brand-400 shrink-0">
                <Sparkles size={14} />
              </div>
              <div className="min-w-0">
                <span className="font-semibold text-zinc-100">
                  Update Available: v{info?.version || 'New'}
                </span>
                <span className="text-zinc-400 ml-1.5 hidden sm:inline">
                  {info?.releaseNotes || 'A new version of Reel Cutter is ready to download.'}
                </span>
              </div>
            </>
          )}

          {status === 'downloading' && (
            <>
              <Loader2 size={16} className="text-brand-400 animate-spin shrink-0" />
              <div className="flex-1 min-w-[140px] max-w-xs space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-zinc-300">Downloading v{info?.version}…</span>
                  <span className="text-brand-400 font-mono font-bold">{progress?.percent || 0}%</span>
                </div>
                <ProgressBar progress={progress?.percent || 0} />
              </div>
            </>
          )}

          {status === 'downloaded' && (
            <>
              <div className="p-1 rounded-full bg-emerald-500/20 text-emerald-400 shrink-0">
                <CheckCircle size={14} />
              </div>
              <div className="min-w-0">
                <span className="font-semibold text-zinc-100">
                  Update v{info?.version} Downloaded!
                </span>
                <span className="text-zinc-400 ml-1.5 hidden sm:inline">
                  Restart Reel Cutter to complete installation.
                </span>
              </div>
            </>
          )}

          {status === 'installing' && (
            <>
              <Loader2 size={16} className="text-brand-400 animate-spin shrink-0" />
              <span className="text-zinc-200 font-medium">Installing update and restarting Reel Cutter…</span>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="p-1 rounded-full bg-rose-500/20 text-rose-400 shrink-0">
                <AlertCircle size={14} />
              </div>
              <div className="min-w-0">
                <span className="font-semibold text-rose-300">Update check notice:</span>
                <span className="text-zinc-400 ml-1.5 truncate">{error || 'Unable to reach update server.'}</span>
              </div>
            </>
          )}
        </div>

        {/* Video Processing Active Protection Notice */}
        {isProcessingActive && (status === 'available' || status === 'downloaded') && (
          <div className="flex items-center gap-1.5 text-amber-400/90 text-[11px] bg-amber-950/40 border border-amber-500/30 px-2 py-0.5 rounded-lg">
            <ShieldAlert size={12} />
            <span>Video processing active. Install queued until finished.</span>
          </div>
        )}

        {/* Right Side: Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {status === 'available' && (
            <button
              onClick={handleDownload}
              disabled={actionLoading || isProcessingActive}
              className="px-3 py-1 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white rounded-lg font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
            >
              {actionLoading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
              <span>Download Update</span>
            </button>
          )}

          {status === 'downloaded' && (
            <button
              onClick={handleInstall}
              disabled={actionLoading || isProcessingActive}
              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
            >
              {actionLoading ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
              <span>Restart & Install</span>
            </button>
          )}

          {/* Dismiss Button */}
          {status !== 'downloading' && status !== 'installing' && (
            <button
              onClick={() => setIsDismissed(true)}
              className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              title="Dismiss notification"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}
