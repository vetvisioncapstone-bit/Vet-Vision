import React, { useEffect, useRef, useState } from 'react'
import '../../styles/shared/category-filter.css'

// "ANTIBIOTICS/PRESCRIPTION DRUGS" -> "Antibiotics/Prescription Drugs"; short codes such as RC or S2 stay as they are.
export const prettyCategory = (c) => c.toLowerCase()
  .replace(/[^\s/-]+/g, (w) => (w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))

// Category filter for the inventory pages: a button that shows how many categories are picked, and a panel listing
// each category with how many products it holds. Closes on a click outside or Escape.
// counts: { [category]: number }; selected: Set of categories; onChange(nextSet).
export default function CategoryFilter({ counts, selected, onChange, noun = 'products' }) {
  const [open, setOpen] = useState(false)
  const root = useRef(null)
  const categories = Object.keys(counts).sort()

  useEffect(() => {
    if (!open) return undefined
    const away = (e) => { if (!root.current?.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [open])

  function toggle(cat) {
    const next = new Set(selected)
    if (next.has(cat)) next.delete(cat); else next.add(cat)
    onChange(next)
  }

  return (
    <div className="cat-filter" ref={root}>
      <button type="button" className={`filter-btn cat-filter-btn${selected.size ? ' is-on' : ''}`} aria-haspopup="true" aria-expanded={open}
        onClick={() => setOpen((v) => !v)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
        <span>Category</span>
        {selected.size > 0 && <span className="cat-filter-count" aria-label={`${selected.size} picked`}>{selected.size}</span>}
        <svg className="cat-filter-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points={open ? '6 15 12 9 18 15' : '6 9 12 15 18 9'} /></svg>
      </button>
      {open && (
        <div className="cat-filter-panel">
          <fieldset>
            <legend>Show only these categories</legend>
            {categories.length === 0 ? <p className="cat-filter-empty">No categories yet.</p> : (
              <div className="cat-filter-list">
                {categories.map((cat) => (
                  <label key={cat} className={`cat-filter-option${selected.has(cat) ? ' is-checked' : ''}`}>
                    <input type="checkbox" checked={selected.has(cat)} onChange={() => toggle(cat)} />
                    <span className="cat-filter-name">{prettyCategory(cat)}</span>
                    <span className="cat-filter-num" aria-label={`${counts[cat]} ${noun}`}>{counts[cat]}</span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>
          <div className="cat-filter-foot">
            <button type="button" className="link-btn" disabled={!selected.size} onClick={() => onChange(new Set())}>Clear</button>
            <button type="button" className="cat-filter-done" onClick={() => setOpen(false)}>Done</button>
          </div>
        </div>
      )}
    </div>
  )
}
