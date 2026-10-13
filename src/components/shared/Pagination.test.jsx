import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import Pagination from './Pagination'

const html = (props) => renderToStaticMarkup(<Pagination onPage={() => {}} {...props} />)

describe('Pagination', () => {
  it('shows the range of the current page and its position', () => {
    const out = html({ page: 2, pageSize: 10, total: 25 })
    expect(out).toContain('Showing 11-20 of 25 entries')
    expect(out).toContain('2 / 3')
  })

  it('stops at the last entry and disables next on the last page', () => {
    const out = html({ page: 3, pageSize: 10, total: 25 })
    expect(out).toContain('Showing 21-25 of 25 entries')
    expect(out).toMatch(/disabled="" aria-label="Next page"/)
  })

  it('renders nothing when everything fits on one page', () => {
    expect(html({ page: 1, pageSize: 10, total: 7 })).toBe('')
  })
})
