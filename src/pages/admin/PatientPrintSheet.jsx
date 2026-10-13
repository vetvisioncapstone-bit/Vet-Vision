import React, { useEffect } from 'react'
import { formatDate, formatPrice, isImageDataUrl, todayIso } from '../../utils/format'
import { RxPad } from './Prescription'
import '../../styles/admin/reports.css' // the overlay and the print rules; not loaded unless the Reports page was opened

// The clinic's paper chart: Ecovet letterhead, client and pet fields, then a Date | Treatment | Remarks log.
// It is shown over the page and printed with the browser's own print dialog (see the @media print rules in
// reports.css, which hide everything except .report-overlay), so no pop-up window is needed.
//
// job: { patient, consultations, single, rx }
//  - rx: the first consultation's prescription on the clinic's Rx pad instead of the chart.
//  - single: one receipt with its laboratory / waiver images and blank rows to write in.
//  - otherwise: the running history log with a grand total, without the heavy images.

// Older consultations (saved before per-item pricing existed) only have the flat "services" string.
function treatmentLines(c) {
  const priced = Boolean(c.availedItems && c.availedItems.length)
  const rx = priced
    ? c.availedItems.map((item) => `* ${item.name} — ${formatPrice(item.price)}`)
    : (c.services || '').split(',').map((s) => s.trim()).filter(Boolean).map((text) => `* ${text}`)
  const total = priced ? c.totalPrice || c.availedItems.reduce((sum, i) => sum + Number(i.price || 0), 0) : 0
  return {
    total,
    lines: [c.weight ? `Wt: ${c.weight}` : '', c.notes || '', rx.length ? 'Rx' : '', ...rx].filter(Boolean),
    bold: rx.length ? 'Rx' : null
  }
}

function remarkLines(c) {
  return [
    c.remarks || '',
    c.followUp ? `Follow-up needed: ${c.followUpNote || '—'}` : '',
    c.labResults?.length ? `Laboratory test results attached (${c.labResults.length})` : '',
    c.waivers?.length ? `Signed waiver attached (${c.waivers.length})` : ''
  ].filter(Boolean)
}

function Lines({ items, boldItem, total }) {
  if (!items.length && !total) return <>&nbsp;</>
  return (
    <>
      {items.map((line, i) => <div key={i}>{line === boldItem ? <strong>{line}</strong> : line}</div>)}
      {total ? <div><strong>Total: {formatPrice(total)}</strong></div> : null}
    </>
  )
}

function Field({ label, value, grow }) {
  return (
    <div className="cs-field" style={grow ? { flex: 2 } : undefined}>
      <span className="cs-label">{label}</span>
      <span className="cs-value">{value}</span>
    </div>
  )
}

function Letterhead({ patient }) {
  const address = patient.branch === 'Ibaan' ? '454 Balagtas St., Poblacion, Ibaan, Batangas' : `${patient.branch} Branch`
  return (
    <>
      <div className="cs-letterhead">
        <img src="/Images/EcovetLogo%201.png" alt="Ecovet logo" />
        <h1>ECOVET ANIMAL CLINIC</h1>
      </div>
      <p className="cs-address">{address}</p>
      <div className="cs-info">
        <div className="cs-row">
          <Field label="Client's Name:" value={`${patient.ownerName} ${patient.ownerSurname}`} />
          <Field label="Pet's Name:" value={patient.petName} />
          <Field label="Mobile #:" value={patient.ownerMobile} />
        </div>
        <div className="cs-row">
          <Field label="Address:" value={patient.ownerAddress} grow />
          <Field label="Specie:" value={patient.petSpecie} />
          <Field label="Breed:" value={patient.petBreed} />
        </div>
        <div className="cs-row">
          <Field label="Pet's Date of birth:" value={formatDate(patient.petDob)} grow />
          <Field label="Age:" value={String(patient.petAge ?? '')} />
          <Field label="Sex:" value={patient.petSex} />
          <Field label="Color Marking:" value={patient.petMarking} />
        </div>
      </div>
    </>
  )
}

export default function PatientPrintSheet({ job, onClose }) {
  const { patient, consultations, single, rx } = job

  // Escape closes the sheet only, not the patient modals underneath it (capture phase runs first).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const rows = consultations.map((c) => ({ c, t: treatmentLines(c) }))
  const grandTotal = rows.reduce((sum, r) => sum + r.t.total, 0)

  const actions = (
    <div className="cs-actions no-print">
      <button type="button" className="report-btn" onClick={() => window.print()}>Print</button>
      <button type="button" className="report-btn secondary" onClick={onClose}>Close</button>
    </div>
  )

  if (rx) {
    return (
      <div className="report-overlay clinic-overlay" role="dialog" aria-modal="true" aria-label={`Prescription for ${patient.petName}`}>
        <div className="rx-wrap">
          {actions}
          <RxPad patient={patient} consultation={consultations[0]} />
        </div>
      </div>
    )
  }

  return (
    <div className="report-overlay clinic-overlay" role="dialog" aria-modal="true" aria-label={`Print ${patient.petName}`}>
      <div className="clinic-sheet">
        {actions}

        <Letterhead patient={patient} />

        <table className="cs-log">
          <thead>
            <tr><th>Date</th><th>Treatment</th><th>Remarks</th></tr>
          </thead>
          <tbody>
            {rows.map(({ c, t }) => (
              <tr key={c.id}>
                <td>{formatDate(c.date)}</td>
                <td><Lines items={t.lines} boldItem={t.bold} total={t.total} /></td>
                <td><Lines items={remarkLines(c)} /></td>
              </tr>
            ))}
            {single && Array.from({ length: 4 }, (_, i) => <tr key={`blank-${i}`}><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>)}
          </tbody>
          {!single && grandTotal > 0 && (
            <tfoot>
              <tr><td>&nbsp;</td><td>Grand total</td><td>{formatPrice(grandTotal)}</td></tr>
            </tfoot>
          )}
        </table>

        {single && consultations.map((c) => (
          <React.Fragment key={c.id}>
            {(c.labResults || []).map((pic, i) => (
              <React.Fragment key={i}>
                <p className="cs-attach-label">Laboratory test result {c.labResults.length > 1 ? `${i + 1} of ${c.labResults.length} ` : ''}— {formatDate(c.date)}</p>
                <img className="cs-attach-img" src={pic.image} alt={`Laboratory test result ${i + 1}`} />
              </React.Fragment>
            ))}
            {(c.waivers || []).map((file, i) => (
              <React.Fragment key={`w${i}`}>
                <p className="cs-attach-label">Signed waiver {c.waivers.length > 1 ? `${i + 1} of ${c.waivers.length} ` : ''}— {formatDate(c.date)}</p>
                {isImageDataUrl(file.image)
                  ? <img className="cs-attach-img" src={file.image} alt={`Signed waiver ${i + 1}`} />
                  : <p className="cs-note">({file.name || 'waiver'} is a PDF - open it from the app to view)</p>}
              </React.Fragment>
            ))}
          </React.Fragment>
        ))}

        <p className="cs-footer">Printed {formatDate(todayIso())} - Vet Vision Clinic Management System</p>
      </div>
    </div>
  )
}
