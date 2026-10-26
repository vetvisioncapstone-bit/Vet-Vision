import React from 'react'
import '../../styles/shared/consult-extras.css'

// File lists on a consultation (laboratory results, signed waivers), used by the admin and staff Patients pages.

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
export default function UploadList({ id, label, accept, noun, items, onChange, onTooMany }) {
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
        <input type="file" id={id} accept={accept} multiple className="sr-only" onChange={add} />
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
