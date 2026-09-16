import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Calendar,
  Clock,
  X,
  FolderOpen,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Film,
  Scissors,
  SplitSquareHorizontal,
  ShieldCheck,
  Layers,
  ChevronRight,
} from 'lucide-react';

function formatScheduleDateTime(isoString) {
  if (!isoString) return 'Unspecified';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
  } catch {
    return isoString;
  }
}

export default function BulkScheduleModal({ recipe, onClose, onCreated }) {
  const [profiles, setProfiles] = useState([]);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [sourcePath, setSourcePath] = useState('');
  const [selectedProfileIds, setSelectedProfileIds] = useState([]);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [gapMinutes, setGapMinutes] = useState(15);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Load profiles on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingProfiles(true);
        const res = await window.api.getProfiles();
        const list = res?.profiles || (Array.isArray(res) ? res : []);
        const enabled = list.filter(p => p.enabled !== false);
        if (!cancelled) {
          setProfiles(enabled);
          // Auto-select all enabled profiles
          setSelectedProfileIds(enabled.map(p => p.id));
        }
      } catch (_) {
        if (!cancelled) setProfiles([]);
      } finally {
        if (!cancelled) setLoadingProfiles(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Set default date/time: 5 minutes from now
  useEffect(() => {
    const future = new Date(Date.now() + 5 * 60 * 1000);
    setDate(future.toISOString().split('T')[0]);
    const hours = String(future.getHours()).padStart(2, '0');
    const mins = String(future.getMinutes()).padStart(2, '0');
    setTime(`${hours}:${mins}`);
  }, []);

  const handlePickSource = async () => {
    const file = await window.api.selectFile();
    if (file) setSourcePath(file);
  };

  const toggleProfile = (id) => {
    setSelectedProfileIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectAllProfiles = () => {
    setSelectedProfileIds(profiles.map(p => p.id));
  };

  const deselectAllProfiles = () => {
    setSelectedProfileIds([]);
  };

  // Preview: compute scheduled times per profile
  const preview = useMemo(() => {
    if (!date || !time || selectedProfileIds.length === 0) return [];
    const baseTime = new Date(`${date}T${time}`);
    if (isNaN(baseTime.getTime())) return [];

    return selectedProfileIds.map((pid, i) => {
      const profile = profiles.find(p => p.id === pid);
      const scheduledAt = new Date(baseTime.getTime() + i * gapMinutes * 60 * 1000);
      return {
        profileId: pid,
        profileName: profile?.name || 'Unknown',
        platform: profile?.platform || 'Other',
        scheduledAt: scheduledAt.toISOString(),
        scheduledLabel: formatScheduleDateTime(scheduledAt.toISOString()),
      };
    });
  }, [date, time, gapMinutes, selectedProfileIds, profiles]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!sourcePath) {
      setError('Please select a source video file.');
      return;
    }
    if (selectedProfileIds.length === 0) {
      setError('Please select at least one profile.');
      return;
    }
    if (!date || !time) {
      setError('Please set both a start date and time.');
      return;
    }

    const startAt = new Date(`${date}T${time}`);
    if (isNaN(startAt.getTime())) {
      setError('Invalid date or time selected.');
      return;
    }

    setSubmitting(true);
    try {
      const input = {
        recipeId: recipe.id,
        profileIds: selectedProfileIds,
        sourcePath,
        startAt: startAt.toISOString(),
        gapMinutes: Number(gapMinutes) || 15,
      };
      const res = await window.api.createRecipeBulkSchedule(input);
      if (res && res.success) {
        setSuccess(`Successfully created ${res.result?.count || selectedProfileIds.length} scheduled exports.`);
        setTimeout(() => {
          onCreated?.();
          onClose();
        }, 1500);
      } else {
        setError(res?.error || 'Failed to create bulk schedule.');
      }
    } catch (err) {
      setError(err.message || 'An error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  const exportTypeLabel = { cut: 'Cut Clip', reel: 'Make Reel', split: 'Split Segments' };
  const exportTypeIcon = { cut: Scissors, reel: Film, split: SplitSquareHorizontal };

  const ExportIcon = exportTypeIcon[recipe.exportType] || Film;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Layers size={18} className="text-orange-400" />
            <h2 className="text-sm font-bold text-zinc-100">Bulk Schedule from Recipe</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-100 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-300">
              <AlertCircle size={14} className="text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/30 rounded-xl text-xs text-green-300">
              <CheckCircle2 size={14} className="text-green-400 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {/* Recipe Snapshot Banner */}
          <div className="p-3 bg-zinc-950/80 border border-zinc-800/80 rounded-xl space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-300">
              <ShieldCheck size={14} className="text-orange-400" />
              Recipe Snapshot — {recipe.name}
            </div>
            <div className="flex items-center gap-3 text-[11px] text-zinc-400">
              <span className="flex items-center gap-1">
                <ExportIcon size={12} className="text-zinc-500" />
                {exportTypeLabel[recipe.exportType] || recipe.exportType}
              </span>
              {recipe.outputSettings?.mode && (
                <span>Mode: {recipe.outputSettings.mode}</span>
              )}
              {recipe.outputSettings?.aspectRatio && (
                <span>Ratio: {recipe.outputSettings.aspectRatio}</span>
              )}
              {recipe.outputSettings?.resolution && (
                <span>Res: {recipe.outputSettings.resolution}</span>
              )}
            </div>
            <p className="text-[10px] text-zinc-600">
              This recipe configuration will be snapshotted and applied independently to each scheduled export.
            </p>
          </div>

          {/* 1. Source Video */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-300">Source Video File</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={sourcePath}
                readOnly
                placeholder="Select video file…"
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-300 font-mono focus:outline-none"
              />
              <button
                type="button"
                onClick={handlePickSource}
                className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg border border-zinc-700 text-xs font-medium transition-colors flex items-center gap-1.5"
              >
                <FolderOpen size={13} />
                Browse
              </button>
            </div>
          </div>

          {/* 2. Profile Selection (multi-select) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-300">
                Page Profiles
                {selectedProfileIds.length > 0 && (
                  <span className="ml-1.5 text-[10px] text-zinc-500 font-normal">
                    ({selectedProfileIds.length} selected)
                  </span>
                )}
              </label>
              <div className="flex gap-1">
                <button type="button" onClick={selectAllProfiles} className="text-[10px] text-brand-400 hover:text-brand-300">
                  Select All
                </button>
                <span className="text-zinc-700">|</span>
                <button type="button" onClick={deselectAllProfiles} className="text-[10px] text-zinc-500 hover:text-zinc-300">
                  Deselect All
                </button>
              </div>
            </div>
            {loadingProfiles ? (
              <div className="flex items-center gap-2 p-3 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-500">
                <Loader2 size={13} className="animate-spin" />
                Loading profiles…
              </div>
            ) : profiles.length === 0 ? (
              <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-500">
                No enabled profiles found. Create profiles first.
              </div>
            ) : (
              <div className="max-h-36 overflow-y-auto bg-zinc-950 border border-zinc-800 rounded-lg divide-y divide-zinc-800/60">
                {profiles.map(profile => (
                  <label
                    key={profile.id}
                    className="flex items-center gap-2.5 px-3 py-2 hover:bg-zinc-800/40 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedProfileIds.includes(profile.id)}
                      onChange={() => toggleProfile(profile.id)}
                      className="w-3.5 h-3.5 rounded border-zinc-700 bg-zinc-950 text-brand-500 focus:ring-brand-500 focus:ring-offset-0"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-zinc-200 font-medium">{profile.name}</span>
                      <span className="ml-1.5 text-[10px] text-zinc-500">({profile.platform || 'Other'})</span>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* 3. Start Date & Time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-300">Start Date</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-brand-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-300">Start Time</label>
              <input
                type="time"
                value={time}
                onChange={e => setTime(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>

          {/* 4. Gap Between Schedules */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-300">
              Gap Between Schedules
              <span className="ml-1.5 text-[10px] text-zinc-500 font-normal">(minutes)</span>
            </label>
            <input
              type="number"
              min={1}
              max={1440}
              value={gapMinutes}
              onChange={e => setGapMinutes(Number(e.target.value) || 15)}
              className="w-24 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-brand-500"
            />
            <p className="text-[10px] text-zinc-600">
              Each profile will be scheduled {gapMinutes} minute{gapMinutes !== 1 ? 's' : ''} apart.
            </p>
          </div>

          {/* 5. Preview */}
          {preview.length > 0 && (
            <div className="p-3.5 bg-zinc-950/80 border border-zinc-800/80 rounded-xl space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-300">
                <Clock size={14} className="text-orange-400" />
                Schedule Preview ({preview.length} exports)
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {preview.map((item, i) => (
                  <div key={item.profileId} className="flex items-center gap-2 text-[11px] text-zinc-400">
                    <span className="text-zinc-600 w-4 text-right">{i + 1}.</span>
                    <ChevronRight size={10} className="text-zinc-600" />
                    <span className="text-zinc-200 font-medium">{item.profileName}</span>
                    <span className="text-zinc-600">({item.platform})</span>
                    <span className="text-zinc-600 mx-1">→</span>
                    <span className="text-zinc-300">{item.scheduledLabel}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Modal Footer */}
          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || selectedProfileIds.length === 0}
              className="flex items-center gap-2 px-5 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-all shadow-lg shadow-orange-900/30"
            >
              {submitting ? (
                <><Loader2 size={13} className="animate-spin" /> Creating…</>
              ) : (
                <><Layers size={13} /> Create {selectedProfileIds.length} Schedule{selectedProfileIds.length !== 1 ? 's' : ''}</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
