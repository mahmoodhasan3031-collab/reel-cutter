import { useState, useCallback } from 'react'
import { UploadCloud, FolderOpen, Film } from 'lucide-react'

export default function VideoDropzone({ onFileLoaded }) {
  const [isDragging, setIsDragging] = useState(false)

  const handleFile = useCallback(async (filePath) => {
    if (!filePath) return
    const result = await window.api.probe(filePath)
    if (result.success) {
      onFileLoaded(filePath, result.data)
    } else {
      alert(`Failed to load video: ${result.error}`)
    }
  }, [onFileLoaded])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file && file.path) handleFile(file.path)
  }, [handleFile])

  const handleBrowse = async () => {
    const filePath = await window.api.selectFile()
    if (filePath) handleFile(filePath)
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 animate-fade-in">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={[
          'w-full max-w-xl border-2 border-dashed rounded-2xl p-12 flex flex-col items-center gap-5 transition-all duration-200 cursor-pointer group',
          isDragging
            ? 'border-brand-500 bg-brand-500/5 glow-violet scale-[1.01]'
            : 'border-zinc-700 hover:border-brand-600/50 hover:bg-zinc-800/40'
        ].join(' ')}
        onClick={handleBrowse}
      >
        <div className={[
          'w-20 h-20 rounded-2xl flex items-center justify-center transition-all duration-200',
          isDragging ? 'bg-brand-600/20 text-brand-400' : 'bg-zinc-800 text-zinc-500 group-hover:text-brand-400 group-hover:bg-brand-600/10'
        ].join(' ')}>
          <UploadCloud size={36} />
        </div>

        <div className="text-center">
          <p className="text-base font-semibold text-zinc-200 mb-1">
            {isDragging ? 'Drop it here!' : 'Drop your video here'}
          </p>
          <p className="text-sm text-zinc-500">
            or <span className="text-brand-400 font-medium">browse files</span>
          </p>
          <p className="text-xs text-zinc-600 mt-3">
            MP4, MOV, MKV, AVI, WebM · Any resolution
          </p>
        </div>
      </div>

      {/* Browse button */}
      <button
        onClick={handleBrowse}
        className="mt-5 flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-brand-900/50"
      >
        <FolderOpen size={16} />
        Browse Files
      </button>

      {/* Supported formats */}
      <div className="mt-10 flex flex-wrap gap-2 justify-center">
        {['MP4', 'MOV', 'MKV', 'AVI', 'WebM', 'M4V', 'FLV'].map((fmt) => (
          <span key={fmt} className="px-2.5 py-1 text-xs text-zinc-500 bg-zinc-800 rounded-md border border-zinc-700">
            {fmt}
          </span>
        ))}
      </div>
    </div>
  )
}
