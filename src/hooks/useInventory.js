import { api } from '../api/client'
import { invalidate, useResource } from '../api/store'
import { useSession } from './useSession'

// Flat inventory rows: { id, productId, name, category, branch, quantity, reorderPoint,
//                        delivery, expiration, photo, unitPrice }   (empty string for missing dates)
// Staff are confined to their own branch by the server; admins may pass { branch: 'Ibaan' }.
// Mutations throw ApiError (use errorMessage(err) from ../api/client for a toast).
export function useInventory({ branch } = {}) {
  const { session } = useSession()
  const key = `/inventory/${branch ? `?branch=${encodeURIComponent(branch)}` : ''}`
  const { data, loading, error, reload } = useResource(key, { enabled: !!session })

  const refresh = () => invalidate('/inventory/')

  return {
    items: data || [],
    loading,
    error,
    reload,
    create: async (input) => { const row = await api.post('/inventory/', input); await refresh(); return row },
    update: async (id, input) => { const row = await api.put(`/inventory/${id}/`, input); await refresh(); return row },
    // Admin only. Staff must raise a delete request instead (see useApprovalRequests).
    remove: async (id) => { await api.del(`/inventory/${id}/`); await refresh() }
  }
}
