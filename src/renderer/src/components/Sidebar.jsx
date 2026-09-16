import {
  Scissors,
  Film,
  SplitSquareHorizontal,
  Info,
  FolderOpen,
  Settings,
  ShieldCheck,
  Sparkles,
  Layers,
  ArrowUpRight,
  Globe,
  Calendar,
  BarChart3,
  LayoutDashboard,
  BookOpen,
} from 'lucide-react'

const NAV = [
  { id: 'drop',           label: 'Load Video',    icon: FolderOpen },
  { id: 'info',           label: 'Inspector',     icon: Info },
  { id: 'cut',            label: 'Cut Clip',      icon: Scissors },
  { id: 'reel',           label: 'Make Reel',     icon: Film },
  { id: 'split',          label: 'Split',         icon: SplitSquareHorizontal },
  { id: 'profiles',       label: 'Page Profiles', icon: Globe },
  { id: 'schedule',       label: 'Schedule',      icon: Calendar },
  { id: 'workflow_recipes', label: 'Recipes',     icon: BookOpen,  pro: true },
  { id: 'ai_thumbnails',  label: 'AI Thumbnails', icon: Sparkles, pro: true },
  { id: 'batch_queue',    label: 'Batch Queue',   icon: Layers,   pro: true },
  { id: 'command_center', label: 'Command Center', icon: LayoutDashboard, pro: true },
  { id: 'dashboard',      label: 'Dashboard',     icon: BarChart3, pro: true },
  { id: 'settings',       label: 'Settings',      icon: Settings },
]

export default function Sidebar({ view, setView, hasVideo, licenseTier = 'standard', isOffline, onOpenUpgrade }) {
  const isPro = (licenseTier || '').toLowerCase() === 'pro'

  return (
    <aside className="w-[220px] shrink-0 flex flex-col bg-zinc-900 border-r border-zinc-800 py-4 select-none">
      {/* Brand mark */}
      <div className="px-5 mb-5">
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
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        {NAV.map(({ id, label, icon: Icon, pro }) => {
          const isActive = view === id
          const disabled = id !== 'drop' && id !== 'settings' && id !== 'ai_thumbnails' && id !== 'batch_queue' && id !== 'profiles' && id !== 'schedule' && id !== 'dashboard' && id !== 'command_center' && id !== 'workflow_recipes' && !hasVideo
          return (
            <button
              key={id}
              disabled={disabled}
              onClick={() => setView(id)}
              className={[
                'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150',
                isActive
                  ? 'bg-brand-600/20 text-brand-400 border border-brand-600/30'
                  : disabled
                    ? 'text-zinc-700 cursor-not-allowed'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
              ].join(' ')}
            >
              <Icon size={15} className={isActive ? 'text-brand-400' : ''} />
              <span className="truncate">{label}</span>
              {pro && !isPro && (
                <span className="ml-auto text-[8px] font-bold uppercase px-1 py-0.2 rounded bg-brand-500/20 text-brand-300 border border-brand-500/30">
                  PRO
                </span>
              )}
              {isActive && !pro && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-400" />
              )}
            </button>
          )
        })}
      </nav>

      {/* Upgrade Banner for Non-Pro */}
      {!isPro && (
        <div className="px-3 mb-2">
          <button
            onClick={() => onOpenUpgrade?.('pro', 'Pro Suite')}
            className="w-full p-2 rounded-xl bg-gradient-to-r from-brand-900/30 to-purple-900/30 border border-brand-500/30 hover:border-brand-500/60 transition-all flex items-center justify-between text-left group"
          >
            <div className="flex items-center gap-2">
              <Sparkles size={13} className="text-brand-400" />
              <span className="text-[11px] font-semibold text-brand-200">Upgrade to Pro</span>
            </div>
            <ArrowUpRight size={13} className="text-brand-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </button>
        </div>
      )}

      {/* License Tier Badge Footer */}
      <div className="px-3 pt-2 border-t border-zinc-800">
        <button
          onClick={() => setView('settings')}
          className="w-full p-2 rounded-xl bg-zinc-950/60 border border-zinc-800 hover:border-zinc-700 transition-colors flex items-center gap-2.5 text-left group"
        >
          <div className="w-7 h-7 rounded-lg bg-brand-600/20 border border-brand-600/30 flex items-center justify-center text-brand-400 group-hover:bg-brand-600/30 transition-colors">
            <ShieldCheck size={14} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold tracking-wider uppercase text-zinc-200 truncate">
                {(licenseTier || 'ACTIVE').toUpperCase()} PLAN
              </p>
              {isOffline && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Offline Grace Period" />
              )}
            </div>
            <p className="text-[10px] text-zinc-500 truncate">
              {isOffline ? 'Offline Grace' : 'Hardware Bound'}
            </p>
          </div>
        </button>
      </div>
    </aside>
  )
}
