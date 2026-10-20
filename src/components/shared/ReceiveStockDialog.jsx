import React, { useEffect, useState } from 'react'
import Dialog from './Dialog'
import { useToast } from './Toast'
import { useInventory } from '../../hooks/useInventory'
import { errorMessage } from '../../api/client'
import { formatDate, todayIso } from '../../utils/format'

// A delivery arrived: add it to the shelf. Logged as a restock (not a correction) so the stock history can tell the
// two apart. Uses the Inventory page's modal styles (admin/inventory.css). `product` is an inventory row or null.
// onReceived(row): optional, after a delivery is saved. note: optional line shown above the form.
export default function ReceiveStockDialog({ product, onClose, onReceived, note }) {
  const { receive } = useInventory()
  const showToast = useToast()
  const [form, setForm] = useState({ quantity: '', delivery: '', expiration: '' })
  const [saving, setSaving] = useState(false)
  // Set when the server says this item was received here a few minutes ago: { quantity, at, by }.
  const [repeat, setRepeat] = useState(null)
  const added = Math.max(0, Math.floor(Number(form.quantity) || 0))
  // A later date would replace the earlier one and hide stock that expires sooner (one date per item).
  const laterExpiry = !!product && product.quantity > 0 && product.expiration >= todayIso() && !!form.expiration && form.expiration > product.expiration

  useEffect(() => {
    // An expired date is not carried over: expired stock cannot be received.
    if (product) setForm({ quantity: '', delivery: todayIso(), expiration: product.expiration >= todayIso() ? product.expiration : '' })
    setRepeat(null)
  }, [product])

  // confirmRepeat: the person saw the "already received" warning and chose to add this delivery anyway.
  async function save(confirmRepeat = false) {
    if (saving) return
    setSaving(true)
    try {
      const row = await receive(product.id, {
        quantity: Number(form.quantity), delivery: form.delivery || null, expiration: form.expiration || null, confirmRepeat
      })
      showToast(`Received ${form.quantity} × ${product.name}. On hand: ${row.quantity}.`)
      await onReceived?.(row)
      onClose()
    } catch (err) {
      if (err.status === 409 && err.data?.repeat) setRepeat(err.data.repeat)
      else showToast(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }
  const submit = (e) => { e.preventDefault(); save(false) }
  const repeatTime = repeat ? new Date(repeat.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''

  return (
    <Dialog open={!!product} onClose={onClose} label="Receive stock">
      {product && (
        <div className="modal product-modal receive-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Receive stock</h2>
            <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
          <form className="modal-body" onSubmit={submit}>
            {note && <p className="receive-note">{note}</p>}
            <p className="form-hint">Use this when a delivery of <b>{product.name}</b> arrives at {product.branch}. It adds to the count and is recorded as a delivery.</p>
            <div className="receive-preview" aria-live="polite">
              <div><span>On hand now</span><b>{product.quantity}</b></div>
              <div><span>Arrived</span><b>{added > 0 ? `+${added}` : '—'}</b></div>
              <div><span>After saving</span><b>{added > 0 ? product.quantity + added : product.quantity}</b></div>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="receiveQty">How many arrived?</label>
              <input id="receiveQty" type="number" className="form-input" min="1" max="99999999" step="1" required autoFocus
                value={form.quantity} onChange={(e) => { setRepeat(null); setForm((f) => ({ ...f, quantity: e.target.value })) }} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="receiveDate">Delivery date</label>
                <input id="receiveDate" type="date" className="form-input" max={todayIso()}
                  value={form.delivery} onChange={(e) => setForm((f) => ({ ...f, delivery: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="receiveExpiry">Expiration date <span className="optional">(optional)</span></label>
                <input id="receiveExpiry" type="date" className="form-input" min={todayIso()}
                  value={form.expiration} onChange={(e) => setForm((f) => ({ ...f, expiration: e.target.value }))} />
              </div>
            </div>
            {laterExpiry ? (
              <p className="field-hint field-hint-change" role="status">
                The stock already on the shelf expires earlier, on {formatDate(product.expiration)}. Keep the earlier date so the older stock is sold first; the item can only show one expiration date.
                {' '}<button type="button" className="link-btn" onClick={() => setForm((f) => ({ ...f, expiration: product.expiration }))}>Keep {formatDate(product.expiration)}</button>
              </p>
            ) : (
              <p className="field-hint">Starts with the item's current expiration date. Change it if this delivery expires on another date.</p>
            )}
            {repeat ? (
              <div className="repeat-warning" role="alert">
                <p><b>{repeat.quantity} {product.name}</b> were already received at {product.branch} at {repeatTime} by {repeat.by}. Is this a second delivery?</p>
                <div className="repeat-actions">
                  <button type="button" className="modal-submit-btn" disabled={saving} onClick={() => save(true)}>{saving ? 'Saving…' : `Yes, add ${added} more`}</button>
                  <button type="button" className="link-btn" onClick={onClose}>No, it is the same box</button>
                </div>
              </div>
            ) : (
              <button type="submit" className="modal-submit-btn" disabled={saving}>{saving ? 'Saving…' : added > 0 ? `Add ${added} to stock` : 'Add to stock'}</button>
            )}
          </form>
        </div>
      )}
    </Dialog>
  )
}
