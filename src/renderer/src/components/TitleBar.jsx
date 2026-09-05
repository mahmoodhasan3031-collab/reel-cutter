import { Minus, Square, X } from 'lucide-react'

export default function TitleBar() {
  return (
    <div className="drag-region flex items-center justify-between h-10 px-4 bg-zinc-950 border-b border-zinc-800/60 shrink-0 select-none">
      {/* App identity */}
      <div className="flex items-center gap-2.5 no-drag">
        <div className="w-4 h-4 rounded bg-gradient-to-br from-brand-500 to-brand-700 shadow-sm" />
        <span className="text-xs font-semibold tracking-widest uppercase text-zinc-400">
          Reel Cutter
        </span>
      </div>

      {/* Window controls */}
      <div className="flex items-center gap-0.5 no-drag">
        <button
          onClick={() => window.api.minimize()}
          className="w-8 h-8 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          title="Minimize"
        >
          <Minus size={13} />
        </button>
        <button
          onClick={() => window.api.maximize()}
          className="w-8 h-8 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          title="Maximize"
        >
          <Square size={11} />
        </button>
        <button
          onClick={() => window.api.closeApp()}
          className="w-8 h-8 flex items-center justify-center rounded text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          title="Close"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
