import React, { useState, useCallback } from 'react'

/**
 * CaptionWorkspace (Phase 4B-8)
 *
 * Unified workspace for AI caption generation, quality analysis,
 * smart rewriting, version history, and comparison.
 */

const REWRITE_MODES = [
  { key: 'clearer',       label: '💡 Clearer',       desc: 'Improve readability and clarity' },
  { key: 'shorter',       label: '✂️ Shorter',        desc: 'Make it more concise' },
  { key: 'professional',  label: '💼 Professional',   desc: 'Formal professional tone' },
  { key: 'casual',        label: '😊 Casual',         desc: 'Friendly, conversational tone' },
  { key: 'promotional',   label: '🎯 Promotional',    desc: 'Marketing-focused rewrite' },
  { key: 'better_hook',   label: '🪝 Better Hook',    desc: 'Stronger opening hook' },
  { key: 'stronger_cta',  label: '📣 Stronger CTA',   desc: 'Stronger call-to-action' },
]

const PLATFORMS = ['instagram', 'tiktok', 'youtube', 'facebook', 'twitter', 'linkedin', 'general']
const TONES     = ['neutral', 'professional', 'casual', 'energetic', 'inspirational', 'humorous']
const LENGTHS   = ['short', 'medium', 'long']
const LANGUAGES = ['english', 'bangla']

const S = {
  backdrop: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.75)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 10000, padding: 16,
  },
  modal: {
    background: '#13132a',
    border: '1px solid #3b3b6e',
    borderRadius: 10,
    width: '100%', maxWidth: 820, maxHeight: '92vh',
    overflowY: 'auto',
    boxShadow: '0 12px 40px rgba(0,0,0,0.8)',
    color: '#e0e0f0', fontFamily: 'sans-serif', boxSizing: 'border-box',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 18px',
    background: 'linear-gradient(135deg, #1a1040 0%, #1e1535 100%)',
    borderBottom: '1px solid #2e2e5e',
    borderRadius: '10px 10px 0 0',
  },
  body: { padding: 18 },
  section: {
    background: '#181830', border: '1px solid #2a2a50',
    borderRadius: 8, padding: 14, marginBottom: 14,
  },
  sectionTitle: {
    fontWeight: 700, fontSize: 12, color: '#9090c0',
    textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10,
  },
  label: {
    display: 'block', color: '#8888aa', fontSize: 11,
    marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em',
  },
  input: {
    background: '#101022', border: '1px solid #333355', borderRadius: 5,
    color: '#e0e0f0', fontSize: 12, padding: '5px 8px',
    width: '100%', boxSizing: 'border-box', outline: 'none',
  },
  select: {
    background: '#101022', border: '1px solid #333355', borderRadius: 5,
    color: '#e0e0f0', fontSize: 12, padding: '5px 8px',
    width: '100%', boxSizing: 'border-box', outline: 'none',
  },
  textarea: {
    background: '#101022', border: '1px solid #333355', borderRadius: 5,
    color: '#e0e0f0', fontSize: 13, padding: '8px 10px',
    width: '100%', boxSizing: 'border-box', outline: 'none',
    resize: 'vertical', minHeight: 80,
  },
  btn: (bg, border, color) => ({
    background: bg, border: `1px solid ${border}`, borderRadius: 5,
    color, fontSize: 12, fontWeight: 600, padding: '6px 12px', cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 4,
  }),
  modeBtn: (active) => ({
    background: active ? '#3b2f80' : '#1a1a35',
    border: `1px solid ${active ? '#7c6af7' : '#333355'}`,
    borderRadius: 5, color: active ? '#d6caff' : '#8888aa',
    fontSize: 11, padding: '5px 10px', cursor: 'pointer',
    marginRight: 4, marginBottom: 4, fontWeight: active ? 700 : 400,
  }),
  pill: (color, bg) => ({
    display: 'inline-block', background: bg, color,
    fontSize: 10, fontWeight: 700, padding: '2px 6px',
    borderRadius: 10, letterSpacing: '0.04em',
  }),
  card: {
    background: '#101025', border: '1px solid #2a2a48',
    borderRadius: 7, padding: 12, marginBottom: 8,
  },
  closeBtn: {
    background: 'transparent', border: '1px solid #444466',
    borderRadius: 5, color: '#9090b0',
    fontSize: 18, cursor: 'pointer', padding: '2px 8px', lineHeight: 1,
  },
}

function ScoreDisplay({ score }) {
  if (score == null) return null
  const s = Math.round(score)
  const color = s >= 80 ? '#22c55e' : s >= 60 ? '#f59e0b' : '#ef4444'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
      <div style={{ flex: 1, background: '#1a1a35', borderRadius: 4, height: 6, overflow: 'hidden' }}>
        <div style={{ width: `${s}%`, height: '100%', background: color, borderRadius: 4 }} />
      </div>
      <span style={{ color, fontWeight: 700, fontSize: 12, minWidth: 36 }}>{s}/100</span>
    </div>
  )
}

function SignalList({ signals }) {
  if (!signals || Object.keys(signals).length === 0) return null
  return (
    <div style={{ marginTop: 8 }}>
      {Object.entries(signals).map(([key, val]) => {
        const score = typeof val === 'object' ? val.score : val
        const color = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444'
        return (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <span style={{ color: '#7070a0', fontSize: 10, width: 120, flexShrink: 0, textTransform: 'capitalize' }}>
              {key.replace(/_/g, ' ')}
            </span>
            <div style={{ flex: 1, background: '#1a1a35', borderRadius: 3, height: 4, overflow: 'hidden' }}>
              <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: 3 }} />
            </div>
            <span style={{ color, fontSize: 10, minWidth: 28, textAlign: 'right' }}>{Math.round(score)}</span>
          </div>
        )
      })}
    </div>
  )
}

function SuggestionCard({ suggestion, index, onUse, onAnalyze }) {
  const score = suggestion.qualityScore?.overallScore ?? suggestion.qualityScore ?? null
  const text  = suggestion.text || suggestion.caption || ''
  return (
    <div style={S.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <span style={{ color: '#a0a0d0', fontWeight: 700, fontSize: 11 }}>Suggestion {index + 1}</span>
        {score != null && (
          <span style={S.pill(score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444', '#1a1a35')}>
            {Math.round(score)}/100
          </span>
        )}
      </div>
      <p style={{ color: '#e0e0f0', fontSize: 13, margin: '0 0 8px 0', lineHeight: 1.5 }}>{text}</p>
      {score != null && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ background: '#1a1a35', borderRadius: 4, height: 4, overflow: 'hidden' }}>
            <div style={{ width: `${Math.round(score)}%`, height: '100%', background: score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444', borderRadius: 4 }} />
          </div>
          <div style={{ color: '#5a5a80', fontSize: 10, marginTop: 3 }}>
            Quality score based on the current heuristic.
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        <button style={S.btn('linear-gradient(135deg,#2b2559,#3e266a)', '#7c6af7', '#d6caff')} onClick={() => onUse(text)}>
          ✓ Use This Version
        </button>
        <button style={S.btn('#1a2638', '#38bdf8', '#bae6fd')} onClick={() => onAnalyze(text)}>
          📊 Analyze
        </button>
      </div>
    </div>
  )
}

function VersionItem({ version, isSelected, onSelect }) {
  const ts   = version.createdAt ? new Date(version.createdAt).toLocaleTimeString() : '—'
  const score = version.qualityScore?.overallScore ?? version.qualityScore ?? null
  const srcLabel =
    version.source === 'initial'    ? '📝 Original' :
    version.source === 'manual'     ? '✏️ Manual'   :
    version.source === 'rewrite'    ? '🤖 Rewrite'  :
    version.source === 'ai_generate'? '✨ AI'        : '📌 Saved'
  return (
    <div
      onClick={() => onSelect(version.id)}
      style={{
        background: isSelected ? '#1e1e45' : '#10101e',
        border: `1px solid ${isSelected ? '#7c6af7' : '#2a2a48'}`,
        borderRadius: 6, padding: '8px 10px', marginBottom: 6, cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ color: '#a0a0d0', fontWeight: 700, fontSize: 11 }}>{srcLabel}</span>
          {isSelected && <span style={S.pill('#22c55e', '#0a2010')}>Current</span>}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {score != null && (
            <span style={{ color: score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444', fontSize: 11, fontWeight: 700 }}>
              {Math.round(score)}/100
            </span>
          )}
          <span style={{ color: '#555570', fontSize: 10 }}>{ts}</span>
        </div>
      </div>
      <div style={{ color: '#c0c0e0', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {version.caption}
      </div>
      {version.mode && (
        <div style={{ color: '#6060a0', fontSize: 10, marginTop: 3 }}>Mode: {version.mode.replace(/_/g, ' ')}</div>
      )}
    </div>
  )
}

function ComparePanel({ versions }) {
  const [idA, setIdA] = useState('')
  const [idB, setIdB] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)

  const doCompare = useCallback(async () => {
    if (!idA || !idB || idA === idB) { setErr('Select two different versions to compare.'); return }
    const vA = versions.find(v => v.id === idA)
    const vB = versions.find(v => v.id === idB)
    if (!vA || !vB) { setErr('Version not found.'); return }
    setLoading(true); setErr(null); setResult(null)
    try {
      const res = await window.api?.compareWorkspaceVersions(vA, vB)
      if (res?.success) setResult(res.comparison)
      else setErr(res?.error || 'Compare failed')
    } catch (e) { setErr(e.message) }
    setLoading(false)
  }, [idA, idB, versions])

  return (
    <div style={S.section}>
      <div style={S.sectionTitle}>🔍 Compare Versions (Read-Only)</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={S.label}>Version A</label>
          <select value={idA} onChange={e => setIdA(e.target.value)} style={S.select}>
            <option value=''>— Select —</option>
            {versions.map(v => <option key={v.id} value={v.id}>{v.source || 'saved'} — {(v.caption || '').slice(0, 40)}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={S.label}>Version B</label>
          <select value={idB} onChange={e => setIdB(e.target.value)} style={S.select}>
            <option value=''>— Select —</option>
            {versions.map(v => <option key={v.id} value={v.id}>{v.source || 'saved'} — {(v.caption || '').slice(0, 40)}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button style={S.btn('linear-gradient(135deg,#1b263b,#0d1b2a)', '#48cae4', '#caf0f8')} onClick={doCompare} disabled={loading}>
            {loading ? '...' : 'Compare'}
          </button>
        </div>
      </div>
      {err && <div style={{ color: '#ff7070', fontSize: 12, marginBottom: 8 }}>{err}</div>}
      {result && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            {[{ id: idA, label: 'VERSION A' }, { id: idB, label: 'VERSION B' }].map(({ id, label }) => (
              <div key={id} style={{ flex: 1, background: '#0d0d20', border: '1px solid #2a2a48', borderRadius: 6, padding: 10 }}>
                <div style={{ color: '#7070a0', fontSize: 10, marginBottom: 4 }}>{label}</div>
                <div style={{ color: '#c0c0e0', fontSize: 12 }}>{versions.find(v => v.id === id)?.caption}</div>
                <div style={{ color: '#5090d0', fontSize: 11, marginTop: 6 }}>
                  Score: {Math.round(label === 'VERSION A' ? (result.scoreA ?? 0) : (result.scoreB ?? 0))}/100
                </div>
              </div>
            ))}
          </div>
          <div style={{ color: '#a0a0d0', fontSize: 12, marginBottom: 4 }}>
            <strong>Winner:</strong>{' '}
            <span style={{ color: result.winner === 'A' ? '#7c6af7' : result.winner === 'B' ? '#38bdf8' : '#888' }}>
              {result.winner === 'tie' ? 'Tie' : `Version ${result.winner}`}
            </span>
            {result.scoreDiff != null && (
              <span style={{ color: '#5050a0', marginLeft: 8 }}>
                (Δ {result.scoreDiff > 0 ? '+' : ''}{Math.round(result.scoreDiff)})
              </span>
            )}
          </div>
          {result.verdict && <div style={{ color: '#8080c0', fontSize: 11, marginBottom: 4 }}>{result.verdict}</div>}
          <div style={{ color: '#5a5a80', fontSize: 10, marginBottom: 8 }}>
            Higher quality score according to the current heuristic.
          </div>
          {result.signalDiffs && Object.keys(result.signalDiffs).length > 0 && (
            <div>
              <div style={{ color: '#7070a0', fontSize: 10, marginBottom: 4 }}>Signal Differences</div>
              {Object.entries(result.signalDiffs).map(([key, diff]) => (
                <div key={key} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
                  <span style={{ color: '#6060a0', fontSize: 10, width: 120, flexShrink: 0 }}>{key.replace(/_/g, ' ')}</span>
                  <span style={{ color: diff > 0 ? '#22c55e' : diff < 0 ? '#ef4444' : '#888', fontSize: 10 }}>
                    {diff > 0 ? '+' : ''}{Math.round(diff)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function CaptionWorkspace({
  caption: initialCaption = '',
  topic: initialTopic = '',
  tone: initialTone = 'neutral',
  platform: initialPlatform = 'general',
  profileId = null,
  profileName = null,
  existingOverlays = [],
  onApply,
  onSaveTemplate,
  onClose,
}) {
  const [workspace, setWorkspace]           = useState(null)
  const [caption, setCaption]               = useState(initialCaption)
  const [topic, setTopic]                   = useState(initialTopic)
  const [platform, setPlatform]             = useState(initialPlatform)
  const [tone, setTone]                     = useState(initialTone)
  const [language, setLanguage]             = useState('english')
  const [length, setLength]                 = useState('medium')
  const [quality, setQuality]               = useState(null)
  const [qualityLoading, setQualityLoading] = useState(false)
  const [qualityErr, setQualityErr]         = useState(null)
  const [selectedMode, setSelectedMode]     = useState('clearer')
  const [rewriteCount, setRewriteCount]     = useState(3)
  const [rewriteLoading, setRewriteLoading] = useState(false)
  const [rewriteErr, setRewriteErr]         = useState(null)
  const [suggestions, setSuggestions]       = useState([])
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  const [feedbackErr, setFeedbackErr]         = useState(null)
  const [feedbackSuggestions, setFeedbackSuggestions] = useState([])
  const [feedbackMode, setFeedbackMode]     = useState(null)
  const [versions, setVersions]             = useState([])
  const [selectedVersionId, setSelectedVersionId] = useState(null)
  const [tab, setTab]                       = useState('rewrite')
  const [actionMsg, setActionMsg]           = useState(null)
  const [actionErr, setActionErr]           = useState(null)
  const [saveVersionLoading, setSaveVersionLoading]   = useState(false)
  const [applyLoading, setApplyLoading]               = useState(false)
  const [saveHistoryLoading, setSaveHistoryLoading]   = useState(false)
  const [saveTemplateLoading, setSaveTemplateLoading] = useState(false)

  const showMsg  = msg => { setActionMsg(msg); setTimeout(() => setActionMsg(null), 3000) }
  const showErrA = msg => { setActionErr(msg); setTimeout(() => setActionErr(null), 5000) }

  const analyzeQuality = useCallback(async (text) => {
    const cap = text || caption
    if (!cap.trim()) { setQualityErr('Enter a caption first.'); return }
    setQualityLoading(true); setQualityErr(null); setQuality(null)
    try {
      const res = await window.api?.analyzeCaptionQuality({ caption: cap, platform, tone })
      if (res?.success) setQuality(res.analysis)
      else setQualityErr(res?.error || 'Analysis failed')
    } catch (e) { setQualityErr(e.message) }
    setQualityLoading(false)
  }, [caption, platform, tone])

  const saveVersion = useCallback(async () => {
    if (!caption.trim()) { showErrA('Caption is empty.'); return }
    setSaveVersionLoading(true)
    try {
      const newVersion = { caption, source: 'manual', platform, tone, language, length, qualityScore: quality?.overallScore ?? null }
      if (workspace && window.api?.addWorkspaceVersion) {
        const res = await window.api.addWorkspaceVersion(workspace, newVersion)
        if (res?.success) {
          setWorkspace(res.workspace)
          setVersions(res.workspace.versions || [])
          setSelectedVersionId(res.workspace.selectedVersionId)
          showMsg('Version saved.')
        } else showErrA(res?.error || 'Failed to save version')
      } else {
        const v = { id: `v_${Date.now()}`, ...newVersion, createdAt: new Date().toISOString() }
        setVersions(prev => [...prev, v])
        setSelectedVersionId(v.id)
        showMsg('Version saved locally.')
      }
    } catch (e) { showErrA(e.message) }
    setSaveVersionLoading(false)
  }, [caption, platform, tone, language, length, quality, workspace])

  const selectVersion = useCallback(async (versionId) => {
    setSelectedVersionId(versionId)
    const v = versions.find(x => x.id === versionId)
    if (v) {
      setCaption(v.caption)
      if (v.platform) setPlatform(v.platform)
      if (v.tone)     setTone(v.tone)
    }
  }, [versions])

  const generateRewrites = useCallback(async () => {
    if (!caption.trim()) { setRewriteErr('Enter a caption first.'); return }
    setRewriteLoading(true); setRewriteErr(null); setSuggestions([])
    try {
      const res = await window.api?.generateSmartRewrites({
        caption, mode: selectedMode, language, tone, length, platform, count: rewriteCount, topic,
      })
      if (res?.success) {
        setSuggestions(res.suggestions || [])
        if (!(res.suggestions || []).length) setRewriteErr('No suggestions returned.')
      } else setRewriteErr(res?.error || 'Rewrite failed')
    } catch (e) { setRewriteErr(e.message) }
    setRewriteLoading(false)
  }, [caption, selectedMode, language, tone, length, platform, rewriteCount, topic])

  const generateFeedbackRewrite = useCallback(async () => {
    if (!caption.trim()) { setFeedbackErr('Enter a caption first.'); return }
    setFeedbackLoading(true); setFeedbackErr(null); setFeedbackSuggestions([]); setFeedbackMode(null)
    try {
      const res = await window.api?.rewriteWithQualityFeedback({
        caption, language, tone, length, platform, count: rewriteCount, topic,
      })
      if (res?.success) {
        setFeedbackSuggestions(res.suggestions || [])
        setFeedbackMode(res.recommendedMode || null)
        if (!(res.suggestions || []).length) setFeedbackErr('No suggestions returned.')
      } else setFeedbackErr(res?.error || 'Feedback rewrite failed')
    } catch (e) { setFeedbackErr(e.message) }
    setFeedbackLoading(false)
  }, [caption, language, tone, length, platform, rewriteCount, topic])

  const useSuggestion = useCallback((text) => {
    setCaption(text); setSuggestions([]); setFeedbackSuggestions([])
    showMsg('Suggestion applied. Save version or apply to overlay.')
  }, [])

  const applyToOverlay = useCallback(async () => {
    if (!caption.trim()) { showErrA('Caption is empty.'); return }
    setApplyLoading(true)
    try { onApply?.(caption); showMsg('Caption applied to text overlay.') }
    catch (e) { showErrA(e.message) }
    setApplyLoading(false)
  }, [caption, onApply])

  const saveToHistory = useCallback(async () => {
    if (!caption.trim()) { showErrA('Caption is empty.'); return }
    setSaveHistoryLoading(true)
    try {
      const res = await window.api?.saveCaptionHistory({
        caption, platform, tone, language,
        qualityScore: quality?.overallScore ?? null,
        signalScores: quality?.signalScores ?? {},
        topic, profileId, profileName, source: 'workspace',
      })
      if (res?.success) showMsg('Saved to history.')
      else showErrA(res?.error || 'Failed to save to history')
    } catch (e) { showErrA(e.message) }
    setSaveHistoryLoading(false)
  }, [caption, platform, tone, language, quality, topic, profileId, profileName])

  const saveAsTemplate = useCallback(async () => {
    if (!caption.trim()) { showErrA('Caption is empty.'); return }
    setSaveTemplateLoading(true)
    try {
      if (onSaveTemplate) {
        await onSaveTemplate({ caption, platform, tone, language })
        showMsg('Saved as template.')
      } else {
        const res = await window.api?.createCaptionTemplate({
          name: `Workspace ${Date.now()}`,
          overlays: [{
            id: `overlay_${Date.now()}`, text: caption,
            fontFamily: 'Arial', fontSize: 48, fontWeight: 'bold',
            color: '#FFFFFF', opacity: 1, backgroundColor: '#000000', backgroundOpacity: 0.4,
            outlineColor: '#000000', outlineWidth: 2, position: 'bottom',
            x: 0.5, y: 0.88, alignment: 'center', startTime: 0, endTime: null, enabled: true,
          }],
        })
        if (res?.success) showMsg('Saved as template.')
        else showErrA(res?.error || 'Failed to save as template')
      }
    } catch (e) { showErrA(e.message) }
    setSaveTemplateLoading(false)
  }, [caption, platform, tone, language, onSaveTemplate])

  const TABS = [
    { key: 'rewrite',  label: '🤖 Smart Rewrite' },
    { key: 'feedback', label: '🔁 Quality Feedback' },
    { key: 'history',  label: `📋 History (${versions.length})` },
    { key: 'compare',  label: '🔍 Compare' },
  ]

  return (
    <div style={S.backdrop} onClick={e => e.target === e.currentTarget && onClose?.()}>
      <div style={S.modal}>
        {/* Header */}
        <div style={S.header}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#e0d8ff' }}>🖊️ Caption Workspace</div>
            <div style={{ color: '#8080b0', fontSize: 11, marginTop: 2 }}>
              Smart Rewrite · Quality Analysis · Version History · Compare
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {profileName && <span style={S.pill('#c2b8ff', '#232048')}>👤 {profileName}</span>}
            <button style={S.closeBtn} onClick={onClose}>✕</button>
          </div>
        </div>

        <div style={S.body}>
          {actionMsg && (
            <div style={{ background: '#0a2010', border: '1px solid #22c55e', color: '#86efac', padding: '6px 12px', borderRadius: 6, fontSize: 12, marginBottom: 10 }}>
              ✓ {actionMsg}
            </div>
          )}
          {actionErr && (
            <div style={{ background: '#2a0a0a', border: '1px solid #ef4444', color: '#fca5a5', padding: '6px 12px', borderRadius: 6, fontSize: 12, marginBottom: 10 }}>
              ✕ {actionErr}
            </div>
          )}

          {/* Context Fields */}
          <div style={S.section}>
            <div style={S.sectionTitle}>📋 Context</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
              <div>
                <label style={S.label}>Topic</label>
                <input value={topic} onChange={e => setTopic(e.target.value)} style={S.input} placeholder='e.g. fitness tips' />
              </div>
              <div>
                <label style={S.label}>Platform</label>
                <select value={platform} onChange={e => setPlatform(e.target.value)} style={S.select}>
                  {PLATFORMS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label style={S.label}>Tone</label>
                <select value={tone} onChange={e => setTone(e.target.value)} style={S.select}>
                  {TONES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label style={S.label}>Length</label>
                <select value={length} onChange={e => setLength(e.target.value)} style={S.select}>
                  {LENGTHS.map(l => <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label style={S.label}>Language</label>
                <select value={language} onChange={e => setLanguage(e.target.value)} style={S.select}>
                  {LANGUAGES.map(l => <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label style={S.label}>Suggestions</label>
                <input type='number' min={1} max={5} value={rewriteCount}
                  onChange={e => setRewriteCount(Math.min(5, Math.max(1, Number(e.target.value))))}
                  style={S.input} />
              </div>
            </div>
          </div>

          {/* Caption Editor */}
          <div style={S.section}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={S.sectionTitle}>✏️ Caption Editor</div>
              <button style={S.btn('#0a2010', '#22c55e', '#86efac')} onClick={saveVersion} disabled={saveVersionLoading}>
                {saveVersionLoading ? '...' : '💾 Save Version'}
              </button>
            </div>
            <div style={{ position: 'relative' }}>
              <textarea
                value={caption}
                onChange={e => setCaption(e.target.value.slice(0, 500))}
                maxLength={500} rows={4} style={S.textarea}
                placeholder='Enter or paste your caption here...'
              />
              <div style={{ position: 'absolute', bottom: 6, right: 8, color: '#5a5a80', fontSize: 10 }}>
                {caption.length}/500
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button style={S.btn('linear-gradient(135deg,#182638,#1c3d5a)', '#38bdf8', '#bae6fd')} onClick={() => analyzeQuality()} disabled={qualityLoading}>
                  {qualityLoading ? '...' : '📊 Analyze Quality'}
                </button>
                {quality && <span style={{ color: '#7070a0', fontSize: 11 }}>Score updated</span>}
              </div>
              {qualityErr && <div style={{ color: '#ff7070', fontSize: 11, marginTop: 4 }}>{qualityErr}</div>}
              {quality && (
                <div style={{ marginTop: 8 }}>
                  <ScoreDisplay score={quality.overallScore} />
                  <SignalList signals={quality.signalScores || quality.signals} />
                  {quality.suggestions?.length > 0 && (
                    <div style={{ color: '#7070a0', fontSize: 11, marginTop: 6 }}>💡 {quality.suggestions[0]}</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
            {TABS.map(t => (
              <button key={t.key} style={S.modeBtn(tab === t.key)} onClick={() => setTab(t.key)}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Smart Rewrite Tab */}
          {tab === 'rewrite' && (
            <div style={S.section}>
              <div style={S.sectionTitle}>🤖 Smart Rewrite Mode</div>
              <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap' }}>
                {REWRITE_MODES.map(m => (
                  <button key={m.key} style={S.modeBtn(selectedMode === m.key)} onClick={() => setSelectedMode(m.key)} title={m.desc}>
                    {m.label}
                  </button>
                ))}
              </div>
              <div style={{ color: '#6060a0', fontSize: 11, marginBottom: 10 }}>
                {REWRITE_MODES.find(m => m.key === selectedMode)?.desc}
              </div>
              <button style={S.btn('linear-gradient(135deg,#2b2559,#3e266a)', '#7c6af7', '#d6caff')} onClick={generateRewrites} disabled={rewriteLoading}>
                {rewriteLoading ? '⌛ Generating...' : '✨ Generate Rewrites'}
              </button>
              {rewriteErr && <div style={{ color: '#ff7070', fontSize: 11, marginTop: 6 }}>{rewriteErr}</div>}
              {suggestions.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  {suggestions.map((s, i) => (
                    <SuggestionCard key={i} index={i} suggestion={s} onUse={useSuggestion} onAnalyze={analyzeQuality} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Feedback Rewrite Tab */}
          {tab === 'feedback' && (
            <div style={S.section}>
              <div style={S.sectionTitle}>🔁 Improve Using Quality Feedback</div>
              <p style={{ color: '#7070a0', fontSize: 12, margin: '0 0 10px 0' }}>
                Analyzes your caption, finds the weakest quality signal, and auto-selects the best rewrite mode.
              </p>
              <button style={S.btn('linear-gradient(135deg,#182638,#1c3d5a)', '#38bdf8', '#bae6fd')} onClick={generateFeedbackRewrite} disabled={feedbackLoading}>
                {feedbackLoading ? '⌛ Analyzing & Rewriting...' : '🔁 Improve Using Quality Feedback'}
              </button>
              {feedbackErr && <div style={{ color: '#ff7070', fontSize: 11, marginTop: 6 }}>{feedbackErr}</div>}
              {feedbackMode && (
                <div style={{ color: '#a0a0d0', fontSize: 11, marginTop: 8 }}>
                  Auto-selected mode: <strong>{feedbackMode.replace(/_/g, ' ')}</strong>
                </div>
              )}
              {feedbackSuggestions.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  {feedbackSuggestions.map((s, i) => (
                    <SuggestionCard key={i} index={i} suggestion={s} onUse={useSuggestion} onAnalyze={analyzeQuality} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Version History Tab */}
          {tab === 'history' && (
            <div style={S.section}>
              <div style={S.sectionTitle}>📋 Version History (Read-Only)</div>
              {versions.length === 0 ? (
                <div style={{ color: '#555570', fontSize: 12, textAlign: 'center', padding: '12px 0' }}>
                  No versions saved yet. Edit your caption and click &quot;Save Version&quot;.
                </div>
              ) : (
                versions.map(v => (
                  <VersionItem key={v.id} version={v} isSelected={selectedVersionId === v.id} onSelect={selectVersion} />
                ))
              )}
            </div>
          )}

          {/* Compare Tab */}
          {tab === 'compare' && <ComparePanel versions={versions} />}

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            <button style={S.btn('linear-gradient(135deg,#2b2559,#3e266a)', '#7c6af7', '#d6caff')} onClick={applyToOverlay} disabled={applyLoading}>
              {applyLoading ? '...' : '🎬 Apply to Text Overlay'}
            </button>
            <button style={S.btn('#182638', '#38bdf8', '#bae6fd')} onClick={saveToHistory} disabled={saveHistoryLoading}>
              {saveHistoryLoading ? '...' : '📚 Save to History'}
            </button>
            <button style={S.btn('#232048', '#5c4df0', '#c2b8ff')} onClick={saveAsTemplate} disabled={saveTemplateLoading}>
              {saveTemplateLoading ? '...' : '🏷️ Save as Template'}
            </button>
            <button style={S.btn('transparent', '#444466', '#9090b0')} onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
