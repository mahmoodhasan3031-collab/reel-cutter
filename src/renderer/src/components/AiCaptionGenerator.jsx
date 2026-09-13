import React, { useState, useEffect, useCallback } from 'react'
import {
  Sparkles,
  Copy,
  Check,
  BookmarkPlus,
  ArrowRight,
  AlertCircle,
  Loader2,
  X,
  Languages,
  Sliders,
  Type,
  Globe,
  Lock,
} from 'lucide-react'

const TONES = [
  { id: 'casual', label: 'Casual', desc: 'Friendly, relatable, with emojis' },
  { id: 'professional', label: 'Professional', desc: 'Crisp, strategic, executive' },
  { id: 'educational', label: 'Educational', desc: 'Tips, breakdowns, facts' },
  { id: 'promotional', label: 'Promotional', desc: 'High energy, announcement, CTA' },
  { id: 'storytelling', label: 'Storytelling', desc: 'Narrative, relatable journey' },
]

const LENGTHS = [
  { id: 'short', label: 'Short', desc: 'Punchy 1-line hook' },
  { id: 'medium', label: 'Medium', desc: 'Hook + core tip (2-3 lines)' },
  { id: 'long', label: 'Long', desc: 'Structured narrative + platform CTA' },
]

const PLATFORMS = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'youtube', label: 'YouTube Shorts' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'other', label: 'General / Other' },
]

export default function AiCaptionGenerator({
  isOpen = false,
  onClose,
  onApplyCaption,
  selectedProfile = null,
  disabled = false,
}) {
  const [topic, setTopic] = useState('')
  const [language, setLanguage] = useState('english') // 'english' | 'bangla'
  const [tone, setTone] = useState('casual')
  const [length, setLength] = useState('medium')
  const [platform, setPlatform] = useState(
    selectedProfile?.platform ? selectedProfile.platform.toLowerCase() : 'other'
  )
  const [count, setCount] = useState(3)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [requiresUpgrade, setRequiresUpgrade] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [copiedIndex, setCopiedIndex] = useState(null)
  const [savedTemplateIndex, setSavedTemplateIndex] = useState(null)
  const [savingTemplate, setSavingTemplate] = useState(false)

  // Sync profile platform when selectedProfile changes
  useEffect(() => {
    if (selectedProfile?.platform) {
      const p = selectedProfile.platform.toLowerCase()
      if (['instagram', 'tiktok', 'youtube', 'facebook'].includes(p)) {
        setPlatform(p)
      } else {
        setPlatform('other')
      }
    }
  }, [selectedProfile])

  // Reset states when opened
  useEffect(() => {
    if (isOpen) {
      setError(null)
      setRequiresUpgrade(false)
    }
  }, [isOpen])

  const handleGenerate = async (e) => {
    if (e) e.preventDefault()
    if (loading || disabled) return

    const trimmedTopic = topic.trim()
    if (!trimmedTopic) {
      setError('Please enter a video topic or description.')
      return
    }

    if (trimmedTopic.length > 500) {
      setError('Topic is too long (maximum 500 characters).')
      return
    }

    setLoading(true)
    setError(null)
    setRequiresUpgrade(false)
    setSuggestions([])

    try {
      if (!window.api?.generateAiCaptions) {
        throw new Error('AI Caption Generator API is unavailable.')
      }

      const res = await window.api.generateAiCaptions({
        topic: trimmedTopic,
        language,
        tone,
        length,
        platform,
        profileId: selectedProfile?.id || null,
        count: parseInt(count, 10) || 3,
      })

      if (res && res.success && Array.isArray(res.suggestions)) {
        setSuggestions(res.suggestions)
      } else {
        if (res?.requiresUpgrade) {
          setRequiresUpgrade(true)
        }
        setError(res?.error || 'Failed to generate captions. Please try again.')
      }
    } catch (err) {
      setError(err.message || 'An unexpected error occurred.')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = (text, index) => {
    if (!text) return
    navigator.clipboard?.writeText(text)
    setCopiedIndex(index)
    setTimeout(() => {
      setCopiedIndex(null)
    }, 2000)
  }

  const handleUseCaption = (captionText) => {
    if (!captionText || disabled) return
    if (onApplyCaption) {
      onApplyCaption(captionText)
    }
    if (onClose) {
      onClose()
    }
  }

  const handleSaveAsTemplate = async (captionText, index) => {
    if (!captionText || savingTemplate || disabled) return
    setSavingTemplate(true)
    setError(null)

    try {
      if (!window.api?.createCaptionTemplate) {
        throw new Error('Caption Template API unavailable.')
      }

      const previewTopic = topic.trim() || 'AI Caption'
      const cleanName = `AI: ${previewTopic.slice(0, 24)}${previewTopic.length > 24 ? '...' : ''} (#${index + 1})`

      const res = await window.api.createCaptionTemplate({
        name: cleanName,
        description: `Generated for "${previewTopic.slice(0, 40)}" (${language}, ${tone}, ${length})`,
        overlays: [
          {
            text: captionText,
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
          },
        ],
      })

      if (res && res.success) {
        setSavedTemplateIndex(index)
        setTimeout(() => setSavedTemplateIndex(null), 3000)
      } else {
        setError(res?.error || 'Failed to save template.')
      }
    } catch (err) {
      setError(err.message || 'Error saving template.')
    } finally {
      setSavingTemplate(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(5, 5, 15, 0.82)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose()
      }}
    >
      <div
        style={{
          background: '#121226',
          border: '1px solid #2d2b52',
          borderRadius: 14,
          width: '100%',
          maxWidth: 680,
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.75), 0 0 24px rgba(124, 106, 247, 0.15)',
          overflow: 'hidden',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #242442',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#161630',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'linear-gradient(135deg, #7c6af7 0%, #a855f7 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                boxShadow: '0 2px 10px rgba(124, 106, 247, 0.4)',
              }}
            >
              <Sparkles size={18} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f3f3ff' }}>
                  AI Caption Generator
                </h3>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: '#7c6af7',
                    color: '#fff',
                    letterSpacing: '0.05em',
                  }}
                >
                  PRO
                </span>
              </div>
              <p style={{ margin: '2px 0 0 0', fontSize: 12, color: '#8c8cb3' }}>
                Generate engaging, viral-ready video hooks and captions in seconds
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            style={{
              background: 'none',
              border: 'none',
              color: '#8c8cb3',
              cursor: loading ? 'not-allowed' : 'pointer',
              padding: 6,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div
          style={{
            padding: '18px 20px',
            overflowY: 'auto',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          {/* Selected Profile Context Banner (if supplied) */}
          {selectedProfile && (
            <div
              style={{
                background: '#1a1a36',
                border: '1px solid #33325c',
                borderRadius: 8,
                padding: '8px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#c4c3e8' }}>
                <span style={{ color: '#7c6af7', fontWeight: 600 }}>Active Profile:</span>
                <span style={{ fontWeight: 600, color: '#fff' }}>{selectedProfile.name}</span>
                {selectedProfile.platform && (
                  <span
                    style={{
                      background: '#27264d',
                      padding: '1px 6px',
                      borderRadius: 4,
                      fontSize: 11,
                      color: '#a7a5f0',
                    }}
                  >
                    {selectedProfile.platform}
                  </span>
                )}
              </div>
              <span style={{ color: '#8887b0', fontSize: 11 }}>Profile context enabled</span>
            </div>
          )}

          {/* Topic / Description Input */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#d8d7f2', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Video Topic / Concept
              </label>
              <span style={{ fontSize: 11, color: topic.length > 450 ? '#f87171' : '#73729e' }}>
                {topic.length}/500
              </span>
            </div>
            <textarea
              rows={3}
              value={topic}
              maxLength={500}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. 5 simple productivity hacks to save 2 hours every day, morning workout routine, crypto market breakdown..."
              disabled={loading || disabled}
              style={{
                width: '100%',
                background: '#171730',
                border: '1px solid #2d2b52',
                borderRadius: 8,
                color: '#fff',
                padding: '10px 12px',
                fontSize: 13,
                lineHeight: 1.45,
                outline: 'none',
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Configuration Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))',
              gap: 12,
            }}
          >
            {/* Language */}
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#aaa8cc', marginBottom: 5 }}>
                <Languages size={13} /> Language
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                disabled={loading || disabled}
                style={selectStyle}
              >
                <option value="english">English</option>
                <option value="bangla">Bangla (বাংলা)</option>
              </select>
            </div>

            {/* Tone */}
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#aaa8cc', marginBottom: 5 }}>
                <Sliders size={13} /> Tone
              </label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                disabled={loading || disabled}
                style={selectStyle}
              >
                {TONES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Length */}
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#aaa8cc', marginBottom: 5 }}>
                <Type size={13} /> Length
              </label>
              <select
                value={length}
                onChange={(e) => setLength(e.target.value)}
                disabled={loading || disabled}
                style={selectStyle}
              >
                {LENGTHS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Platform */}
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#aaa8cc', marginBottom: 5 }}>
                <Globe size={13} /> Platform
              </label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                disabled={loading || disabled}
                style={selectStyle}
              >
                {PLATFORMS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Suggestions Count */}
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#aaa8cc', marginBottom: 5 }}>
                <Sparkles size={13} /> Suggestions
              </label>
              <select
                value={count}
                onChange={(e) => setCount(parseInt(e.target.value, 10))}
                disabled={loading || disabled}
                style={selectStyle}
              >
                <option value={3}>3 suggestions</option>
                <option value={4}>4 suggestions</option>
                <option value={5}>5 suggestions</option>
              </select>
            </div>
          </div>

          {/* Primary Action Button */}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading || disabled || !topic.trim()}
            style={{
              background: loading || !topic.trim() ? '#282745' : 'linear-gradient(135deg, #6352eb 0%, #8b5cf6 100%)',
              border: '1px solid #7c6af7',
              borderRadius: 8,
              color: loading || !topic.trim() ? '#8c8cb3' : '#ffffff',
              fontSize: 14,
              fontWeight: 600,
              padding: '11px 18px',
              cursor: loading || !topic.trim() ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              transition: 'all 0.2s ease',
              boxShadow: !topic.trim() ? 'none' : '0 4px 15px rgba(99, 82, 235, 0.35)',
            }}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Generating AI Captions...</span>
              </>
            ) : (
              <>
                <Sparkles size={16} />
                <span>Generate Captions</span>
              </>
            )}
          </button>

          {/* Error / Upgrade Alert Banner */}
          {error && (
            <div
              style={{
                background: requiresUpgrade ? '#2a1a36' : '#2b151b',
                border: `1px solid ${requiresUpgrade ? '#8a3c8f' : '#882233'}`,
                borderRadius: 8,
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                color: requiresUpgrade ? '#ecc2fc' : '#fca5a5',
                fontSize: 13,
              }}
            >
              {requiresUpgrade ? (
                <Lock size={18} style={{ flexShrink: 0, marginTop: 2, color: '#d946ef' }} />
              ) : (
                <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{error}</div>
                {requiresUpgrade && (
                  <div style={{ fontSize: 12, marginTop: 4, color: '#d8b4e2' }}>
                    AI Caption Generator is a Pro tier capability. Upgrade to Reel Cutter Pro to unlock AI captions, AI thumbnails, and batch processing.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Suggestions Results Cards */}
          {suggestions.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 10,
                }}
              >
                <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#b5b4df', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Generated Captions ({suggestions.length})
                </h4>
                <span style={{ fontSize: 11, color: '#8887b0' }}>
                  Select one to apply to your video overlay
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {suggestions.map((captionText, index) => {
                  const isCopied = copiedIndex === index
                  const isSaved = savedTemplateIndex === index

                  return (
                    <div
                      key={index}
                      style={{
                        background: '#181834',
                        border: '1px solid #2f2d57',
                        borderRadius: 10,
                        padding: '12px 14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10,
                        transition: 'border-color 0.2s ease',
                      }}
                    >
                      {/* Card Caption Text */}
                      <div
                        style={{
                          fontSize: 13,
                          lineHeight: 1.5,
                          color: '#f0f0ff',
                          whiteSpace: 'pre-wrap',
                          fontFamily: language === 'bangla' ? 'system-ui, SolaimanLipi, sans-serif' : 'inherit',
                        }}
                      >
                        {captionText}
                      </div>

                      {/* Card Action Bar */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          borderTop: '1px solid #242247',
                          paddingTop: 8,
                          gap: 8,
                          flexWrap: 'wrap',
                        }}
                      >
                        {/* Copy Button */}
                        <button
                          type="button"
                          onClick={() => handleCopy(captionText, index)}
                          title="Copy to clipboard"
                          style={{
                            background: isCopied ? '#143828' : '#222245',
                            border: `1px solid ${isCopied ? '#22c55e' : '#3c3a6b'}`,
                            borderRadius: 6,
                            color: isCopied ? '#4ade80' : '#b8b6e0',
                            fontSize: 12,
                            fontWeight: 500,
                            padding: '5px 10px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5,
                          }}
                        >
                          {isCopied ? <Check size={13} /> : <Copy size={13} />}
                          <span>{isCopied ? 'Copied!' : 'Copy'}</span>
                        </button>

                        <div style={{ display: 'flex', gap: 8 }}>
                          {/* Save as Template Button */}
                          <button
                            type="button"
                            onClick={() => handleSaveAsTemplate(captionText, index)}
                            disabled={savingTemplate || isSaved}
                            title="Save as custom template in preset library"
                            style={{
                              background: isSaved ? '#1f3d36' : '#24234c',
                              border: `1px solid ${isSaved ? '#10b981' : '#454378'}`,
                              borderRadius: 6,
                              color: isSaved ? '#34d399' : '#c6c4f0',
                              fontSize: 12,
                              fontWeight: 500,
                              padding: '5px 10px',
                              cursor: savingTemplate || isSaved ? 'default' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 5,
                            }}
                          >
                            {isSaved ? <Check size={13} /> : <BookmarkPlus size={13} />}
                            <span>{isSaved ? 'Saved to Library' : 'Save as Template'}</span>
                          </button>

                          {/* Use Caption Button */}
                          <button
                            type="button"
                            onClick={() => handleUseCaption(captionText)}
                            title="Apply this caption to the current text overlay"
                            style={{
                              background: '#6352eb',
                              border: '1px solid #7c6af7',
                              borderRadius: 6,
                              color: '#ffffff',
                              fontSize: 12,
                              fontWeight: 600,
                              padding: '5px 12px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 5,
                              boxShadow: '0 2px 8px rgba(99, 82, 235, 0.4)',
                            }}
                          >
                            <span>Use Caption</span>
                            <ArrowRight size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid #242442',
            background: '#161630',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: 11, color: '#73729e' }}>
            Captions are applied as editable overlays and rendered using the Text Overlay engine.
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#22223d',
              border: '1px solid #3c3a63',
              borderRadius: 6,
              color: '#d0cfe8',
              fontSize: 12,
              fontWeight: 500,
              padding: '6px 14px',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

const selectStyle = {
  width: '100%',
  background: '#171730',
  border: '1px solid #2d2b52',
  borderRadius: 6,
  color: '#e2e1f5',
  fontSize: 12,
  padding: '6px 8px',
  outline: 'none',
  boxSizing: 'border-box',
}
