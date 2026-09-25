import React, { useState } from 'react'
import { BarChart, Donut, Legend } from '../../components/shared/charts'
import { BRANCH_COLORS, branchColor, fmtClock, fmtMoney, fmtMonth, fmtNum, fmtPct, useAnalytics } from '../../hooks/useAnalytics'

const BRANCHES = ['Ibaan', 'San Jose']

function Trend({ pct, label }) {
  if (pct === null || pct === undefined) return <span className="stat-change muted">Nothing to compare with yet</span>
  return <span className={`stat-change ${pct >= 0 ? 'positive' : 'negative'}`}>{fmtPct(pct)} vs {label}</span>
}

export default function Dashboard() {
  const [branch, setBranch] = useState('All Branches')
  const { data, loading, error, reload, updatedAt } = useAnalytics('overview', { branch })
  const live = useAnalytics('live', { branch })

  const asOf = data?.asOf?.month ? fmtMonth(data.asOf.month, true) : null
  const partial = Boolean(data?.asOf?.partial)
  const kpis = data?.kpis
  const seriesBranches = branch === 'All Branches' ? BRANCHES : [branch]
  const series = seriesBranches.map((b) => ({ key: b, label: b, color: branchColor(b) }))
  const bars = (data?.trend || []).map((t) => ({ label: fmtMonth(t.month) + (t.partial ? '*' : ''), values: t.branches }))
  const share = (data?.branchShare || []).map((s) => ({ label: s.branch, value: s.total, color: branchColor(s.branch) }))

  return (
    <main id="main-content" tabIndex={-1} className="content">
      <div className="content-header">
        <h1>Overview</h1>
        <div className="branch-filter">
          <label htmlFor="branchSelect">Branches:</label>
          <div className="select-wrapper">
            <select id="branchSelect" value={branch} onChange={(e) => setBranch(e.target.value)}>
              <option>All Branches</option>
              {BRANCHES.map((b) => <option key={b}>{b}</option>)}
            </select>
            <svg className="select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
          </div>
        </div>
      </div>

      {error && (
        <div className="load-error">
          Could not load the analytics. <button type="button" className="link-btn" onClick={reload}>Try again</button>
        </div>
      )}
      {data?.empty && <p className="empty-state">No sales or service records yet.</p>}
      {asOf && (
        <p className="as-of">
          <span className="live-badge" title="Refreshes automatically"><i />Live</span>
          {partial ? `${asOf} so far` : asOf} · last record {data.asOf.latestDate}
          {updatedAt ? ` · updated ${fmtClock(updatedAt)}` : ''}
          {!live.data?.isToday && live.data && ' · no records yet today'}
        </p>
      )}

      <div className="stats-grid">
        <div className="stat-card">
          <p className="stat-label">Total Sales{partial ? ' · month to date' : ''}</p>
          <p className="stat-value">{loading ? '…' : fmtMoney(kpis?.totalSales)}</p>
          {kpis && <Trend pct={kpis.growthRate} label={data.comparison.label} />}
          <p className="stat-sub">Products + services</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Clients served</p>
          <p className="stat-value">{loading ? '…' : fmtNum(kpis?.clientsServed)}</p>
          <p className="stat-sub">Distinct customers who bought or visited{partial ? ' this month so far' : ''}</p>
        </div>
        <div className={`stat-card${kpis?.lowStockItems ? ' alert' : ''}`}>
          <p className="stat-label">Low stock items</p>
          <p className="stat-value">{loading ? '…' : fmtNum(kpis?.lowStockItems)}</p>
          {kpis && <p className="stat-sub">{fmtNum(kpis.outOfStockItems)} at zero of {fmtNum(kpis.trackedItems)} tracked</p>}
        </div>
        <div className="stat-card">
          <p className="stat-label">Ibaan vs San Jose</p>
          {data?.branchShare?.length > 1 ? (
            <>
              <p className="stat-value">
                {fmtNum((data.branchShare.find((b) => b.branch === 'Ibaan')?.total / data.kpis.totalSales) * 100)}% / {fmtNum((data.branchShare.find((b) => b.branch === 'San Jose')?.total / data.kpis.totalSales) * 100)}%
              </p>
              <p className="stat-sub">Share of total sales</p>
            </>
          ) : (
            <p className="stat-value muted">{loading ? '…' : '—'}</p>
          )}
        </div>
      </div>

      <div className="live-grid">
        <div className="table-card">
          <div className="live-head">
            <h2>Today{live.data?.today ? ` · ${live.data.today}` : ''}</h2>
            <span className="live-badge"><i />Live</span>
          </div>
          {live.data?.totals ? (
            <div className="live-stats">
              <div><p className="stat-label">Sales today</p><p className="stat-value">{fmtMoney(live.data.totals.total)}</p></div>
              <div><p className="stat-label">Product sales made</p><p className="stat-value">{fmtNum(live.data.totals.saleTxns)}</p></div>
              <div><p className="stat-label">Clinic visits</p><p className="stat-value">{fmtNum(live.data.totals.serviceTxns)}</p></div>
            </div>
          ) : <div className="skeleton" style={{ height: 70 }} />}
          {live.data?.byBranch && Object.keys(live.data.byBranch).length > 1 && (
            <p className="stat-sub">
              {Object.entries(live.data.byBranch).map(([b, v]) => `${b}: ${fmtMoney(v.total)}`).join('  ·  ')}
            </p>
          )}
        </div>

        <div className="table-card">
          <h2>Latest transactions</h2>
          <div className="table-scroll">
            <table>
              <thead><tr><th>When</th><th>Type</th><th>Customer</th><th>Branch</th><th>Amount</th></tr></thead>
              <tbody>
                {(live.data?.recent || []).map((t) => (
                  <tr key={t.id}>
                    <td>{t.date.slice(5)}{t.time ? ` ${t.time}` : ''}</td>
                    <td>{t.kind}</td>
                    <td>{t.customer}</td>
                    <td>{t.branch}</td>
                    <td>{fmtMoney(t.amount)}</td>
                  </tr>
                ))}
                {live.data && !live.data.recent.length && <tr><td colSpan="5" className="empty-state">Nothing recorded yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="chart-card">
          <h2>Monthly sales trend</h2>
          {loading ? <div className="skeleton" style={{ height: 260 }} /> : bars.length ? (
            <>
              <BarChart data={bars} series={series} format={fmtMoney} />
              <Legend items={series} />
              {partial && <p className="accuracy-note">* {asOf} is still running, so its bar is the total so far.</p>}
            </>
          ) : <p className="empty-state">No sales data yet.</p>}
        </div>

        <div className="chart-card">
          <h2>Branch share</h2>
          {share.length ? (
            <div className="donut-row">
              <Donut slices={share} format={fmtMoney} />
              <ul className="donut-list">
                {data.branchShare.map((s) => (
                  <li key={s.branch}><i style={{ background: BRANCH_COLORS[s.branch] }} />{s.branch}<b>{fmtMoney(s.total)}</b></li>
                ))}
              </ul>
            </div>
          ) : <p className="empty-state">{loading ? 'Loading…' : 'No branch data yet.'}</p>}
        </div>
      </div>

      <div className="table-card">
        <h2>Most availed services{asOf ? ` · ${asOf}${partial ? ' so far' : ''}` : ''}</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th>Service</th><th>Branch</th><th>Count</th><th>vs {data?.comparison?.label || 'previous month'}</th></tr>
            </thead>
            <tbody>
              {(data?.topServices || []).map((s) => (
                <tr key={`${s.service}-${s.branch}`}>
                  <td>{s.service}</td>
                  <td>{s.branch}</td>
                  <td>{fmtNum(s.count)}</td>
                  <td className={s.changePct === null ? '' : s.changePct >= 0 ? 'trend-up' : 'trend-down'}>{fmtPct(s.changePct)}</td>
                </tr>
              ))}
              {!loading && !data?.topServices?.length && (
                <tr><td colSpan="4" className="empty-state">No patient visits recorded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}
