// Plain facts behind a monthly chart, for the "What this shows" notes. `rows`: [{ month: 'YYYY-MM', value }],
// oldest first, complete months only (a running month would always look like the lowest).
export function seriesFacts(rows) {
  if (!rows.length) return null
  const best = rows.reduce((a, b) => (b.value > a.value ? b : a))
  const lowest = rows.reduce((a, b) => (b.value < a.value ? b : a))
  const avg = (xs) => xs.reduce((n, r) => n + r.value, 0) / xs.length
  const last = rows.slice(-3)
  const before = rows.slice(-6, -3)
  const change = before.length === 3 && avg(before) ? ((avg(last) - avg(before)) / avg(before)) * 100 : null
  return { best, lowest, lastAvg: avg(last), beforeAvg: before.length === 3 ? avg(before) : null, change }
}
