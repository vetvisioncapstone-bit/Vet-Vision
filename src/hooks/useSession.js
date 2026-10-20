import { useAuth } from './useAuth'

// Compatibility wrapper: the pages read `session.role/name/email/branch/photo` and call clearSession()
// to sign out. The session now comes from the API (see useAuth), not sessionStorage.
export function useSession() {
  const { session, loading, logout } = useAuth()
  return { session, loading, clearSession: logout }
}
