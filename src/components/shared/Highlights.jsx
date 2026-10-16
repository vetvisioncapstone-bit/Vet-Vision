import React from 'react'

// "At a glance": the page's numbers said in plain sentences for the owner, each with a small sign of whether it is
// good news, bad news or something to act on. Items: { tone: 'up' | 'down' | 'warn' | 'info', text: node }.
const ICONS = {
  up: <path d="M4 16l6-6 4 4 6-6M14 8h6v6" />,
  down: <path d="M4 8l6 6 4-4 6 6M14 16h6v-6" />,
  warn: <><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17v.01" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8v.01" /></>
}

// "What this shows": two or three plain sentences under a chart, so the owner does not have to read the bars.
export function ChartInsight({ items }) {
  const shown = items.filter(Boolean)
  if (!shown.length) return null
  return (
    <div className="chart-insight">
      <p className="chart-insight-title">What this shows</p>
      <ul>{shown.map((text, i) => <li key={i}>{text}</li>)}</ul>
    </div>
  )
}

// "12.5% more than" / "8% less than" / "about the same as", for comparing two averages in a sentence.
export const moreOrLess = (pct, more = 'more', less = 'less') => (pct === null || Math.abs(pct) < 0.5
  ? 'about the same as' : `${Math.abs(pct).toFixed(1).replace(/\.0$/, '')}% ${pct > 0 ? more : less} than`)

export default function Highlights({ items }) {
  const shown = items.filter(Boolean)
  if (!shown.length) return null
  return (
    <section className="highlights" aria-labelledby="highlights-title">
      <h2 id="highlights-title">At a glance</h2>
      <ul>
        {shown.map((item, i) => (
          <li key={i} className={`hl-${item.tone}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[item.tone]}</svg>
            <p>{item.text}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
