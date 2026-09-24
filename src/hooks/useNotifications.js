import { useApprovalRequests, useSeenFollowUps, followUpSeenKey } from './useRequests'
import { usePatients } from './usePatients'
import { useSession } from './useSession'

export function getPatientLastVisitDate(patient) {
  if (!patient.consultations || patient.consultations.length === 0) return patient.createdAt
  return patient.consultations.reduce((latest, c) => (c.date > latest ? c.date : latest), patient.consultations[0].date)
}

// Everything the shared notification bell shows: follow-up flags (everyone) and, for the admin,
// pending delete / restock requests. Same shape the Topbar used with the localStorage version.
export function useNotifications() {
  const { session } = useSession()
  const isAdminContext = session?.role === 'admin'
  const { items: followUps } = usePatients({ status: 'Follow-up needed' })
  const requests = useApprovalRequests()
  const { seenKeys, markSeen } = useSeenFollowUps()

  const deleteRequests = isAdminContext ? requests.items.filter((r) => r.type !== 'restock') : []
  const restockRequests = isAdminContext ? requests.items.filter((r) => r.type === 'restock') : []

  return {
    followUps,
    seenKeys,
    followUpSeenKey,
    deleteRequests,
    restockRequests,
    totalCount: followUps.length + deleteRequests.length + restockRequests.length,
    isAdminContext,
    markFollowUpsSeen: () => markSeen(followUps.map(followUpSeenKey)),
    approveDeleteRequest: (id) => requests.approve(id),
    denyDeleteRequest: (id) => requests.deny(id),
    dismissRestockRequest: (id) => requests.dismiss(id),
    raiseDeleteRequest: (type, targetId, label, extra) => requests.raise({ type, targetId, label, extra }),
    raiseRestockRequest: (productId, productName) =>
      requests.raise({ type: 'restock', targetId: productId, label: productName }),
    getPatientLastVisitDate
  }
}
