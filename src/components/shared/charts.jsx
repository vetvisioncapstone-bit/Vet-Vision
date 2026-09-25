import React, { useEffect, useRef } from 'react'
import {
  ArcElement, BarController, BarElement, CategoryScale, Chart, DoughnutController, Legend as ChartLegend,
  LinearScale, LineController, LineElement, PointElement, Tooltip
} from 'chart.js'

// Charts are drawn with Chart.js (thesis section 3.5). Each component keeps the small props the pages already use,
// so the pages do not know which library is underneath. Only what is used is registered, which keeps the bundle small.
Chart.register(ArcElement, BarController, BarElement, CategoryScale, DoughnutController, ChartLegend, LinearScale,
  LineController, LineElement, PointElement, Tooltip)

const GRID = '#e9eeeb'
const TICK = '#7a8580'

function compact(n) {
  if (Math.abs(n) >= 1e6) return `${+(n / 1e6).toFixed(1)}M`
  if (Math.abs(n) >= 1e3) return `${+(n / 1e3).toFixed(0)}k`
  return String(+Number(n).toFixed(1))
}

// Creates the chart once and, when `key` (a string of the data) changes, updates it in place without replaying the
// animation - the dashboard refreshes its numbers every few seconds.
function useChart(build, key) {
  const canvas = useRef(null)
  const chart = useRef(null)
  useEffect(() => {
    const config = build()
    if (chart.current) {
      chart.current.data = config.data
      chart.current.options = config.options
      chart.current.update('none')
    } else {
      chart.current = new Chart(canvas.current, config)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  useEffect(() => () => { chart.current?.destroy(); chart.current = null }, [])
  return canvas
}

const baseScales = {
  x: { grid: { display: false }, ticks: { color: TICK, font: { size: 11 } }, border: { display: false } },
  y: { beginAtZero: true, grid: { color: GRID }, ticks: { color: TICK, font: { size: 11 }, callback: compact }, border: { display: false } }
}

export function Legend({ items }) {
  return (
    <div className="chart-legend">
      {items.map((s) => (
        <span key={s.key || s.label} className="chart-legend-item">
          <i style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  )
}

// data: [{ label, values: { [seriesKey]: number } }]; series: [{ key, label, color }]
export function BarChart({ data, series, height = 260, format = (n) => String(n) }) {
  const canvas = useChart(() => ({
    type: 'bar',
    data: {
      labels: data.map((d) => d.label),
      datasets: series.map((s) => ({
        label: s.label, backgroundColor: s.color, borderRadius: 4, maxBarThickness: 28,
        data: data.map((d) => d.values[s.key] || 0)
      }))
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${format(c.parsed.y)}` } } },
      scales: baseScales
    }
  }), JSON.stringify([data, series]))
  return <div className="chart-box" style={{ height }}><canvas ref={canvas} role="img" aria-label="Bar chart" /></div>
}

// points: [{ label, actual?: number, forecast?: number }]. The forecast point is joined to the last actual one
// with a dashed line so the projection is clearly not history.
export function LineChart({ points, height = 260, format = (n) => String(n), color = '#2d7a4d', forecastColor = '#7c5cdb' }) {
  const has = (v) => v !== undefined && v !== null
  const lastActual = points.reduce((last, p, i) => (has(p.actual) ? i : last), -1)
  const forecastAt = points.findIndex((p) => has(p.forecast))
  const canvas = useChart(() => ({
    type: 'line',
    data: {
      labels: points.map((p) => p.label),
      datasets: [
        {
          label: 'Actual', borderColor: color, backgroundColor: color, borderWidth: 2.5, tension: 0, pointRadius: 4,
          data: points.map((p) => (has(p.actual) ? p.actual : null))
        },
        {
          // dashed bridge from the last actual month to the forecast, ending in a hollow dot
          label: 'Forecast', borderColor: forecastColor, borderWidth: 2.5, borderDash: [6, 5], tension: 0,
          pointBackgroundColor: '#fff', pointBorderColor: forecastColor, pointBorderWidth: 2.5,
          pointRadius: points.map((_, i) => (i === forecastAt ? 5 : 0)),
          data: points.map((p, i) => (i === forecastAt ? p.forecast : i === lastActual && forecastAt >= 0 ? p.actual : null))
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${format(c.parsed.y)}` } } },
      scales: baseScales
    }
  }), JSON.stringify(points))
  return <div className="chart-box" style={{ height }}><canvas ref={canvas} role="img" aria-label="Trend chart" /></div>
}

// slices: [{ label, value, color }]
export function Donut({ slices, size = 160, format = (n) => String(n) }) {
  const total = slices.reduce((a, s) => a + s.value, 0)
  const canvas = useChart(() => ({
    type: 'doughnut',
    data: {
      labels: slices.map((s) => s.label),
      datasets: [{ data: slices.map((s) => s.value), backgroundColor: slices.map((s) => s.color), borderWidth: 0 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '68%', animation: { duration: 300 },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => `${c.label}: ${format(c.parsed)} (${total ? ((c.parsed / total) * 100).toFixed(1) : 0}%)` } }
      }
    }
  }), JSON.stringify(slices))
  return <div className="chart-donut" style={{ width: size, height: size }}><canvas ref={canvas} role="img" aria-label="Share chart" /></div>
}
