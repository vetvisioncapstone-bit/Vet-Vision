import { useEffect, useState } from 'react'

// `value`, but only after it has stopped changing for `ms`. Keeps a search box from firing a request per keystroke.
export function useDebounced(value, ms = 300) {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return settled
}
