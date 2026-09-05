import { useState } from 'react'
import { Film, CheckCircle, AlertCircle, FolderOpen, Lock, Sparkles } from 'lucide-react'
import ProgressBar from './ProgressBar'
import { hasFeature } from '../utils/features'

const ASPECT_RATIOS = [
  { id: '9:16', label: '9:16', desc: 'Reels / Shorts', minTier: 'basic' },
  { id: '1:1',  label: '1:1',  desc: 'Square Feed',   minTier: 'standard' },
  { id: '4:5',  label: '4:5',  desc: 'Portrait Feed', minTier: 'standard' },
  { id: '16:9', label: '16:9', desc: 'Landscape',     minTier: 'standard' },
]

const MODES = [
  {
    id: 'blur',
    label: 'Blur',
    minTier: 'basic',
    description: 'Centered video with blurred background filling the frame',
    preview: (
      <div className="w-full h-full bg-zinc-700 relative overflow-hidden rounded">
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-600 to-zinc-800 blur-sm scale-110" />
        <div className="absolute inset-x-3 inset-y-4 bg-zinc-500 rounded" />
      </div>
    )
  },
  {
    id: 'crop',
    label: 'Crop',
    minTier: 'basic',
    description: 'Center-crop to aspect — no borders, fills entire frame',
    preview: (
      <div className="w-full h-full bg-zinc-600 rounded" />
    )
  },
  {
    id: 'pad',
    label: 'Pad',
    minTier: 'basic',
    description: 'Scale to fit with black letterbox / pillarbox borders',
    preview: (
      <div className="w-full h-full bg-zinc-900 flex items-center justify-center rounded">
        <div className="w-3/4 h-1/2 bg-zinc-600 rounded" />
      </div>
    )
  },
  {
    id: 'smart_crop',
    label: 'Smart Crop (AI)',
    minTier: 'pro',
    description: 'AI subject tracking and automated focal reframing',
    preview: (
      <div className="w-full h-full bg-zinc-800 border border-brand-500/40 rounded flex items-center justify-center relative overflow-hidden">
        <div className="w-8 h-8 rounded-full border border-brand-400/80 animate-ping opacity-30" />
        <Sparkles size={18} className="text-brand-400 z-10" />
      </div>
    )
  }
]

export default function ReelPanel({
  videoPath,
  metadata,
  progress,
  isProcessing,
  setIsProcessing,
  setProgress,
  licenseTier = 'standard',
  onOpenUpgrade,
}) {
  const [aspectRatio, setAspectRatio] = useState('9:16')
  const [mode, setMode]               = useState('blur')
  const [outputPath, setOutputPath]   = useState('')
  const [result, setResult]           = useState(null)
  const [error, setError]             = useState(null)

  const canAllAspects = hasFeature(licenseTier, 'all_aspect_ratios')
  const canSmartCrop = hasFeature(licenseTier, 'smart_crop')

  const pickOutput = async () => {
    const base = videoPath ? videoPath.replace(/\.[^.]+$/, '') : 'output'
    const p = await window.api.saveFile(`${base}_reel.mp4`)
    if (p) setOutputPath(p)
  }

  const handleSelectAspect = (ratio) => {
    if (ratio.minTier === 'standard' && !canAllAspects) {
      onOpenUpgrade?.('standard', 'All Aspect Ratios')
      return
    }
    setAspectRatio(ratio.id)
  }

  const handleSelectMode = (m) => {
    if (m.minTier === 'pro' && !canSmartCrop) {
      onOpenUpgrade?.('pro', 'Smart Crop (AI)')
      return
    }
    setMode(m.id)
  }

  const handleReel = async () => {
    if (!videoPath) return
    setIsProcessing(true)
    setProgress(0)
    setResult(null)
    setError(null)

    const outPath = outputPath || videoPath.replace(/(\.[^.]+)$/, '_reel$1')

    window.api.off('video:progress')
    window.api.onProgress(({ percent }) => setProgress(percent))

    const res = await window.api.reel({
      inputPath: videoPath,
      outputPath: outPath,
      mode,
      aspectRatio,
    })

    setIsProcessing(false)
    setProgress(0)
    window.api.off('video:progress')

    if (res.success) setResult(res)
    else setError(res.error)
  }

  return (
    <div className="flex flex-col gap-5 animate-slide-up">
      <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
        <Film size={18} className="text-brand-400" /> Make Reel
        <span className="ml-auto text-xs text-zinc-500 font-normal">Aspect: {aspectRatio}</span>
      </h2>

      {/* Aspect Ratio Selector (Gated) */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-400 font-medium">Target Aspect Ratio</span>
          {!canAllAspects && (
            <span className="text-[10px] text-amber-400 flex items-center gap-1">
              <Lock size={10} /> Standard unlocks all ratios
            </span>
          )}
        </div>
        <div className="grid grid-cols-4 gap-2">
          {ASPECT_RATIOS.map((ratio) => {
            const isLocked = ratio.minTier === 'standard' && !canAllAspects
            const isSelected = aspectRatio === ratio.id
            return (
              <button
                key={ratio.id}
                type="button"
                onClick={() => handleSelectAspect(ratio)}
                className={`py-2 px-2 rounded-lg text-xs font-semibold border transition-all flex flex-col items-center justify-center ${
                  isSelected
                    ? 'bg-brand-600/20 border-brand-500/50 text-brand-300'
                    : isLocked
                    ? 'bg-zinc-950/60 border-zinc-800 text-zinc-500 hover:border-zinc-700'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <div className="flex items-center gap-1">
                  <span>{ratio.label}</span>
                  {isLocked && <Lock size={10} className="text-amber-400" />}
                </div>
                <span className="text-[9px] text-zinc-500 font-normal">{ratio.desc}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Layout Mode Selector (With Smart Crop Pro Gating) */}
      <div className="grid grid-cols-4 gap-2.5">
        {MODES.map(m => {
          const isLocked = m.minTier === 'pro' && !canSmartCrop
          const isSelected = mode === m.id
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => handleSelectMode(m)}
              className={`flex flex-col rounded-xl border p-2.5 transition-all text-left relative ${
                isSelected
                  ? 'border-brand-600/50 bg-brand-600/10 ring-1 ring-brand-600/30'
                  : isLocked
                  ? 'border-zinc-800 bg-zinc-950/60 text-zinc-500'
                  : 'border-zinc-700 bg-zinc-900 hover:border-zinc-600'
              }`}
            >
              {isLocked && (
                <div className="absolute top-2 right-2">
                  <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-300 border border-brand-500/30 font-bold flex items-center gap-0.5">
                    <Lock size={8} /> Pro
                  </span>
                </div>
              )}
              {/* Preview box */}
              <div className="w-full aspect-[9/16] max-h-20 mb-2">
                {m.preview}
              </div>
              <p className={`text-xs font-semibold ${isSelected ? 'text-brand-300' : 'text-zinc-300'}`}>
                {m.label}
              </p>
              <p className="text-[10px] text-zinc-500 mt-0.5 leading-tight truncate">{m.description}</p>
            </button>
          )
        })}
      </div>

      {/* Output */}
      <div className="flex gap-2">
        <input
          type="text"
          value={outputPath}
          onChange={e => setOutputPath(e.target.value)}
          placeholder="Output path (optional)"
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-brand-500 transition-colors"
        />
        <button
          onClick={pickOutput}
          className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-100 transition-colors"
        >
          <FolderOpen size={16} />
        </button>
      </div>

      {/* Progress */}
      {isProcessing && (
        <ProgressBar percent={progress} label="Rendering Reel…" subLabel={`Mode: ${mode} · ${aspectRatio}`} />
      )}

      {/* Result */}
      {result && !isProcessing && (
        <div className="flex items-start gap-3 p-3 bg-green-500/10 border border-green-500/20 rounded-xl animate-fade-in">
          <CheckCircle size={16} className="text-green-400 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm text-green-300 font-medium">Reel created! 🎉</p>
            <p
              className="text-xs text-zinc-400 truncate mt-0.5 cursor-pointer hover:text-zinc-200"
              onClick={() => window.api.showInFolder(result.outputPath)}
              title={result.outputPath}
            >
              {result.outputPath}
            </p>
          </div>
        </div>
      )}

      {error && !isProcessing && (
        <div className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl animate-fade-in">
          <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {/* Action */}
      <button
        disabled={isProcessing}
        onClick={handleReel}
        className="w-full py-2.5 bg-brand-600 hover:bg-brand-500 disabled:bg-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors shadow-lg shadow-brand-900/30 flex items-center justify-center gap-2"
      >
        <Film size={15} />
        {isProcessing ? 'Rendering…' : `Convert to ${aspectRatio} Reel`}
      </button>
    </div>
  )
}
