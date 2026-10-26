import React, { useEffect, useMemo, useState } from 'react'
import { useInventory } from '../../hooks/useInventory'
import { useSales } from '../../hooks/useSales'
import { useEmployeeContext } from '../../hooks/useEmployeeContext'
import { useToast } from '../../components/shared/Toast'
import { errorMessage } from '../../api/client'
import '../../styles/employee/employee-sales.css'
import { formatPrice, isExpired } from '../../utils/format'
import OwnerPicker from '../../components/shared/OwnerPicker'
import Clock from '../../components/shared/Clock'
import SearchPicker from '../../components/shared/SearchPicker'

// ==================== HELPERS ====================
// Sales are recorded through the API; the server validates stock and the
// database deducts it, so nothing is decremented client-side.

const FIELD_IDS = { product: 'saleProduct', quantity: 'saleQuantity', price: 'salePrice' }

// The message under a field, linked to it with aria-describedby.
function FieldError({ field, errors }) {
  return errors[field] ? <p className="field-error" id={`${FIELD_IDS[field]}-error`}>{errors[field]}</p> : null
}

const invalid = (field, errors) => (errors[field] ? { 'aria-invalid': true, 'aria-describedby': `${FIELD_IDS[field]}-error` } : {})

export default function Sales() {
  const { items: products, loading: inventoryLoading } = useInventory()
  const { items: branchSales, loading: salesLoading, create: createSale } = useSales({ limit: 8 })
  const { branch } = useEmployeeContext()
  const showToast = useToast()

  const [cartItems, setCartItems] = useState([])
  const [selectedProductId, setSelectedProductId] = useState('')
  const [productQuery, setProductQuery] = useState('') // text in the product search box
  const [quantity, setQuantity] = useState(1)
  const [price, setPrice] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [owner, setOwner] = useState(null) // { id, name } or null for a walk-in
  const [errors, setErrors] = useState({}) // shown under the product / quantity / price fields

  const branchProducts = useMemo(() => products.filter(p => p.branch === branch), [products, branch])
  const inStockProducts = useMemo(() => branchProducts.filter(p => p.quantity > 0 && !isExpired(p)), [branchProducts]) // expired stock cannot be sold

  function getCartQuantity(inventoryId) {
    const line = cartItems.find(i => i.inventoryId === inventoryId)
    return line ? line.quantity : 0
  }

  function getAvailableStock(product) {
    return product.quantity - getCartQuantity(product.id)
  }

  const selectedProduct = useMemo(
    () => branchProducts.find(p => p.id === selectedProductId) || null,
    [branchProducts, selectedProductId]
  )
  const available = selectedProduct ? getAvailableStock(selectedProduct) : null

  // If the selected product falls out of the in-stock list (sold out, or
  // edited from another tab), clear the picker so it doesn't keep pointing
  // at a stale option - mirrors populateProductOptions() re-rendering the
  // <select> on every product/cart change.
  useEffect(() => {
    if (selectedProductId && !inStockProducts.some(p => String(p.id) === selectedProductId)) {
      setSelectedProductId('')
      setProductQuery('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inStockProducts])

  // The admin's selling price for this branch, when set; still editable (discounts).
  function pickProduct(id) {
    setSelectedProductId(id)
    setErrors({})
    const p = branchProducts.find(x => x.id === id)
    setPrice(p?.unitPrice != null ? String(p.unitPrice) : '')
  }

  function handleAddToCart() {
    const inventoryId = selectedProductId
    const product = branchProducts.find(p => p.id === inventoryId)
    const qty = Number(quantity)
    const unitPrice = Number(price)

    const avail = product ? getAvailableStock(product) : 0
    const errs = {}
    if (!product) errs.product = 'Pick a product first.'
    if (!qty || qty < 1) errs.quantity = 'Enter a quantity of at least 1.'
    else if (product && qty > avail) errs.quantity = `Only ${avail} unit${avail === 1 ? '' : 's'} left.`
    if (price === '' || unitPrice < 0) errs.price = 'Enter a unit price.'
    setErrors(errs)
    const first = ['product', 'quantity', 'price'].find((k) => errs[k])
    if (first) {
      document.getElementById(FIELD_IDS[first])?.focus()
      return
    }

    setCartItems(prev => {
      const existingIndex = prev.findIndex(i => i.inventoryId === inventoryId)
      if (existingIndex >= 0) {
        const next = [...prev]
        next[existingIndex] = { ...next[existingIndex], quantity: next[existingIndex].quantity + qty, price: unitPrice }
        return next
      }
      return [...prev, { inventoryId, name: product.name, quantity: qty, price: unitPrice }]
    })

    setQuantity(1)
    setPrice('')
  }

  function handleRemoveCartItem(index) {
    setCartItems(prev => prev.filter((_, i) => i !== index))
  }

  const cartTotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0)

  async function handleCompleteSale() {
    if (cartItems.length === 0 || submitting) return
    setSubmitting(true)
    try {
      const total = cartTotal
      await createSale(cartItems.map(i => ({ inventoryId: i.inventoryId, quantity: i.quantity, price: i.price })),
        { customerId: owner?.id || '' })
      showToast(`Sale completed — ${formatPrice(total)}${owner ? ` for ${owner.name}` : ''}.`)
      setCartItems([])
      setOwner(null)
    } catch (err) {
      showToast(errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main id="main-content" tabIndex={-1} className="content">
      <div className="content-header">
        <h1>Sales · {branch}</h1>
        <Clock />
      </div>

      <div className="scope-banner">
        <p>Use this to ring up a quick product purchase — no consultation needed. Completing a sale deducts the stock from your branch's inventory right away.</p>
      </div>

      <div className="sales-layout">
        {/* New sale + cart */}
        <div className="sales-main-col">
          <div className="table-card">
            <h2>New sale</h2>

            <div className="form-group sale-owner">
              <label className="form-label" htmlFor="saleOwner">Customer <span className="optional">(optional)</span></label>
              <OwnerPicker value={owner} onChange={setOwner} />
            </div>

            <div className="sale-add-row">
              <div className="form-group">
                <label className="form-label" htmlFor="saleProduct">Product</label>
                {/* Type to search, or open the arrow to browse by category. Items already all in the cart drop off the list. */}
                <SearchPicker id="saleProductList" items={inStockProducts.filter(p => getAvailableStock(p) > 0)} value={productQuery}
                  onChange={(v) => { setProductQuery(v); setSelectedProductId(''); setErrors({}) }}
                  onPick={(p) => { pickProduct(p.id); setProductQuery(p.name) }}
                  currentId={selectedProductId} noun="products" meta={(p) => `${getAvailableStock(p)} in stock`} label="Product"
                  placeholder={inStockProducts.length === 0 ? 'No products in stock' : 'Search or pick a product'}
                  inputProps={{ id: 'saleProduct', className: 'form-input', disabled: inStockProducts.length === 0, ...invalid('product', errors) }} />
                <FieldError field="product" errors={errors} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="saleQuantity">Quantity</label>
                <input id="saleQuantity" {...invalid('quantity', errors)}
                  type="number" className="form-input" min="1" step="1"
                  value={quantity} max={available === null ? undefined : available}
                  onChange={(e) => {
                    // Never more than the branch has on the shelf (minus what is already in the cart).
                    const v = e.target.value
                    setQuantity(available !== null && Number(v) > available ? String(Math.max(available, 0)) : v)
                    setErrors({})
                  }}
                />
                <FieldError field="quantity" errors={errors} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="salePrice">Unit price (₱)</label>
                <input id="salePrice" {...invalid('price', errors)}
                  type="number" inputMode="decimal" className="form-input" min="0" step="0.01" placeholder="0.00"
                  value={price} onChange={(e) => { setPrice(e.target.value); setErrors({}) }}
                />
                <FieldError field="price" errors={errors} />
              </div>
              <button type="button" className="new-btn" disabled={inStockProducts.length === 0 || (selectedProduct && available <= 0)} onClick={handleAddToCart}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                <span>Add to cart</span>
              </button>
            </div>
            <p className={`form-hint${selectedProduct && available <= 0 ? ' is-warning' : ''}`} aria-live="polite">
              {selectedProduct
                ? (available <= 0
                  ? `No more "${selectedProduct.name}" left to sell.`
                  : `${available} unit${available === 1 ? '' : 's'} in stock: the most you can add.`)
                : ''}
            </p>

            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Qty</th>
                    <th>Unit price</th>
                    <th>Subtotal</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {cartItems.length === 0 ? (
                    <tr><td colSpan="5" className="empty-state">{inventoryLoading ? 'Loading…' : 'No items added yet.'}</td></tr>
                  ) : cartItems.map((item, index) => (
                    <tr key={item.inventoryId}>
                      <td>{item.name}</td>
                      <td>{item.quantity}</td>
                      <td>{formatPrice(item.price)}</td>
                      <td>{formatPrice(item.price * item.quantity)}</td>
                      <td>
                        <button type="button" className="cart-remove-btn" aria-label={`Remove ${item.name}`} onClick={() => handleRemoveCartItem(index)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="cart-total-row">
              <span>Total</span>
              <span>{formatPrice(cartTotal)}</span>
            </div>

            <button type="button" className="complete-sale-btn" disabled={cartItems.length === 0 || submitting} onClick={handleCompleteSale}>{submitting ? 'Completing…' : 'Complete sale'}</button>
          </div>
        </div>

        {/* Recent sales */}
        <div className="sales-side-col">
          <div className="table-card">
            <h2>Recent sales</h2>
            <ul className="recent-sales-list">
              {salesLoading && branchSales.length === 0 ? (
                <li className="empty-state">Loading…</li>
              ) : branchSales.length === 0 ? (
                <li className="empty-state">No sales recorded yet.</li>
              ) : branchSales.map(sale => (
                <li className="recent-sale-item" key={sale.id}>
                  <div className="recent-sale-top">
                    <span>{sale.customerName || 'Walk-in'}</span>
                    <span className="recent-sale-total">{formatPrice(sale.total)}</span>
                  </div>
                  <p className="recent-sale-items">{sale.items.map(i => `${i.name} ×${i.quantity}`).join(', ')}</p>
                  <p className="recent-sale-time">{new Date(sale.createdAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}{sale.staffName ? ` · ${sale.staffName}` : ''}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </main>
  )
}
