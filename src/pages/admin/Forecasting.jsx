import React, { useMemo, useState } from 'react'
import { LineChart } from '../../components/shared/charts'
import { fmtMoney, fmtMonth, fmtNum, useAnalytics } from '../../hooks/useAnalytics'
import '../../styles/admin/forecasting.css'
import Chevron from '../../components/shared/Chevron'

const BRANCHES = ['Ibaan', 'San Jose']
const MOVEMENT = { fast: 'Fast-moving', moderate: 'Moderate', slow: 'Slow-moving' }

// While the forecast month is running: actual so far against the share of the forecast the elapsed days imply.
function PaceLine({ o, money }) {
  const { soFar, dayOfMonth, daysInMonth } = o.inProgress
  const expected = (o.forecast * dayOfMonth) / daysInMonth
  const pct = expected > 0 ? ((soFar - expected) / expected) * 100 : null
  const show = (n) => (money ? fmtMoney(n) : fmtNum(n))
  return (
    <p className="stat-sub">
      So far {show(soFar)} after {dayOfMonth} of {daysInMonth} days
      {pct !== null && <> · <span className={pct >= 0 ? 'trend-up' : 'trend-down'}>{pct >= 0 ? 'ahead of' : 'behind'} pace by {Math.abs(pct).toFixed(0)}%</span></>}
    </p>
  )
}

function accuracyText(a) {
  if (!a || a.mae === null) return 'Not enough history to measure accuracy yet.'
  const mape = a.mape === null ? 'n/a' : `${fmtNum(a.mape)}%`
  const wape = a.wape === null || a.wape === undefined ? '' : `, WAPE ${fmtNum(a.wape)}%`
  return `Back-tested on ${a.months} past months: MAE ${fmtNum(a.mae)}, MAPE ${mape}${wape}.`
}

export default function Forecasting() {
  const [branch, setBranch] = useState('All Branches')
  const [kind, setKind] = useState('products')
  const [search, setSearch] = useState('')
  const [pickedId, setPickedId] = useState(null)
  const { data, loading, error, reload } = useAnalytics('forecast', { branch })

  const list = data?.[kind] || []
  const isProduct = kind === 'products'
  const term = search.trim().toLowerCase()
  const matches = useMemo(
    () => (term ? list.filter((p) => p.name.toLowerCase().includes(term)).slice(0, 8) : []),
    [list, term]
  )
  const selected = useMemo(() => {
    if (!list.length) return null
    return list.find((p) => p.id === pickedId) || [...list].sort((a, b) => b.avgPerMonth - a.avgPerMonth)[0]
  }, [list, pickedId])

  const forecastMonth = data?.method?.forecastMonth
  const lag = data?.asOf?.latestDate ? Math.floor((Date.now() - new Date(data.asOf.latestDate)) / 86400000) : 0
  const stale = lag > 35 ? lag : 0
  const points = selected
    ? [
        ...selected.recent.map((r) => ({ label: fmtMonth(r.month), actual: r.units })),
        { label: fmtMonth(forecastMonth), forecast: selected.forecast }
      ]
    : []

  return (
    <main id="main-content" tabIndex={-1} className="content">
      <div className="content-header">
        <h1>Demand forecasting</h1>
        <div className="select-wrapper">
          <select value={branch} onChange={(e) => { setBranch(e.target.value); setPickedId(null) }} aria-label="Branch">
            <option>All Branches</option>
            {BRANCHES.map((b) => <option key={b}>{b}</option>)}
          </select>
          <Chevron />
        </div>
      </div>

      {error && <div className="load-error">Could not load the forecast. <button type="button" className="link-btn" onClick={reload}>Try again</button></div>}
      {data?.method && (
        <p className="as-of">
          {data.method.name} of the previous {data.method.windowMonths} complete months
          ({fmtMonth(data.method.basedOn.from, true)} to {fmtMonth(data.method.basedOn.to, true)}), projecting {fmtMonth(forecastMonth, true)}.
          Last record {data.asOf.latestDate}.
        </p>
      )}

      {stale && <p className="load-warn" role="status">The latest record is {stale} days old, so the forecast is built on history that may be out of date.</p>}

      <h2 className="section-title">Overall outlook · {fmtMonth(forecastMonth, true)}</h2>
      <div className="stats-grid">
        {data && Object.values(data.overall).map((o) => (
          <div className="stat-card" key={o.label}>
            <p className="stat-label">{o.label}</p>
            <p className="stat-value">{o.label.includes('PHP') ? fmtMoney(o.forecast) : fmtNum(o.forecast)}</p>
            <p className="stat-sub">Predicted for {fmtMonth(forecastMonth)}</p>
            {o.inProgress && <PaceLine o={o} money={o.label.includes('PHP')} />}
            <p className="stat-sub">{accuracyText(o.accuracy)}</p>
          </div>
        ))}
        {loading && <div className="skeleton" style={{ height: 110 }} />}
      </div>

      <h2 className="section-title">By item</h2>
      <div className="forecast-picker">
        <div className="select-wrapper">
          <select value={kind} onChange={(e) => { setKind(e.target.value); setPickedId(null); setSearch('') }} aria-label="Item type">
            <option value="products">Products</option>
            <option value="services">Services</option>
          </select>
          <Chevron />
        </div>
        <div className="search-wrapper forecast-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input type="text" aria-label={`Search ${isProduct ? 'product' : 'service'}`} autoComplete="off" placeholder={`search ${isProduct ? 'product' : 'service'}...`} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      {matches.length > 0 && (
        <ul className="search-results">
          {matches.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => { setPickedId(m.id); setSearch('') }}>
                <span>{m.name}</span><small>{m.category}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
      {term && matches.length === 0 && <p className="empty-state">No {kind} match “{search}”.</p>}

      {selected ? (
        <>
          <p className="section-title" style={{ marginBottom: 12 }}>
            {selected.name} <span className={`pill pill-${selected.movement}`}>{MOVEMENT[selected.movement]}</span>
          </p>
          <div className="stats-grid">
            <div className="stat-card">
              <p className="stat-label">Stock right now</p>
              <p className="stat-value">{isProduct ? fmtNum(selected.stock) : 'n/a'}</p>
              {!isProduct && <p className="stat-sub">Services have no stock</p>}
            </div>
            <div className="stat-card">
              <p className="stat-label">Average {isProduct ? 'sold' : 'availed'} per month</p>
              <p className="stat-value">{fmtNum(selected.avgPerMonth)}</p>
            </div>
            <div className="stat-card">
              <p className="stat-label">Predicted need next month</p>
              <p className="stat-value">{fmtNum(selected.forecast)}</p>
            </div>
          </div>

          {selected.avgPerMonth < 5 && <p className="accuracy-note">Low volume: under 5 {isProduct ? 'units sold' : 'visits'} a month, so one sale moves this forecast a lot. Treat it as a rough guide.</p>}

          <h2 className="section-title">Monthly {isProduct ? 'sales' : 'demand'} — last {selected.recent.length} months + prediction</h2>
          <div className="month-strip">
            <div className="month-cells">
              {selected.recent.map((r) => (
                <div className="month-cell" key={r.month}>
                  <p className="month-cell-label">{fmtMonth(r.month, true)}</p>
                  <p className="month-cell-value">{fmtNum(r.units)}</p>
                </div>
              ))}
              <div className="month-cell is-forecast">
                <p className="month-cell-label">{fmtMonth(forecastMonth, true)} (forecast)</p>
                <p className="month-cell-value">{fmtNum(selected.forecast)}</p>
              </div>
            </div>
          </div>

          <div className="forecast-grid">
            <div className="chart-card">
              <h2>{isProduct ? 'Sales' : 'Demand'} trend</h2>
              <LineChart points={points} format={fmtNum} />
              <p className="accuracy-note">{accuracyText(selected.accuracy)} The dashed line and hollow dot are the forecast. Lower error is better; MAPE skips months with zero actual sales.</p>
            </div>

            <div className="insight-col">
              {isProduct ? (
                <>
                  <div className="insight-card">
                    <div className="insight-body">
                      <p className="insight-title">You need to order</p>
                      <p className="insight-value">{fmtNum(selected.toOrder)} units</p>
                      <p className="insight-desc">Predicted need ({fmtNum(selected.forecast)}) minus stock on hand ({fmtNum(selected.stock)}), rounded up.</p>
                    </div>
                  </div>
                  <div className="insight-card">
                    <div className="insight-body">
                      <p className="insight-title">Stock after ordering</p>
                      <p className="insight-value">{fmtNum(selected.stockAfterOrder)} units</p>
                      <p className="insight-desc">Enough to cover next month's predicted sales.</p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="insight-card">
                  <div className="insight-body">
                    <p className="insight-title">Expected demand</p>
                    <p className="insight-value">{fmtNum(selected.forecast)} per month</p>
                    <p className="insight-desc">Use this to plan staff and appointment slots.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        !loading && <p className="empty-state">No {kind} sales history to forecast from yet.</p>
      )}

      {data?.accuracy && (
        <div className="table-card" style={{ marginTop: 24 }}>
          <h2>Forecast accuracy across all items</h2>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Group</th><th>Items scored</th><th>Average MAE</th><th>Average MAPE</th><th>WAPE (all items)</th></tr></thead>
              <tbody>
                {['products', 'services'].map((g) => (
                  <tr key={g}>
                    <td>{g === 'products' ? 'Products (units)' : 'Services (units)'}</td>
                    <td>{fmtNum(data.accuracy[g].count)}</td>
                    <td>{fmtNum(data.accuracy[g].mae)}</td>
                    <td>{data.accuracy[g].mape === null ? '—' : `${fmtNum(data.accuracy[g].mape)}%`}</td>
                    <td>{data.accuracy[g].wape === null ? '—' : `${fmtNum(data.accuracy[g].wape)}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="accuracy-note">Item-level demand is lumpy (most items sell only a few units a month), so MAPE is inflated by tiny slow months. WAPE (total error divided by total units sold) weighs every item by its volume and is the fairer score here.</p>
        </div>
      )}
    </main>
  )
}
