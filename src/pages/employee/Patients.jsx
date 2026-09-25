import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { usePatient, usePatients } from '../../hooks/usePatients'
import { useDebounced } from '../../hooks/useDebounced'
import { getLastVisitDate } from '../../utils/visits'
import { useToast } from '../../components/shared/Toast'
import { useEmployeeContext } from '../../hooks/useEmployeeContext'
import { useApprovalRequests } from '../../hooks/useRequests'
import { errorMessage } from '../../api/client'
import '../../styles/admin/inventory.css'
import '../../styles/employee/employee-patients.css'
import { formatDate, todayIso, dash, getStatusClass } from '../../utils/format'

import Dialog from '../../components/shared/Dialog'
import { onActivate } from '../../utils/a11y'
// ==================== HELPERS ====================
// Ported from employee-patients.js - uses the same API-backed patients as the
// admin Patients page; the server scopes them to this employee's own branch. Only
// a simplified consultation form is kept here (no availed-items pricing,
// no blood-test/waiver upload, no follow-up flagging, no print) - matching
// the reduced scope of the original employee-patients.html.

const PAGE_SIZE = 50

const EMPTY_PATIENT_FORM = {
  ownerName: '', ownerSurname: '', ownerEmail: '', ownerAddress: '', ownerMobile: '',
  petName: '', petSpecie: '', petBreed: '', petSex: '', petDob: '', petAge: '', petMarking: ''
}

const EMPTY_CONSULT_FORM = { date: '', weight: '', notes: '', remarks: '' }

export default function Patients() {
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

  const [searchInput, setSearchInput] = useState('')
  const searchTerm = useDebounced(searchInput.trim()) // what goes to the server

  // Staff are already limited to their branch by the server; it also does the searching and paging.
  const {
    items: patients, loading, total: totalPatients, totalPages: serverTotalPages, stats: serverStats,
    create, update, addConsultation
  } = usePatients({ page, pageSize: PAGE_SIZE, q: searchTerm })

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_PATIENT_FORM)

  const [detailPatientId, setDetailPatientId] = useState(null)
  const [consultForm, setConsultForm] = useState(EMPTY_CONSULT_FORM)

  const branchPatients = patients
  const visiblePatients = patients
  const totalPages = serverTotalPages
  const currentPage = Math.min(page, totalPages)
  const pagePatients = patients
  useEffect(() => { setPage(1) }, [searchTerm])

  const statTotalPatients = serverStats?.total ?? 0
  const statFollowUpNeeded = serverStats?.followUpNeeded ?? 0

  // List rows leave out attached images; fetch the open patient in full.
  const { patient: detailFromServer } = usePatient(detailPatientId)
  const detailPatient = useMemo(
    () => detailFromServer || patients.find(p => p.id === detailPatientId) || null,
    [detailFromServer, patients, detailPatientId]
  )

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

  const { patient: deepLinkPatient } = usePatient(searchParams.get('followUp'))

  // Landing here from a notification bell click on another page links to
  // /employee/patients?followUp=<id> - jump straight to that patient.
  useEffect(() => {
    const followUpParamId = searchParams.get('followUp')
    if (!followUpParamId) {
      deepLinkHandledRef.current = false
      return
    }
    if (deepLinkHandledRef.current) return
    if (deepLinkPatient) {
      deepLinkHandledRef.current = true
      openDetailModal(deepLinkPatient)
    }
    // The patient loads asynchronously; re-check when it arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, deepLinkPatient])

  return (
    <main id="main-content" tabIndex={-1} className="content">
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
              <input type="text" aria-label="Search patients or owners" autoComplete="off" placeholder="search patient or owner" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
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
              ) : patients.length === 0 && !searchTerm ? (
                <tr><td colSpan="6" className="empty-state">No patients for this branch yet. Click "+ New" to add one.</td></tr>
              ) : patients.length === 0 ? (
                <tr><td colSpan="6" className="empty-state">No patients match your search.</td></tr>
              ) : pagePatients.map(p => (
                <tr className="patient-row" key={p.id} tabIndex={0} onKeyDown={onActivate(() => openDetailModal(p))} onClick={() => openDetailModal(p)}>
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
            <p className="table-footer-count">Showing {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, totalPatients)} of {totalPatients} entries</p>
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
      <Dialog open={!!(modalOpen)} onClose={closeModal} label={editingId ? 'Edit patient' : 'New patient'}>
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
                <label className="form-label" htmlFor="src-pages-employee-patients-f1">Owner name <span className="required">*</span></label>
                <input id="src-pages-employee-patients-f1" type="text" className="form-input" required value={form.ownerName} onChange={(e) => setForm(f => ({ ...f, ownerName: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="src-pages-employee-patients-f2">Owner surname <span className="required">*</span></label>
                <input id="src-pages-employee-patients-f2" type="text" className="form-input" required value={form.ownerSurname} onChange={(e) => setForm(f => ({ ...f, ownerSurname: e.target.value }))} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="src-pages-employee-patients-f3">Owner email <span className="required">*</span></label>
              <input id="src-pages-employee-patients-f3" type="email" className="form-input" required value={form.ownerEmail} onChange={(e) => setForm(f => ({ ...f, ownerEmail: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="src-pages-employee-patients-f4">Owner address <span className="required">*</span></label>
              <input id="src-pages-employee-patients-f4" type="text" className="form-input" required value={form.ownerAddress} onChange={(e) => setForm(f => ({ ...f, ownerAddress: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="src-pages-employee-patients-f5">Mobile No. <span className="required">*</span></label>
              <input id="src-pages-employee-patients-f5" type="tel" className="form-input" required value={form.ownerMobile} onChange={(e) => setForm(f => ({ ...f, ownerMobile: e.target.value }))} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="src-pages-employee-patients-f6">Pet name <span className="required">*</span></label>
                <input id="src-pages-employee-patients-f6" type="text" className="form-input" required value={form.petName} onChange={(e) => setForm(f => ({ ...f, petName: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="src-pages-employee-patients-f7">Specie <span className="required">*</span></label>
                <div className="form-select-wrapper">
                  <select id="src-pages-employee-patients-f7" className="form-input" required value={form.petSpecie} onChange={(e) => setForm(f => ({ ...f, petSpecie: e.target.value }))}>
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
                <label className="form-label" htmlFor="src-pages-employee-patients-f8">Breed <span className="required">*</span></label>
                <input id="src-pages-employee-patients-f8" type="text" className="form-input" required value={form.petBreed} onChange={(e) => setForm(f => ({ ...f, petBreed: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="src-pages-employee-patients-f9">Sex <span className="required">*</span></label>
                <div className="form-select-wrapper">
                  <select id="src-pages-employee-patients-f9" className="form-input" required value={form.petSex} onChange={(e) => setForm(f => ({ ...f, petSex: e.target.value }))}>
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
                <label className="form-label" htmlFor="src-pages-employee-patients-f10">Date of birth <span className="required">*</span></label>
                <input id="src-pages-employee-patients-f10" type="date" className="form-input" required value={form.petDob} onChange={(e) => setForm(f => ({ ...f, petDob: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="src-pages-employee-patients-f11">Age <span className="required">*</span></label>
                <input id="src-pages-employee-patients-f11" type="number" className="form-input" min="0" required value={form.petAge} onChange={(e) => setForm(f => ({ ...f, petAge: e.target.value }))} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="src-pages-employee-patients-f12">Color &amp; marking <span className="required">*</span></label>
              <input id="src-pages-employee-patients-f12" type="text" className="form-input" required value={form.petMarking} onChange={(e) => setForm(f => ({ ...f, petMarking: e.target.value }))} />
            </div>

            <div className="patient-form-actions">
              <button type="button" className="patient-cancel-btn" onClick={closeModal}>Cancel</button>
              <button type="submit" className="patient-save-btn" disabled={saving}>{editingId ? 'Save changes' : 'Save'}</button>
            </div>
          </form>
        </div>
      </Dialog>

      {/* Patient detail modal */}
      <Dialog open={!!(detailPatient)} onClose={closeDetailModal} label={'Patient details'}>
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
                    <label className="form-label" htmlFor="src-pages-employee-patients-f13">Date <span className="required">*</span></label>
                    <input id="src-pages-employee-patients-f13" type="date" className="form-input" required value={consultForm.date} onChange={(e) => setConsultForm(f => ({ ...f, date: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="src-pages-employee-patients-f14">Weight</label>
                    <input id="src-pages-employee-patients-f14" type="text" className="form-input" placeholder="e.g. 6-8 kg" value={consultForm.weight} onChange={(e) => setConsultForm(f => ({ ...f, weight: e.target.value }))} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="src-pages-employee-patients-f15">Treatment / findings <span className="required">*</span></label>
                  <textarea id="src-pages-employee-patients-f15" className="form-input" rows="3" required value={consultForm.notes} onChange={(e) => setConsultForm(f => ({ ...f, notes: e.target.value }))}></textarea>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="src-pages-employee-patients-f16">Remarks</label>
                  <input id="src-pages-employee-patients-f16" type="text" className="form-input" value={consultForm.remarks} onChange={(e) => setConsultForm(f => ({ ...f, remarks: e.target.value }))} />
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
      </Dialog>
    </main>
  )
}
