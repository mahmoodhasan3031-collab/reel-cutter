import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Save,
  RotateCcw,
  SlidersHorizontal,
  Film,
  Sparkles,
  Type,
  Volume2,
  Maximize2,
  CheckCircle2,
  AlertCircle,
  Crop,
  Layers,
  Info,
} from 'lucide-react';

const ASPECT_RATIOS = [
  { id: '9:16', label: '9:16', desc: 'Reels / Shorts' },
  { id: '1:1',  label: '1:1',  desc: 'Square' },
  { id: '4:5',  label: '4:5',  desc: 'Portrait' },
  { id: '16:9', label: '16:9', desc: 'Landscape' },
];

const RESOLUTIONS = [
  { id: '1080p', label: '1080p Full HD' },
  { id: '4k',    label: '4K Ultra HD' },
];

const QUALITIES = [
  { id: '1080p',    label: '1080p' },
  { id: '4k',       label: '4K' },
  { id: 'standard', label: 'Standard' },
  { id: 'high',     label: 'High' },
];

const MODES = [
  { id: 'blur',       label: 'Blur',            desc: 'Center video with blurred background' },
  { id: 'crop',       label: 'Crop',            desc: 'Center crop to aspect ratio' },
  { id: 'pad',        label: 'Pad',             desc: 'Black letterbox/pillarbox' },
  { id: 'smart_crop', label: 'Smart Crop (AI)', desc: 'AI subject tracking reframe' },
];

const EXPORT_TYPES = [
  { id: 'reel',  label: 'Make Reel' },
  { id: 'cut',   label: 'Cut Clip' },
  { id: 'split', label: 'Split Video' },
];

const REFRAME_MODES = ['center', 'left', 'right', 'top', 'bottom'];

const DEFAULT_SETTINGS = {
  aspectRatio: '9:16',
  resolution: '1080p',
  quality: '1080p',
  mode: 'blur',
  smartCrop: false,
  exportType: 'reel',
  variation: {
    enabled: false,
    brightness: 0.0,
    saturation: 1.0,
    hue: 0.0,
    pitch: 0.0,
    speed: 1.00,
    mode: 'center',
    crop: 0.0,
    cleanMetadata: true,
  },
  variationPresetId: null,
  captionTemplateId: null,
  textOverlays: [],
  audio: {
    preservePitch: true,
    normalizeAudio: false,
  },
};

function SliderField({ label, value, min, max, step, onChange, disabled }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label className="text-xs text-zinc-400">{label}</label>
        <span className="text-xs font-mono text-zinc-300">{Number(value).toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        disabled={disabled}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-zinc-700 accent-brand-500 disabled:opacity-50"
      />
      <div className="flex justify-between text-[10px] text-zinc-600 font-mono">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

export default function ExportPresetEditor({
  preset = null, // null for new preset
  isOpen = false,
  onClose,
  onSaved,
}) {
  const isBuiltIn = Boolean(preset?.isBuiltIn);

  const [name, setName] = useState(preset?.name || '');
  const [description, setDescription] = useState(preset?.description || '');
  const [settings, setSettings] = useState(() => ({
    ...DEFAULT_SETTINGS,
    ...(preset?.settings || {}),
    variation: {
      ...DEFAULT_SETTINGS.variation,
      ...(preset?.settings?.variation || {}),
    },
    audio: {
      ...DEFAULT_SETTINGS.audio,
      ...(preset?.settings?.audio || {}),
    },
  }));

  const [availableVariationPresets, setAvailableVariationPresets] = useState([]);
  const [availableCaptionTemplates, setAvailableCaptionTemplates] = useState([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [activeTab, setActiveTab] = useState('output'); // output | variation | captions | audio | export

  // Load variation presets and caption templates for dropdowns
  useEffect(() => {
    if (!isOpen) return;

    window.api?.getVariationPresets?.().then((res) => {
      if (res?.success && Array.isArray(res.presets)) {
        setAvailableVariationPresets(res.presets);
      }
    }).catch(() => {});

    window.api?.getCaptionTemplates?.().then((res) => {
      if (res?.success && Array.isArray(res.templates)) {
        setAvailableCaptionTemplates(res.templates);
      }
    }).catch(() => {});
  }, [isOpen]);

  // Sync state whenever selected preset changes or modal opens
  useEffect(() => {
    if (preset) {
      setName(preset.name || '');
      setDescription(preset.description || '');
      setSettings({
        ...DEFAULT_SETTINGS,
        ...(preset.settings || {}),
        variation: {
          ...DEFAULT_SETTINGS.variation,
          ...(preset.settings?.variation || {}),
        },
        audio: {
          ...DEFAULT_SETTINGS.audio,
          ...(preset.settings?.audio || {}),
        },
      });
    } else {
      setName('');
      setDescription('');
      setSettings(DEFAULT_SETTINGS);
    }
    setFormError(null);
  }, [preset, isOpen]);

  const updateSetting = (key, value) => {
    if (isBuiltIn) return;
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const updateVariationField = (field, value) => {
    if (isBuiltIn) return;
    setSettings((prev) => ({
      ...prev,
      variation: {
        ...prev.variation,
        [field]: value,
      },
    }));
  };

  const updateAudioField = (field, value) => {
    if (isBuiltIn) return;
    setSettings((prev) => ({
      ...prev,
      audio: {
        ...prev.audio,
        [field]: value,
      },
    }));
  };

  // Handle selecting a variation preset dropdown
  const handleVariationPresetChange = (vPresetId) => {
    if (isBuiltIn) return;
    if (!vPresetId) {
      updateSetting('variationPresetId', null);
      return;
    }
    const matched = availableVariationPresets.find((vp) => vp.id === vPresetId);
    if (matched) {
      setSettings((prev) => ({
        ...prev,
        variationPresetId: matched.id,
        variation: {
          ...matched.variation,
          enabled: true,
        },
      }));
    }
  };

  // Handle selecting a caption template dropdown
  const handleCaptionTemplateChange = (tplId) => {
    if (isBuiltIn) return;
    if (!tplId) {
      updateSetting('captionTemplateId', null);
      return;
    }
    const matched = availableCaptionTemplates.find((t) => t.id === tplId);
    if (matched) {
      setSettings((prev) => ({
        ...prev,
        captionTemplateId: matched.id,
        textOverlays: Array.isArray(matched.overlays)
          ? JSON.parse(JSON.stringify(matched.overlays))
          : prev.textOverlays,
      }));
    }
  };

  const handleResetDefaults = () => {
    if (isBuiltIn) return;
    setSettings(DEFAULT_SETTINGS);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (isBuiltIn) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError('Preset name is required');
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      let result;
      const payload = {
        name: trimmedName,
        description: description.trim(),
        settings,
      };

      if (preset && preset.id) {
        result = await window.api?.updateExportPreset?.(preset.id, payload);
      } else {
        result = await window.api?.createExportPreset?.(payload);
      }

      if (result && result.success === false) {
        throw new Error(result.error || 'Failed to save export preset');
      }

      onSaved?.(result?.preset);
      onClose();
    } catch (err) {
      setFormError(err.message || 'Error saving preset');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-brand-500/20 p-2 text-brand-400">
              <Film size={18} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                {isBuiltIn
                  ? `View Built-in Preset: ${preset.name}`
                  : preset
                  ? `Edit Preset: ${preset.name}`
                  : 'Create Export Preset'}
                {isBuiltIn ? (
                  <span className="rounded bg-amber-500/10 px-1.5 py-0.2 text-[10px] font-medium text-amber-300 border border-amber-500/20">
                    Built-in (Read-only)
                  </span>
                ) : (
                  <span className="rounded bg-indigo-500/10 px-1.5 py-0.2 text-[10px] font-medium text-indigo-300 border border-indigo-500/20">
                    Custom
                  </span>
                )}
              </h2>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Configure full output framing, layout mode, variation look, captions, and audio options.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 transition-colors p-1 rounded-lg hover:bg-zinc-800"
          >
            <X size={18} />
          </button>
        </div>

        {/* Built-in Notice */}
        {isBuiltIn && (
          <div className="bg-amber-950/30 border-b border-amber-800/40 px-6 py-2.5 text-xs text-amber-300/90 flex items-center gap-2">
            <Info size={14} className="shrink-0 text-amber-400" />
            Built-in presets are protected and cannot be directly modified. To customize, click Duplicate in the preset list.
          </div>
        )}

        {/* Form Error */}
        {formError && (
          <div className="bg-red-950/40 border-b border-red-800/50 px-6 py-2.5 text-xs text-red-400 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle size={14} className="shrink-0" />
              <span>{formError}</span>
            </div>
            <button onClick={() => setFormError(null)} className="text-red-400 hover:text-red-300">
              <X size={13} />
            </button>
          </div>
        )}

        {/* Modal Tabs */}
        <div className="flex items-center gap-1 border-b border-zinc-800 px-6 pt-3 bg-zinc-950/30 text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveTab('output')}
            className={`pb-2 px-2.5 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'output'
                ? 'border-brand-500 text-brand-300 font-semibold'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Maximize2 size={13} /> Output & Framing
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('variation')}
            className={`pb-2 px-2.5 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'variation'
                ? 'border-brand-500 text-brand-300 font-semibold'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <SlidersHorizontal size={13} /> Content Variation
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('captions')}
            className={`pb-2 px-2.5 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'captions'
                ? 'border-brand-500 text-brand-300 font-semibold'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Type size={13} /> Captions & Overlays
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('audio')}
            className={`pb-2 px-2.5 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'audio'
                ? 'border-brand-500 text-brand-300 font-semibold'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Volume2 size={13} /> Audio & Export Type
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Preset Name & Description */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1 space-y-1">
              <label className="text-xs font-semibold text-zinc-300">Preset Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isBuiltIn}
                placeholder="e.g. TikTok Punchy 1080p"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-brand-500 disabled:opacity-60"
              />
            </div>
            <div className="sm:col-span-2 space-y-1">
              <label className="text-xs font-semibold text-zinc-300">Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isBuiltIn}
                placeholder="Optional description of this preset workflow..."
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-brand-500 disabled:opacity-60"
              />
            </div>
          </div>

          {/* TAB 1: Output & Framing */}
          {activeTab === 'output' && (
            <div className="space-y-4 pt-1">
              {/* Aspect Ratio */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">Aspect Ratio</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {ASPECT_RATIOS.map((ar) => (
                    <button
                      key={ar.id}
                      type="button"
                      disabled={isBuiltIn}
                      onClick={() => updateSetting('aspectRatio', ar.id)}
                      className={`p-2.5 rounded-lg border text-left transition-all ${
                        settings.aspectRatio === ar.id
                          ? 'border-brand-500/70 bg-brand-600/20 text-brand-300'
                          : 'border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <div className="text-xs font-bold">{ar.label}</div>
                      <div className="text-[10px] text-zinc-500">{ar.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Resolution & Quality */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-300">Resolution</label>
                  <select
                    value={settings.resolution}
                    disabled={isBuiltIn}
                    onChange={(e) => updateSetting('resolution', e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-brand-500 disabled:opacity-60"
                  >
                    {RESOLUTIONS.map((res) => (
                      <option key={res.id} value={res.id}>
                        {res.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-300">Quality Profile</label>
                  <select
                    value={settings.quality}
                    disabled={isBuiltIn}
                    onChange={(e) => updateSetting('quality', e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-brand-500 disabled:opacity-60"
                  >
                    {QUALITIES.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Mode & Framing */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">Layout Mode</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {MODES.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      disabled={isBuiltIn}
                      onClick={() => {
                        updateSetting('mode', m.id);
                        if (m.id === 'smart_crop') {
                          updateSetting('smartCrop', true);
                        }
                      }}
                      className={`p-2.5 rounded-lg border text-left transition-all ${
                        settings.mode === m.id
                          ? 'border-brand-500/70 bg-brand-600/20 text-brand-300'
                          : 'border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <div className="text-xs font-bold">{m.label}</div>
                      <div className="text-[10px] text-zinc-500 line-clamp-1">{m.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Content Variation */}
          {activeTab === 'variation' && (
            <div className="space-y-4 pt-1">
              {/* Linked Variation Preset */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">Link Variation Preset (Optional)</label>
                <select
                  value={settings.variationPresetId || ''}
                  disabled={isBuiltIn}
                  onChange={(e) => handleVariationPresetChange(e.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-brand-500 disabled:opacity-60"
                >
                  <option value="">Custom Manual Variation (or None)</option>
                  {availableVariationPresets.map((vp) => (
                    <option key={vp.id} value={vp.id}>
                      {vp.name} {vp.isBuiltIn ? '(Built-in)' : '(Custom)'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Master Variation Toggle */}
              <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                <div>
                  <span className="text-xs font-semibold text-zinc-200">Enable Variation in Preset</span>
                  <p className="text-[11px] text-zinc-500">
                    Applies color grading, pitch, speed, and framing adjustments on export.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(settings.variation?.enabled)}
                  disabled={isBuiltIn}
                  onChange={(e) => updateVariationField('enabled', e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-brand-600 focus:ring-brand-500 cursor-pointer"
                />
              </div>

              {/* Sliders (enabled if variation is on) */}
              {settings.variation?.enabled && (
                <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4 space-y-4 animate-fade-in">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <SliderField
                      label="Brightness"
                      value={settings.variation.brightness}
                      min={-1.0}
                      max={1.0}
                      step={0.05}
                      disabled={isBuiltIn}
                      onChange={(v) => updateVariationField('brightness', v)}
                    />
                    <SliderField
                      label="Saturation"
                      value={settings.variation.saturation}
                      min={0.0}
                      max={3.0}
                      step={0.05}
                      disabled={isBuiltIn}
                      onChange={(v) => updateVariationField('saturation', v)}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <SliderField
                      label="Hue Shift (°)"
                      value={settings.variation.hue}
                      min={-180}
                      max={180}
                      step={1}
                      disabled={isBuiltIn}
                      onChange={(v) => updateVariationField('hue', v)}
                    />
                    <SliderField
                      label="Audio Pitch Shift"
                      value={settings.variation.pitch}
                      min={-3.0}
                      max={3.0}
                      step={0.1}
                      disabled={isBuiltIn}
                      onChange={(v) => updateVariationField('pitch', v)}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <SliderField
                      label="Speed Multiplier"
                      value={settings.variation.speed}
                      min={1.0}
                      max={1.05}
                      step={0.01}
                      disabled={isBuiltIn}
                      onChange={(v) => updateVariationField('speed', v)}
                    />
                    <SliderField
                      label="Micro-Crop (%)"
                      value={settings.variation.crop}
                      min={0.0}
                      max={2.0}
                      step={0.2}
                      disabled={isBuiltIn}
                      onChange={(v) => updateVariationField('crop', v)}
                    />
                  </div>

                  {/* Reframe Mode */}
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-400">Reframe Focal Mode</label>
                    <div className="flex gap-2">
                      {REFRAME_MODES.map((rm) => (
                        <button
                          key={rm}
                          type="button"
                          disabled={isBuiltIn}
                          onClick={() => updateVariationField('mode', rm)}
                          className={`flex-1 py-1 text-xs rounded border capitalize transition-colors ${
                            settings.variation.mode === rm
                              ? 'bg-brand-600/30 text-brand-300 border-brand-500/50'
                              : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-zinc-200'
                          }`}
                        >
                          {rm}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Captions & Overlays */}
          {activeTab === 'captions' && (
            <div className="space-y-4 pt-1">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">Link Caption Template (Optional)</label>
                <select
                  value={settings.captionTemplateId || ''}
                  disabled={isBuiltIn}
                  onChange={(e) => handleCaptionTemplateChange(e.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-brand-500 disabled:opacity-60"
                >
                  <option value="">No Linked Caption Template</option>
                  {availableCaptionTemplates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name} {tpl.isBuiltIn ? '(Built-in)' : '(Custom)'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Overlays Summary / Preview */}
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 space-y-2">
                <span className="text-xs font-semibold text-zinc-300 flex items-center justify-between">
                  <span>Assigned Text Overlays</span>
                  <span className="text-[11px] text-zinc-500 font-mono">
                    {Array.isArray(settings.textOverlays) ? settings.textOverlays.length : 0} layer(s)
                  </span>
                </span>
                {Array.isArray(settings.textOverlays) && settings.textOverlays.length > 0 ? (
                  <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                    {settings.textOverlays.map((ov, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded bg-zinc-900 border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 font-mono"
                      >
                        <span className="truncate max-w-[200px]">{ov.text || 'Caption layer'}</span>
                        <span className="text-[10px] text-zinc-500">
                          {ov.position || 'bottom'} · {ov.fontSize || 48}px
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-zinc-500 italic">
                    No text overlays configured for this preset.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: Audio & Export Type */}
          {activeTab === 'audio' && (
            <div className="space-y-4 pt-1">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">Target Export Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {EXPORT_TYPES.map((et) => (
                    <button
                      key={et.id}
                      type="button"
                      disabled={isBuiltIn}
                      onClick={() => updateSetting('exportType', et.id)}
                      className={`p-2 rounded-lg border text-center transition-all ${
                        settings.exportType === et.id
                          ? 'border-brand-500/70 bg-brand-600/20 text-brand-300 font-semibold'
                          : 'border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <div className="text-xs">{et.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Audio Settings */}
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 space-y-3">
                <span className="text-xs font-semibold text-zinc-300">Audio Handling</span>

                <label className="flex items-center justify-between cursor-pointer select-none">
                  <div>
                    <span className="text-xs text-zinc-300 font-medium">Preserve Pitch during Speed Adjustment</span>
                    <p className="text-[10px] text-zinc-500">Prevents chipmunk effects when speed shifts are applied.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(settings.audio?.preservePitch)}
                    disabled={isBuiltIn}
                    onChange={(e) => updateAudioField('preservePitch', e.target.checked)}
                    className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-brand-600 focus:ring-brand-500 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer select-none pt-2 border-t border-zinc-800/60">
                  <div>
                    <span className="text-xs text-zinc-300 font-medium">Normalize Audio Stream</span>
                    <p className="text-[10px] text-zinc-500">Harmonizes peak levels across repurposed segments.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(settings.audio?.normalizeAudio)}
                    disabled={isBuiltIn}
                    onChange={(e) => updateAudioField('normalizeAudio', e.target.checked)}
                    className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-brand-600 focus:ring-brand-500 cursor-pointer"
                  />
                </label>
              </div>
            </div>
          )}
        </form>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-zinc-800 px-6 py-3 bg-zinc-950/60">
          <div>
            {!isBuiltIn && (
              <button
                type="button"
                onClick={handleResetDefaults}
                className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                <RotateCcw size={12} /> Reset to Defaults
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg border border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            {!isBuiltIn && (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
              >
                <Save size={13} /> {saving ? 'Saving...' : 'Save Preset'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
