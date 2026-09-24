import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useInventory } from '../../hooks/useInventory'
import { useToast } from '../../components/shared/Toast'
import { useEmployeeContext } from '../../hooks/useEmployeeContext'
import { useApprovalRequests } from '../../hooks/useRequests'
import { errorMessage } from '../../api/client'
import '../../styles/admin/inventory.css'
import '../../styles/employee/employee-inventory.css'

// ==================== HELPERS ====================
// Rows come from the API, already scoped to this employee's branch by the server.

function getStatus(product) {
  if (product.quantity <= 0) return { label: 'Out of stock', cls: 'status-out-of-stock' }
  if (product.quantity <= product.reorderPoint) return { label: 'Low stock', cls: 'status-low-stock' }
  return { label: 'Ok', cls: 'status-ok' }
}

// There's no real sales-velocity tracking in this prototype yet (Sales
// analytics / Forecasting are still stubs) - this is a simple stand-in
// heuristic based on how close a product is to its reorder point, not an
// actual measured turnover rate. Ported as-is from employee-inventory.js.
function getMovementLabel(product) {
  return product.quantity <= product.reorderPoint * 2 ? 'Fast' : 'Slow'
}

const EMPTY_FORM = {
  name: '', category: '', quantity: '', reorderPoint: '', delivery: '', expiration: '', photo: null
}

export default function Inventory() {
  const { items: products, loading, create, update } = useInventory()
  const [saving, setSaving] = useState(false)
  const showToast = useToast()
  const { branch } = useEmployeeContext()
  const { raise } = useApprovalRequests()

  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(id)
  }, [])

  const [searchTerm, setSearchTerm] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const fileInputRef = useRef(null)

  const branchProducts = products
  const visibleProducts = useMemo(() => {
    return branchProducts.filter(p =>
      !searchTerm || p.name.toLowerCase().includes(searchTerm) || p.category.toLowerCase().includes(searchTerm)
    )
  }, [branchProducts, searchTerm])

  const statTotalItems = branchProducts.length
  let statLowStock = 0
  let statOutOfStock = 0
  for (const p of branchProducts) {
    const label = getStatus(p).label
    if (label === 'Low stock') statLowStock++
    else if (label === 'Out of stock') statOutOfStock++
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

  // Escape closes the modal, same as the original's document keydown listener.
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') closeModal()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

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
      branch, // ignored by the server; staff are forced to their own branch
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
        showToast(`"${productData.name}" was added.`)
      }
      closeModal()
    } catch (err) {
      showToast(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteRequest(product) {
    if (!confirm(`Send a request to the admin to delete "${product.name}"?`)) return
    try {
      await raise({ type: 'inventory-product', targetId: product.id, label: product.name })
      showToast(`Delete request for "${product.name}" sent to the admin.`)
    } catch (err) {
      showToast(errorMessage(err))
    }
  }

  async function handleRestockRequest(product) {
    try {
      await raise({ type: 'restock', targetId: product.id, label: product.name })
      showToast(`Restock request for "${product.name}" sent to the admin.`)
    } catch (err) {
      showToast(errorMessage(err))
    }
  }

  return (
    <main className="content">
      <div className="content-header">
        <h1>My Branch - {branch}</h1>
        <div className="employee-datetime">
          <p>{now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
          <p>{now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</p>
        </div>
      </div>

      <div className="scope-banner">
        <p>You are viewing inventory for your branch only. To request a restock, click the button beside an item — this will notify the admin.</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <p className="stat-label">Total items</p>
          <p className="stat-value">{statTotalItems}</p>
        </div>
        <div className="stat-card accent-warn">
          <p className="stat-label">Low stock items</p>
          <p className="stat-value">{statLowStock}</p>
          <p className="stat-change">Needs attention</p>
        </div>
        <div className="stat-card alert">
          <p className="stat-label">Out of stock</p>
          <p className="stat-value">{statOutOfStock}</p>
          <p className="stat-change">Needs attention</p>
        </div>
      </div>

      <div className="table-card">
        <div className="table-card-header">
          <h2>Product Records</h2>
          <div className="header-filters">
            <div className="search-wrapper">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              <input type="text" placeholder="search product..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value.trim().toLowerCase())} />
            </div>
            <button className="new-btn" onClick={openAddModal}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              <span>New</span>
            </button>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Stock</th>
                <th>Reorder pt.</th>
                <th>Movement</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && branchProducts.length === 0 ? (
                <tr><td colSpan="6" className="empty-state">Loading…</td></tr>
              ) : branchProducts.length === 0 ? (
                <tr><td colSpan="6" className="empty-state">No products for this branch yet. Click "+ New" to add one.</td></tr>
              ) : visibleProducts.length === 0 ? (
                <tr><td colSpan="6" className="empty-state">No products match your search.</td></tr>
              ) : visibleProducts.map(p => {
                const status = getStatus(p)
                const movement = getMovementLabel(p)
                return (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{p.quantity} pcs</td>
                    <td>{p.reorderPoint}pcs</td>
                    <td><span className={`movement-pill movement-${movement.toLowerCase()}`}>{movement}</span></td>
                    <td><span className={`status-pill ${status.cls}`}>{status.label}</span></td>
                    <td>
                      <div className="employee-row-actions">
                        <button type="button" className="restock-btn" onClick={() => handleRestockRequest(p)}>Request Stock</button>
                        <button type="button" className="row-action-btn edit" aria-label="Edit product" onClick={() => openEditModal(p)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z" /></svg>
                        </button>
                        <button type="button" className="row-action-btn delete" aria-label="Request deletion" onClick={() => handleDeleteRequest(p)}>
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

      {/* Add / Edit product modal */}
      <div className={`modal-overlay${modalOpen ? ' show' : ''}`} onClick={closeModal}>
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
                  <label className="form-label">Product name</label>
                  <input type="text" className="form-input" placeholder="e.g. Pet food (dog)" required
                    value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>

                <div className="form-group">
                  <label className="form-label">Category</label>
                  <input type="text" className="form-input" placeholder="e.g. Food, Grooming, Medicine" required
                    value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))} />
                </div>

                <div className="form-group">
                  <label className="form-label">Branch</label>
                  <input type="text" className="form-input" value={branch} disabled />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Quantity</label>
                    <input type="number" className="form-input" min="0" step="1" placeholder="e.g. 25" required
                      value={form.quantity} onChange={(e) => setForm(f => ({ ...f, quantity: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Reorder point</label>
                    <input type="number" className="form-input" min="0" step="1" placeholder="e.g. 10" required
                      value={form.reorderPoint} onChange={(e) => setForm(f => ({ ...f, reorderPoint: e.target.value }))} />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Delivery date</label>
                    <input type="date" className="form-input" required
                      value={form.delivery} onChange={(e) => setForm(f => ({ ...f, delivery: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Expiration date</label>
                    <input type="date" className="form-input" required
                      value={form.expiration} onChange={(e) => setForm(f => ({ ...f, expiration: e.target.value }))} />
                  </div>
                </div>
              </div>
            </div>

            <p className="form-hint">Status is worked out from Quantity vs. Reorder point. Deleting a product needs the admin's approval - use the trash icon to send a request.</p>

            <button type="submit" className="modal-submit-btn" disabled={saving}>{editingId ? 'Save changes' : 'Add product'}</button>
          </form>
        </div>
      </div>
    </main>
  )
}
