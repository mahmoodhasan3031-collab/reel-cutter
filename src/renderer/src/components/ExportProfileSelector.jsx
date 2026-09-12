import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Globe, ChevronDown, SlidersHorizontal, AlertCircle, RefreshCw } from 'lucide-react';

/**
 * Normalises a stored variationPreset from a profile into the flat format
 * expected by ContentVariationSection. Applies product-level clamping so
 * malformed stored values never reach FFmpeg.
 */
export function resolveProfilePreset(variationPreset) {
  if (!variationPreset || typeof variationPreset !== 'object') {
    return getDefaultVariation();
  }

  const clamp = (v, min, max, def) => {
    const n = Number(v);
    if (typeof v === 'boolean' || isNaN(n)) return def;
    return Math.min(max, Math.max(min, n));
  };

  const REFRAME_MODES = ['center', 'left', 'right', 'top', 'bottom'];

  const brightness   = clamp(variationPreset.brightness,   -1.0,  1.0,  0.0);
  const saturation   = clamp(variationPreset.saturation,    0.0,  3.0,  1.0);
  const hue          = clamp(variationPreset.hue,        -180.0, 180.0, 0.0);
  const pitch        = clamp(variationPreset.pitch,        -3.0,  3.0,  0.0);
  const speed        = clamp(variationPreset.speed,         1.00, 1.05, 1.00);
  const crop         = clamp(variationPreset.crop,          0.0,  2.0,  0.0);

  const rawMode = variationPreset.mode || variationPreset.reframeMode || 'center';
  const mode = REFRAME_MODES.includes(String(rawMode).toLowerCase().trim())
    ? String(rawMode).toLowerCase().trim()
    : 'center';

  const cleanMetadata = variationPreset.cleanMetadata !== undefined
    ? Boolean(variationPreset.cleanMetadata)
    : true;

  return { enabled: true, brightness, saturation, hue, pitch, speed, mode, crop, cleanMetadata };
}

export function getDefaultVariation() {
  return {
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
}

const PLATFORM_COLORS = {
  Facebook:  'text-blue-400',
  Instagram: 'text-pink-400',
  YouTube:   'text-red-400',
  TikTok:    'text-cyan-400',
  Other:     'text-zinc-400',
};

/**
 * ExportProfileSelector
 *
 * A compact, shared component that renders a Profile dropdown above
 * CutPanel / ReelPanel / SplitPanel. When a profile is selected it copies
 * that profile's variationPreset into the parent's variation state so the
 * user can further adjust it before exporting. The saved profile is NEVER
 * modified by export actions.
 *
 * Props:
 *   variation        – current variation state (from parent)
 *   onVariationChange – callback(newVariation) when profile preset is applied
 *   disabled         – disables UI when processing
 */
export default function ExportProfileSelector({ variation, onVariationChange, disabled = false }) {
  const [profiles, setProfiles]               = useState([]);
  const [selectedId, setSelectedId]           = useState(null); // null = None
  const [loadError, setLoadError]             = useState(null);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [isOpen, setIsOpen]                   = useState(false);
  const dropdownRef                           = useRef(null);
  const manualVariationRef                    = useRef(variation);
  const isInitialMount                        = useRef(true);

  // Keep track of manual settings whenever selectedId === null
  useEffect(() => {
    if (selectedId === null) {
      manualVariationRef.current = variation;
    }
  }, [variation, selectedId]);

  // Fetch fresh profile list from main process
  const fetchProfiles = useCallback(async () => {
    if (!window.api?.getProfiles) return;
    try {
      setLoadingProfiles(true);
      setLoadError(null);
      const res = await window.api.getProfiles();
      const list = res?.profiles || (Array.isArray(res) ? [...res] : []);
      // Only show enabled profiles
      const enabled = list.filter(p => p.enabled !== false);
      setProfiles(enabled);

      if (isInitialMount.current) {
        isInitialMount.current = false;
        const activeId = res?.selectedProfileId || null;
        if (activeId && enabled.some(p => p.id === activeId)) {
          const profile = enabled.find(p => p.id === activeId);
          setSelectedId(activeId);
          const resolved = resolveProfilePreset(profile.variationPreset);
          onVariationChange?.(resolved);
        } else {
          setSelectedId(null);
        }
      } else {
        // Validate current selectedId is still in the enabled list
        setSelectedId(prev => {
          if (prev === null) return null;
          const still = enabled.find(p => p.id === prev);
          if (!still) {
            // Deleted or disabled — fall back to None and restore manual settings
            if (window.api?.setSelectedProfile) {
              window.api.setSelectedProfile(null).catch(() => {});
            }
            onVariationChange?.(manualVariationRef.current || getDefaultVariation());
            return null;
          }
          return prev;
        });
      }
    } catch (err) {
      setLoadError('Failed to load profiles');
    } finally {
      setLoadingProfiles(false);
    }
  }, [onVariationChange]);

  // Load on mount
  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  // Refresh when dropdown opens (catch edits made in Page Profiles panel)
  const handleOpen = () => {
    if (disabled) return;
    setIsOpen(true);
    fetchProfiles();
  };

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const handleSelectProfile = async (profileId) => {
    setIsOpen(false);

    if (profileId === null) {
      // None selected: revert to manual settings
      setSelectedId(null);
      if (window.api?.setSelectedProfile) {
        try { await window.api.setSelectedProfile(null); } catch (_) {}
      }
      onVariationChange?.(manualVariationRef.current || getDefaultVariation());
      return;
    }

    // Always fetch fresh profile list to avoid stale cached values
    let targetProfile = profiles.find(p => p.id === profileId);
    if (window.api?.getProfiles) {
      try {
        const res = await window.api.getProfiles();
        const list = res?.profiles || [];
        const fresh = list.find(p => p.id === profileId && p.enabled !== false);
        if (fresh) {
          targetProfile = fresh;
        }
      } catch (_) {}
    }

    if (!targetProfile || targetProfile.enabled === false) {
      setSelectedId(null);
      if (window.api?.setSelectedProfile) {
        try { await window.api.setSelectedProfile(null); } catch (_) {}
      }
      onVariationChange?.(manualVariationRef.current || getDefaultVariation());
      return;
    }

    // Copy and validate the preset — does NOT modify the saved profile
    const resolved = resolveProfilePreset(targetProfile.variationPreset);
    setSelectedId(profileId);
    if (window.api?.setSelectedProfile) {
      try { await window.api.setSelectedProfile(profileId); } catch (_) {}
    }
    onVariationChange?.(resolved);
  };

  const activeProfile = selectedId ? profiles.find(p => p.id === selectedId) : null;

  // Preset summary (only the non-default/interesting values)
  const presetSummary = activeProfile ? buildSummary(activeProfile.variationPreset) : [];

  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Globe size={14} className="text-brand-400" />
          <span className="text-xs font-semibold text-zinc-200">Export Profile</span>
        </div>
        <button
          type="button"
          onClick={fetchProfiles}
          disabled={disabled || loadingProfiles}
          className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors rounded"
          title="Refresh profiles"
        >
          <RefreshCw size={12} className={loadingProfiles ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Error state */}
      {loadError && (
        <div className="flex items-center gap-1.5 text-[11px] text-red-400">
          <AlertCircle size={12} /> {loadError}
        </div>
      )}

      {/* Dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          disabled={disabled}
          onClick={isOpen ? () => setIsOpen(false) : handleOpen}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs border transition-colors ${
            disabled
              ? 'opacity-50 cursor-not-allowed bg-zinc-950 border-zinc-800 text-zinc-500'
              : isOpen
              ? 'bg-zinc-950 border-brand-500/50 text-zinc-100'
              : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-600'
          }`}
        >
          <span className="flex items-center gap-2 truncate">
            {activeProfile ? (
              <>
                <span className={`w-1.5 h-1.5 rounded-full bg-current ${PLATFORM_COLORS[activeProfile.platform] || 'text-zinc-400'} shrink-0`} style={{ backgroundColor: 'currentColor' }} />
                <span className="truncate">{activeProfile.name}</span>
              </>
            ) : (
              <span className="text-zinc-500">None — using manual settings</span>
            )}
          </span>
          <ChevronDown size={14} className={`shrink-0 ml-2 text-zinc-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <div className="absolute z-30 w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden">
            {/* None option */}
            <button
              type="button"
              onClick={() => handleSelectProfile(null)}
              className={`w-full text-left px-3 py-2.5 text-xs transition-colors hover:bg-zinc-800/60 ${
                selectedId === null ? 'bg-brand-600/10 text-brand-300' : 'text-zinc-400'
              }`}
            >
              None — use manual settings
            </button>

            {profiles.length > 0 && (
              <div className="border-t border-zinc-800/80">
                {profiles.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectProfile(p.id)}
                    className={`w-full text-left px-3 py-2.5 text-xs transition-colors hover:bg-zinc-800/60 flex items-center gap-2 ${
                      selectedId === p.id ? 'bg-brand-600/10 text-brand-300' : 'text-zinc-300'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${PLATFORM_COLORS[p.platform] || 'text-zinc-400'}`}
                      style={{ backgroundColor: p.platform === 'Facebook' ? '#60a5fa'
                        : p.platform === 'Instagram' ? '#f472b6'
                        : p.platform === 'YouTube'   ? '#f87171'
                        : p.platform === 'TikTok'    ? '#22d3ee'
                        : '#71717a' }}
                    />
                    <span className="truncate flex-1">{p.name}</span>
                    <span className={`text-[10px] shrink-0 ${PLATFORM_COLORS[p.platform] || 'text-zinc-500'}`}>
                      {p.platform}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {profiles.length === 0 && !loadingProfiles && (
              <div className="px-3 py-3 text-[11px] text-zinc-500 text-center border-t border-zinc-800/80">
                No enabled profiles — create one in Page Profiles
              </div>
            )}
          </div>
        )}
      </div>

      {/* Active preset summary */}
      {activeProfile && (
        <div className="space-y-1.5 pt-0.5">
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
            <SlidersHorizontal size={11} className="text-brand-400 shrink-0" />
            <span className="font-medium text-zinc-300">Using profile preset</span>
            <span className="ml-auto text-zinc-600">•</span>
            <span className="text-zinc-500 ml-1">changes apply to this export only</span>
          </div>
          {presetSummary.length > 0 ? (
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-zinc-500">
              {presetSummary.map(item => (
                <span key={item.key}>
                  {item.label}: <strong className="text-zinc-300 font-mono">{item.value}</strong>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-zinc-600">All values at defaults</p>
          )}
        </div>
      )}

      {/* No profile selected indicator */}
      {!activeProfile && (
        <p className="text-[11px] text-zinc-600">Using manual settings</p>
      )}
    </div>
  );
}

/** Build a compact human-readable summary of non-default preset values */
function buildSummary(preset) {
  if (!preset) return [];
  const items = [];

  const p = preset;
  const brightness = Number(p.brightness ?? 0);
  const saturation = Number(p.saturation ?? 1);
  const hue        = Number(p.hue ?? 0);
  const pitch      = Number(p.pitch ?? 0);
  const speed      = Number(p.speed ?? 1.0);
  const crop       = Number(p.crop ?? 0);
  const mode       = p.mode || p.reframeMode || 'center';
  const cleanMeta  = p.cleanMetadata !== false;

  if (Math.abs(brightness) > 0.001)
    items.push({ key: 'brightness', label: 'Brightness', value: brightness > 0 ? `+${brightness.toFixed(2)}` : brightness.toFixed(2) });
  if (Math.abs(saturation - 1) > 0.001)
    items.push({ key: 'saturation', label: 'Saturation', value: saturation.toFixed(2) });
  if (Math.abs(hue) > 0.5)
    items.push({ key: 'hue', label: 'Hue', value: `${Math.round(hue)}°` });
  if (Math.abs(pitch) > 0.001)
    items.push({ key: 'pitch', label: 'Pitch', value: `${pitch > 0 ? '+' : ''}${pitch.toFixed(1)}%` });
  if (Math.abs(speed - 1.0) > 0.001)
    items.push({ key: 'speed', label: 'Speed', value: `${speed.toFixed(2)}x` });
  if (crop > 0.001)
    items.push({ key: 'crop', label: 'Crop', value: `${crop.toFixed(1)}% (${mode})` });
  else if (mode !== 'center')
    items.push({ key: 'mode', label: 'Mode', value: mode });
  if (!cleanMeta)
    items.push({ key: 'meta', label: 'Metadata', value: 'preserve' });

  return items;
}