import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Layers,
  Search,
  Check,
  Copy,
  Edit2,
  Trash2,
  Plus,
  ArrowRight,
  SlidersHorizontal,
  Film,
  Sparkles,
  Lock,
  ChevronDown,
  ChevronUp,
  X,
  Type,
  Maximize,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

/**
 * Formats a concise summary string from an export preset's settings.
 */
function formatSettingsSummary(settings) {
  if (!settings) return '';
  const parts = [];
  if (settings.aspectRatio) parts.push(settings.aspectRatio);
  if (settings.resolution) parts.push(settings.resolution.toUpperCase());
  if (settings.mode) {
    const modeLabel = settings.mode === 'smart_crop' ? 'Smart Crop' : settings.mode.charAt(0).toUpperCase() + settings.mode.slice(1);
    parts.push(modeLabel);
  }
  if (settings.exportType) parts.push(settings.exportType.charAt(0).toUpperCase() + settings.exportType.slice(1));
  if (settings.variation?.enabled) parts.push('Variation');
  if (settings.captionTemplateId || (Array.isArray(settings.textOverlays) && settings.textOverlays.length > 0)) {
    parts.push('Captions');
  }
  return parts.join(' · ');
}

export default function ExportPresetSelector({
  selectedPresetId,
  onPresetSelect,
  onPresetApply,
  currentExportConfig = null,
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
  const [showDiff, setShowDiff] = useState(false);
  const [actionSuccess, setActionSuccess] = useState(null);

  const loadPresets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.api?.getExportPresets?.();
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
        setError(result.error || 'Failed to load export presets');
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
    () => presets.find((p) => p.id === selectedPresetId) || null,
    [presets, selectedPresetId]
  );

  // Compute Export Difference whenever selectedPreset or currentExportConfig changes
  useEffect(() => {
    if (!selectedPreset || !currentExportConfig || !window.api?.compareExportPresets) {
      setComparison(null);
      return;
    }

    let isMounted = true;
    window.api
      .compareExportPresets(currentExportConfig, selectedPreset.id)
      .then((res) => {
        if (isMounted && res?.success && res.comparison) {
          setComparison(res.comparison);
        }
      })
      .catch(() => {
        if (isMounted) setComparison(null);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedPreset, currentExportConfig]);

  const filteredPresets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return presets.filter((p) => {
      if (filterType === 'builtin' && !p.isBuiltIn) return false;
      if (filterType === 'custom' && p.isBuiltIn) return false;
      if (!q) return true;
      const matchName = (p.name || '').toLowerCase().includes(q);
      const matchDesc = (p.description || '').toLowerCase().includes(q);
      return matchName || matchDesc;
    });
  }, [presets, filterType, searchQuery]);

  const handleApply = async (preset, e) => {
    if (e) e.stopPropagation();
    if (disabled || !preset) return;
    try {
      const res = await window.api?.applyExportPreset?.(preset.id, currentExportConfig || {});
      if (res?.success && res.config) {
        onPresetApply?.(res.config);
        onPresetSelect?.(preset);
        setActionSuccess(`Applied "${preset.name}"`);
        setTimeout(() => setActionSuccess(null), 2500);
      } else {
        setError(res?.error || 'Failed to apply preset');
      }
    } catch (err) {
      setError(err.message || 'Error applying preset');
    }
  };

  const handleDuplicate = async (preset, e) => {
    if (e) e.stopPropagation();
    if (disabled || !preset) return;
    try {
      const res = await window.api?.duplicateExportPreset?.(preset.id);
      if (res?.success && res.preset) {
        setActionSuccess(`Duplicated "${preset.name}"`);
        await loadPresets();
        onPresetSelect?.(res.preset);
        setTimeout(() => setActionSuccess(null), 2500);
      } else {
        setError(res?.error || 'Failed to duplicate preset');
      }
    } catch (err) {
      setError(err.message || 'Error duplicating preset');
    }
  };

  const handleDelete = async (preset, e) => {
    if (e) e.stopPropagation();
    if (disabled || !preset || preset.isBuiltIn) return;
    const confirmed = window.confirm?.(`Are you sure you want to delete custom preset "${preset.name}"?`);
    if (!confirmed) return;
    try {
      const res = await window.api?.deleteExportPreset?.(preset.id);
      if (res?.success) {
        if (selectedPresetId === preset.id) {
          onPresetSelect?.(null);
        }
        await loadPresets();
        setActionSuccess(`Deleted "${preset.name}"`);
        setTimeout(() => setActionSuccess(null), 2500);
      } else {
        setError(res?.error || 'Failed to delete preset');
      }
    } catch (err) {
      setError(err.message || 'Error deleting preset');
    }
  };

  if (requiresUpgrade) {
    return (
      <div className="rounded-xl border border-brand-500/30 bg-gradient-to-r from-brand-950/40 to-purple-950/40 p-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-brand-500/20 p-2 text-brand-400">
            <Lock size={18} />
          </div>
          <div className="flex-1">
            <h4 className="text-xs font-semibold text-zinc-100 flex items-center gap-2">
              Export Preset Manager
              <span className="rounded bg-brand-500/20 px-1.5 py-0.5 text-[9px] font-bold text-brand-300 border border-brand-500/30">
                PRO
              </span>
            </h4>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Save, manage, compare, and apply unified export presets across single, profile, bulk, and scheduled workflows.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Film size={16} className="text-brand-400" />
          <h3 className="text-xs font-semibold text-zinc-100">Export Presets</h3>
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400 font-mono">
            {presets.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {actionSuccess && (
            <span className="flex items-center gap-1 text-[11px] text-emerald-400 animate-fade-in font-medium">
              <CheckCircle2 size={13} /> {actionSuccess}
            </span>
          )}
          {onOpenEditor && (
            <button
              type="button"
              onClick={() => onOpenEditor(null, true)}
              disabled={disabled}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-brand-300 bg-brand-600/20 hover:bg-brand-600/30 border border-brand-500/40 rounded-lg transition-colors"
            >
              <Plus size={12} /> New Preset
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-800/50 bg-red-950/40 px-3 py-2 text-xs text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">
            <X size={13} />
          </button>
        </div>
      )}

      {/* Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center justify-between">
        <div className="flex items-center gap-1 bg-zinc-950/60 p-1 rounded-lg border border-zinc-800 text-xs">
          <button
            type="button"
            onClick={() => setFilterType('all')}
            className={`px-2.5 py-0.5 rounded font-medium transition-colors ${
              filterType === 'all'
                ? 'bg-brand-600/30 text-brand-300 border border-brand-500/30'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setFilterType('builtin')}
            className={`px-2.5 py-0.5 rounded font-medium transition-colors ${
              filterType === 'builtin'
                ? 'bg-brand-600/30 text-brand-300 border border-brand-500/30'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Built-in
          </button>
          <button
            type="button"
            onClick={() => setFilterType('custom')}
            className={`px-2.5 py-0.5 rounded font-medium transition-colors ${
              filterType === 'custom'
                ? 'bg-brand-600/30 text-brand-300 border border-brand-500/30'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Custom
          </button>
        </div>

        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search export presets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1 bg-zinc-950/60 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-brand-500/60"
          />
        </div>
      </div>

      {/* Preset List */}
      {loading ? (
        <div className="py-6 text-center text-xs text-zinc-500">Loading export presets...</div>
      ) : filteredPresets.length === 0 ? (
        <div className="py-6 text-center text-xs text-zinc-500">
          {searchQuery ? 'No presets match your search query.' : 'No presets found.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
          {filteredPresets.map((preset) => {
            const isSelected = selectedPresetId === preset.id;
            return (
              <div
                key={preset.id}
                onClick={() => onPresetSelect?.(preset)}
                className={`cursor-pointer rounded-lg border p-2.5 transition-all text-left flex flex-col justify-between ${
                  isSelected
                    ? 'border-brand-500/70 bg-brand-950/20 shadow-sm'
                    : 'border-zinc-800 bg-zinc-950/40 hover:border-zinc-700 hover:bg-zinc-800/40'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1.5 mb-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-medium text-zinc-100 truncate">{preset.name}</span>
                      {preset.isBuiltIn ? (
                        <span className="rounded bg-amber-500/10 px-1.5 py-0.2 text-[9px] font-medium text-amber-300 border border-amber-500/20 shrink-0">
                          Built-in
                        </span>
                      ) : (
                        <span className="rounded bg-indigo-500/10 px-1.5 py-0.2 text-[9px] font-medium text-indigo-300 border border-indigo-500/20 shrink-0">
                          Custom
                        </span>
                      )}
                    </div>
                    {isSelected && <Check size={14} className="text-brand-400 shrink-0" />}
                  </div>

                  <p className="text-[11px] text-zinc-400 line-clamp-1 mb-2">
                    {preset.description || formatSettingsSummary(preset.settings)}
                  </p>

                  <div className="flex flex-wrap gap-1 text-[10px] text-zinc-400 font-mono mb-2">
                    <span className="rounded bg-zinc-800/80 px-1.5 py-0.5 border border-zinc-700/50">
                      {preset.settings?.aspectRatio || '9:16'}
                    </span>
                    <span className="rounded bg-zinc-800/80 px-1.5 py-0.5 border border-zinc-700/50">
                      {(preset.settings?.resolution || '1080p').toUpperCase()}
                    </span>
                    <span className="rounded bg-zinc-800/80 px-1.5 py-0.5 border border-zinc-700/50">
                      {preset.settings?.mode || 'blur'}
                    </span>
                    {preset.settings?.variation?.enabled && (
                      <span className="rounded bg-purple-900/30 text-purple-300 px-1.5 py-0.5 border border-purple-700/40">
                        Var
                      </span>
                    )}
                    {(preset.settings?.captionTemplateId || (preset.settings?.textOverlays && preset.settings.textOverlays.length > 0)) && (
                      <span className="rounded bg-blue-900/30 text-blue-300 px-1.5 py-0.5 border border-blue-700/40">
                        Caps
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Actions */}
                <div className="flex items-center justify-between pt-1 border-t border-zinc-800/60 mt-1">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => handleDuplicate(preset, e)}
                      title="Duplicate as new custom preset"
                      disabled={disabled}
                      className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
                    >
                      <Copy size={12} />
                    </button>
                    {onOpenEditor && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenEditor(preset, false);
                        }}
                        title={preset.isBuiltIn ? 'View preset settings' : 'Edit custom preset'}
                        disabled={disabled}
                        className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
                      >
                        <Edit2 size={12} />
                      </button>
                    )}
                    {!preset.isBuiltIn && (
                      <button
                        type="button"
                        onClick={(e) => handleDelete(preset, e)}
                        title="Delete custom preset"
                        disabled={disabled}
                        className="p-1 text-red-400/80 hover:text-red-300 hover:bg-red-950/40 rounded transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={(e) => handleApply(preset, e)}
                    disabled={disabled}
                    className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-brand-300 bg-brand-600/20 hover:bg-brand-600/40 border border-brand-500/30 rounded transition-colors"
                  >
                    Apply <ArrowRight size={11} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Selected Preset Details & Export Difference */}
      {selectedPreset && comparison && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <SlidersHorizontal size={13} className="text-brand-400" />
              <span className="text-xs font-semibold text-zinc-200">
                Export Difference vs Current
              </span>
              <span className="rounded bg-brand-600/20 px-1.5 py-0.2 text-[10px] font-mono text-brand-300 border border-brand-500/30">
                {comparison.differencesCount} change(s)
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowDiff(!showDiff)}
              className="text-[11px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1"
            >
              {showDiff ? 'Collapse' : 'Expand'}
              {showDiff ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          </div>

          {!comparison.hasDifferences ? (
            <p className="text-[11px] text-emerald-400 flex items-center gap-1">
              <CheckCircle2 size={12} /> Current export configuration matches this preset exactly.
            </p>
          ) : (
            <>
              <p className="text-[11px] text-zinc-400">
                Applying &quot;{selectedPreset.name}&quot; will adjust {comparison.differencesCount} setting(s).
              </p>

              {showDiff && comparison.summary && comparison.summary.length > 0 && (
                <ul className="space-y-1 pt-1 border-t border-zinc-800/80 text-[11px] text-zinc-300 font-mono">
                  {comparison.summary.map((item, idx) => (
                    <li key={idx} className="flex items-center gap-1.5 text-brand-200/90">
                      <span className="text-brand-400">•</span> {item}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          <div className="pt-1 flex justify-end">
            <button
              type="button"
              onClick={(e) => handleApply(selectedPreset, e)}
              disabled={disabled || !comparison.hasDifferences}
              className={`px-3 py-1 text-xs font-medium rounded-lg border transition-all flex items-center gap-1.5 ${
                comparison.hasDifferences
                  ? 'bg-brand-600 text-white border-brand-500 hover:bg-brand-500 shadow-sm'
                  : 'bg-zinc-800/60 text-zinc-500 border-zinc-700/50 cursor-not-allowed'
              }`}
            >
              Apply Preset to Current Export <ArrowRight size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
