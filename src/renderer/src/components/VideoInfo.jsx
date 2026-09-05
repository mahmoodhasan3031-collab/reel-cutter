import { Film, Clock, HardDrive, Zap, Monitor, Volume2, FolderOpen, RefreshCw } from 'lucide-react'

function Badge({ children, variant = 'default' }) {
  const variants = {
    default:   'bg-zinc-800 text-zinc-300 border-zinc-700',
    violet:    'bg-brand-600/15 text-brand-300 border-brand-600/30',
    green:     'bg-green-500/10 text-green-400 border-green-500/20',
    orange:    'bg-orange-500/10 text-orange-400 border-orange-500/20',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${variants[variant]}`}>
      {children}
    </span>
  )
}

function MetaRow({ icon: Icon, label, value, badge }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-zinc-800/60 last:border-0">
      <div className="flex items-center gap-2.5 text-zinc-500">
        <Icon size={14} />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
        <span className="text-sm text-zinc-200 font-medium">{value}</span>
      </div>
    </div>
  )
}

export default function VideoInfo({ videoPath, metadata, onChangeFile }) {
  if (!metadata) return null

  const filename = videoPath ? videoPath.split(/[\\/]/).pop() : 'Unknown'
  const orientation = metadata.video.isVertical ? 'Portrait' : 'Landscape'

  return (
    <div className="animate-slide-up">
      {/* File header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-brand-600/20 flex items-center justify-center shrink-0 border border-brand-600/30">
            <Film size={18} className="text-brand-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-100 truncate" title={filename}>{filename}</p>
            <p className="text-xs text-zinc-500 mt-0.5 truncate" title={videoPath}>{videoPath}</p>
          </div>
        </div>
        <button
          onClick={onChangeFile}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-100 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors border border-zinc-700 shrink-0 ml-3"
        >
          <RefreshCw size={12} />
          Change
        </button>
      </div>

      {/* Metadata grid */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 px-4 divide-y divide-zinc-800/60">
        <MetaRow
          icon={Clock} label="Duration"
          value={`${metadata.durationFormatted}  (${metadata.duration.toFixed(2)}s)`}
        />
        <MetaRow
          icon={Monitor} label="Resolution"
          value={`${metadata.video.width} × ${metadata.video.height}`}
          badge={{ label: orientation, variant: metadata.video.isVertical ? 'violet' : 'default' }}
        />
        <MetaRow
          icon={Zap} label="Frame Rate"
          value={`${metadata.video.fps} fps`}
        />
        <MetaRow
          icon={Film} label="Video Codec"
          value={metadata.video.codec.toUpperCase()}
          badge={{ label: metadata.video.pixelFormat, variant: 'default' }}
        />
        {metadata.audio && (
          <MetaRow
            icon={Volume2} label="Audio"
            value={`${metadata.audio.codec.toUpperCase()} · ${metadata.audio.channels}ch · ${metadata.audio.sampleRate}`}
          />
        )}
        <MetaRow
          icon={HardDrive} label="File Size"
          value={`${metadata.sizeFormatted}  (${metadata.bitrate})`}
        />
      </div>
    </div>
  )
}
