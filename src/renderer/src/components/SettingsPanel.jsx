import {
  ShieldCheck,
  Cpu,
  RefreshCw,
  LogOut,
  KeyRound,
  CheckCircle,
  AlertTriangle,
  Clock,
  Sparkles,
  Lock,
  Check,
  Zap,
  Download,
  RotateCcw,
  Loader2,
  ArrowUpCircle,
} from 'lucide-react';
import { getTierFeatureList } from '../utils/features';
import ProgressBar from './ProgressBar';

export default function SettingsPanel({ license, onLicenseUpdate, onDeactivate, onOpenUpgrade }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [info, setInfo] = useState(license || {});
  const [appVersion, setAppVersion] = useState('1.0.0');
  const [updateStatus, setUpdateStatus] = useState({ status: 'idle', info: null, progress: null, error: null });
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  useEffect(() => {
    refreshInfo();
    window.api.getAppVersion?.().then((v) => { if (v) setAppVersion(v); });
    window.api.getUpdateStatus?.().then((s) => { if (s) setUpdateStatus(s); });

    const handleUpdate = (data) => {
      if (data) {
        setUpdateStatus(data);
        if (data.status !== 'checking') setCheckingUpdate(false);
      }
    };
    window.api.onUpdateStatus?.(handleUpdate);
    return () => {
      window.api.off?.('updater:status');
    };
  }, []);

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    try {
      await window.api.checkForUpdates?.();
    } catch (_) {}
    finally {
      setTimeout(() => setCheckingUpdate(false), 2000);
    }
  };

  const handleDownloadUpdate = async () => {
    try {
      await window.api.downloadUpdate?.();
    } catch (_) {}
  };

  const handleInstallUpdate = async () => {
    try {
      await window.api.installUpdate?.();
    } catch (_) {}
  };

  const refreshInfo = async () => {
    try {
      const res = await window.api.getLicenseInfo();
      if (res) {
        setInfo(res);
      }
    } catch {
      // ignore
    }
  };

  const handleRevalidate = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await window.api.checkLicense();
      if (res && res.isValid) {
        setInfo(res);
        onLicenseUpdate?.(res);
        setMessage({
          type: 'success',
          text: res.isOffline
            ? `Offline validation active: ${res.gracePeriodRemainingHours} hours remaining on grace period.`
            : 'License successfully validated online!',
        });
      } else {
        setMessage({
          type: 'error',
          text: res.error || 'License validation failed.',
        });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivate = async () => {
    const confirm = window.confirm(
      'Are you sure you want to deactivate your license on this machine? You will need your license key to reactivate.'
    );
    if (!confirm) return;

    try {
      await window.api.deactivateLicense();
      onDeactivate?.();
    } catch (err) {
      alert('Deactivation error: ' + err.message);
    }
  };

  const tierColors = {
    pro: 'bg-brand-600/20 text-brand-300 border-brand-500/40',
    standard: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
    basic: 'bg-zinc-700/40 text-zinc-300 border-zinc-600',
  };

  const currentTier = (info.tier || 'standard').toLowerCase();
  const isPro = currentTier === 'pro';
  const featureList = getTierFeatureList(currentTier);

  return (
    <div className="flex flex-col gap-6 animate-slide-up max-w-2xl">
      <div>
        <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
          <KeyRound size={18} className="text-brand-400" />
          Settings & License
        </h2>
        <p className="text-xs text-zinc-500 mt-0.5">
          Manage your device activation, hardware binding, and subscription tier.
        </p>
      </div>

      {/* Message feedback */}
      {message && (
        <div
          className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs animate-fade-in ${
            message.type === 'success'
              ? 'bg-green-500/10 border-green-500/20 text-green-300'
              : 'bg-red-500/10 border-red-500/20 text-red-300'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle size={15} className="mt-0.5 shrink-0 text-green-400" />
          ) : (
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-red-400" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* License Info Card */}
      <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-600/20 border border-brand-600/30 flex items-center justify-center text-brand-400">
              <ShieldCheck size={16} />
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-100">License Information</p>
              <p className="text-[11px] text-zinc-500">Hardware-bound activation</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wider uppercase border ${
                tierColors[currentTier] || tierColors.standard
              }`}
            >
              {currentTier.toUpperCase()} TIER
            </span>

            {!isPro && (
              <button
                type="button"
                onClick={() => onOpenUpgrade?.('pro', 'Pro Features')}
                className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-brand-600 hover:bg-brand-500 text-white transition-colors flex items-center gap-1"
              >
                <Zap size={10} />
                Upgrade
              </button>
            )}
          </div>
        </div>

        {/* Info Rows */}
        <div className="space-y-2.5 text-xs">
          <div className="flex items-center justify-between py-1.5 border-b border-zinc-800/40">
            <span className="text-zinc-500">Status</span>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="font-medium text-zinc-200 capitalize">
                {info.isOffline ? 'Offline Grace Period' : info.status || 'Active'}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between py-1.5 border-b border-zinc-800/40">
            <span className="text-zinc-500">License Key</span>
            <span className="font-mono text-zinc-300 font-medium tracking-wider">
              {info.maskedKey || '••••-••••-••••-••••'}
            </span>
          </div>

          <div className="flex items-center justify-between py-1.5 border-b border-zinc-800/40">
            <span className="text-zinc-500">Hardware Binding (HWID)</span>
            <div className="flex items-center gap-1.5 font-mono text-zinc-300">
              <Cpu size={12} className="text-zinc-500" />
              <span>{info.shortHwid || 'Bound to this device'}</span>
            </div>
          </div>

          {info.lastValidatedAt && (
            <div className="flex items-center justify-between py-1.5 border-b border-zinc-800/40">
              <span className="text-zinc-500">Last Validation</span>
              <div className="flex items-center gap-1 text-zinc-400">
                <Clock size={12} />
                <span>{new Date(info.lastValidatedAt).toLocaleString()}</span>
              </div>
            </div>
          )}

          {info.isOffline && info.gracePeriodRemainingHours !== undefined && (
            <div className="flex items-center justify-between py-1.5 border-b border-zinc-800/40 bg-amber-500/5 px-2 rounded-lg border border-amber-500/20">
              <span className="text-amber-400 font-medium">Offline Grace Remaining</span>
              <span className="font-bold text-amber-300">
                {info.gracePeriodRemainingHours} hours (max 72h)
              </span>
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="pt-3 flex items-center justify-between gap-3">
          <button
            onClick={handleRevalidate}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-lg border border-zinc-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Validating…' : 'Re-validate Online'}
          </button>

          <button
            onClick={handleDeactivate}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 text-xs font-medium rounded-lg border border-red-500/20 transition-colors"
          >
            <LogOut size={12} />
            Deactivate Device
          </button>
        </div>
      </div>

      {/* Feature Access Matrix (Available vs Locked) */}
      <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">Features on Your Plan</h3>
            <p className="text-[11px] text-zinc-500">Capabilities enabled for {currentTier.toUpperCase()} tier</p>
          </div>
          {!isPro && (
            <button
              onClick={() => onOpenUpgrade?.('pro', 'Pro Capabilities')}
              className="text-xs text-brand-400 hover:text-brand-300 font-semibold flex items-center gap-1"
            >
              <Sparkles size={12} />
              Unlock All with Pro
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          {featureList.map((f) => (
            <div
              key={f.key}
              className={`p-2.5 rounded-xl border flex items-start justify-between text-xs transition-colors ${
                f.unlocked
                  ? 'bg-zinc-950/60 border-zinc-800/80 text-zinc-200'
                  : 'bg-zinc-950/30 border-zinc-800/40 text-zinc-500'
              }`}
            >
              <div className="flex items-start gap-2 min-w-0 pr-2">
                {f.unlocked ? (
                  <Check size={14} className="text-green-400 shrink-0 mt-0.5" />
                ) : (
                  <Lock size={14} className="text-amber-400 shrink-0 mt-0.5" />
                )}
                <div className="min-w-0">
                  <p className={`font-medium truncate ${f.unlocked ? 'text-zinc-200' : 'text-zinc-500'}`}>
                    {f.name}
                  </p>
                  <p className="text-[10px] text-zinc-500 leading-tight">{f.description}</p>
                </div>
              </div>

              {!f.unlocked && (
                <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-amber-300 border border-zinc-700 shrink-0">
                  {f.minTier}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Application & Updates Card */}
      <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-5 space-y-3 text-xs">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <ArrowUpCircle size={16} className="text-brand-400" />
              Application & Updates
            </h3>
            <p className="text-[11px] text-zinc-500">
              Installed Version: <span className="text-zinc-300 font-mono font-medium">v{appVersion}</span> · Channel: <span className="text-zinc-300">Stable (GitHub Releases)</span>
            </p>
          </div>

          <button
            onClick={handleCheckUpdate}
            disabled={checkingUpdate || updateStatus.status === 'downloading' || updateStatus.status === 'installing'}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 rounded-lg border border-zinc-700 transition-colors"
          >
            <RefreshCw size={12} className={checkingUpdate || updateStatus.status === 'checking' ? 'animate-spin' : ''} />
            <span>{checkingUpdate || updateStatus.status === 'checking' ? 'Checking…' : 'Check for Updates'}</span>
          </button>
        </div>

        {/* Status display */}
        {updateStatus.status === 'not-available' && (
          <div className="p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800 flex items-center gap-2 text-zinc-400 text-xs">
            <CheckCircle size={14} className="text-emerald-400" />
            <span>Reel Cutter is up to date (v{appVersion}).</span>
          </div>
        )}

        {updateStatus.status === 'available' && (
          <div className="p-3 rounded-xl bg-brand-950/40 border border-brand-500/30 flex items-center justify-between gap-3 flex-wrap">
            <div className="space-y-0.5">
              <p className="font-semibold text-zinc-100 flex items-center gap-1.5">
                <Sparkles size={13} className="text-brand-400" /> Update Available: v{updateStatus.info?.version}
              </p>
              <p className="text-[11px] text-zinc-400">
                {updateStatus.info?.releaseNotes || 'A new release is available.'}
              </p>
            </div>
            <button
              onClick={handleDownloadUpdate}
              className="px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Download size={13} />
              <span>Download Update</span>
            </button>
          </div>
        )}

        {updateStatus.status === 'downloading' && (
          <div className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-300 flex items-center gap-1.5">
                <Loader2 size={13} className="animate-spin text-brand-400" />
                Downloading v{updateStatus.info?.version}…
              </span>
              <span className="text-brand-400 font-mono font-bold">{updateStatus.progress?.percent || 0}%</span>
            </div>
            <ProgressBar progress={updateStatus.progress?.percent || 0} />
          </div>
        )}

        {updateStatus.status === 'downloaded' && (
          <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/30 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="font-semibold text-emerald-300 flex items-center gap-1.5">
                <CheckCircle size={14} /> Ready to Install (v{updateStatus.info?.version})
              </p>
              <p className="text-[11px] text-zinc-400">Restart Reel Cutter to apply the update.</p>
            </div>
            <button
              onClick={handleInstallUpdate}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <RotateCcw size={13} />
              <span>Restart & Install</span>
            </button>
          </div>
        )}

        {updateStatus.status === 'error' && updateStatus.error && (
          <div className="p-2.5 rounded-xl bg-rose-950/30 border border-rose-800/40 flex items-center gap-2 text-rose-300 text-xs">
            <AlertTriangle size={14} className="text-rose-400 shrink-0" />
            <span className="truncate">{updateStatus.error}</span>
          </div>
        )}
      </div>

      {/* About Card */}
      <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-5 space-y-2 text-xs">
        <p className="font-semibold text-zinc-200">About Reel Cutter</p>
        <p className="text-zinc-500 leading-relaxed">
          Version {appVersion} · Powered by FFmpeg & Electron. All video processing is executed 100% locally on your machine for maximum privacy and performance.
        </p>
      </div>
    </div>
  );
}
