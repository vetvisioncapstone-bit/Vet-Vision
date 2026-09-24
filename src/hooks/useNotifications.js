import { useCallback, useMemo } from 'react'
import { useSession } from './useSession'
import { usePatients } from './usePatients'
import { useInventory } from './useInventory'
import { useDeleteRequests, useRestockRequests, useSeenFollowUps, followUpSeenKey } from './useRequests'

export function getPatientLastVisitDate(patient) {
  if (!patient.consultations || patient.consultations.length === 0) return patient.createdAt
  return patient.consultations.reduce((latest, c) => (c.date > latest ? c.date : latest), patient.consultations[0].date)
}

// Aggregates everything the shared notification bell shows: delete/restock
// requests (admin-only) plus follow-up flags (everyone), mirroring
// dashboard.js's renderNotifications/approveDeleteRequest/executeApprovedDelete.
export function useNotifications() {
  const { session } = useSession()
  const [patients, setPatients] = usePatients()
  const [, setProducts] = useInventory()
  const { deleteRequests, raiseDeleteRequest, removeRequest } = useDeleteRequests()
  const { restockRequests, raiseRestockRequest, dismissRestockRequest } = useRestockRequests()
  const { seenKeys, markSeen } = useSeenFollowUps()

  const isAdminContext = !session || session.role === 'admin'

  const followUps = useMemo(
    () => patients.filter(p => p.status === 'Follow-up needed'),
    [patients]
  )

  const visibleDeleteRequests = isAdminContext ? deleteRequests : []
  const visibleRestockRequests = isAdminContext ? restockRequests : []
  const totalCount = followUps.length + visibleDeleteRequests.length + visibleRestockRequests.length

  const markFollowUpsSeen = useCallback(() => {
    markSeen(followUps)
  }, [markSeen, followUps])

  const executeApprovedDelete = useCallback((request) => {
    if (request.type === 'inventory-product') {
      setProducts(prev => prev.filter(p => p.id !== request.targetId))
    } else if (request.type === 'patient') {
      setPatients(prev => prev.filter(p => p.id !== request.targetId))
    } else if (request.type === 'consultation' && request.extra) {
      setPatients(prev => prev.map(p => p.id === request.extra.patientId
        ? { ...p, consultations: p.consultations.filter(c => c.id !== request.targetId) }
        : p))
    }
  }, [setProducts, setPatients])

  const approveDeleteRequest = useCallback((requestId) => {
    const request = deleteRequests.find(r => r.id === requestId)
    if (!request) return
    executeApprovedDelete(request)
    removeRequest(requestId)
  }, [deleteRequests, executeApprovedDelete, removeRequest])

  const denyDeleteRequest = useCallback((requestId) => {
    removeRequest(requestId)
  }, [removeRequest])

  return {
    followUps,
    seenKeys,
    followUpSeenKey,
    deleteRequests: visibleDeleteRequests,
    restockRequests: visibleRestockRequests,
    totalCount,
    isAdminContext,
    markFollowUpsSeen,
    approveDeleteRequest,
    denyDeleteRequest,
    dismissRestockRequest,
    raiseDeleteRequest,
    raiseRestockRequest,
    getPatientLastVisitDate
  }
}
