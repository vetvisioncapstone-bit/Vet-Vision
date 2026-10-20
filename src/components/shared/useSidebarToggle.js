import { useEffect, useState, useCallback } from 'react'

// Mirrors dashboard.js's mobile sidebar open/close + Escape-to-close behavior.
export function useSidebarToggle() {
  const [open, setOpen] = useState(false)

  const close = useCallback(() => setOpen(false), [])
  const toggle = useCallback(() => setOpen(v => !v), [])

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [close])

  return { open, close, toggle }
}
