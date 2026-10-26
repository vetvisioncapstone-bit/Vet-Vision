import React, { useMemo, useState } from 'react'
import { useInventory, useServiceCatalog } from '../../hooks/useInventory'
import { useToast } from './Toast'
import { formatPrice, isExpired } from '../../utils/format'
import '../../styles/shared/availed-picker.css'

// What a visit is billed for: services from the clinic's catalog and products from the patient's branch stock.
// Saving the consultation turns these into a service transaction and a sale, so they count on the dashboard and
// the products leave the shelf. `items` are { type, serviceId | inventoryId, name, price, quantity }.
export const lineTotal = (items) => items.reduce((sum, i) => sum + Number(i.price || 0) * (i.quantity || 1), 0)

// The shape the API takes (names are looked up on the server).
export const toPayload = (items) => items.map(({ type, serviceId, inventoryId, price, quantity }) =>
  type === 'Service' ? { type, serviceId, price, quantity } : { type, inventoryId, price, quantity })

// Services billed once per visit (a surgery or a test is not done "x2"); the others (injections, confinement days)
// keep a quantity. The server enforces the same list.
const SINGLE_QUANTITY = new Set(['SURGERY', 'PROFESSIONAL FEE', 'TEST KITS', 'CBC/BLOOD CHEM', 'GROOMING', 'VACCINES'])

// The weight range in a service name: "UPTO 5KG" -> [null, 5], "6 TO 10KG" -> (5, 10], "5KG ABOVE" -> (5, null).
// Mirrors clinic/views.py weight_band.
export function weightBand(name) {
  const n = (name || '').toUpperCase()
  let m = n.match(/UPTO\s*(\d+(?:\.\d+)?)\s*KG/)
  if (m) return { above: null, upTo: Number(m[1]) }
  m = n.match(/(\d+(?:\.\d+)?)\s*TO\s*(\d+(?:\.\d+)?)\s*KG/)
  if (m) return { above: Number(m[1]) - 1, upTo: Number(m[2]) }
  m = n.match(/(\d+(?:\.\d+)?)\s*KG\s*ABOVE/)
  if (m) return { above: Number(m[1]), upTo: null }
  return null
}

const kg = (text) => { const m = String(text || '').match(/\d+(?:\.\d+)?/); return m ? Number(m[0]) : null }

// Why a pet of `weight` cannot have this service, or null when it fits (or there is no weight or range to check).
export function weightProblem(serviceName, weight) {
  const band = weightBand(serviceName)
  const w = kg(weight)
  if (!band || w === null) return null
  if (band.upTo !== null && w > band.upTo) return `${serviceName} is for pets up to ${band.upTo} kg; this pet weighs ${w} kg.`
  if (band.above !== null && w <= band.above) return `${serviceName} is for pets over ${band.above} kg; this pet weighs ${w} kg.`
  return null
}

// `servicesOnly`: for positions that bill services but not products (products handed out are a sale).
export default function AvailedItemsPicker({ branch, items, onChange, weight, servicesOnly = false }) {
  const showToast = useToast()
  const { data: catalog } = useServiceCatalog()
  const { items: stock } = useInventory()
  const [type, setType] = useState(servicesOnly ? 'Service' : '')
  const [id, setId] = useState('')
  const [query, setQuery] = useState('') // what is typed in the item box
  const [price, setPrice] = useState('')
  const [quantity, setQuantity] = useState('1')

  // In-stock, unexpired products of this branch (expired stock cannot be sold).
  const products = useMemo(
    () => stock.filter((p) => p.branch === branch && p.quantity > 0 && !isExpired(p)).sort((a, b) => a.name.localeCompare(b.name)),
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

  const service = type === 'Service' ? (catalog || []).find((s) => s.id === id) : null
  const product = type === 'Product' ? products.find((p) => p.id === id) : null
  const single = !!service && SINGLE_QUANTITY.has(service.category)
  // Stock left for this product after what is already on the list.
  const left = product ? product.quantity - items.filter((i) => i.inventoryId === product.id).reduce((n, i) => n + i.quantity, 0) : null
  const tooHeavy = service ? weightProblem(service.name, weight) : null

  function add() {
    const qty = single ? 1 : Math.max(1, parseInt(quantity, 10) || 1)
    if (!type) return showToast('Pick a type first.')
    if (!id) return showToast(query.trim() ? `"${query.trim()}" is not on the list. Pick an item from the suggestions.` : 'Search for an item first.')
    if (price === '' || Number(price) < 0) return showToast('Enter the price.')
    if (tooHeavy) return showToast(tooHeavy)
    if (left !== null && qty > left) return showToast(left > 0 ? `Only ${left} of ${product.name} left in stock.` : `No ${product.name} left in stock.`)
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
              {!servicesOnly && <option value="Product">Product</option>}
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
          <input type="number" id="availedQty" className="form-input" min="1" step="1" max={left ?? undefined}
            value={single ? '1' : quantity} disabled={single} title={single ? 'Billed once per visit' : undefined}
            aria-describedby="availedHint" onChange={(e) => setQuantity(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="availedPrice">Price each (₱)</label>
          <input type="number" id="availedPrice" className="form-input" min="0" step="0.01" placeholder="0.00" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
      </div>
      <p id="availedHint" className={`availed-hint${tooHeavy || (left !== null && Number(quantity) > left) ? ' is-error' : ''}`} aria-live="polite">
        {tooHeavy || (product ? `${left} left in stock at ${branch}.` : single ? 'Billed once per visit.' : service && weightBand(service.name) && kg(weight) === null ? 'Enter the weight above to check this service’s weight range.' : '')}
      </p>
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
