import { api } from '../api/client'
import { invalidate, useResource } from '../api/store'
import { useSession } from './useSession'

// Patient = pet + owner:
//  { id, ownerId, ownerName, ownerSurname, ownerEmail, ownerAddress, ownerMobile, petName, petSpecie,
//    petBreed, petSex, petDob, petAge, petMarking, branch, status ('Active' | 'Follow-up needed'),
//    followUpNote, createdAt, consultations: [{ id, date, weight, notes, services, availedItems,
//    totalPrice, remarks, bloodTestImage, bloodTestName, waiverImage, waiverName, followUp, followUpNote }] }
// Follow-up status changes are computed by the server when a consultation is added.
// Pass { status: 'Follow-up needed' } for just the follow-ups.
export function usePatients({ branch, status } = {}) {
  const { session } = useSession()
  const qs = new URLSearchParams()
  if (branch) qs.set('branch', branch)
  if (status) qs.set('status', status)
  const key = `/patients/${qs.toString() ? `?${qs}` : ''}`
  const { data, loading, error, reload } = useResource(key, { enabled: !!session })

  const refresh = () => invalidate('/patients/')

  return {
    items: data || [],
    loading,
    error,
    reload,
    create: async (input) => { const row = await api.post('/patients/', input); await refresh(); return row },
    update: async (id, input) => { const row = await api.put(`/patients/${id}/`, input); await refresh(); return row },
    // Admin only. Staff raise a delete request instead.
    remove: async (id) => { await api.del(`/patients/${id}/`); await refresh() },
    // Resolves with the updated patient (including the new status and consultations).
    addConsultation: async (patientId, input) => {
      const row = await api.post(`/patients/${patientId}/consultations/`, input)
      await refresh()
      return row
    },
    // Admin only.
    removeConsultation: async (consultationId) => { await api.del(`/consultations/${consultationId}/`); await refresh() }
  }
}
