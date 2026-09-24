import { useCallback } from 'react'
import { useLocalStorageState } from './useLocalStorageState'
import { useSession } from './useSession'

export const DELETE_REQUESTS_KEY = 'vvDeleteRequests'
export const RESTOCK_REQUESTS_KEY = 'vvRestockRequests'

function makeRequestId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// type: 'inventory-product' | 'patient' | 'consultation'.
// extra: for 'consultation', { patientId } identifying the owning patient.
export function useDeleteRequests() {
  const [requests, setRequests] = useLocalStorageState(DELETE_REQUESTS_KEY, [])
  const { session } = useSession()

  const raiseDeleteRequest = useCallback((type, targetId, label, extra) => {
    setRequests(prev => [...prev, {
      id: makeRequestId(),
      type,
      targetId,
      label,
      extra: extra || null,
      requestedByName: session ? session.name : 'Unknown staff',
      requestedByBranch: session ? session.branch : '',
      requestedAt: new Date().toISOString()
    }])
  }, [session, setRequests])

  const removeRequest = useCallback((requestId) => {
    setRequests(prev => prev.filter(r => r.id !== requestId))
  }, [setRequests])

  return { deleteRequests: requests, raiseDeleteRequest, removeRequest }
}

export function useRestockRequests() {
  const [requests, setRequests] = useLocalStorageState(RESTOCK_REQUESTS_KEY, [])
  const { session } = useSession()

  const raiseRestockRequest = useCallback((productId, productName, branch) => {
    setRequests(prev => [...prev, {
      id: makeRequestId(),
      productId,
      productName,
      branch: branch || (session ? session.branch : ''),
      requestedByName: session ? session.name : 'Unknown staff',
      requestedAt: new Date().toISOString()
    }])
  }, [session, setRequests])

  const dismissRestockRequest = useCallback((requestId) => {
    setRequests(prev => prev.filter(r => r.id !== requestId))
  }, [setRequests])

  return { restockRequests: requests, raiseRestockRequest, dismissRestockRequest }
}

export const SEEN_FOLLOWUPS_KEY = 'vvSeenFollowUps'

export function followUpSeenKey(patient) {
  return `${patient.id}|${patient.followUpNote || ''}`
}

export function useSeenFollowUps() {
  const [seenKeysArray, setSeenKeysArray] = useLocalStorageState(SEEN_FOLLOWUPS_KEY, [])

  const markSeen = useCallback((patients) => {
    setSeenKeysArray(prev => {
      const seen = new Set(prev)
      patients.forEach(p => seen.add(followUpSeenKey(p)))
      return [...seen]
    })
  }, [setSeenKeysArray])

  return { seenKeys: new Set(seenKeysArray), markSeen }
}
