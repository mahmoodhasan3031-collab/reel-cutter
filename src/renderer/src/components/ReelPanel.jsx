import { useState } from 'react'
import { Film, CheckCircle, AlertCircle, FolderOpen } from 'lucide-react'
import ProgressBar from './ProgressBar'

const MODES = [
  {
    id: 'blur',
    label: 'Blur',
    description: 'Centered video with blurred background filling the frame',
    preview: (
      <div className="w-full h-full bg-zinc-700 relative overflow-hidden rounded">
        {/* Blurred bg */}
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-600 to-zinc-800 blur-sm scale-110" />
        {/* Centered clip */}
        <div className="absolute inset-x-3 inset-y-4 bg-zinc-500 rounded" />
      </div>
    )
  },
  {
    id: 'crop',
    label: 'Crop',
    description: 'Center-crop to 9:16 — no borders, fills entire frame',
    preview: (
      <div className="w-full h-full bg-zinc-600 rounded" />
    )
  },
  {
    id: 'pad',
    label: 'Pad',
    description: 'Scale to fit with black letterbox / pillarbox borders',
    preview: (
      <div className="w-full h-full bg-zinc-900 flex items-center justify-center rounded">
        <div className="w-3/4 h-1/2 bg-zinc-600 rounded" />
      </div>
    )
  }
]

export default function ReelPanel({ videoPath, metadata, progress, isProcessing, setIsProcessing, setProgress }) {
  const [mode, setMode]         = useState('blur')
  const [outputPath, setOutputPath] = useState('')
  const [result, setResult]     = useState(null)
  const [error, setError]       = useState(null)

  const pickOutput = async () => {
    const base = videoPath ? videoPath.replace(/\.[^.]+$/, '') : 'output'
    const p = await window.api.saveFile(`${base}_reel.mp4`)
    if (p) setOutputPath(p)
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

    const res = await window.api.reel({ inputPath: videoPath, outputPath: outPath, mode })

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
        <span className="ml-auto text-xs text-zinc-500 font-normal">1080 × 1920 · 9:16</span>
      </h2>

      {/* Mode selector */}
      <div className="grid grid-cols-3 gap-3">
        {MODES.map(m => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`flex flex-col rounded-xl border p-3 transition-all text-left ${
              mode === m.id
                ? 'border-brand-600/50 bg-brand-600/10 ring-1 ring-brand-600/30'
                : 'border-zinc-700 bg-zinc-900 hover:border-zinc-600'
            }`}
          >
            {/* Preview box (9:16 aspect) */}
            <div className="w-full aspect-[9/16] max-h-24 mb-2.5">
              {m.preview}
            </div>
            <p className={`text-xs font-semibold ${mode === m.id ? 'text-brand-300' : 'text-zinc-300'}`}>
              {m.label}
            </p>
            <p className="text-[10px] text-zinc-500 mt-0.5 leading-relaxed">{m.description}</p>
          </button>
        ))}
      </div>

      {/* Output */}
      <div className="flex gap-2">
        <input
          type="text" value={outputPath} onChange={e => setOutputPath(e.target.value)}
          placeholder="Output path (optional)"
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-brand-500 transition-colors"
        />
        <button onClick={pickOutput}
          className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-100 transition-colors">
          <FolderOpen size={16} />
        </button>
      </div>

      {/* Progress */}
      {isProcessing && (
        <ProgressBar percent={progress} label="Rendering 9:16 Reel…" subLabel={`Mode: ${mode}`} />
      )}

      {/* Result */}
      {result && !isProcessing && (
        <div className="flex items-start gap-3 p-3 bg-green-500/10 border border-green-500/20 rounded-xl animate-fade-in">
          <CheckCircle size={16} className="text-green-400 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm text-green-300 font-medium">Reel created! 🎉</p>
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
        onClick={handleReel}
        className="w-full py-2.5 bg-brand-600 hover:bg-brand-500 disabled:bg-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors shadow-lg shadow-brand-900/30 flex items-center justify-center gap-2"
      >
        <Film size={15} />
        {isProcessing ? 'Rendering…' : 'Convert to 9:16 Reel'}
      </button>
    </div>
  )
}
