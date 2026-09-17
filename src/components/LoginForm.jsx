import React, { useState, useEffect } from 'react'
import EmailInput from './EmailInput'
import PasswordInput from './PasswordInput'
import LoginButton from './LoginButton'

function LoginForm({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [emailError, setEmailError] = useState(false)
  const [passwordError, setPasswordError] = useState(false)
  const [emailSuccess, setEmailSuccess] = useState(false)
  const [passwordSuccess, setPasswordSuccess] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    // Keyboard shortcuts
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        resetForm()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const validateEmail = (value) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (value === '') {
      setEmailError(false)
      setEmailSuccess(false)
      return true
    }
    if (!emailRegex.test(value)) {
      setEmailError(true)
      setEmailSuccess(false)
      return false
    } else {
      setEmailError(false)
      setEmailSuccess(true)
      return true
    }
  }

  const handleEmailChange = (value) => {
    setEmail(value)
    if (emailError) setEmailError(false)
    if (loginError) setLoginError('')
  }

  const handleEmailBlur = () => {
    validateEmail(email)
  }

  const handlePasswordChange = (value) => {
    setPassword(value)
    if (value.length >= 6) {
      setPasswordSuccess(true)
      setPasswordError(false)
    } else if (value.length > 0) {
      setPasswordError(true)
      setPasswordSuccess(false)
    } else {
      setPasswordError(false)
      setPasswordSuccess(false)
    }
    if (loginError) setLoginError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    // Validate email
    if (!validateEmail(email)) {
      shakeElement('email')
      return
    }
    
    // Validate password
    if (!password) {
      setPasswordError(true)
      shakeElement('password')
      return
    }

    setIsLoading(true)
    setLoginError('')

    // Simulate API call
    setTimeout(() => {
      const result = onLogin(email, password, remember)
      
      if (!result.success) {
        setEmailError(true)
        setPasswordError(true)
        setLoginError(result.message)
        shakeElement('email')
        shakeElement('password')
        setIsLoading(false)
      }
      // If success, loading state continues until redirect
    }, 2000)
  }

  const resetForm = () => {
    setEmail('')
    setPassword('')
    setRemember(false)
    setEmailError(false)
    setPasswordError(false)
    setEmailSuccess(false)
    setPasswordSuccess(false)
    setLoginError('')
  }

  const shakeElement = (id) => {
    const element = document.getElementById(id)
    if (element) {
      element.style.animation = 'none'
      setTimeout(() => {
        element.style.animation = 'shake 0.5s ease-in-out'
      }, 10)
    }
  }

  const handleForgotPassword = (e) => {
    e.preventDefault()
    alert('Password reset functionality would be implemented here! 🔐')
  }

  return (
    <form id="loginForm" onSubmit={handleSubmit}>
      {loginError && (
        <div className="login-alert">
          {loginError}
        </div>
      )}

      <EmailInput 
        value={email}
        onChange={handleEmailChange}
        onBlur={handleEmailBlur}
        error={emailError}
        success={emailSuccess}
      />

      <PasswordInput
        value={password}
        onChange={handlePasswordChange}
        error={passwordError}
        success={passwordSuccess}
      />

      <div className="form-actions">
        <div className="checkbox-group">
          <input 
            type="checkbox" 
            id="remember" 
            name="remember" 
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          <label htmlFor="remember">Remember me</label>
        </div>
        <a href="#" className="forgot-password" onClick={handleForgotPassword}>
          Forgot Password?
        </a>
      </div>

      <LoginButton isLoading={isLoading} />

      <p className="footer-text">
        <span className="footer-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2 4 5v6c0 5 3.4 8.6 8 11 4.6-2.4 8-6 8-11V5l-8-3Z"/>
            <path d="m9 12 2 2 4-4"/>
          </svg>
        </span>
        Your data is safe and secure with us.
      </p>
    </form>
  )
}

export default LoginForm
