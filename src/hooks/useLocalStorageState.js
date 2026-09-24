import { useState, useEffect, useCallback } from 'react'

export function readLocalStorage(key, defaultValue) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : defaultValue
  } catch {
    return defaultValue
  }
}

export function writeLocalStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

// Generic localStorage-backed state hook. Mirrors the load/save pattern used
// throughout the original vanilla-JS pages (inventory.js, patients.js, etc.)
// and keeps listening to the native 'storage' event so cross-tab sync (a
// real existing feature - e.g. the notification bell updating when another
// tab approves a request) keeps working exactly as before.
export function useLocalStorageState(key, defaultValue) {
  const [value, setValue] = useState(() => readLocalStorage(key, defaultValue))

  useEffect(() => {
    function handleStorage(e) {
      if (e.key === key) {
        setValue(readLocalStorage(key, defaultValue))
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const update = useCallback((newValue) => {
    setValue(prev => {
      const resolved = typeof newValue === 'function' ? newValue(prev) : newValue
      writeLocalStorage(key, resolved)
      return resolved
    })
  }, [key])

  return [value, update]
}
