import { describe, expect, it } from 'vitest'
import { dash, formatDate, formatPrice, getStatusClass, isImageDataUrl, todayIso } from './format'

describe('format helpers', () => {
  it('formats an ISO date without shifting the day', () => {
    expect(formatDate('2026-09-24')).toBe('Sep 24, 2026')
    expect(formatDate('2026-01-01')).toBe('Jan 1, 2026')
    expect(formatDate('')).toBe('—')
  })

  it('returns today as YYYY-MM-DD', () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('formats pesos and treats empty as zero', () => {
    expect(formatPrice(1234.5)).toBe('₱1234.50')
    expect(formatPrice(null)).toBe('₱0.00')
  })

  it('shows a dash for empty values only', () => {
    expect(dash('')).toBe('—')
    expect(dash(undefined)).toBe('—')
    expect(dash(0)).toBe(0)
  })

  it('maps a patient status to its pill class', () => {
    expect(getStatusClass('Active')).toBe('status-ok')
    expect(getStatusClass('Follow-up needed')).toBe('status-follow-up')
    expect(getStatusClass('Inactive')).toBe('status-inactive')
  })

  it('accepts only embedded images', () => {
    expect(isImageDataUrl('data:image/png;base64,AAA')).toBe(true)
    expect(isImageDataUrl('data:application/pdf;base64,AAA')).toBe(false)
    expect(isImageDataUrl(null)).toBe(false)
  })
})
