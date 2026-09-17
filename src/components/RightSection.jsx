import React from 'react'
import LoginForm from './LoginForm'

function RightSection({ onLogin }) {
  return (
    <div className="right-section">
      <div className="login-card">
        <div className="welcome-text">
          <h1>Welcome back</h1>
          <p>Sign in to your account to continue</p>
        </div>
        <LoginForm onLogin={onLogin} />
      </div>
    </div>
  )
}

export default RightSection
