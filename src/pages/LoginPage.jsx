import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import LeftSection from '../components/LeftSection'
import RightSection from '../components/RightSection'
import SuccessOverlay from '../components/SuccessOverlay'
import { getAdminProfile, getStaffAccounts, setSession } from '../utils/auth'
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

  const handleLogin = (email, password, remember) => {
    const adminProfile = getAdminProfile()
    let matchedSession = null

    // Check admin credentials
    if (email.toLowerCase() === adminProfile.email.toLowerCase() && password === adminProfile.password) {
      matchedSession = { 
        role: 'admin', 
        name: adminProfile.name, 
        email: adminProfile.email 
      }
    } else {
      // Check staff credentials
      const staffAccount = getStaffAccounts().find(
        a => a.email.toLowerCase() === email.toLowerCase() && a.password === password
      )
      if (staffAccount) {
        matchedSession = {
          role: 'employee',
          id: staffAccount.id,
          name: staffAccount.name,
          email: staffAccount.email,
          branch: staffAccount.branch,
          photo: staffAccount.photo || null
        }
      }
    }

    if (!matchedSession) {
      return { success: false, message: 'Incorrect email or password.' }
    }

    // Set session
    setSession(matchedSession)
    setSuccessData({ email, remember })
    setShowSuccess(true)

    // Navigate after delay
    setTimeout(() => {
      const destination = matchedSession.role === 'admin' 
        ? '/admin/dashboard' 
        : '/employee/dashboard'
      navigate(destination)
    }, 1500)

    return { success: true }
  }

  return (
    <div className="container">
      <LeftSection />
      <RightSection onLogin={handleLogin} />
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
