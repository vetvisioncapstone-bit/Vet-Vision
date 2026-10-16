import { describe, expect, it } from 'vitest'
import { seriesFacts } from './insights'

describe('seriesFacts', () => {
  it('finds the best and lowest month and compares the last 3 months with the 3 before', () => {
    const rows = [10, 20, 30, 40, 50, 60].map((value, i) => ({ month: `2026-0${i + 1}`, value }))
    const f = seriesFacts(rows)
    expect(f.best.month).toBe('2026-06')
    expect(f.lowest.month).toBe('2026-01')
    expect(f.lastAvg).toBe(50)
    expect(f.change).toBe(150) // 50 a month against 20
  })

  it('has no comparison with fewer than 6 months, and nothing for no data', () => {
    expect(seriesFacts([{ month: '2026-01', value: 5 }]).change).toBeNull()
    expect(seriesFacts([])).toBeNull()
  })
})
