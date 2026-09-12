import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Calendar,
  Clock,
  Plus,
  Trash2,
  XCircle,
  Play,
  Pause,
  FolderOpen,
  CheckCircle2,
  AlertCircle,
  Loader2,
  SlidersHorizontal,
  Film,
  Scissors,
  SplitSquareHorizontal,
  ShieldCheck,
  X,
  Search,
  ArrowUpDown,
  Info,
  Pencil,
} from 'lucide-react';
import ProgressBar from './ProgressBar';

const STATUS_TABS = ['ALL', 'SCHEDULED', 'PAUSED', 'READY', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'];

const STATUS_BADGES = {
  SCHEDULED: { bg: 'bg-amber-500/10 text-amber-400 border-amber-500/30', label: 'Scheduled' },
  READY:     { bg: 'bg-blue-500/10 text-blue-400 border-blue-500/30',    label: 'Ready' },
  PROCESSING:{ bg: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30', label: 'Processing' },
  COMPLETED: { bg: 'bg-green-500/10 text-green-400 border-green-500/30', label: 'Completed' },
  FAILED:    { bg: 'bg-red-500/10 text-red-400 border-red-500/30',       label: 'Failed' },
  CANCELLED: { bg: 'bg-zinc-800 text-zinc-400 border-zinc-700',           label: 'Cancelled' },
  PAUSED:    { bg: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30', label: 'Paused' },
};

const PLATFORM_STYLES = {
  Facebook:  'bg-blue-500/10 text-blue-400 border-blue-500/30',
  Instagram: 'bg-pink-500/10 text-pink-400 border-pink-500/30',
  YouTube:   'bg-red-500/10 text-red-400 border-red-500/30',
  TikTok:    'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
  Other:     'bg-zinc-800 text-zinc-400 border-zinc-700',
};

const SORT_OPTIONS = [
  { value: 'newest',     label: 'Newest First' },
  { value: 'oldest',     label: 'Oldest First' },
  { value: 'soonest',    label: 'Scheduled Soonest' },
  { value: 'latest',     label: 'Scheduled Latest' },
];

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

function toLocalInputDate(isoString) {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    const yr  = d.getFullYear();
    const mo  = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${yr}-${mo}-${day}`;
  } catch { return ''; }
}

function toLocalInputTime(isoString) {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  } catch { return ''; }
}

// ─── Confirmation Dialog ──────────────────────────────────────────────────────
function ConfirmDialog({ title, message, confirmLabel = 'Confirm', confirmClass = 'bg-red-600 hover:bg-red-500', onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-zinc-100">{title}</h3>
        <p className="text-xs text-zinc-400 leading-relaxed">{message}</p>
        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-semibold transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-white rounded-lg text-xs font-semibold transition-all ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Detail View Modal ────────────────────────────────────────────────────────
function DetailModal({ schedule, onClose }) {
  if (!schedule) return null;
  const badge = STATUS_BADGES[schedule.status] || STATUS_BADGES.SCHEDULED;
  const platformClass = PLATFORM_STYLES[schedule.profileSnapshot?.platform] || PLATFORM_STYLES.Other;

  const rows = [
    ['Profile',        schedule.profileSnapshot?.name || '—'],
    ['Platform',       schedule.profileSnapshot?.platform || '—'],
    ['Profile ID',     schedule.profileSnapshot?.id || '—'],
    ['Export Type',    schedule.exportType?.toUpperCase() || '—'],
    ['Status',         schedule.status],
    ['Source File',    schedule.sourcePath?.split(/[/\\]/).pop() || '—'],
    ['Source Path',    schedule.sourcePath || '—'],
    ['Output Path',    schedule.outputPath || '—'],
    ['Scheduled At',   formatScheduleDateTime(schedule.scheduledAt)],
    ['Created At',     formatScheduleDateTime(schedule.createdAt)],
    ['Updated At',     formatScheduleDateTime(schedule.updatedAt)],
    ['Started At',     formatScheduleDateTime(schedule.startedAt) || '—'],
    ['Finished At',    formatScheduleDateTime(schedule.finishedAt) || '—'],
    ['Plan ID',        schedule.planId || '—'],
    ['Job ID',         schedule.jobId || '—'],
    ['Schedule ID',    schedule.id],
  ];

  const vp = schedule.variationPreset;
  const variationRows = vp && vp.enabled ? [
    ['Variation',   'Enabled'],
    ['Speed',       `${vp.speed ?? 1.0}x`],
    ['Pitch',       `${vp.pitch ?? 0}`],
    ['Saturation',  `${vp.saturation ?? 1.0}x`],
    ['Brightness',  `${vp.brightness ?? 1.0}x`],
    ['Contrast',    `${vp.contrast ?? 1.0}x`],
    ['Crop Jitter', `${vp.cropJitter ?? 0}`],
    ['Reframe',     vp.reframeMode || '—'],
    ['Flip H',      vp.flipHorizontal ? 'Yes' : 'No'],
    ['Clean Meta',  vp.cleanMetadata  ? 'Yes' : 'No'],
  ] : [['Variation', 'Disabled (Clean Metadata)']];

  const eo = schedule.exportOptions || {};
  const exportRows = [
    ['Start',      eo.start !== undefined ? `${eo.start}s` : '—'],
    ['Duration',   eo.duration !== null && eo.duration !== undefined ? `${eo.duration}s` : 'Full'],
    ['Aspect Ratio', eo.aspectRatio || '—'],
    ['Mode',       eo.mode || '—'],
    ['Interval',   eo.interval !== undefined ? `${eo.interval}s` : '—'],
    ['Thumbnail',  eo.generateThumbnail ? 'Yes' : 'No'],
    ['Thumb Title',eo.thumbnailTitle || '—'],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <Info size={17} className="text-brand-400 shrink-0" />
            <span className="text-sm font-bold text-zinc-100 truncate">
              Schedule Detail — {schedule.profileSnapshot?.name || 'Default'}
            </span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${badge.bg}`}>
              {badge.label}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-100 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Core Info */}
          <section>
            <h4 className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Core Info</h4>
            <div className="space-y-1">
              {rows.map(([label, value]) => (
                <div key={label} className="flex gap-2 text-xs">
                  <span className="text-zinc-500 shrink-0 w-28">{label}</span>
                  <span className="text-zinc-200 font-mono break-all">{String(value)}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Variation Summary */}
          <section>
            <h4 className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Variation Preset</h4>
            <div className="space-y-1">
              {variationRows.map(([label, value]) => (
                <div key={label} className="flex gap-2 text-xs">
                  <span className="text-zinc-500 shrink-0 w-28">{label}</span>
                  <span className="text-zinc-200">{String(value)}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Export Details */}
          <section>
            <h4 className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Export Options</h4>
            <div className="space-y-1">
              {exportRows.map(([label, value]) => (
                <div key={label} className="flex gap-2 text-xs">
                  <span className="text-zinc-500 shrink-0 w-28">{label}</span>
                  <span className="text-zinc-200">{String(value)}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Error / Result */}
          {schedule.error && (
            <section>
              <h4 className="text-[11px] font-bold text-red-500 uppercase tracking-widest mb-2">Error</h4>
              <p className="text-xs text-red-300 font-mono bg-red-500/5 border border-red-500/20 rounded-lg p-2.5">
                {schedule.error}
              </p>
            </section>
          )}
        </div>

        <div className="p-4 border-t border-zinc-800 shrink-0 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Time Modal ──────────────────────────────────────────────────────────
function EditModal({ schedule, onSave, onCancel }) {
  const [date, setDate] = useState(toLocalInputDate(schedule.scheduledAt));
  const [time, setTime] = useState(toLocalInputTime(schedule.scheduledAt));
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);

  const handleSave = async (e) => {
    e.preventDefault();
    setErr(null);
    if (!date || !time) { setErr('Please set both date and time.'); return; }
    const parsed = new Date(`${date}T${time}`);
    if (isNaN(parsed.getTime())) { setErr('Invalid date or time.'); return; }
    setSubmitting(true);
    try {
      await onSave(parsed.toISOString());
    } catch (ex) {
      setErr(ex.message || 'Save failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Pencil size={16} className="text-brand-400" />
            <h2 className="text-sm font-bold text-zinc-100">Edit Scheduled Time</h2>
          </div>
          <button onClick={onCancel} className="p-1 text-zinc-400 hover:text-zinc-100 rounded-lg hover:bg-zinc-800 transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-5 space-y-4">
          {err && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-300">
              <AlertCircle size={14} className="text-red-400 shrink-0" />
              <span>{err}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-300">New Date</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-brand-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-300">New Time</label>
              <input
                type="time"
                value={time}
                onChange={e => setTime(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>

          <div className="p-3 bg-zinc-950/60 border border-zinc-800/60 rounded-xl text-xs text-zinc-400">
            <span className="text-zinc-500">Current: </span>
            <span className="text-zinc-300">{formatScheduleDateTime(schedule.scheduledAt)}</span>
            {date && time && (
              <>
                <br />
                <span className="text-zinc-500">New: </span>
                <span className="text-zinc-200 font-medium">
                  {formatScheduleDateTime(`${date}T${time}`)}
                </span>
              </>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-5 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-all"
            >
              {submitting ? <Loader2 size={13} className="animate-spin" /> : <Pencil size={13} />}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main SchedulePanel ───────────────────────────────────────────────────────
export default function SchedulePanel({ defaultVideoPath, defaultExportType = 'cut', defaultOptions = {} }) {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ALL');
  const [error, setError] = useState(null);
  const [liveProgress, setLiveProgress] = useState({});

  // Search & Sort
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState('newest');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [detailSchedule, setDetailSchedule] = useState(null);
  const [editSchedule, setEditSchedule] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null); // { title, message, confirmLabel, confirmClass, onConfirm }

  // Create form
  const [profiles, setProfiles] = useState([]);
  const [formData, setFormData] = useState({
    sourcePath: defaultVideoPath || '',
    exportType: defaultExportType || 'cut',
    profileId: '',
    date: '',
    time: '',
    mode: defaultOptions.mode || 'blur',
    start: defaultOptions.start || 0,
    duration: defaultOptions.duration || '',
    interval: defaultOptions.interval || 30,
  });
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState(null);

  // ── Data Fetching ────────────────────────────────────────────────────────────
  const fetchSchedules = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await window.api.getSchedules();
      if (res && Array.isArray(res.schedules)) setSchedules(res.schedules);
      else if (Array.isArray(res)) setSchedules(res);
    } catch (err) {
      setError(err.message || 'Failed to load schedules');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchProfiles = useCallback(async () => {
    try {
      const res = await window.api.getProfiles();
      const list = res?.profiles || (Array.isArray(res) ? res : []);
      const enabled = list.filter(p => p.enabled !== false);
      setProfiles(enabled);
      if (enabled.length > 0 && !formData.profileId) {
        setFormData(prev => ({ ...prev, profileId: enabled[0].id }));
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    fetchSchedules();
    fetchProfiles();

    const handleUpdate = (updatedSchedule) => {
      if (!updatedSchedule || !updatedSchedule.id) return;
      setSchedules(prev => {
        const idx = prev.findIndex(s => s.id === updatedSchedule.id);
        if (idx === -1) return [updatedSchedule, ...prev];
        const next = [...prev];
        next[idx] = updatedSchedule;
        return next;
      });
    };

    const handleProgress = ({ id, progress }) => {
      setLiveProgress(prev => ({ ...prev, [id]: progress }));
    };

    window.api.onScheduleUpdate?.(handleUpdate);
    window.api.onScheduleProgress?.(handleProgress);

    return () => {
      window.api.off?.('schedule:update');
      window.api.off?.('schedule:progress');
    };
  }, []);

  useEffect(() => {
    if (defaultVideoPath && !formData.sourcePath) {
      setFormData(prev => ({ ...prev, sourcePath: defaultVideoPath }));
    }
  }, [defaultVideoPath]);

  // ── Search + Sort + Filter ───────────────────────────────────────────────────
  const filteredSchedules = useMemo(() => {
    let list = activeTab === 'ALL' ? schedules : schedules.filter(s => s.status === activeTab);

    // Search
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(s => {
        const profileName  = (s.profileSnapshot?.name || '').toLowerCase();
        const platform     = (s.profileSnapshot?.platform || '').toLowerCase();
        const sourceFile   = (s.sourcePath || '').toLowerCase();
        const exportType   = (s.exportType || '').toLowerCase();
        return (
          profileName.includes(q) ||
          platform.includes(q) ||
          sourceFile.includes(q) ||
          exportType.includes(q)
        );
      });
    }

    // Sort
    const sorted = [...list];
    if (sortOrder === 'newest') {
      sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } else if (sortOrder === 'oldest') {
      sorted.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    } else if (sortOrder === 'soonest') {
      sorted.sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
    } else if (sortOrder === 'latest') {
      sorted.sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt));
    }
    return sorted;
  }, [schedules, activeTab, searchQuery, sortOrder]);

  const tabCounts = useMemo(() => {
    const counts = { ALL: schedules.length };
    for (const tab of STATUS_TABS) {
      if (tab !== 'ALL') counts[tab] = schedules.filter(s => s.status === tab).length;
    }
    return counts;
  }, [schedules]);

  // ── Action Handlers ──────────────────────────────────────────────────────────
  const handlePickSource = async () => {
    const file = await window.api.selectFile();
    if (file) setFormData(prev => ({ ...prev, sourcePath: file }));
  };

  const handleOpenCreate = () => {
    const future = new Date(Date.now() + 5 * 60 * 1000);
    const dateStr = future.toISOString().split('T')[0];
    const hours = String(future.getHours()).padStart(2, '0');
    const mins = String(future.getMinutes()).padStart(2, '0');
    setFormData(prev => ({
      ...prev,
      date: dateStr,
      time: `${hours}:${mins}`,
      sourcePath: prev.sourcePath || defaultVideoPath || '',
    }));
    setCreateError(null);
    setShowCreateModal(true);
    fetchProfiles();
  };

  const handleCreateSchedule = async (e) => {
    e.preventDefault();
    setCreateError(null);
    if (!formData.sourcePath) { setCreateError('Please select a source video file.'); return; }
    if (!formData.date || !formData.time) { setCreateError('Please select both a scheduled date and time.'); return; }
    const scheduledDate = new Date(`${formData.date}T${formData.time}`);
    if (isNaN(scheduledDate.getTime())) { setCreateError('Invalid date or time selected.'); return; }

    const selectedProfile = profiles.find(p => p.id === formData.profileId) || {
      id: null, name: 'Default', platform: 'Other', variationPreset: null,
    };
    setCreateSubmitting(true);
    try {
      const payload = {
        sourcePath: formData.sourcePath,
        exportType: formData.exportType,
        scheduledAt: scheduledDate.toISOString(),
        profileSnapshot: {
          id: selectedProfile.id,
          name: selectedProfile.name,
          platform: selectedProfile.platform,
        },
        variationPreset: selectedProfile.variationPreset || { enabled: false },
        exportOptions: {
          mode: formData.mode,
          start: Number(formData.start) || 0,
          duration: formData.duration ? Number(formData.duration) : undefined,
          interval: Number(formData.interval) || 30,
        },
      };
      const res = await window.api.createSchedule(payload);
      if (res && res.success) {
        setShowCreateModal(false);
        fetchSchedules();
      } else {
        setCreateError(res?.error || 'Failed to create schedule');
      }
    } catch (err) {
      setCreateError(err.message || 'An error occurred');
    } finally {
      setCreateSubmitting(false);
    }
  };

  // Cancel with confirmation
  const handleCancelRequest = (schedule) => {
    setConfirmDialog({
      title: 'Cancel Schedule',
      message: `Cancel the scheduled export for "${schedule.profileSnapshot?.name || 'this job'}"? This action cannot be undone.`,
      confirmLabel: 'Yes, Cancel',
      confirmClass: 'bg-red-600 hover:bg-red-500',
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const res = await window.api.cancelSchedule(schedule.id);
          if (res && res.success) {
            setSchedules(prev => prev.map(s => s.id === schedule.id ? res.schedule : s));
          } else {
            setError(res?.error || 'Failed to cancel schedule');
          }
        } catch (err) {
          setError(err.message);
        }
      },
    });
  };

  // Delete with confirmation
  const handleDeleteRequest = (schedule) => {
    setConfirmDialog({
      title: 'Delete Record',
      message: `Permanently delete the record for "${schedule.profileSnapshot?.name || 'this job'}"? Output files will NOT be deleted.`,
      confirmLabel: 'Delete Record',
      confirmClass: 'bg-red-600 hover:bg-red-500',
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const res = await window.api.deleteSchedule(schedule.id);
          if (res && res.success) {
            setSchedules(prev => prev.filter(s => s.id !== schedule.id));
          } else {
            setError(res?.error || 'Failed to delete schedule');
          }
        } catch (err) {
          setError(err.message);
        }
      },
    });
  };

  const handlePause = async (schedule) => {
    try {
      const res = await window.api.pauseSchedule(schedule.id);
      if (res && res.success) {
        setSchedules(prev => prev.map(s => s.id === schedule.id ? res.schedule : s));
      } else {
        setError(res?.error || 'Failed to pause schedule');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleResume = async (schedule) => {
    try {
      const res = await window.api.resumeSchedule(schedule.id);
      if (res && res.success) {
        setSchedules(prev => prev.map(s => s.id === schedule.id ? res.schedule : s));
      } else {
        setError(res?.error || 'Failed to resume schedule');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  // Edit time save
  const handleEditSave = async (newScheduledAt) => {
    const id = editSchedule.id;
    const res = await window.api.updateSchedule(id, { scheduledAt: newScheduledAt });
    if (res && res.success) {
      setSchedules(prev => prev.map(s => s.id === id ? res.schedule : s));
      setEditSchedule(null);
    } else {
      throw new Error(res?.error || 'Failed to update schedule');
    }
  };

  const selectedProfileObj = profiles.find(p => p.id === formData.profileId);

  return (
    <div className="flex flex-col h-full gap-4 animate-slide-up select-none">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2.5">
            <Calendar size={20} className="text-brand-400" />
            Export Scheduler
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Schedule automatic local video exports with immutable profile &amp; variation snapshots.
          </p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-2 px-3.5 py-2 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold rounded-lg shadow-lg shadow-brand-900/30 transition-all"
        >
          <Plus size={14} />
          New Schedule
        </button>
      </div>

      {/* ── Global Error Banner ── */}
      {error && (
        <div className="flex items-center justify-between p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-300">
          <div className="flex items-center gap-2">
            <AlertCircle size={15} className="text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Search + Sort Controls ── */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by profile, platform, file, or export type…"
            className="w-full pl-8 pr-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-brand-500 transition-colors"
          />
        </div>
        <div className="relative">
          <ArrowUpDown size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
          <select
            value={sortOrder}
            onChange={e => setSortOrder(e.target.value)}
            className="pl-8 pr-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-300 focus:outline-none focus:border-brand-500 appearance-none cursor-pointer"
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Filter Tabs ── */}
      <div className="flex items-center gap-1 border-b border-zinc-800 pb-2 overflow-x-auto">
        {STATUS_TABS.map(tab => {
          const count = tabCounts[tab] || 0;
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={[
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap',
                isActive
                  ? 'bg-brand-500/20 text-brand-300 border border-brand-500/30 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60',
              ].join(' ')}
            >
              <span>{tab.charAt(0) + tab.slice(1).toLowerCase()}</span>
              <span className={[
                'text-[10px] px-1.5 rounded-full',
                isActive ? 'bg-brand-500/30 text-brand-200' : 'bg-zinc-800 text-zinc-400',
              ].join(' ')}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Schedule List ── */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {loading && schedules.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-zinc-500 gap-3">
            <Loader2 size={24} className="animate-spin text-brand-500" />
            <p className="text-xs">Loading schedules…</p>
          </div>
        ) : filteredSchedules.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-zinc-500 gap-3 bg-zinc-900/40 border border-zinc-800/60 rounded-2xl">
            <Clock size={32} className="text-zinc-600 stroke-[1.5]" />
            <div className="text-center">
              <p className="text-sm font-medium text-zinc-400">No schedules found</p>
              <p className="text-xs text-zinc-600 mt-0.5">
                {searchQuery
                  ? 'No results match your search.'
                  : activeTab === 'ALL'
                    ? 'Click "New Schedule" to queue an export for later.'
                    : `No items in ${activeTab.toLowerCase()} status.`}
              </p>
            </div>
          </div>
        ) : (
          filteredSchedules.map(schedule => {
            const badge        = STATUS_BADGES[schedule.status] || STATUS_BADGES.SCHEDULED;
            const platformClass = PLATFORM_STYLES[schedule.profileSnapshot?.platform] || PLATFORM_STYLES.Other;
            const progress     = liveProgress[schedule.id] !== undefined
              ? liveProgress[schedule.id]
              : schedule.progress || 0;

            const isProcessing  = schedule.status === 'PROCESSING';
            const isTerminal    = ['COMPLETED', 'FAILED', 'CANCELLED'].includes(schedule.status);
            const isEditable    = schedule.status === 'SCHEDULED' || schedule.status === 'PAUSED';
            const isCancellable = ['SCHEDULED', 'READY', 'PROCESSING', 'PAUSED'].includes(schedule.status);

            return (
              <div
                key={schedule.id}
                className="p-4 bg-zinc-900 border border-zinc-800 hover:border-zinc-700/80 rounded-xl transition-all flex flex-col gap-3 shadow-sm"
              >
                {/* Card Top */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-semibold text-zinc-200 truncate">
                      {schedule.profileSnapshot?.name || 'Default Profile'}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${platformClass}`}>
                      {schedule.profileSnapshot?.platform || 'Other'}
                    </span>
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                      {schedule.exportType}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-[11px] px-2.5 py-0.5 rounded-full border font-semibold flex items-center gap-1.5 ${badge.bg}`}>
                      {isProcessing && <Loader2 size={11} className="animate-spin" />}
                      {badge.label}
                    </span>

                    {/* Detail button — always visible */}
                    <button
                      onClick={() => setDetailSchedule(schedule)}
                      className="p-1.5 text-zinc-500 hover:text-brand-400 hover:bg-zinc-800 rounded-lg transition-colors"
                      title="View details"
                    >
                      <Info size={13} />
                    </button>

                    {/* Edit time — SCHEDULED or PAUSED */}
                    {isEditable && (
                      <button
                        onClick={() => setEditSchedule(schedule)}
                        className="p-1.5 text-zinc-400 hover:text-brand-400 hover:bg-zinc-800 rounded-lg transition-colors"
                        title="Edit scheduled time"
                      >
                        <Pencil size={13} />
                      </button>
                    )}

                    {/* Pause — SCHEDULED only */}
                    {schedule.status === 'SCHEDULED' && (
                      <button
                        onClick={() => handlePause(schedule)}
                        className="p-1.5 text-zinc-400 hover:text-yellow-400 hover:bg-zinc-800 rounded-lg transition-colors"
                        title="Pause schedule"
                      >
                        <Pause size={13} />
                      </button>
                    )}

                    {/* Resume — PAUSED only */}
                    {schedule.status === 'PAUSED' && (
                      <button
                        onClick={() => handleResume(schedule)}
                        className="p-1.5 text-zinc-400 hover:text-green-400 hover:bg-zinc-800 rounded-lg transition-colors"
                        title="Resume schedule"
                      >
                        <Play size={13} />
                      </button>
                    )}

                    {/* Cancel — active states */}
                    {isCancellable && (
                      <button
                        onClick={() => handleCancelRequest(schedule)}
                        className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 rounded-lg transition-colors"
                        title="Cancel schedule"
                      >
                        <XCircle size={13} />
                      </button>
                    )}

                    {/* Delete — terminal states only */}
                    {isTerminal && (
                      <button
                        onClick={() => handleDeleteRequest(schedule)}
                        className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 rounded-lg transition-colors"
                        title="Delete schedule record"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Card Middle: Source & Scheduled Time */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-zinc-400">
                  <div className="flex items-center gap-1.5 truncate">
                    <Film size={13} className="text-zinc-500 shrink-0" />
                    <span className="text-zinc-500">Source:</span>
                    <span className="text-zinc-300 truncate font-mono" title={schedule.sourcePath}>
                      {schedule.sourcePath?.split(/[/\\]/).pop()}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock size={13} className="text-zinc-500 shrink-0" />
                    <span className="text-zinc-500">Scheduled:</span>
                    <span className="text-zinc-200 font-medium">
                      {formatScheduleDateTime(schedule.scheduledAt)}
                    </span>
                  </div>
                </div>

                {/* Variation Snapshot Badge */}
                {schedule.variationPreset?.enabled && (
                  <div className="flex items-center gap-2 text-[11px] text-zinc-400 bg-zinc-950/40 p-2 rounded-lg border border-zinc-800/60">
                    <SlidersHorizontal size={12} className="text-brand-400 shrink-0" />
                    <span>
                      Speed: {schedule.variationPreset.speed || 1.0}x • Saturation:{' '}
                      {schedule.variationPreset.saturation || 1.0}x
                      {schedule.variationPreset.cleanMetadata ? ' • Clean Metadata' : ''}
                    </span>
                  </div>
                )}

                {/* Processing Progress */}
                {isProcessing && (
                  <div className="space-y-1">
                    <ProgressBar percent={progress} label="Exporting…" />
                  </div>
                )}

                {/* Completed: Show in Folder */}
                {schedule.status === 'COMPLETED' && schedule.outputPath && (
                  <div className="flex items-center justify-between p-2.5 bg-green-500/5 border border-green-500/20 rounded-lg text-xs text-green-300">
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckCircle2 size={14} className="text-green-400 shrink-0" />
                      <span className="truncate font-mono" title={schedule.outputPath}>
                        {schedule.outputPath}
                      </span>
                    </div>
                    <button
                      onClick={() => window.api.showInFolder(schedule.outputPath)}
                      className="ml-2 flex items-center gap-1 px-2 py-1 bg-green-500/10 hover:bg-green-500/20 rounded text-[11px] text-green-200 shrink-0 transition-colors"
                    >
                      <FolderOpen size={12} />
                      Show in Folder
                    </button>
                  </div>
                )}

                {/* Failed: Error message */}
                {schedule.status === 'FAILED' && schedule.error && (
                  <div className="flex items-start gap-2 p-2.5 bg-red-500/5 border border-red-500/20 rounded-lg text-xs text-red-300">
                    <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
                    <span className="truncate">{schedule.error}</span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ── CREATE SCHEDULE MODAL ── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-4 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Calendar size={18} className="text-brand-400" />
                <h2 className="text-sm font-bold text-zinc-100">Schedule New Export</h2>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 text-zinc-400 hover:text-zinc-100 rounded-lg hover:bg-zinc-800 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateSchedule} className="flex-1 overflow-y-auto p-5 space-y-4">
              {createError && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-300">
                  <AlertCircle size={14} className="text-red-400 shrink-0" />
                  <span>{createError}</span>
                </div>
              )}

              {/* 1. Source Video */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">Source Video File</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.sourcePath}
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

              {/* 2. Target Profile */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">Page Profile</label>
                <select
                  value={formData.profileId}
                  onChange={e => setFormData(prev => ({ ...prev, profileId: e.target.value }))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-brand-500"
                >
                  {profiles.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.platform})</option>
                  ))}
                </select>
              </div>

              {/* 3. Export Type */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">Export Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'cut', label: 'Cut Clip', icon: Scissors },
                    { id: 'reel', label: 'Make Reel', icon: Film },
                    { id: 'split', label: 'Split Segments', icon: SplitSquareHorizontal },
                  ].map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, exportType: id }))}
                      className={[
                        'flex items-center justify-center gap-2 p-2.5 rounded-lg border text-xs font-semibold transition-all',
                        formData.exportType === id
                          ? 'bg-brand-600/20 text-brand-300 border-brand-500/50 shadow-sm'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200',
                      ].join(' ')}
                    >
                      <Icon size={14} />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 4. Date & Time */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-300">Scheduled Date</label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={e => setFormData(prev => ({ ...prev, date: e.target.value }))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-300">Scheduled Time</label>
                  <input
                    type="time"
                    value={formData.time}
                    onChange={e => setFormData(prev => ({ ...prev, time: e.target.value }))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              {/* 5. Pre-Save Review */}
              <div className="p-3.5 bg-zinc-950/80 border border-zinc-800/80 rounded-xl space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-300">
                  <ShieldCheck size={14} className="text-brand-400" />
                  Schedule Review
                </div>
                <div className="space-y-1 text-xs text-zinc-400">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Profile:</span>
                    <span className="text-zinc-200 font-medium">{selectedProfileObj?.name || 'Default Profile'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Export:</span>
                    <span className="text-zinc-200 font-medium capitalize">{formData.exportType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Schedule:</span>
                    <span className="text-zinc-200 font-medium">
                      {formData.date && formData.time
                        ? formatScheduleDateTime(`${formData.date}T${formData.time}`)
                        : 'Not specified'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Variation:</span>
                    <span className="text-zinc-200 font-medium">
                      {selectedProfileObj?.variationPreset?.enabled
                        ? `Speed ${selectedProfileObj.variationPreset.speed || 1.0}x, Sat ${selectedProfileObj.variationPreset.saturation || 1.0}x`
                        : 'Clean Metadata (Neutral)'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSubmitting}
                  className="flex items-center gap-2 px-5 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-all shadow-lg shadow-brand-900/30"
                >
                  {createSubmitting ? (
                    <><Loader2 size={13} className="animate-spin" /> Saving…</>
                  ) : (
                    <><Calendar size={13} /> Schedule Export</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── DETAIL MODAL ── */}
      {detailSchedule && (
        <DetailModal schedule={detailSchedule} onClose={() => setDetailSchedule(null)} />
      )}

      {/* ── EDIT MODAL ── */}
      {editSchedule && (
        <EditModal
          schedule={editSchedule}
          onSave={handleEditSave}
          onCancel={() => setEditSchedule(null)}
        />
      )}

      {/* ── CONFIRM DIALOG ── */}
      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel}
          confirmClass={confirmDialog.confirmClass}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  );
}
