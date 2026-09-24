import React from 'react'
import { useToast } from '../../components/shared/Toast'

export default function SalesAnalytics() {
  const showToast = useToast()

  return (
    <main className="content">
      <div className="content-header">
        <h1>Branch performance comparison</h1>
        <div className="header-filters">
          <div className="select-wrapper">
            <select defaultValue="2026" onChange={() => showToast("Year filter isn't connected to any data yet.")}>
              {['2026', '2025', '2024', '2023', '2022', '2021'].map(y => (
                <option key={y}>{y}</option>
              ))}
            </select>
            <svg className="select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
          </div>
        </div>
      </div>

      <div className="analytics-grid">
        <div className="chart-card">
          <div className="chart-card-header">
            <h2>Sales by Branch</h2>
            <div className="select-wrapper">
              <select defaultValue="Monthly" onChange={() => showToast("Chart period isn't connected to any data yet.")}>
                <option>Monthly</option>
                <option>Weekly</option>
                <option>Daily</option>
              </select>
              <svg className="select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
            </div>
          </div>
          <div className="chart-placeholder">
            <p className="empty-state">No sales data yet.</p>
          </div>
        </div>

        <div className="chart-card kpi-card">
          <h2>KPIs this quarter</h2>
          <div className="kpi-list">
            <div className="kpi-block">
              <p className="kpi-label">Avg daily transactions</p>
              <p className="kpi-value muted">—</p>
            </div>
            <div className="kpi-block">
              <p className="kpi-label">Top service category</p>
              <p className="kpi-value muted">—</p>
            </div>
            <div className="kpi-block">
              <p className="kpi-label">Revenue growth</p>
              <p className="kpi-value muted">—</p>
            </div>
          </div>
        </div>
      </div>

      <div className="table-card">
        <h2>Top performing products / services</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Category</th>
                <th>Branch</th>
                <th>Revenue</th>
                <th>Trend</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan="5" className="empty-state">No product/service data yet.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}
