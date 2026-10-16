// Small formatting helpers shared by the admin and employee screens.

// '2026-09-24' -> 'Sep 24, 2026'; empty -> a dash.
export function formatDate(isoString) {
  if (!isoString) return '—'
  const [year, month, day] = isoString.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Today in the browser's local time as 'YYYY-MM-DD' (what <input type="date"> expects).
export function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function formatPrice(amount) {
  return `₱${Number(amount || 0).toFixed(2)}`
}

// A dash for anything that is empty.
export function dash(value) {
  return value === null || value === undefined || value === '' ? '—' : value
}

// CSS class of the status pill in the patients tables.
export function getStatusClass(status) {
  switch (status) {
    case 'Active':
      return 'status-ok'
    case 'Follow-up needed':
      return 'status-follow-up'
    default:
      return 'status-inactive'
  }
}

// True for an embedded image ('data:image/...'); waivers may also be other file types.
export function isImageDataUrl(url) {
  return typeof url === 'string' && url.startsWith('data:image/')
}

// Days until a 'YYYY-MM-DD' expiry date (negative once it has passed); null when there is no date.
export function daysToExpiry(iso) {
  if (!iso) return null
  return Math.round((new Date(`${iso}T00:00`) - new Date(`${todayIso()}T00:00`)) / 86400000)
}

// Expired stock cannot be sold; stock expiring within this many days is flagged so it is used first.
export const EXPIRY_WARN_DAYS = 30
export const isExpired = (item) => (daysToExpiry(item.expiration) ?? 1) < 0
