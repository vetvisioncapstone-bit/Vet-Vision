import { useSession } from './useSession'

// Branch/name of the signed-in employee. RequireRole guarantees a session on employee pages.
// `can(ability)`: what the staff member's position allows (the server sends the list; see core/permissions.py).
export function useEmployeeContext() {
  const { session } = useSession()
  const abilities = session?.abilities || []
  const can = (ability) => session?.role === 'admin' || abilities.includes(ability)
  return { session, branch: session?.branch || '', name: session?.name || '', can }
}
