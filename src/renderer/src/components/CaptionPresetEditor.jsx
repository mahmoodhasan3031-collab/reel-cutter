import React, { useState, useCallback, useEffect, useMemo } from 'react'

/**
 * CaptionPresetEditor (Phase 4B-2)
 *
 * Full editor for creating and editing caption template presets.
 * Operates entirely on a deep-cloned draft — never mutates the stored template
 * until Save is confirmed through main-process IPC.
 *
 * Props:
 *   mode         : 'create' | 'edit'
 *   template     : deep-cloned template object (for 'edit'), or null (for 'create')
 *   initialOverlays: Array<Object> — seed overlays when creating from existing config
 *   onSave       : (savedTemplate) => void — called after successful IPC save
 *   onCancel     : () => void — discard all changes
 */

const FONT_FAMILIES = ['Arial', 'Verdana', 'Tahoma', 'Georgia', 'Times New Roman', 'Courier New']
const POSITIONS     = ['top', 'center', 'bottom', 'custom']
const ALIGNMENTS    = ['left', 'center', 'right']
const WEIGHTS       = ['normal', 'bold']
const MAX_OVERLAYS  = 5
const MAX_TEXT_LEN  = 500
const HEX_REGEX     = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

// ── Helpers ──────────────────────────────────────────────────────────────────

let _idCounter = 0
function makeId() {
  return `ovl_${Date.now()}_${++_idCounter}_${Math.random().toString(36).slice(2, 6)}`
}

function deepClone(obj) {
  if (obj === undefined) return undefined
  return JSON.parse(JSON.stringify(obj))
}

function createDefaultOverlay(overrides = {}) {
  return {
    id: makeId(),
    text: '',
    fontFamily: 'Arial',
    fontSize: 48,
    fontWeight: 'normal',
    color: '#FFFFFF',
    opacity: 1,
    backgroundColor: '#000000',
    backgroundOpacity: 0,
    outlineColor: '#000000',
    outlineWidth: 0,
    position: 'bottom',
    x: 0.5,
    y: 0.9,
    alignment: 'center',
    startTime: 0,
    endTime: null,
    enabled: true,
    ...overrides,
  }
}

function buildInitialDraft(mode, template, initialOverlays) {
  if (mode === 'edit' && template) {
    return {
      name: template.name || '',
      description: template.description || '',
      overlays: deepClone(template.overlays) || [],
    }
  }
  // create mode
  const overlays = initialOverlays && initialOverlays.length > 0
    ? deepClone(initialOverlays).map(o => ({ ...o, id: makeId() }))
    : [createDefaultOverlay()]
  return { name: '', description: '', overlays }
}

// ── Live Preview ──────────────────────────────────────────────────────────────

function OverlayPreview({ overlays }) {
  const enabled = overlays.filter(o => o.enabled && o.text && o.text.trim())
  return (
    <div style={{
      position: 'relative',
      width: '100%',
      paddingTop: '56.25%',
      background: '#0e0e1c',
      border: '1px solid #2a2a44',
      borderRadius: 6,
      overflow: 'hidden',
      marginBottom: 10,
    }}>
      {/* Guide lines */}
      <div style={{ position: 'absolute', inset: 0, opacity: 0.07 }}>
        <div style={{ position: 'absolute', top: '10%', left: 0, right: 0, height: 1, background: '#fff' }} />
        <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: '#fff' }} />
        <div style={{ position: 'absolute', top: '90%', left: 0, right: 0, height: 1, background: '#fff' }} />
      </div>
      {enabled.length === 0 && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#444', fontSize: 12,
        }}>
          Preview area — enable text overlay to preview
        </div>
      )}
      {enabled.map(o => {
        let top, left, transform = ''
        if (o.position === 'top')    { top = '10%'; left = '50%'; transform = 'translateX(-50%)' }
        else if (o.position === 'center') { top = '50%'; left = '50%'; transform = 'translate(-50%,-50%)' }
        else if (o.position === 'bottom') { top = '90%'; left = '50%'; transform = 'translate(-50%,-100%)' }
        else { top = `${o.y * 100}%`; left = `${o.x * 100}%`; transform = 'translate(-50%,-50%)' }

        return (
          <div key={o.id} style={{
            position: 'absolute', top, left, transform,
            fontSize: Math.max(9, Math.min(24, o.fontSize * 0.35)),
            fontFamily: o.fontFamily,
            fontWeight: o.fontWeight,
            color: o.color,
            opacity: o.opacity,
            textAlign: o.alignment,
            whiteSpace: 'pre-wrap',
            textShadow: o.outlineWidth > 0 ? `0 0 ${o.outlineWidth}px ${o.outlineColor}` : 'none',
            background: o.backgroundOpacity > 0 ? o.backgroundColor : 'transparent',
            padding: o.backgroundOpacity > 0 ? '2px 6px' : 0,
            borderRadius: 3,
            pointerEvents: 'none',
            maxWidth: '90%',
          }}>
            {o.text}
          </div>
        )
      })}
    </div>
  )
}

// ── Overlay List Item ─────────────────────────────────────────────────────────

function OverlayListItem({ overlay, index, isActive, onSelect, onToggleEnabled, onDuplicate, onDelete, canAdd }) {
  const timing = overlay.endTime !== null
    ? `${overlay.startTime}s–${overlay.endTime}s`
    : `${overlay.startTime}s→end`
  return (
    <div
      onClick={() => onSelect(overlay.id)}
      style={{
        cursor: 'pointer',
        background: isActive ? '#252550' : '#181833',
        border: `1px solid ${isActive ? '#7c6af7' : '#2e2e50'}`,
        borderRadius: 7,
        padding: '9px 11px',
        marginBottom: 6,
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <span style={{ fontSize: 11, color: '#7070a0', flexShrink: 0 }}>#{index + 1}</span>
            <span style={{
              color: overlay.text ? '#e0e0f0' : '#555577',
              fontWeight: 600, fontSize: 12,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {overlay.text || '(empty text)'}
            </span>
            {!overlay.enabled && (
              <span style={{ fontSize: 10, background: '#2a2a40', color: '#666688', padding: '1px 5px', borderRadius: 3, flexShrink: 0 }}>
                disabled
              </span>
            )}
          </div>
          <div style={{ color: '#666688', fontSize: 10 }}>
            {overlay.fontFamily} • {overlay.fontSize}px • {overlay.fontWeight} • {overlay.position} • {timing}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onToggleEnabled(overlay.id) }}
            title={overlay.enabled ? 'Disable overlay' : 'Enable overlay'}
            style={smallBtn(overlay.enabled ? '#1a2a1a' : '#2a2a40')}
          >
            {overlay.enabled ? '✓' : '○'}
          </button>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onDuplicate(overlay.id) }}
            disabled={!canAdd}
            title={canAdd ? 'Duplicate overlay' : 'Maximum overlays reached'}
            style={smallBtn('#1e1e38', !canAdd)}
          >
            ⧉
          </button>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onDelete(overlay.id) }}
            title="Delete overlay"
            style={smallBtn('#3a1a1a')}
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  )
}

function smallBtn(bg, disabled = false) {
  return {
    background: bg,
    border: '1px solid #3a3a5a',
    borderRadius: 4,
    color: disabled ? '#444' : '#b0b0cc',
    cursor: disabled ? 'not-allowed' : 'pointer',
    padding: '3px 6px',
    fontSize: 12,
    lineHeight: 1,
    opacity: disabled ? 0.5 : 1,
  }
}

// ── Overlay Editor Fields ─────────────────────────────────────────────────────

function OverlayEditor({ overlay, onChange }) {
  const set = (field, value) => onChange({ ...overlay, [field]: value })

  return (
    <div style={{ background: '#101022', border: '1px solid #252545', borderRadius: 8, padding: 14 }}>

      {/* Enabled toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ ...labelSt, marginBottom: 0 }}>Overlay Enabled</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12 }}>
          <input
            type="checkbox"
            checked={overlay.enabled}
            onChange={e => set('enabled', e.target.checked)}
          />
          {overlay.enabled ? 'On' : 'Off'}
        </label>
      </div>

      {/* Text */}
      <label style={labelSt}>Text</label>
      <div style={{ position: 'relative', marginBottom: 12 }}>
        <textarea
          value={overlay.text}
          onChange={e => set('text', e.target.value)}
          maxLength={MAX_TEXT_LEN}
          rows={3}
          style={{ ...inputSt, resize: 'vertical', width: '100%', boxSizing: 'border-box' }}
          placeholder="Enter overlay text..."
        />
        <div style={{ position: 'absolute', bottom: 4, right: 6, color: '#555', fontSize: 10 }}>
          {overlay.text.length}/{MAX_TEXT_LEN}
        </div>
      </div>

      {/* Typography row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 2 }}>
          <label style={labelSt}>Font Family</label>
          <select value={overlay.fontFamily} onChange={e => set('fontFamily', e.target.value)} style={inputSt}>
            {FONT_FAMILIES.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelSt}>Size</label>
          <input type="number" min={12} max={160} value={overlay.fontSize}
            onChange={e => set('fontSize', Math.min(160, Math.max(12, Number(e.target.value) || 12)))}
            style={inputSt}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelSt}>Weight</label>
          <select value={overlay.fontWeight} onChange={e => set('fontWeight', e.target.value)} style={inputSt}>
            {WEIGHTS.map(w => <option key={w} value={w}>{w.charAt(0).toUpperCase() + w.slice(1)}</option>)}
          </select>
        </div>
      </div>

      {/* Text Color / Opacity */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={labelSt}>Text Color</label>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input type="color" value={overlay.color.length === 7 ? overlay.color : '#FFFFFF'}
              onChange={e => set('color', e.target.value.toUpperCase())}
              style={{ width: 34, height: 28, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }} />
            <input type="text" value={overlay.color}
              onChange={e => set('color', e.target.value)}
              style={{ ...inputSt, flex: 1 }} placeholder="#FFFFFF" />
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelSt}>Opacity ({overlay.opacity})</label>
          <input type="range" min={0} max={1} step={0.05} value={overlay.opacity}
            onChange={e => set('opacity', parseFloat(e.target.value))}
            style={{ width: '100%', marginTop: 6 }} />
        </div>
      </div>

      {/* Background */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={labelSt}>Background Color</label>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input type="color" value={overlay.backgroundColor.length === 7 ? overlay.backgroundColor : '#000000'}
              onChange={e => set('backgroundColor', e.target.value.toUpperCase())}
              style={{ width: 34, height: 28, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }} />
            <input type="text" value={overlay.backgroundColor}
              onChange={e => set('backgroundColor', e.target.value)}
              style={{ ...inputSt, flex: 1 }} placeholder="#000000" />
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelSt}>BG Opacity ({overlay.backgroundOpacity})</label>
          <input type="range" min={0} max={1} step={0.05} value={overlay.backgroundOpacity}
            onChange={e => set('backgroundOpacity', parseFloat(e.target.value))}
            style={{ width: '100%', marginTop: 6 }} />
        </div>
      </div>

      {/* Outline */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={labelSt}>Outline Color</label>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input type="color" value={overlay.outlineColor.length === 7 ? overlay.outlineColor : '#000000'}
              onChange={e => set('outlineColor', e.target.value.toUpperCase())}
              style={{ width: 34, height: 28, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }} />
            <input type="text" value={overlay.outlineColor}
              onChange={e => set('outlineColor', e.target.value)}
              style={{ ...inputSt, flex: 1 }} placeholder="#000000" />
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelSt}>Outline Width ({overlay.outlineWidth}px)</label>
          <input type="range" min={0} max={10} step={1} value={overlay.outlineWidth}
            onChange={e => set('outlineWidth', parseInt(e.target.value))}
            style={{ width: '100%', marginTop: 6 }} />
        </div>
      </div>

      {/* Position */}
      <label style={labelSt}>Position</label>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {POSITIONS.map(p => (
          <button key={p} type="button" onClick={() => set('position', p)} style={{
            flex: 1, padding: '5px 4px',
            background: overlay.position === p ? '#4a3de0' : '#1a1a30',
            border: `1px solid ${overlay.position === p ? '#7c6af7' : '#333350'}`,
            borderRadius: 5, color: overlay.position === p ? '#fff' : '#9090b0',
            cursor: 'pointer', fontSize: 11,
          }}>
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

      {/* Custom x/y */}
      {overlay.position === 'custom' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={labelSt}>X ({overlay.x.toFixed(2)})</label>
            <input type="range" min={0} max={1} step={0.01} value={overlay.x}
              onChange={e => set('x', parseFloat(e.target.value))}
              style={{ width: '100%' }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelSt}>Y ({overlay.y.toFixed(2)})</label>
            <input type="range" min={0} max={1} step={0.01} value={overlay.y}
              onChange={e => set('y', parseFloat(e.target.value))}
              style={{ width: '100%' }} />
          </div>
        </div>
      )}

      {/* Alignment */}
      <label style={labelSt}>Alignment</label>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {ALIGNMENTS.map(a => (
          <button key={a} type="button" onClick={() => set('alignment', a)} style={{
            flex: 1, padding: '5px 4px',
            background: overlay.alignment === a ? '#4a3de0' : '#1a1a30',
            border: `1px solid ${overlay.alignment === a ? '#7c6af7' : '#333350'}`,
            borderRadius: 5, color: overlay.alignment === a ? '#fff' : '#9090b0',
            cursor: 'pointer', fontSize: 11,
          }}>
            {a.charAt(0).toUpperCase() + a.slice(1)}
          </button>
        ))}
      </div>

      {/* Timing */}
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <label style={labelSt}>Start Time (s)</label>
          <input type="number" min={0} step={0.1} value={overlay.startTime}
            onChange={e => set('startTime', Math.max(0, parseFloat(e.target.value) || 0))}
            style={inputSt} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelSt}>End Time (s, blank = clip end)</label>
          <input type="number" min={0} step={0.1}
            value={overlay.endTime !== null ? overlay.endTime : ''}
            placeholder="until end"
            onChange={e => {
              const v = e.target.value
              set('endTime', v === '' ? null : Math.max(0, parseFloat(v) || 0))
            }}
            style={inputSt} />
        </div>
      </div>
    </div>
  )
}

// ── Client-side validation (mirrors main-process rules for UX feedback) ────────

function validateDraft(draft) {
  const errors = []
  const name = (draft.name || '').trim()
  if (!name) errors.push('Template name is required.')
  else if (name.length > 100) errors.push('Template name cannot exceed 100 characters.')

  const desc = (draft.description || '').trim()
  if (desc.length > 300) errors.push('Description cannot exceed 300 characters.')

  if (!Array.isArray(draft.overlays) || draft.overlays.length === 0)
    errors.push('Template must have at least one overlay.')
  else if (draft.overlays.length > MAX_OVERLAYS)
    errors.push(`Template cannot have more than ${MAX_OVERLAYS} overlays.`)
  else {
    for (let i = 0; i < draft.overlays.length; i++) {
      const o = draft.overlays[i]
      if (typeof o.text !== 'string') errors.push(`Overlay ${i + 1}: text must be a string.`)
      else if (o.text.length > MAX_TEXT_LEN) errors.push(`Overlay ${i + 1}: text exceeds 500 characters.`)
      if (!FONT_FAMILIES.includes(o.fontFamily)) errors.push(`Overlay ${i + 1}: invalid font family.`)
      if (o.fontFamily.includes('/') || o.fontFamily.includes('\\'))
        errors.push(`Overlay ${i + 1}: arbitrary font paths are not allowed.`)
      if (o.fontSize < 12 || o.fontSize > 160) errors.push(`Overlay ${i + 1}: font size must be 12–160.`)
      if (!WEIGHTS.includes(o.fontWeight)) errors.push(`Overlay ${i + 1}: invalid font weight.`)
      if (!HEX_REGEX.test((o.color || '').trim())) errors.push(`Overlay ${i + 1}: invalid text color hex.`)
      if (!HEX_REGEX.test((o.backgroundColor || '').trim())) errors.push(`Overlay ${i + 1}: invalid background color hex.`)
      if (!HEX_REGEX.test((o.outlineColor || '').trim())) errors.push(`Overlay ${i + 1}: invalid outline color hex.`)
      if (o.opacity < 0 || o.opacity > 1) errors.push(`Overlay ${i + 1}: opacity must be 0–1.`)
      if (o.backgroundOpacity < 0 || o.backgroundOpacity > 1) errors.push(`Overlay ${i + 1}: bg opacity must be 0–1.`)
      if (o.outlineWidth < 0 || o.outlineWidth > 10) errors.push(`Overlay ${i + 1}: outline width must be 0–10.`)
      if (!POSITIONS.includes(o.position)) errors.push(`Overlay ${i + 1}: invalid position.`)
      if (!ALIGNMENTS.includes(o.alignment)) errors.push(`Overlay ${i + 1}: invalid alignment.`)
      if (typeof o.startTime !== 'number' || o.startTime < 0) errors.push(`Overlay ${i + 1}: startTime must be >= 0.`)
      if (o.endTime !== null && o.endTime !== undefined) {
        if (typeof o.endTime !== 'number' || o.endTime <= o.startTime)
          errors.push(`Overlay ${i + 1}: endTime must be greater than startTime.`)
      }
    }
  }
  return errors
}

// ── Main CaptionPresetEditor ──────────────────────────────────────────────────

/**
 * CaptionPresetEditor — Phase 4B-2
 *
 * Renders a full modal editor for creating or editing a caption preset template.
 */
export default function CaptionPresetEditor({
  mode = 'create',       // 'create' | 'edit'
  template = null,       // deep-cloned template (for edit), or null (for create)
  initialOverlays = [],  // seed overlays for create-from-existing
  onSave,
  onCancel,
}) {
  // Build initial draft once — stored separately so Reset can restore to it
  const [initialDraft] = useState(() => buildInitialDraft(mode, template, initialOverlays))
  const [draft, setDraft] = useState(() => deepClone(initialDraft))
  const [activeOverlayId, setActiveOverlayId] = useState(() => {
    const d = buildInitialDraft(mode, template, initialOverlays)
    return d.overlays.length > 0 ? d.overlays[0].id : null
  })

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  // ── Draft helpers ──────────────────────────────────────────────────────────

  const setDraftField = useCallback((field, value) => {
    setDraft(prev => ({ ...prev, [field]: value }))
  }, [])

  const updateOverlayInDraft = useCallback((updatedOverlay) => {
    setDraft(prev => ({
      ...prev,
      overlays: prev.overlays.map(o => o.id === updatedOverlay.id ? updatedOverlay : o),
    }))
  }, [])

  const addOverlay = useCallback(() => {
    setDraft(prev => {
      if (prev.overlays.length >= MAX_OVERLAYS) return prev
      const newOvl = createDefaultOverlay()
      setActiveOverlayId(newOvl.id)
      return { ...prev, overlays: [...prev.overlays, newOvl] }
    })
  }, [])

  const duplicateOverlay = useCallback((id) => {
    setDraft(prev => {
      if (prev.overlays.length >= MAX_OVERLAYS) return prev
      const src = prev.overlays.find(o => o.id === id)
      if (!src) return prev
      const dup = { ...deepClone(src), id: makeId() }
      const idx = prev.overlays.findIndex(o => o.id === id)
      const next = [...prev.overlays.slice(0, idx + 1), dup, ...prev.overlays.slice(idx + 1)]
      setActiveOverlayId(dup.id)
      return { ...prev, overlays: next }
    })
  }, [])

  const deleteOverlay = useCallback((id) => {
    setDraft(prev => {
      const next = prev.overlays.filter(o => o.id !== id)
      if (activeOverlayId === id) {
        setActiveOverlayId(next.length > 0 ? next[0].id : null)
      }
      return { ...prev, overlays: next }
    })
  }, [activeOverlayId])

  const toggleOverlayEnabled = useCallback((id) => {
    setDraft(prev => ({
      ...prev,
      overlays: prev.overlays.map(o => o.id === id ? { ...o, enabled: !o.enabled } : o),
    }))
  }, [])

  // ── Reset: restore to initial draft state ──────────────────────────────────
  const handleReset = useCallback(() => {
    const restored = deepClone(initialDraft)
    setDraft(restored)
    setActiveOverlayId(restored.overlays.length > 0 ? restored.overlays[0].id : null)
    setSaveError(null)
  }, [initialDraft])

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (saving) return
    setSaveError(null)

    const errors = validateDraft(draft)
    if (errors.length > 0) {
      setSaveError(errors.join(' '))
      return
    }

    if (!window.api) {
      setSaveError('Cannot reach main process. Please restart the app.')
      return
    }

    setSaving(true)
    try {
      const payload = {
        name: draft.name.trim(),
        description: (draft.description || '').trim(),
        overlays: deepClone(draft.overlays),
      }

      let res
      if (mode === 'edit' && template && template.id) {
        res = await window.api.updateCaptionTemplate(template.id, payload)
      } else {
        res = await window.api.createCaptionTemplate(payload)
      }

      if (res && res.success) {
        if (onSave) onSave(res.template || res)
      } else {
        setSaveError(res?.error || 'Failed to save template. Please try again.')
      }
    } catch (err) {
      setSaveError(err.message || 'Unexpected error saving template.')
    } finally {
      setSaving(false)
    }
  }, [draft, mode, template, saving, onSave])

  // ── Cancel ─────────────────────────────────────────────────────────────────
  const handleCancel = useCallback(() => {
    if (onCancel) onCancel()
  }, [onCancel])

  // ── Derived ────────────────────────────────────────────────────────────────
  const activeOverlay = useMemo(
    () => draft.overlays.find(o => o.id === activeOverlayId) || null,
    [draft.overlays, activeOverlayId]
  )

  const canAddOverlay = draft.overlays.length < MAX_OVERLAYS
  const validationErrors = useMemo(() => validateDraft(draft), [draft])
  const hasErrors = validationErrors.length > 0

  const isEdit = mode === 'edit'
  const editorTitle = isEdit ? `Edit Template: ${template?.name || ''}` : 'Create Caption Template'

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={backdropSt}>
      <div style={editorBoxSt}>

        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid #252545', paddingBottom: 12, marginBottom: 14,
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#f0f0ff' }}>
              {isEdit ? '✎' : '+'} {editorTitle}
            </div>
            <div style={{ fontSize: 11, color: '#6666a0', marginTop: 2 }}>
              {isEdit ? 'Editing custom template — built-ins remain unchanged' : 'New custom caption template'}
            </div>
          </div>
          <button type="button" onClick={handleCancel} style={{
            background: 'none', border: 'none', color: '#9090b0',
            fontSize: 18, cursor: 'pointer', padding: '0 4px', lineHeight: 1,
          }} title="Cancel and discard changes">✕</button>
        </div>

        {/* ── Two-column layout ── */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>

          {/* ── Left column: template meta + overlay list + preview ── */}
          <div style={{ flex: '0 0 270px', display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* Template name */}
            <div>
              <label style={labelSt}>Template Name *</label>
              <input
                type="text"
                maxLength={100}
                value={draft.name}
                onChange={e => setDraftField('name', e.target.value)}
                placeholder="e.g. My Brand Captions"
                style={inputSt}
                autoFocus
              />
            </div>

            {/* Description */}
            <div>
              <label style={labelSt}>Description</label>
              <textarea
                maxLength={300}
                rows={2}
                value={draft.description}
                onChange={e => setDraftField('description', e.target.value)}
                placeholder="Short notes about style or use-case"
                style={{ ...inputSt, resize: 'vertical' }}
              />
            </div>

            {/* Live preview */}
            <div>
              <label style={labelSt}>Live Preview</label>
              <OverlayPreview overlays={draft.overlays} />
            </div>

            {/* Overlay list */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ ...labelSt, marginBottom: 0 }}>
                  Overlays ({draft.overlays.length}/{MAX_OVERLAYS})
                </label>
              </div>

              {draft.overlays.length === 0 && (
                <div style={{ color: '#555577', fontSize: 12, textAlign: 'center', padding: '10px 0' }}>
                  No overlays — add one below.
                </div>
              )}

              {draft.overlays.map((o, i) => (
                <OverlayListItem
                  key={o.id}
                  overlay={o}
                  index={i}
                  isActive={activeOverlayId === o.id}
                  onSelect={setActiveOverlayId}
                  onToggleEnabled={toggleOverlayEnabled}
                  onDuplicate={duplicateOverlay}
                  onDelete={deleteOverlay}
                  canAdd={canAddOverlay}
                />
              ))}

              {canAddOverlay ? (
                <button type="button" onClick={addOverlay} style={{
                  width: '100%', padding: '7px 0', marginTop: 2,
                  background: '#141430', border: '1px dashed #4a3de0',
                  borderRadius: 6, color: '#7c6af7', fontSize: 12, cursor: 'pointer',
                }}>
                  + Add Overlay
                </button>
              ) : (
                <div style={{ textAlign: 'center', color: '#666688', fontSize: 11, padding: '6px 0' }}>
                  Maximum {MAX_OVERLAYS} overlays reached
                </div>
              )}
            </div>
          </div>

          {/* ── Right column: overlay editor ── */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {activeOverlay ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 6 }}>
                  <label style={{ ...labelSt, marginBottom: 0 }}>
                    Editing Overlay #{draft.overlays.findIndex(o => o.id === activeOverlayId) + 1}
                  </label>
                </div>
                <OverlayEditor overlay={activeOverlay} onChange={updateOverlayInDraft} />
              </>
            ) : (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: 200, color: '#444466', fontSize: 13,
                border: '1px dashed #252545', borderRadius: 8,
              }}>
                Select an overlay to edit it
              </div>
            )}
          </div>
        </div>

        {/* ── Footer: errors + actions ── */}
        <div style={{ borderTop: '1px solid #252545', paddingTop: 12, marginTop: 14 }}>
          {saveError && (
            <div style={{
              background: '#3b1212', border: '1px solid #882222', color: '#ffaaaa',
              padding: '7px 10px', borderRadius: 5, fontSize: 12, marginBottom: 10,
            }}>
              {saveError}
            </div>
          )}

          {hasErrors && !saveError && (
            <div style={{
              background: '#1c1c30', border: '1px solid #333355', color: '#9090b0',
              padding: '6px 10px', borderRadius: 5, fontSize: 11, marginBottom: 10,
            }}>
              ⚠ {validationErrors[0]}{validationErrors.length > 1 ? ` (+${validationErrors.length - 1} more)` : ''}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <button type="button" onClick={handleReset} style={{
              background: 'transparent', border: '1px solid #333355',
              color: '#7070a0', borderRadius: 4, padding: '6px 12px', fontSize: 12, cursor: 'pointer',
            }} title="Reset editor to last saved state">
              Reset Editor
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={handleCancel} disabled={saving} style={{
                background: 'transparent', border: '1px solid #444466',
                color: '#9090b0', borderRadius: 4, padding: '6px 14px', fontSize: 12,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}>
                Cancel
              </button>
              <button type="button" onClick={handleSave} disabled={saving || hasErrors} style={{
                background: saving || hasErrors ? '#2a2a50' : '#5c4df0',
                border: '1px solid #7c6af7',
                color: saving || hasErrors ? '#7070a0' : '#fff',
                borderRadius: 4, padding: '6px 18px', fontSize: 12, fontWeight: 600,
                cursor: saving || hasErrors ? 'not-allowed' : 'pointer',
              }}>
                {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Template'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const backdropSt = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.75)',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  zIndex: 9999,
  padding: '16px',
  overflowY: 'auto',
}

const editorBoxSt = {
  background: '#12121e',
  border: '1px solid #2e2e50',
  borderRadius: 10,
  padding: 20,
  width: '100%',
  maxWidth: 860,
  boxSizing: 'border-box',
  color: '#e0e0f0',
  boxShadow: '0 10px 40px rgba(0,0,0,0.8)',
  marginTop: 'auto',
  marginBottom: 'auto',
  alignSelf: 'flex-start',
}

const labelSt = {
  display: 'block',
  color: '#9090b0',
  fontSize: 10,
  marginBottom: 4,
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
}

const inputSt = {
  background: '#0e0e1e',
  border: '1px solid #2e2e50',
  borderRadius: 5,
  color: '#e0e0f0',
  fontSize: 12,
  padding: '6px 8px',
  width: '100%',
  boxSizing: 'border-box',
  outline: 'none',
}
