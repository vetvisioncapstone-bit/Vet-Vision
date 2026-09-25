import { useResource } from '../api/store'
import { useSession } from './useSession'

// Admin analytics. `name` is one of: overview | sales | inventory | forecast | report.
// `params` become the query string (branch, year, month). Every response carries `asOf`
// (latest recorded date and the last complete month the figures are anchored on) and `empty: true`
// when there is no data at all.
// Overview and the live panel refresh on their own (the numbers are computed from the database on every request),
// so a sale rung up at either branch shows within a few seconds. Pass `refreshMs` to change or switch it off (0).
const POLL_MS = { live: 10000, overview: 30000 }

export function useAnalytics(name, params = {}, { refreshMs } = {}) {
  const { session } = useSession()
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '' && v !== 'All Branches') qs.set(k, String(v))
  })
  const query = qs.toString()
  const { data, loading, error, reload, fetchedAt } = useResource(`/analytics/${name}/${query ? `?${query}` : ''}`, {
    enabled: session?.role === 'admin',
    refreshMs: refreshMs ?? POLL_MS[name] ?? 0
  })
  return { data, loading: loading && !data, error, reload, updatedAt: fetchedAt }
}

const PESO = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 })
const NUM = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 1 })

export const fmtMoney = (n) => (n === null || n === undefined ? '—' : PESO.format(n))
export const fmtNum = (n) => (n === null || n === undefined ? '—' : NUM.format(n))
export const fmtPct = (n) => (n === null || n === undefined ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(1)}%`)

// 'YYYY-MM' -> 'Jul' (short) or 'Jul 2026' (long).
export function fmtMonth(key, long = false) {
  if (!key) return ''
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', long ? { month: 'short', year: 'numeric' } : { month: 'short' })
}

export const BRANCH_COLORS = { Ibaan: '#2d7a4d', 'San Jose': '#f2a33a' }
export const branchColor = (b) => BRANCH_COLORS[b] || '#5b8def'

// '10:42:05 AM' from a ms timestamp.
export const fmtClock = (ms) => (ms ? new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : '')
