import React from 'react'
import '../../styles/shared/unit-input.css'

// A pet's weight: type the number only, "kg" sits fixed inside the box. `value` is the bare number as text.
export default function WeightInput({ id, value, onChange }) {
  return (
    <div className="unit-input">
      <input id={id} type="number" inputMode="decimal" min="0.01" max="200" step="0.01" className="form-input"
        placeholder="e.g. 6.5" value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={`${id}-unit`} />
      <span id={`${id}-unit`} className="unit-suffix">kg</span>
    </div>
  )
}

// What gets saved: "6.5 kg", the same text older records hold, or '' when no weight was entered.
export const withKg = (value) => (String(value ?? '').trim() ? `${Number(value)} kg` : '')
