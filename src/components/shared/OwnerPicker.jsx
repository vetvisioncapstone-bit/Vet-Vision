import React, { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { useDebounced } from '../../hooks/useDebounced'

// Optional "who is buying": search the branch's pet owners by owner or pet name. Leaving it empty records a walk-in.
// `value` is { id, name } or null. The server only accepts owners of the seller's branch.
export default function OwnerPicker({ value, onChange }) {
  const [term, setTerm] = useState('')
  const [matches, setMatches] = useState([])
  const q = useDebounced(term.trim(), 300)

  useEffect(() => {
    if (q.length < 2) { setMatches([]); return undefined }
    let live = true
    api.get(`/patients/?page=1&pageSize=12&q=${encodeURIComponent(q)}`)
      .then((res) => {
        if (!live) return
        const owners = new Map() // one row per owner, with their pets' names
        for (const p of res.results || []) {
          const o = owners.get(p.ownerId) || { id: p.ownerId, name: `${p.ownerName} ${p.ownerSurname}`.trim(), pets: [] }
          o.pets.push(p.petName)
          owners.set(p.ownerId, o)
        }
        setMatches([...owners.values()].slice(0, 6))
      })
      .catch(() => live && setMatches([]))
    return () => { live = false }
  }, [q])

  if (value) {
    return (
      <div className="owner-picked">
        <span>{value.name}</span>
        <button type="button" className="link-btn" onClick={() => onChange(null)}>Change</button>
      </div>
    )
  }
  return (
    <div className="owner-picker">
      <input id="saleOwner" type="search" className="form-input" autoComplete="off" placeholder="Walk-in (search owner or pet)…"
        value={term} onChange={(e) => setTerm(e.target.value)} aria-describedby="saleOwnerHint" />
      {matches.length > 0 && (
        <ul className="owner-results" role="listbox" aria-label="Matching owners">
          {matches.map((o) => (
            <li key={o.id}>
              <button type="button" role="option" aria-selected="false" onClick={() => { onChange({ id: o.id, name: o.name }); setTerm('') }}>
                <b>{o.name}</b> <span>{o.pets.join(', ')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p id="saleOwnerHint" className="sr-only">Optional. Leave empty for a walk-in customer.</p>
    </div>
  )
}
