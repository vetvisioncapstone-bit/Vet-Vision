import React, { useEffect, useState } from 'react'

// Today's date and time for the staff page headers. Ticks every 30 s; only this re-renders, not the page.
export default function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="employee-datetime">
      <p>{now.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
      <p>{now.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}</p>
    </div>
  )
}
