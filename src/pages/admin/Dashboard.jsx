import React from 'react'
import { useToast } from '../../components/shared/Toast'

export default function Dashboard() {
  const showToast = useToast()

  return (
    <main className="content">
      <div className="content-header">
        <h1>Overview</h1>
        <div className="branch-filter">
          <label htmlFor="branchSelect">Branches:</label>
          <div className="select-wrapper">
            <select id="branchSelect" defaultValue="All Branches" onChange={() => showToast("Branch filtering isn't connected to any data yet.")}>
              <option>All Branches</option>
              <option>Ibaan</option>
              <option>San Jose</option>
            </select>
            <svg className="select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
          </div>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <p className="stat-label">Total Sales</p>
          <p className="stat-value">—</p>
          <p className="stat-change muted">No data yet</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Client served</p>
          <p className="stat-value">—</p>
          <p className="stat-change muted">No data yet</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Low stock items</p>
          <p className="stat-value">—</p>
          <p className="stat-change muted">No data yet</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Ibaan vs San Jose</p>
          <p className="stat-value">—</p>
          <p className="stat-change muted">No data yet</p>
        </div>
      </div>

      <div className="charts-grid">
        <div className="chart-card">
          <h2>Monthly sales trend</h2>
          <div className="bar-chart is-empty">
            <p className="empty-state">No sales data yet.</p>
          </div>
        </div>

        <div className="chart-card">
          <h2>Branch share</h2>
          <p className="empty-state">No branch data yet.</p>
        </div>
      </div>

      <div className="table-card">
        <h2>Recent top services</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Service</th>
                <th>Branch</th>
                <th>Count</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan="4" className="empty-state">No patient visits recorded yet.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}
