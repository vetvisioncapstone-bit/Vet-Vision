import React from 'react'

function LoginButton({ isLoading }) {
  const handleClick = (e) => {
    if (!isLoading) {
      // Ripple effect
      const button = e.currentTarget
      const ripple = document.createElement('span')
      const rect = button.getBoundingClientRect()
      const size = Math.max(rect.width, rect.height)
      const x = e.clientX - rect.left - size / 2
      const y = e.clientY - rect.top - size / 2
      
      ripple.style.width = ripple.style.height = size + 'px'
      ripple.style.left = x + 'px'
      ripple.style.top = y + 'px'
      ripple.classList.add('ripple')
      
      button.appendChild(ripple)
      setTimeout(() => ripple.remove(), 600)
    }
  }

  return (
    <button 
      type="submit" 
      className={`login-btn${isLoading ? ' loading' : ''}`}
      disabled={isLoading}
      onClick={handleClick}
    >
      <span className="paw-icon">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <circle cx="7" cy="7" r="2.3"/>
          <circle cx="12" cy="4.5" r="2.3"/>
          <circle cx="17" cy="7" r="2.3"/>
          <path d="M12 12c-3.5 0-6.5 2.4-6.5 5.4 0 2 1.7 3.1 3.6 2.4.9-.3 1.9-.5 2.9-.5s2 .2 2.9.5c1.9.7 3.6-.4 3.6-2.4C18.5 14.4 15.5 12 12 12Z"/>
        </svg>
      </span>
      <span className="btn-text">Login</span>
    </button>
  )
}

export default LoginButton
