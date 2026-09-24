import { useSession } from './useSession'

// Mirrors employee.js's getEmployeeBranch()/getEmployeeName() - no login
// wall in this prototype, so a missing session falls back to Ibaan/Staff
// instead of leaving the employee pages blank or broken.
export function useEmployeeContext() {
  const { session } = useSession()
  const branch = (session && session.branch) || 'Ibaan'
  const name = (session && session.name) || 'Staff'
  return { session, branch, name }
}
