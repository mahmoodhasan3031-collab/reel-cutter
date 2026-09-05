import { useState } from 'react'
import TitleBar     from './components/TitleBar'
import Sidebar      from './components/Sidebar'
import VideoDropzone from './components/VideoDropzone'
import VideoInfo    from './components/VideoInfo'
import CutPanel     from './components/CutPanel'
import ReelPanel    from './components/ReelPanel'
import SplitPanel   from './components/SplitPanel'

export default function App() {
  const [view, setView]           = useState('drop')   // 'drop' | 'info' | 'cut' | 'reel' | 'split'
  const [videoPath, setVideoPath] = useState(null)
  const [metadata, setMetadata]   = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress]   = useState(0)

  const handleFileLoaded = (filePath, meta) => {
    setVideoPath(filePath)
    setMetadata(meta)
    setView('cut')     // jump straight to Cut after loading
  }

  const handleChangeFile = () => {
    setVideoPath(null)
    setMetadata(null)
    setView('drop')
  }

  const hasVideo = !!videoPath

  const sharedProps = { videoPath, metadata, progress, isProcessing, setIsProcessing, setProgress }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      {/* Custom title bar */}
      <TitleBar />

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar view={view} setView={setView} hasVideo={hasVideo} />

        {/* Main content area */}
        <main className="flex-1 flex flex-col overflow-hidden">

          {/* Drop view — full panel */}
          {view === 'drop' && (
            <VideoDropzone onFileLoaded={handleFileLoaded} />
          )}

          {/* Tool views — header + panel */}
          {view !== 'drop' && hasVideo && (
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
              {view === 'info'  && <InfoPanel metadata={metadata} />}
              {view === 'cut'   && <CutPanel   {...sharedProps} />}
              {view === 'reel'  && <ReelPanel  {...sharedProps} />}
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

/* ─── Inline Info Panel ──────────────────────────────────────────────────────
   Shown when user navigates to Inspector — VideoInfo already renders the card,
   so this just adds a friendly note.                                          */
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
