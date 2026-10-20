import React, { useState } from 'react'
import { BarChart, Legend } from '../../components/shared/charts'
import { branchColor, fmtChange, fmtMoney, fmtMonth, fmtNum, fmtPct, useAnalytics } from '../../hooks/useAnalytics'
import Chevron from '../../components/shared/Chevron'
import Highlights, { ChartInsight, moreOrLess } from '../../components/shared/Highlights'
import { seriesFacts } from '../../utils/insights'

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
  const trendClass = (n) => (n === null || n === undefined || Math.abs(n) < 0.05 ? '' : n > 0 ? 'trend-up' : 'trend-down')
  const per = data?.perBranch || {}
  const kpiPeriod = k?.window ? `${fmtMonth(k.window.from, true)} – ${fmtMonth(k.window.to, true)}` : ''
  const metricLabel = METRICS.find((m) => m.id === metric)?.label || ''
  const prevPeriod = k?.window?.previousFrom ? `${fmtMonth(k.window.previousFrom)} – ${fmtMonth(k.window.previousTo, true)}` : ''
  const period = data?.period
  const fmtDay = (iso, withYear) => new Date(`${iso}T00:00`).toLocaleDateString('en-US', withYear ? { month: 'short', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' })
  const periodLabel = period ? `${fmtDay(period.from)} – ${fmtDay(period.to)}` : ''
  const yoyText = (b) => {
    const p = per[b]
    if (!p) return ''
    if (p.openedOn || p.yoyGrowth === null) return p.share === null ? '' : `${p.share}% of the clinic's revenue`
    return null
  }

  // Under the year chart: best and lowest full month for the chosen measure, the recent direction, and the mix.
  const doneMonths = (data?.monthly || []).filter((m) => !m.partial)
  const sumOf = (m, field) => BRANCHES.reduce((n, b) => n + (m.branches[b]?.[field] || 0), 0)
  const yearFacts = seriesFacts(doneMonths.map((m) => ({ month: m.month, value: sumOf(m, metric) })))
  const yearSum = (field, b) => doneMonths.reduce((n, m) => n + (b ? m.branches[b]?.[field] || 0 : sumOf(m, field)), 0)
  const metricWord = metricLabel.toLowerCase()
  const yearInsight = yearFacts ? [
    <>Best month for {metricWord}: <b>{fmtMonth(yearFacts.best.month, true)}</b> ({fmtMoney(yearFacts.best.value)}). Lowest: <b>{fmtMonth(yearFacts.lowest.month, true)}</b> ({fmtMoney(yearFacts.lowest.value)}).</>,
    yearFacts.change !== null && <>The last 3 full months averaged <b>{fmtMoney(yearFacts.lastAvg)}</b> a month, {moreOrLess(yearFacts.change)} the 3 before.</>,
    metric === 'total' && yearSum('total') > 0
      ? <>Service fees made up <b>{fmtNum(yearSum('services') / yearSum('total') * 100)}%</b> of revenue and product sales <b>{fmtNum(yearSum('sales') / yearSum('total') * 100)}%</b>.</>
      : yearSum(metric) > 0 && <>Ibaan made <b>{fmtNum(yearSum(metric, 'Ibaan') / yearSum(metric) * 100)}%</b> of the {metricWord} and San Jose <b>{fmtNum(yearSum(metric, 'San Jose') / yearSum(metric) * 100)}%</b>.</>
  ] : []
  // Under the stock-outs chart: how often each branch ran out, the worst month, and whether it is getting better.
  const outMonths = stock?.stockOuts?.monthly || []
  const outFacts = seriesFacts(outMonths.map((m) => ({ month: m.month, value: BRANCHES.reduce((n, b) => n + (m.branches[b] || 0), 0) })))
  const outTotal = stock?.stockOuts?.total || {}
  const outTrend = outFacts?.change === null || outFacts?.change === undefined || Math.abs(outFacts.change) < 0.5 ? ''
    : outFacts.change > 0 ? ' (getting worse)' : ' (getting better)'
  const stockInsight = outFacts ? [
    <>In these {outMonths.length} months, {BRANCHES.filter((b) => b in outTotal).map((b, i) => <React.Fragment key={b}>{i ? ' and ' : ''}{b} ran out <b>{fmtNum(outTotal[b])} times</b></React.Fragment>)}.</>,
    outFacts.best.value > 0 && <>Most stock-outs: <b>{fmtMonth(outFacts.best.month, true)}</b> ({fmtNum(outFacts.best.value)}). Fewest: <b>{fmtMonth(outFacts.lowest.month, true)}</b> ({fmtNum(outFacts.lowest.value)}).</>,
    outFacts.change !== null && <>Stock-outs in the last 3 months: {moreOrLess(outFacts.change, 'more', 'fewer')} the 3 months before{outTrend}.</>
  ] : []

  // The page's main findings in plain sentences for the owner, built from the figures below.
  const ytd = BRANCHES.reduce((n, b) => n + (per[b]?.total || 0), 0)
  const done = (data?.monthly || []).filter((m) => !m.partial)
  const best = done.length ? done.reduce((x, m) => (m.total > x.total ? m : x)) : null
  const [ib, sj] = [per.Ibaan, per['San Jose']]
  const ticketGap = ib?.avgTicket && sj?.avgTicket ? (sj.avgTicket - ib.avgTicket) / ib.avgTicket * 100 : null
  const topProduct = data?.topProducts?.[0]
  const topService = data?.topServices?.[0]
  const worst = stock?.stockOuts?.worst?.[0]
  const highlights = data && !data.empty ? [
    {
      tone: 'info',
      text: <>{periodLabel}, {data.year}: the clinic earned <b>{fmtMoney(ytd)}</b> across both branches.</>
    },
    ...BRANCHES.filter((b) => per[b] && !per[b].openedOn && per[b].yoyGrowth !== null).map((b) => ({
      tone: per[b].yoyGrowth >= 0 ? 'up' : 'down',
      text: <>{b} is <b>{fmtPct(per[b].yoyGrowth)}</b> compared with the same dates last year ({fmtMoney(per[b].lastYear)}).</>
    })),
    best && { tone: 'up', text: <>Best month so far: <b>{fmtMonth(best.month, true)}</b>, with {fmtMoney(best.total)}.</> },
    ticketGap !== null && {
      tone: 'info',
      text: Math.abs(ticketGap) < 10
        ? <>Customers spend about the same per visit at both branches (<b>{fmtMoney(ib.avgTicket)}</b> Ibaan, <b>{fmtMoney(sj.avgTicket)}</b> San Jose). The difference between them is the number of visits.</>
        : <>San Jose customers spend <b>{fmtNum(Math.abs(ticketGap))}% {ticketGap > 0 ? 'more' : 'less'}</b> per visit than Ibaan ({fmtMoney(sj.avgTicket)} against {fmtMoney(ib.avgTicket)}).</>
    },
    (topProduct || topService) && {
      tone: 'up',
      text: <>Best sellers, {kpiPeriod}: {topProduct && <><b>{topProduct.item}</b> ({fmtNum(topProduct.count)} sold)</>}{topProduct && topService && ' and '}{topService && <><b>{topService.item}</b> ({fmtNum(topService.count)} visits)</>}.</>
    },
    worst && {
      tone: 'warn',
      text: <>Most often out of stock: <b>{worst.name}</b> at {worst.branch}, {fmtNum(worst.times)} times in the last {stock.stockOuts.months} months.</>
    }
  ] : []

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
      {data?.asOf?.month && <p className="as-of">Records up to {fmtDay(data.asOf.latestDate, true)}.</p>}

      <Highlights items={highlights} />

      <div className="stats-grid">
        {BRANCHES.map((b) => (
          <div className="stat-card" key={b}>
            <p className="stat-label">{b} revenue · {periodLabel}</p>
            <p className="stat-value">{loading ? '…' : fmtMoney(per[b]?.total)}</p>
            <p className="stat-sub">
              {yoyText(b) ?? <><span className={trendClass(per[b]?.yoyGrowth)}>{fmtPct(per[b]?.yoyGrowth)}</span> vs same dates of {data?.year - 1}</>}
            </p>
            <p className="stat-sub">Profit {fmtMoney(per[b]?.profit)} · {per[b]?.margin ?? '—'}% margin</p>
          </div>
        ))}
        <div className="stat-card">
          <p className="stat-label">Revenue · {kpiPeriod || 'last 3 months'}</p>
          <p className="stat-value">{loading ? '…' : fmtMoney(k?.revenue)}</p>
          <p className="stat-sub"><span className={trendClass(k?.revenueGrowth)}>{fmtPct(k?.revenueGrowth)}</span> vs the 3 months before ({fmtMoney(k?.previousRevenue)})</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Transactions per day · {kpiPeriod || 'last 3 months'}</p>
          <p className="stat-value">{loading ? '…' : fmtNum(k?.avgDailyTransactions)}</p>
          <p className="stat-sub">Sales and visits, both branches · top service category {k?.topServiceCategory ? k.topServiceCategory.toLowerCase() : '—'}</p>
        </div>
      </div>

      {/* Size-neutral figures: a smaller or newer branch is judged on how it does, not on how big it is. */}
      <div className="table-card section-card">
        <div className="card-head">
          <h2>Branch comparison</h2>
          <p className="card-note">{periodLabel}, {data?.year}. Average sale per transaction is revenue divided by product sales plus service visits; average per month counts only the months a branch had records.</p>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr><th>Branch</th><th className="num">Revenue</th><th className="num">Share</th><th className="num">Per month</th><th className="num">Per transaction</th><th className="num">Profit margin</th><th className="num">vs last year</th></tr>
            </thead>
            <tbody>
              {BRANCHES.filter((b) => per[b]).map((b) => (
                <tr key={b}>
                  <td><b>{b}</b></td>
                  <td className="num">{fmtMoney(per[b].total)}</td>
                  <td className="num">{per[b].share === null ? '—' : `${per[b].share}%`}</td>
                  <td className="num">{fmtMoney(per[b].perMonth)}</td>
                  <td className="num">{fmtMoney(per[b].avgTicket)}</td>
                  <td className="num">{per[b].margin === null ? '—' : `${per[b].margin}%`}</td>
                  <td className={`num ${trendClass(per[b].yoyGrowth)}`}>{per[b].openedOn ? '—' : fmtPct(per[b].yoyGrowth)}</td>
                </tr>
              ))}
              {!loading && !Object.keys(per).length && <tr><td colSpan="7" className="empty-state">No sales this year.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* The year month by month: the chart and the same months as figures, side by side and the same height. */}
      <div className="split split-even">
        <div className="chart-card">
          <div className="card-head card-head-row">
            <div>
              <h2>{metricLabel} by branch · {data?.year}</h2>
              <p className="card-note">Each pair of bars is one month</p>
            </div>
            <div className="select-wrapper">
              <select value={metric} onChange={(e) => setMetric(e.target.value)} aria-label="Measure">
                {METRICS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
              <Chevron />
            </div>
          </div>
          {loading ? <div className="skeleton" style={{ height: 340 }} /> : bars.length ? (
            <>
              <BarChart data={bars} series={series} format={fmtMoney} height={340} fill />
              <Legend items={series} />
              {(data?.monthly || []).some((m) => m.partial) && <p className="accuracy-note">* The latest month is still running, so its bars are totals so far.</p>}
              <ChartInsight items={yearInsight} />
            </>
          ) : <p className="empty-state">No sales data for this year.</p>}
        </div>

        <div className="table-card">
          <div className="card-head">
            <h2>Monthly revenue growth</h2>
            <p className="card-note">Month-over-month (MoM) compares each month with the one before it; year-over-year (YoY) compares it with the same month last year. Green is growth, red is a decline.</p>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Month</th><th className="num">Revenue</th><th className="num">Month-over-month</th><th className="num">Year-over-year</th></tr></thead>
              <tbody>
                {(data?.monthly || []).map((m, i, all) => {
                  // Each change in words, with the amount it is measured against, so the owner can see where it comes from.
                  const before = all[i - 1]
                  const [y, mo] = m.month.split('-').map(Number)
                  const lastYearKey = `${y - 1}-${String(mo).padStart(2, '0')}`
                  return (
                    <tr key={m.month}>
                      <td>{fmtMonth(m.month)}{m.partial ? ' (so far)' : ''}</td>
                      <td className="num">{fmtMoney(m.total)}</td>
                      <td className={`num ${trendClass(m.growthRate)}`}>
                        {m.growthRate === null ? '—' : fmtChange(m.growthRate, 1)}
                        {before && <small className="cell-sub">{fmtMoney(before.total)} in {fmtMonth(before.month)}</small>}
                      </td>
                      <td className={`num ${m.lastYear ? trendClass(m.yoyGrowth) : ''}`}>
                        {m.lastYear ? fmtChange(m.yoyGrowth, m.lastYear) : '—'}
                        <small className="cell-sub">{m.lastYear ? `${fmtMoney(m.lastYear)} in ${fmtMonth(lastYearKey, true)}` : 'No sales then'}</small>
                      </td>
                    </tr>
                  )
                })}
                {!loading && !data?.monthly?.length && <tr><td colSpan="4" className="empty-state">No data for this year.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Ranked apart: services earn far more per line, so one mixed list hid the products. */}
      <div className="split split-even">
        {[['Top products', 'Sold', data?.topProducts, 'units sold', 'sold'], ['Top services', 'Visits', data?.topServices, 'visits', 'visits']].map(([title, unit, list, counted, word]) => (
          <div className="table-card" key={title}>
            <div className="card-head">
              <h2>{title}</h2>
              <p className="card-note">Ranked by most {counted} in {kpiPeriod}. The last column compares each with {prevPeriod || 'the 3 months before'}.</p>
            </div>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="rank" aria-label="Rank">#</th>
                    <th>{title === 'Top products' ? 'Product' : 'Service'}</th>
                    <th className="num">{unit}</th>
                    <th className="num">Revenue</th>
                    <th className="num">vs {prevPeriod || 'before'}</th>
                  </tr>
                </thead>
                <tbody>
                  {(list || []).map((t, i) => (
                    <tr key={`${t.item}-${t.branch}`}>
                      <td className="rank">{i + 1}</td>
                      <td>{t.item}<small className="cell-sub">{t.category.toLowerCase()} · {t.branch}</small></td>
                      <td className="num">{fmtNum(t.count)}</td>
                      <td className="num">{fmtMoney(t.revenue)}</td>
                      <td className={`num ${trendClass(t.trendPct)}`}>
                        {fmtChange(t.trendPct, t.previous)}
                        <small className="cell-sub">{t.previous ? `${fmtNum(t.previous)} ${word} then` : `none ${word} then`}</small>
                      </td>
                    </tr>
                  ))}
                  {!loading && !list?.length && <tr><td colSpan="5" className="empty-state">Nothing recorded in this period.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      <div className="split split-even">
        {[['Most availed services', data?.mostAvailedServices, 'The services people came in for most'], ['Least availed services', data?.leastAvailedServices, 'Services that were rarely used: worth reviewing']].map(([title, list, note]) => (
          <div className="table-card" key={title}>
            <div className="card-head">
              <h2>{title}</h2>
              <p className="card-note">{note}, {data?.year}.</p>
            </div>
            <div className="table-scroll">
              <table className="data-table">
                <thead><tr><th>Service</th><th className="num">Visits</th><th className="num">Revenue</th></tr></thead>
                <tbody>
                  {(list || []).map((s) => (
                    <tr key={s.service}><td>{s.service}<small className="cell-sub">{s.category?.toLowerCase()}</small></td><td className="num">{fmtNum(s.transactions)}</td><td className="num">{fmtMoney(s.revenue)}</td></tr>
                  ))}
                  {!loading && !list?.length && <tr><td colSpan="3" className="empty-state">No services recorded.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      <div className="section-head">
        <h2 className="section-title">Stock</h2>
        {stock?.window && <p className="card-note">Fast and slow are judged on average units sold a month, {fmtMonth(stock.window.from, true)} to {fmtMonth(stock.window.to, true)}: the top and bottom third of each category.</p>}
      </div>
      {inv.error && <div className="load-error">Could not load the inventory analytics. <button type="button" className="link-btn" onClick={inv.reload}>Try again</button></div>}
      <div className="stats-grid">
        {BRANCHES.map((b) => {
          const st = stock?.summary?.[b]
          return (
            <div className="stat-card" key={b}>
              <p className="stat-label">{b} stock-outs · last {stock?.stockOuts?.months || 12} months</p>
              <p className="stat-value">{inv.loading ? '…' : fmtNum(stock?.stockOuts?.total?.[b] ?? 0)}</p>
              <p className="stat-sub">{fmtNum(st?.lowStock)} items at or below their reorder point now</p>
              <p className="stat-sub">{fmtNum(st?.fast)} fast · {fmtNum(st?.moderate)} moderate · {fmtNum(st?.slow)} slow-moving</p>
            </div>
          )
        })}
      </div>

      <div className="split split-wide">
        <div className="chart-card">
          <div className="card-head">
            <h2>Stock-outs by month</h2>
            <p className="card-note">How many times a product ran out. A stock-out is a day its stock reached zero.</p>
          </div>
          {inv.loading ? <div className="skeleton" style={{ height: 300 }} /> : stockBars.length ? (
            <>
              <BarChart data={stockBars} series={series} format={fmtNum} height={300} fill />
              <Legend items={series} />
              <ChartInsight items={stockInsight} />
            </>
          ) : <p className="empty-state">No stock movements recorded yet.</p>}
        </div>
        <div className="table-card">
          <div className="card-head">
            <h2>Most often out of stock</h2>
            <p className="card-note">Order these earlier or keep more on the shelf.</p>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Product</th><th className="num">Times</th></tr></thead>
              <tbody>
                {(stock?.stockOuts?.worst || []).map((w) => <tr key={w.branch + w.name}><td>{w.name}<small className="cell-sub">{w.branch}</small></td><td className="num">{fmtNum(w.times)}</td></tr>)}
                {!inv.loading && !stock?.stockOuts?.worst?.length && <tr><td colSpan="2" className="empty-state">No stock-outs.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="split split-even">
        {[['Fast-moving products', 'fast', 'Selling quickest for their category: keep these stocked.'], ['Slow-moving products', 'slow', 'Selling slowest for their category: order less or promote.']].map(([title, kind, note]) => (
          <div className="table-card" key={kind}>
            <div className="card-head">
              <h2>{title}</h2>
              <p className="card-note">{note}</p>
            </div>
            <div className="table-scroll">
              <table className="data-table">
                <thead><tr><th>Product</th><th className="num">Sold / month</th><th className="num">In stock</th></tr></thead>
                <tbody>
                  {moverList(kind).map((i) => <tr key={i.productId + i.branch}><td>{i.name}<small className="cell-sub">{i.branch}</small></td><td className="num">{fmtNum(i.avgMonthlyUnits)}</td><td className="num">{fmtNum(i.stock)}</td></tr>)}
                  {!inv.loading && !moverList(kind).length && <tr><td colSpan="3" className="empty-state">Nothing to show yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
