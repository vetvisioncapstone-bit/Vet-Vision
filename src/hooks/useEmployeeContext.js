import { useSession } from './useSession'

// Branch/name of the signed-in employee. RequireRole guarantees a session on employee pages.
export function useEmployeeContext() {
  const { session } = useSession()
  return { session, branch: session?.branch || '', name: session?.name || '' }
}
