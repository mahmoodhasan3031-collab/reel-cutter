import { AlertTriangle, WifiOff } from 'lucide-react';

export default function OfflineBanner({ remainingHours }) {
  if (remainingHours === undefined || remainingHours === null) return null;

  const days = Math.floor(remainingHours / 24);
  const hours = remainingHours % 24;
  const timeStr = days > 0 ? `${days}d ${hours}h` : `${hours} hours`;

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center justify-between text-xs text-amber-300 animate-slide-up select-none">
      <div className="flex items-center gap-2">
        <WifiOff size={14} className="text-amber-400 shrink-0" />
        <span>
          <strong className="font-semibold">Offline Grace Period Active:</strong> {timeStr} remaining until internet validation is required.
        </span>
      </div>
      <span className="text-[11px] text-amber-400/80 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
        Offline Mode
      </span>
    </div>
  );
}
