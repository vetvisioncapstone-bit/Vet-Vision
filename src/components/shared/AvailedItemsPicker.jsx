import React, { useMemo, useState } from 'react'
import { useInventory, useServiceCatalog } from '../../hooks/useInventory'
import { useToast } from './Toast'
import { formatPrice } from '../../utils/format'
import '../../styles/shared/availed-picker.css'

// What a visit is billed for: services from the clinic's catalog and products from the patient's branch stock.
// Saving the consultation turns these into a service transaction and a sale, so they count on the dashboard and
// the products leave the shelf. `items` are { type, serviceId | inventoryId, name, price, quantity }.
export const lineTotal = (items) => items.reduce((sum, i) => sum + Number(i.price || 0) * (i.quantity || 1), 0)

// The shape the API takes (names are looked up on the server).
export const toPayload = (items) => items.map(({ type, serviceId, inventoryId, price, quantity }) =>
  type === 'Service' ? { type, serviceId, price, quantity } : { type, inventoryId, price, quantity })

export default function AvailedItemsPicker({ branch, items, onChange }) {
  const showToast = useToast()
  const { data: catalog } = useServiceCatalog()
  const { items: stock } = useInventory()
  const [type, setType] = useState('')
  const [id, setId] = useState('')
  const [query, setQuery] = useState('') // what is typed in the item box
  const [price, setPrice] = useState('')
  const [quantity, setQuantity] = useState('1')

  const products = useMemo(
    () => stock.filter((p) => p.branch === branch && p.quantity > 0).sort((a, b) => a.name.localeCompare(b.name)),
    [stock, branch]
  )

  // The item box is a search: typing filters the browser's own suggestion list (a <datalist>), and choosing one
  // fills in its id and price. Anything typed that is not on the list leaves the item unpicked.
  const options = type === 'Service'
    ? (catalog || []).map((s) => ({ id: s.id, name: s.name, hint: s.category, price: s.prices?.[branch] }))
    : type === 'Product'
      ? products.map((p) => ({ id: p.id, name: p.name, hint: `${p.quantity} left`, price: p.unitPrice }))
      : []

  function search(text) {
    setQuery(text)
    const found = options.find((o) => o.name.toLowerCase() === text.trim().toLowerCase())
    setId(found ? found.id : '')
    setPrice(found && found.price != null ? String(found.price) : '')
  }

  function add() {
    const qty = Math.max(1, parseInt(quantity, 10) || 1)
    if (!type) return showToast('Pick a type first.')
    if (!id) return showToast(query.trim() ? `"${query.trim()}" is not on the list. Pick an item from the suggestions.` : 'Search for an item first.')
    if (price === '' || Number(price) < 0) return showToast('Enter the price.')
    const name = options.find((o) => o.id === id)?.name
    onChange([...items, { type, [type === 'Service' ? 'serviceId' : 'inventoryId']: id, name, price: Number(price), quantity: qty }])
    setId('')
    setQuery('')
    setPrice('')
    setQuantity('1')
  }

  return (
    <div className="availed-picker">
      <div className="form-row availed-picker-row">
        <div className="form-group">
          <label className="form-label" htmlFor="availedType">Type</label>
          <div className="form-select-wrapper">
            <select id="availedType" className="form-input" value={type} onChange={(e) => { setType(e.target.value); setId(''); setQuery(''); setPrice('') }}>
              <option value="" disabled hidden>Select type</option>
              <option value="Service">Service</option>
              <option value="Product">Product</option>
            </select>
            <svg className="form-select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="availedItem">Item</label>
          <div className="availed-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input id="availedItem" className="form-input" list="availedItemOptions" autoComplete="off" disabled={!type}
              placeholder={!type ? 'Select type first' : type === 'Product' && !products.length ? `No ${branch} stock` : `Search ${type.toLowerCase()}…`}
              value={query} onChange={(e) => search(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (id) add() } }} />
            <datalist id="availedItemOptions">
              {options.map((o) => <option key={o.id} value={o.name} label={o.hint} />)}
            </datalist>
          </div>
        </div>
        <div className="form-group availed-qty">
          <label className="form-label" htmlFor="availedQty">Qty</label>
          <input type="number" id="availedQty" className="form-input" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="availedPrice">Price each (₱)</label>
          <input type="number" id="availedPrice" className="form-input" min="0" step="0.01" placeholder="0.00" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
      </div>
      <button type="button" className="availed-add-btn" onClick={add}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        <span>Add to list</span>
      </button>
      <div className="availed-chip-list">
        {items.map((item, index) => (
          <span className={`availed-chip type-${item.type.toLowerCase()}`} key={index}>
            {item.name}{item.quantity > 1 ? ` ×${item.quantity}` : ''} — {formatPrice(item.price * item.quantity)}
            <button type="button" className="availed-chip-remove" aria-label={`Remove ${item.name}`} onClick={() => onChange(items.filter((_, i) => i !== index))}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </span>
        ))}
        {items.length > 0 && <span className="availed-total">Total: {formatPrice(lineTotal(items))}</span>}
      </div>
    </div>
  )
}
