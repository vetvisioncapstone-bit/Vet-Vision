import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { usePatient, usePatients } from '../../hooks/usePatients'
import PatientPrintSheet from './PatientPrintSheet'
import { useDebounced } from '../../hooks/useDebounced'
import { getLastVisitDate } from '../../utils/visits'
import { useInventory } from '../../hooks/useInventory'
import { useToast } from '../../components/shared/Toast'
import { errorMessage } from '../../api/client'
import '../../styles/admin/patients.css'
import { formatDate, todayIso, formatPrice, dash, getStatusClass, isImageDataUrl } from '../../utils/format'

import Dialog from '../../components/shared/Dialog'
import { onActivate } from '../../utils/a11y'
// ==================== CONSTANTS ====================
// The clinic's service catalog. Products, on the other hand, come from the
// Inventory page's own records (useInventory) so the two stay a single
// source of truth instead of drifting apart. Ported verbatim from
// admin/patients.js's CLINIC_SERVICES.
const CLINIC_SERVICES = [
  'Consultation / Check-up',
  'Vaccination',
  'Deworming',
  'Grooming',
  'Dental Cleaning',
  'Spay/Neuter Surgery',
  'X-Ray',
  'Laboratory Test',
  'Ultrasound',
  'Boarding',
  'Wound Care / Minor Surgery',
  'Microchipping'
]

const PAGE_SIZE = 50

const EMPTY_PATIENT_FORM = {
  ownerName: '', ownerSurname: '', ownerEmail: '', ownerAddress: '', ownerMobile: '',
  petName: '', petSpecie: '', petBreed: '', petSex: '', petDob: '', petAge: '', petMarking: '',
  branch: ''
}

// ==================== HELPERS (pure, module-level) ====================

// Visit count / last visit are derived from consultation history rather than
// stored separately, so they can never drift out of sync with it.
function getVisitCount(patient) {
  return patient.consultations ? patient.consultations.length : 0
}

export default function Patients() {
  const { items: inventoryItems } = useInventory()
  const showToast = useToast()
  const [saving, setSaving] = useState(false)
  const [page, setPage] = useState(1)
  const [searchParams] = useSearchParams()

  // ==================== STATE: search / filter / selection ====================
  const [searchInput, setSearchInput] = useState('')
  const [selectedBranch, setSelectedBranch] = useState('All Branches')
  const [activeStatuses, setActiveStatuses] = useState(() => new Set())
  const [selectedPatientIds, setSelectedPatientIds] = useState(() => new Set())
  const [filterOpen, setFilterOpen] = useState(false)
  const [printJob, setPrintJob] = useState(null) // { patient, consultations, single } while the print sheet is open
  const [regYear, setRegYear] = useState('') // '' = any year
  const [visitYear, setVisitYear] = useState('')

  const searchTerm = useDebounced(searchInput.trim()) // what goes to the server

  // The server does the searching, filtering and paging; only the current page is ever loaded.
  const {
    items: patients, loading, total: totalPatients, totalPages: serverTotalPages, stats: serverStats,
    create, update, remove, addConsultation, removeConsultation
  } = usePatients({
    page, pageSize: PAGE_SIZE, q: searchTerm, branch: selectedBranch, status: [...activeStatuses].sort(),
    year: regYear, visitYear
  })

  // ==================== STATE: new/edit patient modal ====================
  const [patientModalOpen, setPatientModalOpen] = useState(false)
  const [editingPatientId, setEditingPatientId] = useState(null)
  const [patientForm, setPatientForm] = useState(EMPTY_PATIENT_FORM)

  // ==================== STATE: patient detail modal / consultation form ====================
  const [currentDetailPatientId, setCurrentDetailPatientId] = useState(null)
  const [consultDate, setConsultDate] = useState(todayIso())
  const [consultWeight, setConsultWeight] = useState('')
  const [consultNotes, setConsultNotes] = useState('')
  const [availedType, setAvailedType] = useState('')
  const [availedItem, setAvailedItem] = useState('')
  const [availedPrice, setAvailedPrice] = useState('')
  const [pendingAvailedItems, setPendingAvailedItems] = useState([])
  const [bloodTest, setBloodTest] = useState({ dataUrl: null, name: '' })
  const [waiver, setWaiver] = useState({ dataUrl: null, name: '' })
  const [consultRemarks, setConsultRemarks] = useState('')
  const [consultFollowUp, setConsultFollowUp] = useState(false)
  const [consultFollowUpNote, setConsultFollowUpNote] = useState('')

  // ==================== STATE: consultation history modal ====================
  const [historyOpen, setHistoryOpen] = useState(false)

  const bloodTestInputRef = useRef(null)
  const waiverInputRef = useRef(null)
  const selectAllRef = useRef(null)
  const followUpNoteFieldRef = useRef(null)
  const deepLinkHandledRef = useRef(false)

  // ==================== DERIVED ====================

  const visiblePatients = patients

  const stats = useMemo(
    () => ({ activeThisMonth: serverStats?.activeThisMonth ?? 0, followUpNeeded: serverStats?.followUpNeeded ?? 0 }),
    [serverStats]
  )

  const availableStatuses = ['Active', 'Follow-up needed']

  const totalPages = serverTotalPages
  const currentPage = Math.min(page, totalPages)
  const pagePatients = patients
  const total_from = totalPatients === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const total_to = Math.min(currentPage * PAGE_SIZE, totalPatients)
  const filtersActive = Boolean(searchTerm) || selectedBranch !== 'All Branches' || activeStatuses.size > 0 || Boolean(regYear) || Boolean(visitYear)

  useEffect(() => { setPage(1) }, [searchTerm, selectedBranch, activeStatuses, regYear, visitYear])

  const visibleIds = useMemo(() => visiblePatients.map(p => p.id), [visiblePatients])
  const selectedVisibleCount = useMemo(
    () => visibleIds.filter(id => selectedPatientIds.has(id)).length,
    [visibleIds, selectedPatientIds]
  )
  const selectAllChecked = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length
  const selectAllIndeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleIds.length

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = selectAllIndeterminate
  }, [selectAllIndeterminate])

  // List rows leave out attached images, so the open patient is fetched in full.
  const { patient: detailFromServer } = usePatient(currentDetailPatientId)
  const currentPatient = useMemo(
    () => detailFromServer || patients.find(p => p.id === currentDetailPatientId) || null,
    [detailFromServer, patients, currentDetailPatientId]
  )

  const availedItemOptions = useMemo(() => {
    if (!availedType) return []
    if (availedType === 'Service') return CLINIC_SERVICES
    return [...new Set(inventoryItems.map(p => p.name).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  }, [availedType, inventoryItems])

  // Suggested price per product name (first inventory row with a unit price).
  const productPrices = useMemo(() => {
    const map = new Map()
    inventoryItems.forEach(p => {
      if (p.name && p.unitPrice != null && p.unitPrice !== '' && !map.has(p.name)) map.set(p.name, p.unitPrice)
    })
    return map
  }, [inventoryItems])

  // ==================== NEW / EDIT PATIENT MODAL ====================

  function openAddModal() {
    setEditingPatientId(null)
    setPatientForm(EMPTY_PATIENT_FORM)
    setPatientModalOpen(true)
  }

  function openEditModal(patient) {
    setEditingPatientId(patient.id)
    setPatientForm({
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
      petMarking: patient.petMarking || '',
      branch: patient.branch || ''
    })
    setPatientModalOpen(true)
  }

  function closePatientModal() {
    setPatientModalOpen(false)
    setPatientForm(EMPTY_PATIENT_FORM)
    setEditingPatientId(null)
  }

  function updatePatientField(field, value) {
    setPatientForm(f => ({ ...f, [field]: value }))
  }

  async function handlePatientSubmit(e) {
    e.preventDefault()
    if (saving) return

    const patientData = {
      ownerName: patientForm.ownerName.trim(),
      ownerSurname: patientForm.ownerSurname.trim(),
      ownerEmail: patientForm.ownerEmail.trim().toLowerCase(),
      ownerAddress: patientForm.ownerAddress.trim(),
      ownerMobile: patientForm.ownerMobile.trim(),
      petName: patientForm.petName.trim(),
      petSpecie: patientForm.petSpecie,
      petBreed: patientForm.petBreed.trim(),
      petSex: patientForm.petSex,
      petDob: patientForm.petDob,
      petAge: patientForm.petAge === '' ? null : Number(patientForm.petAge),
      petMarking: patientForm.petMarking.trim(),
      branch: patientForm.branch
    }

    setSaving(true)
    try {
      if (editingPatientId) {
        await update(editingPatientId, patientData)
        showToast(`"${patientData.petName}" was updated.`)
        closePatientModal()
      } else {
        const newPatient = await create(patientData)
        showToast(`"${patientData.petName}" was added.`)
        closePatientModal()
        // Straight from filling out a new patient's info to logging their first
        // consultation, instead of dropping back to the bare table.
        openPatientDetailModal(newPatient)
      }
    } catch (err) {
      showToast(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  // ==================== SELECTION (SELECT ALL) ====================

  function handleSelectAllChange(e) {
    const checked = e.target.checked
    setSelectedPatientIds(prev => {
      const next = new Set(prev)
      visiblePatients.forEach(p => (checked ? next.add(p.id) : next.delete(p.id)))
      return next
    })
  }

  function handleRowCheckboxChange(id, checked) {
    setSelectedPatientIds(prev => {
      const next = new Set(prev)
      if (checked) next.add(id); else next.delete(id)
      return next
    })
  }

  // ==================== ROW ACTIONS ====================

  async function handleDeletePatient(patient) {
    if (!confirm(`Delete "${patient.petName}"'s record?`)) return
    try {
      await remove(patient.id)
      setSelectedPatientIds(prev => {
        const next = new Set(prev)
        next.delete(patient.id)
        return next
      })
      showToast(`"${patient.petName}" was deleted.`)
    } catch (err) {
      showToast(errorMessage(err))
    }
  }

  // ==================== STATUS FILTER POPOVER ====================

  function toggleStatus(status) {
    setActiveStatuses(prev => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status); else next.add(status)
      return next
    })
  }

  useEffect(() => {
    function handleDocClick() {
      setFilterOpen(false)
    }
    document.addEventListener('click', handleDocClick)
    return () => document.removeEventListener('click', handleDocClick)
  }, [])

  // ==================== PATIENT DETAIL MODAL / CONSULTATION FORM ====================

  function resetConsultationForm() {
    setConsultDate(todayIso())
    setConsultWeight('')
    setConsultNotes('')
    setPendingAvailedItems([])
    setAvailedType('')
    setAvailedItem('')
    setAvailedPrice('')
    setBloodTest({ dataUrl: null, name: '' })
    if (bloodTestInputRef.current) bloodTestInputRef.current.value = ''
    setWaiver({ dataUrl: null, name: '' })
    if (waiverInputRef.current) waiverInputRef.current.value = ''
    setConsultRemarks('')
    setConsultFollowUp(false)
    setConsultFollowUpNote('')
  }

  function openPatientDetailModal(patient) {
    setCurrentDetailPatientId(patient.id)
    resetConsultationForm()
  }

  function closePatientDetailModal() {
    setCurrentDetailPatientId(null)
  }

  function handleDetailEdit() {
    const patient = currentPatient
    closePatientDetailModal()
    if (patient) openEditModal(patient)
  }

  function handleAvailedTypeChange(value) {
    setAvailedType(value)
    setAvailedItem('')
  }

  function handleAvailedAdd() {
    if (!availedType || !availedItem) {
      showToast('Pick a type and an item first.')
      return
    }
    setPendingAvailedItems(prev => [...prev, { type: availedType, name: availedItem, price: Number(availedPrice) || 0 }])
    setAvailedItem('')
    setAvailedPrice('')
  }

  function setAvailedItemAndPrice(name) {
    setAvailedItem(name)
    if (availedType === 'Product' && productPrices.has(name)) setAvailedPrice(String(productPrices.get(name)))
  }

  function handleAvailedRemove(index) {
    setPendingAvailedItems(prev => prev.filter((_, i) => i !== index))
  }

  function handleBloodTestChange(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setBloodTest({ dataUrl: ev.target.result, name: file.name })
    reader.readAsDataURL(file)
  }

  function handleBloodTestRemove() {
    setBloodTest({ dataUrl: null, name: '' })
    if (bloodTestInputRef.current) bloodTestInputRef.current.value = ''
  }

  function handleWaiverChange(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setWaiver({ dataUrl: ev.target.result, name: file.name })
    reader.readAsDataURL(file)
  }

  function handleWaiverRemove() {
    setWaiver({ dataUrl: null, name: '' })
    if (waiverInputRef.current) waiverInputRef.current.value = ''
  }

  function handleFollowUpToggle(checked) {
    setConsultFollowUp(checked)
    if (checked) {
      setTimeout(() => followUpNoteFieldRef.current && followUpNoteFieldRef.current.focus(), 0)
    } else {
      setConsultFollowUpNote('')
    }
  }

  function handleCancelConsult() {
    resetConsultationForm()
    showToast('Consultation entry cleared.')
  }

  async function handleConsultationSubmit(e) {
    e.preventDefault()
    if (saving) return

    const patient = currentPatient
    if (!patient) return

    const followUp = consultFollowUp
    const followUpNote = followUp ? consultFollowUpNote.trim() : ''

    const consultationInput = {
      date: consultDate,
      weight: consultWeight.trim(),
      notes: consultNotes.trim(),
      services: pendingAvailedItems.map(item => `${item.type}: ${item.name} — ${formatPrice(item.price)}`).join(', '),
      availedItems: pendingAvailedItems.slice(),
      totalPrice: pendingAvailedItems.reduce((sum, item) => sum + Number(item.price || 0), 0),
      remarks: consultRemarks.trim(),
      bloodTestImage: bloodTest.dataUrl,
      bloodTestName: bloodTest.name,
      waiverImage: waiver.dataUrl,
      waiverName: waiver.name,
      followUp,
      followUpNote
    }

    setSaving(true)
    try {
      // The server applies the follow-up logic and returns the updated patient.
      const updated = await addConsultation(patient.id, consultationInput)
      const oldIds = new Set((patient.consultations || []).map(c => c.id))
      const created = ((updated && updated.consultations) || []).find(c => !oldIds.has(c.id)) || consultationInput
      closePatientDetailModal()
      showToast('Consultation added successfully.', 'Print', () => printConsultationReceipt(updated || patient, created))
    } catch (err) {
      showToast(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  // ==================== CONSULTATION HISTORY MODAL ====================

  function openHistoryModal() {
    if (currentPatient) setHistoryOpen(true)
  }

  function closeHistoryModal() {
    setHistoryOpen(false)
  }

  async function handleDeleteConsultation(id) {
    if (!currentPatient) return
    if (!confirm('Delete this consultation entry?')) return
    try {
      await removeConsultation(id)
      showToast('Consultation entry deleted.')
    } catch (err) {
      showToast(errorMessage(err))
    }
  }

  // ==================== PRINTING ====================
  // Shown as PatientPrintSheet: the clinic's paper chart, printed from the browser's own print dialog.

  function printConsultationReceipt(patient, consultation) {
    setPrintJob({ patient, consultations: [consultation], single: true })
  }

  // Every consultation on file as one running log, oldest first.
  function printPatientHistory(patient) {
    if (!patient.consultations || patient.consultations.length === 0) {
      showToast('No consultations logged yet for this patient.')
      return
    }
    const sorted = [...patient.consultations].sort((a, b) => (a.date || '').localeCompare(b.date || '') || String(a.id).localeCompare(String(b.id)))
    setPrintJob({ patient, consultations: sorted, single: false })
  }

  // ==================== EFFECTS: escape key / deep link ====================

  useEffect(() => {
    function handleKeydown(e) {
      if (e.key === 'Escape') setFilterOpen(false)
    }
    document.addEventListener('keydown', handleKeydown)
    return () => document.removeEventListener('keydown', handleKeydown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const followUpParamId = searchParams.get('followUp')
  const { patient: deepLinkPatient } = usePatient(followUpParamId)

  // Landing here from a notification bell click on another page
  // (Topbar.jsx) links to /admin/patients?followUp=<id> - jump straight to
  // that patient instead of leaving the admin to find them in the table.
  useEffect(() => {
    if (!followUpParamId || deepLinkHandledRef.current) return
    if (deepLinkPatient) {
      deepLinkHandledRef.current = true
      openPatientDetailModal(deepLinkPatient)
    }
    // The patient loads asynchronously; handle once only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkPatient])

  // ==================== RENDER ====================

  return (
    <main id="main-content" tabIndex={-1} className="content">
      <div className="content-header">
        <h1>Patient records</h1>
        <div className="select-wrapper">
          <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)}>
            <option>All Branches</option>
            <option>Ibaan</option>
            <option>San Jose</option>
          </select>
          <svg className="select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
        </div>
      </div>

      {/* Stat cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <p className="stat-label">Total patients</p>
          <p className={`stat-value${(serverStats?.total ?? 0) === 0 ? ' muted' : ''}`}>{serverStats?.total ?? 0}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Active this month</p>
          <p className={`stat-value${(serverStats?.total ?? 0) === 0 ? ' muted' : ''}`}>{stats.activeThisMonth}</p>
        </div>
        <div className={`stat-card${stats.followUpNeeded > 0 ? ' follow-up-active' : ''}`}>
          <p className="stat-label">Follow-up needed</p>
          <p className={`stat-value${(serverStats?.total ?? 0) === 0 ? ' muted' : ''}`}>{stats.followUpNeeded}</p>
        </div>
      </div>

      {/* Table */}
      <div className="table-card">
        <div className="patients-toolbar">
          <div className="search-wrapper">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input type="text" aria-label="Search patients or owners" autoComplete="off" placeholder="search patient or owner" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          </div>

          <div className="toolbar-actions">
            <button className="new-btn" onClick={openAddModal}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              <span>New</span>
            </button>

            <div className="popover-wrapper">
              <button className="filter-btn" aria-haspopup="true" aria-expanded={filterOpen} onClick={(e) => { e.stopPropagation(); setFilterOpen(v => !v) }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
                <span>Filter</span>
                <svg className="select-chevron-inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
              </button>
              <div className={`popover filter-popover${filterOpen ? ' show' : ''}`} onClick={(e) => e.stopPropagation()}>
                <p className="popover-title">Status</p>
                <div className="filter-options">
                  {availableStatuses.length === 0
                    ? <p className="empty-state">No statuses yet.</p>
                    : availableStatuses.map(status => (
                      <label className="filter-option" key={status}>
                        <input type="checkbox" checked={activeStatuses.has(status)} onChange={() => toggleStatus(status)} />
                        <span>{status}</span>
                      </label>
                    ))}
                </div>
                <p className="popover-title">Registered in</p>
                <select className="filter-year" value={regYear} onChange={(e) => setRegYear(e.target.value)} aria-label="Registered in year">
                  <option value="">Any year</option>
                  {(serverStats?.years || []).map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <p className="popover-title">Visited in</p>
                <select className="filter-year" value={visitYear} onChange={(e) => setVisitYear(e.target.value)} aria-label="Visited in year">
                  <option value="">Any year</option>
                  {(serverStats?.years || []).map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                {(regYear || visitYear) && (
                  <button type="button" className="filter-clear" onClick={() => { setRegYear(''); setVisitYear('') }}>Clear year filters</button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th className="checkbox-col"><input type="checkbox" ref={selectAllRef} checked={selectAllChecked} onChange={handleSelectAllChange} aria-label="Select all patients" /></th>
                <th>Patient</th>
                <th>Owner</th>
                <th>Owner email</th>
                <th>Species</th>
                <th>Branch</th>
                <th>Last visit</th>
                <th>Visits</th>
                <th>Status</th>
                <th className="action-col"></th>
              </tr>
            </thead>
            <tbody>
              {loading && patients.length === 0 ? (
                <tr><td colSpan="10" className="empty-state">Loading patients...</td></tr>
              ) : patients.length === 0 && !filtersActive ? (
                <tr><td colSpan="10" className="empty-state">No patients yet. Click "+ New" to add one.</td></tr>
              ) : patients.length === 0 ? (
                <tr><td colSpan="10" className="empty-state">No patients match your search or filter.</td></tr>
              ) : pagePatients.map(p => (
                <tr className="patient-row" key={p.id} tabIndex={0} onKeyDown={onActivate(() => openPatientDetailModal(p))} onClick={() => openPatientDetailModal(p)}>
                  <td className="checkbox-col" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" className="patient-row-checkbox" checked={selectedPatientIds.has(p.id)} onChange={(e) => handleRowCheckboxChange(p.id, e.target.checked)} aria-label={`Select ${p.petName}`} />
                  </td>
                  <td>{dash(p.petName)}</td>
                  <td>{dash(`${p.ownerName || ''} ${p.ownerSurname || ''}`.trim())}</td>
                  <td>{dash(p.ownerEmail)}</td>
                  <td>{dash(p.petSpecie)}</td>
                  <td>{dash(p.branch)}</td>
                  <td>{formatDate(getLastVisitDate(p))}</td>
                  <td>{getVisitCount(p)}</td>
                  <td><span className={`status-pill ${getStatusClass(p.status)}`}>{p.status}</span></td>
                  <td className="action-col">
                    <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="row-action-btn edit" aria-label="Edit patient" onClick={() => openEditModal(p)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z" /></svg>
                      </button>
                      <button type="button" className="row-action-btn delete" aria-label="Delete patient" onClick={() => handleDeletePatient(p)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="table-footer">
          <p className="table-footer-count">Showing {total_from}-{total_to} of {totalPatients} entries</p>
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
      </div>

      {/* New/Edit patient modal */}
      <Dialog open={!!patientModalOpen} onClose={closePatientModal} label={editingPatientId ? 'Edit patient' : 'New patient'}>
        <div className="modal patient-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>{editingPatientId ? 'Edit patient' : 'New patient'}</h2>
            <button className="modal-close" aria-label="Close" onClick={closePatientModal}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>

          <form className="modal-body" onSubmit={handlePatientSubmit}>
            <div className="patient-form-panel">
              <div className="patient-form-col">
                <div className="patient-form-col-head">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" /><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" /></svg>
                  <h3>Owner Information</h3>
                </div>
                <div className="patient-form-fields">
                  <div className="form-group">
                    <label className="form-label" htmlFor="ownerName">Name <span className="required">*</span></label>
                    <input type="text" id="ownerName" className="form-input" required value={patientForm.ownerName} onChange={(e) => updatePatientField('ownerName', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="ownerSurname">Surname <span className="required">*</span></label>
                    <input type="text" id="ownerSurname" className="form-input" required value={patientForm.ownerSurname} onChange={(e) => updatePatientField('ownerSurname', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="ownerEmail">Email <span className="required">*</span></label>
                    <input type="email" id="ownerEmail" className="form-input" required value={patientForm.ownerEmail} onChange={(e) => updatePatientField('ownerEmail', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="ownerAddress">Address <span className="required">*</span></label>
                    <input type="text" id="ownerAddress" className="form-input" required value={patientForm.ownerAddress} onChange={(e) => updatePatientField('ownerAddress', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="ownerMobile">Mobile No. <span className="required">*</span></label>
                    <input type="tel" id="ownerMobile" className="form-input" required value={patientForm.ownerMobile} onChange={(e) => updatePatientField('ownerMobile', e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="patient-form-col">
                <div className="patient-form-col-head">
                  <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="7" cy="7" r="2.3" /><circle cx="12" cy="4.5" r="2.3" /><circle cx="17" cy="7" r="2.3" /><path d="M12 12c-3.5 0-6.5 2.4-6.5 5.4 0 2 1.7 3.1 3.6 2.4.9-.3 1.9-.5 2.9-.5s2 .2 2.9.5c1.9.7 3.6-.4 3.6-2.4C18.5 14.4 15.5 12 12 12Z" /></svg>
                  <h3>Pet Information</h3>
                </div>
                <div className="patient-form-fields">
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label" htmlFor="petName">Pet Name <span className="required">*</span></label>
                      <input type="text" id="petName" className="form-input" required value={patientForm.petName} onChange={(e) => updatePatientField('petName', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="petSpecie">Species <span className="required">*</span></label>
                      <div className="form-select-wrapper">
                        <select id="petSpecie" className="form-input" required value={patientForm.petSpecie} onChange={(e) => updatePatientField('petSpecie', e.target.value)}>
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
                      <label className="form-label" htmlFor="petBreed">Breed <span className="required">*</span></label>
                      <input type="text" id="petBreed" className="form-input" required value={patientForm.petBreed} onChange={(e) => updatePatientField('petBreed', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="petSex">Sex <span className="required">*</span></label>
                      <div className="form-select-wrapper">
                        <select id="petSex" className="form-input" required value={patientForm.petSex} onChange={(e) => updatePatientField('petSex', e.target.value)}>
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
                      <label className="form-label" htmlFor="petDob">Date of Birth <span className="required">*</span></label>
                      <input type="date" id="petDob" className="form-input" required value={patientForm.petDob} onChange={(e) => updatePatientField('petDob', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="petAge">Age <span className="required">*</span></label>
                      <input type="number" id="petAge" className="form-input" min="0" required value={patientForm.petAge} onChange={(e) => updatePatientField('petAge', e.target.value)} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label" htmlFor="petMarking">Color &amp; Marking <span className="required">*</span></label>
                      <input type="text" id="petMarking" className="form-input" required value={patientForm.petMarking} onChange={(e) => updatePatientField('petMarking', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="patientBranch">Branch <span className="required">*</span></label>
                      <div className="form-select-wrapper">
                        <select id="patientBranch" className="form-input" required value={patientForm.branch} onChange={(e) => updatePatientField('branch', e.target.value)}>
                          <option value="" disabled hidden></option>
                          <option>Ibaan</option>
                          <option>San Jose</option>
                        </select>
                        <svg className="form-select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="patient-form-actions">
              <button type="button" className="patient-cancel-btn" onClick={closePatientModal}>Cancel</button>
              <button type="submit" className="patient-save-btn" disabled={saving}>{editingPatientId ? 'Save changes' : 'Save'}</button>
            </div>
          </form>
        </div>
      </Dialog>

      {/* Patient detail modal */}
      <Dialog open={!!currentPatient} onClose={closePatientDetailModal} label="Patient details">
        {currentPatient && (
          <div className="modal patient-detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>{currentPatient.petName}</h2>
                <p className="detail-owner-sub">{currentPatient.ownerName} {currentPatient.ownerSurname}</p>
              </div>
              <button className="modal-close" aria-label="Close" onClick={closePatientDetailModal}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>

            <div className="modal-body detail-modal-body">
              <div className="detail-info-grid">
                <div className="detail-info-group">
                  <p className="detail-info-label">Owner</p>
                  <p className="detail-info-value">{currentPatient.ownerName} {currentPatient.ownerSurname}</p>
                  <p className="detail-info-sub">{dash(currentPatient.ownerEmail)}</p>
                  <p className="detail-info-sub">{dash(currentPatient.ownerMobile)}</p>
                  <p className="detail-info-sub">{dash(currentPatient.ownerAddress)}</p>
                </div>
                <div className="detail-info-group">
                  <p className="detail-info-label">Pet</p>
                  <p className="detail-info-value">{dash(currentPatient.petSpecie)} — {dash(currentPatient.petBreed)}</p>
                  <p className="detail-info-sub">{dash(currentPatient.petSex)}, {currentPatient.petAge === '' || currentPatient.petAge == null ? '—' : `${currentPatient.petAge} yr(s) old`}</p>
                  <p className="detail-info-sub">{dash(currentPatient.petMarking)}</p>
                  <p className="detail-info-sub">{currentPatient.branch}</p>
                </div>
                <div className="detail-info-group">
                  <p className="detail-info-label">Status</p>
                  <span className={`status-pill ${getStatusClass(currentPatient.status)}`}>{currentPatient.status}</span>
                  {currentPatient.status === 'Follow-up needed' && currentPatient.followUpNote && (
                    <p className="detail-info-sub follow-up-note">Follow-up for: {currentPatient.followUpNote}</p>
                  )}
                  <p className="detail-info-sub">{getVisitCount(currentPatient)} visit(s)</p>
                  <p className="detail-info-sub">Last visit: {formatDate(getLastVisitDate(currentPatient))}</p>
                </div>
                <button type="button" className="detail-edit-btn" onClick={handleDetailEdit}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z" /></svg>
                  <span>Edit info</span>
                </button>
              </div>

              <div className="detail-actions-row">
                <h3 className="detail-history-title">New consultation</h3>
                <div className="detail-actions-buttons">
                  <button type="button" className="detail-history-btn" onClick={openHistoryModal}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>
                    <span>History</span>
                  </button>
                </div>
              </div>

              <form className="consultation-form" onSubmit={handleConsultationSubmit}>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label" htmlFor="consultDate">Date <span className="required">*</span></label>
                    <input type="date" id="consultDate" className="form-input" required value={consultDate} onChange={(e) => setConsultDate(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="consultWeight">Weight</label>
                    <input type="text" id="consultWeight" className="form-input" placeholder="e.g. 6-8 kg" value={consultWeight} onChange={(e) => setConsultWeight(e.target.value)} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="consultNotes">Treatment / findings <span className="required">*</span></label>
                  <textarea id="consultNotes" className="form-input" rows="3" placeholder="Diagnosis, prescription, dosage…\" required value={consultNotes} onChange={(e) => setConsultNotes(e.target.value)}></textarea>
                </div>
                <div className="form-group">
                  <label className="form-label">Services / products</label>
                  <div className="availed-picker">
                    <div className="form-row availed-picker-row">
                      <div className="form-group">
                        <label className="form-label" htmlFor="availedType">Type</label>
                        <div className="form-select-wrapper">
                          <select id="availedType" className="form-input" value={availedType} onChange={(e) => handleAvailedTypeChange(e.target.value)}>
                            <option value="" disabled hidden>Select type</option>
                            <option value="Service">Service</option>
                            <option value="Product">Product</option>
                          </select>
                          <svg className="form-select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                        </div>
                      </div>
                      <div className="form-group">
                        <label className="form-label" htmlFor="availedItem">Item</label>
                        <div className="form-select-wrapper">
                          <select id="availedItem" className="form-input" disabled={!availedType || availedItemOptions.length === 0} value={availedItem} onChange={(e) => setAvailedItemAndPrice(e.target.value)}>
                            <option value="" disabled hidden>
                              {!availedType ? 'Select type first' : (availedItemOptions.length === 0 ? 'No products in inventory yet' : 'Select item')}
                            </option>
                            {availedItemOptions.map(name => <option key={name} value={name}>{name}</option>)}
                          </select>
                          <svg className="form-select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                        </div>
                      </div>
                      <div className="form-group">
                        <label className="form-label" htmlFor="availedPrice">Price (₱)</label>
                        <input type="number" id="availedPrice" className="form-input" min="0" step="0.01" placeholder="0.00" value={availedPrice} onChange={(e) => setAvailedPrice(e.target.value)} />
                      </div>
                    </div>
                    <button type="button" className="availed-add-btn" onClick={handleAvailedAdd}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                      <span>Add to list</span>
                    </button>
                    <div className="availed-chip-list">
                      {pendingAvailedItems.map((item, index) => (
                        <span className={`availed-chip type-${item.type.toLowerCase()}`} key={index}>
                          {item.type}: {item.name} — {formatPrice(item.price)}
                          <button type="button" className="availed-chip-remove" aria-label={`Remove ${item.name}`} onClick={() => handleAvailedRemove(index)}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                          </button>
                        </span>
                      ))}
                      {pendingAvailedItems.length > 0 && (
                        <span className="availed-total">Total: {formatPrice(pendingAvailedItems.reduce((sum, item) => sum + Number(item.price || 0), 0))}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Blood test result</label>
                  <div className="file-upload-row">
                    <label className="file-upload-btn" htmlFor="bloodTestInput">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                      <span>Upload image</span>
                    </label>
                    <input type="file" id="bloodTestInput" accept="image/*" hidden ref={bloodTestInputRef} onChange={handleBloodTestChange} />
                    {bloodTest.dataUrl && (
                      <div className="file-upload-preview">
                        <svg className="file-upload-preview-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                        <span className="file-upload-name">{bloodTest.name}</span>
                        <button type="button" className="file-upload-remove" aria-label="Remove blood test result" onClick={handleBloodTestRemove}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Signed waiver</label>
                  <div className="file-upload-row">
                    <label className="file-upload-btn" htmlFor="waiverInput">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                      <span>Upload waiver</span>
                    </label>
                    <input type="file" id="waiverInput" accept="image/*,.pdf" hidden ref={waiverInputRef} onChange={handleWaiverChange} />
                    {waiver.dataUrl && (
                      <div className="file-upload-preview">
                        <svg className="file-upload-preview-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                        <span className="file-upload-name">{waiver.name}</span>
                        <button type="button" className="file-upload-remove" aria-label="Remove waiver" onClick={handleWaiverRemove}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="consultRemarks">Remarks</label>
                  <input type="text" id="consultRemarks" className="form-input" placeholder="e.g. Follow-up on 9/15" value={consultRemarks} onChange={(e) => setConsultRemarks(e.target.value)} />
                </div>
                <div className="follow-up-block">
                  <label className="follow-up-check">
                    <input type="checkbox" checked={consultFollowUp} onChange={(e) => handleFollowUpToggle(e.target.checked)} />
                    <span>This patient needs a follow-up visit</span>
                  </label>
                  {consultFollowUp && (
                    <div className="form-group">
                      <label className="form-label" htmlFor="consultFollowUpNote">What needs a follow-up? <span className="required">*</span></label>
                      <div className="form-select-wrapper">
                        <select id="consultFollowUpNote" className="form-input" ref={followUpNoteFieldRef} required value={consultFollowUpNote} onChange={(e) => setConsultFollowUpNote(e.target.value)}>
                          <option value="" disabled hidden>Select service</option>
                          {CLINIC_SERVICES.map(name => <option key={name} value={name}>{name}</option>)}
                        </select>
                        <svg className="form-select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                      </div>
                    </div>
                  )}
                </div>
                <div className="consultation-form-actions">
                  <button type="button" className="patient-cancel-btn" onClick={handleCancelConsult}>Cancel</button>
                  <button type="submit" className="patient-save-btn" disabled={saving}>Save consultation</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </Dialog>

      {/* Consultation history modal */}
      <Dialog open={!!(historyOpen && currentPatient)} onClose={closeHistoryModal} label="Consultation history">
        {historyOpen && currentPatient && (
          <div className="modal patient-history-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>Consultation history</h2>
                <p className="detail-owner-sub">{currentPatient.petName} — {currentPatient.ownerName} {currentPatient.ownerSurname}</p>
              </div>
              <div className="history-header-actions">
                <button type="button" className="detail-history-btn" onClick={() => printPatientHistory(currentPatient)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
                  <span>Print all</span>
                </button>
                <button className="modal-close" aria-label="Close" onClick={closeHistoryModal}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
            </div>
            <div className="modal-body">
              <div className="consultation-history">
                {(currentPatient.consultations || []).length === 0 ? (
                  <p className="empty-state">No consultations logged yet.</p>
                ) : (
                  [...(currentPatient.consultations || [])]
                    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || String(b.id).localeCompare(String(a.id)))
                    .map(c => (
                      <div className="consultation-item" key={c.id}>
                        <div className="consultation-item-head">
                          <span>
                            <span className="consultation-date">{formatDate(c.date)}</span>
                            {c.weight && <span className="consultation-weight">{c.weight}</span>}
                          </span>
                          <div className="consultation-item-actions">
                            <button type="button" className="consultation-print-btn" aria-label="Print this consultation" onClick={() => printConsultationReceipt(currentPatient, c)}>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
                            </button>
                            <button type="button" className="consultation-delete-btn" aria-label="Delete consultation" onClick={() => handleDeleteConsultation(c.id)}>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
                            </button>
                          </div>
                        </div>
                        <p className="consultation-field">{c.notes}</p>
                        {c.services && <p className="consultation-field"><span className="consultation-field-label">Availed:</span> {c.services}</p>}
                        {c.totalPrice ? <p className="consultation-total">Total: {formatPrice(c.totalPrice)}</p> : null}
                        {c.remarks && <p className="consultation-remarks">{c.remarks}</p>}
                        {c.bloodTestImage && (
                          <div className="consultation-attachment">
                            <img src={c.bloodTestImage} alt="Blood test result" />
                            <a href={c.bloodTestImage} download={c.bloodTestName || 'blood-test-result'}>View full blood test result</a>
                          </div>
                        )}
                        {c.waiverImage && (
                          <div className="consultation-attachment">
                            {isImageDataUrl(c.waiverImage) && <img src={c.waiverImage} alt="Signed waiver" />}
                            <a href={c.waiverImage} download={c.waiverName || 'signed-waiver'}>View signed waiver</a>
                          </div>
                        )}
                        {c.followUp && <span className="follow-up-pill">Follow-up needed{c.followUpNote ? `: ${c.followUpNote}` : ''}</span>}
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>
        )}
      </Dialog>

      {printJob && <PatientPrintSheet job={printJob} onClose={() => setPrintJob(null)} />}
    </main>
  )
}
