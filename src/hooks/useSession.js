import { useState, useEffect, useCallback } from 'react'
import { getSession, setSession as persistSession, clearSession as removeSession } from '../utils/auth'

// Reactive wrapper around auth.js's sessionStorage-backed session, for
// components (Topbar, layouts) that need to re-render when it changes.
export function useSession() {
  const [session, setSessionState] = useState(() => getSession())

  useEffect(() => {
    function handleStorage() {
      setSessionState(getSession())
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  const setSession = useCallback((value) => {
    persistSession(value)
    setSessionState(value)
  }, [])

  const clearSession = useCallback(() => {
    removeSession()
    setSessionState(null)
  }, [])

  return { session, setSession, clearSession }
}
