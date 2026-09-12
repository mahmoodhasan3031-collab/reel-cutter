import React from 'react';
import { SlidersHorizontal, Palette, Volume2, Gauge, Crop, ShieldCheck, RotateCcw } from 'lucide-react';

export const DEFAULT_VARIATION_STATE = {
  enabled: false,
  brightness: 0,
  saturation: 1,
  hue: 0,
  pitch: 0,
  speed: 1.0,
  mode: 'center',
  crop: 0,
  cleanMetadata: true,
};

const REFRAME_MODES = [
  { id: 'center', label: 'Center' },
  { id: 'left',   label: 'Left' },
  { id: 'right',  label: 'Right' },
  { id: 'top',    label: 'Top' },
  { id: 'bottom', label: 'Bottom' },
];

export default function ContentVariationSection({
  variation = DEFAULT_VARIATION_STATE,
  onChange,
  disabled = false,
}) {
  const isEnabled = Boolean(variation?.enabled);

  const update = (key, val) => {
    if (disabled) return;
    onChange?.({
      ...DEFAULT_VARIATION_STATE,
      ...variation,
      [key]: val,
    });
  };

  const handleToggle = (e) => {
    const next = e.target.checked;
    onChange?.({
      ...DEFAULT_VARIATION_STATE,
      ...variation,
      enabled: next,
    });
  };

  const handleReset = () => {
    if (disabled) return;
    onChange?.({
      ...DEFAULT_VARIATION_STATE,
      enabled: true,
    });
  };

  const brightness = variation.brightness !== undefined ? variation.brightness : 0;
  const saturation = variation.saturation !== undefined ? variation.saturation : 1;
  const hue        = variation.hue !== undefined ? variation.hue : 0;
  const pitch      = variation.pitch !== undefined ? variation.pitch : 0;
  const speed      = variation.speed !== undefined ? variation.speed : 1.0;
  const mode       = variation.mode || 'center';
  const crop       = variation.crop !== undefined ? variation.crop : 0;
  const cleanMeta  = variation.cleanMetadata !== undefined ? variation.cleanMetadata : true;

  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 space-y-4">
      {/* Header & Master Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={16} className="text-brand-400" />
          <h3 className="text-sm font-semibold text-zinc-100">Content Variation</h3>
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={handleToggle}
            disabled={disabled}
            className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-brand-600 focus:ring-brand-500 focus:ring-offset-zinc-900 cursor-pointer"
          />
          <span className="text-xs font-medium text-zinc-300">Enable Content Variation</span>
        </label>
      </div>

      {isEnabled && (
        <div className="space-y-4 pt-2 border-t border-zinc-800/80 animate-fade-in">
          {/* Helper description */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-400">
              Create alternate creative versions of your video while keeping the original file unchanged.
            </p>
            <button
              type="button"
              onClick={handleReset}
              disabled={disabled}
              className="px-2 py-1 text-[11px] font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700/80 rounded border border-zinc-700 transition-colors flex items-center gap-1 shrink-0"
              title="Reset all variation settings to defaults"
            >
              <RotateCcw size={11} /> Reset
            </button>
          </div>

          {/* 1. Color Controls */}
          <div className="space-y-2.5 bg-zinc-950/40 rounded-lg p-3 border border-zinc-800/50">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
              <Palette size={13} className="text-brand-400" /> Color Adjustment
            </div>

            {/* Brightness */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">Brightness</span>
                <span className="font-mono text-zinc-300">
                  {brightness > 0 ? `+${Number(brightness).toFixed(2)}` : Number(brightness).toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min="-1"
                max="1"
                step="0.05"
                value={brightness}
                disabled={disabled}
                onChange={(e) => update('brightness', parseFloat(e.target.value))}
                className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-brand-500"
              />
            </div>

            {/* Saturation */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">Saturation</span>
                <span className="font-mono text-zinc-300">{Number(saturation).toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="3"
                step="0.05"
                value={saturation}
                disabled={disabled}
                onChange={(e) => update('saturation', parseFloat(e.target.value))}
                className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-brand-500"
              />
            </div>

            {/* Hue */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">Hue</span>
                <span className="font-mono text-zinc-300">
                  {hue > 0 ? `+${Math.round(hue)}°` : `${Math.round(hue)}°`}
                </span>
              </div>
              <input
                type="range"
                min="-180"
                max="180"
                step="1"
                value={hue}
                disabled={disabled}
                onChange={(e) => update('hue', parseInt(e.target.value, 10))}
                className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-brand-500"
              />
            </div>
          </div>

          {/* 2. Audio & Speed Controls */}
          <div className="space-y-2.5 bg-zinc-950/40 rounded-lg p-3 border border-zinc-800/50">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
              <Volume2 size={13} className="text-brand-400" /> Audio & Speed
            </div>

            {/* Pitch */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">Pitch</span>
                <span className="font-mono text-zinc-300">
                  {pitch > 0 ? `+${Number(pitch).toFixed(1)}%` : `${Number(pitch).toFixed(1)}%`}
                </span>
              </div>
              <input
                type="range"
                min="-3"
                max="3"
                step="0.5"
                value={pitch}
                disabled={disabled}
                onChange={(e) => update('pitch', parseFloat(e.target.value))}
                className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-brand-500"
              />
            </div>

            {/* Speed */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400 flex items-center gap-1">
                  <Gauge size={11} /> Speed
                </span>
                <span className="font-mono text-zinc-300">{Number(speed).toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min="1.00"
                max="1.05"
                step="0.01"
                value={speed}
                disabled={disabled}
                onChange={(e) => update('speed', parseFloat(e.target.value))}
                className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-brand-500"
              />
            </div>
          </div>

          {/* 3. Reframe / Micro-Crop */}
          <div className="space-y-2.5 bg-zinc-950/40 rounded-lg p-3 border border-zinc-800/50">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
              <Crop size={13} className="text-brand-400" /> Reframe / Crop
            </div>

            {/* Mode selection buttons */}
            <div className="space-y-1">
              <span className="text-xs text-zinc-400">Alignment Mode</span>
              <div className="grid grid-cols-5 gap-1.5">
                {REFRAME_MODES.map((m) => {
                  const isSelected = mode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => update('mode', m.id)}
                      className={`py-1 text-xs rounded font-medium border transition-colors ${
                        isSelected
                          ? 'bg-brand-600/30 border-brand-500 text-brand-300'
                          : 'bg-zinc-800/60 border-zinc-700/60 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600'
                      }`}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Crop percent */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">Micro-Crop</span>
                <span className="font-mono text-zinc-300">{Number(crop).toFixed(1)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.2"
                value={crop}
                disabled={disabled}
                onChange={(e) => update('crop', parseFloat(e.target.value))}
                className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-brand-500"
              />
            </div>
          </div>

          {/* 4. Metadata Cleanup */}
          <div className="bg-zinc-950/40 rounded-lg p-3 border border-zinc-800/50">
            <label className="flex items-center justify-between cursor-pointer select-none">
              <div className="flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-brand-400" />
                <div>
                  <span className="text-xs font-semibold text-zinc-200">Clean Metadata</span>
                  <p className="text-[11px] text-zinc-500">
                    Strips nonessential container tags and chapter markers
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={cleanMeta}
                disabled={disabled}
                onChange={(e) => update('cleanMetadata', e.target.checked)}
                className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-brand-600 focus:ring-brand-500 focus:ring-offset-zinc-900 cursor-pointer"
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
