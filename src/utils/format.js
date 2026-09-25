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
