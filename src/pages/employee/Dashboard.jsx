import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useEmployeeContext } from '../../hooks/useEmployeeContext'
import { usePatients } from '../../hooks/usePatients'
import { useInventory } from '../../hooks/useInventory'
import { useSales } from '../../hooks/useSales'
import { formatPrice } from '../../utils/format'

// ==================== HELPERS ====================
// Read-only summary computed from the API-backed hooks.

function toIsoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// ==================== SALES CHART ====================
// Last 7 days of completed sales for this branch. Faithful port of
// renderSalesChart()'s hand-rolled SVG path math - same padding, same
// "label only today + the week's peak" rule, same 1:1 viewBox measurement.

function SalesTrendChart({ branch }) {
  const since = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - 6)
    return toIsoDate(d)
  }, [])
  const { items: sales } = useSales({ since, limit: 1000 })
  const containerRef = useRef(null)
  const [width, setWidth] = useState(280)

  useEffect(() => {
    function measure() {
      if (containerRef.current) {
        setWidth(Math.max(Math.round(containerRef.current.getBoundingClientRect().width), 280))
      }
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  const branchSales = useMemo(() => sales.filter(s => s.branch === branch), [sales, branch])

  const chart = useMemo(() => {
    const days = []
    for (let i = 6; i >= 0; i--) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      days.push({ iso: toIsoDate(date), label: date.toLocaleDateString('en-US', { weekday: 'short' }) })
    }

    const totalsByDay = days.map(day =>
      branchSales
        .filter(s => (s.createdAt || '').slice(0, 10) === day.iso)
        .reduce((sum, s) => sum + Number(s.total || 0), 0)
    )

    const weekTotal = totalsByDay.reduce((sum, t) => sum + t, 0)

    const height = 220
    const padLeft = 8
    const padRight = 8
    const padTop = 28
    const padBottom = 26
    const plotWidth = width - padLeft - padRight
    const plotHeight = height - padTop - padBottom
    const maxTotal = Math.max(...totalsByDay, 1)
    const stepX = days.length > 1 ? plotWidth / (days.length - 1) : 0

    const points = totalsByDay.map((amount, i) => ({
      x: padLeft + stepX * i,
      y: padTop + plotHeight - (amount / maxTotal) * plotHeight,
      amount
    }))

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
    const baselineY = padTop + plotHeight
    const areaPath = `${linePath} L ${points[points.length - 1].x} ${baselineY} L ${points[0].x} ${baselineY} Z`

    const lastIndex = points.length - 1
    const peakIndex = totalsByDay.reduce((best, amount, i) => (amount > totalsByDay[best] ? i : best), 0)

    const marks = points.map((p, i) => {
      const showValue = totalsByDay[i] > 0 && (i === lastIndex || i === peakIndex)
      const anchor = i === lastIndex ? 'end' : 'middle'
      const labelX = i === lastIndex ? Math.min(p.x, width - padRight) : p.x
      return { x: p.x, y: p.y, amount: p.amount, isEmpty: p.amount === 0, showValue, anchor, labelX, key: i }
    })

    const dayLabels = points.map((p, i) => ({ x: p.x, label: days[i].label, key: i }))

    return { width, height, padLeft, padRight, baselineY, areaPath, linePath, marks, dayLabels, weekTotal }
  }, [branchSales, width])

  return (
    <div className="table-card">
      <div className="table-card-header">
        <h2>Sales this week</h2>
        <span className="chart-total">{formatPrice(chart.weekTotal)}</span>
      </div>
      <div className="line-chart" ref={containerRef}>
        <svg className="line-chart-svg" viewBox={`0 0 ${chart.width} ${chart.height}`}>
          <line className="line-chart-gridline" x1={chart.padLeft} y1={chart.baselineY} x2={chart.width - chart.padRight} y2={chart.baselineY}></line>
          <path className="line-chart-area" d={chart.areaPath}></path>
          <path className="line-chart-path" d={chart.linePath}></path>
          {chart.marks.map(m => (
            <React.Fragment key={m.key}>
              {m.showValue && (
                <text className="line-chart-value" x={m.labelX} y={m.y - 12} textAnchor={m.anchor}>{formatPrice(m.amount)}</text>
              )}
              <circle className={`line-chart-dot${m.isEmpty ? ' is-empty' : ''}`} cx={m.x} cy={m.y} r="4"></circle>
            </React.Fragment>
          ))}
          {chart.dayLabels.map(d => (
            <text className="line-chart-day-label" key={d.key} x={d.x} y={chart.height - 6} textAnchor="middle">{d.label}</text>
          ))}
        </svg>
        {chart.weekTotal === 0 && <p className="line-chart-empty">No sales recorded at this branch this week.</p>}
      </div>
    </div>
  )
}

// ==================== PAGE ====================

export default function Dashboard() {
  const { branch, name } = useEmployeeContext()
  // Only the headline counts are needed, so ask for a single row plus the server's stats.
  const { stats: patientStats } = usePatients({ page: 1, pageSize: 1 })
  const { items: products } = useInventory()

  // Ported from startEmployeeClock() - ticks every 30s, same as the
  // original's setInterval(tick, 30000).
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(id)
  }, [])

  const branchProducts = useMemo(() => products.filter(p => p.branch === branch), [products, branch])

  const totalPatients = patientStats?.total ?? 0
  const followUps = patientStats?.followUpNeeded ?? 0
  const lowStock = branchProducts.filter(p => p.quantity > 0 && p.quantity <= p.reorderPoint).length
  const outOfStock = branchProducts.filter(p => p.quantity <= 0).length

  return (
    <main id="main-content" tabIndex={-1} className="content">
      <div className="content-header">
        <h1>My Branch - {branch}</h1>
        <div className="employee-datetime">
          <p>{now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
          <p>{now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</p>
        </div>
      </div>

      <p className="dashboard-greeting">Welcome back, {name}.</p>

      <div className="stats-grid">
        <div className="stat-card">
          <p className="stat-label">Total patients</p>
          <p className="stat-value">{totalPatients}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Follow-ups needed</p>
          <p className="stat-value">{followUps}</p>
        </div>
        <div className="stat-card accent-warn">
          <p className="stat-label">Low stock items</p>
          <p className="stat-value">{lowStock}</p>
        </div>
        <div className="stat-card alert">
          <p className="stat-label">Out of stock</p>
          <p className="stat-value">{outOfStock}</p>
        </div>
      </div>

      <SalesTrendChart branch={branch} />
    </main>
  )
}
