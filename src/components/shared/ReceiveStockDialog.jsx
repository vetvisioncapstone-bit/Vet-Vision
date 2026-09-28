import React, { useEffect, useState } from 'react'
import Dialog from './Dialog'
import { useToast } from './Toast'
import { useInventory } from '../../hooks/useInventory'
import { errorMessage } from '../../api/client'
import { todayIso } from '../../utils/format'

// A delivery arrived: add it to the shelf. Logged as a restock (not a correction) so the stock history can tell the
// two apart. Uses the Inventory page's modal styles (admin/inventory.css). `product` is an inventory row or null.
export default function ReceiveStockDialog({ product, onClose }) {
  const { receive } = useInventory()
  const showToast = useToast()
  const [form, setForm] = useState({ quantity: '', delivery: '', expiration: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (product) setForm({ quantity: '', delivery: todayIso(), expiration: product.expiration || '' })
  }, [product])

  async function submit(e) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    try {
      const row = await receive(product.id, {
        quantity: Number(form.quantity), delivery: form.delivery || null, expiration: form.expiration || null
      })
      showToast(`Received ${form.quantity} × ${product.name}. On hand: ${row.quantity}.`)
      onClose()
    } catch (err) {
      showToast(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

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
            <p className="form-hint">{product.name} · {product.branch} · {product.quantity} on hand now</p>
            <div className="form-group">
              <label className="form-label" htmlFor="receiveQty">Quantity received</label>
              <input id="receiveQty" type="number" className="form-input" min="1" step="1" required autoFocus
                value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="receiveDate">Delivery date</label>
                <input id="receiveDate" type="date" className="form-input" max={todayIso()}
                  value={form.delivery} onChange={(e) => setForm((f) => ({ ...f, delivery: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="receiveExpiry">Expiration date <span className="optional">(optional)</span></label>
                <input id="receiveExpiry" type="date" className="form-input"
                  value={form.expiration} onChange={(e) => setForm((f) => ({ ...f, expiration: e.target.value }))} />
              </div>
            </div>
            <button type="submit" className="modal-submit-btn" disabled={saving}>{saving ? 'Saving…' : 'Add to stock'}</button>
          </form>
        </div>
      )}
    </Dialog>
  )
}
