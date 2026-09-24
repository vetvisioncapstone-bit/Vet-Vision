import React, { useState } from 'react'
import '../../styles/admin/forecasting.css'

export default function Forecasting() {
  const [search, setSearch] = useState('')

  return (
    <main className="content">
      <div className="content-header">
        <h1>Demand forecasting</h1>
        <div className="select-wrapper">
          <select defaultValue="All Branches">
            <option>All Branches</option>
          </select>
          <svg className="select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
        </div>
      </div>

      <div className="search-wrapper forecast-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
        <input type="text" placeholder="search product..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <p className="stat-label">Stock right now</p>
          <p className="stat-value muted">—</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Average sold per month</p>
          <p className="stat-value muted">—</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Predicted need next month</p>
          <p className="stat-value muted">—</p>
        </div>
      </div>

      <h2 className="section-title">Monthly sales — last 5 months + prediction</h2>
      <div className="month-strip is-empty">
        <p className="empty-state">No sales data yet.</p>
      </div>

      <div className="forecast-grid">
        <div className="chart-card">
          <h2>Sales trend</h2>
          <div className="chart-placeholder">
            <p className="empty-state">No sales data yet.</p>
          </div>
        </div>

        <div className="insight-col">
          <div className="insight-card">
            <div className="insight-body">
              <p className="insight-title">Stock after ordering</p>
              <p className="insight-value muted">—</p>
              <p className="insight-desc">Add products and sales data to see this.</p>
            </div>
          </div>

          <div className="insight-card">
            <div className="insight-body">
              <p className="insight-title">You need to order</p>
              <p className="insight-value muted">—</p>
              <p className="insight-desc">Add products and sales data to see this.</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
