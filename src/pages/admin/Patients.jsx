import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { usePatient, usePatients } from '../../hooks/usePatients'
import PatientPrintSheet from './PatientPrintSheet'
import { PrescriptionFields, newPrescription } from './Prescription'
import { useDebounced } from '../../hooks/useDebounced'
import { getLastVisitDate } from '../../utils/visits'
import { useServiceCatalog } from '../../hooks/useInventory'
import AvailedItemsPicker, { toPayload } from '../../components/shared/AvailedItemsPicker'
import { useToast } from '../../components/shared/Toast'
import { errorMessage } from '../../api/client'
import '../../styles/admin/patients.css'
import { formatDate, todayIso, formatPrice, dash, getStatusClass, isImageDataUrl } from '../../utils/format'

import Dialog from '../../components/shared/Dialog'
import Pagination from '../../components/shared/Pagination'
import { onActivate } from '../../utils/a11y'
import { useConfirm } from '../../components/shared/ConfirmDialog'
import WeightInput, { withKg } from '../../components/shared/WeightInput'
// ==================== CONSTANTS ====================
const PAGE_SIZE = 50

const EMPTY_PATIENT_FORM = {
  ownerName: '', ownerSurname: '', ownerEmail: '', ownerAddress: '', ownerMobile: '',
  petName: '', petSpecie: '', petBreed: '', petSex: '', petDob: '', petAge: '', petMarking: '',
  branch: ''
}

// ==================== HELPERS (pure, module-level) ====================

const MAX_ATTACHMENTS = 10 // per list; the server's limit too

const readAsDataUrl = (blob) => new Promise((resolve) => {
  const reader = new FileReader()
  reader.onload = (ev) => resolve(ev.target.result)
  reader.readAsDataURL(blob)
})

// Phone photos (3-5 MB, ~4000 px) are shrunk before upload: at most 2000 px on the long side, JPEG at 85% quality,
// which keeps lab printouts and signatures sharp on screen and on A4 paper at a tenth of the size. PDFs, and pictures
// already smaller than the result, are kept as they are.
const MAX_SIDE = 2000
async function readFile(file) {
  const original = await readAsDataUrl(file)
  if (!file.type.startsWith('image/')) return { name: file.name, dataUrl: original }
  try {
    const img = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff' // transparent areas would turn black in a JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const small = canvas.toDataURL('image/jpeg', 0.85)
    return { name: file.name, dataUrl: small.length < original.length ? small : original }
  } catch {
    return { name: file.name, dataUrl: original } // a format the browser cannot draw: upload it unchanged
  }
}

// Several files per visit (laboratory results, signed waivers): pick many at once or add more later, remove any one.
function UploadList({ id, label, accept, noun, items, onChange, onTooMany }) {
  async function add(e) {
    const files = [...e.target.files]
    e.target.value = '' // so the same file can be picked again after removing it
    const room = MAX_ATTACHMENTS - items.length
    if (files.length > room) onTooMany(`Up to ${MAX_ATTACHMENTS} ${noun} per consultation.`)
    onChange([...items, ...(await Promise.all(files.slice(0, Math.max(0, room)).map(readFile)))])
  }
  return (
    <div className="form-group">
      <label className="form-label" htmlFor={id}>{label}</label>
      <div className="file-upload-row">
        <label className="file-upload-btn" htmlFor={id}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
          <span>{items.length ? 'Add more' : 'Upload files'}</span>
        </label>
        <input type="file" id={id} accept={accept} multiple hidden onChange={add} />
        {items.length > 0 && <span className="file-upload-count">{items.length} of {MAX_ATTACHMENTS}</span>}
      </div>
      {items.map((file, i) => (
        <div className="file-upload-preview" key={i}>
          <svg className="file-upload-preview-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
          <span className="file-upload-name">{file.name}</span>
          <button type="button" className="file-upload-remove" aria-label={`Remove ${file.name}`} onClick={() => onChange(items.filter((_, j) => j !== i))}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      ))}
    </div>
  )
}

// A saved visit's files, each with its picture (PDFs as a link only).
function AttachmentLinks({ files, what }) {
  return (files || []).map((file, i) => (
    <div className="consultation-attachment" key={i}>
      {isImageDataUrl(file.image) && <img src={file.image} alt={`${what} ${i + 1}`} />}
      <a href={file.image} download={file.name || `${what.toLowerCase().replace(/ /g, '-')}-${i + 1}`}>
        View {what.toLowerCase()}{files.length > 1 ? ` ${i + 1} of ${files.length}` : ''}
      </a>
    </div>
  ))
}

// Visit count / last visit are derived from consultation history rather than
// stored separately, so they can never drift out of sync with it.
function getVisitCount(patient) {
  return patient.consultations ? patient.consultations.length : 0
}

export default function Patients() {
  const [ask, confirmBox] = useConfirm() // styled "are you sure?" box for deletes
  const { data: serviceCatalog } = useServiceCatalog()
  const showToast = useToast()
  const [saving, setSaving] = useState(false)
  const [page, setPage] = useState(1)
  const [searchParams] = useSearchParams()

  // ==================== STATE: search / filter ====================
  const [searchInput, setSearchInput] = useState('')
  const [selectedBranch, setSelectedBranch] = useState('All Branches')
  const [activeStatuses, setActiveStatuses] = useState(() => new Set())
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
  const [pendingAvailedItems, setPendingAvailedItems] = useState([])
  const [pickerKey, setPickerKey] = useState(0)
  const [labResults, setLabResults] = useState([]) // [{ name, dataUrl }]: several pictures per visit
  const [prescription, setPrescription] = useState(null) // the Rx form's fields while it is open
  const [waivers, setWaivers] = useState([]) // [{ name, dataUrl }]
  const [consultRemarks, setConsultRemarks] = useState('')
  const [consultFollowUp, setConsultFollowUp] = useState(false)
  const [consultFollowUpNote, setConsultFollowUpNote] = useState('')

  // ==================== STATE: consultation history modal ====================
  const [historyOpen, setHistoryOpen] = useState(false)

  const followUpNoteFieldRef = useRef(null)
  const deepLinkHandledRef = useRef(false)

  // ==================== DERIVED ====================

  const stats = useMemo(
    () => ({ activeThisMonth: serverStats?.activeThisMonth ?? 0, followUpNeeded: serverStats?.followUpNeeded ?? 0 }),
    [serverStats]
  )

  const availableStatuses = ['Active', 'Follow-up needed']

  const totalPages = serverTotalPages
  const currentPage = Math.min(page, totalPages)
  const pagePatients = patients
  const filtersActive = Boolean(searchTerm) || selectedBranch !== 'All Branches' || activeStatuses.size > 0 || Boolean(regYear) || Boolean(visitYear)

  useEffect(() => { setPage(1) }, [searchTerm, selectedBranch, activeStatuses, regYear, visitYear])

  // List rows leave out attached images, so the open patient is fetched in full.
  const { patient: detailFromServer } = usePatient(currentDetailPatientId)
  const currentPatient = useMemo(
    () => detailFromServer || patients.find(p => p.id === currentDetailPatientId) || null,
    [detailFromServer, patients, currentDetailPatientId]
  )


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

  // ==================== ROW ACTIONS ====================

  async function handleDeletePatient(patient) {
    if (!(await ask({ title: 'Delete this patient record?', message: <p><strong>{patient.petName}</strong>'s record will be deleted.</p> }))) return
    try {
      await remove(patient.id)
      showToast(`"${patient.petName}" was deleted.`)
    } catch (err) {
      showToast(errorMessage(err))
    }
  }

  // ==================== STATUS FILTER POPOVER ====================

  const followUpOnly = activeStatuses.size === 1 && activeStatuses.has('Follow-up needed')

  function clearFilters() {
    setSearchInput('')
    setSelectedBranch('All Branches')
    setActiveStatuses(new Set())
    setRegYear('')
    setVisitYear('')
  }

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
    setPickerKey((k) => k + 1) // a fresh item picker: its half-chosen type, item and price go too
    setConsultDate(todayIso())
    setConsultWeight('')
    setConsultNotes('')
    setPendingAvailedItems([])
    setLabResults([])
    setPrescription(null)
    setWaivers([])
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
      weight: withKg(consultWeight),
      notes: consultNotes.trim(),
      availedItems: toPayload(pendingAvailedItems),
      remarks: consultRemarks.trim(),
      labResults: labResults.map(({ name, dataUrl }) => ({ name, image: dataUrl })),
      waivers: waivers.map(({ name, dataUrl }) => ({ name, image: dataUrl })),
      followUp,
      followUpNote,
      prescription: prescription && { ...prescription, nextAppointment: prescription.nextAppointment || null }
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
    if (!(await ask({ title: 'Delete this consultation?', message: 'Its billed services and products are taken off the sales records, and the products go back on the shelf.' }))) return
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

  function printPrescription(patient, consultation) {
    setPrintJob({ patient, consultations: [consultation], rx: true })
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
        <button type="button" className="stat-card stat-card-btn" disabled={!filtersActive} onClick={clearFilters}>
          <span className="stat-label">Total patients</span>
          <span className={`stat-value${(serverStats?.total ?? 0) === 0 ? ' muted' : ''}`}>{serverStats?.total ?? 0}</span>
          {filtersActive && <span className="stat-sub">Click to clear the filters</span>}
        </button>
        <div className="stat-card">
          <p className="stat-label">Active this month</p>
          <p className={`stat-value${(serverStats?.total ?? 0) === 0 ? ' muted' : ''}`}>{stats.activeThisMonth}</p>
        </div>
        <button type="button" className={`stat-card stat-card-btn${stats.followUpNeeded > 0 ? ' follow-up-active' : ''}${followUpOnly ? ' selected' : ''}`}
          aria-pressed={followUpOnly} onClick={() => setActiveStatuses(followUpOnly ? new Set() : new Set(['Follow-up needed']))}>
          <span className="stat-label">Follow-up needed</span>
          <span className={`stat-value${(serverStats?.total ?? 0) === 0 ? ' muted' : ''}`}>{stats.followUpNeeded}</span>
          <span className="stat-sub">{followUpOnly ? 'Showing only these. Click to show all' : 'Click to show only these'}</span>
        </button>
      </div>

      {/* Table */}
      <div className="table-card">
        <div className="patients-toolbar">
          <div className="search-wrapper">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input type="text" aria-label="Search patients or owners" autoComplete="off" placeholder="Search patient or owner" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          </div>

          <div className="toolbar-actions">
            <button className="new-btn" onClick={openAddModal}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              <span>New patient</span>
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
                <th>Patient</th>
                <th>Owner</th>
                <th>Owner phone</th>
                <th>Species</th>
                <th>Branch</th>
                <th>Last visit</th>
                <th>Visits</th>
                <th className="action-col"></th>
              </tr>
            </thead>
            <tbody>
              {loading && patients.length === 0 ? (
                <tr><td colSpan="8" className="empty-state">Loading patients...</td></tr>
              ) : patients.length === 0 && !filtersActive ? (
                <tr><td colSpan="8" className="empty-state">No patients yet. Click "New patient" to add one.</td></tr>
              ) : patients.length === 0 ? (
                <tr><td colSpan="8" className="empty-state">No patients match your search or filter.</td></tr>
              ) : pagePatients.map(p => (
                <tr className="patient-row" key={p.id} tabIndex={0} onKeyDown={onActivate(() => openPatientDetailModal(p))} onClick={() => openPatientDetailModal(p)}>
                  <td>
                    {dash(p.petName)}
                    {/* Nearly every pet is Active, so only a status worth noticing gets a pill. */}
                    {p.status && p.status !== 'Active' && <span className={`status-pill ${getStatusClass(p.status)}`}>{p.status}</span>}
                  </td>
                  <td>{dash(`${p.ownerName || ''} ${p.ownerSurname || ''}`.trim())}</td>
                  <td>{dash(p.ownerMobile)}</td>
                  <td>{dash(p.petSpecie)}</td>
                  <td>{dash(p.branch)}</td>
                  <td>{formatDate(getLastVisitDate(p))}</td>
                  <td>{getVisitCount(p)}</td>
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

        <Pagination page={currentPage} pageSize={PAGE_SIZE} total={totalPatients} onPage={setPage} />
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
                  <h3>Owner information</h3>
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
                    <label className="form-label" htmlFor="ownerEmail">Email <span className="optional">(optional)</span></label>
                    <input type="email" id="ownerEmail" className="form-input" value={patientForm.ownerEmail} onChange={(e) => updatePatientField('ownerEmail', e.target.value)} />
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
                  <h3>Pet information</h3>
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
              {/* In the header, next to close, so it never sits on top of the pet's details. */}
              <div className="modal-header-actions">
                <button type="button" className="detail-edit-btn" onClick={handleDetailEdit}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z" /></svg>
                  <span>Edit info</span>
                </button>
                <button className="modal-close" aria-label="Close" onClick={closePatientDetailModal}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
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
                    <WeightInput id="consultWeight" value={consultWeight} onChange={setConsultWeight} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="consultNotes">Treatment / findings <span className="required">*</span></label>
                  <textarea id="consultNotes" className="form-input" rows="3" placeholder="Findings and treatment given…" required value={consultNotes} onChange={(e) => setConsultNotes(e.target.value)}></textarea>
                </div>
                <div className="form-group">
                  <label className="form-label">Services / products</label>
                  <AvailedItemsPicker key={pickerKey} branch={currentPatient.branch} weight={consultWeight} items={pendingAvailedItems} onChange={setPendingAvailedItems} />
                </div>
                <div className="form-group">
                  <label className="form-label">Prescription</label>
                  {prescription
                    ? <PrescriptionFields value={prescription} onChange={setPrescription} onRemove={() => setPrescription(null)} />
                    : (
                      <div className="file-upload-row">
                        <button type="button" className="file-upload-btn" onClick={() => setPrescription(newPrescription())}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" /><path d="m8.5 8.5 7 7" /></svg>
                          <span>Write prescription</span>
                        </button>
                      </div>
                    )}
                </div>
                <UploadList id="labResultsInput" label="Laboratory Test Results" accept="image/*" noun="laboratory pictures"
                  items={labResults} onChange={setLabResults} onTooMany={showToast} />
                <UploadList id="waiversInput" label="Signed waiver" accept="image/*,.pdf" noun="waivers"
                  items={waivers} onChange={setWaivers} onTooMany={showToast} />
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
                          {(serviceCatalog || []).map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
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
                            {c.prescription && (
                              <button type="button" className="consultation-print-btn rx" aria-label="Print prescription" title="Print prescription" onClick={() => printPrescription(currentPatient, c)}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" /><path d="m8.5 8.5 7 7" /></svg>
                              </button>
                            )}
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
                        {c.prescription && (
                          <div className="consultation-rx">
                            <p className="consultation-field-label">Prescription{c.diagnosis ? ` · ${c.diagnosis}` : ''}</p>
                            <p className="consultation-rx-text">{c.prescription.rx}</p>
                          </div>
                        )}
                        <AttachmentLinks files={c.labResults} what="Laboratory result" />
                        <AttachmentLinks files={c.waivers} what="Signed waiver" />
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
      {confirmBox}
    </main>
  )
}
