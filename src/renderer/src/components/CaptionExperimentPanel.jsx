import React, { useState, useEffect, useCallback } from 'react'

/**
 * CaptionExperimentPanel (Phase 4B-9)
 *
 * A/B Creative Caption Variant Testing, Quality Comparison,
 * and Heuristic Optimization UI.
 */

const PLATFORMS = ['general', 'instagram', 'tiktok', 'youtube', 'facebook', 'other']
const TONES = ['casual', 'professional', 'educational', 'promotional', 'storytelling', 'neutral']

const S = {
  backdrop: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.8)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 10000, padding: 16,
  },
  modal: {
    background: '#13132a',
    border: '1px solid #3b3b6e',
    borderRadius: 10,
    width: '100%', maxWidth: 860, maxHeight: '92vh',
    overflowY: 'auto',
    boxShadow: '0 12px 40px rgba(0,0,0,0.85)',
    color: '#e0e0f0', fontFamily: 'sans-serif', boxSizing: 'border-box',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 18px',
    background: 'linear-gradient(135deg, #1f1440 0%, #161c38 100%)',
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
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  label: {
    display: 'block', color: '#8888aa', fontSize: 11,
    marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em',
  },
  input: {
    background: '#101022', border: '1px solid #333355', borderRadius: 5,
    color: '#e0e0f0', fontSize: 12, padding: '6px 8px',
    width: '100%', boxSizing: 'border-box', outline: 'none',
  },
  select: {
    background: '#101022', border: '1px solid #333355', borderRadius: 5,
    color: '#e0e0f0', fontSize: 12, padding: '6px 8px',
    width: '100%', boxSizing: 'border-box', outline: 'none',
  },
  textarea: {
    background: '#101022', border: '1px solid #333355', borderRadius: 5,
    color: '#e0e0f0', fontSize: 13, padding: '8px 10px',
    width: '100%', boxSizing: 'border-box', outline: 'none',
    resize: 'vertical', minHeight: 70,
  },
  btn: (bg, border, color) => ({
    background: bg, border: `1px solid ${border}`, borderRadius: 5,
    color, fontSize: 12, fontWeight: 600, padding: '6px 12px', cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 4,
  }),
  pill: (color, bg) => ({
    display: 'inline-block', background: bg, color,
    fontSize: 10, fontWeight: 700, padding: '2px 6px',
    borderRadius: 10, letterSpacing: '0.04em',
  }),
  card: (isPreferred) => ({
    background: isPreferred ? '#18183c' : '#101024',
    border: `1px solid ${isPreferred ? '#8b5cf6' : '#2a2a48'}`,
    borderRadius: 7, padding: 12, marginBottom: 10,
    boxShadow: isPreferred ? '0 0 12px rgba(139, 92, 246, 0.15)' : 'none',
  }),
  closeBtn: {
    background: 'transparent', border: '1px solid #444466',
    borderRadius: 5, color: '#9090b0',
    fontSize: 18, cursor: 'pointer', padding: '2px 8px', lineHeight: 1,
  },
}

function SignalBar({ label, value }) {
  if (typeof value !== 'number') return null
  const score = Math.round(value)
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
      <span style={{ color: '#7070a0', fontSize: 10, width: 90, flexShrink: 0, textTransform: 'capitalize' }}>
        {label}
      </span>
      <div style={{ flex: 1, background: '#101020', borderRadius: 3, height: 4, overflow: 'hidden' }}>
        <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ color, fontSize: 10, minWidth: 24, textAlign: 'right' }}>{score}</span>
    </div>
  )
}

function VariantCard({
  variant,
  isPreferred,
  onSelectPreferred,
  onDelete,
  canDelete,
  onOptimize,
}) {
  const q = variant.qualityResult
  const score = q?.score ?? null
  const grade = q?.grade ?? null
  const scoreColor = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444'

  return (
    <div style={S.card(isPreferred)}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: isPreferred ? '#e9d5ff' : '#c0c0e0' }}>
            {variant.name || 'Variant'}
          </span>
          {isPreferred && <span style={S.pill('#fbbf24', '#2d2407')}>★ Preferred</span>}
          <span style={S.pill('#94a3b8', '#1e293b')}>
            {variant.source || 'manual'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {score != null ? (
            <span style={{ color: scoreColor, fontWeight: 700, fontSize: 13 }}>
              {score}/100 <span style={{ fontSize: 11 }}>({grade})</span>
            </span>
          ) : (
            <span style={{ color: '#666', fontSize: 11 }}>Unanalyzed</span>
          )}
        </div>
      </div>

      <p style={{ color: '#e0e0f0', fontSize: 13, margin: '6px 0 10px 0', lineHeight: 1.5, wordBreak: 'break-word' }}>
        {variant.text}
      </p>

      {q?.signals && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px', marginBottom: 10 }}>
          <SignalBar label='Readability' value={q.signals.readability} />
          <SignalBar label='Relevance' value={q.signals.relevance} />
          <SignalBar label='Clarity' value={q.signals.clarity} />
          <SignalBar label='CTA' value={q.signals.cta} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {!isPreferred && (
          <button
            style={S.btn('linear-gradient(135deg,#2b2559,#3e266a)', '#7c6af7', '#d6caff')}
            onClick={() => onSelectPreferred(variant.id)}
          >
            ★ Select as Preferred
          </button>
        )}
        <button
          style={S.btn('#1a2638', '#38bdf8', '#bae6fd')}
          onClick={() => onOptimize(variant)}
        >
          ⚡ Optimize Variant
        </button>
        {canDelete && (
          <button
            style={S.btn('#2a1414', '#ef4444', '#fca5a5')}
            onClick={() => onDelete(variant.id)}
          >
            🗑️ Delete
          </button>
        )}
      </div>
    </div>
  )
}

export default function CaptionExperimentPanel({
  initialCaption = '',
  topic: initialTopic = '',
  platform: initialPlatform = 'general',
  tone: initialTone = 'casual',
  profileId = null,
  profileName = null,
  existingOverlays = [],
  onApplyOverlay,
  onSaveTemplate,
  onClose,
}) {
  const [experiments, setExperiments] = useState([])
  const [activeExp, setActiveExp] = useState(null)
  const [loading, setLoading] = useState(false)
  const [actionMsg, setActionMsg] = useState(null)
  const [actionErr, setActionErr] = useState(null)

  // Creation modal state
  const [creatingExp, setCreatingExp] = useState(false)
  const [newExpName, setNewExpName] = useState('')
  const [newExpCaption, setNewExpCaption] = useState(initialCaption)
  const [newExpTopic, setNewExpTopic] = useState(initialTopic)
  const [newExpPlatform, setNewExpPlatform] = useState(initialPlatform)
  const [newExpTone, setNewExpTone] = useState(initialTone)

  // Manual variant modal
  const [manualModalOpen, setManualModalOpen] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualText, setManualText] = useState('')

  // AI Generation modal
  const [aiModalOpen, setAiModalOpen] = useState(false)
  const [aiSuggestions, setAiSuggestions] = useState([])
  const [aiLoading, setAiLoading] = useState(false)
  const [aiMode, setAiMode] = useState('better_hook')
  const [aiCount, setAiCount] = useState(3)

  // Optimize modal
  const [optimizeModalOpen, setOptimizeModalOpen] = useState(false)
  const [optimizingVariant, setOptimizingVariant] = useState(null)
  const [optimizeResult, setOptimizeResult] = useState(null)
  const [optimizeLoading, setOptimizeLoading] = useState(false)

  // Compare panel state
  const [compareIdA, setCompareIdA] = useState('')
  const [compareIdB, setCompareIdB] = useState('')
  const [compareResult, setCompareResult] = useState(null)

  const showMsg = (m) => { setActionMsg(m); setTimeout(() => setActionMsg(null), 3000) }
  const showErr = (m) => { setActionErr(m); setTimeout(() => setActionErr(null), 4000) }

  // Load experiments list
  const loadList = useCallback(async (selectId) => {
    if (!window.api?.getCaptionExperiments) return
    setLoading(true)
    try {
      const res = await window.api.getCaptionExperiments()
      if (res?.success) {
        const list = res.experiments || []
        setExperiments(list)
        if (selectId) {
          const target = list.find(e => e.id === selectId)
          if (target) setActiveExp(target)
        } else if (list.length > 0 && (!activeExp || !list.some(e => e.id === activeExp.id))) {
          setActiveExp(list[0])
        } else if (list.length === 0) {
          setActiveExp(null)
        }
      }
    } catch (e) {
      showErr(e.message)
    }
    setLoading(false)
  }, [activeExp])

  useEffect(() => {
    loadList()
  }, [])

  // Create Experiment
  const handleCreateExperiment = async () => {
    if (!newExpName.trim()) { showErr('Experiment name is required'); return }
    if (!newExpCaption.trim()) { showErr('Source caption is required'); return }
    setLoading(true)
    try {
      const res = await window.api?.createCaptionExperiment({
        name: newExpName.trim(),
        sourceCaption: newExpCaption.trim(),
        topic: newExpTopic.trim() || null,
        platform: newExpPlatform,
        tone: newExpTone,
        profileId,
        profileName,
      })
      if (res?.success) {
        setCreatingExp(false)
        showMsg(`Experiment "${res.experiment.name}" created.`)
        await loadList(res.experiment.id)
      } else {
        showErr(res?.error || 'Failed to create experiment')
      }
    } catch (e) {
      showErr(e.message)
    }
    setLoading(false)
  }

  // Add Manual Variant
  const handleAddManualVariant = async () => {
    if (!activeExp) return
    if (!manualText.trim()) { showErr('Variant text is required'); return }
    try {
      const res = await window.api?.addCaptionExperimentVariant(activeExp.id, {
        name: manualName.trim() || undefined,
        text: manualText.trim(),
        source: 'manual',
      })
      if (res?.success) {
        setActiveExp(res.experiment)
        setManualModalOpen(false)
        setManualName('')
        setManualText('')
        showMsg('Variant added.')
        loadList(activeExp.id)
      } else {
        showErr(res?.error || 'Failed to add variant')
      }
    } catch (e) {
      showErr(e.message)
    }
  }

  // Generate AI Variants
  const handleGenerateAi = async () => {
    if (!activeExp) return
    setAiLoading(true)
    setAiSuggestions([])
    try {
      const res = await window.api?.generateCaptionExperimentVariants({
        sourceCaption: activeExp.sourceCaption,
        topic: activeExp.topic,
        platform: activeExp.platform,
        tone: activeExp.tone,
        mode: aiMode,
        count: aiCount,
      })
      if (res?.success) {
        setAiSuggestions(res.suggestions || [])
      } else {
        showErr(res?.error || 'AI generation failed')
      }
    } catch (e) {
      showErr(e.message)
    }
    setAiLoading(false)
  }

  const handleAddAiSuggestion = async (sug) => {
    if (!activeExp) return
    try {
      const res = await window.api?.addCaptionExperimentVariant(activeExp.id, {
        name: sug.name,
        text: sug.text,
        source: 'ai',
        qualityResult: sug.qualityResult,
      })
      if (res?.success) {
        setActiveExp(res.experiment)
        showMsg(`Added: ${sug.name}`)
        loadList(activeExp.id)
      } else {
        showErr(res?.error || 'Failed to add variant')
      }
    } catch (e) {
      showErr(e.message)
    }
  }

  // Optimize Selected Variant
  const handleStartOptimize = async (variant) => {
    setOptimizingVariant(variant)
    setOptimizeResult(null)
    setOptimizeModalOpen(true)
    setOptimizeLoading(true)
    try {
      const res = await window.api?.optimizeCaptionExperimentVariant(variant.text, {
        topic: activeExp?.topic,
        platform: activeExp?.platform,
        tone: activeExp?.tone,
      })
      if (res?.success) {
        setOptimizeResult(res)
      } else {
        showErr(res?.error || 'Optimization failed')
      }
    } catch (e) {
      showErr(e.message)
    }
    setOptimizeLoading(false)
  }

  const handleAddOptimizedAsVariant = async () => {
    if (!activeExp || !optimizeResult) return
    try {
      const res = await window.api?.addCaptionExperimentVariant(activeExp.id, {
        name: `Variant ${String.fromCharCode(65 + activeExp.variants.length)} — Optimized (${optimizeResult.recommendedMode})`,
        text: optimizeResult.optimizedText,
        source: 'improved',
      })
      if (res?.success) {
        setActiveExp(res.experiment)
        setOptimizeModalOpen(false)
        showMsg('Optimized variant added to experiment.')
        loadList(activeExp.id)
      } else {
        showErr(res?.error || 'Failed to add optimized variant')
      }
    } catch (e) {
      showErr(e.message)
    }
  }

  // Select Preferred Variant
  const handleSelectPreferred = async (variantId) => {
    if (!activeExp) return
    try {
      const res = await window.api?.selectCaptionExperimentVariant(activeExp.id, variantId)
      if (res?.success) {
        setActiveExp(res.experiment)
        showMsg('Preferred variant updated.')
        loadList(activeExp.id)
      } else {
        showErr(res?.error || 'Failed to select preferred variant')
      }
    } catch (e) {
      showErr(e.message)
    }
  }

  // Delete Variant
  const handleDeleteVariant = async (variantId) => {
    if (!activeExp) return
    try {
      const res = await window.api?.deleteCaptionExperimentVariant(activeExp.id, variantId)
      if (res?.success) {
        setActiveExp(res.experiment)
        showMsg('Variant deleted.')
        loadList(activeExp.id)
      } else {
        showErr(res?.error || 'Failed to delete variant')
      }
    } catch (e) {
      showErr(e.message)
    }
  }

  // Duplicate Experiment
  const handleDuplicate = async () => {
    if (!activeExp) return
    try {
      const res = await window.api?.duplicateCaptionExperiment(activeExp.id)
      if (res?.success) {
        showMsg(`Duplicated as "${res.experiment.name}"`)
        loadList(res.experiment.id)
      } else {
        showErr(res?.error || 'Duplicate failed')
      }
    } catch (e) {
      showErr(e.message)
    }
  }

  // Delete Experiment
  const handleDeleteExperiment = async () => {
    if (!activeExp) return
    try {
      const res = await window.api?.deleteCaptionExperiment(activeExp.id)
      if (res?.success) {
        showMsg('Experiment deleted.')
        loadList()
      } else {
        showErr(res?.error || 'Delete failed')
      }
    } catch (e) {
      showErr(e.message)
    }
  }

  // Compare Variants
  const handleCompare = async () => {
    if (!activeExp || !compareIdA || !compareIdB || compareIdA === compareIdB) {
      showErr('Select 2 different variants to compare')
      return
    }
    const varA = activeExp.variants.find(v => v.id === compareIdA)
    const varB = activeExp.variants.find(v => v.id === compareIdB)
    if (!varA || !varB) return
    try {
      const res = await window.api?.compareCaptionExperimentVariants(varA, varB)
      if (res?.success) {
        setCompareResult(res.comparison)
      } else {
        showErr(res?.error || 'Comparison failed')
      }
    } catch (e) {
      showErr(e.message)
    }
  }

  // Preferred variant reference
  const preferredVariant = activeExp?.variants?.find(v => v.id === activeExp.selectedVariantId) || activeExp?.variants?.[0]

  // Apply to Text Overlay
  const handleApplyToOverlay = () => {
    if (!preferredVariant) { showErr('No preferred variant selected'); return }
    if (onApplyOverlay) {
      onApplyOverlay(preferredVariant.text)
      showMsg('Applied preferred caption to Text Overlay.')
    }
  }

  // Save Preferred as Template
  const handleSaveAsTemplate = async () => {
    if (!preferredVariant) return
    try {
      if (onSaveTemplate) {
        await onSaveTemplate({ caption: preferredVariant.text })
        showMsg('Saved preferred variant as template.')
      } else if (window.api?.createCaptionTemplate) {
        const res = await window.api.createCaptionTemplate({
          name: `${activeExp?.name || 'Experiment'} - ${preferredVariant.name}`,
          overlays: [{
            id: `overlay_${Date.now()}`,
            text: preferredVariant.text,
            fontFamily: 'Arial',
            fontSize: 48,
            fontWeight: 'bold',
            color: '#FFFFFF',
            opacity: 1,
            backgroundColor: '#000000',
            backgroundOpacity: 0.4,
            outlineColor: '#000000',
            outlineWidth: 2,
            position: 'bottom',
            x: 0.5,
            y: 0.88,
            alignment: 'center',
            startTime: 0,
            endTime: null,
            enabled: true,
          }],
        })
        if (res?.success) showMsg('Saved preferred variant as template.')
        else showErr(res?.error || 'Failed to save template')
      }
    } catch (e) {
      showErr(e.message)
    }
  }

  // Save Preferred to History
  const handleSaveToHistory = async () => {
    if (!preferredVariant) return
    try {
      const q = preferredVariant.qualityResult
      const res = await window.api?.saveCaptionHistory?.({
        caption: preferredVariant.text,
        platform: activeExp?.platform || 'general',
        tone: activeExp?.tone || 'casual',
        score: q?.score ?? null,
        grade: q?.grade ?? null,
        signals: q?.signals ?? {},
        topic: activeExp?.topic,
        profileId: activeExp?.profileId,
        profileName: activeExp?.profileName,
        source: 'experiment',
      })
      if (res?.success) showMsg('Saved preferred variant to history.')
      else showErr(res?.error || 'Failed to save to history')
    } catch (e) {
      showErr(e.message)
    }
  }

  // Calculate best variant & weakest signal across current experiment
  const getBestVariantInfo = () => {
    if (!activeExp?.variants?.length) return null
    let best = activeExp.variants[0]
    let max = best.qualityResult?.score ?? 0
    for (const v of activeExp.variants) {
      const s = v.qualityResult?.score ?? 0
      if (s > max) { max = s; best = v }
    }
    return { name: best.name, score: max }
  }

  const getWeakestSignalInfo = () => {
    if (!activeExp?.variants?.length) return null
    const totals = { readability: 0, relevance: 0, clarity: 0, cta: 0, structure: 0 }
    const counts = { readability: 0, relevance: 0, clarity: 0, cta: 0, structure: 0 }
    for (const v of activeExp.variants) {
      const sigs = v.qualityResult?.signals || {}
      for (const [k, val] of Object.entries(sigs)) {
        if (typeof val === 'number') { totals[k] += val; counts[k] += 1 }
      }
    }
    let lowestKey = 'cta'
    let minAvg = 101
    for (const k of Object.keys(totals)) {
      const avg = counts[k] > 0 ? Math.round(totals[k] / counts[k]) : 70
      if (avg < minAvg) { minAvg = avg; lowestKey = k }
    }
    const map = { readability: 'Readability', relevance: 'Relevance', clarity: 'Clarity', cta: 'CTA Quality', structure: 'Structure' }
    return { label: map[lowestKey] || 'CTA Quality', avg: minAvg }
  }

  const bestInfo = getBestVariantInfo()
  const weakInfo = getWeakestSignalInfo()

  return (
    <div style={S.backdrop} onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div style={S.modal}>
        {/* Header */}
        <div style={S.header}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#f3e8ff' }}>🧪 Caption Experiment & Optimization</div>
            <div style={{ color: '#8080b0', fontSize: 11, marginTop: 2 }}>
              A/B Variant Testing · Quality Comparison · Heuristic Optimization
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

          {/* Experiment Switcher / Creator Header */}
          <div style={S.section}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#9090c0', textTransform: 'uppercase' }}>Experiment:</span>
                <select
                  value={activeExp?.id || ''}
                  onChange={(e) => {
                    const found = experiments.find(x => x.id === e.target.value)
                    if (found) setActiveExp(found)
                  }}
                  style={{ ...S.select, maxWidth: 300 }}
                  disabled={experiments.length === 0}
                >
                  {experiments.length === 0 ? (
                    <option value=''>No experiments</option>
                  ) : (
                    experiments.map(e => (
                      <option key={e.id} value={e.id}>{e.name} ({e.variants?.length || 0} variants)</option>
                    ))
                  )}
                </select>
              </div>

              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  style={S.btn('linear-gradient(135deg,#2b2559,#3e266a)', '#7c6af7', '#d6caff')}
                  onClick={() => {
                    setNewExpName(`Experiment ${experiments.length + 1}`)
                    setNewExpCaption(initialCaption || '')
                    setCreatingExp(true)
                  }}
                >
                  + New Experiment
                </button>
                {activeExp && (
                  <>
                    <button style={S.btn('#1c2035', '#48cae4', '#caf0f8')} onClick={handleDuplicate} title='Duplicate Experiment'>
                      ⧉ Duplicate
                    </button>
                    <button style={S.btn('#2a1414', '#ef4444', '#fca5a5')} onClick={handleDeleteExperiment} title='Delete Experiment'>
                      🗑️ Delete
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* New Experiment Creation Form Modal */}
          {creatingExp && (
            <div style={{ ...S.section, border: '1px solid #7c6af7' }}>
              <div style={S.sectionTitle}>
                <span>Create New Caption Experiment</span>
                <button style={{ ...S.closeBtn, fontSize: 14 }} onClick={() => setCreatingExp(false)}>✕</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8, marginBottom: 10 }}>
                <div>
                  <label style={S.label}>Experiment Name</label>
                  <input value={newExpName} onChange={e => setNewExpName(e.target.value)} style={S.input} placeholder='e.g. Summer Campaign' />
                </div>
                <div>
                  <label style={S.label}>Topic</label>
                  <input value={newExpTopic} onChange={e => setNewExpTopic(e.target.value)} style={S.input} placeholder='e.g. video tips' />
                </div>
                <div>
                  <label style={S.label}>Platform</label>
                  <select value={newExpPlatform} onChange={e => setNewExpPlatform(e.target.value)} style={S.select}>
                    {PLATFORMS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label style={S.label}>Tone</label>
                  <select value={newExpTone} onChange={e => setNewExpTone(e.target.value)} style={S.select}>
                    {TONES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={S.label}>Original Caption (Variant A)</label>
                <textarea
                  value={newExpCaption}
                  onChange={e => setNewExpCaption(e.target.value)}
                  style={S.textarea}
                  rows={3}
                  placeholder='Enter original reference caption...'
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={S.btn('linear-gradient(135deg,#2b2559,#3e266a)', '#7c6af7', '#d6caff')} onClick={handleCreateExperiment} disabled={loading}>
                  {loading ? 'Creating...' : '✓ Create Experiment'}
                </button>
                <button style={S.btn('transparent', '#444', '#aaa')} onClick={() => setCreatingExp(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!activeExp && !creatingExp && (
            <div style={{ ...S.section, textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🧪</div>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#f3e8ff', marginBottom: 6 }}>
                No caption experiments yet.
              </div>
              <div style={{ color: '#8888aa', fontSize: 13, maxWidth: 460, margin: '0 auto 16px auto' }}>
                Create multiple caption variants and compare their content-quality scores using deterministic heuristics.
              </div>
              <button
                style={S.btn('linear-gradient(135deg,#2b2559,#3e266a)', '#7c6af7', '#d6caff')}
                onClick={() => {
                  setNewExpName('Summer Campaign')
                  setNewExpCaption(initialCaption || '')
                  setCreatingExp(true)
                }}
              >
                + Create Experiment
              </button>
            </div>
          )}

          {/* Active Experiment Workspace */}
          {activeExp && !creatingExp && (
            <>
              {/* Insights Bar */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                <div style={{ background: '#101026', border: '1px solid #333355', borderRadius: 6, padding: '10px 12px' }}>
                  <div style={{ color: '#9090c0', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    🏆 Best Quality Variant
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#22c55e', marginTop: 2 }}>
                    {bestInfo ? `${bestInfo.name} (${bestInfo.score}/100)` : '—'}
                  </div>
                  <div style={{ color: '#555570', fontSize: 10, marginTop: 2 }}>
                    Highest overall quality score in this experiment.
                  </div>
                </div>

                <div style={{ background: '#101026', border: '1px solid #333355', borderRadius: 6, padding: '10px 12px' }}>
                  <div style={{ color: '#9090c0', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    ⚠️ Common Weakness
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#f59e0b', marginTop: 2 }}>
                    {weakInfo ? `${weakInfo.label} (avg ${weakInfo.avg}/100)` : '—'}
                  </div>
                  <div style={{ color: '#555570', fontSize: 10, marginTop: 2 }}>
                    {weakInfo ? `${weakInfo.label} is the lowest average signal across these variants.` : 'Quality signal breakdown'}
                  </div>
                </div>
              </div>

              {/* Variants Section */}
              <div style={S.section}>
                <div style={S.sectionTitle}>
                  <span>Variants ({activeExp.variants.length}/10)</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      style={S.btn('#1c2035', '#38bdf8', '#bae6fd')}
                      onClick={() => setManualModalOpen(true)}
                      disabled={activeExp.variants.length >= 10}
                    >
                      + Add Variant
                    </button>
                    <button
                      style={S.btn('linear-gradient(135deg,#2b2559,#3e266a)', '#7c6af7', '#d6caff')}
                      onClick={() => { setAiModalOpen(true); handleGenerateAi() }}
                      disabled={activeExp.variants.length >= 10}
                    >
                      ✨ Generate Variants
                    </button>
                  </div>
                </div>

                {/* Variant Cards List */}
                <div>
                  {activeExp.variants.map(v => (
                    <VariantCard
                      key={v.id}
                      variant={v}
                      isPreferred={v.id === activeExp.selectedVariantId}
                      onSelectPreferred={handleSelectPreferred}
                      onDelete={handleDeleteVariant}
                      canDelete={activeExp.variants.length > 1}
                      onOptimize={handleStartOptimize}
                    />
                  ))}
                </div>
              </div>

              {/* Side-by-Side Comparison */}
              <div style={S.section}>
                <div style={S.sectionTitle}>
                  <span>🔍 Read-Only Variant Comparison</span>
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={S.label}>Variant A</label>
                    <select value={compareIdA} onChange={e => setCompareIdA(e.target.value)} style={S.select}>
                      <option value=''>— Select Variant A —</option>
                      {activeExp.variants.map(v => <option key={v.id} value={v.id}>{v.name} ({(v.text || '').slice(0, 30)}...)</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={S.label}>Variant B</label>
                    <select value={compareIdB} onChange={e => setCompareIdB(e.target.value)} style={S.select}>
                      <option value=''>— Select Variant B —</option>
                      {activeExp.variants.map(v => <option key={v.id} value={v.id}>{v.name} ({(v.text || '').slice(0, 30)}...)</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button
                      style={S.btn('linear-gradient(135deg,#1b263b,#0d1b2a)', '#48cae4', '#caf0f8')}
                      onClick={handleCompare}
                    >
                      Compare
                    </button>
                  </div>
                </div>

                {compareResult && (
                  <div style={{ background: '#101020', border: '1px solid #2a2a48', borderRadius: 6, padding: 12 }}>
                    <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                      <div style={{ flex: 1, background: '#0a0a1a', border: '1px solid #222', borderRadius: 5, padding: 8 }}>
                        <div style={{ color: '#7070a0', fontSize: 10 }}>{compareResult.variantA?.name}</div>
                        <div style={{ fontSize: 12, color: '#e0e0f0', margin: '4px 0' }}>{compareResult.variantA?.text}</div>
                        <div style={{ color: '#38bdf8', fontSize: 11, fontWeight: 700 }}>
                          Score: {compareResult.variantA?.score}/100 ({compareResult.variantA?.grade})
                        </div>
                      </div>
                      <div style={{ flex: 1, background: '#0a0a1a', border: '1px solid #222', borderRadius: 5, padding: 8 }}>
                        <div style={{ color: '#7070a0', fontSize: 10 }}>{compareResult.variantB?.name}</div>
                        <div style={{ fontSize: 12, color: '#e0e0f0', margin: '4px 0' }}>{compareResult.variantB?.text}</div>
                        <div style={{ color: '#38bdf8', fontSize: 11, fontWeight: 700 }}>
                          Score: {compareResult.variantB?.score}/100 ({compareResult.variantB?.grade})
                        </div>
                      </div>
                    </div>

                    <div style={{ color: '#a0a0d0', fontSize: 12, marginBottom: 4 }}>
                      <strong>Winner:</strong>{' '}
                      <span style={{ color: compareResult.winner === 'A' ? '#c084fc' : compareResult.winner === 'B' ? '#38bdf8' : '#888' }}>
                        {compareResult.winner === 'EQUAL' ? 'Equal' : `Variant ${compareResult.winner}`}
                      </span>
                      {compareResult.scoreDiff != null && (
                        <span style={{ color: '#888', marginLeft: 8 }}>
                          (Δ {compareResult.scoreDiff > 0 ? '+' : ''}{compareResult.scoreDiff})
                        </span>
                      )}
                    </div>
                    <div style={{ color: '#8080c0', fontSize: 11, marginBottom: 4 }}>
                      {compareResult.verdict}
                    </div>
                    <div style={{ color: '#5a5a80', fontSize: 10 }}>
                      Higher quality score according to the current heuristic.
                    </div>
                  </div>
                )}
              </div>

              {/* Action Bar */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                <button
                  style={S.btn('linear-gradient(135deg,#2b2559,#3e266a)', '#7c6af7', '#d6caff')}
                  onClick={handleApplyToOverlay}
                  disabled={!preferredVariant}
                >
                  🎬 Apply Preferred to Overlay
                </button>
                <button
                  style={S.btn('#182638', '#38bdf8', '#bae6fd')}
                  onClick={handleSaveToHistory}
                  disabled={!preferredVariant}
                >
                  📚 Save Preferred to History
                </button>
                <button
                  style={S.btn('#232048', '#5c4df0', '#c2b8ff')}
                  onClick={handleSaveAsTemplate}
                  disabled={!preferredVariant}
                >
                  🏷️ Save Preferred as Template
                </button>
                <button
                  style={S.btn('transparent', '#444466', '#9090b0')}
                  onClick={onClose}
                >
                  Close
                </button>
              </div>
            </>
          )}

          {/* Add Manual Variant Modal */}
          {manualModalOpen && (
            <div style={S.backdrop} onClick={e => e.target === e.currentTarget && setManualModalOpen(false)}>
              <div style={{ ...S.modal, maxWidth: 500, padding: 16 }}>
                <div style={{ ...S.sectionTitle, marginBottom: 12 }}>
                  <span>+ Add Manual Variant</span>
                  <button style={S.closeBtn} onClick={() => setManualModalOpen(false)}>✕</button>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <label style={S.label}>Variant Name</label>
                  <input
                    value={manualName}
                    onChange={e => setManualName(e.target.value)}
                    placeholder='e.g. Variant B — Punchy CTA'
                    style={S.input}
                  />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={S.label}>Caption Text</label>
                  <textarea
                    value={manualText}
                    onChange={e => setManualText(e.target.value.slice(0, 500))}
                    maxLength={500}
                    rows={4}
                    style={S.textarea}
                    placeholder='Enter caption variant text...'
                  />
                  <div style={{ color: '#666', fontSize: 10, textAlign: 'right', marginTop: 2 }}>
                    {manualText.length}/500
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    style={S.btn('linear-gradient(135deg,#2b2559,#3e266a)', '#7c6af7', '#d6caff')}
                    onClick={handleAddManualVariant}
                  >
                    ✓ Save Variant
                  </button>
                  <button style={S.btn('transparent', '#444', '#aaa')} onClick={() => setManualModalOpen(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* AI Variant Generation Modal */}
          {aiModalOpen && (
            <div style={S.backdrop} onClick={e => e.target === e.currentTarget && setAiModalOpen(false)}>
              <div style={{ ...S.modal, maxWidth: 640, padding: 16 }}>
                <div style={{ ...S.sectionTitle, marginBottom: 12 }}>
                  <span>✨ Generate AI Variants</span>
                  <button style={S.closeBtn} onClick={() => setAiModalOpen(false)}>✕</button>
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <label style={S.label}>Mode</label>
                    <select value={aiMode} onChange={e => setAiMode(e.target.value)} style={S.select}>
                      <option value='better_hook'>🪝 Better Hook</option>
                      <option value='clearer'>💡 Clearer</option>
                      <option value='shorter'>✂️ Shorter</option>
                      <option value='stronger_cta'>📣 Stronger CTA</option>
                      <option value='promotional'>🎯 Promotional</option>
                      <option value='professional'>💼 Professional</option>
                      <option value='casual'>😊 Casual</option>
                    </select>
                  </div>
                  <div style={{ width: 90 }}>
                    <label style={S.label}>Count</label>
                    <input
                      type='number'
                      min={1}
                      max={5}
                      value={aiCount}
                      onChange={e => setAiCount(Math.min(5, Math.max(1, Number(e.target.value))))}
                      style={S.input}
                    />
                  </div>
                  <button
                    style={S.btn('linear-gradient(135deg,#2b2559,#3e266a)', '#7c6af7', '#d6caff')}
                    onClick={handleGenerateAi}
                    disabled={aiLoading}
                  >
                    {aiLoading ? 'Generating...' : 'Regenerate'}
                  </button>
                </div>

                <div style={{ maxHeight: 380, overflowY: 'auto' }}>
                  {aiSuggestions.map((sug, i) => (
                    <div key={i} style={{ background: '#101020', border: '1px solid #2a2a48', borderRadius: 6, padding: 10, marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, fontSize: 12, color: '#c084fc' }}>{sug.name}</span>
                        <span style={{ color: sug.score >= 80 ? '#22c55e' : '#f59e0b', fontWeight: 700, fontSize: 11 }}>
                          {sug.score}/100 ({sug.grade})
                        </span>
                      </div>
                      <p style={{ color: '#e0e0f0', fontSize: 12, margin: '4px 0 8px 0' }}>{sug.text}</p>
                      <button
                        style={S.btn('#1a2638', '#38bdf8', '#bae6fd')}
                        onClick={() => handleAddAiSuggestion(sug)}
                      >
                        + Add as Variant
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Heuristic Optimization Modal (Before / After) */}
          {optimizeModalOpen && (
            <div style={S.backdrop} onClick={e => e.target === e.currentTarget && setOptimizeModalOpen(false)}>
              <div style={{ ...S.modal, maxWidth: 600, padding: 16 }}>
                <div style={{ ...S.sectionTitle, marginBottom: 12 }}>
                  <span>⚡ Heuristic Variant Optimization</span>
                  <button style={S.closeBtn} onClick={() => setOptimizeModalOpen(false)}>✕</button>
                </div>

                {optimizeLoading && (
                  <div style={{ textAlign: 'center', padding: '30px 0', color: '#9090c0', fontSize: 13 }}>
                    Analyzing quality signals and generating heuristic optimization...
                  </div>
                )}

                {optimizeResult && (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                      {/* Current Variant */}
                      <div style={{ background: '#101020', border: '1px solid #333355', borderRadius: 6, padding: 10 }}>
                        <div style={{ color: '#7070a0', fontSize: 10, textTransform: 'uppercase' }}>Current Variant</div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#f59e0b', margin: '4px 0' }}>
                          {optimizeResult.beforeScore}/100 ({optimizeResult.beforeGrade})
                        </div>
                        <p style={{ color: '#ccc', fontSize: 12, margin: '6px 0' }}>{optimizeResult.original}</p>
                      </div>

                      {/* Optimized Variant */}
                      <div style={{ background: '#101020', border: '1px solid #8b5cf6', borderRadius: 6, padding: 10 }}>
                        <div style={{ color: '#c084fc', fontSize: 10, textTransform: 'uppercase' }}>Optimized Variant</div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#22c55e', margin: '4px 0' }}>
                          {optimizeResult.afterScore}/100 ({optimizeResult.afterGrade})
                          <span style={{ fontSize: 11, color: '#888', marginLeft: 6 }}>
                            (Δ {optimizeResult.scoreDiff > 0 ? '+' : ''}{optimizeResult.scoreDiff})
                          </span>
                        </div>
                        <p style={{ color: '#e0e0f0', fontSize: 12, margin: '6px 0' }}>{optimizeResult.optimizedText}</p>
                      </div>
                    </div>

                    <div style={{ color: '#5a5a80', fontSize: 10, marginBottom: 12 }}>
                      Quality score based on the current heuristic.
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        style={S.btn('linear-gradient(135deg,#2b2559,#3e266a)', '#7c6af7', '#d6caff')}
                        onClick={handleAddOptimizedAsVariant}
                      >
                        ✓ Add as New Variant
                      </button>
                      <button
                        style={S.btn('transparent', '#444', '#aaa')}
                        onClick={() => setOptimizeModalOpen(false)}
                      >
                        Keep Current
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
