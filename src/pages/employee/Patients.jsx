import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { usePatients } from '../../hooks/usePatients'
import { useToast } from '../../components/shared/Toast'
import { useEmployeeContext } from '../../hooks/useEmployeeContext'
import { useApprovalRequests } from '../../hooks/useRequests'
import { errorMessage } from '../../api/client'
import '../../styles/admin/inventory.css'
import '../../styles/employee/employee-patients.css'

// ==================== HELPERS ====================
// Ported from employee-patients.js - uses the same API-backed patients as the
// admin Patients page; the server scopes them to this employee's own branch. Only
// a simplified consultation form is kept here (no availed-items pricing,
// no blood-test/waiver upload, no follow-up flagging, no print) - matching
// the reduced scope of the original employee-patients.html.

function formatDate(isoString) {
  if (!isoString) return '—'
  const [year, month, day] = isoString.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getLastVisitDate(patient) {
  if (!patient.consultations || patient.consultations.length === 0) return patient.createdAt || ''
  return patient.consultations.reduce((latest, c) => ((c.date || '') > latest ? c.date : latest), patient.consultations[0].date || '')
}

function dash(value) {
  return value === null || value === undefined || value === '' ? '—' : value
}

const PAGE_SIZE = 50

function getStatusClass(status) {
  switch (status) {
    case 'Active': return 'status-ok'
    case 'Follow-up needed': return 'status-follow-up'
    default: return 'status-inactive'
  }
}

const EMPTY_PATIENT_FORM = {
  ownerName: '', ownerSurname: '', ownerEmail: '', ownerAddress: '', ownerMobile: '',
  petName: '', petSpecie: '', petBreed: '', petSex: '', petDob: '', petAge: '', petMarking: ''
}

const EMPTY_CONSULT_FORM = { date: '', weight: '', notes: '', remarks: '' }

export default function Patients() {
  const { items: patients, loading, create, update, addConsultation } = usePatients()
  const showToast = useToast()
  const { branch } = useEmployeeContext()
  const { raise } = useApprovalRequests()
  const [saving, setSaving] = useState(false)
  const [page, setPage] = useState(1)
  const deepLinkHandledRef = useRef(false)
  const [searchParams] = useSearchParams()

  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(id)
  }, [])

  const [searchTerm, setSearchTerm] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_PATIENT_FORM)

  const [detailPatientId, setDetailPatientId] = useState(null)
  const [consultForm, setConsultForm] = useState(EMPTY_CONSULT_FORM)

  const branchPatients = useMemo(() => patients.filter(p => p.branch === branch), [patients, branch])
  const visiblePatients = useMemo(() => {
    return branchPatients.filter(p => {
      if (!searchTerm) return true
      const ownerFullName = `${p.ownerName || ''} ${p.ownerSurname || ''}`.toLowerCase()
      return (p.petName || '').toLowerCase().includes(searchTerm)
        || ownerFullName.includes(searchTerm)
        || (p.ownerEmail || '').toLowerCase().includes(searchTerm)
    })
  }, [branchPatients, searchTerm])

  const totalPages = Math.max(1, Math.ceil(visiblePatients.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pagePatients = useMemo(
    () => visiblePatients.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [visiblePatients, currentPage]
  )
  useEffect(() => { setPage(1) }, [searchTerm])

  const statTotalPatients = branchPatients.length
  const statFollowUpNeeded = useMemo(() => branchPatients.filter(p => p.status === 'Follow-up needed').length, [branchPatients])

  const detailPatient = useMemo(() => patients.find(p => p.id === detailPatientId) || null, [patients, detailPatientId])

  function openAddModal() {
    setEditingId(null)
    setForm(EMPTY_PATIENT_FORM)
    setModalOpen(true)
  }

  function openEditModal(patient) {
    setEditingId(patient.id)
    setForm({
      ownerName: patient.ownerName || '',
      ownerSurname: patient.ownerSurname || '',
      ownerEmail: patient.ownerEmail || '',
      ownerAddress: patient.ownerAddress || '',
      ownerMobile: patient.ownerMobile || '',
      petName: patient.petName || '',
      petSpecie: patient.petSpecie || '',
      petBreed: patient.petBreed || '',
      petSex: patient.petSex || '',
      petDob: patient.petDob || '',
      petAge: patient.petAge ?? '',
      petMarking: patient.petMarking || ''
    })
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditingId(null)
  }

  function openDetailModal(patient) {
    setDetailPatientId(patient.id)
    setConsultForm({ ...EMPTY_CONSULT_FORM, date: todayIso() })
  }

  function closeDetailModal() {
    setDetailPatientId(null)
  }

  // Escape closes whichever modal is open, same as the original's document
  // keydown listener.
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        closeModal()
        closeDetailModal()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (saving) return

    const patientData = {
      ownerName: form.ownerName.trim(),
      ownerSurname: form.ownerSurname.trim(),
      ownerEmail: form.ownerEmail.trim().toLowerCase(),
      ownerAddress: form.ownerAddress.trim(),
      ownerMobile: form.ownerMobile.trim(),
      petName: form.petName.trim(),
      petSpecie: form.petSpecie,
      petBreed: form.petBreed.trim(),
      petSex: form.petSex,
      petDob: form.petDob,
      petAge: form.petAge === '' ? null : Number(form.petAge),
      petMarking: form.petMarking.trim(),
      branch
    }

    setSaving(true)
    try {
      if (editingId) {
        await update(editingId, patientData)
        showToast(`"${patientData.petName}" was updated.`)
        closeModal()
      } else {
        const newPatient = await create(patientData)
        showToast(`"${patientData.petName}" was added.`)
        closeModal()
        openDetailModal(newPatient)
      }
    } catch (err) {
      showToast(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteRequest(patient) {
    if (!confirm(`Send a request to the admin to delete "${patient.petName}"'s record?`)) return
    try {
      await raise({
        type: 'patient',
        targetId: patient.id,
        label: `${patient.petName} (${patient.ownerName} ${patient.ownerSurname})`
      })
      showToast(`Delete request for "${patient.petName}" sent to the admin.`)
      closeDetailModal()
    } catch (err) {
      showToast(errorMessage(err))
    }
  }

  async function handleConsultationSubmit(e) {
    e.preventDefault()
    if (!detailPatient || saving) return

    setSaving(true)
    try {
      await addConsultation(detailPatient.id, {
        date: consultForm.date,
        weight: consultForm.weight.trim(),
        notes: consultForm.notes.trim(),
        remarks: consultForm.remarks.trim()
      })
      setConsultForm({ ...EMPTY_CONSULT_FORM, date: todayIso() })
      showToast('Consultation logged.')
    } catch (err) {
      showToast(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  // Landing here from a notification bell click on another page links to
  // /employee/patients?followUp=<id> - jump straight to that patient.
  useEffect(() => {
    const followUpParamId = searchParams.get('followUp')
    if (!followUpParamId) {
      deepLinkHandledRef.current = false
      return
    }
    if (deepLinkHandledRef.current) return
    const targetPatient = patients.find(p => p.id === followUpParamId)
    if (targetPatient) {
      deepLinkHandledRef.current = true
      openDetailModal(targetPatient)
    }
    // Patients load asynchronously, so re-check when the list arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, patients])

  return (
    <main className="content">
      <div className="content-header">
        <h1>My Branch - {branch}</h1>
        <div className="employee-datetime">
          <p>{now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
          <p>{now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</p>
        </div>
      </div>

      <div className="scope-banner">
        <p>You are viewing patients registered at your branch only.</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <p className="stat-label">Total patients</p>
          <p className="stat-value">{statTotalPatients}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Follow-up needed</p>
          <p className="stat-value">{statFollowUpNeeded}</p>
        </div>
      </div>

      <div className="table-card">
        <div className="table-card-header">
          <h2>Patient Records</h2>
          <div className="header-filters">
            <div className="search-wrapper">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              <input type="text" placeholder="search patient or owner" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value.trim().toLowerCase())} />
            </div>
            <button className="new-btn" onClick={openAddModal}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              <span>New</span>
            </button>
          </div>
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Patient</th>
                <th>Owner</th>
                <th>Specie</th>
                <th>Last visit</th>
                <th>Status</th>
                <th className="action-col"></th>
              </tr>
            </thead>
            <tbody>
              {loading && patients.length === 0 ? (
                <tr><td colSpan="6" className="empty-state">Loading patients...</td></tr>
              ) : branchPatients.length === 0 ? (
                <tr><td colSpan="6" className="empty-state">No patients for this branch yet. Click "+ New" to add one.</td></tr>
              ) : visiblePatients.length === 0 ? (
                <tr><td colSpan="6" className="empty-state">No patients match your search.</td></tr>
              ) : pagePatients.map(p => (
                <tr className="patient-row" key={p.id} onClick={() => openDetailModal(p)}>
                  <td>{dash(p.petName)}</td>
                  <td>{dash(`${p.ownerName || ''} ${p.ownerSurname || ''}`.trim())}</td>
                  <td>{dash(p.petSpecie)}</td>
                  <td>{formatDate(getLastVisitDate(p))}</td>
                  <td><span className={`status-pill ${getStatusClass(p.status)}`}>{p.status}</span></td>
                  <td className="action-col"></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="table-footer">
            <p className="table-footer-count">Showing {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, visiblePatients.length)} of {visiblePatients.length} entries</p>
            <div className="pagination">
              <button className="page-btn" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} aria-label="Previous page">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <button className="page-btn active" disabled>{currentPage} / {totalPages}</button>
              <button className="page-btn" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)} aria-label="Next page">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit patient modal */}
      <div className={`modal-overlay${modalOpen ? ' show' : ''}`} onClick={closeModal}>
        <div className="modal patient-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>{editingId ? 'Edit patient' : 'New patient'}</h2>
            <button className="modal-close" aria-label="Close" onClick={closeModal}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>

          <form className="modal-body" onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Owner name <span className="required">*</span></label>
                <input type="text" className="form-input" required value={form.ownerName} onChange={(e) => setForm(f => ({ ...f, ownerName: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Owner surname <span className="required">*</span></label>
                <input type="text" className="form-input" required value={form.ownerSurname} onChange={(e) => setForm(f => ({ ...f, ownerSurname: e.target.value }))} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Owner email <span className="required">*</span></label>
              <input type="email" className="form-input" required value={form.ownerEmail} onChange={(e) => setForm(f => ({ ...f, ownerEmail: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Owner address <span className="required">*</span></label>
              <input type="text" className="form-input" required value={form.ownerAddress} onChange={(e) => setForm(f => ({ ...f, ownerAddress: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Mobile No. <span className="required">*</span></label>
              <input type="tel" className="form-input" required value={form.ownerMobile} onChange={(e) => setForm(f => ({ ...f, ownerMobile: e.target.value }))} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Pet name <span className="required">*</span></label>
                <input type="text" className="form-input" required value={form.petName} onChange={(e) => setForm(f => ({ ...f, petName: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Specie <span className="required">*</span></label>
                <div className="form-select-wrapper">
                  <select className="form-input" required value={form.petSpecie} onChange={(e) => setForm(f => ({ ...f, petSpecie: e.target.value }))}>
                    <option value="" disabled hidden></option>
                    <option>Dog</option>
                    <option>Cat</option>
                    <option>Other</option>
                  </select>
                  <svg className="form-select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                </div>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Breed <span className="required">*</span></label>
                <input type="text" className="form-input" required value={form.petBreed} onChange={(e) => setForm(f => ({ ...f, petBreed: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Sex <span className="required">*</span></label>
                <div className="form-select-wrapper">
                  <select className="form-input" required value={form.petSex} onChange={(e) => setForm(f => ({ ...f, petSex: e.target.value }))}>
                    <option value="" disabled hidden></option>
                    <option>Male</option>
                    <option>Female</option>
                  </select>
                  <svg className="form-select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                </div>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Date of birth <span className="required">*</span></label>
                <input type="date" className="form-input" required value={form.petDob} onChange={(e) => setForm(f => ({ ...f, petDob: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Age <span className="required">*</span></label>
                <input type="number" className="form-input" min="0" required value={form.petAge} onChange={(e) => setForm(f => ({ ...f, petAge: e.target.value }))} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Color &amp; marking <span className="required">*</span></label>
              <input type="text" className="form-input" required value={form.petMarking} onChange={(e) => setForm(f => ({ ...f, petMarking: e.target.value }))} />
            </div>

            <div className="patient-form-actions">
              <button type="button" className="patient-cancel-btn" onClick={closeModal}>Cancel</button>
              <button type="submit" className="patient-save-btn" disabled={saving}>{editingId ? 'Save changes' : 'Save'}</button>
            </div>
          </form>
        </div>
      </div>

      {/* Patient detail modal */}
      <div className={`modal-overlay${detailPatient ? ' show' : ''}`} onClick={closeDetailModal}>
        {detailPatient && (
          <div className="modal patient-detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>{detailPatient.petName}</h2>
                <p className="detail-owner-sub">{detailPatient.ownerName} {detailPatient.ownerSurname}</p>
              </div>
              <button className="modal-close" aria-label="Close" onClick={closeDetailModal}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>

            <div className="modal-body detail-modal-body">
              <div className="detail-info-grid">
                <p className="detail-info-sub">{dash(detailPatient.ownerEmail)}</p>
                <p className="detail-info-sub">{dash(detailPatient.ownerMobile)}</p>
                <p className="detail-info-sub">{dash(detailPatient.petSpecie)} — {dash(detailPatient.petBreed)}</p>
                <span className={`status-pill ${getStatusClass(detailPatient.status)}`}>{detailPatient.status}</span>
                <div className="detail-action-btns">
                  <button type="button" className="detail-edit-btn" onClick={() => { closeDetailModal(); openEditModal(detailPatient) }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z" /></svg>
                    <span>Edit info</span>
                  </button>
                  <button type="button" className="row-action-btn delete" aria-label="Request deletion" onClick={() => handleDeleteRequest(detailPatient)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
                  </button>
                </div>
              </div>

              <h3 className="detail-history-title">New consultation</h3>
              <form className="consultation-form" onSubmit={handleConsultationSubmit}>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Date <span className="required">*</span></label>
                    <input type="date" className="form-input" required value={consultForm.date} onChange={(e) => setConsultForm(f => ({ ...f, date: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Weight</label>
                    <input type="text" className="form-input" placeholder="e.g. 6-8 kg" value={consultForm.weight} onChange={(e) => setConsultForm(f => ({ ...f, weight: e.target.value }))} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Treatment / findings <span className="required">*</span></label>
                  <textarea className="form-input" rows="3" required value={consultForm.notes} onChange={(e) => setConsultForm(f => ({ ...f, notes: e.target.value }))}></textarea>
                </div>
                <div className="form-group">
                  <label className="form-label">Remarks</label>
                  <input type="text" className="form-input" value={consultForm.remarks} onChange={(e) => setConsultForm(f => ({ ...f, remarks: e.target.value }))} />
                </div>
                <div className="consultation-form-actions">
                  <button type="submit" className="patient-save-btn" disabled={saving}>Save consultation</button>
                </div>
              </form>

              <h3 className="detail-history-title">History</h3>
              <div className="consultation-history">
                {(!detailPatient.consultations || detailPatient.consultations.length === 0) ? (
                  <p className="empty-state">No consultations logged yet.</p>
                ) : [...detailPatient.consultations].sort((a, b) => (b.date || '').localeCompare(a.date || '') || String(b.id).localeCompare(String(a.id))).map(c => (
                  <div className="consultation-item" key={c.id}>
                    <div className="consultation-item-head">
                      <span>
                        <span className="consultation-date">{formatDate(c.date)}</span>
                        {c.weight && <span className="consultation-weight">{c.weight}</span>}
                      </span>
                    </div>
                    <p className="consultation-field">{c.notes}</p>
                    {c.remarks && <p className="consultation-remarks">{c.remarks}</p>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
