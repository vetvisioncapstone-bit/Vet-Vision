import React, { useState } from 'react'

function PasswordInput({ value, onChange, error, success }) {
  const [showPassword, setShowPassword] = useState(false)
  const [capsLockOn, setCapsLockOn] = useState(false)

  const className = `form-input${error ? ' error' : ''}${success ? ' success' : ''}`

  const togglePassword = (e) => {
    e.preventDefault()
    setShowPassword(!showPassword)
  }

  const handleKeyDown = (e) => {
    const isCapsLock = e.getModifierState('CapsLock')
    setCapsLockOn(isCapsLock)
  }

  return (
    <div className="form-group">
      <label className="form-label" htmlFor="password">Password</label>
      <div className="input-wrapper password-input-wrapper">
        <span className="input-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="11" width="14" height="10" rx="2"/>
            <path d="M8 11V7a4 4 0 0 1 8 0v4"/>
          </svg>
        </span>
        <input
          type={showPassword ? 'text' : 'password'}
          id="password"
          className={className}
          placeholder="Enter your password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          title={capsLockOn ? '⚠️ Caps Lock is ON' : ''}
          style={capsLockOn ? { borderColor: '#ff9800' } : {}}
          required
        />
        <button 
          type="button" 
          className={`toggle-password${showPassword ? ' is-visible' : ''}`}
          onClick={togglePassword}
        >
          <svg className="icon-eye" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
          <svg className="icon-eye-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-3.22 2.62A9.12 9.12 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 4.06-5.94"/>
            <path d="M1 1l22 22"/>
            <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/>
          </svg>
        </button>
      </div>
    </div>
  )
}

export default PasswordInput
