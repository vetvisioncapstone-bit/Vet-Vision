import React, { useState } from 'react'
import LoginForm from './LoginForm'
import SignUpForm from './SignUpForm'

// The one door for everybody: admin, staff and pet owners sign in here (each role lands on its own home), and pet
// owners can create an account.
function RightSection({ onLogin, onSignedUp }) {
  const [mode, setMode] = useState('signin')
  const signingIn = mode === 'signin'

  return (
    <div className="right-section">
      <div className="login-card">
        <div className="welcome-text">
          <h1>{signingIn ? 'Welcome back' : 'Create your account'}</h1>
          <p>{signingIn ? 'Sign in to your account to continue' : 'Register to see your pets, records and clinic reminders'}</p>
        </div>
        {signingIn ? <LoginForm onLogin={onLogin} /> : <SignUpForm onSignedUp={onSignedUp} />}
        <p className="auth-switch">
          {signingIn ? 'New pet owner?' : 'Already registered?'}{' '}
          <button type="button" onClick={() => setMode(signingIn ? 'signup' : 'signin')}>
            {signingIn ? 'Create an account' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}

export default RightSection
