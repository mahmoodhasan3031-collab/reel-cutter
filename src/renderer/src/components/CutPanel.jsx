import { useState } from 'react'
import { Scissors, FolderOpen, CheckCircle, AlertCircle } from 'lucide-react'
import ProgressBar from './ProgressBar'

export default function CutPanel({ videoPath, metadata, progress, isProcessing, setIsProcessing, setProgress }) {
  const [start, setStart]       = useState('0')
  const [duration, setDuration] = useState('')
  const [end, setEnd]           = useState('')
  const [useEnd, setUseEnd]     = useState(false)
  const [asReel, setAsReel]     = useState(false)
  const [mode, setMode]         = useState('blur')
  const [outputPath, setOutputPath] = useState('')
  const [result, setResult]     = useState(null)
  const [error, setError]       = useState(null)

  const pickOutput = async () => {
    const base = videoPath ? videoPath.replace(/\.[^.]+$/, '') : 'output'
    const p = await window.api.saveFile(`${base}_clip.mp4`)
    if (p) setOutputPath(p)
  }

  const handleCut = async () => {
    if (!videoPath) return
    setIsProcessing(true)
    setProgress(0)
    setResult(null)
    setError(null)

    const outPath = outputPath || videoPath.replace(/(\.[^.]+)$/, '_clip$1')

    window.api.off('video:progress')
    window.api.onProgress(({ percent }) => setProgress(percent))

    const res = await window.api.cut({
      inputPath: videoPath,
      outputPath: outPath,
      start,
      duration: useEnd ? undefined : duration || undefined,
      end:      useEnd ? end       : undefined,
      reel: asReel,
      mode,
    })

    setIsProcessing(false)
    setProgress(0)
    window.api.off('video:progress')

    if (res.success) {
      setResult(res)
    } else {
      setError(res.error)
    }
  }

  return (
    <div className="flex flex-col gap-5 animate-slide-up">
      <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
        <Scissors size={18} className="text-brand-400" /> Cut Clip
      </h2>

      {/* Time inputs */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-zinc-500 font-medium">Start Time</span>
            <input
              type="text" value={start} onChange={e => setStart(e.target.value)}
              placeholder="0 or 00:00:10"
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-brand-500 transition-colors"
            />
          </label>

          {useEnd ? (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-zinc-500 font-medium">End Time</span>
              <input
                type="text" value={end} onChange={e => setEnd(e.target.value)}
                placeholder="00:01:30"
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-brand-500 transition-colors"
              />
            </label>
          ) : (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-zinc-500 font-medium">Duration</span>
              <input
                type="text" value={duration} onChange={e => setDuration(e.target.value)}
                placeholder="30 or 00:00:30"
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-brand-500 transition-colors"
              />
            </label>
          )}
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={useEnd} onChange={e => setUseEnd(e.target.checked)}
            className="w-4 h-4 rounded accent-brand-600" />
          <span className="text-xs text-zinc-400">Use end time instead of duration</span>
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

      {/* Output */}
      <div className="flex gap-2">
        <input
          type="text" value={outputPath} onChange={e => setOutputPath(e.target.value)}
          placeholder="Output path (optional — auto-generated if blank)"
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-brand-500 transition-colors"
        />
        <button onClick={pickOutput}
          className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-100 transition-colors">
          <FolderOpen size={16} />
        </button>
      </div>

      {/* Progress */}
      {isProcessing && (
        <ProgressBar percent={progress} label="Cutting clip…" />
      )}

      {/* Result */}
      {result && !isProcessing && (
        <div className="flex items-start gap-3 p-3 bg-green-500/10 border border-green-500/20 rounded-xl animate-fade-in">
          <CheckCircle size={16} className="text-green-400 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm text-green-300 font-medium">Clip saved!</p>
            <p className="text-xs text-zinc-400 truncate mt-0.5 cursor-pointer hover:text-zinc-200"
               onClick={() => window.api.showInFolder(result.outputPath)}
               title={result.outputPath}>
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
        onClick={handleCut}
        className="w-full py-2.5 bg-brand-600 hover:bg-brand-500 disabled:bg-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors shadow-lg shadow-brand-900/30 flex items-center justify-center gap-2"
      >
        <Scissors size={15} />
        {isProcessing ? 'Processing…' : 'Cut Clip'}
      </button>
    </div>
  )
}
