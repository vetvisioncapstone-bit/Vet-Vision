import React from 'react'

// First tab stop on every page: lets keyboard users jump past the sidebar and top bar to the page content
// (each page's <main> has id="main-content"). Hidden until it has focus.
export default function SkipLink() {
  return <a className="skip-link" href="#main-content">Skip to main content</a>
}
