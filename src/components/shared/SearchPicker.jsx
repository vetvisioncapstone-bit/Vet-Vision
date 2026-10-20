import React, { useEffect, useMemo, useState } from 'react'
import '../../styles/shared/search-picker.css'

// A search box that is also a dropdown: focusing it (or its arrow) lists every item grouped by category, typing
// narrows the list, arrow keys move through it, Enter picks and Escape closes. Items: [{ id, name, category }].
// `value` / `onChange` is the text in the box (the parent may also use it to filter its own table).
export default function SearchPicker({ id, items, value, onChange, onPick, label, placeholder, meta, currentId, noun = 'items', className = '' }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const term = value.trim().toLowerCase()
  const matches = useMemo(
    () => items.filter((p) => !term || p.name.toLowerCase().includes(term) || p.category.toLowerCase().includes(term))
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)),
    [items, term]
  )
  useEffect(() => { // keep the highlighted item in view while arrowing through a long list
    if (open && matches[active]) document.getElementById(`${id}-${matches[active].id}`)?.scrollIntoView({ block: 'nearest' })
  }, [active, open, matches, id])

  function pick(item) {
    setOpen(false)
    onPick(item)
  }

  function onKey(e) {
    if (e.key === 'Escape') { setOpen(false); return }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setOpen(true)
      setActive((i) => Math.max(0, Math.min(matches.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))))
    } else if (e.key === 'Enter' && open && matches[active]) {
      e.preventDefault()
      pick(matches[active])
    }
  }

  return (
    <div className={`search-wrapper search-picker ${className}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
      <input type="text" role="combobox" aria-expanded={open} aria-controls={id} aria-autocomplete="list"
        aria-activedescendant={open && matches[active] ? `${id}-${matches[active].id}` : undefined}
        aria-label={label} autoComplete="off" placeholder={placeholder} value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(0) }}
        onFocus={() => { setOpen(true); setActive(0) }}
        onBlur={() => setOpen(false)}
        onKeyDown={onKey} />
      <button type="button" className="search-picker-toggle" tabIndex={-1} aria-label={open ? 'Close the list' : 'Show all'}
        onMouseDown={(e) => { e.preventDefault(); setOpen((o) => !o) }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points={open ? '6 15 12 9 18 15' : '6 9 12 15 18 9'} /></svg>
      </button>
      {/* Drops down under the box, so picking an item does not push the page around. */}
      {open && (
        <ul className="search-results" id={id} role="listbox">
          {matches.map((m, i) => (
            <React.Fragment key={m.id}>
              {(i === 0 || matches[i - 1].category !== m.category) && <li className="search-group" role="presentation">{m.category}</li>}
              <li id={`${id}-${m.id}`} role="option" aria-selected={i === active}>
                {/* mousedown, not click: picking must happen before the box loses focus and closes the list */}
                <button type="button" tabIndex={-1} className={`${i === active ? 'is-active' : ''}${currentId === m.id ? ' is-current' : ''}`}
                  onMouseDown={(e) => { e.preventDefault(); pick(m) }} onMouseEnter={() => setActive(i)}>
                  <span>{m.name}</span>{meta && <small>{meta(m)}</small>}
                </button>
              </li>
            </React.Fragment>
          ))}
          {matches.length === 0 && <li className="search-empty">No {noun} match “{value}”.</li>}
        </ul>
      )}
    </div>
  )
}
