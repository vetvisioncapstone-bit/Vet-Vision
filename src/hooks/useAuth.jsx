import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, clearTokens, errorMessage, getRefreshToken, refreshAccess, setTokens } from '../api/client'
import { clearCache } from '../api/store'

const AuthContext = createContext(null)

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

  const login = useCallback(async (email, password) => {
    try {
      const data = await api.post('/auth/login/', { email, password })
      setTokens({ access: data.access, refresh: data.refresh })
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
      return { success: false, message: errorMessage(err, 'Could not create the account. Please try again.') }
    }
  }, [])

  const logout = useCallback(() => {
    const refresh = getRefreshToken()
    if (refresh) api.post('/auth/logout/', { refresh }).catch(() => {}) // revoke it server-side, best effort
    clearTokens()
    clearCache()
    setUser(null)
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
