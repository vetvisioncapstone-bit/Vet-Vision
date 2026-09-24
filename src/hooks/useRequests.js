import { api } from '../api/client'
import { invalidate, useResource } from '../api/store'
import { useSession } from './useSession'

// Approval requests. Staff raise them; the admin queue is what the notification bell shows.
// type: 'inventory-product' | 'patient' | 'consultation' (delete requests) | 'restock'.
// targetId: the inventory row id / patient id / consultation id the request is about.
// Queue item: { id, type, targetId, label, extra, productName, branch, requestedByName,
//               requestedByBranch, requestedAt, status }.  Staff always get an empty queue.
export function useApprovalRequests() {
  const { session } = useSession()
  const { data, loading, error, reload } = useResource('/requests/', { enabled: !!session, refreshMs: 30000 })
  const done = (targets = []) => Promise.all(['/requests/', ...targets].map(invalidate))

  return {
    items: data || [],
    loading,
    error,
    reload,
    raise: async ({ type, targetId, label, extra }) => {
      const r = await api.post('/requests/', { type, targetId: String(targetId), label, extra })
      await done()
      return r
    },
    // Approving a delete performs the delete on the server.
    approve: async (id) => { await api.post(`/requests/${id}/approve/`); await done(['/inventory/', '/patients/']) },
    deny: async (id) => { await api.post(`/requests/${id}/deny/`); await done() },
    dismiss: async (id) => { await api.post(`/requests/${id}/dismiss/`); await done() }
  }
}

// Which follow-up notifications this user has already opened ('petId|note' keys).
export function useSeenFollowUps() {
  const { session } = useSession()
  const { data } = useResource('/seen-followups/', { enabled: !!session })
  return {
    seenKeys: new Set(data || []),
    markSeen: async (keys) => {
      const fresh = keys.filter((k) => !(data || []).includes(k))
      if (fresh.length === 0) return
      await api.post('/seen-followups/', { keys: fresh })
      await invalidate('/seen-followups/')
    }
  }
}

export function followUpSeenKey(patient) {
  return `${patient.id}|${patient.followUpNote || ''}`
}
