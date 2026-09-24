import { api } from '../api/client'
import { invalidate, useResource } from '../api/store'
import { useSession } from './useSession'

// Sale: { id, branch, staffId, staffName, items: [{ productId, name, quantity, price }], total, createdAt }
// (createdAt is a local ISO datetime 'YYYY-MM-DDTHH:MM:SS'). Newest first, branch-scoped for staff.
// Options: { since: 'YYYY-MM-DD', limit } - keep the payload small (history has 17k+ rows).
export function useSales({ since, limit = 200, branch } = {}) {
  const { session } = useSession()
  const qs = new URLSearchParams()
  if (since) qs.set('since', since)
  if (limit) qs.set('limit', String(limit))
  if (branch) qs.set('branch', branch)
  const { data, loading, error, reload } = useResource(`/sales/?${qs}`, { enabled: !!session })

  return {
    items: data || [],
    loading,
    error,
    reload,
    // items: [{ inventoryId, quantity, price }]. The server checks stock and the database deducts it,
    // so do NOT decrement inventory client-side. Throws ApiError (e.g. "Only 3 of X left in stock.").
    create: async (items, extra = {}) => {
      const sale = await api.post('/sales/', { items, ...extra })
      await Promise.all([invalidate('/sales/'), invalidate('/inventory/')])
      return sale
    }
  }
}
