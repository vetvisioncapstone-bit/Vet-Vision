import React, { useMemo, useRef, useState } from 'react'
import { useInventory } from '../../hooks/useInventory'
import { useToast } from '../../components/shared/Toast'
import { errorMessage } from '../../api/client'
import '../../styles/admin/inventory.css'
import { formatDate } from '../../utils/format'

import Dialog from '../../components/shared/Dialog'
import { onActivate } from '../../utils/a11y'
function getStatus(product) {
  if (product.quantity <= 0) return { label: 'Out of stock', cls: 'status-out-of-stock' }
  if (product.quantity <= product.reorderPoint) return { label: 'Low Stock', cls: 'status-low-stock' }
  return { label: 'Ok', cls: 'status-ok' }
}

function compareExpiration(a, b) {
  const ea = a.expiration || ''
  const eb = b.expiration || ''
  if (ea === eb) return 0
  if (!ea) return 1
  if (!eb) return -1
  return ea < eb ? -1 : 1
}

const EMPTY_FORM = {
  name: '', category: '', branch: '', quantity: '', reorderPoint: '',
  delivery: '', expiration: '', photo: null
}

export default function Inventory() {
  const { items: products, loading, create, update, remove } = useInventory()
  const showToast = useToast()
  const [saving, setSaving] = useState(false)

  const [searchTerm, setSearchTerm] = useState('')
  const [activeCategories, setActiveCategories] = useState(new Set())
  const [filterOpen, setFilterOpen] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const fileInputRef = useRef(null)

  const [detailProduct, setDetailProduct] = useState(null)

  const categories = useMemo(() => [...new Set(products.map(p => p.category))].sort(), [products])

  const visibleProducts = useMemo(() => {
    return products
      .filter(p => {
        const matchesSearch = !searchTerm || p.name.toLowerCase().includes(searchTerm) || p.category.toLowerCase().includes(searchTerm)
        const matchesCategory = activeCategories.size === 0 || activeCategories.has(p.category)
        return matchesSearch && matchesCategory
      })
      .sort(compareExpiration)
  }, [products, searchTerm, activeCategories])

  function toggleCategory(cat) {
    setActiveCategories(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat); else next.add(cat)
      return next
    })
  }

  function openAddModal() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  function openEditModal(product) {
    setEditingId(product.id)
    setForm({
      name: product.name,
      category: product.category,
      branch: product.branch || '',
      quantity: product.quantity,
      reorderPoint: product.reorderPoint,
      delivery: product.delivery,
      expiration: product.expiration,
      photo: product.photo || null
    })
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
  }

  function handlePhotoChange(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setForm(f => ({ ...f, photo: ev.target.result }))
    reader.readAsDataURL(file)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (saving) return
    const productData = {
      name: form.name.trim(),
      category: form.category.trim(),
      branch: form.branch,
      quantity: Number(form.quantity),
      reorderPoint: Number(form.reorderPoint),
      delivery: form.delivery,
      expiration: form.expiration,
      photo: form.photo
    }

    setSaving(true)
    try {
      if (editingId) {
        await update(editingId, productData)
        showToast(`"${productData.name}" was updated.`)
      } else {
        await create(productData)
        showToast(`"${productData.name}" was added to inventory.`)
      }
      closeModal()
    } catch (err) {
      showToast(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(product) {
    if (!confirm(`Delete "${product.name}" from inventory?`)) return
    try {
      await remove(product.id)
      showToast(`"${product.name}" was deleted.`)
    } catch (err) {
      showToast(errorMessage(err))
    }
  }

  return (
    <main id="main-content" tabIndex={-1} className="content">
      <div className="content-header">
        <h1>Inventory status &amp; demand forecast</h1>
        <div className="header-filters">
          <div className="search-wrapper">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input type="text" aria-label="Search items" autoComplete="off" placeholder="Search item" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value.trim().toLowerCase())} />
          </div>

          <div className="popover-wrapper">
            <button className="filter-btn" aria-haspopup="true" aria-expanded={filterOpen} onClick={(e) => { e.stopPropagation(); setFilterOpen(v => !v) }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
              <span>Filter</span>
              <svg className="select-chevron-inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
            </button>
            <div className={`popover filter-popover${filterOpen ? ' show' : ''}`} onClick={(e) => e.stopPropagation()}>
              <p className="popover-title">Category</p>
              <div className="filter-options">
                {categories.length === 0
                  ? <p className="empty-state">No categories yet.</p>
                  : categories.map(cat => (
                    <label className="filter-option" key={cat}>
                      <input type="checkbox" checked={activeCategories.has(cat)} onChange={() => toggleCategory(cat)} />
                      <span>{cat}</span>
                    </label>
                  ))}
              </div>
            </div>
          </div>

          <button className="new-btn" onClick={openAddModal}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            <span>New</span>
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <p className="stat-label">Total SKUs</p>
          <p className="stat-value">{products.length}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Low stock alerts</p>
          <p className="stat-value muted">—</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Fast moving items</p>
          <p className="stat-value muted">—</p>
        </div>
      </div>

      <div className="table-card">
        <h2>Product Records</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th className="photo-col"></th>
                <th>Product</th>
                <th>Category</th>
                <th>Branch</th>
                <th>Quantity</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && products.length === 0 ? (
                <tr><td colSpan="7" className="empty-state">Loading…</td></tr>
              ) : products.length === 0 ? (
                <tr><td colSpan="7" className="empty-state">No products yet. Click "+ New" to add one.</td></tr>
              ) : visibleProducts.length === 0 ? (
                <tr><td colSpan="7" className="empty-state">No products match your search or filter.</td></tr>
              ) : visibleProducts.map(p => {
                const status = getStatus(p)
                return (
                  <tr className="product-row" key={p.id} tabIndex={0} onKeyDown={onActivate(() => setDetailProduct(p))} onClick={() => setDetailProduct(p)}>
                    <td>{p.photo
                      ? <img className="product-thumb" src={p.photo} alt={p.name} />
                      : <div className="product-thumb-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg></div>}
                    </td>
                    <td>{p.name}</td>
                    <td>{p.category}</td>
                    <td>{p.branch || '—'}</td>
                    <td>{p.quantity}</td>
                    <td><span className={`status-pill ${status.cls}`}>{status.label}</span></td>
                    <td>
                      <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="row-action-btn edit" aria-label="Edit product" onClick={() => openEditModal(p)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z" /></svg>
                        </button>
                        <button type="button" className="row-action-btn delete" aria-label="Delete product" onClick={() => handleDelete(p)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!(modalOpen)} onClose={closeModal} label={editingId ? 'Edit product' : 'Add new product'}>
        <div className="modal product-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>{editingId ? 'Edit product' : 'Add new product'}</h2>
            <button className="modal-close" aria-label="Close" onClick={closeModal}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>

          <form className="modal-body" onSubmit={handleSubmit}>
            <div className="modal-columns">
              <div className="modal-photo-col">
                <label className="photo-upload">
                  {form.photo
                    ? <img className="photo-preview" src={form.photo} alt="Product photo preview" />
                    : <div className="photo-upload-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg></div>}
                  <input type="file" ref={fileInputRef} accept="image/*" hidden onChange={handlePhotoChange} />
                </label>
              </div>

              <div className="modal-fields">
                <div className="form-group">
                  <label className="form-label" htmlFor="src-pages-admin-inventory-f1">Product name</label>
                  <input id="src-pages-admin-inventory-f1" type="text" className="form-input" placeholder="e.g. Pet food (dog)" required
                    value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="src-pages-admin-inventory-f2">Category</label>
                  <input id="src-pages-admin-inventory-f2" type="text" className="form-input" placeholder="e.g. Food, Grooming, Medicine" required
                    value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))} />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="src-pages-admin-inventory-f3">Branch</label>
                  <div className="form-select-wrapper">
                    <select id="src-pages-admin-inventory-f3" className="form-input" required value={form.branch} onChange={(e) => setForm(f => ({ ...f, branch: e.target.value }))}>
                      <option value="" disabled hidden></option>
                      <option>Ibaan</option>
                      <option>San Jose</option>
                    </select>
                    <svg className="form-select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label" htmlFor="src-pages-admin-inventory-f4">Quantity</label>
                    <input id="src-pages-admin-inventory-f4" type="number" className="form-input" min="0" step="1" placeholder="e.g. 25" required
                      value={form.quantity} onChange={(e) => setForm(f => ({ ...f, quantity: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="src-pages-admin-inventory-f5">Reorder point</label>
                    <input id="src-pages-admin-inventory-f5" type="number" className="form-input" min="0" step="1" placeholder="e.g. 10" required
                      value={form.reorderPoint} onChange={(e) => setForm(f => ({ ...f, reorderPoint: e.target.value }))} />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label" htmlFor="src-pages-admin-inventory-f6">Delivery date</label>
                    <input id="src-pages-admin-inventory-f6" type="date" className="form-input" required
                      value={form.delivery} onChange={(e) => setForm(f => ({ ...f, delivery: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="src-pages-admin-inventory-f7">Expiration date</label>
                    <input id="src-pages-admin-inventory-f7" type="date" className="form-input" required
                      value={form.expiration} onChange={(e) => setForm(f => ({ ...f, expiration: e.target.value }))} />
                  </div>
                </div>
              </div>
            </div>

            <p className="form-hint">Status is worked out from Quantity vs. Reorder point. Delivery and expiration dates show up when you click the product, so older stock can be sold first (FIFO).</p>

            <button type="submit" className="modal-submit-btn" disabled={saving}>{editingId ? 'Save changes' : 'Add product'}</button>
          </form>
        </div>
      </Dialog>

      <Dialog open={!!(detailProduct)} onClose={() => setDetailProduct(null)} label={'Product details'}>
        {detailProduct && (
          <div className="modal detail-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close detail-modal-close" aria-label="Close" onClick={() => setDetailProduct(null)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
            <div className="detail-photo-wrap">
              {detailProduct.photo && <img className="detail-photo" src={detailProduct.photo} alt="" />}
            </div>
            <div className="detail-body">
              <div className="detail-title-row">
                <div>
                  <h2>{detailProduct.name}</h2>
                  <p className="detail-category">{detailProduct.category}</p>
                </div>
                <span className={`status-pill ${getStatus(detailProduct).cls}`}>{getStatus(detailProduct).label}</span>
              </div>
              <div className="detail-grid">
                <div><p className="kpi-label">Quantity</p><p className="kpi-value">{detailProduct.quantity}</p></div>
                <div><p className="kpi-label">Reorder point</p><p className="kpi-value">{detailProduct.reorderPoint}</p></div>
                <div><p className="kpi-label">Delivery date</p><p className="kpi-value">{formatDate(detailProduct.delivery)}</p></div>
                <div><p className="kpi-label">Expiration date</p><p className="kpi-value">{formatDate(detailProduct.expiration)}</p></div>
              </div>
            </div>
          </div>
        )}
      </Dialog>
    </main>
  )
}
