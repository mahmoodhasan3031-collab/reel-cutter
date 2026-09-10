import { Component } from 'react'

/**
 * ErrorBoundary — STEP 4B
 *
 * Catches unhandled React rendering errors in the component tree.
 * Shows a controlled fallback UI instead of a blank / broken screen.
 * Never exposes raw stack traces or internal error details to the user.
 * Forwards a sanitized diagnostic message to the main process via IPC (best-effort).
 *
 * Usage: wrap the app root (or a sub-tree) with <ErrorBoundary>
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state   = { hasError: false, errorMessage: null }
    this._reloads = 0 // track consecutive reload attempts to prevent reload loops
  }

  // Called by React when a child throws during render / lifecycle
  static getDerivedStateFromError(error) {
    const msg = error && error.message
      ? error.message.slice(0, 200) // never expose a full trace to the view
      : 'An unexpected error occurred.'
    return { hasError: true, errorMessage: msg }
  }

  // Called after the error is captured; use for side-effects (logging)
  componentDidCatch(_error, _info) {
    try {
      // Forward sanitized diagnostic to main process (best-effort; ignore if IPC unavailable)
      const safeMsg = `UI Error: ${this.state.errorMessage || 'unknown'}`
      if (window.api && typeof window.api.logError === 'function') {
        window.api.logError(safeMsg)
      }
    } catch (_) {
      // componentDidCatch itself must not throw
    }
  }

  handleReload() {
    this._reloads++
    if (this._reloads > 3) {
      // Prevent reload loop — keep showing the error state
      return
    }
    this.setState({ hasError: false, errorMessage: null })
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          backgroundColor: '#09090b',
          color: '#f4f4f5',
          gap: '16px',
          padding: '32px',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        <div style={{ fontSize: '40px' }}>⚠️</div>

        <h1 style={{ fontSize: '20px', fontWeight: '600', margin: 0 }}>
          Something went wrong
        </h1>

        <p style={{ fontSize: '14px', color: '#71717a', textAlign: 'center', maxWidth: '360px', margin: 0 }}>
          An unexpected error occurred in the interface. Your files are safe.
          You can try reloading below.
        </p>

        {this._reloads < 3 && (
          <button
            onClick={() => this.handleReload()}
            style={{
              padding: '10px 24px',
              backgroundColor: '#7c3aed',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        )}

        {this._reloads >= 3 && (
          <p style={{ fontSize: '12px', color: '#52525b', textAlign: 'center' }}>
            Multiple reload attempts failed. Please restart the application.
          </p>
        )}
      </div>
    )
  }
}
