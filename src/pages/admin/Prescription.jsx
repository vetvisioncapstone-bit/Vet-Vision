import React from 'react'
import { formatDate } from '../../utils/format'

// The vet's prescription: typed into the consultation form, saved with the visit, and printed on a copy of the
// clinic's paper Rx pad (letterhead, patient lines, the Rx symbol, the faint veterinary caduceus and the vet's
// signature block). Patient name, age, weight and date come from the consultation itself.

export const EMPTY_RX = { diagnosis: '', rx: '', nextAppointment: '', veterinarian: '', licenseNo: '', ptr: '' }
const SIGNER_KEY = 'vv-rx-signer'

// The vet's name, licence and PTR are the same on every prescription they write, so this browser remembers them.
export function newPrescription() {
  try {
    return { ...EMPTY_RX, ...JSON.parse(localStorage.getItem(SIGNER_KEY) || '{}') }
  } catch {
    return { ...EMPTY_RX }
  }
}

export function rememberSigner({ veterinarian, licenseNo, ptr }) {
  try {
    localStorage.setItem(SIGNER_KEY, JSON.stringify({ veterinarian, licenseNo, ptr }))
  } catch { /* private window: nothing to remember */ }
}

export function PrescriptionFields({ value, onChange, onRemove }) {
  const set = (key) => (e) => onChange({ ...value, [key]: e.target.value })
  const input = (key, label, props = {}) => (
    <div className="form-group">
      <label className="form-label" htmlFor={`rx-${key}`}>{label}</label>
      <input id={`rx-${key}`} className="form-input" value={value[key]} onChange={set(key)} {...props} />
    </div>
  )
  return (
    <div className="rx-fields">
      <div className="rx-fields-head">
        <span className="rx-fields-symbol" aria-hidden="true">℞</span>
        <p>Patient's name, age, weight and date are taken from this consultation.</p>
        <button type="button" className="file-upload-remove" aria-label="Remove prescription" onClick={onRemove}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>
      <div className="form-row">
        {input('diagnosis', 'Diagnosis', { maxLength: 200 })}
        {input('nextAppointment', 'Next appointment', { type: 'date' })}
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="rx-rx">Prescription <span className="required">*</span></label>
        <textarea id="rx-rx" className="form-input" rows="5" required maxLength={4000}
          placeholder={'Medicine, strength and quantity\nDirections, e.g. 1 tablet twice a day for 7 days'}
          value={value.rx} onChange={set('rx')} />
      </div>
      <div className="form-row rx-signer">
        {input('veterinarian', 'Veterinarian', { maxLength: 80 })}
        {input('licenseNo', 'License No.', { maxLength: 40 })}
        {input('ptr', 'PTR', { maxLength: 40 })}
      </div>
    </div>
  )
}

const BRANCH_LINES = {
  Ibaan: ['454 Balagtas St. Poblacion, Ibaan, Batangas', '09664253828']
}

function Line({ label, value, className = '' }) {
  return (
    <div className={`rx-line ${className}`}>
      <span className="rx-line-label">{label}</span>
      <span className="rx-line-value">{value || ''}</span>
    </div>
  )
}

// Faint veterinary caduceus (the V with the winged staff and snake) behind the prescription, as on the pad.
function Caduceus() {
  return (
    <svg className="rx-watermark" viewBox="0 0 200 260" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M40 120 L100 250 L160 120" />
      <path d="M58 120 L100 214 L142 120" />
      <line x1="100" y1="40" x2="100" y2="232" />
      <circle cx="100" cy="30" r="12" />
      <path d="M96 52 C60 40 30 46 10 58 C40 60 62 64 92 66" />
      <path d="M104 52 C140 40 170 46 190 58 C160 60 138 64 108 66" />
      <path d="M22 62 C46 66 66 70 90 72 M178 62 C154 66 134 70 110 72" />
      <path d="M112 80 C80 86 80 104 100 110 C122 116 122 134 100 140 C78 146 78 164 100 170 C116 174 116 188 104 194" />
      <circle cx="116" cy="80" r="5" />
    </svg>
  )
}

export function RxPad({ patient, consultation }) {
  const rx = consultation.prescription || {}
  const lines = BRANCH_LINES[patient.branch] || [`${patient.branch} Branch`]
  return (
    <div className="rx-sheet">
      <header className="rx-head">
        <h1>ECOVET ANIMAL CLINIC</h1>
        {lines.map((l) => <p key={l}>{l}</p>)}
      </header>
      <div className="rx-info">
        <div>
          <Line label="Patient's Name:" value={patient.petName} />
          <div className="rx-pair">
            <Line label="Weight:" value={consultation.weight} />
            <Line label="Age:" value={patient.petAge === '' || patient.petAge == null ? '' : `${patient.petAge} yr(s)`} />
          </div>
          <Line label="Diagnosis :" value={consultation.diagnosis} />
        </div>
        <div>
          <Line label="Date:" value={formatDate(consultation.date)} />
          <Line label="Next appointment:" value={rx.nextAppointment ? formatDate(rx.nextAppointment) : ''} />
        </div>
      </div>
      <div className="rx-body">
        <Caduceus />
        <span className="rx-symbol" aria-label="Prescription">R<span>x</span></span>
        <p className="rx-text">{rx.rx}</p>
      </div>
      <footer className="rx-foot">
        <img src="/Images/EcovetLogo%201.png" alt="Ecovet logo" />
        <div className="rx-sign">
          <Line label="Veterinarian:" value={rx.veterinarian} />
          <Line label="License No. :" value={rx.licenseNo} />
          <Line label="PTR:" value={rx.ptr} />
        </div>
      </footer>
    </div>
  )
}
