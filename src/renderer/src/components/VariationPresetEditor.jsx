import React, { useState, useEffect, useCallback } from 'react';

/**
 * VariationPresetEditor — Phase 5A
 *
 * Full CRUD editor for content variation presets.
 * Allows creating, editing, duplicating, and deleting custom presets.
 * Built-in presets can be viewed but not modified (can be duplicated).
 *
 * Variation field limits (from engine validator):
 *   brightness: -1.0 to 1.0, saturation: 0.0 to 3.0, hue: -180.0 to 180.0
 *   pitch: -3.0 to 3.0, speed: 1.00 to 1.05, crop: 0.0 to 2.0
 *   mode: center | left | right | top | bottom
 */

const REFRAME_MODES = ['center', 'left', 'right', 'top', 'bottom'];

const DEFAULT_VARIATION = {
  enabled: false,
  brightness: 0.0,
  saturation: 1.0,
  hue: 0.0,
  pitch: 0.0,
  speed: 1.00,
  mode: 'center',
  crop: 0.0,
  cleanMetadata: true,
};

function SliderField({ label, value, min, max, step, onChange, disabled }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label className="text-xs text-gray-400">{label}</label>
        <span className="text-xs font-mono text-gray-300">{Number(value).toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        disabled={disabled}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-gray-700 accent-blue-500 disabled:opacity-50"
      />
      <div className="flex justify-between text-xs text-gray-600">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

function PresetForm({ preset, onSave, onCancel, isBuiltIn = false }) {
  const [name, setName] = useState(preset?.name || '');
  const [description, setDescription] = useState(preset?.description || '');
  const [variation, setVariation] = useState({
    ...DEFAULT_VARIATION,
    ...(preset?.variation || {}),
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const handleVariationChange = (field, value) => {
    setVariation(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('Preset name is required');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await onSave({ name: name.trim(), description: description.trim(), variation });
    } catch (err) {
      setFormError(err.message || 'Save failed');
      setSaving(false);
    }
  };

  const readOnly = isBuiltIn;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {isBuiltIn && (
        <div className="rounded-lg border border-yellow-700/50 bg-yellow-900/20 px-3 py-2 text-xs text-yellow-400">
          Built-in presets are read-only. Duplicate to create a custom version.
        </div>
      )}

      {/* Name */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-400 font-medium">Name *</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={100}
          placeholder="Enter preset name…"
          disabled={readOnly || saving}
          className="rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none disabled:opacity-50"
        />
      </div>

      {/* Description */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-400 font-medium">Description</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          maxLength={300}
          rows={2}
          placeholder="Optional description…"
          disabled={readOnly || saving}
          className="rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none resize-none disabled:opacity-50"
        />
      </div>

      {/* Variation Enabled Toggle */}
      <div className="flex items-center gap-3 rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2">
        <input
          type="checkbox"
          id="var-enabled"
          checked={variation.enabled}
          onChange={e => handleVariationChange('enabled', e.target.checked)}
          disabled={readOnly || saving}
          className="h-4 w-4 cursor-pointer rounded accent-blue-500 disabled:opacity-50"
        />
        <label htmlFor="var-enabled" className="text-sm text-gray-300 cursor-pointer select-none">
          Enable content variation
        </label>
      </div>

      {/* Variation fields — shown regardless of enabled state for configuration */}
      <div className="flex flex-col gap-4 rounded-lg border border-gray-700 bg-gray-900/50 p-4">
        <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Visual Adjustments</p>
        <SliderField
          label="Brightness"
          value={variation.brightness}
          min={-1.0}
          max={1.0}
          step={0.01}
          onChange={v => handleVariationChange('brightness', v)}
          disabled={readOnly || saving}
        />
        <SliderField
          label="Saturation"
          value={variation.saturation}
          min={0.0}
          max={3.0}
          step={0.01}
          onChange={v => handleVariationChange('saturation', v)}
          disabled={readOnly || saving}
        />
        <SliderField
          label="Hue Shift (degrees)"
          value={variation.hue}
          min={-180.0}
          max={180.0}
          step={1}
          onChange={v => handleVariationChange('hue', v)}
          disabled={readOnly || saving}
        />

        <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mt-2">Audio & Timing</p>
        <SliderField
          label="Pitch"
          value={variation.pitch}
          min={-3.0}
          max={3.0}
          step={0.01}
          onChange={v => handleVariationChange('pitch', v)}
          disabled={readOnly || saving}
        />
        <SliderField
          label="Speed"
          value={variation.speed}
          min={1.00}
          max={1.05}
          step={0.001}
          onChange={v => handleVariationChange('speed', v)}
          disabled={readOnly || saving}
        />

        <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mt-2">Reframe & Crop</p>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">Reframe Mode</label>
          <select
            value={variation.mode}
            onChange={e => handleVariationChange('mode', e.target.value)}
            disabled={readOnly || saving}
            className="rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none disabled:opacity-50"
          >
            {REFRAME_MODES.map(m => (
              <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>
            ))}
          </select>
        </div>
        <SliderField
          label="Crop (%)"
          value={variation.crop}
          min={0.0}
          max={2.0}
          step={0.1}
          onChange={v => handleVariationChange('crop', v)}
          disabled={readOnly || saving}
        />

        <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mt-2">Metadata</p>
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="var-cleanmeta"
            checked={variation.cleanMetadata}
            onChange={e => handleVariationChange('cleanMetadata', e.target.checked)}
            disabled={readOnly || saving}
            className="h-4 w-4 cursor-pointer rounded accent-blue-500 disabled:opacity-50"
          />
          <label htmlFor="var-cleanmeta" className="text-sm text-gray-300 cursor-pointer select-none">
            Clean metadata on export
          </label>
        </div>
      </div>

      {formError && (
        <div className="rounded-lg border border-red-700/50 bg-red-900/20 px-3 py-2 text-sm text-red-400">
          {formError}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        {!isBuiltIn ? (
          <button
            type="button"
            onClick={() => setVariation({ ...DEFAULT_VARIATION })}
            disabled={saving}
            className="rounded border border-gray-600 bg-gray-800 px-3 py-2 text-xs text-gray-400 hover:text-gray-200 disabled:opacity-50"
          >
            Reset to Defaults
          </button>
        ) : <div />}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded border border-gray-600 bg-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-600 disabled:opacity-50"
          >
            {isBuiltIn ? 'Close' : 'Cancel'}
          </button>
          {!isBuiltIn && (
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Preset'}
            </button>
          )}
        </div>
      </div>
    </form>
  );
}

export default function VariationPresetEditor({ onClose }) {
  const [presets, setPresets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [requiresUpgrade, setRequiresUpgrade] = useState(false);
  const [mode, setMode] = useState('list'); // list | create | edit | view
  const [activePreset, setActivePreset] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all'); // all | builtin | custom

  const filteredPresets = presets.filter(p => {
    if (filterType === 'builtin' && !p.isBuiltIn) return false;
    if (filterType === 'custom' && p.isBuiltIn) return false;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q);
  });

  const loadPresets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.api?.getVariationPresets?.();
      if (!result) { setPresets([]); return; }
      if (result.requiresUpgrade) { setRequiresUpgrade(true); setPresets([]); return; }
      if (!result.success) { setError(result.error || 'Failed to load presets'); return; }
      setPresets(result.presets || []);
    } catch (err) {
      setError(err.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPresets(); }, [loadPresets]);

  const handleCreate = async (data) => {
    const result = await window.api?.createVariationPreset?.(data);
    if (!result?.success) throw new Error(result?.error || 'Create failed');
    await loadPresets();
    setMode('list');
  };

  const handleUpdate = async (data) => {
    const result = await window.api?.updateVariationPreset?.(activePreset.id, data);
    if (!result?.success) throw new Error(result?.error || 'Update failed');
    await loadPresets();
    setMode('list');
    setActivePreset(null);
  };

  const handleDuplicate = async (preset) => {
    setActionError(null);
    const result = await window.api?.duplicateVariationPreset?.(preset.id, { name: `${preset.name} Copy` });
    if (!result?.success) {
      setActionError(result?.error || 'Duplicate failed');
      return;
    }
    await loadPresets();
  };

  const handleDelete = async (id) => {
    setActionError(null);
    const result = await window.api?.deleteVariationPreset?.(id);
    if (!result?.success) {
      setActionError(result?.error || 'Delete failed');
      return;
    }
    setDeleteConfirmId(null);
    await loadPresets();
  };

  if (requiresUpgrade) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75">
        <div className="w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-xl">
          <h2 className="text-lg font-semibold text-white mb-3">Content Variation Presets</h2>
          <div className="rounded-lg border border-yellow-700/50 bg-yellow-900/20 p-4 text-sm text-yellow-400">
            <p className="font-medium">Pro Feature Required</p>
            <p className="mt-1">Upgrade to Pro to create and manage content variation presets.</p>
          </div>
          <div className="mt-4 flex justify-end">
            <button onClick={onClose} className="rounded bg-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-600">
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75">
      <div className="flex h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-gray-700 bg-gray-900 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-700 px-5 py-4">
          <div className="flex items-center gap-3">
            {mode !== 'list' && (
              <button
                onClick={() => { setMode('list'); setActivePreset(null); setActionError(null); }}
                className="rounded border border-gray-600 bg-gray-800 px-2.5 py-1 text-xs text-gray-400 hover:text-gray-200"
              >
                ← Back
              </button>
            )}
            <h2 className="text-base font-semibold text-white">
              {mode === 'list' && 'Content Variation Presets'}
              {mode === 'create' && 'New Variation Preset'}
              {mode === 'edit' && `Edit: ${activePreset?.name}`}
              {mode === 'view' && `View: ${activePreset?.name}`}
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-gray-400 py-8 justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              Loading presets…
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-700/50 bg-red-900/20 p-4 text-sm text-red-400">
              {error}
              <button onClick={loadPresets} className="ml-2 underline hover:text-red-300">Retry</button>
            </div>
          )}

          {actionError && (
            <div className="rounded-lg border border-red-700/50 bg-red-900/20 p-3 mb-3 text-sm text-red-400">
              {actionError}
              <button onClick={() => setActionError(null)} className="ml-2 text-xs underline">Dismiss</button>
            </div>
          )}

          {!loading && !error && mode === 'list' && (
            <div className="flex flex-col gap-3">
              {/* Search & Filter */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search presets…"
                  className="flex-1 rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                />
                <div className="flex rounded border border-gray-700 bg-gray-800 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setFilterType('all')}
                    className={`px-2.5 py-1 rounded ${filterType === 'all' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterType('builtin')}
                    className={`px-2.5 py-1 rounded ${filterType === 'builtin' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                  >
                    Built-in
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterType('custom')}
                    className={`px-2.5 py-1 rounded ${filterType === 'custom' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                  >
                    Custom
                  </button>
                </div>
              </div>

              {/* Built-ins */}
              {(filterType === 'all' || filterType === 'builtin') && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-2">Built-in Presets</p>
                  <div className="flex flex-col gap-1.5">
                    {filteredPresets.filter(p => p.isBuiltIn).map(preset => (
                      <div
                        key={preset.id}
                        className="flex items-center justify-between rounded-lg border border-gray-700 bg-gray-800 px-3 py-2"
                      >
                        <div>
                          <span className="text-sm font-medium text-gray-200">{preset.name}</span>
                          {preset.description && (
                            <p className="text-xs text-gray-500 mt-0.5">{preset.description}</p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setActivePreset(preset); setMode('view'); }}
                            className="text-xs text-gray-400 hover:text-gray-200 border border-gray-600 rounded px-2 py-0.5"
                          >
                            View
                          </button>
                          <button
                            onClick={() => handleDuplicate(preset)}
                            className="text-xs text-blue-400 hover:text-blue-300 border border-blue-800 rounded px-2 py-0.5"
                          >
                            Duplicate
                          </button>
                        </div>
                      </div>
                    ))}
                    {filteredPresets.filter(p => p.isBuiltIn).length === 0 && (
                      <p className="text-xs text-gray-500 italic py-1">No matching built-in presets</p>
                    )}
                  </div>
                </div>
              )}

              {/* Custom */}
              {(filterType === 'all' || filterType === 'custom') && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-2">Custom Presets</p>
                  {presets.filter(p => !p.isBuiltIn).length === 0 ? (
                    <p className="text-sm text-gray-600 italic">No custom presets yet. Create one below.</p>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {filteredPresets.filter(p => !p.isBuiltIn).map(preset => (
                        <div
                          key={preset.id}
                          className="flex items-center justify-between rounded-lg border border-gray-700 bg-gray-800 px-3 py-2"
                        >
                        <div>
                          <span className="text-sm font-medium text-gray-200">{preset.name}</span>
                          {preset.description && (
                            <p className="text-xs text-gray-500 mt-0.5">{preset.description}</p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setActivePreset(preset); setMode('edit'); }}
                            className="text-xs text-blue-400 hover:text-blue-300 border border-blue-800 rounded px-2 py-0.5"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDuplicate(preset)}
                            className="text-xs text-gray-400 hover:text-gray-200 border border-gray-600 rounded px-2 py-0.5"
                          >
                            Copy
                          </button>
                          {deleteConfirmId === preset.id ? (
                            <>
                              <button
                                onClick={() => handleDelete(preset.id)}
                                className="text-xs text-red-400 hover:text-red-300 border border-red-800 rounded px-2 py-0.5"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => setDeleteConfirmId(null)}
                                className="text-xs text-gray-500 hover:text-gray-300"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => setDeleteConfirmId(preset.id)}
                              className="text-xs text-red-500 hover:text-red-400 border border-red-900/50 rounded px-2 py-0.5"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {!loading && !error && mode === 'create' && (
            <PresetForm
              preset={null}
              onSave={handleCreate}
              onCancel={() => setMode('list')}
            />
          )}

          {!loading && !error && mode === 'edit' && activePreset && (
            <PresetForm
              preset={activePreset}
              onSave={handleUpdate}
              onCancel={() => { setMode('list'); setActivePreset(null); }}
            />
          )}

          {!loading && !error && mode === 'view' && activePreset && (
            <PresetForm
              preset={activePreset}
              onSave={() => {}}
              onCancel={() => { setMode('list'); setActivePreset(null); }}
              isBuiltIn={true}
            />
          )}
        </div>

        {/* Footer — only show create button in list mode */}
        {mode === 'list' && !loading && !error && (
          <div className="flex items-center justify-between border-t border-gray-700 px-5 py-3">
            <p className="text-xs text-gray-600">
              {presets.filter(p => !p.isBuiltIn).length} custom · {presets.filter(p => p.isBuiltIn).length} built-in
            </p>
            <button
              onClick={() => { setMode('create'); setActivePreset(null); setActionError(null); }}
              className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500"
            >
              + New Preset
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
