import React, { useState, useEffect } from 'react';
import {
  Globe,
  Plus,
  Edit2,
  Copy,
  Trash2,
  CheckCircle2,
  Circle,
  AlertCircle,
  RotateCcw,
  SlidersHorizontal,
  Palette,
  Volume2,
  Gauge,
  Crop,
  ShieldCheck,
  X,
  Loader2,
} from 'lucide-react';

const SUPPORTED_PLATFORMS = ['Facebook', 'Instagram', 'YouTube', 'TikTok', 'Other'];

const PLATFORM_STYLES = {
  Facebook: {
    badge: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    dot: 'bg-blue-500',
  },
  Instagram: {
    badge: 'bg-pink-500/10 text-pink-400 border-pink-500/30',
    dot: 'bg-pink-500',
  },
  YouTube: {
    badge: 'bg-red-500/10 text-red-400 border-red-500/30',
    dot: 'bg-red-500',
  },
  TikTok: {
    badge: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
    dot: 'bg-cyan-500',
  },
  Other: {
    badge: 'bg-zinc-800/60 text-zinc-400 border-zinc-700/60',
    dot: 'bg-zinc-500',
  },
};

const REFRAME_MODES = [
  { id: 'center', label: 'Center' },
  { id: 'left',   label: 'Left' },
  { id: 'right',  label: 'Right' },
  { id: 'top',    label: 'Top' },
  { id: 'bottom', label: 'Bottom' },
];

const DEFAULT_PRESET = {
  brightness: 0,
  saturation: 1,
  hue: 0,
  pitch: 0,
  speed: 1.0,
  mode: 'center',
  crop: 0,
  cleanMetadata: true,
};

export default function PageProfilesPanel() {
  const [profiles, setProfiles] = useState([]);
  const [selectedProfileId, setSelectedProfileId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal states
  const [modalMode, setModalMode] = useState(null); // 'create' | 'edit' | null
  const [activeFormData, setActiveFormData] = useState(null);
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Delete confirmation state
  const [deletingProfile, setDeletingProfile] = useState(null);

  const fetchProfiles = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await window.api.getProfiles();
      const list = res?.profiles || (Array.isArray(res) ? res : []);
      const activeId = res?.selectedProfileId || list.selectedProfileId || null;
      setProfiles(list);
      setSelectedProfileId(activeId);
    } catch (err) {
      setError(err.message || 'Failed to load page profiles');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  const handleOpenCreate = () => {
    setActiveFormData({
      name: '',
      platform: 'Facebook',
      enabled: true,
      variationPreset: { ...DEFAULT_PRESET },
    });
    setFormError(null);
    setModalMode('create');
  };

  const handleOpenEdit = (profile) => {
    setActiveFormData({
      id: profile.id,
      name: profile.name,
      platform: profile.platform || 'Other',
      enabled: profile.enabled !== undefined ? profile.enabled : true,
      variationPreset: {
        ...DEFAULT_PRESET,
        ...(profile.variationPreset || {}),
        mode: profile.variationPreset?.mode || profile.variationPreset?.reframeMode || 'center',
      },
    });
    setFormError(null);
    setModalMode('edit');
  };

  const handleCloseModal = () => {
    if (submitting) return;
    setModalMode(null);
    setActiveFormData(null);
    setFormError(null);
  };

  const handleSaveModal = async (e) => {
    e?.preventDefault();
    if (!activeFormData) return;

    const trimmedName = (activeFormData.name || '').trim();
    if (!trimmedName) {
      setFormError('Profile name cannot be empty');
      return;
    }
    if (trimmedName.length > 80) {
      setFormError('Profile name cannot exceed 80 characters');
      return;
    }

    try {
      setSubmitting(true);
      setFormError(null);

      if (modalMode === 'create') {
        const res = await window.api.createProfile({
          name: trimmedName,
          platform: activeFormData.platform,
          enabled: activeFormData.enabled,
          variationPreset: activeFormData.variationPreset,
        });
        if (res && res.success === false) {
          throw new Error(res.error || 'Failed to create profile');
        }
      } else if (modalMode === 'edit') {
        const res = await window.api.updateProfile(activeFormData.id, {
          name: trimmedName,
          platform: activeFormData.platform,
          enabled: activeFormData.enabled,
          variationPreset: activeFormData.variationPreset,
        });
        if (res && res.success === false) {
          throw new Error(res.error || 'Failed to update profile');
        }
      }

      handleCloseModal();
      await fetchProfiles();
    } catch (err) {
      setFormError(err.message || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDuplicate = async (profile) => {
    try {
      setError(null);
      const res = await window.api.duplicateProfile(profile.id);
      if (res && res.success === false) {
        throw new Error(res.error || 'Failed to duplicate profile');
      }
      await fetchProfiles();
    } catch (err) {
      setError(err.message || 'Failed to duplicate profile');
    }
  };

  const handleToggleEnabled = async (profile) => {
    try {
      const res = await window.api.updateProfile(profile.id, {
        enabled: !profile.enabled,
      });
      if (res && res.success === false) {
        throw new Error(res.error || 'Failed to update status');
      }
      await fetchProfiles();
    } catch (err) {
      setError(err.message || 'Failed to toggle status');
    }
  };

  const handleSetSelected = async (profileId) => {
    try {
      setError(null);
      // Toggle off if clicking the active one
      const targetId = selectedProfileId === profileId ? null : profileId;
      const res = await window.api.setSelectedProfile(targetId);
      if (res && res.success === false) {
        throw new Error(res.error || 'Failed to set active profile');
      }
      setSelectedProfileId(targetId);
    } catch (err) {
      setError(err.message || 'Failed to update active profile');
    }
  };

  const handleDelete = async () => {
    if (!deletingProfile) return;
    try {
      setSubmitting(true);
      const res = await window.api.deleteProfile(deletingProfile.id);
      if (res && res.success === false) {
        throw new Error(res.error || 'Failed to delete profile');
      }
      setDeletingProfile(null);
      await fetchProfiles();
    } catch (err) {
      setError(err.message || 'Failed to delete profile');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in pb-12 select-none">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-900/60 p-5 rounded-2xl border border-zinc-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-500/20 text-brand-400 flex items-center justify-center border border-brand-500/30">
              <Globe size={18} />
            </div>
            <h1 className="text-lg font-bold text-zinc-100">Page Profiles</h1>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Manage export presets and variation defaults for your pages and platform channels.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenCreate}
          className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 shadow-md transition-all active:scale-[0.98]"
        >
          <Plus size={15} />
          <span>Add Profile</span>
        </button>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-3.5 bg-red-950/40 border border-red-800/60 rounded-xl flex items-center justify-between text-xs text-red-300">
          <div className="flex items-center gap-2">
            <AlertCircle size={15} className="shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-200 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16 space-y-3">
          <Loader2 size={28} className="text-brand-400 animate-spin" />
          <p className="text-xs text-zinc-500">Loading page profiles...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && profiles.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 px-4 bg-zinc-900/40 border border-zinc-800/80 rounded-2xl text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center text-zinc-400">
            <Globe size={28} />
          </div>
          <div className="space-y-1 max-w-sm">
            <h3 className="text-sm font-semibold text-zinc-200">No Page Profiles Yet</h3>
            <p className="text-xs text-zinc-500">
              Create profiles to organize export variations for different channels and brands.
            </p>
          </div>
          <button
            type="button"
            onClick={handleOpenCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-brand-600 hover:bg-brand-500 shadow-md transition-all active:scale-[0.98]"
          >
            <Plus size={15} />
            <span>Create Your First Profile</span>
          </button>
        </div>
      )}

      {/* Profile Grid / List */}
      {!loading && profiles.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {profiles.map((profile) => {
            const isActive = profile.id === selectedProfileId;
            const style = PLATFORM_STYLES[profile.platform] || PLATFORM_STYLES.Other;
            const p = profile.variationPreset || DEFAULT_PRESET;

            return (
              <div
                key={profile.id}
                className={`relative flex flex-col justify-between p-5 rounded-2xl border transition-all ${
                  isActive
                    ? 'bg-zinc-900 border-brand-500/80 shadow-lg glow-brand ring-1 ring-brand-500/30'
                    : 'bg-zinc-900/80 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                {/* Header row: Platform Badge, Active badge & Status */}
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${style.badge}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                        {profile.platform || 'Other'}
                      </span>

                      {isActive && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-brand-500/20 text-brand-300 border border-brand-500/40">
                          <CheckCircle2 size={11} className="text-brand-400" />
                          ACTIVE
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleEnabled(profile)}
                      className={`text-[11px] font-medium px-2 py-0.5 rounded border transition-colors ${
                        profile.enabled
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                          : 'bg-zinc-800 text-zinc-500 border-zinc-700 hover:text-zinc-300'
                      }`}
                      title="Click to toggle profile enabled status"
                    >
                      {profile.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>

                  {/* Profile Name */}
                  <h3 className="text-base font-bold text-zinc-100 truncate mb-2" title={profile.name}>
                    {profile.name}
                  </h3>

                  {/* Variation Summary Chips */}
                  <div className="bg-zinc-950/60 rounded-xl p-3 border border-zinc-800/80 space-y-1.5 text-[11px] text-zinc-400">
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      <span>
                        Speed: <strong className="text-zinc-300 font-mono">{Number(p.speed || 1).toFixed(2)}x</strong>
                      </span>
                      <span>
                        Pitch: <strong className="text-zinc-300 font-mono">{Number(p.pitch || 0) > 0 ? `+${p.pitch}%` : `${p.pitch || 0}%`}</strong>
                      </span>
                      <span>
                        Crop: <strong className="text-zinc-300 font-mono">{p.crop || 0}%</strong> ({p.mode || 'center'})
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      <span>
                        Brightness: <strong className="text-zinc-300 font-mono">{Number(p.brightness || 0) > 0 ? `+${p.brightness}` : p.brightness || 0}</strong>
                      </span>
                      <span>
                        Sat: <strong className="text-zinc-300 font-mono">{Number(p.saturation !== undefined ? p.saturation : 1).toFixed(2)}</strong>
                      </span>
                      <span>
                        Hue: <strong className="text-zinc-300 font-mono">{p.hue || 0}°</strong>
                      </span>
                      <span>
                        Meta: <strong className="text-zinc-300">{p.cleanMetadata !== false ? 'Clean' : 'Preserve'}</strong>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Action Footer */}
                <div className="flex items-center justify-between pt-4 mt-4 border-t border-zinc-800/80">
                  <button
                    type="button"
                    onClick={() => handleSetSelected(profile.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      isActive
                        ? 'bg-brand-600/20 text-brand-300 border border-brand-500/40 hover:bg-brand-600/30'
                        : 'bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700 border border-zinc-700'
                    }`}
                  >
                    {isActive ? (
                      <>
                        <CheckCircle2 size={13} className="text-brand-400" />
                        <span>Active Preset</span>
                      </>
                    ) : (
                      <>
                        <Circle size={13} className="text-zinc-500" />
                        <span>Set Active</span>
                      </>
                    )}
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(profile)}
                      className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
                      title="Edit Profile"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDuplicate(profile)}
                      className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
                      title="Duplicate Profile"
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingProfile(profile)}
                      className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                      title="Delete Profile"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Modal */}
      {modalMode && activeFormData && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl animate-fade-in my-8">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h2 className="text-base font-bold text-zinc-100">
                {modalMode === 'create' ? 'Create Page Profile' : 'Edit Page Profile'}
              </h2>
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={submitting}
                className="text-zinc-400 hover:text-zinc-200 transition-colors p-1"
              >
                <X size={16} />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-red-950/50 border border-red-800/60 rounded-xl flex items-center gap-2 text-xs text-red-300">
                <AlertCircle size={15} className="shrink-0 text-red-400" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveModal} className="space-y-4">
              {/* Profile Name */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-300">
                    Profile Name <span className="text-red-400">*</span>
                  </label>
                  <span className="text-[11px] font-mono text-zinc-500">
                    {(activeFormData.name || '').length} / 80
                  </span>
                </div>
                <input
                  type="text"
                  required
                  maxLength={80}
                  placeholder="e.g. Facebook Reels - Brand A"
                  value={activeFormData.name}
                  onChange={(e) =>
                    setActiveFormData((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-brand-500 transition-colors"
                />
              </div>

              {/* Platform & Enabled row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-300">Platform</label>
                  <select
                    value={activeFormData.platform}
                    onChange={(e) =>
                      setActiveFormData((prev) => ({ ...prev, platform: e.target.value }))
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-brand-500 transition-colors cursor-pointer"
                  >
                    {SUPPORTED_PLATFORMS.map((plat) => (
                      <option key={plat} value={plat}>
                        {plat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-300">Status</label>
                  <label className="flex items-center gap-2.5 h-[38px] px-3 bg-zinc-950 border border-zinc-800 rounded-xl cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={activeFormData.enabled}
                      onChange={(e) =>
                        setActiveFormData((prev) => ({ ...prev, enabled: e.target.checked }))
                      }
                      className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-brand-600 focus:ring-brand-500 cursor-pointer"
                    />
                    <span className="text-xs text-zinc-300">Enabled</span>
                  </label>
                </div>
              </div>

              {/* Content Variation Preset Controls */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-200">
                    <SlidersHorizontal size={14} className="text-brand-400" />
                    <span>Variation Preset Settings</span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setActiveFormData((prev) => ({
                        ...prev,
                        variationPreset: { ...DEFAULT_PRESET },
                      }))
                    }
                    className="px-2 py-0.5 text-[10px] font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 rounded border border-zinc-700 flex items-center gap-1 transition-colors"
                    title="Reset to defaults"
                  >
                    <RotateCcw size={10} /> Reset
                  </button>
                </div>

                {/* Color Controls */}
                <div className="bg-zinc-950/60 rounded-xl p-3 border border-zinc-800/60 space-y-2.5">
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-zinc-300">
                    <Palette size={12} className="text-brand-400" /> Color
                  </div>

                  {/* Brightness */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-zinc-400">Brightness (-1.0 to 1.0)</span>
                      <span className="font-mono text-zinc-300">
                        {Number(activeFormData.variationPreset?.brightness || 0) > 0
                          ? `+${Number(activeFormData.variationPreset?.brightness || 0).toFixed(2)}`
                          : Number(activeFormData.variationPreset?.brightness || 0).toFixed(2)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-1"
                      max="1"
                      step="0.05"
                      value={activeFormData.variationPreset?.brightness ?? 0}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setActiveFormData((prev) => ({
                          ...prev,
                          variationPreset: { ...prev.variationPreset, brightness: val },
                        }));
                      }}
                      className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-brand-500"
                    />
                  </div>

                  {/* Saturation */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-zinc-400">Saturation (0.0 to 3.0)</span>
                      <span className="font-mono text-zinc-300">
                        {Number(activeFormData.variationPreset?.saturation ?? 1).toFixed(2)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="3"
                      step="0.05"
                      value={activeFormData.variationPreset?.saturation ?? 1}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setActiveFormData((prev) => ({
                          ...prev,
                          variationPreset: { ...prev.variationPreset, saturation: val },
                        }));
                      }}
                      className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-brand-500"
                    />
                  </div>

                  {/* Hue */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-zinc-400">Hue (-180° to 180°)</span>
                      <span className="font-mono text-zinc-300">
                        {Math.round(activeFormData.variationPreset?.hue ?? 0)}°
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-180"
                      max="180"
                      step="1"
                      value={activeFormData.variationPreset?.hue ?? 0}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setActiveFormData((prev) => ({
                          ...prev,
                          variationPreset: { ...prev.variationPreset, hue: val },
                        }));
                      }}
                      className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-brand-500"
                    />
                  </div>
                </div>

                {/* Audio & Speed Controls */}
                <div className="bg-zinc-950/60 rounded-xl p-3 border border-zinc-800/60 space-y-2.5">
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-zinc-300">
                    <Volume2 size={12} className="text-brand-400" /> Audio & Speed
                  </div>

                  {/* Pitch */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-zinc-400">Pitch (-3.0% to +3.0%)</span>
                      <span className="font-mono text-zinc-300">
                        {Number(activeFormData.variationPreset?.pitch || 0) > 0
                          ? `+${Number(activeFormData.variationPreset?.pitch || 0).toFixed(1)}%`
                          : `${Number(activeFormData.variationPreset?.pitch || 0).toFixed(1)}%`}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-3"
                      max="3"
                      step="0.5"
                      value={activeFormData.variationPreset?.pitch ?? 0}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setActiveFormData((prev) => ({
                          ...prev,
                          variationPreset: { ...prev.variationPreset, pitch: val },
                        }));
                      }}
                      className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-brand-500"
                    />
                  </div>

                  {/* Speed */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-zinc-400 flex items-center gap-1">
                        <Gauge size={10} /> Speed (1.00x to 1.05x)
                      </span>
                      <span className="font-mono text-zinc-300">
                        {Number(activeFormData.variationPreset?.speed ?? 1).toFixed(2)}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min="1.00"
                      max="1.05"
                      step="0.01"
                      value={activeFormData.variationPreset?.speed ?? 1}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setActiveFormData((prev) => ({
                          ...prev,
                          variationPreset: { ...prev.variationPreset, speed: val },
                        }));
                      }}
                      className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-brand-500"
                    />
                  </div>
                </div>

                {/* Reframe & Micro-Crop */}
                <div className="bg-zinc-950/60 rounded-xl p-3 border border-zinc-800/60 space-y-2.5">
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-zinc-300">
                    <Crop size={12} className="text-brand-400" /> Reframe / Micro-Crop
                  </div>

                  <div className="space-y-1">
                    <span className="text-[11px] text-zinc-400">Alignment Mode</span>
                    <div className="grid grid-cols-5 gap-1">
                      {REFRAME_MODES.map((m) => {
                        const isSel = (activeFormData.variationPreset?.mode || 'center') === m.id;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() =>
                              setActiveFormData((prev) => ({
                                ...prev,
                                variationPreset: { ...prev.variationPreset, mode: m.id },
                              }))
                            }
                            className={`py-1 text-[11px] rounded font-medium border transition-colors ${
                              isSel
                                ? 'bg-brand-600/30 border-brand-500 text-brand-300'
                                : 'bg-zinc-800/60 border-zinc-700/60 text-zinc-400 hover:text-zinc-200'
                            }`}
                          >
                            {m.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-zinc-400">Micro-Crop (0% to 2%)</span>
                      <span className="font-mono text-zinc-300">
                        {Number(activeFormData.variationPreset?.crop ?? 0).toFixed(1)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="0.2"
                      value={activeFormData.variationPreset?.crop ?? 0}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setActiveFormData((prev) => ({
                          ...prev,
                          variationPreset: { ...prev.variationPreset, crop: val },
                        }));
                      }}
                      className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-brand-500"
                    />
                  </div>
                </div>

                {/* Clean Metadata */}
                <div className="bg-zinc-950/60 rounded-xl p-3 border border-zinc-800/60">
                  <label className="flex items-center justify-between cursor-pointer select-none">
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck size={14} className="text-brand-400" />
                      <div>
                        <span className="text-xs font-semibold text-zinc-200">Clean Metadata</span>
                        <p className="text-[10px] text-zinc-500">
                          Strip nonessential container tags on export
                        </p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={activeFormData.variationPreset?.cleanMetadata ?? true}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setActiveFormData((prev) => ({
                          ...prev,
                          variationPreset: { ...prev.variationPreset, cleanMetadata: checked },
                        }));
                      }}
                      className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-brand-600 focus:ring-brand-500 cursor-pointer"
                    />
                  </label>
                </div>
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-700/60 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-brand-600 hover:bg-brand-500 disabled:opacity-50 shadow-md transition-all active:scale-[0.98]"
                >
                  {submitting && <Loader2 size={13} className="animate-spin" />}
                  <span>{modalMode === 'create' ? 'Create Profile' : 'Save Changes'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingProfile && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl animate-fade-in text-center">
            <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 flex items-center justify-center mx-auto">
              <Trash2 size={22} />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-bold text-zinc-100">Delete Profile?</h3>
              <p className="text-xs text-zinc-400">
                Are you sure you want to delete profile{' '}
                <span className="text-zinc-200 font-semibold">"{deletingProfile.name}"</span>? This action cannot be undone.
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingProfile(null)}
                disabled={submitting}
                className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-700/60 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={submitting}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-red-600 hover:bg-red-500 transition-colors shadow-md"
              >
                {submitting && <Loader2 size={13} className="animate-spin" />}
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
