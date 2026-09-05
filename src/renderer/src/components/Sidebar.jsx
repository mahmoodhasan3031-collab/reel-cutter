import { Scissors, Film, SplitSquareHorizontal, Info, FolderOpen } from 'lucide-react'

const NAV = [
  { id: 'drop',  label: 'Load Video', icon: FolderOpen },
  { id: 'info',  label: 'Inspector',  icon: Info },
  { id: 'cut',   label: 'Cut Clip',   icon: Scissors },
  { id: 'reel',  label: 'Make Reel',  icon: Film },
  { id: 'split', label: 'Split',      icon: SplitSquareHorizontal },
]

export default function Sidebar({ view, setView, hasVideo }) {
  return (
    <aside className="w-[220px] shrink-0 flex flex-col bg-zinc-900 border-r border-zinc-800 py-4">
      {/* Brand mark */}
      <div className="px-5 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-lg glow-violet">
            <Film size={16} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-zinc-100 leading-none">Reel Cutter</p>
            <p className="text-[10px] text-zinc-500 mt-0.5">v1.0.0</p>
          </div>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 space-y-0.5">
        {NAV.map(({ id, label, icon: Icon }) => {
          const isActive = view === id
          const disabled = id !== 'drop' && !hasVideo
          return (
            <button
              key={id}
              disabled={disabled}
              onClick={() => setView(id)}
              className={[
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-brand-600/20 text-brand-400 border border-brand-600/30'
                  : disabled
                    ? 'text-zinc-700 cursor-not-allowed'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
              ].join(' ')}
            >
              <Icon size={16} className={isActive ? 'text-brand-400' : ''} />
              {label}
              {isActive && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-400" />
              )}
            </button>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 pt-4 border-t border-zinc-800">
        <p className="text-[10px] text-zinc-600 leading-relaxed">
          FFmpeg-powered video engine.<br />Reels · Shorts · TikTok ready.
        </p>
      </div>
    </aside>
  )
}
