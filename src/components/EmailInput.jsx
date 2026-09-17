import React from 'react'

function EmailInput({ value, onChange, onBlur, error, success }) {
  const className = `form-input${error ? ' error' : ''}${success ? ' success' : ''}`

  return (
    <div className="form-group">
      <label className="form-label" htmlFor="email">Email</label>
      <div className="input-wrapper">
        <span className="input-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="14" rx="2"/>
            <path d="m3 7 9 6 9-6"/>
          </svg>
        </span>
        <input
          type="email"
          id="email"
          className={className}
          placeholder="e.g. admin@ecovet.com"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          required
        />
      </div>
    </div>
  )
}

export default EmailInput
