import React, { useState, useCallback } from 'react'

const FONT_FAMILIES = ['Arial', 'Verdana', 'Tahoma', 'Georgia', 'Times New Roman', 'Courier New']
const POSITIONS = ['top', 'center', 'bottom', 'custom']
const ALIGNMENTS = ['left', 'center', 'right']
const WEIGHTS = ['normal', 'bold']

let _idCounter = 0
function makeId() {
  return `overlay_${Date.now()}_${++_idCounter}`
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

// ── Overlay Preview ──────────────────────────────────────────────────────────

function OverlayPreview({ overlays }) {
  // Simple canvas-style preview approximation
  const enabled = overlays.filter((o) => o.enabled && o.text.trim())
  return (
    <div style={{
      position: 'relative',
      width: '100%',
      paddingTop: '56.25%', // 16:9 ratio
      background: '#1a1a2e',
      border: '1px solid #333',
      borderRadius: 6,
      overflow: 'hidden',
      marginBottom: 8,
    }}>
      {/* Grid lines for guidance */}
      <div style={{ position: 'absolute', inset: 0, opacity: 0.07 }}>
        <div style={{ position: 'absolute', top: '10%', left: 0, right: 0, height: 1, background: '#fff' }} />
        <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: '#fff' }} />
        <div style={{ position: 'absolute', top: '90%', left: 0, right: 0, height: 1, background: '#fff' }} />
      </div>
      {/* Video frame icon */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#333', fontSize: 28,
      }}>
        {enabled.length === 0 && <span style={{ color: '#444', fontSize: 13 }}>Preview area — no active text</span>}
      </div>
      {/* Text overlays */}
      {enabled.map((o) => {
        let top, left, transform = ''
        if (o.position === 'top') { top = '10%'; left = '50%'; transform = 'translateX(-50%)' }
        else if (o.position === 'center') { top = '50%'; left = '50%'; transform = 'translate(-50%,-50%)' }
        else if (o.position === 'bottom') { top = '90%'; left = '50%'; transform = 'translate(-50%,-100%)' }
        else { top = `${o.y * 100}%`; left = `${o.x * 100}%`; transform = 'translate(-50%,-50%)' }

        const textAlign = o.alignment
        const bgStyle = o.backgroundOpacity > 0 ? {
          background: `${o.backgroundColor}`,
          opacity: o.backgroundOpacity,
          padding: '2px 6px',
          borderRadius: 3,
        } : {}

        return (
          <div key={o.id} style={{
            position: 'absolute', top, left, transform,
            fontSize: Math.max(10, Math.min(22, o.fontSize * 0.35)),
            fontFamily: o.fontFamily,
            fontWeight: o.fontWeight,
            color: o.color,
            opacity: o.opacity,
            textAlign,
            whiteSpace: 'pre-wrap',
            textShadow: o.outlineWidth > 0 ? `0 0 ${o.outlineWidth}px ${o.outlineColor}` : 'none',
            pointerEvents: 'none',
            ...bgStyle,
          }}>
            {o.text}
          </div>
        )
      })}
    </div>
  )
}

// ── Overlay Card ─────────────────────────────────────────────────────────────

function OverlayCard({ overlay, isActive, onSelect, onDuplicate, onDelete }) {
  const timing = overlay.endTime !== null
    ? `${overlay.startTime}s – ${overlay.endTime}s`
    : `${overlay.startTime}s → end`

  return (
    <div
      onClick={() => onSelect(overlay.id)}
      style={{
        cursor: 'pointer',
        background: isActive ? '#2d2d50' : '#1e1e35',
        border: `1px solid ${isActive ? '#7c6af7' : '#333'}`,
        borderRadius: 8,
        padding: '10px 12px',
        marginBottom: 8,
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            color: overlay.text ? '#e0e0e0' : '#666',
            fontWeight: 600,
            fontSize: 13,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            marginBottom: 4,
          }}>
            {overlay.text || '(empty text)'}
          </div>
          <div style={{ color: '#888', fontSize: 11 }}>
            {overlay.position.charAt(0).toUpperCase() + overlay.position.slice(1)} • {timing}
          </div>
          <div style={{ color: '#888', fontSize: 11, marginTop: 2 }}>
            {overlay.fontFamily} • {overlay.fontSize}px • {overlay.fontWeight}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, marginLeft: 8, flexShrink: 0 }}>
          <button
            onClick={(e) => { e.stopPropagation(); onDuplicate(overlay.id) }}
            title="Duplicate"
            style={btnStyle('#334')}
          >
            ⧉
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(overlay.id) }}
            title="Delete"
            style={btnStyle('#4a1e1e')}
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  )
}

function btnStyle(bg = '#333') {
  return {
    background: bg,
    border: '1px solid #555',
    borderRadius: 4,
    color: '#ccc',
    cursor: 'pointer',
    padding: '2px 7px',
    fontSize: 13,
  }
}

// ── Overlay Editor ────────────────────────────────────────────────────────────

function OverlayEditor({ overlay, onChange }) {
  const set = (field, value) => onChange({ ...overlay, [field]: value })

  return (
    <div style={{ background: '#151528', border: '1px solid #333', borderRadius: 8, padding: 14, marginBottom: 10 }}>
      {/* Text */}
      <label style={labelStyle}>Text</label>
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <textarea
          value={overlay.text}
          onChange={(e) => set('text', e.target.value)}
          maxLength={500}
          rows={3}
          style={{ ...inputStyle, resize: 'vertical', width: '100%', boxSizing: 'border-box' }}
          placeholder="Enter overlay text..."
        />
        <div style={{ position: 'absolute', bottom: 4, right: 6, color: '#666', fontSize: 10 }}>
          {overlay.text.length}/500
        </div>
      </div>

      {/* Font row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 2 }}>
          <label style={labelStyle}>Font Family</label>
          <select value={overlay.fontFamily} onChange={(e) => set('fontFamily', e.target.value)} style={inputStyle}>
            {FONT_FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Size</label>
          <input type="number" min={12} max={160} value={overlay.fontSize}
            onChange={(e) => set('fontSize', Math.min(160, Math.max(12, Number(e.target.value))))}
            style={inputStyle}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Weight</label>
          <select value={overlay.fontWeight} onChange={(e) => set('fontWeight', e.target.value)} style={inputStyle}>
            {WEIGHTS.map((w) => <option key={w} value={w}>{w.charAt(0).toUpperCase() + w.slice(1)}</option>)}
          </select>
        </div>
      </div>

      {/* Color / Opacity */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Text Color</label>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input type="color" value={overlay.color} onChange={(e) => set('color', e.target.value)}
              style={{ width: 36, height: 30, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }} />
            <input type="text" value={overlay.color}
              onChange={(e) => set('color', e.target.value)}
              style={{ ...inputStyle, flex: 1 }} />
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Opacity ({overlay.opacity})</label>
          <input type="range" min={0} max={1} step={0.05} value={overlay.opacity}
            onChange={(e) => set('opacity', parseFloat(e.target.value))}
            style={{ width: '100%' }} />
        </div>
      </div>

      {/* Background */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Background Color</label>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input type="color" value={overlay.backgroundColor}
              onChange={(e) => set('backgroundColor', e.target.value)}
              style={{ width: 36, height: 30, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }} />
            <input type="text" value={overlay.backgroundColor}
              onChange={(e) => set('backgroundColor', e.target.value)}
              style={{ ...inputStyle, flex: 1 }} />
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>BG Opacity ({overlay.backgroundOpacity})</label>
          <input type="range" min={0} max={1} step={0.05} value={overlay.backgroundOpacity}
            onChange={(e) => set('backgroundOpacity', parseFloat(e.target.value))}
            style={{ width: '100%' }} />
        </div>
      </div>

      {/* Outline */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Outline Color</label>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input type="color" value={overlay.outlineColor}
              onChange={(e) => set('outlineColor', e.target.value)}
              style={{ width: 36, height: 30, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }} />
            <input type="text" value={overlay.outlineColor}
              onChange={(e) => set('outlineColor', e.target.value)}
              style={{ ...inputStyle, flex: 1 }} />
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Outline Width ({overlay.outlineWidth}px)</label>
          <input type="range" min={0} max={10} step={1} value={overlay.outlineWidth}
            onChange={(e) => set('outlineWidth', parseInt(e.target.value))}
            style={{ width: '100%' }} />
        </div>
      </div>

      {/* Position */}
      <label style={labelStyle}>Position</label>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {POSITIONS.map((p) => (
          <button key={p} onClick={() => set('position', p)}
            style={{
              flex: 1,
              padding: '5px 4px',
              background: overlay.position === p ? '#5c4df0' : '#222',
              border: `1px solid ${overlay.position === p ? '#7c6af7' : '#444'}`,
              borderRadius: 5,
              color: overlay.position === p ? '#fff' : '#aaa',
              cursor: 'pointer',
              fontSize: 12,
            }}>
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

      {/* Custom x/y */}
      {overlay.position === 'custom' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>X ({overlay.x.toFixed(2)})</label>
            <input type="range" min={0} max={1} step={0.01} value={overlay.x}
              onChange={(e) => set('x', parseFloat(e.target.value))}
              style={{ width: '100%' }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Y ({overlay.y.toFixed(2)})</label>
            <input type="range" min={0} max={1} step={0.01} value={overlay.y}
              onChange={(e) => set('y', parseFloat(e.target.value))}
              style={{ width: '100%' }} />
          </div>
        </div>
      )}

      {/* Alignment */}
      <label style={labelStyle}>Alignment</label>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {ALIGNMENTS.map((a) => (
          <button key={a} onClick={() => set('alignment', a)}
            style={{
              flex: 1,
              padding: '5px 4px',
              background: overlay.alignment === a ? '#5c4df0' : '#222',
              border: `1px solid ${overlay.alignment === a ? '#7c6af7' : '#444'}`,
              borderRadius: 5,
              color: overlay.alignment === a ? '#fff' : '#aaa',
              cursor: 'pointer',
              fontSize: 12,
            }}>
            {a.charAt(0).toUpperCase() + a.slice(1)}
          </button>
        ))}
      </div>

      {/* Timing */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Start Time (s)</label>
          <input type="number" min={0} step={0.1} value={overlay.startTime}
            onChange={(e) => set('startTime', Math.max(0, parseFloat(e.target.value) || 0))}
            style={inputStyle} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>End Time (s, blank = end)</label>
          <input type="number" min={0} step={0.1}
            value={overlay.endTime !== null ? overlay.endTime : ''}
            placeholder="until end"
            onChange={(e) => {
              const v = e.target.value
              set('endTime', v === '' ? null : Math.max(0, parseFloat(v) || 0))
            }}
            style={inputStyle} />
        </div>
      </div>
    </div>
  )
}

const labelStyle = {
  display: 'block',
  color: '#aaa',
  fontSize: 11,
  marginBottom: 3,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
}

const inputStyle = {
  background: '#1a1a30',
  border: '1px solid #444',
  borderRadius: 4,
  color: '#e0e0e0',
  fontSize: 13,
  padding: '5px 8px',
  width: '100%',
  boxSizing: 'border-box',
  outline: 'none',
}

// ── Main TextOverlayPanel ─────────────────────────────────────────────────────

/**
 * TextOverlayPanel (Phase 4A)
 *
 * Props:
 *   overlays: Array<Object>          — controlled overlays state
 *   onChange: (Array<Object>) => void — called on every change
 *   disabled: boolean                 — disable all controls
 */
export default function TextOverlayPanel({ overlays = [], onChange, disabled = false }) {
  const [enabled, setEnabled] = useState(overlays.length > 0)
  const [activeId, setActiveId] = useState(null)

  const MAX_OVERLAYS = 5

  // Sync enabled state with overlays
  const handleEnable = (val) => {
    setEnabled(val)
    if (!val) {
      onChange([])
      setActiveId(null)
    } else if (overlays.length === 0) {
      const newOverlay = createDefaultOverlay()
      onChange([newOverlay])
      setActiveId(newOverlay.id)
    }
  }

  const addOverlay = () => {
    if (overlays.length >= MAX_OVERLAYS) return
    const newOverlay = createDefaultOverlay()
    const updated = [...overlays, newOverlay]
    onChange(updated)
    setActiveId(newOverlay.id)
  }

  const duplicateOverlay = (id) => {
    if (overlays.length >= MAX_OVERLAYS) return
    const src = overlays.find((o) => o.id === id)
    if (!src) return
    const dup = { ...src, id: makeId() }
    const idx = overlays.findIndex((o) => o.id === id)
    const updated = [...overlays.slice(0, idx + 1), dup, ...overlays.slice(idx + 1)]
    onChange(updated)
    setActiveId(dup.id)
  }

  const deleteOverlay = (id) => {
    const updated = overlays.filter((o) => o.id !== id)
    onChange(updated)
    if (activeId === id) setActiveId(updated.length > 0 ? updated[0].id : null)
  }

  const updateOverlay = (updated) => {
    onChange(overlays.map((o) => o.id === updated.id ? updated : o))
  }

  const reset = () => {
    onChange([])
    setEnabled(false)
    setActiveId(null)
  }

  const activeOverlay = overlays.find((o) => o.id === activeId) || null

  return (
    <div style={{ fontFamily: 'sans-serif', color: '#e0e0e0' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: '#12122a', borderRadius: 8, padding: '10px 14px', marginBottom: 10,
      }}>
        <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: '0.04em' }}>🗒 Text Overlay</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {enabled && (
            <button onClick={reset} style={{
              background: 'none', border: '1px solid #554', borderRadius: 4,
              color: '#aaa', fontSize: 11, cursor: 'pointer', padding: '3px 8px',
            }}>
              Reset
            </button>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 13 }}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => !disabled && handleEnable(e.target.checked)}
              disabled={disabled}
            />
            Enable Text Overlay
          </label>
        </div>
      </div>

      {enabled && (
        <>
          {/* Preview */}
          <OverlayPreview overlays={overlays} />

          {/* Overlay List */}
          {overlays.map((o) => (
            <OverlayCard
              key={o.id}
              overlay={o}
              isActive={activeId === o.id}
              onSelect={setActiveId}
              onDuplicate={duplicateOverlay}
              onDelete={deleteOverlay}
            />
          ))}

          {/* Add button */}
          {overlays.length < MAX_OVERLAYS ? (
            <button onClick={addOverlay} style={{
              width: '100%', padding: '8px 0', marginBottom: 10,
              background: '#1e1e35', border: '1px dashed #5c4df0',
              borderRadius: 6, color: '#7c6af7', fontSize: 13, cursor: 'pointer',
            }}>
              + Add Text Overlay
            </button>
          ) : (
            <div style={{
              textAlign: 'center', color: '#888', fontSize: 12,
              padding: '6px 0', marginBottom: 10,
            }}>
              Maximum 5 text overlays reached
            </div>
          )}

          {/* Active Editor */}
          {activeOverlay && (
            <OverlayEditor overlay={activeOverlay} onChange={updateOverlay} />
          )}
        </>
      )}
    </div>
  )
}
