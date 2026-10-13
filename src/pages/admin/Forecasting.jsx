import React, { useEffect, useMemo, useState } from 'react'
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

const pct = (n) => `${n > 0 ? '+' : ''}${fmtNum(n)}%`

// What the six-month average cannot see: last year's same month (a seasonal swing) and the recent trend. The forecast
// stays the Moving Average; this only tells the owner when to lean above or below it.
function SeasonalNote({ s, month, show, item }) {
  if (!s) return null
  const swing = s.seasonalChange !== null && (!item || (s.lastYear >= 5 && Math.abs(s.seasonalChange) >= 20))
  const trend = s.trendChange !== null && (!item || Math.abs(s.trendChange) >= 20)
  if (!swing && !trend) return item ? <p className="accuracy-note">Seasonal check: last year and the recent months give no reason to expect a different figure.</p> : null
  const lastYear = fmtMonth(month, false)
  if (!item) {
    return (
      <p className="stat-sub">
        {swing && <>Last {lastYear}: {pct(s.seasonalChange)} vs the 6 months before</>}{swing && trend && ' · '}
        {trend && <>last 3 months: <span className={s.trendChange >= 0 ? 'trend-up' : 'trend-down'}>{pct(s.trendChange)}</span></>}
      </p>
    )
  }
  return (
    <div className="seasonal-note" role="note">
      <p className="insight-title">Seasonal check</p>
      {swing && (
        <p>Last {lastYear} had {fmtNum(s.lastYear)}, {pct(s.seasonalChange)} against the 6 months before it.
          If this year repeats that, expect about <strong>{show(s.ifLikeLastYear)}</strong> instead of the average's figure.</p>
      )}
      {trend && (
        <p>{s.trendChange > 0 ? 'Rising' : 'Falling'}: the last 3 months are {pct(s.trendChange)} on the 3 before, so the six-month
          average may come out {s.trendChange > 0 ? 'low' : 'high'}.</p>
      )}
    </div>
  )
}

// Days the shelf was empty hide demand: customers who wanted the item then could not buy it, so those months'
// sales, and the average built on them, come out low. The forecast stays the Moving Average; this shows the gap.
function StockOutNote({ s }) {
  if (!s) return null
  const lost = s.lostUnits < 1 ? 'less than 1 unit' : `about ${fmtNum(Math.round(s.lostUnits))} units`
  return (
    <div className="seasonal-note" role="note">
      <p className="insight-title">Stock-outs</p>
      <p>Out of stock for {s.daysOut} day{s.daysOut === 1 ? '' : 's'} in the last 6 months (most in {fmtMonth(s.worstMonth, true)}: {s.worstDays} day{s.worstDays === 1 ? '' : 's'}).
        Sales probably lost then: {lost}. With those added back, the average gives <strong>{fmtNum(s.adjustedForecast)}</strong>.</p>
    </div>
  )
}

// How far off the forecast usually was when tested on past months, in plain words: MAPE is the usual miss in
// percent, MAE the usual miss in units or pesos (the two measures the study uses).
const RELIABILITY = [
  [10, 'Very reliable', 'rel-very'],
  [20, 'Reliable', 'rel-good'],
  [50, 'Rough guide', 'rel-rough'],
  [Infinity, 'Use your judgment', 'rel-judge']
]
const offBy = (a) => a.mape
const reliability = (a) => (a && offBy(a) !== null && offBy(a) !== undefined ? RELIABILITY.find(([max]) => offBy(a) < max) : null)

function Accuracy({ a, money, unit = 'units', block }) {
  const rel = reliability(a)
  if (!a || a.mae === null || !rel) return <p className={block ? 'accuracy-note' : 'stat-sub'}>Not enough history yet to test this forecast.</p>
  const miss = money ? fmtMoney(a.mae) : `about ${fmtNum(Math.round(a.mae))} ${unit}`
  return (
    <p className={block ? 'accuracy-note' : 'stat-sub'}>
      <span className={`rel-tag ${rel[2]}`}>{rel[1]}</span>{' '}
      Usually within {miss} of the actual ({fmtNum(offBy(a))}% off), tested on the past {a.months} months.
      <span className="metric-raw"> MAE {fmtNum(a.mae)} · MAPE {a.mape === null ? 'n/a' : `${fmtNum(a.mape)}%`}</span>
    </p>
  )
}

function MetricHelp() {
  return (
    <details className="metric-help">
      <summary>What do these accuracy figures mean?</summary>
      <p>Each forecast was tested on the past 12 months: the system forecast every one of those months from the 6 before it and compared that guess with what actually sold.</p>
      <ul>
        <li><strong>MAE</strong> (Mean Absolute Error): the usual size of a miss, in units or pesos. “Within about 12 units” means the guess is normally 12 above or below.</li>
        <li><strong>MAPE</strong> (Mean Absolute Percentage Error): the usual miss as a percentage of what sold. Slow items inflate it (1 sold against 3 forecast is 200% off), and months with no sales are skipped.</li>
      </ul>
      <p><span className="rel-tag rel-very">Very reliable</span> under 10% off · <span className="rel-tag rel-good">Reliable</span> 10–20% ·{' '}
        <span className="rel-tag rel-rough">Rough guide</span> 20–50% · <span className="rel-tag rel-judge">Use your judgment</span> over 50%. Lower is better.</p>
    </details>
  )
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
  // The item box is a search and a dropdown in one: focusing it lists every product (or service) by category, and
  // typing narrows the list. Arrow keys move through it, Enter picks, Escape closes.
  const [listOpen, setListOpen] = useState(false)
  const [active, setActive] = useState(0)
  const matches = useMemo(
    () => list.filter((p) => !term || p.name.toLowerCase().includes(term) || p.category.toLowerCase().includes(term))
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)),
    [list, term]
  )
  useEffect(() => { // keep the highlighted item in view while arrowing through a long list
    if (listOpen && matches[active]) document.getElementById(`fc-item-${matches[active].id}`)?.scrollIntoView({ block: 'nearest' })
  }, [active, listOpen, matches])
  function pick(item) {
    setPickedId(item.id)
    setSearch('')
    setListOpen(false)
  }
  function onSearchKey(e) {
    if (e.key === 'Escape') { setListOpen(false); setSearch(''); return }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setListOpen(true)
      setActive((i) => Math.max(0, Math.min(matches.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))))
    } else if (e.key === 'Enter' && listOpen && matches[active]) {
      e.preventDefault()
      pick(matches[active])
    }
  }
  const selected = useMemo(() => {
    if (!list.length) return null
    return list.find((p) => p.id === pickedId) || [...list].sort((a, b) => b.avgPerMonth - a.avgPerMonth)[0]
  }, [list, pickedId])

  const forecastMonth = data?.method?.forecastMonth
  const lag = data?.asOf?.latestDate ? Math.floor((Date.now() - new Date(data.asOf.latestDate)) / 86400000) : 0
  const stale = lag > 35 ? lag : 0
  // basedOn spans the whole history read (back-test included); the average itself uses only the last windowMonths.
  const windowFrom = (() => {
    if (!data?.method) return ''
    const [y, m] = data.method.basedOn.to.split('-').map(Number)
    const d = new Date(y, m - data.method.windowMonths, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })()
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
          ({fmtMonth(windowFrom, true)} to {fmtMonth(data.method.basedOn.to, true)}), projecting {fmtMonth(forecastMonth, true)}.
          Last record {data.asOf.latestDate}.
        </p>
      )}

      {stale > 0 && <p className="load-warn" role="status">The latest record is {stale} days old, so the forecast is built on history that may be out of date.</p>}

      <h2 className="section-title">Overall outlook · {fmtMonth(forecastMonth, true)}</h2>
      <div className="stats-grid">
        {data && Object.values(data.overall).map((o) => (
          <div className="stat-card" key={o.label}>
            <p className="stat-label">{o.label}</p>
            <p className="stat-value">{o.label.includes('PHP') ? fmtMoney(o.forecast) : fmtNum(o.forecast)}</p>
            <p className="stat-sub">Predicted for {fmtMonth(forecastMonth)}</p>
            {o.inProgress && <PaceLine o={o} money={o.label.includes('PHP')} />}
            <SeasonalNote s={o.seasonal} month={forecastMonth} />
            <Accuracy a={o.accuracy} money={o.label.includes('PHP')} unit="visits" />
          </div>
        ))}
        {loading && <div className="skeleton" style={{ height: 110 }} />}
      </div>
      <MetricHelp />

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
          <input type="text" role="combobox" aria-expanded={listOpen} aria-controls="forecast-items" aria-autocomplete="list"
            aria-activedescendant={listOpen && matches[active] ? `fc-item-${matches[active].id}` : undefined}
            aria-label={`Search or pick a ${isProduct ? 'product' : 'service'}`} autoComplete="off"
            placeholder={selected ? `${selected.name} · search or pick another ${isProduct ? 'product' : 'service'}…` : `Search or pick a ${isProduct ? 'product' : 'service'}…`}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setListOpen(true); setActive(0) }}
            onFocus={() => { setListOpen(true); setActive(0) }}
            onBlur={() => setListOpen(false)}
            onKeyDown={onSearchKey} />
          <button type="button" className="forecast-search-toggle" tabIndex={-1} aria-label={listOpen ? 'Close the list' : 'Show all'}
            onMouseDown={(e) => { e.preventDefault(); setListOpen((o) => !o) }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
          </button>
          {/* Drops down under the box, so picking an item does not push the page around. */}
          {listOpen && (
            <ul className="search-results" id="forecast-items" role="listbox">
              {matches.map((m, i) => (
                <React.Fragment key={m.id}>
                  {(i === 0 || matches[i - 1].category !== m.category) && <li className="search-group" role="presentation">{m.category}</li>}
                  <li id={`fc-item-${m.id}`} role="option" aria-selected={i === active}>
                    {/* mousedown, not click: picking must happen before the box loses focus and closes the list */}
                    <button type="button" tabIndex={-1} className={`${i === active ? 'is-active' : ''}${selected?.id === m.id ? ' is-current' : ''}`}
                      onMouseDown={(e) => { e.preventDefault(); pick(m) }} onMouseEnter={() => setActive(i)}>
                      <span>{m.name}</span><small>{fmtNum(m.forecast)} next month</small>
                    </button>
                  </li>
                </React.Fragment>
              ))}
              {matches.length === 0 && <li className="search-empty">No {kind} match “{search}”.</li>}
            </ul>
          )}
        </div>
      </div>

      {selected ? (
        <>
          <p className="section-title forecast-item-title">
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

          <SeasonalNote s={selected.seasonal} month={forecastMonth} show={fmtNum} item />
          {isProduct && <StockOutNote s={selected.stockOuts} />}

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
              <Accuracy a={selected.accuracy} unit={isProduct ? 'units' : 'visits'} block />
              <p className="accuracy-note">The dashed line and hollow dot are the forecast.</p>
            </div>

            <div className="insight-col">
              {isProduct ? (
                <>
                  <div className="insight-card">
                    <div className="insight-body">
                      <p className="insight-title">You need to order</p>
                      <p className="insight-value">{fmtNum(selected.toOrder)} units</p>
                      <p className="insight-desc">
                        Predicted need ({fmtNum(selected.forecast)}) + safety stock ({fmtNum(selected.safetyStock)}) − stock on hand ({fmtNum(selected.stock)}), rounded up.
                        The safety stock is the item's reorder point: it covers the supplier's delivery time and a busier-than-usual month.
                        {branch === 'All Branches' && ' Worked out for each branch, then added up, so one branch’s extra stock does not hide the other’s shortage.'}
                      </p>
                    </div>
                  </div>
                  <div className="insight-card">
                    <div className="insight-body">
                      <p className="insight-title">Stock after ordering</p>
                      <p className="insight-value">{fmtNum(selected.stockAfterOrder)} units</p>
                      <p className="insight-desc">Covers next month's predicted sales with the safety stock left over.</p>
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
              <thead><tr><th>Group</th><th>Items tested</th><th>Usually off by (MAE)</th><th>Average % off (MAPE)</th><th>Reliability</th></tr></thead>
              <tbody>
                {['products', 'services'].map((g) => (
                  <tr key={g}>
                    <td>{g === 'products' ? 'Products (units)' : 'Services (units)'}</td>
                    <td>{fmtNum(data.accuracy[g].count)}</td>
                    <td>{fmtNum(data.accuracy[g].mae)} units</td>
                    <td>{data.accuracy[g].mape === null ? '—' : `${fmtNum(data.accuracy[g].mape)}%`}</td>
                    <td>{reliability(data.accuracy[g]) ? <span className={`rel-tag ${reliability(data.accuracy[g])[2]}`}>{reliability(data.accuracy[g])[1]}</span> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="accuracy-note">Most items sell only a few units a month, so a miss of one or two looks large in percent. That is why single items read as a rough guide while the totals above are reliable: use item forecasts as a starting point and your experience for the final order.</p>
          <MetricHelp />
        </div>
      )}
    </main>
  )
}
