import { api } from '../api/client'
import { invalidate, useResource } from '../api/store'
import { useSession } from './useSession'

// Patient = pet + owner:
//  { id, ownerId, ownerName, ownerSurname, ownerEmail, ownerAddress, ownerMobile, petName, petSpecie,
//    petBreed, petSex, petDob, petAge, petMarking, branch, status ('Active' | 'Follow-up needed'),
//    followUpNote, createdAt, consultations: [{ id, date, weight, notes, services, availedItems,
//    totalPrice, remarks, bloodTestImage, bloodTestName, waiverImage, waiverName, followUp, followUpNote }] }
// Follow-up status changes are computed by the server when a consultation is added.
//
// Two modes:
//  - usePatients({ page, pageSize, q, branch, status, year, visitYear }) is server-side paginated. `status` is a string or an
//    array. It returns { items (this page), total, totalPages, page, stats: { total, followUpNeeded,
//    activeThisMonth, years } }. List rows leave out attached images (blood test / waiver): use usePatient(id) for those.
//  - usePatients({ branch, status }) with no `page` still returns every matching patient (avoid on big lists).
export function usePatients({ branch, status, q, page, pageSize, year, visitYear } = {}) {
  const { session } = useSession()
  const qs = new URLSearchParams()
  if (page) qs.set('page', String(page))
  if (page && pageSize) qs.set('pageSize', String(pageSize))
  if (branch && branch !== 'All Branches') qs.set('branch', branch)
  const statuses = Array.isArray(status) ? status : status ? [status] : []
  if (statuses.length) qs.set('status', statuses.join(','))
  if (q) qs.set('q', q)
  if (year) qs.set('year', String(year)) // registered in this year
  if (visitYear) qs.set('visitYear', String(visitYear)) // had a visit in this year
  const key = `/patients/${qs.toString() ? `?${qs}` : ''}`
  const { data, loading, error, reload } = useResource(key, { enabled: !!session })

  const paged = !!page && data && !Array.isArray(data)
  const refresh = () => invalidate('/patients/')

  return {
    items: paged ? data.results : Array.isArray(data) ? data : [],
    total: paged ? data.count : Array.isArray(data) ? data.length : 0,
    totalPages: paged ? data.totalPages : 1,
    page: paged ? data.page : 1,
    stats: paged ? data.stats : null,
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

// One patient with everything, including attached images. Pass null to skip the request.
export function usePatient(id) {
  const { session } = useSession()
  const { data, loading, error } = useResource(id ? `/patients/${id}/` : null, { enabled: !!session && !!id })
  return { patient: id ? data || null : null, loading, error }
}
