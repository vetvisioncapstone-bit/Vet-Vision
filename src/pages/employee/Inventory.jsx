import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useInventory } from '../../hooks/useInventory'
import { useToast } from '../../components/shared/Toast'
import { useEmployeeContext } from '../../hooks/useEmployeeContext'
import { useApprovalRequests } from '../../hooks/useRequests'
import { errorMessage } from '../../api/client'
import '../../styles/admin/inventory.css'
import '../../styles/employee/employee-inventory.css'

import Dialog from '../../components/shared/Dialog'
import Pagination from '../../components/shared/Pagination'
import SearchPicker from '../../components/shared/SearchPicker'
import CategoryFilter from '../../components/shared/CategoryFilter'
import Clock from '../../components/shared/Clock'
import ReceiveStockDialog from '../../components/shared/ReceiveStockDialog'
import { useConfirm } from '../../components/shared/ConfirmDialog'
import { ActionsGuide, RowActions } from '../../components/shared/InventoryActions'
import { getStatus, needsAction, urgency } from '../../utils/stockOrder'
// ==================== HELPERS ====================
// Rows come from the API, already scoped to this employee's branch by the server.

const PAGE_SIZE = 25 // products per page

const EMPTY_FORM = {
  name: '', category: '', quantity: '', reorderPoint: '', delivery: '', expiration: '', photo: null
}

export default function Inventory() {
  const [ask, confirmBox] = useConfirm() // styled "are you sure?" box for deletes
  const { items: products, loading, create, update } = useInventory()
  const [receiving, setReceiving] = useState(null) // product whose delivery is being entered
  const [saving, setSaving] = useState(false)
  const showToast = useToast()
  const { branch, can } = useEmployeeContext()
  const { raise } = useApprovalRequests()

  const [searchTerm, setSearchTerm] = useState('')
  const [activeCategories, setActiveCategories] = useState(new Set())

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const fileInputRef = useRef(null)

  const branchProducts = products
  const visibleProducts = useMemo(() => {
    // Most urgent first, the same order the admin sees: expired, out of stock, low, expiring soon, then OK.
    const term = searchTerm.trim().toLowerCase()
    return branchProducts.filter(p =>
      (!term || p.name.toLowerCase().includes(term) || p.category.toLowerCase().includes(term))
      && (activeCategories.size === 0 || activeCategories.has(p.category))
    ).sort((a, b) => urgency(a, b) || a.name.localeCompare(b.name))
  }, [branchProducts, searchTerm, activeCategories])
  const categoryCounts = useMemo(() => branchProducts.reduce((n, p) => ({ ...n, [p.category]: (n[p.category] || 0) + 1 }), {}), [branchProducts])
  const attentionCount = useMemo(() => visibleProducts.filter(needsAction).length, [visibleProducts])

  // A page of the filtered list at a time; a new search or filter starts again at page 1.
  const [page, setPage] = useState(1)
  useEffect(() => { setPage(1) }, [searchTerm, activeCategories])
  const pageCount = Math.max(1, Math.ceil(visibleProducts.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageProducts = visibleProducts.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const statTotalItems = branchProducts.length
  const statLowStock = branchProducts.filter((p) => getStatus(p).rank === 2).length
  const statOutOfStock = branchProducts.filter((p) => getStatus(p).rank === 1).length

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

  const editingProduct = products.find((p) => p.id === editingId)

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
      branch, // ignored by the server; staff are forced to their own branch
      // Staff never set the count: a new product starts at 0 and stock arrives through Receive (admin corrects counts).
      quantity: editingId ? Number(editingProduct?.quantity ?? 0) : 0,
      reorderPoint: Number(form.reorderPoint),
      delivery: form.delivery || null, // blank: no date (e.g. items that do not expire)
      expiration: form.expiration || null,
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
    if (!(await ask({ title: 'Ask to delete this product?', message: <p>The admin gets a request to delete <strong>{product.name}</strong>. Nothing is deleted until they approve.</p>, confirmLabel: 'Send request' }))) return
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
    <main id="main-content" tabIndex={-1} className="content">
      <div className="content-header">
        <h1>Inventory · {branch}</h1>
        <Clock />
      </div>

      <div className="scope-banner">
        <p>You are viewing inventory for your branch only.</p>
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
          <h2>Products</h2>
          <div className="header-filters">
            <SearchPicker id="staff-products" className="staff-search" items={branchProducts} value={searchTerm} onChange={setSearchTerm}
              onPick={(p) => setSearchTerm(p.name)} noun="products" meta={(p) => `${p.quantity} in stock`}
              label="Search or pick a product" placeholder="Search or pick a product" />
            <CategoryFilter counts={categoryCounts} selected={activeCategories} onChange={setActiveCategories} />
            {can('inventory') && (
              <button className="new-btn" onClick={openAddModal}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                <span>New product</span>
              </button>
            )}
          </div>
        </div>
        <ActionsGuide />
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Stock</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && branchProducts.length === 0 ? (
                <tr><td colSpan="4" className="empty-state">Loading…</td></tr>
              ) : branchProducts.length === 0 ? (
                <tr><td colSpan="4" className="empty-state">No products for this branch yet. Click "New product" to add one.</td></tr>
              ) : visibleProducts.length === 0 ? (
                <tr><td colSpan="4" className="empty-state">No products match your search or category.</td></tr>
              ) : pageProducts.map((p, i) => {
                const status = getStatus(p)
                // A heading row marks where "needs action" starts and where it ends, as on the admin page.
                const groupStart = i === 0 || needsAction(pageProducts[i - 1]) !== needsAction(p)
                return (
                  <React.Fragment key={p.id}>
                  {groupStart && (
                    <tr className="group-row">
                      <th colSpan="4" scope="colgroup">
                        {needsAction(p)
                          ? <>Needs action <span>{attentionCount} product{attentionCount === 1 ? '' : 's'}, most urgent first</span></>
                          : <>In stock <span>{visibleProducts.length - attentionCount} products</span></>}
                      </th>
                    </tr>
                  )}
                  <tr>
                    <td className="product-cell">{p.name}<small className="cell-sub">{p.category}</small></td>
                    <td><span className="branch-count"><span><b>{p.quantity}</b> <small>· reorder at {p.reorderPoint}</small></span></span></td>
                    <td><span className={`status-pill ${status.cls}`}>{status.label}</span></td>
                    <td>
                      <RowActions product={p} needsStock={status.rank > 0 && status.rank < 3} onRequest={handleRestockRequest}
                        onReceive={can('inventory') ? setReceiving : undefined} onEdit={can('inventory') ? openEditModal : undefined}
                        onDelete={handleDeleteRequest} deleteLabel="Ask to delete" />
                    </td>
                  </tr>
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
        <Pagination page={currentPage} pageSize={PAGE_SIZE} total={visibleProducts.length} onPage={setPage} />
      </div>

      {/* Add / Edit product modal */}
      <Dialog open={!!modalOpen} onClose={closeModal} label={editingId ? 'Edit product' : 'Add new product'}>
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
                  <input type="file" ref={fileInputRef} accept="image/*" className="sr-only" aria-label="Product photo" onChange={handlePhotoChange} />
                </label>
              </div>

              <div className="modal-fields">
                <div className="form-group">
                  <label className="form-label" htmlFor="src-pages-employee-inventory-f1">Product name</label>
                  <input id="src-pages-employee-inventory-f1" type="text" className="form-input" placeholder="e.g. Pet food (dog)" required
                    value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="src-pages-employee-inventory-f2">Category</label>
                  <input id="src-pages-employee-inventory-f2" type="text" className="form-input" placeholder="e.g. Food, Grooming, Medicine" required
                    value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))} />
                </div>

                <div className="form-group">
                  <span className="form-label">Branch</span>
                  <p className="form-static">{branch}<small>Staff add products to their own branch.</small></p>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <span className="form-label">Quantity</span>
                    <p className="form-static">{editingId ? (editingProduct?.quantity ?? 0) : 0}
                      <small>{editingId ? 'Only the admin corrects a count. Deliveries go through Receive.' : 'Starts at 0. Use Receive when the delivery arrives.'}</small>
                    </p>
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="src-pages-employee-inventory-f5">Reorder point</label>
                    <input id="src-pages-employee-inventory-f5" type="number" className="form-input" min="0" step="1" placeholder="e.g. 10" required
                      value={form.reorderPoint} onChange={(e) => setForm(f => ({ ...f, reorderPoint: e.target.value }))} />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label" htmlFor="src-pages-employee-inventory-f6">{editingId ? 'Last delivery' : 'Delivery date'} <span className="optional">(optional)</span></label>
                    <input id="src-pages-employee-inventory-f6" type="date" className="form-input"
                      value={form.delivery} onChange={(e) => setForm(f => ({ ...f, delivery: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="src-pages-employee-inventory-f7">{editingId ? 'Expires on' : 'Expiration date'} <span className="optional">(optional)</span></label>
                    <input id="src-pages-employee-inventory-f7" type="date" className="form-input"
                      value={form.expiration} onChange={(e) => setForm(f => ({ ...f, expiration: e.target.value }))} />
                  </div>
                </div>
                {editingId && <p className="field-hint">These change by themselves when you <b>Receive</b> a delivery. Change them here only to correct a mistake.</p>}
              </div>
            </div>

            <p className="form-hint">The status is worked out from the quantity and the reorder point: at or below the reorder point, the item shows as Low stock. Deleting a product needs the admin's approval: use <b>Ask to delete</b>.</p>

            <button type="submit" className="modal-submit-btn" disabled={saving}>{editingId ? 'Save changes' : 'Add product'}</button>
          </form>
        </div>
      </Dialog>
      <ReceiveStockDialog product={receiving} onClose={() => setReceiving(null)} />
      {confirmBox}
    </main>
  )
}
