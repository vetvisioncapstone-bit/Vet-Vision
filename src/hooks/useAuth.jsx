import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, clearTokens, errorMessage, getRefreshToken, refreshAccess, setTokens, signOut } from '../api/client'
import { clearCache } from '../api/store'

const AuthContext = createContext(null)
const SIGNED_OUT_KEY = 'vvSignedOut' // written on sign-out so every other open tab signs out too

// Ends the session in this tab. A fresh page at the sign-in screen replaces the current one in the history, and the
// memory of the old page goes with it.
function leaveSession() {
  signOut()
  clearCache()
  window.location.replace('/')
}

// The API calls non-admin clinic users "staff"; the React pages have always called them "employee".
function toSession(user) {
  if (!user) return null
  return { ...user, role: user.role === 'staff' ? 'employee' : user.role }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(() => Boolean(getRefreshToken()))

  // Restore the session after a reload (refresh token lives in sessionStorage).
  useEffect(() => {
    if (!getRefreshToken()) return undefined
    let cancelled = false
    ;(async () => {
      try {
        if (await refreshAccess()) {
          const me = await api.get('/auth/me/')
          if (!cancelled) setUser(me)
        } else {
          clearTokens()
        }
      } catch {
        clearTokens()
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // The API client raises this when a refresh fails (expired / revoked session).
  useEffect(() => {
    const onExpired = () => { clearCache(); setUser(null) }
    window.addEventListener('vv-auth-expired', onExpired)
    return () => window.removeEventListener('vv-auth-expired', onExpired)
  }, [])

  useEffect(() => {
    const onStorage = (e) => { if (e.key === SIGNED_OUT_KEY && window.location.pathname !== '/') leaveSession() }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const login = useCallback(async (email, password, captcha, remember = false) => {
    try {
      const data = await api.post('/auth/login/', { email, password, captcha })
      setTokens({ access: data.access, refresh: data.refresh }, remember)
      setUser(data.user)
      return { success: true, session: toSession(data.user) }
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Incorrect email or password.') }
    }
  }, [])

  // A pet owner creates their own account and is signed straight in.
  const register = useCallback(async (fields) => {
    try {
      const data = await api.post('/auth/register/', fields)
      setTokens({ access: data.access, refresh: data.refresh })
      setUser(data.user)
      return { success: true }
    } catch (err) {
      // `fields`: the server's per-field messages ({ email: [...], password: [...] }) so the form can show each one
      // next to its field.
      return { success: false, message: errorMessage(err, 'Could not create the account. Please try again.'), fields: err?.data || null }
    }
  }, [])

  const logout = useCallback(() => {
    try { localStorage.setItem(SIGNED_OUT_KEY, String(Date.now())) } catch { /* storage blocked: this tab only */ }
    setUser(null)
    leaveSession()
  }, [])

  const value = useMemo(
    () => ({ user, session: toSession(user), loading, login, register, logout, setUser }),
    [user, loading, login, register, logout]
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
