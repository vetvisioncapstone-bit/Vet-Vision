import React, { useEffect, useState } from 'react'

function SuccessOverlay({ email, remember, onClose }) {
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    // Auto-close after 1.3 seconds
    const timer = setTimeout(() => {
      setClosing(true)
      setTimeout(() => {
        onClose()
      }, 300)
    }, 1300)

    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div className={`success-overlay${closing ? ' closing' : ''}`}>
      <div className="success-popup">
        <div className="success-popup-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <h3>Login Successful!</h3>
        <p>Welcome back! You logged in as <strong>{email}</strong></p>
        {remember && (
          <p className="remember-note">✓ Your device has been remembered.</p>
        )}
      </div>
    </div>
  )
}

export default SuccessOverlay
