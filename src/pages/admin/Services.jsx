import React, { useMemo, useState } from 'react'
import { useInventory, useServiceCatalog } from '../../hooks/useInventory'
import { useToast } from '../../components/shared/Toast'
import { errorMessage } from '../../api/client'
import Dialog from '../../components/shared/Dialog'
import { formatPrice } from '../../utils/format'
import '../../styles/admin/inventory.css'
import '../../styles/admin/services.css'

// The clinic's services: what a visit can be billed for (the consultation picker reads this list). Per branch price
// and cost, plus the supplies one service uses up, which the database deducts from that branch's stock each time
// the service is billed. Services are never deleted: past visits point at them.
const BRANCHES = ['Ibaan', 'San Jose']
const EMPTY = { name: '', category: '', prices: { Ibaan: { price: '', cost: '' }, 'San Jose': { price: '', cost: '' } }, supplies: [] }

const money = (v) => (v === null || v === undefined ? '—' : formatPrice(v))
const numOrNull = (v) => (v === '' || v === null || v === undefined ? null : Number(v))

export default function Services() {
  const { data, loading, create, update } = useServiceCatalog()
  const { items: stock } = useInventory()
  const showToast = useToast()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [editing, setEditing] = useState(null) // null: closed, 'new', or a service id
  const [form, setForm] = useState(EMPTY)
  const [supply, setSupply] = useState({ productId: '', quantity: '1' })
  const [saving, setSaving] = useState(false)

  const services = data || []
  const categories = useMemo(() => [...new Set(services.map((s) => s.category))].sort(), [services])
  // Products are shared by both branches; the inventory list has one row per branch, so keep one per product.
  const products = useMemo(() => {
    const seen = new Map()
    for (const p of stock) if (!seen.has(p.productId)) seen.set(p.productId, p.name)
    return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [stock])

  const visible = services.filter((s) =>
    (!category || s.category === category) && (!search || s.name.toLowerCase().includes(search.toLowerCase())))

  function openNew() {
    setForm(EMPTY)
    setEditing('new')
  }

  function openEdit(s) {
    setForm({
      name: s.name,
      category: s.category,
      prices: Object.fromEntries(BRANCHES.map((b) => [b, { price: s.prices[b] ?? '', cost: s.costs?.[b] ?? '' }])),
      supplies: (s.supplies || []).map((u) => ({ ...u, quantity: String(u.quantity) }))
    })
    setEditing(s.id)
  }

  const setPrice = (branch, key, value) =>
    setForm((f) => ({ ...f, prices: { ...f.prices, [branch]: { ...f.prices[branch], [key]: value } } }))

  function addSupply() {
    const product = products.find((p) => p.id === supply.productId)
    const quantity = Number(supply.quantity)
    if (!product || !(quantity > 0)) return showToast('Pick a product and a quantity.')
    setForm((f) => ({
      ...f,
      supplies: [...f.supplies.filter((u) => u.productId !== product.id), { productId: product.id, name: product.name, quantity: String(quantity) }]
    }))
    setSupply({ productId: '', quantity: '1' })
  }

  async function save(e) {
    e.preventDefault()
    if (saving) return
    const body = {
      name: form.name.trim(),
      category: form.category.trim(),
      prices: Object.fromEntries(BRANCHES.map((b) => [b, { price: numOrNull(form.prices[b].price), cost: numOrNull(form.prices[b].cost) }])),
      supplies: form.supplies.map((u) => ({ productId: u.productId, quantity: Number(u.quantity) }))
    }
    setSaving(true)
    try {
      if (editing === 'new') await create(body)
      else await update(editing, body)
      showToast(`"${body.name}" was saved.`)
      setEditing(null)
    } catch (err) {
      showToast(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <main id="main-content" tabIndex={-1} className="content">
      <div className="content-header">
        <h1>Services</h1>
        <div className="header-filters">
          <div className="search-wrapper">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input type="text" aria-label="Search services" autoComplete="off" placeholder="Search service" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="form-select-wrapper services-category-filter">
            <select className="form-input" aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {categories.map((c) => <option key={c}>{c}</option>)}
            </select>
            <svg className="form-select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
          </div>
          <button className="new-btn" onClick={openNew}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            <span>New</span>
          </button>
        </div>
      </div>

      <div className="table-card">
        <h2>Service list <span className="services-count">{visible.length} of {services.length}</span></h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th>Service</th><th>Category</th><th>Ibaan</th><th>San Jose</th><th>Supplies used</th><th>Action</th></tr>
            </thead>
            <tbody>
              {loading && !services.length ? (
                <tr><td colSpan="6" className="empty-state">Loading…</td></tr>
              ) : visible.length === 0 ? (
                <tr><td colSpan="6" className="empty-state">No services match your search.</td></tr>
              ) : visible.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.category}</td>
                  <td>{money(s.prices.Ibaan)}</td>
                  <td>{money(s.prices['San Jose'])}</td>
                  <td>{s.supplies?.length ? s.supplies.map((u) => `${u.name} ×${u.quantity}`).join(', ') : '—'}</td>
                  <td>
                    <button type="button" className="row-action-btn edit" aria-label={`Edit ${s.name}`} onClick={() => openEdit(s)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z" /></svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!editing} onClose={() => setEditing(null)} label={editing === 'new' ? 'New service' : 'Edit service'}>
        <div className="modal product-modal service-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>{editing === 'new' ? 'New service' : 'Edit service'}</h2>
            <button type="button" className="modal-close" aria-label="Close" onClick={() => setEditing(null)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
          <form className="modal-body" onSubmit={save}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="serviceName">Service name</label>
                <input id="serviceName" className="form-input" required maxLength={120} value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="serviceCategory">Category</label>
                <input id="serviceCategory" className="form-input" required maxLength={60} list="serviceCategories"
                  value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
                <datalist id="serviceCategories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
              </div>
            </div>

            <fieldset className="service-prices">
              <legend className="form-label">Price and cost per branch (₱). Leave the price blank if a branch does not offer it.</legend>
              {BRANCHES.map((b) => (
                <div className="service-price-row" key={b}>
                  <span className="service-branch">{b}</span>
                  <input type="number" className="form-input" min="0" step="0.01" aria-label={`${b} price`} placeholder="Price"
                    value={form.prices[b].price} onChange={(e) => setPrice(b, 'price', e.target.value)} />
                  <input type="number" className="form-input" min="0" step="0.01" aria-label={`${b} cost`} placeholder="Cost"
                    value={form.prices[b].cost} onChange={(e) => setPrice(b, 'cost', e.target.value)} />
                </div>
              ))}
            </fieldset>

            <div className="form-group">
              <span className="form-label">Supplies used per service <span className="optional">(deducted from stock each time it is billed)</span></span>
              <div className="service-supply-row">
                <div className="form-select-wrapper">
                  <select className="form-input" aria-label="Supply product" value={supply.productId}
                    onChange={(e) => setSupply((s) => ({ ...s, productId: e.target.value }))}>
                    <option value="">Select a product</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <svg className="form-select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                </div>
                <input type="number" className="form-input" min="0.01" step="0.01" aria-label="Quantity per service"
                  value={supply.quantity} onChange={(e) => setSupply((s) => ({ ...s, quantity: e.target.value }))} />
                <button type="button" className="new-btn" onClick={addSupply}>Add</button>
              </div>
              {form.supplies.length > 0 && (
                <ul className="service-supply-list">
                  {form.supplies.map((u) => (
                    <li key={u.productId}>
                      {u.name} ×{u.quantity}
                      <button type="button" className="link-btn" onClick={() => setForm((f) => ({ ...f, supplies: f.supplies.filter((x) => x.productId !== u.productId) }))}>Remove</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button type="submit" className="modal-submit-btn" disabled={saving}>{saving ? 'Saving…' : editing === 'new' ? 'Add service' : 'Save changes'}</button>
          </form>
        </div>
      </Dialog>
    </main>
  )
}
