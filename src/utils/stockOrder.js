import { daysToExpiry, EXPIRY_WARN_DAYS } from './format'

// An inventory row's status and how urgent it is (0 = act first). Expiry comes first: expired stock is not
// sellable whatever the count says.
export function getStatus(product) {
  const days = daysToExpiry(product.expiration)
  if (days !== null && days < 0 && product.quantity > 0) return { label: 'Expired', cls: 'status-expired', rank: 0 }
  if (product.quantity <= 0) return { label: 'Out of stock', cls: 'status-out-of-stock', rank: 1 }
  if (product.quantity <= product.reorderPoint) return { label: 'Low stock', cls: 'status-low-stock', rank: 2 }
  if (days !== null && days <= EXPIRY_WARN_DAYS) return { label: `Expires in ${days} day${days === 1 ? '' : 's'}`, cls: 'status-expiring', rank: 3 }
  return { label: 'OK', cls: 'status-ok', rank: 4 }
}

export const needsAction = (product) => getStatus(product).rank < 4

// Within a status, the closest to trouble first: the soonest expiry, then the least stock against its reorder point.
export function urgency(a, b) {
  const ra = getStatus(a).rank
  const rb = getStatus(b).rank
  if (ra !== rb) return ra - rb
  if (ra === 0 || ra === 3) return (a.expiration || '').localeCompare(b.expiration || '')
  const cover = (p) => (p.reorderPoint > 0 ? p.quantity / p.reorderPoint : p.quantity)
  return cover(a) - cover(b)
}

// One entry per product with its stock row at each branch: { productId, name, category, photo, stock: { Ibaan: row } }.
// The admin table shows a product once with the branches side by side.
export function groupByProduct(rows) {
  const groups = new Map()
  rows.forEach((r) => {
    const g = groups.get(r.productId) || { productId: r.productId, name: r.name, category: r.category, photo: null, stock: {} }
    g.stock[r.branch] = r
    g.photo = g.photo || r.photo || null
    groups.set(r.productId, g)
  })
  return [...groups.values()]
}

// The branch that needs attention most decides where a product sits: low at one branch is low.
export const worstRow = (group) => Object.values(group.stock).sort(urgency)[0]
export const groupNeedsAction = (group) => needsAction(worstRow(group))

// Sorts products by urgency ('status'), name, or one branch's count (a branch that does not stock it goes last).
export function compareGroups(key, dir) {
  const sign = dir === 'desc' ? -1 : 1
  return (a, b) => {
    let d
    if (key === 'status') d = urgency(worstRow(a), worstRow(b))
    else if (key === 'name') d = a.name.localeCompare(b.name)
    else {
      const qa = a.stock[key]?.quantity
      const qb = b.stock[key]?.quantity
      if (qa === undefined || qb === undefined) return (qa === undefined) - (qb === undefined) || a.name.localeCompare(b.name)
      d = qa - qb
    }
    return sign * d || a.name.localeCompare(b.name)
  }
}
