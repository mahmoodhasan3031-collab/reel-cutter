import { useState, useEffect } from 'react';
import { KeyRound, ShieldCheck, AlertCircle, Cpu, Loader2, Sparkles, Clipboard, Check } from 'lucide-react';

export default function ActivationScreen({ onActivated }) {
  const [licenseKey, setLicenseKey] = useState('');
  const [hwid, setHwid] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Fetch device HWID on mount for display
    window.api?.getLicenseInfo?.().then((info) => {
      if (info && info.shortHwid) {
        setHwid(info.shortHwid);
      }
    });
  }, []);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setLicenseKey(text.trim().toUpperCase());
      }
    } catch {
      // ignore
    }
  };

  const handleActivate = async (e) => {
    e?.preventDefault();
    const cleanKey = licenseKey.trim();
    if (!cleanKey) {
      setError('Please enter your license key.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await window.api.activateLicense(cleanKey);
      if (result.success) {
        onActivated(result);
      } else {
        setError(result.error || 'License activation failed.');
      }
    } catch (err) {
      setError(err.message || 'System error during activation.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 bg-zinc-950 text-zinc-100 select-none animate-fade-in relative overflow-hidden">
      {/* Background ambient glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-brand-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md z-10 flex flex-col items-center">
        {/* Brand Header */}
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-xl glow-violet mb-5">
          <KeyRound size={26} className="text-white" />
        </div>

        <h1 className="text-xl font-bold tracking-tight text-zinc-100 mb-1">
          Activate Reel Cutter
        </h1>
        <p className="text-xs text-zinc-400 text-center max-w-xs mb-6">
          Enter your license key to unlock your professional desktop reel cutter and AI workflows.
        </p>

        {/* Activation Card */}
        <div className="w-full bg-zinc-900/90 border border-zinc-800/80 rounded-2xl p-6 shadow-2xl backdrop-blur-xl space-y-4">
          <form onSubmit={handleActivate} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-zinc-300">
                  License Key
                </label>
                <button
                  type="button"
                  onClick={handlePaste}
                  className="flex items-center gap-1 text-[11px] text-brand-400 hover:text-brand-300 transition-colors"
                >
                  <Clipboard size={11} />
                  Paste
                </button>
              </div>

              <div className="relative">
                <input
                  type="text"
                  value={licenseKey}
                  onChange={(e) => {
                    setLicenseKey(e.target.value.toUpperCase());
                    if (error) setError(null);
                  }}
                  placeholder="PRO-REEL-XXXX-XXXX-XXXX"
                  disabled={loading}
                  className="w-full bg-zinc-950/80 border border-zinc-700/80 rounded-xl px-3.5 py-2.5 text-sm font-mono tracking-wider text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all uppercase"
                />
              </div>
            </div>

            {/* Error Message Alert */}
            {error && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs animate-slide-up">
                <AlertCircle size={15} className="shrink-0 mt-0.5 text-red-400" />
                <span className="leading-relaxed">{error}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !licenseKey.trim()}
              className="w-full py-2.5 px-4 bg-brand-600 hover:bg-brand-500 disabled:bg-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl shadow-lg shadow-brand-900/40 transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin text-brand-200" />
                  <span>Validating Device & Key…</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={16} />
                  <span>Activate License</span>
                </>
              )}
            </button>
          </form>

          {/* Machine HWID badge */}
          <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-500">
            <div className="flex items-center gap-1.5">
              <Cpu size={12} className="text-zinc-400" />
              <span>Device HWID:</span>
            </div>
            <span className="font-mono bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800 text-zinc-400">
              {hwid || 'Detecting…'}
            </span>
          </div>
        </div>

        {/* Demo keys helper note for offline/dev */}
        <div className="mt-6 text-center">
          <p className="text-[11px] text-zinc-600">
            Test key: <code className="text-brand-400 font-mono bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">PRO-REEL-7890-ABCD-1234</code>
          </p>
        </div>
      </div>
    </div>
  );
}
