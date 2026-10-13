import React from 'react'
import '../../styles/shared/pagination.css'

// "Showing 1-10 of 740 entries" with previous / next buttons, under a table. `page` starts at 1.
export default function Pagination({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages <= 1) return null
  const from = (page - 1) * pageSize + 1
  return (
    <div className="table-footer">
      <p className="table-footer-count">Showing {from}-{Math.min(page * pageSize, total)} of {total} entries</p>
      <div className="pagination">
        <button type="button" className="page-btn" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <span className="page-btn active" aria-current="page">{page} / {pages}</span>
        <button type="button" className="page-btn" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </div>
    </div>
  )
}
