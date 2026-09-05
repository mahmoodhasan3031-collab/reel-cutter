import { useState } from 'react';
import { Sparkles, Layers, Lock, Play, Image, CheckCircle, ArrowRight, Loader2 } from 'lucide-react';

export default function ProFeaturePlaceholder({ type = 'ai_thumbnails', isUnlocked, onOpenUpgrade, videoPath }) {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);

  const isThumbnails = type === 'ai_thumbnails';
  const title = isThumbnails ? 'AI Thumbnails' : 'Batch Queue';
  const subtitle = isThumbnails
    ? 'AI-driven keyframe detector that analyzes motion and contrast to generate viral reel covers.'
    : 'Automate rendering of multiple video files and queued splits in the background.';

  const handleRunProAction = async () => {
    if (!videoPath) {
      alert('Please load a video first!');
      return;
    }
    setLoading(true);
    setResults(null);
    try {
      if (isThumbnails) {
        const res = await window.api.generateAiThumbnails({ videoPath });
        setResults(res.thumbnails);
      } else {
        const res = await window.api.batchQueue({ items: [videoPath] });
        setResults([{ id: 1, name: videoPath.split(/[\\/]/).pop(), status: 'Complete' }]);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 animate-slide-up max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
            {isThumbnails ? (
              <Sparkles size={18} className="text-brand-400" />
            ) : (
              <Layers size={18} className="text-brand-400" />
            )}
            {title}
            <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-brand-600/20 text-brand-300 border border-brand-500/30">
              PRO FEATURE
            </span>
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">{subtitle}</p>
        </div>
      </div>

      {/* Locked State Card */}
      {!isUnlocked ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 flex flex-col items-center text-center relative overflow-hidden">
          <div className="w-14 h-14 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 mb-4 shadow-inner">
            <Lock size={24} className="text-brand-400" />
          </div>

          <h3 className="text-sm font-bold text-zinc-100 mb-1">
            {title} is locked on your current plan
          </h3>
          <p className="text-xs text-zinc-400 max-w-md mb-6 leading-relaxed">
            Upgrade your Reel Cutter license to the Pro tier ($30 one-time) to unlock AI-powered thumbnails, automated subject tracking smart crop, and high-volume batch queues.
          </p>

          <button
            onClick={() => onOpenUpgrade?.('pro', title)}
            className="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-brand-900/40 transition-colors flex items-center gap-2"
          >
            <Sparkles size={14} />
            Unlock with Pro ($30)
          </button>
        </div>
      ) : (
        /* Unlocked Pro Tool Interface */
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
            <span className="text-xs text-zinc-400">
              Active Video: <span className="text-zinc-200 font-mono">{videoPath ? videoPath.split(/[\\/]/).pop() : 'None'}</span>
            </span>
            <button
              onClick={handleRunProAction}
              disabled={loading || !videoPath}
              className="px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
            >
              {loading ? (
                <Loader2 size={13} className="animate-spin" />
              ) : isThumbnails ? (
                <Image size={13} />
              ) : (
                <Play size={13} />
              )}
              {loading ? 'Processing…' : isThumbnails ? 'Extract Best Frames' : 'Start Batch Job'}
            </button>
          </div>

          {/* Results Display */}
          {results && isThumbnails && (
            <div className="grid grid-cols-3 gap-3 pt-2 animate-fade-in">
              {results.map((thumb, idx) => (
                <div key={idx} className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 space-y-2">
                  <div className="aspect-[9/16] bg-zinc-800 rounded-lg flex items-center justify-center text-zinc-500">
                    <Image size={24} className="text-zinc-600" />
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-400 font-mono">@{thumb.timestamp}s</span>
                    <span className="text-brand-400 font-bold">{(thumb.score * 100).toFixed(0)}% score</span>
                  </div>
                  <p className="text-[10px] text-zinc-500 truncate">{thumb.label}</p>
                </div>
              ))}
            </div>
          )}

          {results && !isThumbnails && (
            <div className="space-y-2 pt-2 animate-fade-in text-xs">
              <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl flex items-center justify-between">
                <span className="text-zinc-300">sample_reel_batch_01.mp4</span>
                <span className="text-green-400 flex items-center gap-1 font-medium">
                  <CheckCircle size={13} /> Rendered
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
