import { describe, expect, it } from 'vitest'
import { fmtMoney, fmtMonth, fmtNum, fmtPct } from './useAnalytics'

describe('analytics formatting', () => {
  it('shows pesos without decimals and a dash for missing values', () => {
    expect(fmtMoney(741550)).toBe('₱741,550')
    expect(fmtMoney(null)).toBe('—')
  })

  it('rounds numbers to one decimal', () => {
    expect(fmtNum(65.24)).toBe('65.2')
    expect(fmtNum(undefined)).toBe('—')
  })

  it('signs percentages', () => {
    expect(fmtPct(10.94)).toBe('+10.9%')
    expect(fmtPct(-3)).toBe('-3.0%')
    expect(fmtPct(null)).toBe('—')
  })

  it('names months short or long', () => {
    expect(fmtMonth('2026-07')).toBe('Jul')
    expect(fmtMonth('2026-07', true)).toBe('Jul 2026')
    expect(fmtMonth('')).toBe('')
  })
})
