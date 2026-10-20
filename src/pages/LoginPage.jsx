import React, { useState, useEffect, useRef } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import LeftSection from '../components/login/LeftSection'
import RightSection from '../components/login/RightSection'
import SuccessOverlay from '../components/login/SuccessOverlay'
import { useAuth } from '../hooks/useAuth'
import { useSession } from '../hooks/useSession'
import { homePathFor } from '../utils/homePath'
import '../styles/login/LoginPage.css'

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
  const { session, loading } = useSession()
  const signingIn = useRef(false) // true while this page shows its own "welcome" overlay after signing in

  const handleLogin = async (email, password, remember, captcha) => {
    signingIn.current = true
    const result = await login(email.trim(), password, captcha, remember)
    if (!result.success) signingIn.current = false
    try { // "Remember me" also fills in the email next time
      if (remember && result.success) localStorage.setItem('vvRememberEmail', email.trim())
      else if (result.success) localStorage.removeItem('vvRememberEmail')
    } catch { /* storage blocked: nothing to remember */ }
    if (!result.success) return result

    setSuccessData({ email, remember })
    setShowSuccess(true)

    // Navigate after the success overlay has had a moment
    setTimeout(() => {
      navigate(homePathFor(result.session.role), { replace: true })
    }, 1500)

    return { success: true }
  }

  // Already signed in (Back from the portal, or "/" typed in): go straight to the portal instead of showing the form.
  if (!loading && session && !signingIn.current) return <Navigate to={homePathFor(session.role)} replace />

  return (
    <div className="container">
      <LeftSection />
      <RightSection onLogin={handleLogin} onSignedUp={() => navigate(homePathFor('customer'), { replace: true })} />
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
