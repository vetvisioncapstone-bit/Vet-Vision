import React, { useState } from 'react'
import { BarChart, Legend } from '../../components/shared/charts'
import { branchColor, fmtMoney, fmtMonth, fmtNum, fmtPct, useAnalytics } from '../../hooks/useAnalytics'
import Chevron from '../../components/shared/Chevron'

const BRANCHES = ['Ibaan', 'San Jose']
const METRICS = [
  { id: 'total', label: 'Total revenue' },
  { id: 'sales', label: 'Product sales' },
  { id: 'services', label: 'Service revenue' }
]

export default function SalesAnalytics() {
  const [year, setYear] = useState('')
  const [metric, setMetric] = useState('total')
  const { data, loading, error, reload } = useAnalytics('sales', { year })
  const inv = useAnalytics('inventory')

  const series = BRANCHES.map((b) => ({ key: b, label: b, color: branchColor(b) }))
  const bars = (data?.monthly || []).map((m) => ({
    label: fmtMonth(m.month) + (m.partial ? '*' : ''),
    values: Object.fromEntries(BRANCHES.map((b) => [b, m.branches[b]?.[metric] || 0]))
  }))
  const k = data?.kpis
  const stock = inv.data
  const invItems = stock?.items || []
  const moverList = (kind) => invItems.filter((i) => i.movement === kind)
    .sort((a, b) => (kind === 'fast' ? b.avgMonthlyUnits - a.avgMonthlyUnits : a.avgMonthlyUnits - b.avgMonthlyUnits) || a.name.localeCompare(b.name))
    .slice(0, 8)
  const stockBars = (stock?.stockOuts?.monthly || []).map((m) => ({ label: fmtMonth(m.month), values: m.branches }))
  const trendClass = (n) => (n === null || n === undefined ? '' : n >= 0 ? 'trend-up' : 'trend-down')

  return (
    <main id="main-content" tabIndex={-1} className="content">
      <div className="content-header">
        <h1>Branch performance comparison</h1>
        <div className="header-filters">
          <div className="select-wrapper">
            <select value={data?.year ?? year} onChange={(e) => setYear(e.target.value)} aria-label="Year">
              {(data?.years || [new Date().getFullYear()]).map((y) => <option key={y}>{y}</option>)}
            </select>
            <Chevron />
          </div>
        </div>
      </div>

      {error && <div className="load-error">Could not load the analytics. <button type="button" className="link-btn" onClick={reload}>Try again</button></div>}
      {data?.asOf?.month && <p className="as-of">Data recorded up to {data.asOf.latestDate}. KPIs cover {fmtMonth(k.window.from, true)} to {fmtMonth(k.window.to, true)}.</p>}

      <div className="stats-grid">
        {BRANCHES.map((b) => (
          <div className="stat-card" key={b}>
            <p className="stat-label">{b} · sales {data?.year}</p>
            <p className="stat-value">{loading ? '…' : fmtMoney(data?.perBranch[b]?.total)}</p>
            <p className="stat-sub">{fmtNum(data?.perBranch[b]?.serviceTxns)} service transactions · profit {fmtMoney(data?.perBranch[b]?.profit)}</p>
          </div>
        ))}
      </div>

      <div className="analytics-grid">
        <div className="chart-card">
          <div className="chart-card-header">
            <h2>Sales by Branch</h2>
            <div className="select-wrapper">
              <select value={metric} onChange={(e) => setMetric(e.target.value)} aria-label="Measure">
                {METRICS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
              <Chevron />
            </div>
          </div>
          {loading ? <div className="skeleton" style={{ height: 260 }} /> : bars.length ? (
            <>
              <BarChart data={bars} series={series} format={fmtMoney} />
              <Legend items={series} />
              {(data?.monthly || []).some((m) => m.partial) && <p className="accuracy-note">* The latest month is still running, so its bars are totals so far.</p>}
            </>
          ) : <p className="empty-state">No sales data for this year.</p>}
        </div>

        <div className="chart-card kpi-card">
          <h2>KPIs · last 3 months</h2>
          <div className="kpi-list">
            <div className="kpi-block">
              <p className="kpi-label">Avg daily transactions</p>
              <p className="kpi-value">{fmtNum(k?.avgDailyTransactions)}</p>
            </div>
            <div className="kpi-block">
              <p className="kpi-label">Top service category</p>
              <p className="kpi-value">{k?.topServiceCategory || '—'}</p>
            </div>
            <div className="kpi-block">
              <p className="kpi-label">Revenue growth</p>
              <p className={`kpi-value ${trendClass(k?.revenueGrowth)}`}>{fmtPct(k?.revenueGrowth)}</p>
              <p className="stat-sub">{fmtMoney(k?.revenue)} vs {fmtMoney(k?.previousRevenue)} in the 3 months before</p>
            </div>
          </div>
        </div>
      </div>

      <div className="table-card">
        <h2>Monthly growth rate</h2>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Month</th><th>Total revenue</th><th>Growth vs previous month</th></tr></thead>
            <tbody>
              {(data?.monthly || []).map((m) => (
                <tr key={m.month}>
                  <td>{fmtMonth(m.month, true)}{m.partial ? ' (so far)' : ''}</td>
                  <td>{fmtMoney(m.total)}</td>
                  <td className={trendClass(m.growthRate)}>{fmtPct(m.growthRate)}</td>
                </tr>
              ))}
              {!loading && !data?.monthly?.length && <tr><td colSpan="3" className="empty-state">No data for this year.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="table-card">
        <h2>Top performing products / services</h2>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Item</th><th>Category</th><th>Branch</th><th>Revenue</th><th>Trend</th></tr></thead>
            <tbody>
              {(data?.topItems || []).map((t) => (
                <tr key={`${t.kind}-${t.item}-${t.branch}`}>
                  <td>{t.item} <small className="muted-inline">({t.kind})</small></td>
                  <td>{t.category}</td>
                  <td>{t.branch}</td>
                  <td>{fmtMoney(t.revenue)}</td>
                  <td className={trendClass(t.trendPct)}>{fmtPct(t.trendPct)}</td>
                </tr>
              ))}
              {!loading && !data?.topItems?.length && <tr><td colSpan="5" className="empty-state">No product/service data yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="analytics-grid">
        {[['Most availed services', data?.mostAvailedServices], ['Least availed services', data?.leastAvailedServices]].map(([title, list]) => (
          <div className="table-card" key={title}>
            <h2>{title} · {data?.year}</h2>
            <div className="table-scroll">
              <table>
                <thead><tr><th>Service</th><th>Transactions</th><th>Revenue</th></tr></thead>
                <tbody>
                  {(list || []).map((s) => (
                    <tr key={s.service}><td>{s.service}</td><td>{fmtNum(s.transactions)}</td><td>{fmtMoney(s.revenue)}</td></tr>
                  ))}
                  {!loading && !list?.length && <tr><td colSpan="3" className="empty-state">No services recorded.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
      <h2 className="section-title">Inventory analytics</h2>
      {inv.error && <div className="load-error">Could not load the inventory analytics. <button type="button" className="link-btn" onClick={inv.reload}>Try again</button></div>}
      {stock?.window && <p className="as-of">Movement is judged on {fmtMonth(stock.window.from, true)} to {fmtMonth(stock.window.to, true)} (average units sold a month, fast / slow = top / bottom third of each category).</p>}
      <div className="stats-grid">
        {BRANCHES.map((b) => {
          const s = stock?.summary?.[b]
          return (
            <div className="stat-card" key={b}>
              <p className="stat-label">{b} · stock</p>
              <p className="stat-value">{inv.loading ? '…' : `${fmtNum(stock?.stockOuts?.total?.[b] ?? 0)} stock-outs`}</p>
              <p className="stat-sub">last {stock?.stockOuts?.months || 12} months · {fmtNum(s?.lowStock)} items at or below reorder point now</p>
              <p className="stat-sub">{fmtNum(s?.fast)} fast · {fmtNum(s?.moderate)} moderate · {fmtNum(s?.slow)} slow-moving</p>
            </div>
          )
        })}
      </div>

      <div className="analytics-grid">
        <div className="chart-card">
          <h2>Stock-out frequency</h2>
          {inv.loading ? <div className="skeleton" style={{ height: 260 }} /> : stockBars.length ? (
            <>
              <BarChart data={stockBars} series={series} format={fmtNum} />
              <Legend items={series} />
              <p className="accuracy-note">A stock-out is a day a product's stock reached zero after a day it had some.</p>
            </>
          ) : <p className="empty-state">No stock movements recorded yet.</p>}
        </div>
        <div className="table-card">
          <h2>Most often out of stock</h2>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Product</th><th>Branch</th><th>Times</th></tr></thead>
              <tbody>
                {(stock?.stockOuts?.worst || []).map((w) => <tr key={w.branch + w.name}><td>{w.name}</td><td>{w.branch}</td><td>{fmtNum(w.times)}</td></tr>)}
                {!inv.loading && !stock?.stockOuts?.worst?.length && <tr><td colSpan="3" className="empty-state">No stock-outs.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="analytics-grid">
        {[['Fast-moving products', 'fast'], ['Slow-moving products', 'slow']].map(([title, kind]) => (
          <div className="table-card" key={kind}>
            <h2>{title}</h2>
            <div className="table-scroll">
              <table>
                <thead><tr><th>Product</th><th>Branch</th><th>Avg units / month</th><th>Stock</th></tr></thead>
                <tbody>
                  {moverList(kind).map((i) => <tr key={i.productId + i.branch}><td>{i.name}</td><td>{i.branch}</td><td>{fmtNum(i.avgMonthlyUnits)}</td><td>{fmtNum(i.stock)}</td></tr>)}
                  {!inv.loading && !moverList(kind).length && <tr><td colSpan="4" className="empty-state">Nothing to show yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
