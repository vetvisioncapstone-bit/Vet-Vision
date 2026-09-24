import React, { useEffect, useMemo, useState } from 'react'
import { useInventory } from '../../hooks/useInventory'
import { useSales } from '../../hooks/useSales'
import { useSession } from '../../hooks/useSession'
import { useEmployeeContext } from '../../hooks/useEmployeeContext'
import { useToast } from '../../components/shared/Toast'
import '../../styles/employee/employee-sales.css'

// ==================== HELPERS ====================
// Ported from employee-sales.js - reads/writes 'vvInventoryProducts' (to
// deduct stock on a completed sale) and owns 'vvSales' (branch-scoped),
// which the employee dashboard's chart reads from.

function formatPrice(amount) {
  return `₱${Number(amount || 0).toFixed(2)}`
}

export default function Sales() {
  const [products, setProducts] = useInventory()
  const [sales, setSales] = useSales()
  const { session } = useSession()
  const { branch, name } = useEmployeeContext()
  const showToast = useToast()

  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(id)
  }, [])

  const [cartItems, setCartItems] = useState([])
  const [selectedProductId, setSelectedProductId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [price, setPrice] = useState('')

  const branchProducts = useMemo(() => products.filter(p => p.branch === branch), [products, branch])
  const inStockProducts = useMemo(() => branchProducts.filter(p => p.quantity > 0), [branchProducts])

  function getCartQuantity(productId) {
    const line = cartItems.find(i => i.productId === productId)
    return line ? line.quantity : 0
  }

  function getAvailableStock(product) {
    return product.quantity - getCartQuantity(product.id)
  }

  const selectedProduct = useMemo(
    () => branchProducts.find(p => p.id === Number(selectedProductId)) || null,
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inStockProducts])

  function handleAddToCart() {
    const productId = Number(selectedProductId)
    const product = branchProducts.find(p => p.id === productId)
    const qty = Number(quantity)
    const unitPrice = Number(price)

    if (!product) {
      showToast('Pick a product first.')
      return
    }
    if (!qty || qty < 1) {
      showToast('Enter a quantity of at least 1.')
      return
    }
    if (price === '' || unitPrice < 0) {
      showToast('Enter a unit price.')
      return
    }

    const avail = getAvailableStock(product)
    if (qty > avail) {
      showToast(`Only ${avail} unit${avail === 1 ? '' : 's'} of "${product.name}" left.`)
      return
    }

    setCartItems(prev => {
      const existingIndex = prev.findIndex(i => i.productId === productId)
      if (existingIndex >= 0) {
        const next = [...prev]
        next[existingIndex] = { ...next[existingIndex], quantity: next[existingIndex].quantity + qty, price: unitPrice }
        return next
      }
      return [...prev, { productId, name: product.name, quantity: qty, price: unitPrice }]
    })

    setQuantity(1)
    setPrice('')
  }

  function handleRemoveCartItem(index) {
    setCartItems(prev => prev.filter((_, i) => i !== index))
  }

  const cartTotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0)

  function handleCompleteSale() {
    if (cartItems.length === 0) return

    for (const item of cartItems) {
      const product = products.find(p => p.id === item.productId)
      if (!product || product.quantity < item.quantity) {
        showToast(`Not enough stock left for "${item.name}". Sale cancelled.`)
        return
      }
    }

    setProducts(prev => prev.map(p => {
      const item = cartItems.find(i => i.productId === p.id)
      return item ? { ...p, quantity: p.quantity - item.quantity } : p
    }))

    const total = cartTotal
    const nextSaleId = sales.reduce((max, s) => Math.max(max, s.id + 1), 1)
    setSales(prev => [...prev, {
      id: nextSaleId,
      branch,
      staffId: session ? session.id : null,
      staffName: name,
      items: cartItems.slice(),
      total,
      createdAt: new Date().toISOString()
    }])

    showToast(`Sale completed — ${formatPrice(total)}.`)
    setCartItems([])
  }

  const branchSales = useMemo(() => {
    return sales
      .filter(s => s.branch === branch)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 8)
  }, [sales, branch])

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
        <p>Use this to ring up a quick product purchase — no consultation needed. Completing a sale deducts the stock from your branch's inventory right away.</p>
      </div>

      <div className="sales-layout">
        {/* New sale + cart */}
        <div className="sales-main-col">
          <div className="table-card">
            <h2>New sale</h2>

            <div className="sale-add-row">
              <div className="form-group">
                <label className="form-label">Product</label>
                <div className="form-select-wrapper">
                  <select
                    className="form-input"
                    value={selectedProductId}
                    disabled={inStockProducts.length === 0}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                  >
                    <option value="" disabled hidden>{inStockProducts.length === 0 ? 'No products in stock' : 'Select a product'}</option>
                    {inStockProducts.map(p => (
                      <option value={p.id} key={p.id}>{p.name} ({p.quantity} in stock)</option>
                    ))}
                  </select>
                  <svg className="form-select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Quantity</label>
                <input
                  type="number" className="form-input" min="1" step="1"
                  value={quantity} max={available === null ? undefined : available}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Unit price (₱)</label>
                <input
                  type="number" className="form-input" min="0" step="0.01" placeholder="0.00"
                  value={price} onChange={(e) => setPrice(e.target.value)}
                />
              </div>
              <button type="button" className="new-btn" disabled={inStockProducts.length === 0} onClick={handleAddToCart}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                <span>Add</span>
              </button>
            </div>
            <p className={`form-hint${selectedProduct && available <= 0 ? ' is-warning' : ''}`}>
              {selectedProduct
                ? (available <= 0
                  ? `No more "${selectedProduct.name}" left to sell.`
                  : `${available} unit${available === 1 ? '' : 's'} available.`)
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
                    <tr><td colSpan="5" className="empty-state">No items added yet.</td></tr>
                  ) : cartItems.map((item, index) => (
                    <tr key={index}>
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

            <button type="button" className="complete-sale-btn" disabled={cartItems.length === 0} onClick={handleCompleteSale}>Complete sale</button>
          </div>
        </div>

        {/* Recent sales */}
        <div className="sales-side-col">
          <div className="table-card">
            <h2>Recent sales</h2>
            <ul className="recent-sales-list">
              {branchSales.length === 0 ? (
                <li className="empty-state">No sales recorded yet.</li>
              ) : branchSales.map(sale => (
                <li className="recent-sale-item" key={sale.id}>
                  <div className="recent-sale-top">
                    <span>{sale.staffName}</span>
                    <span className="recent-sale-total">{formatPrice(sale.total)}</span>
                  </div>
                  <p className="recent-sale-items">{sale.items.map(i => `${i.name} x${i.quantity}`).join(', ')}</p>
                  <p className="recent-sale-time">{new Date(sale.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </main>
  )
}
