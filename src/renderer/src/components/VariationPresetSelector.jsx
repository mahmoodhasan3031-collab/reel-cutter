import React, { useState, useEffect, useCallback, useMemo } from 'react';

/**
 * VariationPresetSelector — Phase 5A
 *
 * Reusable preset selector for choosing a content variation preset.
 * Features:
 * - Search by preset name or description
 * - Filter by Built-in / Custom / All
 * - Live Creative Difference / Variation Difference preview vs current state
 * - Clear / Select callbacks
 * - Feature-gating with Pro upgrade prompt
 */

function formatVariationSummary(variation) {
  if (!variation || !variation.enabled) return 'No variation (pass-through)';
  const parts = [];
  if (variation.brightness !== 0) parts.push(`Brightness ${variation.brightness > 0 ? '+' : ''}${variation.brightness}`);
  if (variation.saturation !== 1.0) parts.push(`Saturation ${Number(variation.saturation).toFixed(2)}×`);
  if (variation.hue !== 0) parts.push(`Hue ${variation.hue > 0 ? '+' : ''}${variation.hue}°`);
  if (variation.speed !== 1.0) parts.push(`Speed ${Number(variation.speed).toFixed(2)}×`);
  if (variation.crop > 0) parts.push(`Crop ${variation.crop}%`);
  if (variation.mode && variation.mode !== 'center') parts.push(`Mode: ${variation.mode}`);
  return parts.length ? parts.join(' · ') : 'Enabled';
}

export default function VariationPresetSelector({
  selectedPresetId,
  onPresetSelect,
  currentVariation = null,
  disabled = false,
  compact = false,
  onOpenEditor = null,
}) {
  const [presets, setPresets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [requiresUpgrade, setRequiresUpgrade] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all'); // all | builtin | custom
  const [comparison, setComparison] = useState(null);

  const loadPresets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.api?.getVariationPresets?.();
      if (!result) {
        setPresets([]);
        return;
      }
      if (result.requiresUpgrade) {
        setRequiresUpgrade(true);
        setPresets([]);
        return;
      }
      if (!result.success) {
        setError(result.error || 'Failed to load variation presets');
        return;
      }
      setPresets(result.presets || []);
    } catch (err) {
      setError(err.message || 'Unknown error loading presets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPresets();
  }, [loadPresets]);

  const selectedPreset = useMemo(
    () => presets.find(p => p.id === selectedPresetId) || null,
    [presets, selectedPresetId]
  );

  // Compute Creative Difference whenever selectedPreset or currentVariation changes
  useEffect(() => {
    if (!selectedPreset || !currentVariation || !window.api?.compareVariationPresets) {
      setComparison(null);
      return;
    }

    let isMounted = true;
    window.api.compareVariationPresets(currentVariation, selectedPreset.variation)
      .then(res => {
        if (isMounted && res?.success && res.comparison) {
          setComparison(res.comparison);
        }
      })
      .catch(() => {
        if (isMounted) setComparison(null);
      });

    return () => { isMounted = false; };
  }, [selectedPreset, currentVariation]);

  const filteredPresets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return presets.filter(p => {
      if (filterType === 'builtin' && !p.isBuiltIn) return false;
      if (filterType === 'custom' && p.isBuiltIn) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q);
    });
  }, [presets, searchQuery, filterType]);

  if (requiresUpgrade) {
    return (
      <div className="rounded-lg border border-yellow-700/50 bg-yellow-900/20 p-3 text-sm text-yellow-400">
        <span className="font-medium">Pro Feature</span> — Content Variation Presets require a Pro license.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        Loading presets…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-700/50 bg-red-900/20 p-3 text-sm text-red-400">
        {error}
        <button
          onClick={loadPresets}
          className="ml-2 underline hover:text-red-300"
        >
          Retry
        </button>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <label className="text-xs text-gray-400 font-medium">Variation Preset</label>
          {onOpenEditor && (
            <button
              type="button"
              onClick={onOpenEditor}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              Manage Presets
            </button>
          )}
        </div>
        <select
          value={selectedPresetId || ''}
          onChange={e => onPresetSelect?.(e.target.value || null)}
          disabled={disabled}
          className="rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none disabled:opacity-50"
        >
          <option value="">— None —</option>
          {presets.map(p => (
            <option key={p.id} value={p.id}>
              {p.name}{p.isBuiltIn ? '' : ' ✦'}
            </option>
          ))}
        </select>
        {selectedPreset && (
          <p className="text-xs text-gray-500 leading-relaxed">
            {formatVariationSummary(selectedPreset.variation)}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-200">Content Variation Presets</span>
        <div className="flex items-center gap-2">
          {onOpenEditor && (
            <button
              type="button"
              onClick={onOpenEditor}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              Manage
            </button>
          )}
          {selectedPresetId && (
            <button
              onClick={() => onPresetSelect?.(null)}
              className="text-xs text-gray-400 hover:text-gray-200"
              disabled={disabled}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search presets…"
          className="flex-1 rounded border border-gray-700 bg-gray-800 px-2.5 py-1 text-xs text-gray-200 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
        />
        <div className="flex rounded border border-gray-700 bg-gray-800 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setFilterType('all')}
            className={`px-2 py-0.5 rounded ${filterType === 'all' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200'}`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setFilterType('builtin')}
            className={`px-2 py-0.5 rounded ${filterType === 'builtin' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200'}`}
          >
            Built-in
          </button>
          <button
            type="button"
            onClick={() => setFilterType('custom')}
            className={`px-2 py-0.5 rounded ${filterType === 'custom' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200'}`}
          >
            Custom
          </button>
        </div>
      </div>

      {/* Presets Grid */}
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {filteredPresets.map(preset => {
          const isSelected = preset.id === selectedPresetId;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => !disabled && onPresetSelect?.(isSelected ? null : preset.id)}
              disabled={disabled}
              title={preset.description}
              className={[
                'rounded-lg border px-3 py-2 text-left text-sm transition-colors relative',
                isSelected
                  ? preset.isBuiltIn
                    ? 'border-blue-500 bg-blue-900/30 text-blue-200 ring-1 ring-blue-500'
                    : 'border-purple-500 bg-purple-900/30 text-purple-200 ring-1 ring-purple-500'
                  : 'border-gray-700 bg-gray-800/80 text-gray-300 hover:border-gray-500 hover:bg-gray-700/80',
                disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
              ].join(' ')}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="font-medium truncate">{preset.name}</span>
                {!preset.isBuiltIn && (
                  <span className="text-[10px] text-purple-400 font-mono flex-shrink-0">CUSTOM</span>
                )}
              </div>
              <div className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                {formatVariationSummary(preset.variation)}
              </div>
            </button>
          );
        })}
      </div>

      {filteredPresets.length === 0 && (
        <p className="text-center text-xs text-gray-500 py-3 italic">
          No presets found matching "{searchQuery}"
        </p>
      )}

      {/* Selected Preset Details & Creative Difference */}
      {selectedPreset && (
        <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-3 text-xs flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-gray-200">{selectedPreset.name}</span>
            <span className="text-[11px] text-gray-400">
              {selectedPreset.isBuiltIn ? 'Built-in' : 'Custom'} Preset
            </span>
          </div>

          {selectedPreset.description && (
            <p className="text-gray-400">{selectedPreset.description}</p>
          )}

          {/* Creative Difference chips vs current export */}
          {comparison && comparison.hasDifferences && (
            <div className="pt-2 border-t border-gray-700/60 flex flex-col gap-1">
              <span className="text-[11px] font-medium text-gray-300">
                {comparison.title || 'Creative Difference'}:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {comparison.differences.map((diff, i) => (
                  <span
                    key={i}
                    className="inline-block rounded bg-blue-950/60 border border-blue-800/60 px-2 py-0.5 text-[11px] text-blue-300 font-mono"
                  >
                    {diff}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
