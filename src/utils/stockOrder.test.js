import { describe, expect, it } from 'vitest'
import { compareGroups, getStatus, groupByProduct, groupNeedsAction } from './stockOrder'
import { todayIso } from './format'

const day = (offset) => {
  const d = new Date(`${todayIso()}T00:00`)
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const row = (name, quantity, reorderPoint, expiration = '') => ({ name, productId: name, quantity, reorderPoint, expiration, branch: 'Ibaan', category: 'X' })

describe('inventory order', () => {
  it('puts the most urgent first: expired, out of stock, low, expiring, then OK', () => {
    const rows = [
      row('Fine', 50, 3),
      row('Expiring', 40, 3, day(10)),
      row('Low, barely', 3, 3),
      row('Low, nearly out', 1, 5),
      row('Out', 0, 3),
      row('Expired', 9, 3, day(-2))
    ]
    expect(groupByProduct(rows).sort(compareGroups('status', 'asc')).map((g) => g.name))
      .toEqual(['Expired', 'Out', 'Low, nearly out', 'Low, barely', 'Expiring', 'Fine'])
  })

  it('shows a product once with both branches and ranks it by its worst branch', () => {
    const at = (name, branch, quantity, reorderPoint = 3) => ({ ...row(name, quantity, reorderPoint), productId: name, branch })
    const groups = groupByProduct([
      at('Collar', 'Ibaan', 20), at('Collar', 'San Jose', 1), // fine at Ibaan, low at San Jose
      at('Soap', 'Ibaan', 30), at('Soap', 'San Jose', 25),
      at('Leash', 'Ibaan', 0) // only stocked at Ibaan, and out
    ])
    expect(groups).toHaveLength(3)
    expect(Object.keys(groups.find((g) => g.name === 'Collar').stock)).toEqual(['Ibaan', 'San Jose'])
    expect(groups.filter(groupNeedsAction).map((g) => g.name).sort()).toEqual(['Collar', 'Leash'])
    expect(groups.sort(compareGroups('status', 'asc')).map((g) => g.name)).toEqual(['Leash', 'Collar', 'Soap'])
    // Sorting by a branch's count puts products that branch does not stock last.
    expect(groups.sort(compareGroups('San Jose', 'asc')).map((g) => g.name)).toEqual(['Collar', 'Soap', 'Leash'])
  })

  it('labels statuses in sentence case and sorts by name or a branch count both ways', () => {
    expect(getStatus(row('a', 2, 3)).label).toBe('Low stock')
    expect(getStatus(row('a', 9, 3)).label).toBe('OK')
    const groups = groupByProduct([row('B', 5, 1), row('A', 9, 1)])
    expect(groups.sort(compareGroups('Ibaan', 'desc')).map((g) => g.name)).toEqual(['A', 'B'])
    expect(groups.sort(compareGroups('name', 'asc')).map((g) => g.name)).toEqual(['A', 'B'])
  })
})
