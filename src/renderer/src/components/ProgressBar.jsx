export default function ProgressBar({ percent = 0, label = 'Processing', subLabel }) {
  const clamped = Math.min(100, Math.max(0, Math.round(percent)))

  return (
    <div className="w-full animate-fade-in">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-zinc-300">{label}</span>
        <span className="text-sm font-bold text-brand-400 tabular-nums">{clamped}%</span>
      </div>

      {/* Track */}
      <div className="relative w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
        {/* Fill */}
        <div
          className="h-full rounded-full progress-gradient transition-all duration-300 ease-out"
          style={{ width: `${clamped}%` }}
        />
        {/* Pulse glow at tip */}
        {clamped > 0 && clamped < 100 && (
          <div
            className="absolute top-0 h-full w-4 rounded-full bg-white/20 blur-sm -translate-x-1/2 transition-all duration-300"
            style={{ left: `${clamped}%` }}
          />
        )}
      </div>

      {subLabel && (
        <p className="mt-1.5 text-xs text-zinc-500">{subLabel}</p>
      )}
    </div>
  )
}
