// CSV files that open cleanly in Excel and Google Sheets: a UTF-8 byte-order mark (so ₱, ñ and dashes are not
// garbled), CRLF line ends, quoted cells where needed, and text that starts like a formula defused.

const FORMULA_START = /^[=+\-@\t\r]/

export function csvCell(v) {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') return String(v)
  let s = String(v)
  if (FORMULA_START.test(s)) s = `'${s}` // a product named "=1+1" stays text, never runs as a formula
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export const toCsv = (rows) => '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'

// A report as rows: who/what/when as label-value lines first, then each section with its title, a header row,
// its rows (money as plain 2-decimal numbers so the spreadsheet can add them up) and an optional total row.
// meta: [[label, value]]; sections: [{ title, headers, rows, money: [column indexes], total: bool }]
export function reportCsv(meta, sections) {
  const lines = meta.map(([k, v]) => [k, v])
  sections.forEach((s) => {
    const money = new Set(s.money)
    lines.push([], [s.title], s.headers.map((h, j) => (money.has(j) ? `${h} (PHP)` : h)))
    const cell = (c, j) => (money.has(j) && typeof c === 'number' ? Number(c.toFixed(2)) : c)
    s.rows.forEach((r) => lines.push(r.map(cell)))
    if (!s.rows.length) lines.push(['Nothing to report for this period.'])
    if (s.total && s.rows.length > 1) {
      lines.push(s.headers.map((_, j) => (j === 0 ? 'Total'
        : s.rows.every((r) => typeof r[j] === 'number') ? cell(s.rows.reduce((n, r) => n + r[j], 0), j) : '')))
    }
  })
  return toCsv(lines)
}

// "EcoVet Sales report, September 2026, All Branches" -> "EcoVet_Sales-report_2026-09_All-Branches.csv"
export const csvFileName = (title, month, branch) =>
  `EcoVet_${title.replace(/\s+/g, '-')}_${month}_${branch.replace(/\s+/g, '-')}.csv`
