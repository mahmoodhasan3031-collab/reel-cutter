import React, { useState, useEffect, useMemo, useCallback } from 'react'

/**
 * CaptionTemplateLibrary (Phase 4B-1)
 *
 * Provides a rich template gallery for caption presets (built-ins + custom).
 * Allows users to browse, search, filter, apply, duplicate, edit, and delete templates.
 */
export default function CaptionTemplateLibrary({
  currentOverlays = [],
  onApplyTemplate,
  disabled = false,
}) {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [activeFilter, setActiveFilter] = useState('all') // 'all' | 'builtin' | 'custom'
  const [searchQuery, setSearchQuery] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  // Modals / forms
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saveDesc, setSaveDesc] = useState('')
  const [saveError, setSaveError] = useState(null)

  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editError, setEditError] = useState(null)

  const [deleteConfirmId, setDeleteConfirmId] = useState(null)

  // Fetch templates from main process
  const loadTemplates = useCallback(async () => {
    if (!window.api?.getCaptionTemplates) return
    setLoading(true)
    setError(null)
    try {
      const res = await window.api.getCaptionTemplates()
      if (res && res.success) {
        setTemplates(res.templates || [])
      } else {
        setError(res?.error || 'Failed to load caption templates')
      }
    } catch (err) {
      setError(err.message || 'Error loading templates')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  // Filter & search
  const filteredTemplates = useMemo(() => {
    return templates.filter((tpl) => {
      // Tab filter
      if (activeFilter === 'builtin' && !tpl.isBuiltIn) return false
      if (activeFilter === 'custom' && tpl.isBuiltIn) return false

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const nameMatch = tpl.name?.toLowerCase().includes(q)
        const descMatch = tpl.description?.toLowerCase().includes(q)
        if (!nameMatch && !descMatch) return false
      }
      return true
    })
  }, [templates, activeFilter, searchQuery])

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleApply = (tpl) => {
    if (disabled || !tpl.overlays || tpl.overlays.length === 0) return
    if (onApplyTemplate) {
      // Deep clone overlays to prevent reference leaks
      const cloned = JSON.parse(JSON.stringify(tpl.overlays))
      onApplyTemplate(cloned, tpl)
    }
  }

  const handleOpenSaveModal = () => {
    if (currentOverlays.length === 0) {
      setError('Cannot save empty overlay configuration as a template. Add at least one overlay.')
      return
    }
    setSaveName('')
    setSaveDesc('')
    setSaveError(null)
    setSaveModalOpen(true)
  }

  const handleSaveCurrent = async (e) => {
    e.preventDefault()
    if (actionLoading) return

    const trimmedName = saveName.trim()
    if (!trimmedName) {
      setSaveError('Please enter a template name')
      return
    }

    setActionLoading(true)
    setSaveError(null)

    try {
      const payload = {
        name: trimmedName,
        description: saveDesc.trim(),
        overlays: JSON.parse(JSON.stringify(currentOverlays)),
      }

      const res = await window.api.createCaptionTemplate(payload)
      if (res && res.success) {
        setSaveModalOpen(false)
        await loadTemplates()
      } else {
        setSaveError(res?.error || 'Failed to save template')
      }
    } catch (err) {
      setSaveError(err.message || 'Error saving template')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDuplicate = async (tpl) => {
    if (actionLoading || disabled) return
    setActionLoading(true)
    setError(null)
    try {
      const res = await window.api.duplicateCaptionTemplate(tpl.id)
      if (res && res.success) {
        await loadTemplates()
      } else {
        setError(res?.error || 'Failed to duplicate template')
      }
    } catch (err) {
      setError(err.message || 'Error duplicating template')
    } finally {
      setActionLoading(false)
    }
  }

  const handleOpenEdit = (tpl) => {
    if (tpl.isBuiltIn) return
    setEditingTemplate(tpl)
    setEditName(tpl.name)
    setEditDesc(tpl.description || '')
    setEditError(null)
    setEditModalOpen(true)
  }

  const handleSaveEdit = async (e) => {
    e.preventDefault()
    if (!editingTemplate || actionLoading) return

    const trimmedName = editName.trim()
    if (!trimmedName) {
      setEditError('Template name cannot be empty')
      return
    }

    setActionLoading(true)
    setEditError(null)
    try {
      const res = await window.api.updateCaptionTemplate(editingTemplate.id, {
        name: trimmedName,
        description: editDesc.trim(),
      })
      if (res && res.success) {
        setEditModalOpen(false)
        setEditingTemplate(null)
        await loadTemplates()
      } else {
        setEditError(res?.error || 'Failed to update template')
      }
    } catch (err) {
      setEditError(err.message || 'Error updating template')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDelete = async (id) => {
    if (actionLoading || disabled) return
    setActionLoading(true)
    setError(null)
    try {
      const res = await window.api.deleteCaptionTemplate(id)
      if (res && res.success) {
        setDeleteConfirmId(null)
        await loadTemplates()
      } else {
        setError(res?.error || 'Failed to delete template')
      }
    } catch (err) {
      setError(err.message || 'Error deleting template')
    } finally {
      setActionLoading(false)
    }
  }

  const handleResetBuiltins = async () => {
    if (actionLoading || disabled) return
    setActionLoading(true)
    setError(null)
    try {
      const res = await window.api.resetCaptionTemplates()
      if (res && res.success) {
        await loadTemplates()
      } else {
        setError(res?.error || 'Failed to reset built-in templates')
      }
    } catch (err) {
      setError(err.message || 'Error resetting built-ins')
    } finally {
      setActionLoading(false)
    }
  }

  // ── Render Helpers ─────────────────────────────────────────────────────────

  const getStyleSummary = (tpl) => {
    const first = tpl.overlays?.[0]
    if (!first) return 'No style'
    const font = first.fontFamily || 'Arial'
    const size = first.fontSize || 48
    const weight = first.fontWeight === 'bold' ? 'Bold' : 'Regular'
    const pos = first.position ? first.position.charAt(0).toUpperCase() + first.position.slice(1) : 'Bottom'
    return `${font} • ${size}px • ${weight} • ${pos}`
  }

  return (
    <div style={{ background: '#111124', border: '1px solid #282846', borderRadius: 8, padding: 14, marginBottom: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: '#f0f0ff', letterSpacing: '0.03em' }}>
            🏷 Caption Templates
          </span>
          <span style={{ fontSize: 11, background: '#1e1e3f', color: '#9d9dbf', padding: '2px 7px', borderRadius: 10 }}>
            {templates.length}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleOpenSaveModal}
            disabled={disabled || actionLoading || currentOverlays.length === 0}
            title={currentOverlays.length === 0 ? 'Add overlay text before saving' : 'Save current editor overlays as template'}
            style={{
              background: currentOverlays.length === 0 ? '#1a1a2e' : '#5c4df0',
              border: '1px solid #7c6af7',
              borderRadius: 5,
              color: currentOverlays.length === 0 ? '#666' : '#fff',
              fontSize: 12,
              fontWeight: 600,
              padding: '4px 10px',
              cursor: currentOverlays.length === 0 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span>+</span> Save as Template
          </button>

          <button
            type="button"
            onClick={handleResetBuiltins}
            disabled={disabled || actionLoading}
            title="Restore canonical built-in templates"
            style={{
              background: 'transparent',
              border: '1px solid #444466',
              borderRadius: 5,
              color: '#a0a0c0',
              fontSize: 11,
              padding: '4px 8px',
              cursor: disabled || actionLoading ? 'not-allowed' : 'pointer',
            }}
          >
            Reset Built-ins
          </button>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', background: '#181830', borderRadius: 6, padding: 2, border: '1px solid #2a2a44' }}>
          {['all', 'builtin', 'custom'].map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveFilter(tab)}
              style={{
                background: activeFilter === tab ? '#5c4df0' : 'transparent',
                border: 'none',
                borderRadius: 4,
                color: activeFilter === tab ? '#fff' : '#8f8fb0',
                fontSize: 11,
                fontWeight: activeFilter === tab ? 600 : 400,
                padding: '4px 10px',
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {tab === 'builtin' ? 'Built-in' : tab}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div style={{ flex: 1, minWidth: 150 }}>
          <input
            type="text"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              background: '#181830',
              border: '1px solid #2a2a44',
              borderRadius: 6,
              color: '#e0e0f0',
              fontSize: 12,
              padding: '5px 9px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{ background: '#3b1818', border: '1px solid #8b2828', color: '#ffb0b0', padding: '6px 10px', borderRadius: 5, fontSize: 12, marginBottom: 8 }}>
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '16px 0', color: '#8888aa', fontSize: 12 }}>
          Loading templates...
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '16px 0', color: '#666688', fontSize: 12, background: '#151528', borderRadius: 6 }}>
          No caption templates found matching filter.
        </div>
      ) : (
        /* Template Card List (horizontal grid) */
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: 8,
          maxHeight: 280,
          overflowY: 'auto',
          paddingRight: 4,
        }}>
          {filteredTemplates.map((tpl) => (
            <div
              key={tpl.id}
              style={{
                background: '#16162d',
                border: '1px solid #2e2e4e',
                borderRadius: 7,
                padding: '10px 11px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'border-color 0.15s',
              }}
            >
              <div>
                {/* Title & Badge */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: '#f0f0ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {tpl.name}
                  </span>
                  <span style={{
                    fontSize: 10,
                    fontWeight: 600,
                    padding: '2px 5px',
                    borderRadius: 4,
                    background: tpl.isBuiltIn ? '#1c2e4a' : '#302048',
                    color: tpl.isBuiltIn ? '#70a8ff' : '#d29bff',
                    border: `1px solid ${tpl.isBuiltIn ? '#2f4b75' : '#4d3275'}`,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}>
                    {tpl.isBuiltIn ? 'Built-in' : 'Custom'}
                  </span>
                </div>

                {/* Description */}
                <div style={{
                  fontSize: 11,
                  color: '#9090b0',
                  marginBottom: 6,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  lineHeight: '1.3em',
                  minHeight: '2.6em',
                }}>
                  {tpl.description || '(No description)'}
                </div>

                {/* Overlays count & style summary */}
                <div style={{ fontSize: 10, color: '#707095', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {tpl.overlays?.length || 0} overlay{tpl.overlays?.length === 1 ? '' : 's'} • {getStyleSummary(tpl)}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, borderTop: '1px solid #222238', paddingTop: 8 }}>
                <button
                  type="button"
                  onClick={() => handleApply(tpl)}
                  disabled={disabled || actionLoading}
                  style={{
                    flex: 1,
                    background: '#2b2366',
                    border: '1px solid #5c4df0',
                    color: '#c2b8ff',
                    borderRadius: 4,
                    padding: '4px 6px',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: disabled || actionLoading ? 'not-allowed' : 'pointer',
                  }}
                  title="Apply template overlays to current video"
                >
                  Apply
                </button>

                <button
                  type="button"
                  onClick={() => handleDuplicate(tpl)}
                  disabled={disabled || actionLoading}
                  style={cardActionBtnStyle}
                  title="Duplicate as new custom template"
                >
                  ⧉
                </button>

                {!tpl.isBuiltIn && (
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(tpl)}
                    disabled={disabled || actionLoading}
                    style={cardActionBtnStyle}
                    title="Edit template name & description"
                  >
                    ✎
                  </button>
                )}

                {!tpl.isBuiltIn && (
                  deleteConfirmId === tpl.id ? (
                    <button
                      type="button"
                      onClick={() => handleDelete(tpl.id)}
                      disabled={disabled || actionLoading}
                      style={{ ...cardActionBtnStyle, background: '#601818', color: '#ffaaaa', border: '1px solid #992222' }}
                      title="Click again to confirm delete"
                    >
                      Confirm
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmId(tpl.id)}
                      disabled={disabled || actionLoading}
                      style={{ ...cardActionBtnStyle, color: '#ff7777' }}
                      title="Delete template"
                    >
                      ✕
                    </button>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Save Current as Template Modal ── */}
      {saveModalOpen && (
        <div style={modalBackdropStyle}>
          <div style={modalBoxStyle}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: 14, color: '#fff' }}>Save Current Text Overlays as Template</h3>
            <p style={{ margin: '0 0 12px 0', fontSize: 12, color: '#9090b0' }}>
              Captures all {currentOverlays.length} active text overlay{currentOverlays.length === 1 ? '' : 's'} as a reusable preset.
            </p>

            {saveError && (
              <div style={{ background: '#3b1818', border: '1px solid #8b2828', color: '#ffb0b0', padding: '6px 8px', borderRadius: 4, fontSize: 11, marginBottom: 8 }}>
                {saveError}
              </div>
            )}

            <form onSubmit={handleSaveCurrent}>
              <label style={modalLabelStyle}>Template Name *</label>
              <input
                type="text"
                required
                maxLength={100}
                placeholder="e.g. My Channel Brand Headline"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                style={modalInputStyle}
                autoFocus
              />

              <label style={modalLabelStyle}>Description (Optional)</label>
              <textarea
                maxLength={300}
                rows={2}
                placeholder="Short notes about style, placement, or use-case"
                value={saveDesc}
                onChange={(e) => setSaveDesc(e.target.value)}
                style={{ ...modalInputStyle, resize: 'vertical' }}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => setSaveModalOpen(false)}
                  disabled={actionLoading}
                  style={modalCancelBtnStyle}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !saveName.trim()}
                  style={modalSaveBtnStyle}
                >
                  {actionLoading ? 'Saving...' : 'Save Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Custom Template Modal ── */}
      {editModalOpen && (
        <div style={modalBackdropStyle}>
          <div style={modalBoxStyle}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: 14, color: '#fff' }}>Edit Caption Template</h3>

            {editError && (
              <div style={{ background: '#3b1818', border: '1px solid #8b2828', color: '#ffb0b0', padding: '6px 8px', borderRadius: 4, fontSize: 11, marginBottom: 8 }}>
                {editError}
              </div>
            )}

            <form onSubmit={handleSaveEdit}>
              <label style={modalLabelStyle}>Template Name *</label>
              <input
                type="text"
                required
                maxLength={100}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                style={modalInputStyle}
                autoFocus
              />

              <label style={modalLabelStyle}>Description</label>
              <textarea
                maxLength={300}
                rows={2}
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                style={{ ...modalInputStyle, resize: 'vertical' }}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => { setEditModalOpen(false); setEditingTemplate(null) }}
                  disabled={actionLoading}
                  style={modalCancelBtnStyle}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !editName.trim()}
                  style={modalSaveBtnStyle}
                >
                  {actionLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Shared UI Styles ─────────────────────────────────────────────────────────

const cardActionBtnStyle = {
  background: '#1d1d36',
  border: '1px solid #333355',
  color: '#b0b0d0',
  borderRadius: 4,
  padding: '4px 7px',
  fontSize: 11,
  cursor: 'pointer',
}

const modalBackdropStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.65)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
  padding: 16,
}

const modalBoxStyle = {
  background: '#18182e',
  border: '1px solid #39395f',
  borderRadius: 8,
  padding: 18,
  width: '100%',
  maxWidth: 420,
  boxShadow: '0 8px 30px rgba(0,0,0,0.7)',
  color: '#e0e0f0',
  boxSizing: 'border-box',
}

const modalLabelStyle = {
  display: 'block',
  color: '#a0a0c0',
  fontSize: 11,
  marginBottom: 4,
  marginTop: 8,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const modalInputStyle = {
  width: '100%',
  background: '#101020',
  border: '1px solid #333355',
  borderRadius: 5,
  color: '#fff',
  fontSize: 12,
  padding: '6px 8px',
  boxSizing: 'border-box',
  outline: 'none',
}

const modalCancelBtnStyle = {
  background: 'transparent',
  border: '1px solid #444466',
  color: '#9090b0',
  borderRadius: 4,
  padding: '6px 12px',
  fontSize: 12,
  cursor: 'pointer',
}

const modalSaveBtnStyle = {
  background: '#5c4df0',
  border: '1px solid #7c6af7',
  color: '#fff',
  borderRadius: 4,
  padding: '6px 14px',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
}
