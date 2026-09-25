import React from 'react'

// Catches an error thrown while rendering any page below it, so the user sees a way out instead of a blank screen.
// (React only supports error boundaries as class components.)
export default class ErrorBoundary extends React.Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error, info) {
    console.error('Page crashed:', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div role="alert" style={{ maxWidth: 420, margin: '15vh auto', padding: 24, textAlign: 'center', fontFamily: 'inherit' }}>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>Something went wrong</h1>
        <p style={{ color: '#45514a', marginBottom: 20 }}>This page could not be shown. Reloading usually fixes it.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{ padding: '12px 28px', border: 'none', borderRadius: 30, background: '#2d7a4d', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
        >
          Reload
        </button>
      </div>
    )
  }
}
