import { useState } from 'react'
import { SplitSquareHorizontal, FolderOpen, CheckCircle, AlertCircle, Film, Sparkles, Lock, Image } from 'lucide-react'
import ProgressBar from './ProgressBar'
import { hasFeature } from '../utils/features'

export default function SplitPanel({
  videoPath,
  metadata,
  progress,
  isProcessing,
  setIsProcessing,
  setProgress,
  licenseTier = 'standard',
  onOpenUpgrade,
}) {
  const [interval, setInterval]   = useState(30)
  const [asReel, setAsReel]       = useState(true)
  const [mode, setMode]           = useState('blur')
  const [generateThumbnail, setGenerateThumbnail] = useState(false)
  const [thumbnailTitle, setThumbnailTitle] = useState('')
  const [outputDir, setOutputDir] = useState('')
  const [segments, setSegments]   = useState([])
  const [splitProgress, setSplitProgress] = useState(null)
  const [error, setError]         = useState(null)
  const [done, setDone]           = useState(false)

  const canThumbnail = hasFeature(licenseTier, 'ai_thumbnails')

  const totalDuration  = metadata?.duration || 0
  const estimatedCount = totalDuration > 0 ? Math.ceil(totalDuration / interval) : 0

  const pickOutputDir = async () => {
    const dir = await window.api.selectDir()
    if (dir) setOutputDir(dir)
  }

  const handleSplit = async () => {
    if (!videoPath) return
    setIsProcessing(true)
    setProgress(0)
    setSegments([])
    setSplitProgress(null)
    setError(null)
    setDone(false)

    const outDir = outputDir || (videoPath ? videoPath.replace(/[\\/][^\\/]+$/, '') + '/reels' : './reels')

    window.api.off('video:progress')
    window.api.off('video:segment')

    window.api.onProgress(({ percent, current, total }) => {
      setProgress(percent)
      setSplitProgress({ current, total })
    })
    window.api.onSegment((seg) => {
      setSegments(prev => [...prev, seg])
    })

    const res = await window.api.split({
      inputPath: videoPath,
      outputDir: outDir,
      interval,
      reel: asReel,
      mode,
      generateThumbnail: canThumbnail && generateThumbnail,
      thumbnailTitle: thumbnailTitle.trim() || undefined,
    })

    setIsProcessing(false)
    setProgress(0)
    window.api.off('video:progress')
    window.api.off('video:segment')

    if (res.success) {
      setDone(true)
      setSegments(res.segments || [])
    } else {
      setError(res.error)
    }
  }

  return (
    <div className="flex flex-col gap-5 animate-slide-up">
      <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
        <SplitSquareHorizontal size={18} className="text-brand-400" /> Split Video
      </h2>

      {/* Interval slider */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-zinc-200">Clip Interval</label>
          <div className="flex items-center gap-2">
            <input
              type="number" min={1} max={3600} value={interval}
              onChange={e => setInterval(Number(e.target.value))}
              className="w-16 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-sm text-zinc-100 text-center focus:outline-none focus:border-brand-500"
            />
            <span className="text-xs text-zinc-500">seconds</span>
          </div>
        </div>
        <input
          type="range" min={5} max={300} step={5} value={interval}
          onChange={e => setInterval(Number(e.target.value))}
          className="w-full accent-brand-600"
        />
        <div className="flex justify-between text-[10px] text-zinc-600">
          <span>5s</span>
          <span className="text-zinc-400">
            {estimatedCount > 0 ? `≈ ${estimatedCount} clips` : '–'}
          </span>
          <span>300s</span>
        </div>
      </div>

      {/* Reel toggle */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 space-y-3">
        <label className="flex items-center justify-between cursor-pointer">
          <div>
            <p className="text-sm font-medium text-zinc-200">9:16 Vertical Format</p>
            <p className="text-xs text-zinc-500 mt-0.5">Convert each clip to Reel / Short</p>
          </div>
          <div
            onClick={() => setAsReel(v => !v)}
            className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${asReel ? 'bg-brand-600' : 'bg-zinc-700'}`}
          >
            <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${asReel ? 'translate-x-5' : ''}`} />
          </div>
        </label>

        {asReel && (
          <div className="flex gap-2">
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
                <p className="text-sm font-medium text-zinc-200">Generate Pro Thumbnails</p>
                {!canThumbnail && (
                  <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-amber-400/10 text-amber-300 border border-amber-400/20 font-bold flex items-center gap-0.5">
                    <Lock size={9} /> Pro
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">
                Generate high-engagement cover images (.jpg) for each split segment
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
            <span className="text-[11px] text-zinc-400 font-medium">Series Title Prefix (Optional)</span>
            <input
              type="text"
              value={thumbnailTitle}
              onChange={e => setThumbnailTitle(e.target.value)}
              placeholder="e.g. PODCAST HIGHLIGHT (appends 'Part 1', 'Part 2', etc.)"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-brand-500 transition-colors"
            />
          </div>
        )}
      </div>

      {/* Output dir */}
      <div className="flex gap-2">
        <input
          type="text" value={outputDir} onChange={e => setOutputDir(e.target.value)}
          placeholder="Output directory (auto-generated if blank)"
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-brand-500 transition-colors"
        />
        <button onClick={pickOutputDir}
          className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-100 transition-colors">
          <FolderOpen size={16} />
        </button>
      </div>

      {/* Progress */}
      {isProcessing && (
        <div className="space-y-2">
          <ProgressBar
            percent={progress}
            label={splitProgress ? `Processing clip ${splitProgress.current} of ${splitProgress.total}` : 'Preparing…'}
          />
          {segments.length > 0 && (
            <p className="text-xs text-zinc-500">{segments.length} clip{segments.length !== 1 ? 's' : ''} saved so far…</p>
          )}
        </div>
      )}

      {/* Done */}
      {done && !isProcessing && (
        <div className="space-y-2 animate-fade-in">
          <div className="flex items-center gap-3 p-3 bg-green-500/10 border border-green-500/20 rounded-xl">
            <CheckCircle size={16} className="text-green-400 shrink-0" />
            <div>
              <p className="text-sm text-green-300 font-medium">{segments.length} clips created!</p>
              <p className="text-xs text-zinc-400 mt-0.5 cursor-pointer hover:text-zinc-200"
                 onClick={() => window.api.showInFolder(segments[0]?.outputPath || outputDir)}>
                Open in Explorer ↗
              </p>
            </div>
          </div>
          {/* Segment list */}
          <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
            {segments.map(seg => (
              <div key={seg.index}
                className="flex items-center gap-2 text-xs text-zinc-400 px-2.5 py-1.5 rounded-lg bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800/60 cursor-pointer transition-colors"
                onClick={() => window.api.showInFolder(seg.outputPath)}
              >
                <Film size={12} className="text-brand-400 shrink-0" />
                <span className="truncate">{seg.outputPath.split(/[\\/]/).pop()}</span>
                {seg.thumbnailPath && (
                  <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-brand-500/20 text-brand-300 font-bold shrink-0 flex items-center gap-1">
                    <Image size={9} /> JPG
                  </span>
                )}
                <span className="ml-auto shrink-0 text-zinc-500">{seg.duration?.toFixed(1)}s</span>
              </div>
            ))}
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
        onClick={handleSplit}
        className="w-full py-2.5 bg-brand-600 hover:bg-brand-500 disabled:bg-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors shadow-lg shadow-brand-900/30 flex items-center justify-center gap-2"
      >
        <SplitSquareHorizontal size={15} />
        {isProcessing ? 'Splitting…' : `Split into ~${estimatedCount || '?'} Clips`}
      </button>
    </div>
  )
}
