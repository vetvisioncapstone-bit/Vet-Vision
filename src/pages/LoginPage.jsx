import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import LeftSection from '../components/LeftSection'
import RightSection from '../components/RightSection'
import SuccessOverlay from '../components/SuccessOverlay'
import { useAuth } from '../hooks/useAuth'
import { homePathFor } from '../utils/homePath'
import '../styles/LoginPage.css'

function LoginPage() {
  const [showSuccess, setShowSuccess] = useState(false)
  const [successData, setSuccessData] = useState({ email: '', remember: false })
  const navigate = useNavigate()

  useEffect(() => {
    // Auto-focus email input
    const emailInput = document.getElementById('email')
    if (emailInput) {
      setTimeout(() => emailInput.focus(), 500)
    }

    // Console welcome message
    console.log('%c🐾 Welcome to Vet Vision! 🐾', 'font-size: 20px; color: #4caf50; font-weight: bold;')
    console.log('%cBetter care for pets, better lives for all.', 'font-size: 14px; color: #2d7a4d;')
    console.log('%cTry pressing Escape to clear the form!', 'font-size: 12px; color: #666; font-style: italic;')
  }, [])

  const { login } = useAuth()

  const handleLogin = async (email, password, remember) => {
    const result = await login(email.trim(), password)
    if (!result.success) return result

    setSuccessData({ email, remember })
    setShowSuccess(true)

    // Navigate after the success overlay has had a moment
    setTimeout(() => {
      navigate(homePathFor(result.session.role))
    }, 1500)

    return { success: true }
  }

  return (
    <div className="container">
      <LeftSection />
      <RightSection onLogin={handleLogin} onSignedUp={() => navigate(homePathFor('customer'))} />
      {showSuccess && (
        <SuccessOverlay 
          email={successData.email} 
          remember={successData.remember}
          onClose={() => setShowSuccess(false)}
        />
      )}
    </div>
  )
}

export default LoginPage
