import React, { useEffect } from 'react'
import { formatDate, formatPrice, isImageDataUrl, todayIso } from '../../utils/format'

// The clinic's paper chart: Ecovet letterhead, client and pet fields, then a Date | Treatment | Remarks log.
// It is shown over the page and printed with the browser's own print dialog (see the @media print rules in
// reports.css, which hide everything except .report-overlay), so no pop-up window is needed.
//
// job: { patient, consultations, single }
//  - single: one receipt with its blood test / waiver images and blank rows to write in.
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
    c.bloodTestImage ? 'Blood test result attached' : '',
    c.waiverImage ? 'Signed waiver attached' : ''
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
          <Field label="Pet's Date of birth:" value={formatDate(patient.petDob)} />
          <Field label="Age:" value={String(patient.petAge ?? '')} />
          <Field label="Sex:" value={patient.petSex} />
          <Field label="Color Marking:" value={patient.petMarking} />
        </div>
      </div>
    </>
  )
}

export default function PatientPrintSheet({ job, onClose }) {
  const { patient, consultations, single } = job

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

  return (
    <div className="report-overlay clinic-overlay" role="dialog" aria-modal="true" aria-label={`Print ${patient.petName}`}>
      <div className="clinic-sheet">
        <div className="cs-actions no-print">
          <button type="button" className="report-btn" onClick={() => window.print()}>Print</button>
          <button type="button" className="report-btn secondary" onClick={onClose}>Close</button>
        </div>

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
            {c.bloodTestImage && (
              <>
                <p className="cs-attach-label">Blood test result — {formatDate(c.date)}</p>
                <img className="cs-attach-img" src={c.bloodTestImage} alt="Blood test result" />
              </>
            )}
            {c.waiverImage && (
              <>
                <p className="cs-attach-label">Signed waiver — {formatDate(c.date)}</p>
                {isImageDataUrl(c.waiverImage)
                  ? <img className="cs-attach-img" src={c.waiverImage} alt="Signed waiver" />
                  : <p className="cs-note">(waiver on file - not an image, open from the app to view)</p>}
              </>
            )}
          </React.Fragment>
        ))}

        <p className="cs-footer">Printed {formatDate(todayIso())} - Vet Vision Clinic Management System</p>
      </div>
    </div>
  )
}
