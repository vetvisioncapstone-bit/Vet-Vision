import { Link } from 'react-router-dom'
import React, { useRef, useState } from 'react'
import { BarChart, Donut, Legend } from '../../components/shared/charts'
import Highlights, { ChartInsight, moreOrLess } from '../../components/shared/Highlights'
import { seriesFacts } from '../../utils/insights'
import { BRANCH_COLORS, branchColor, fmtChange, fmtClock, fmtMoney, fmtMonth, fmtNum, fmtPct, useAnalytics } from '../../hooks/useAnalytics'

const BRANCHES = ['Ibaan', 'San Jose']
const fmtDay = (iso) => new Date(`${iso}T00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
// '2026-09-01'..'2026-09-30' -> 'Sep 1 – 30, 2026'; across months 'Aug 25 – Sep 3, 2026'.
function fmtRange(from, to) {
  if (!from || !to) return ''
  const [a, b] = [new Date(`${from}T00:00`), new Date(`${to}T00:00`)]
  const end = a.getMonth() === b.getMonth() ? b.getDate() : fmtDay(to)
  return `${fmtDay(from)} – ${end}, ${b.getFullYear()}`
}

function Trend({ pct, label }) {
  if (pct === null || pct === undefined) return <span className="stat-change muted">Nothing to compare with yet</span>
  return <span className={`stat-change ${pct >= 0 ? 'positive' : 'negative'}`}>{fmtPct(pct)} vs {label}</span>
}

export default function Dashboard() {
  const [branch, setBranch] = useState('All Branches')
  const [month, setMonth] = useState('') // '' = the latest month; else 'YYYY-MM' for a past one
  const { data, loading, error, reload, updatedAt } = useAnalytics('overview', { branch, month })
  const live = useAnalytics('live', { branch, month })
  const past = Boolean(month)
  // Keep the month list while another month loads, so the picker does not empty and jump back to "Latest".
  const knownMonths = useRef([])
  if (data?.months) knownMonths.current = data.months
  // Year and month are picked separately: the years that have records, then that year's months with records.
  // The newest month is the default view ('' in state), so choosing it goes back to "latest".
  const latest = knownMonths.current[0] || ''
  const shown = month || latest
  const monthsByYear = Map.groupBy(knownMonths.current, (m) => m.slice(0, 4)) // newest first
  const go = (m) => setMonth(m === latest ? '' : m)

  const asOf = data?.asOf?.month ? fmtMonth(data.asOf.month, true) : null
  const partial = Boolean(data?.asOf?.partial)
  const kpis = data?.kpis
  const seriesBranches = branch === 'All Branches' ? BRANCHES : [branch]
  const series = seriesBranches.map((b) => ({ key: b, label: b, color: branchColor(b) }))
  const bars = (data?.trend || []).map((t) => ({ label: fmtMonth(t.month) + (t.partial ? '*' : ''), values: t.branches }))
  const share = (data?.branchShare || []).map((s) => ({ label: s.branch, value: s.total, color: branchColor(s.branch) }))
  // Under the 12-month chart: best and lowest full month, the last 3 months against the 3 before, the branch split.
  const doneTrend = (data?.trend || []).filter((t) => !t.partial)
  const rev = seriesFacts(doneTrend.map((t) => ({ month: t.month, value: t.total || 0 })))
  const trendSum = (b) => doneTrend.reduce((n, t) => n + (t.branches?.[b] || 0), 0)
  const trendTotal = doneTrend.reduce((n, t) => n + (t.total || 0), 0)
  const revenueInsight = rev ? [
    <>Best month: <b>{fmtMonth(rev.best.month, true)}</b> ({fmtMoney(rev.best.value)}). Lowest: <b>{fmtMonth(rev.lowest.month, true)}</b> ({fmtMoney(rev.lowest.value)}).</>,
    rev.change !== null && <>The last 3 full months averaged <b>{fmtMoney(rev.lastAvg)}</b> a month, {moreOrLess(rev.change)} the 3 months before ({fmtMoney(rev.beforeAvg)}).</>,
    branch === 'All Branches' && trendTotal > 0 && <>Over these months Ibaan earned <b>{fmtNum(trendSum('Ibaan') / trendTotal * 100)}%</b> of the revenue and San Jose <b>{fmtNum(trendSum('San Jose') / trendTotal * 100)}%</b>.</>
  ] : []
  // Under the branch share: what each branch earns per transaction, and how much busier one is.
  const perTxn = (data?.branchShare || []).filter((s) => s.transactions).map((s) => ({ ...s, avg: s.total / s.transactions }))
  const busier = [...perTxn].sort((a, b) => b.transactions - a.transactions)
  const shareInsight = perTxn.length > 1 ? [
    <>Per transaction, {perTxn.map((s, i) => <React.Fragment key={s.branch}>{i ? ' and ' : ''}{s.branch} earns <b>{fmtMoney(s.avg)}</b></React.Fragment>)}.</>,
    <>{busier[0].branch} had <b>{fmtNum(busier[0].transactions / busier[1].transactions)}×</b> as many transactions as {busier[1].branch}.</>
  ] : perTxn.length === 1 ? [<>{perTxn[0].branch} earned <b>{fmtMoney(perTxn[0].avg)}</b> per transaction from {fmtNum(perTxn[0].transactions)} transactions.</>] : []

  // The page's numbers in plain sentences for the owner, built from the same figures the cards show.
  const period = asOf ? `${asOf}${partial ? ' so far' : ''}` : ''
  const pctOf = (b) => (kpis?.totalSales ? (data.branchShare.find((s) => s.branch === b)?.total || 0) / kpis.totalSales * 100 : 0)
  const topService = data?.topServices?.[0]
  const hasGrowth = kpis?.growthRate !== null && kpis?.growthRate !== undefined
  const highlights = kpis ? [
    {
      tone: !hasGrowth ? 'info' : kpis.growthRate >= 0 ? 'up' : 'down',
      text: <>{period}: <b>{fmtMoney(kpis.totalSales)}</b> in revenue{hasGrowth ? <>, <b>{fmtPct(kpis.growthRate)}</b> compared with {data.comparison.label}</> : ''}.</>
    },
    share.length > 1 && {
      tone: 'info',
      text: <>Ibaan brought in <b>{fmtNum(pctOf('Ibaan'))}%</b> of it and San Jose <b>{fmtNum(pctOf('San Jose'))}%</b>.</>
    },
    topService && { tone: 'info', text: <>Most availed service: <b>{topService.service}</b>, {fmtNum(topService.count)} times at {topService.branch}.</> },
    kpis.lowStockItems
      ? { tone: 'warn', text: <><b>{fmtNum(kpis.lowStockItems)} product{kpis.lowStockItems === 1 ? '' : 's'}</b> need reordering, {fmtNum(kpis.outOfStockItems)} of them out of stock at a branch. <Link to="/admin/inventory?show=low">See them</Link></> }
      : { tone: 'up', text: <>Stock is healthy: nothing is below its reorder point.</> }
  ] : []

  return (
    <main id="main-content" tabIndex={-1} className="content">
      <div className="content-header">
        <h1>Overview</h1>
        <div className="dashboard-filters">
        <div className="branch-filter">
          <label htmlFor="yearSelect">Year:</label>
          <div className="select-wrapper">
            <select id="yearSelect" value={shown.slice(0, 4)} onChange={(e) => go(monthsByYear.get(e.target.value)[0])}>
              {[...monthsByYear.keys()].map((y) => <option key={y}>{y}</option>)}
            </select>
            <svg className="select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
          </div>
        </div>
        <div className="branch-filter">
          <label htmlFor="monthSelect">Month:</label>
          <div className="select-wrapper">
            <select id="monthSelect" value={shown} onChange={(e) => go(e.target.value)}>
              {[...(monthsByYear.get(shown.slice(0, 4)) || [])].reverse().map((m) => ( // January first
                <option key={m} value={m}>{new Date(`${m}-01T00:00`).toLocaleDateString('en-US', { month: 'long' })}{m === latest ? ' (latest)' : ''}</option>
              ))}
            </select>
            <svg className="select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
          </div>
        </div>
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
      </div>

      {error && (
        <div className="load-error">
          Could not load the analytics. <button type="button" className="link-btn" onClick={reload}>Try again</button>
        </div>
      )}
      {data?.empty && <p className="empty-state">No sales or service records yet.</p>}
      {asOf && past && (
        <p className="as-of">
          Viewing {asOf} (a past month) ·{' '}
          <button type="button" className="link-btn" onClick={() => setMonth('')}>Back to the latest month</button>
        </p>
      )}
      {asOf && !past && (
        <p className="as-of">
          <span className="live-badge" title="Refreshes automatically"><i />Live</span>
          {partial ? `${asOf} so far` : asOf} · last record {data.asOf.latestDate}
          {updatedAt ? ` · updated ${fmtClock(updatedAt)}` : ''}
          {!live.data?.isToday && live.data && ' · no records yet today'}
        </p>
      )}

      <div className="stats-grid">
        {/* Each card opens the page with its details. */}
        <Link className="stat-card stat-card-link" to="/admin/sales-analytics" title="Open Sales analytics">
          <p className="stat-label">Total revenue{partial ? ' · month to date' : ''}</p>
          <p className="stat-value">{loading ? '…' : fmtMoney(kpis?.totalSales)}</p>
          {kpis && <Trend pct={kpis.growthRate} label={data.comparison.label} />}
          <p className="stat-sub">Product sales + service fees</p>
        </Link>
        <Link className="stat-card stat-card-link" to="/admin/patients" title="Open Patients">
          <p className="stat-label">Customers served</p>
          <p className="stat-value">{loading ? '…' : fmtNum(kpis?.clientsServed)}</p>
          <p className="stat-sub">Pet owners who bought or visited{partial ? ' this month so far' : ''} (walk-ins not counted)</p>
        </Link>
        <Link className={`stat-card stat-card-link${kpis?.lowStockItems ? ' alert' : ''}`} to="/admin/inventory?show=low" title="Open these items in Inventory">
          <p className="stat-label">Products to reorder{past ? ` · end of ${asOf}` : ''}</p>
          <p className="stat-value">{loading ? '…' : fmtNum(kpis?.lowStockItems)}</p>
          {kpis && <p className="stat-sub">At or below the reorder point at a branch · {fmtNum(kpis.outOfStockItems)} out of stock, of {fmtNum(kpis.trackedItems)} products</p>}
        </Link>
        <Link className="stat-card stat-card-link" to="/admin/sales-analytics" title="Open the branch comparison">
          <p className="stat-label">Branch share of revenue</p>
          {data?.branchShare?.length > 1 ? (
            <>
              <p className="stat-value">
                {fmtNum((data.branchShare.find((b) => b.branch === 'Ibaan')?.total / data.kpis.totalSales) * 100)}% / {fmtNum((data.branchShare.find((b) => b.branch === 'San Jose')?.total / data.kpis.totalSales) * 100)}%
              </p>
              <p className="stat-sub">Ibaan / San Jose</p>
            </>
          ) : (
            <p className="stat-value muted">{loading ? '…' : '—'}</p>
          )}
        </Link>
      </div>

      <Highlights items={highlights} />

      {/* Row 1: the year's picture on the left; today and the branch split stacked beside it, same height. */}
      <div className="split split-wide">
        <div className="chart-card">
          <div className="card-head">
            <h2>Monthly revenue</h2>
            <p className="card-note">What each branch earned in each of the last 12 months</p>
          </div>
          {loading ? <div className="skeleton" style={{ height: 300 }} /> : bars.length ? (
            <>
              <BarChart data={bars} series={series} format={fmtMoney} height={300} fill />
              <Legend items={series} />
              {partial && <p className="accuracy-note">* {asOf} is still running, so its bar is the total so far.</p>}
              <ChartInsight items={revenueInsight} />
            </>
          ) : <p className="empty-state">No sales data yet.</p>}
        </div>

        <div className="stack">
          <div className="table-card">
            <div className="card-head card-head-row">
              <h2>{past || !live.data?.isToday ? 'Last recorded day' : 'Today'}{live.data?.today ? ` · ${fmtDay(live.data.today)}` : ''}</h2>
              {!past && live.data?.isToday && <span className="live-badge"><i />Live</span>}
            </div>
            {live.data?.totals ? (
              <div className="live-stats">
                <div><p className="stat-label">Revenue</p><p className="stat-value">{fmtMoney(live.data.totals.total)}</p></div>
                <div><p className="stat-label">Product sales</p><p className="stat-value">{fmtNum(live.data.totals.saleTxns)}</p></div>
                <div><p className="stat-label">Service visits</p><p className="stat-value">{fmtNum(live.data.totals.serviceTxns)}</p></div>
              </div>
            ) : <div className="skeleton" style={{ height: 70 }} />}
            {live.data?.byBranch && Object.keys(live.data.byBranch).length > 1 && (
              <p className="card-note">{Object.entries(live.data.byBranch).map(([b, v]) => `${b} ${fmtMoney(v.total)}`).join('  ·  ')}</p>
            )}
          </div>

          <div className="chart-card">
            <div className="card-head">
              <h2>Branch share</h2>
              <p className="card-note">Who earned what in {asOf || 'this month'}{partial ? ' so far' : ''}</p>
            </div>
            {share.length ? (
              <div className="donut-row">
                <Donut slices={share} format={fmtMoney} size={132} />
                <ul className="donut-list">
                  {data.branchShare.map((s) => (
                    <li key={s.branch}>
                      <i style={{ background: BRANCH_COLORS[s.branch] }} />
                      <span>{s.branch}<small>{fmtNum(s.transactions)} transactions</small></span>
                      <b>{fmtMoney(s.total)}</b>
                    </li>
                  ))}
                </ul>
              </div>
            ) : <p className="empty-state">{loading ? 'Loading…' : 'No branch data yet.'}</p>}
            {share.length > 0 && <ChartInsight items={shareInsight} />}
          </div>
        </div>
      </div>

      {/* Row 2: what is happening now, beside what people come in for. */}
      <div className="split split-wide">
        <div className="table-card">
          <div className="card-head">
            <h2>{past && asOf ? `Last transactions of ${asOf}` : 'Latest transactions'}</h2>
            <p className="card-note">The 10 most recent sales and visits</p>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>When</th><th>Type</th><th>Customer</th><th>Branch</th><th className="num">Amount</th></tr></thead>
              <tbody>
                {(live.data?.recent || []).map((t) => (
                  <tr key={t.id}>
                    <td>{fmtDay(t.date)}{t.time ? `, ${t.time}` : ''}</td>
                    <td>{t.kind === 'Visit' ? 'Service visit' : 'Product sale'}</td>
                    <td>{t.customer}</td>
                    <td>{t.branch}</td>
                    <td className="num">{fmtMoney(t.amount)}</td>
                  </tr>
                ))}
                {live.data && !live.data.recent.length && <tr><td colSpan="5" className="empty-state">Nothing recorded yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="table-card">
          <div className="card-head">
            <h2>Most availed services</h2>
            <p className="card-note">Ranked by most visits. The last column compares each service with the earlier dates.</p>
            {data?.current && (
              <dl className="date-chips">
                <div className="date-chip date-chip-now"><dt>Counted</dt><dd>{fmtRange(data.current.from, data.current.to)}</dd></div>
                <div className="date-chip"><dt>Compared with</dt><dd>{fmtRange(data.comparison.from, data.comparison.to)}</dd></div>
              </dl>
            )}
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th className="rank" aria-label="Rank">#</th><th>Service</th><th className="num">Times</th><th className="num">vs {data?.comparison ? fmtRange(data.comparison.from, data.comparison.to).replace(/, \d{4}$/, '') : 'before'}</th></tr></thead>
              <tbody>
                {(data?.topServices || []).map((s, i) => (
                  <tr key={`${s.service}-${s.branch}`}>
                    <td className="rank">{i + 1}</td>
                    <td>{s.service}<small className="cell-sub">{s.branch}</small></td>
                    <td className="num">{fmtNum(s.count)}</td>
                    <td className={`num ${!s.previous || s.changePct === null || Math.abs(s.changePct) < 0.05 ? '' : s.changePct > 0 ? 'trend-up' : 'trend-down'}`}>
                      {fmtChange(s.changePct, s.previous)}
                      <small className="cell-sub">{s.previous ? `${fmtNum(s.previous)} then` : 'none then'}</small>
                    </td>
                  </tr>
                ))}
                {!loading && !data?.topServices?.length && (
                  <tr><td colSpan="4" className="empty-state">No patient visits recorded yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  )
}
