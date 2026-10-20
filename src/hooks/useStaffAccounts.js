import { api } from '../api/client'
import { invalidate, useResource } from '../api/store'
import { useSession } from './useSession'

// Admin only. Account: { id, name, address, email, mobile, branch, position, photo, role: 'Staff',
//                        lastLogin ('Never' or an ISO datetime), hasLogin }
// Input: { name, address, email (@ecovet.ph), mobile, branch, position, photo, password }
// password is required on create and optional on edit (blank keeps the current one). Passwords are never
// returned. remove() deactivates the person (history keeps its attribution) and blocks their login.
export function useStaffAccounts() {
  const { session } = useSession()
  const { data, loading, error, reload } = useResource('/staff-accounts/', { enabled: session?.role === 'admin' })
  const refresh = () => invalidate('/staff-accounts/')
  return {
    items: data || [],
    loading,
    error,
    reload,
    create: async (input) => { const r = await api.post('/staff-accounts/', input); await refresh(); return r },
    update: async (id, input) => { const r = await api.put(`/staff-accounts/${id}/`, input); await refresh(); return r },
    remove: async (id) => { await api.del(`/staff-accounts/${id}/`); await refresh() }
  }
}
