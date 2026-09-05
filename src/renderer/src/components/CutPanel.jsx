import { useState } from 'react'
import { Scissors, FolderOpen, CheckCircle, AlertCircle, Lock, Sparkles } from 'lucide-react'
import ProgressBar from './ProgressBar'
import { hasFeature } from '../utils/features'

export default function CutPanel({
  videoPath,
  metadata,
  progress,
  isProcessing,
  setIsProcessing,
  setProgress,
  licenseTier = 'standard',
  onOpenUpgrade,
}) {
  const [start, setStart]             = useState('0')
  const [duration, setDuration]       = useState('30')
  const [end, setEnd]                 = useState('')
  const [useEnd, setUseEnd]           = useState(false)
  const [asReel, setAsReel]           = useState(false)
  const [mode, setMode]               = useState('blur')
  const [resolution, setResolution]   = useState('1080p')
  const [outputPath, setOutputPath]   = useState('')
  const [generateThumbnail, setGenerateThumbnail] = useState(false)
  const [thumbnailTitle, setThumbnailTitle] = useState('')
  const [thumbPreviewUrl, setThumbPreviewUrl] = useState(null)
  const [result, setResult]           = useState(null)
  const [error, setError]             = useState(null)

  const can4K = hasFeature(licenseTier, '4k_export')
  const canCustomDurations = hasFeature(licenseTier, 'custom_durations')
  const canThumbnail = hasFeature(licenseTier, 'ai_thumbnails')

  const pickOutput = async () => {
    const base = videoPath ? videoPath.replace(/\.[^.]+$/, '') : 'output'
    const p = await window.api.saveFile(`${base}_clip.mp4`)
    if (p) setOutputPath(p)
  }

  const handleSelect4K = () => {
    if (!can4K) {
      onOpenUpgrade?.('standard', '4K Ultra HD Export')
      return
    }
    setResolution('4k')
  }

  const handleCut = async () => {
    if (!videoPath) return
    setIsProcessing(true)
    setProgress(0)
    setResult(null)
    setError(null)
    setThumbPreviewUrl(null)

    const outPath = outputPath || videoPath.replace(/(\.[^.]+)$/, '_clip$1')

    window.api.off('video:progress')
    window.api.onProgress(({ percent }) => setProgress(percent))

    const isCustom = useEnd || (duration && !['15', '30', '60'].includes(String(duration)))

    const res = await window.api.cut({
      inputPath: videoPath,
      outputPath: outPath,
      start,
      duration: useEnd ? undefined : duration || undefined,
      end:      useEnd ? end       : undefined,
      reel: asReel,
      mode,
      resolution,
      customDuration: isCustom,
      generateThumbnail: canThumbnail && generateThumbnail,
      thumbnailTitle: thumbnailTitle.trim() || undefined,
    })

    setIsProcessing(false)
    setProgress(0)
    window.api.off('video:progress')

    if (res.success) {
      setResult(res)
      if (res.thumbnailPath) {
        window.api.readImageBase64?.(res.thumbnailPath).then(url => {
          if (url) setThumbPreviewUrl(url)
        })
      }
    } else {
      setError(res.error)
    }
  }

  return (
    <div className="flex flex-col gap-5 animate-slide-up">
      <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
        <Scissors size={18} className="text-brand-400" /> Cut Clip
      </h2>

      {/* Resolution Selector (1080p vs 4K Gated) */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 space-y-2">
        <span className="text-xs text-zinc-400 font-medium">Export Resolution</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setResolution('1080p')}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold border transition-all flex items-center justify-center gap-1.5 ${
              resolution === '1080p'
                ? 'bg-brand-600/20 border-brand-500/50 text-brand-300'
                : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            1080p Full HD
          </button>

          <button
            type="button"
            onClick={handleSelect4K}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold border transition-all flex items-center justify-center gap-1.5 ${
              resolution === '4k'
                ? 'bg-brand-600/20 border-brand-500/50 text-brand-300'
                : !can4K
                ? 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:border-zinc-700'
                : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {!can4K && <Lock size={12} className="text-amber-400" />}
            <span>4K Ultra HD</span>
            {!can4K && (
              <span className="text-[9px] uppercase px-1 py-0.2 rounded bg-amber-400/10 text-amber-300 border border-amber-400/20">
                Standard+
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Time & Duration Inputs */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-zinc-500 font-medium">Start Time</span>
            <input
              type="text"
              value={start}
              onChange={e => setStart(e.target.value)}
              placeholder="0 or 00:00:10"
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-brand-500 transition-colors"
            />
          </label>

          {useEnd ? (
            <label className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500 font-medium">End Time</span>
                {!canCustomDurations && (
                  <span className="text-[9px] text-amber-400 flex items-center gap-0.5">
                    <Lock size={10} /> Standard+
                  </span>
                )}
              </div>
              <input
                type="text"
                value={end}
                disabled={!canCustomDurations}
                onClick={() => !canCustomDurations && onOpenUpgrade?.('standard', 'Custom Durations')}
                onChange={e => setEnd(e.target.value)}
                placeholder="00:01:30"
                className="bg-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-brand-500 transition-colors"
              />
            </label>
          ) : (
            <label className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500 font-medium">Duration (seconds)</span>
                {!canCustomDurations && (
                  <span className="text-[9px] text-amber-400 flex items-center gap-0.5">
                    <Lock size={10} /> Standard+
                  </span>
                )}
              </div>
              <input
                type="text"
                value={duration}
                disabled={!canCustomDurations}
                onClick={() => !canCustomDurations && onOpenUpgrade?.('standard', 'Custom Durations')}
                onChange={e => setDuration(e.target.value)}
                placeholder="30 or 00:00:30"
                className="bg-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-brand-500 transition-colors"
              />
            </label>
          )}
        </div>

        {/* Preset duration buttons for quick access */}
        <div className="flex items-center gap-2 pt-1">
          <span className="text-[11px] text-zinc-500">Presets:</span>
          {['15', '30', '60'].map((sec) => (
            <button
              key={sec}
              type="button"
              onClick={() => {
                setUseEnd(false)
                setDuration(sec)
              }}
              className={`px-2.5 py-1 rounded text-xs border transition-colors ${
                !useEnd && duration === sec
                  ? 'bg-brand-600/20 border-brand-500/40 text-brand-300'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {sec}s
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={useEnd}
            onChange={e => {
              if (!canCustomDurations && e.target.checked) {
                onOpenUpgrade?.('standard', 'Custom Durations')
                return
              }
              setUseEnd(e.target.checked)
            }}
            className="w-4 h-4 rounded accent-brand-600"
          />
          <span className="text-xs text-zinc-400">Use end timestamp instead of duration</span>
        </label>
      </div>

      {/* 9:16 Reel toggle */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 space-y-3">
        <label className="flex items-center justify-between cursor-pointer">
          <div>
            <p className="text-sm font-medium text-zinc-200">Convert to 9:16 Reel</p>
            <p className="text-xs text-zinc-500 mt-0.5">Instagram Reels · YouTube Shorts · TikTok</p>
          </div>
          <div
            onClick={() => setAsReel(v => !v)}
            className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${asReel ? 'bg-brand-600' : 'bg-zinc-700'}`}
          >
            <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${asReel ? 'translate-x-5' : ''}`} />
          </div>
        </label>

        {asReel && (
          <div className="flex gap-2 pt-1">
            {['blur', 'crop', 'pad'].map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  mode === m ? 'bg-brand-600/20 border-brand-600/40 text-brand-300' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Pro Image Thumbnail Option (Gated by Pro) */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 space-y-3">
        <label className="flex items-center justify-between cursor-pointer">
          <div className="flex items-start gap-2.5">
            <div className="p-1.5 rounded-lg bg-brand-500/10 text-brand-400 mt-0.5">
              <Sparkles size={16} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-zinc-200">Generate Pro Thumbnail</p>
                {!canThumbnail && (
                  <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-amber-400/10 text-amber-300 border border-amber-400/20 font-bold flex items-center gap-0.5">
                    <Lock size={9} /> Pro
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">
                AI analyzes high-motion frames & composites a bold viral cover image (.jpg)
              </p>
            </div>
          </div>
          <div
            onClick={() => {
              if (!canThumbnail) {
                onOpenUpgrade?.('pro', 'AI Thumbnail / Pro Image')
                return
              }
              setGenerateThumbnail(v => !v)
            }}
            className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${
              canThumbnail && generateThumbnail ? 'bg-brand-600' : 'bg-zinc-700'
            }`}
          >
            <div
              className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                canThumbnail && generateThumbnail ? 'translate-x-5' : ''
              }`}
            />
          </div>
        </label>

        {canThumbnail && generateThumbnail && (
          <div className="pt-2 animate-fade-in space-y-1.5 border-t border-zinc-800/80">
            <span className="text-[11px] text-zinc-400 font-medium">Custom Cover Title (Optional)</span>
            <input
              type="text"
              value={thumbnailTitle}
              onChange={e => setThumbnailTitle(e.target.value)}
              placeholder="e.g. VIRAL MOMENT (defaults to clip name)"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-brand-500 transition-colors"
            />
          </div>
        )}
      </div>

      {/* Output */}
      <div className="flex gap-2">
        <input
          type="text"
          value={outputPath}
          onChange={e => setOutputPath(e.target.value)}
          placeholder="Output path (optional — auto-generated if blank)"
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
        <ProgressBar percent={progress} label="Cutting clip…" />
      )}

      {/* Result */}
      {result && !isProcessing && (
        <div className="space-y-3 animate-fade-in">
          <div className="flex items-start gap-3 p-3 bg-green-500/10 border border-green-500/20 rounded-xl">
            <CheckCircle size={16} className="text-green-400 mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-green-300 font-medium">Clip saved!</p>
              <p
                className="text-xs text-zinc-400 truncate mt-0.5 cursor-pointer hover:text-zinc-200"
                onClick={() => window.api.showInFolder(result.outputPath)}
                title={result.outputPath}
              >
                {result.outputPath}
              </p>
            </div>
          </div>

          {result.thumbnailPath && (
            <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center gap-4">
              {thumbPreviewUrl ? (
                <img
                  src={thumbPreviewUrl}
                  alt="Pro Thumbnail"
                  className="w-16 h-20 object-cover rounded-lg border border-zinc-700 shadow-md shrink-0 cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => window.api.showInFolder(result.thumbnailPath)}
                />
              ) : (
                <div className="w-16 h-20 bg-zinc-800 rounded-lg flex items-center justify-center shrink-0 border border-zinc-700">
                  <Sparkles size={18} className="text-brand-400" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-zinc-200">Pro Thumbnail Created</span>
                  <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-300 border border-brand-500/30 font-bold">
                    PRO IMAGE
                  </span>
                </div>
                <p
                  className="text-xs text-zinc-400 truncate mt-1 cursor-pointer hover:text-zinc-200"
                  onClick={() => window.api.showInFolder(result.thumbnailPath)}
                  title={result.thumbnailPath}
                >
                  {result.thumbnailPath}
                </p>
              </div>
            </div>
          )}
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
        onClick={handleCut}
        className="w-full py-2.5 bg-brand-600 hover:bg-brand-500 disabled:bg-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors shadow-lg shadow-brand-900/30 flex items-center justify-center gap-2"
      >
        <Scissors size={15} />
        {isProcessing ? 'Processing…' : 'Cut Clip'}
      </button>
    </div>
  )
}
