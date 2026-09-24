import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { usePatients } from '../../hooks/usePatients'
import { useInventory } from '../../hooks/useInventory'
import { useToast } from '../../components/shared/Toast'
import '../../styles/admin/patients.css'

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

const EMPTY_PATIENT_FORM = {
  ownerName: '', ownerSurname: '', ownerEmail: '', ownerAddress: '', ownerMobile: '',
  petName: '', petSpecie: '', petBreed: '', petSex: '', petDob: '', petAge: '', petMarking: '',
  branch: ''
}

// ==================== HELPERS (pure, module-level) ====================

function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

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

function formatPrice(amount) {
  return `₱${Number(amount || 0).toFixed(2)}`
}

// Visit count / last visit are derived from consultation history rather than
// stored separately, so they can never drift out of sync with it.
function getVisitCount(patient) {
  return 1 + patient.consultations.length
}

function getLastVisitDate(patient) {
  if (patient.consultations.length === 0) return patient.createdAt
  return patient.consultations.reduce((latest, c) => (c.date > latest ? c.date : latest), patient.consultations[0].date)
}

function isImageDataUrl(url) {
  return typeof url === 'string' && url.startsWith('data:image/')
}

function getStatusClass(status) {
  switch (status) {
    case 'Active': return 'status-ok'
    case 'Follow-up needed': return 'status-follow-up'
    default: return 'status-inactive'
  }
}

// ==================== PRINTING (pure HTML string builders) ====================
// These generate a full standalone HTML document string for a window.open()
// popup - not JSX - ported essentially as-is from patients.js.

const CLINIC_PRINT_STYLES = `
    body { font-family: Arial, Helvetica, sans-serif; color: #111; padding: 28px 34px; max-width: 720px; margin: 0 auto; }
    .letterhead { display: flex; align-items: center; justify-content: center; gap: 14px; border-bottom: 3px solid #111; padding-bottom: 10px; margin-bottom: 4px; }
    .letterhead img { width: 52px; height: 52px; object-fit: contain; }
    .letterhead h1 { font-size: 26px; letter-spacing: 0.02em; margin: 0; }
    .branch-address { font-size: 12px; text-align: center; margin: 4px 0 18px; }
    .info-block { display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px; }
    .info-row { display: flex; gap: 22px; flex-wrap: wrap; }
    .info-field { display: flex; align-items: baseline; gap: 6px; flex: 1; min-width: 140px; }
    .info-field .field-label { font-weight: 700; font-size: 12.5px; white-space: nowrap; }
    .info-field .field-value { flex: 1; border-bottom: 1px solid #111; font-size: 12.5px; padding-bottom: 1px; min-height: 14px; }
    table.log { width: 100%; border-collapse: collapse; border: 1.5px solid #111; }
    table.log th { border: 1px solid #111; padding: 6px 8px; font-size: 12.5px; background: #f2f2f2; }
    table.log td { border: 1px solid #111; padding: 8px; font-size: 12px; vertical-align: top; }
    table.log td:first-child { width: 90px; white-space: nowrap; }
    table.log td:last-child { width: 150px; }
    table.log tfoot td { font-weight: 700; background: #f7f7f7; }
    .attachment-label { font-weight: 700; font-size: 12px; margin: 14px 0 4px; }
    .attachment-img { max-width: 100%; max-height: 320px; border: 1px solid #ccc; border-radius: 6px; }
    .footer { margin-top: 20px; font-size: 10.5px; color: #888; text-align: center; }
`

// Older consultations (saved before per-item pricing was added) only have the
// flattened "services" string - fall back to splitting that instead of the
// structured availedItems array so old receipts still print correctly.
function buildConsultationCells(consultation) {
  const hasPricedItems = Boolean(consultation.availedItems && consultation.availedItems.length)
  const rxLines = hasPricedItems
    ? consultation.availedItems.map(item => `* ${escapeHtml(item.name)} — ${formatPrice(item.price)}`)
    : (consultation.services || '').split(',').map(s => s.trim()).filter(Boolean).map(text => `* ${escapeHtml(text)}`)

  const total = hasPricedItems
    ? consultation.totalPrice || consultation.availedItems.reduce((sum, i) => sum + Number(i.price || 0), 0)
    : 0

  const treatmentHtml = [
    consultation.weight ? escapeHtml(`Wt: ${consultation.weight}`) : '',
    consultation.notes ? escapeHtml(consultation.notes) : '',
    rxLines.length ? '<strong>Rx</strong>' : '',
    ...rxLines,
    total ? `<strong>Total: ${formatPrice(total)}</strong>` : ''
  ].filter(Boolean).join('<br>') || '&nbsp;'

  const remarksHtml = [
    consultation.remarks || '',
    consultation.followUp ? `Follow-up needed: ${consultation.followUpNote || '—'}` : '',
    consultation.bloodTestImage ? 'Blood test result attached' : '',
    consultation.waiverImage ? 'Signed waiver attached' : ''
  ].filter(Boolean).map(escapeHtml).join('<br>') || '&nbsp;'

  return { treatmentHtml, remarksHtml, total }
}

function consultationAttachmentsHtml(consultation) {
  return [
    consultation.bloodTestImage ? `
            <p class="attachment-label">Blood test result — ${formatDate(consultation.date)}</p>
            <img class="attachment-img" src="${consultation.bloodTestImage}" alt="Blood test result">
        ` : '',
    consultation.waiverImage ? `
            <p class="attachment-label">Signed waiver — ${formatDate(consultation.date)}</p>
            ${isImageDataUrl(consultation.waiverImage)
        ? `<img class="attachment-img" src="${consultation.waiverImage}" alt="Signed waiver">`
        : `<p style="font-size:12px;color:#666;">(waiver on file - not an image, open from the app to view)</p>`}
        ` : ''
  ].filter(Boolean).join('')
}

// Logo path adapted for the React app: images now live in public/Images/, so
// this is a root-relative path instead of the original's
// new URL('Images/EcovetLogo%201.png', document.baseURI).
function clinicLetterheadHtml(patient) {
  const logoUrl = '/Images/EcovetLogo%201.png'
  const branchAddress = patient.branch === 'Ibaan'
    ? '454 Balagtas St., Poblacion, Ibaan, Batangas'
    : `${escapeHtml(patient.branch)} Branch`

  return `
        <div class="letterhead">
            <img src="${logoUrl}" alt="Ecovet logo">
            <h1>ECOVET ANIMAL CLINIC</h1>
        </div>
        <p class="branch-address">${branchAddress}</p>

        <div class="info-block">
            <div class="info-row">
                <div class="info-field"><span class="field-label">Client's Name:</span><span class="field-value">${escapeHtml(patient.ownerName)} ${escapeHtml(patient.ownerSurname)}</span></div>
                <div class="info-field"><span class="field-label">Pet's Name:</span><span class="field-value">${escapeHtml(patient.petName)}</span></div>
                <div class="info-field"><span class="field-label">Mobile #:</span><span class="field-value">${escapeHtml(patient.ownerMobile)}</span></div>
            </div>
            <div class="info-row">
                <div class="info-field" style="flex: 2;"><span class="field-label">Address:</span><span class="field-value">${escapeHtml(patient.ownerAddress)}</span></div>
                <div class="info-field"><span class="field-label">Specie:</span><span class="field-value">${escapeHtml(patient.petSpecie)}</span></div>
                <div class="info-field"><span class="field-label">Breed:</span><span class="field-value">${escapeHtml(patient.petBreed)}</span></div>
            </div>
            <div class="info-row">
                <div class="info-field"><span class="field-label">Pet's Date of birth:</span><span class="field-value">${formatDate(patient.petDob)}</span></div>
                <div class="info-field"><span class="field-label">Age:</span><span class="field-value">${escapeHtml(String(patient.petAge))}</span></div>
                <div class="info-field"><span class="field-label">Sex:</span><span class="field-value">${escapeHtml(patient.petSex)}</span></div>
                <div class="info-field"><span class="field-label">Color Marking:</span><span class="field-value">${escapeHtml(patient.petMarking)}</span></div>
            </div>
        </div>
    `
}

function writeAndPrint(printWindow, title, bodyHtml) {
  printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>${escapeHtml(title)}</title>
            <style>${CLINIC_PRINT_STYLES}</style>
        </head>
        <body>${bodyHtml}</body>
        </html>
    `)
  printWindow.document.close()

  // Printing immediately after document.close() can fire before the
  // letterhead logo image has actually loaded, so it shows up blank - wait
  // for the window to finish loading everything first.
  let printed = false
  const doPrint = () => {
    if (printed) return
    printed = true
    printWindow.focus()
    printWindow.print()
  }

  if (printWindow.document.readyState === 'complete') {
    doPrint()
  } else {
    printWindow.addEventListener('load', doPrint)
    // Fallback in case 'load' never fires for some reason.
    setTimeout(doPrint, 1000)
  }
}

export default function Patients() {
  const [patients, setPatients] = usePatients()
  const [products] = useInventory()
  const showToast = useToast()
  const [searchParams] = useSearchParams()

  // ==================== STATE: search / filter / selection ====================
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedBranch, setSelectedBranch] = useState('All Branches')
  const [activeStatuses, setActiveStatuses] = useState(() => new Set())
  const [selectedPatientIds, setSelectedPatientIds] = useState(() => new Set())
  const [filterOpen, setFilterOpen] = useState(false)

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

  // Monotonic id counters, computed once from whatever was loaded at mount -
  // mirrors patients.js's page-level `let nextPatientId = ...` so ids are
  // never reused even after a delete.
  const nextPatientIdRef = useRef(null)
  const nextConsultationIdRef = useRef(null)
  if (nextPatientIdRef.current === null) {
    nextPatientIdRef.current = patients.reduce((max, p) => Math.max(max, p.id + 1), 1)
  }
  if (nextConsultationIdRef.current === null) {
    nextConsultationIdRef.current = patients.reduce(
      (max, p) => p.consultations.reduce((m, c) => Math.max(m, c.id + 1), max),
      1
    )
  }

  // ==================== DERIVED ====================

  const visiblePatients = useMemo(() => {
    return patients.filter(p => {
      const ownerFullName = `${p.ownerName} ${p.ownerSurname}`.toLowerCase()
      const matchesSearch = !searchTerm
        || p.petName.toLowerCase().includes(searchTerm)
        || ownerFullName.includes(searchTerm)
        || p.ownerEmail.toLowerCase().includes(searchTerm)
      const matchesBranch = selectedBranch === 'All Branches' || p.branch === selectedBranch
      const matchesStatus = activeStatuses.size === 0 || activeStatuses.has(p.status)
      return matchesSearch && matchesBranch && matchesStatus
    })
  }, [patients, searchTerm, selectedBranch, activeStatuses])

  const stats = useMemo(() => {
    const now = new Date()
    const activeThisMonth = patients.filter(p => {
      const lastVisit = getLastVisitDate(p)
      if (!lastVisit) return false
      const [y, m] = lastVisit.split('-').map(Number)
      return p.status === 'Active' && y === now.getFullYear() && m === now.getMonth() + 1
    }).length
    const followUpNeeded = patients.filter(p => p.status === 'Follow-up needed').length
    return { activeThisMonth, followUpNeeded }
  }, [patients])

  const availableStatuses = useMemo(() => [...new Set(patients.map(p => p.status))].sort(), [patients])

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

  const currentPatient = useMemo(
    () => patients.find(p => p.id === currentDetailPatientId) || null,
    [patients, currentDetailPatientId]
  )

  const availedItemOptions = useMemo(() => {
    if (!availedType) return []
    if (availedType === 'Service') return CLINIC_SERVICES
    return products.map(p => p.name).sort((a, b) => a.localeCompare(b))
  }, [availedType, products])

  // ==================== NEW / EDIT PATIENT MODAL ====================

  function openAddModal() {
    setEditingPatientId(null)
    setPatientForm(EMPTY_PATIENT_FORM)
    setPatientModalOpen(true)
  }

  function openEditModal(patient) {
    setEditingPatientId(patient.id)
    setPatientForm({
      ownerName: patient.ownerName,
      ownerSurname: patient.ownerSurname,
      ownerEmail: patient.ownerEmail,
      ownerAddress: patient.ownerAddress,
      ownerMobile: patient.ownerMobile,
      petName: patient.petName,
      petSpecie: patient.petSpecie,
      petBreed: patient.petBreed,
      petSex: patient.petSex,
      petDob: patient.petDob,
      petAge: patient.petAge,
      petMarking: patient.petMarking,
      branch: patient.branch
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

  function handlePatientSubmit(e) {
    e.preventDefault()

    const ownerEmail = patientForm.ownerEmail.trim().toLowerCase()
    const duplicate = patients.find(p => p.ownerEmail === ownerEmail && p.id !== editingPatientId)
    if (duplicate) {
      showToast('That owner email is already registered to another owner.')
      return
    }

    const patientData = {
      ownerName: patientForm.ownerName.trim(),
      ownerSurname: patientForm.ownerSurname.trim(),
      ownerEmail,
      ownerAddress: patientForm.ownerAddress.trim(),
      ownerMobile: patientForm.ownerMobile.trim(),
      petName: patientForm.petName.trim(),
      petSpecie: patientForm.petSpecie,
      petBreed: patientForm.petBreed.trim(),
      petSex: patientForm.petSex,
      petDob: patientForm.petDob,
      petAge: Number(patientForm.petAge),
      petMarking: patientForm.petMarking.trim(),
      branch: patientForm.branch
    }

    let newPatient = null

    if (editingPatientId) {
      setPatients(prev => prev.map(p => (p.id === editingPatientId ? { ...p, ...patientData } : p)))
      showToast(`"${patientData.petName}" was updated.`)
    } else {
      newPatient = {
        id: nextPatientIdRef.current++,
        ...patientData,
        status: 'Active',
        createdAt: todayIso(),
        consultations: []
      }
      setPatients(prev => [...prev, newPatient])
      showToast(`"${patientData.petName}" was added.`)
    }

    closePatientModal()

    // Straight from filling out a new patient's info to logging their first
    // consultation, instead of dropping back to the bare table.
    if (newPatient) {
      openPatientDetailModal(newPatient)
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

  function handleDeletePatient(patient) {
    if (!confirm(`Delete "${patient.petName}"'s record?`)) return
    setPatients(prev => prev.filter(p => p.id !== patient.id))
    setSelectedPatientIds(prev => {
      const next = new Set(prev)
      next.delete(patient.id)
      return next
    })
    showToast(`"${patient.petName}" was deleted.`)
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

  function handleConsultationSubmit(e) {
    e.preventDefault()

    const patient = currentPatient
    if (!patient) return

    const followUp = consultFollowUp
    const followUpNote = followUp ? consultFollowUpNote.trim() : ''

    const consultation = {
      id: nextConsultationIdRef.current++,
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

    setPatients(prev => prev.map(p => {
      if (p.id !== patient.id) return p
      const updated = { ...p, consultations: [...p.consultations, consultation] }

      if (followUp) {
        // Raises a new follow-up (or replaces the pending one).
        updated.status = 'Follow-up needed'
        updated.followUpNote = followUpNote
      } else if (
        p.status === 'Follow-up needed'
        && pendingAvailedItems.some(item => item.type === 'Service' && item.name === p.followUpNote)
      ) {
        // Resolves the pending follow-up only when the same service that was
        // due actually got availed on this visit.
        updated.status = 'Active'
        updated.followUpNote = ''
      }

      return updated
    }))

    closePatientDetailModal()
    showToast('Consultation added successfully.', 'Print', () => printConsultationReceipt(patient, consultation))
  }

  // ==================== CONSULTATION HISTORY MODAL ====================

  function openHistoryModal() {
    if (currentPatient) setHistoryOpen(true)
  }

  function closeHistoryModal() {
    setHistoryOpen(false)
  }

  function handleDeleteConsultation(id) {
    if (!currentPatient) return
    if (!confirm('Delete this consultation entry?')) return
    setPatients(prev => prev.map(p => (
      p.id === currentPatient.id
        ? { ...p, consultations: p.consultations.filter(c => c.id !== id) }
        : p
    )))
    showToast('Consultation entry deleted.')
  }

  // ==================== PRINTING ====================

  function openClinicPrintWindow() {
    const printWindow = window.open('', '_blank', 'width=760,height=900')
    if (!printWindow) {
      showToast('Please allow pop-ups to print.')
      return null
    }
    return printWindow
  }

  // Mirrors the clinic's actual paper chart (Ecovet Animal Clinic letterhead,
  // Client's Name / Pet's Name / Mobile# fields, then a Date | Treatment |
  // Remarks log table) so the printout matches what staff already know.
  function printConsultationReceipt(patient, consultation) {
    const printWindow = openClinicPrintWindow()
    if (!printWindow) return

    const { treatmentHtml, remarksHtml } = buildConsultationCells(consultation)

    const blankRows = Array.from({ length: 4 }, () => `
        <tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
    `).join('')

    const bodyHtml = `
        ${clinicLetterheadHtml(patient)}
        <table class="log">
            <thead>
                <tr><th>Date</th><th>Treatment</th><th>Remarks</th></tr>
            </thead>
            <tbody>
                <tr>
                    <td>${formatDate(consultation.date)}</td>
                    <td>${treatmentHtml}</td>
                    <td>${remarksHtml}</td>
                </tr>
                ${blankRows}
            </tbody>
        </table>
        ${consultationAttachmentsHtml(consultation)}
        <p class="footer">Printed ${formatDate(todayIso())} - Vet Vision Clinic Management System</p>
    `

    writeAndPrint(printWindow, `${patient.petName} - Ecovet Animal Clinic`, bodyHtml)
  }

  // Prints every consultation on file for this patient as one running log,
  // same layout as the physical chart when a page fills up with visits.
  function printPatientHistory(patient) {
    if (!patient.consultations || patient.consultations.length === 0) {
      showToast('No consultations logged yet for this patient.')
      return
    }

    const printWindow = openClinicPrintWindow()
    if (!printWindow) return

    const sorted = [...patient.consultations].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)

    let grandTotal = 0
    const rows = sorted.map(c => {
      const { treatmentHtml, remarksHtml, total } = buildConsultationCells(c)
      grandTotal += total
      return `
            <tr>
                <td>${formatDate(c.date)}</td>
                <td>${treatmentHtml}</td>
                <td>${remarksHtml}</td>
            </tr>
        `
    }).join('')

    // Unlike the single-visit receipt, the full history doesn't dump every
    // blood test / waiver image on the page - with many visits that's a lot
    // of heavy inline images, which is also what was making the letterhead
    // logo print blank. The Remarks column still notes when a visit has one
    // on file.
    const bodyHtml = `
        ${clinicLetterheadHtml(patient)}
        <table class="log">
            <thead>
                <tr><th>Date</th><th>Treatment</th><th>Remarks</th></tr>
            </thead>
            <tbody>${rows}</tbody>
            ${grandTotal ? `
                <tfoot>
                    <tr><td>&nbsp;</td><td>Grand total</td><td>${formatPrice(grandTotal)}</td></tr>
                </tfoot>
            ` : ''}
        </table>
        <p class="footer">Printed ${formatDate(todayIso())} - Vet Vision Clinic Management System</p>
    `

    writeAndPrint(printWindow, `${patient.petName} - Full history - Ecovet Animal Clinic`, bodyHtml)
  }

  // ==================== EFFECTS: escape key / deep link ====================

  useEffect(() => {
    function handleKeydown(e) {
      if (e.key === 'Escape') {
        closePatientModal()
        closeHistoryModal()
        closePatientDetailModal()
        setFilterOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeydown)
    return () => document.removeEventListener('keydown', handleKeydown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Landing here from a notification bell click on another page
  // (Topbar.jsx) links to /admin/patients?followUp=<id> - jump straight to
  // that patient instead of leaving the admin to find them in the table.
  useEffect(() => {
    const followUpParamId = Number(searchParams.get('followUp'))
    if (followUpParamId) {
      const targetPatient = patients.find(p => p.id === followUpParamId)
      if (targetPatient) openPatientDetailModal(targetPatient)
    }
    // Run once on mount only, mirroring the original page-load-only check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ==================== RENDER ====================

  return (
    <main className="content">
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
          <p className={`stat-value${patients.length === 0 ? ' muted' : ''}`}>{patients.length}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Active this month</p>
          <p className={`stat-value${patients.length === 0 ? ' muted' : ''}`}>{stats.activeThisMonth}</p>
        </div>
        <div className={`stat-card${stats.followUpNeeded > 0 ? ' follow-up-active' : ''}`}>
          <p className="stat-label">Follow-up needed</p>
          <p className={`stat-value${patients.length === 0 ? ' muted' : ''}`}>{stats.followUpNeeded}</p>
        </div>
      </div>

      {/* Table */}
      <div className="table-card">
        <div className="patients-toolbar">
          <div className="search-wrapper">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input type="text" placeholder="search patient or owner" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value.trim().toLowerCase())} />
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
                <th>Specie</th>
                <th>Branch</th>
                <th>Last visit</th>
                <th>No. visit</th>
                <th>Status</th>
                <th className="action-col"></th>
              </tr>
            </thead>
            <tbody>
              {patients.length === 0 ? (
                <tr><td colSpan="10" className="empty-state">No patients yet. Click "+ New" to add one.</td></tr>
              ) : visiblePatients.length === 0 ? (
                <tr><td colSpan="10" className="empty-state">No patients match your search or filter.</td></tr>
              ) : visiblePatients.map(p => (
                <tr className="patient-row" key={p.id} onClick={() => openPatientDetailModal(p)}>
                  <td className="checkbox-col" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" className="patient-row-checkbox" checked={selectedPatientIds.has(p.id)} onChange={(e) => handleRowCheckboxChange(p.id, e.target.checked)} aria-label={`Select ${p.petName}`} />
                  </td>
                  <td>{p.petName}</td>
                  <td>{p.ownerName} {p.ownerSurname}</td>
                  <td>{p.ownerEmail}</td>
                  <td>{p.petSpecie}</td>
                  <td>{p.branch}</td>
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
          <p className="table-footer-count">Showing {visiblePatients.length} of {patients.length} entries</p>
          <div className="pagination">
            <button className="page-btn" disabled aria-label="Previous page">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <button className="page-btn active" disabled>1</button>
            <button className="page-btn" disabled aria-label="Next page">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>
        </div>
      </div>

      {/* New/Edit patient modal */}
      <div className={`modal-overlay${patientModalOpen ? ' show' : ''}`} onClick={closePatientModal}>
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
                      <label className="form-label" htmlFor="petSpecie">Specie <span className="required">*</span></label>
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
              <button type="submit" className="patient-save-btn">{editingPatientId ? 'Save changes' : 'Save'}</button>
            </div>
          </form>
        </div>
      </div>

      {/* Patient detail modal */}
      <div className={`modal-overlay${currentPatient ? ' show' : ''}`} onClick={closePatientDetailModal}>
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
                  <p className="detail-info-sub">{currentPatient.ownerEmail}</p>
                  <p className="detail-info-sub">{currentPatient.ownerMobile}</p>
                  <p className="detail-info-sub">{currentPatient.ownerAddress}</p>
                </div>
                <div className="detail-info-group">
                  <p className="detail-info-label">Pet</p>
                  <p className="detail-info-value">{currentPatient.petSpecie} — {currentPatient.petBreed}</p>
                  <p className="detail-info-sub">{currentPatient.petSex}, {currentPatient.petAge} yr(s) old</p>
                  <p className="detail-info-sub">{currentPatient.petMarking}</p>
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
                  <textarea id="consultNotes" className="form-input" rows="3" placeholder="Diagnosis, prescription, dosage..." required value={consultNotes} onChange={(e) => setConsultNotes(e.target.value)}></textarea>
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
                          <select id="availedItem" className="form-input" disabled={!availedType || availedItemOptions.length === 0} value={availedItem} onChange={(e) => setAvailedItem(e.target.value)}>
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
                  <button type="submit" className="patient-save-btn">Save consultation</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Consultation history modal */}
      <div className={`modal-overlay${historyOpen && currentPatient ? ' show' : ''}`} onClick={closeHistoryModal}>
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
                {currentPatient.consultations.length === 0 ? (
                  <p className="empty-state">No consultations logged yet.</p>
                ) : (
                  [...currentPatient.consultations]
                    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
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
      </div>
    </main>
  )
}
