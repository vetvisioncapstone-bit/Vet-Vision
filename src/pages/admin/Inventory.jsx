import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useInventory } from '../../hooks/useInventory'
import { useApprovalRequests } from '../../hooks/useRequests'
import { useAnalytics } from '../../hooks/useAnalytics'
import { useToast } from '../../components/shared/Toast'
import { errorMessage } from '../../api/client'
import '../../styles/admin/inventory.css'
import { formatDate, formatPrice } from '../../utils/format'

import Dialog from '../../components/shared/Dialog'
import Pagination from '../../components/shared/Pagination'
import SearchPicker from '../../components/shared/SearchPicker'
import CategoryFilter from '../../components/shared/CategoryFilter'
import ReceiveStockDialog from '../../components/shared/ReceiveStockDialog'
import { useConfirm } from '../../components/shared/ConfirmDialog'
import { QuantityChangeHint, RowActions } from '../../components/shared/InventoryActions'
import { compareGroups, getStatus, groupByProduct, groupNeedsAction, needsAction } from '../../utils/stockOrder'

const PAGE_SIZE = 25 // products per page

const BRANCHES = ['Ibaan', 'San Jose']

// One branch's stock inside a product row: the count against its reorder point, a status when it is not OK, and a
// Receive button for a delivery at that branch. Solid only where the branch is low or out; elsewhere a quiet text
// button, so the few branches that need stock are the only loud thing on the page.
function BranchStock({ row, onReceive }) {
  const status = getStatus(row)
  const urgent = status.rank > 0 && status.rank < 3
  return (
    <div className="branch-stock">
      <div className="branch-count">
        <span><b>{row.quantity}</b> <small title="The item shows as Low stock at or below this count">· reorder at {row.reorderPoint}</small></span>
        {status.rank < 4 && <span className={`status-pill ${status.cls}`}>{status.label}</span>}
      </div>
      {/* A quiet Receive is a mouse shortcut: keyboard users reach the same action in the product's popup, which keeps
          the Tab order to the names and the branches that need stock. */}
      <button type="button" className={`act-btn act-receive ${urgent ? 'act-primary' : 'act-quiet'}`} tabIndex={urgent ? undefined : -1}
        onClick={(e) => { e.stopPropagation(); onReceive(row) }}
        title={`A delivery arrived at ${row.branch}: add it to the count`} aria-label={`Receive a delivery of ${row.name} at ${row.branch}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 8 12 3 3 8v8l9 5 9-5Z" /><path d="M12 13v8" /><path d="m3 8 9 5 9-5" /></svg>
        <span>Receive</span>
      </button>
    </div>
  )
}

function SortHeader({ id, label, sort, onSort }) {
  const active = sort.key === id
  return (
    <th aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className={`sort-btn${active ? ' active' : ''}`} onClick={() => onSort(id)}
        title={id === 'name' ? 'Sort by product name' : `Sort by the count at ${label}`}>
        {label}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {active ? <polyline points={sort.dir === 'asc' ? '6 9 12 15 18 9' : '6 15 12 9 18 15'} /> : <><polyline points="8 10 12 6 16 10" /><polyline points="8 14 12 18 16 14" /></>}
        </svg>
      </button>
    </th>
  )
}

const EMPTY_FORM = {
  name: '', category: '', branch: '', quantity: '', reorderPoint: '',
  delivery: '', expiration: '', photo: null, unitPrice: '', unitCost: ''
}

export default function Inventory() {
  const [ask, confirmBox] = useConfirm() // styled "are you sure?" box for deletes
  const { items: products, loading, error: loadError, reload, create, update, remove } = useInventory()
  const movement = useAnalytics('inventory')
  const [branch, setBranch] = useState('') // '' = both branches
  const [quick, setQuick] = useState('') // '' | 'low' | 'fast': set by clicking the Low stock / Fast moving cards
  const inBranch = useMemo(() => products.filter((p) => !branch || p.branch === branch), [products, branch])
  // Fast-moving is computed per branch and product by the analytics (top third of its category by units sold).
  const fast = useMemo(() => new Set((movement.data?.items || []).filter((i) => i.movement === 'fast')
    .map((i) => `${i.productId}|${i.branch}`)), [movement.data])
  const isLow = (p) => p.quantity <= p.reorderPoint
  const isFast = (p) => fast.has(`${p.productId}|${p.branch}`)
  const productCount = (test) => new Set(inBranch.filter(test).map((p) => p.productId)).size
  const lowStockCount = productCount(isLow)
  const fastCount = movement.data ? productCount(isFast) : movement.error ? '—' : null
  const showToast = useToast()
  const [saving, setSaving] = useState(false)

  const [searchTerm, setSearchTerm] = useState('')
  const [activeCategories, setActiveCategories] = useState(new Set())

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const fileInputRef = useRef(null)

  const [detailId, setDetailId] = useState(null) // productId whose popup is open
  const [searchParams, setSearchParams] = useSearchParams()
  const linkedItem = searchParams.get('item') // from Staff requests: open that product once it has loaded
  useEffect(() => { if (searchParams.get('show') === 'low') setQuick('low') }, [searchParams]) // from the dashboard card
  const [receiving, setReceiving] = useState(null) // product whose delivery is being entered
  const [restockRequest, setRestockRequest] = useState(null) // staff restock request this delivery answers
  const { dismiss } = useApprovalRequests()
  useEffect(() => {
    const found = linkedItem && products.find((p) => p.id === linkedItem)
    if (!found) return
    if (searchParams.get('receive')) { // a staff restock request: straight to the delivery form for that branch
      setReceiving(found)
      setRestockRequest(Number(searchParams.get('request')) || null)
    } else {
      setDetailId(found.productId)
    }
    setSearchParams({}, { replace: true }) // opened once; a refresh or Back does not reopen it
  }, [linkedItem, products]) // eslint-disable-line react-hooks/exhaustive-deps
  async function onReceived() {
    if (!restockRequest) return
    try {
      await dismiss(restockRequest)
      showToast('The staff restock request is marked done.')
    } catch { /* the delivery is saved; the request can still be closed from Staff requests */ }
    setRestockRequest(null)
  }
  const [guideOpen, setGuideOpen] = useState(() => {
    try { return window.matchMedia('(min-width: 601px)').matches } catch { return true }
  })

  // Products per category (each product once, whatever its branches), for the Category filter.
  const categoryCounts = useMemo(() => groupByProduct(inBranch).reduce((n, g) => ({ ...n, [g.category]: (n[g.category] || 0) + 1 }), {}), [inBranch])
  const [sort, setSort] = useState({ key: 'status', dir: 'asc' }) // most urgent first

  // One row per product with its branches side by side. A product shows when any of its branches matches the search,
  // category or card filter; its row still shows every branch.
  const shownBranches = branch ? [branch] : BRANCHES
  const allGroups = useMemo(() => groupByProduct(inBranch), [inBranch])
  const visibleProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    const matching = new Set(inBranch
      .filter(p => {
        const matchesSearch = !term || p.name.toLowerCase().includes(term) || p.category.toLowerCase().includes(term)
        const matchesCategory = activeCategories.size === 0 || activeCategories.has(p.category)
        const matchesQuick = !quick || (quick === 'low' ? isLow(p) : isFast(p))
        return matchesSearch && matchesCategory && matchesQuick
      })
      .map((p) => p.productId))
    return allGroups.filter((g) => matching.has(g.productId)).sort(compareGroups(sort.key, sort.dir))
  }, [inBranch, allGroups, searchTerm, activeCategories, quick, fast, sort])
  const attentionCount = useMemo(() => visibleProducts.filter(groupNeedsAction).length, [visibleProducts])
  const detailGroup = allGroups.find((g) => g.productId === detailId) || null
  const filtered = Boolean(quick || searchTerm.trim() || activeCategories.size)
  // The search box is also a dropdown of every product (same as the staff page and Forecasting); picking one shows
  // it in the table and opens it with both branches.
  const pickerItems = useMemo(() => allGroups.map((g) => ({ id: g.productId, name: g.name, category: g.category, stock: g.stock })), [allGroups])
  const pickerMeta = (item) => shownBranches.map((b) => (item.stock[b] ? `${b} ${item.stock[b].quantity}` : null)).filter(Boolean).join(' · ')
  const pickProduct = (item) => { setSearchTerm(item.name); setDetailId(item.id) }
  const showAll = () => { setQuick(''); setSearchTerm(''); setActiveCategories(new Set()) }
  // Most urgent first: the rows that need something done lead, under their own heading, then everything that is OK.
  const byUrgency = sort.key === 'status' && sort.dir === 'asc'
  const onSort = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))

  // A page of the filtered list at a time; a new search, filter or order starts again at page 1.
  const [page, setPage] = useState(1)
  useEffect(() => { setPage(1) }, [searchTerm, activeCategories, branch, quick, sort])
  const pageCount = Math.max(1, Math.ceil(visibleProducts.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageProducts = visibleProducts.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

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
      photo: product.photo || null,
      unitPrice: product.unitPrice ?? '',
      unitCost: product.unitCost ?? ''
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
      branch: form.branch,
      quantity: Number(form.quantity),
      reorderPoint: Number(form.reorderPoint),
      delivery: form.delivery || null, // blank: no date (e.g. items that do not expire)
      expiration: form.expiration || null,
      photo: form.photo,
      // Blank means "no price yet"; the Sales page and consultations pre-fill from these.
      unitPrice: form.unitPrice === '' ? null : Number(form.unitPrice),
      unitCost: form.unitCost === '' ? null : Number(form.unitCost)
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
    if (!(await ask({
      title: 'Delete this product?',
      message: <p><strong>{product.name}</strong> will be removed from {product.branch || 'the'} inventory, with its {product.quantity} on hand. Past sales stay in the reports. This cannot be undone.</p>,
      confirmLabel: 'Delete product'
    }))) return
    setDetailId(null)
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
        <h1>Inventory</h1>
        <div className="header-filters">
          <SearchPicker id="admin-products" className="admin-search" items={pickerItems} value={searchTerm} onChange={setSearchTerm}
            onPick={pickProduct} meta={pickerMeta} currentId={detailId} noun="products"
            label="Search or pick a product" placeholder="Search or pick a product" />

          <div className="select-wrapper">
            <select value={branch} onChange={(e) => setBranch(e.target.value)} aria-label="Branch">
              <option value="">All branches</option>
              <option>Ibaan</option>
              <option>San Jose</option>
            </select>
            <svg className="select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
          </div>
          <CategoryFilter counts={categoryCounts} selected={activeCategories} onChange={setActiveCategories} />

          <button className="new-btn" onClick={openAddModal}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            <span>New product</span>
          </button>
        </div>
      </div>

      <div className="stats-grid inv-stats">
        <button type="button" className="stat-card stat-card-btn" disabled={!filtered} onClick={showAll}>
          <span className="stat-label">Products tracked</span>
          <span className="stat-value">{allGroups.length}</span>
          {filtered && <span className="stat-sub">Click to clear the filters</span>}
        </button>
        {/* Clicking a card shows only those items in the table below; clicking it again shows everything. */}
        <button type="button" className={`stat-card stat-card-btn${lowStockCount ? ' alert' : ''}${quick === 'low' ? ' selected' : ''}`}
          aria-pressed={quick === 'low'} onClick={() => setQuick((q) => (q === 'low' ? '' : 'low'))}>
          <span className="stat-label">Low stock alerts</span>
          <span className="stat-value">{loading && !products.length ? '…' : lowStockCount}</span>
          <span className="stat-sub">{quick === 'low' ? 'Showing these below · click to show all' : 'Click to show them'}</span>
        </button>
        <button type="button" className={`stat-card stat-card-btn${quick === 'fast' ? ' selected' : ''}`}
          aria-pressed={quick === 'fast'} disabled={!movement.data} onClick={() => setQuick((q) => (q === 'fast' ? '' : 'fast'))}>
          <span className="stat-label">Fast moving items</span>
          <span className="stat-value">{fastCount === null ? '…' : fastCount}</span>
          <span className="stat-sub">{quick === 'fast' ? 'Showing these below · click to show all' : 'Click to show them'}</span>
        </button>
      </div>

      <div className="table-card">
        <h2>
          Products{quick && <span className="records-filter"> · {quick === 'low' ? 'Low stock' : 'Fast moving'}
            <button type="button" className="link-btn" onClick={() => setQuick('')}>Show all</button></span>}
        </h2>
        {!byUrgency && <p className="records-note"><button type="button" className="link-btn" onClick={() => setSort({ key: 'status', dir: 'asc' })}>Show most urgent first</button></p>}
        {/* Open on wide screens; on a phone it folds away so the products come first. */}
        <details className="guide-fold" open={guideOpen} onToggle={(e) => setGuideOpen(e.currentTarget.open)}>
          <summary>How to use this table</summary>
          <ul className="actions-guide">
            <li><b>Receive</b> in a branch's column when a delivery arrives there: it adds to that branch's count.</li>
            <li>Click a product to see both branches, <b>Edit</b> its details or count, or <b>Delete</b> it from a branch.</li>
          </ul>
        </details>
        <div className="table-scroll">
          <table className="stock-table">
            <thead>
              <tr>
                <SortHeader id="name" label="Product" sort={sort} onSort={onSort} />
                {shownBranches.map((b) => <SortHeader key={b} id={b} label={b} sort={sort} onSort={onSort} />)}
              </tr>
            </thead>
            <tbody>
              {loadError && products.length === 0 ? (
                <tr><td colSpan={1 + shownBranches.length} className="empty-state">
                  Could not load the inventory. Check the connection, then <button type="button" className="link-btn" onClick={reload}>try again</button>.
                </td></tr>
              ) : loading && products.length === 0 ? (
                <tr><td colSpan={1 + shownBranches.length} className="empty-state">Loading…</td></tr>
              ) : products.length === 0 ? (
                <tr><td colSpan={1 + shownBranches.length} className="empty-state">No products yet. Click "+ New" to add one.</td></tr>
              ) : visibleProducts.length === 0 ? (
                <tr><td colSpan={1 + shownBranches.length} className="empty-state">No products match your search or filter.</td></tr>
              ) : pageProducts.map((g, i) => {
                // Under the default order, a heading row marks where "needs action" starts and where it ends.
                const groupStart = byUrgency && (i === 0 || groupNeedsAction(pageProducts[i - 1]) !== groupNeedsAction(g))
                return (
                  <React.Fragment key={g.productId}>
                  {groupStart && (
                    <tr className="group-row">
                      <th colSpan={1 + shownBranches.length} scope="colgroup">
                        {groupNeedsAction(g)
                          ? <>Needs action <span>{attentionCount} product{attentionCount === 1 ? '' : 's'}, most urgent first</span></>
                          : <>In stock <span>{visibleProducts.length - attentionCount} products</span></>}
                      </th>
                    </tr>
                  )}
                  {/* The whole row opens the product for a mouse; the name is the one keyboard stop for it. */}
                  <tr className="product-row" onClick={() => setDetailId(g.productId)}>
                    <td className="product-cell">
                      <button type="button" className="product-open" aria-label={`${g.name}: open both branches`}>{g.name}</button>
                      <small className="cell-sub">{g.category.toLowerCase()}</small>
                    </td>
                    {shownBranches.map((b) => (
                      <td key={b} className="branch-cell" data-branch={b}>
                        {g.stock[b] ? <BranchStock row={g.stock[b]} onReceive={setReceiving} /> : <span className="not-stocked">Not stocked</span>}
                      </td>
                    ))}
                  </tr>
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
        <Pagination page={currentPage} pageSize={PAGE_SIZE} total={visibleProducts.length} onPage={setPage} />
      </div>

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
                  <label className="form-label" htmlFor="src-pages-admin-inventory-f1">Product name</label>
                  <input id="src-pages-admin-inventory-f1" type="text" className="form-input" placeholder="e.g. Pet food (dog)" required
                    value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>

                <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="src-pages-admin-inventory-f2">Category</label>
                  <input id="src-pages-admin-inventory-f2" type="text" className="form-input" placeholder="e.g. Food, Grooming, Medicine" required
                    value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))} />
                </div>

                {editingId ? (
                <div className="form-group">
                  <p className="form-label">Branch</p>
                  <p className="form-static">{form.branch}<small>The branch cannot change. To stock it elsewhere, add it there with New product.</small></p>
                </div>
                ) : (
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
                )}
                </div>
                {editingId && <p className="field-hint">The name and category are shared by both branches; changing them here changes them at both.</p>}

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label" htmlFor="src-pages-admin-inventory-f4">Quantity</label>
                    <input id="src-pages-admin-inventory-f4" type="number" className="form-input" min="0" max="99999999" step="1" placeholder="e.g. 25" required
                      value={form.quantity} onChange={(e) => setForm(f => ({ ...f, quantity: e.target.value }))} />
                    {editingId && <QuantityChangeHint before={editingProduct?.quantity} after={form.quantity} />}
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="src-pages-admin-inventory-f5">Reorder point</label>
                    <input id="src-pages-admin-inventory-f5" type="number" className="form-input" min="0" max="99999999" step="1" placeholder="e.g. 10" required
                      value={form.reorderPoint} onChange={(e) => setForm(f => ({ ...f, reorderPoint: e.target.value }))} />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label" htmlFor="inventoryPrice">Selling price (₱){editingId && form.branch ? ` at ${form.branch}` : ''}</label>
                    <input id="inventoryPrice" type="number" className="form-input" min="0" max="9999999999" step="0.01" placeholder="e.g. 350"
                      value={form.unitPrice} onChange={(e) => setForm(f => ({ ...f, unitPrice: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="inventoryCost">Cost (₱){editingId && form.branch ? ` at ${form.branch}` : ''}</label>
                    <input id="inventoryCost" type="number" className="form-input" min="0" max="9999999999" step="0.01" placeholder="what the clinic pays"
                      value={form.unitCost} onChange={(e) => setForm(f => ({ ...f, unitCost: e.target.value }))} />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label" htmlFor="src-pages-admin-inventory-f6">{editingId ? 'Last delivery' : 'Delivery date'} <span className="optional">(optional)</span></label>
                    <input id="src-pages-admin-inventory-f6" type="date" className="form-input"
                      value={form.delivery} onChange={(e) => setForm(f => ({ ...f, delivery: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="src-pages-admin-inventory-f7">{editingId ? 'Expires on' : 'Expiration date'} <span className="optional">(optional)</span></label>
                    <input id="src-pages-admin-inventory-f7" type="date" className="form-input"
                      value={form.expiration} onChange={(e) => setForm(f => ({ ...f, expiration: e.target.value }))} />
                  </div>
                </div>
                {editingId && <p className="field-hint">These change by themselves when you <b>Receive</b> a delivery. Change them here only to correct a mistake.</p>}
              </div>
            </div>

            <p className="form-hint">The status is worked out from the quantity and the reorder point: at or below the reorder point, the item shows as Low stock. Delivery and expiration dates show when you click the product, so older stock is sold first.</p>

            <button type="submit" className="modal-submit-btn" disabled={saving}>{editingId ? 'Save changes' : 'Add product'}</button>
          </form>
        </div>
      </Dialog>

      <Dialog open={!!detailGroup} onClose={() => setDetailId(null)} label="Product details">
        {detailGroup && (
          <div className="modal detail-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close detail-modal-close" aria-label="Close" onClick={() => setDetailId(null)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
            <div className="detail-photo-wrap">
              {detailGroup.photo && <img className="detail-photo" src={detailGroup.photo} alt="" />}
            </div>
            <div className="detail-body">
              <div className="detail-title-row">
                <div>
                  <h2>{detailGroup.name}</h2>
                  <p className="detail-category">{detailGroup.category}</p>
                </div>
              </div>
              {shownBranches.filter((b) => detailGroup.stock[b]).map((b) => {
                const row = detailGroup.stock[b]
                const status = getStatus(row)
                return (
                  <section className="detail-branch" key={b} aria-label={b}>
                    <div className="detail-branch-head">
                      <h3>{b}</h3>
                      <span className={`status-pill ${status.cls}`}>{status.label}</span>
                    </div>
                    <div className="detail-grid">
                      <div><p className="kpi-label">Quantity</p><p className="kpi-value">{row.quantity}</p></div>
                      <div><p className="kpi-label">Reorder point</p><p className="kpi-value">{row.reorderPoint}</p></div>
                      <div><p className="kpi-label">Selling price</p><p className="kpi-value">{row.unitPrice == null ? 'Not set' : formatPrice(row.unitPrice)}</p></div>
                      <div><p className="kpi-label">Cost</p><p className="kpi-value">{row.unitCost == null ? 'Not set' : formatPrice(row.unitCost)}</p></div>
                      <div><p className="kpi-label">Last delivery</p><p className="kpi-value">{formatDate(row.delivery)}</p></div>
                      <div><p className="kpi-label">Expires on</p><p className="kpi-value">{formatDate(row.expiration)}</p></div>
                    </div>
                    <RowActions product={row} needsStock={needsAction(row)}
                      onReceive={(r) => { setDetailId(null); setReceiving(r) }}
                      onEdit={(r) => { setDetailId(null); openEditModal(r) }}
                      onDelete={handleDelete} />
                  </section>
                )
              })}
              {shownBranches.filter((b) => !detailGroup.stock[b]).map((b) => <p key={b} className="detail-not-stocked">Not stocked at {b}.</p>)}
            </div>
          </div>
        )}
      </Dialog>

      <ReceiveStockDialog product={receiving} onReceived={onReceived}
        note={restockRequest ? 'From a staff restock request: saving this delivery marks the request done.' : null}
        onClose={() => { setReceiving(null); setRestockRequest(null) }} />
      {confirmBox}
    </main>
  )
}
