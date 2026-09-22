import { X, Check, Lock, Sparkles, Zap, ShieldCheck } from 'lucide-react';
import { TIER_PRICING } from '../utils/features';

export default function UpgradeModal({ isOpen, onClose, requiredTier = 'pro', featureName = 'This feature' }) {
  if (!isOpen) return null;

  const tiers = [
    {
      id: 'basic',
      name: 'Basic',
      price: '$10/month',
      description: 'Essential video cutting tools',
      features: [
        'Precision video cutting',
        '1080p Full HD export',
        'Standard 9:16 vertical reel',
      ],
      current: requiredTier === 'basic',
    },
    {
      id: 'standard',
      name: 'Standard',
      price: '$20/month',
      description: 'Advanced export & custom durations',
      features: [
        'Everything in Basic',
        '4K Ultra HD export',
        'All aspect ratios (1:1, 4:5, 16:9)',
        'Custom duration & timestamps',
      ],
      popular: true,
      current: requiredTier === 'standard',
    },
    {
      id: 'pro',
      name: 'Pro',
      price: '$30/month',
      description: 'Full AI suite & high-volume batch tools',
      features: [
        'Everything in Standard',
        'AI Thumbnails & best-frame finder',
        'Smart Crop (face & subject tracking)',
        'Multi-video Batch Queue',
      ],
      current: requiredTier === 'pro',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in select-none">
      <div className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 relative overflow-hidden">
        {/* Background ambient glow */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-brand-600/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-brand-600/20 border border-brand-600/30 flex items-center justify-center text-brand-400">
              <Sparkles size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-100">
                Upgrade to Unlock {featureName}
              </h2>
              <p className="text-xs text-zinc-400">
                This capability requires a {requiredTier.toUpperCase()} license or higher.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tier Cards Grid */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {tiers.map((t) => {
            const isTarget = t.id === requiredTier;
            return (
              <div
                key={t.id}
                className={`rounded-xl border p-4 flex flex-col justify-between transition-all ${
                  isTarget
                    ? 'border-brand-500/80 bg-brand-950/20 ring-1 ring-brand-500/40 glow-violet'
                    : 'border-zinc-800 bg-zinc-950/40'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                      {t.name}
                    </span>
                    {t.popular && (
                      <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-300 border border-brand-500/30">
                        Popular
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-1 mb-2">
                    <span className="text-xl font-extrabold text-zinc-100">{t.price}</span>
                    <span className="text-[10px] text-zinc-500">/month</span>
                  </div>
                  <p className="text-[10px] text-zinc-500 mb-3 leading-tight">{t.description}</p>

                  {/* Feature list */}
                  <ul className="space-y-1.5 text-[11px] text-zinc-300">
                    {t.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <Check size={12} className="text-brand-400 shrink-0 mt-0.5" />
                        <span className="leading-tight">{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-4 pt-3 border-t border-zinc-800/80">
                  <a
                    href="https://reelcutter.app/pricing"
                    target="_blank"
                    rel="noreferrer"
                    className={`w-full py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors ${
                      isTarget
                        ? 'bg-brand-600 hover:bg-brand-500 text-white shadow-md shadow-brand-900/40'
                        : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                    }`}
                  >
                    <Zap size={11} />
                    Get {t.name}
                  </a>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer info */}
        <div className="text-center text-[11px] text-zinc-500">
          Already bought an upgrade key? Activate it in{' '}
          <button
            onClick={() => {
              onClose();
            }}
            className="text-brand-400 hover:underline font-medium"
          >
            Settings & License
          </button>
          .
        </div>
      </div>
    </div>
  );
}
