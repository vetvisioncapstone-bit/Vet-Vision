import React, { useRef, useState } from 'react'
import Dialog from './Dialog'
import '../../styles/shared/confirm-dialog.css'

// A styled "are you sure?" box in place of the browser's confirm(). It carries its own styles, so it looks the same
// on any page. Escape, the backdrop and Cancel all call onCancel; focus starts on Cancel, the safe choice.
export default function ConfirmDialog({ open, title, message, confirmLabel = 'Delete', busy, onConfirm, onCancel }) {
  return (
    <Dialog open={open} onClose={onCancel} label={title} className="confirm-overlay">
      <div className="confirm-box" role="alertdialog" aria-describedby="confirm-message" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
        </div>
        <h2>{title}</h2>
        <div id="confirm-message" className="confirm-message">{message}</div>
        <div className="confirm-actions">
          <button type="button" className="confirm-cancel" onClick={onCancel}>Cancel</button>
          <button type="button" className="confirm-danger" onClick={onConfirm} disabled={busy}>{busy ? 'Working…' : confirmLabel}</button>
        </div>
      </div>
    </Dialog>
  )
}

// const [ask, confirmBox] = useConfirm()  ...  if (!(await ask({ title, message, confirmLabel }))) return
// Render {confirmBox} once in the page. The promise resolves true on the confirm button, false otherwise.
export function useConfirm() {
  const [request, setRequest] = useState(null)
  const resolver = useRef(null)
  const answer = (yes) => { resolver.current?.(yes); resolver.current = null; setRequest(null) }
  const ask = (options) => new Promise((resolve) => { resolver.current = resolve; setRequest(options) })
  const box = (
    <ConfirmDialog open={!!request} title={request?.title} message={request?.message} confirmLabel={request?.confirmLabel}
      onConfirm={() => answer(true)} onCancel={() => answer(false)} />
  )
  return [ask, box]
}
