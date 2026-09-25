import { useApprovalRequests, useSeenFollowUps, followUpSeenKey } from './useRequests'
import { usePatients } from './usePatients'
import { useSession } from './useSession'
import { getLastVisitDate } from '../utils/visits'

// The bell shows the registration date for a follow-up patient who has no visit on record yet.
export const getPatientLastVisitDate = (patient) => getLastVisitDate(patient) || patient.createdAt

// Everything the shared notification bell shows: follow-up flags (everyone) and, for the admin,
// pending delete / restock requests. Same shape the Topbar used with the localStorage version.
export function useNotifications() {
  const { session } = useSession()
  const isAdminContext = session?.role === 'admin'
  // The bell lists the 50 most recent follow-ups and shows the true total as its count.
  const { items: followUps, total: followUpTotal } = usePatients({ status: 'Follow-up needed', page: 1, pageSize: 50 })
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
    totalCount: followUpTotal + deleteRequests.length + restockRequests.length,
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
