import React, { useState, useCallback, useEffect } from 'react';
import { Save, X, RotateCcw, Copy, Eye, ChevronDown, ChevronUp } from 'lucide-react';

/**
 * WorkflowRecipeEditor — Phase 5K
 *
 * Full-featured recipe editor for creating/editing workflow recipes.
 * Uses deep-cloned drafts — cancel never mutates stored recipe.
 */

export default function WorkflowRecipeEditor({ recipe, onSave, onCancel, onReset }) {
  const [draft, setDraft] = useState(() => deepClone(recipe || getDefaultDraft()));
  const [showPreview, setShowPreview] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    setDraft(deepClone(recipe || getDefaultDraft()));
    setErrors({});
  }, [recipe]);

  const updateField = useCallback((field, value) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }, []);

  const updateOutputSetting = useCallback((field, value) => {
    setDraft((prev) => ({
      ...prev,
      outputSettings: { ...prev.outputSettings, [field]: value },
    }));
  }, []);

  const validate = useCallback(() => {
    const errs = {};
    if (!draft.name || draft.name.trim().length === 0) errs.name = 'Name is required';
    if (draft.name && draft.name.length > 100) errs.name = 'Name must be 100 characters or less';
    if (!draft.exportType) errs.exportType = 'Export type is required';
    if (!['cut', 'reel', 'split'].includes(draft.exportType)) errs.exportType = 'Invalid export type';
    if (draft.description && draft.description.length > 500) errs.description = 'Description must be 500 characters or less';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }, [draft]);

  const handleSave = useCallback(() => {
    if (!validate()) return;
    onSave(draft);
  }, [draft, validate, onSave]);

  const handleReset = useCallback(() => {
    setDraft(deepClone(recipe || getDefaultDraft()));
    setErrors({});
  }, [recipe]);

  return (
    <div className="bg-gray-900 border border-gray-700/60 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-200">
          {recipe?.id ? 'Edit Recipe' : 'New Recipe'}
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-gray-200 rounded border border-gray-700 hover:border-gray-500 transition-colors"
          >
            {showPreview ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            <Eye size={12} />
            Preview
          </button>
          <button onClick={handleReset} className="p-1 text-gray-400 hover:text-amber-400 rounded transition-colors" title="Reset">
            <RotateCcw size={14} />
          </button>
          <button onClick={onCancel} className="p-1 text-gray-400 hover:text-red-400 rounded transition-colors" title="Cancel">
            <X size={14} />
          </button>
        </div>
      </div>

      {showPreview && (
        <div className="bg-gray-800/60 border border-gray-700/40 rounded p-3 text-xs text-gray-300 space-y-1">
          <p><span className="text-gray-500">Name:</span> {draft.name || '-'}</p>
          <p><span className="text-gray-500">Type:</span> {draft.exportType || '-'}</p>
          <p><span className="text-gray-500">Mode:</span> {draft.outputSettings?.mode || '-'}</p>
          <p><span className="text-gray-500">Aspect:</span> {draft.outputSettings?.aspectRatio || '-'}</p>
          <p><span className="text-gray-500">Resolution:</span> {draft.outputSettings?.resolution || '-'}</p>
          <p><span className="text-gray-500">Profile:</span> {draft.profileSnapshot?.name || draft.profileId || 'None'}</p>
          <p><span className="text-gray-500">Text Overlays:</span> {draft.textOverlays?.length || 0}</p>
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Recipe Name *</label>
          <input
            type="text"
            value={draft.name || ''}
            onChange={(e) => updateField('name', e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:border-blue-500 focus:outline-none"
            placeholder="e.g., Instagram Reel Template"
            maxLength={100}
          />
          {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name}</p>}
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">Description</label>
          <textarea
            value={draft.description || ''}
            onChange={(e) => updateField('description', e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:border-blue-500 focus:outline-none resize-none"
            rows={2}
            maxLength={500}
            placeholder="Optional description..."
          />
          {errors.description && <p className="text-xs text-red-400 mt-1">{errors.description}</p>}
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">Export Type *</label>
          <div className="flex gap-2">
            {['cut', 'reel', 'split'].map((t) => (
              <button
                key={t}
                onClick={() => updateField('exportType', t)}
                className={`px-3 py-1.5 text-xs rounded border transition-colors capitalize ${
                  draft.exportType === t
                    ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          {errors.exportType && <p className="text-xs text-red-400 mt-1">{errors.exportType}</p>}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Mode</label>
            <select
              value={draft.outputSettings?.mode || 'blur'}
              onChange={(e) => updateOutputSetting('mode', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 focus:border-blue-500 focus:outline-none"
            >
              <option value="blur">Blur</option>
              <option value="crop">Crop</option>
              <option value="pad">Pad</option>
              <option value="smart_crop">Smart Crop</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Aspect Ratio</label>
            <select
              value={draft.outputSettings?.aspectRatio || '9:16'}
              onChange={(e) => updateOutputSetting('aspectRatio', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 focus:border-blue-500 focus:outline-none"
            >
              <option value="9:16">9:16</option>
              <option value="1:1">1:1</option>
              <option value="4:5">4:5</option>
              <option value="16:9">16:9</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Resolution</label>
            <select
              value={draft.outputSettings?.resolution || '1080p'}
              onChange={(e) => updateOutputSetting('resolution', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 focus:border-blue-500 focus:outline-none"
            >
              <option value="1080p">1080p</option>
              <option value="4k">4K</option>
            </select>
          </div>
        </div>

        {draft.exportType === 'split' && (
          <div>
            <label className="block text-xs text-gray-400 mb-1">Split Interval (seconds)</label>
            <input
              type="number"
              value={draft.outputSettings?.interval || 30}
              onChange={(e) => updateOutputSetting('interval', Math.max(1, Math.min(300, parseInt(e.target.value) || 30)))}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:border-blue-500 focus:outline-none"
              min={1}
              max={300}
            />
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-700/40">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 rounded border border-gray-700 hover:border-gray-500 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
        >
          <Save size={12} />
          {recipe?.id ? 'Update' : 'Create'}
        </button>
      </div>
    </div>
  );
}

function getDefaultDraft() {
  return {
    name: '',
    description: '',
    exportType: 'cut',
    profileId: null,
    profileSnapshot: null,
    exportPresetId: null,
    exportPresetSnapshot: null,
    variationPresetId: null,
    variationPresetSnapshot: null,
    variationOverrides: null,
    captionTemplateId: null,
    captionTemplateSnapshot: null,
    textOverlays: [],
    outputSettings: { mode: 'blur', aspectRatio: '9:16', resolution: '1080p' },
  };
}

function deepClone(obj) {
  if (obj === null || obj === undefined) return obj;
  return JSON.parse(JSON.stringify(obj));
}
