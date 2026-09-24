import { useState, useEffect, useCallback } from 'react'

export function readLocalStorage(key, defaultValue) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : defaultValue
  } catch {
    return defaultValue
  }
}

// The browser's native 'storage' event only fires in OTHER tabs, never the
// tab that made the write - so two sibling components in the same tab both
// reading the same key (e.g. Topbar and SystemSettings both calling
// useAdminProfile()) would otherwise go out of sync until reload. This
// custom event covers the same-tab case; the native 'storage' event (see the
// listener below) still covers the cross-tab case, matching the original
// vanilla-JS pages' real cross-tab sync behavior.
const LOCAL_UPDATE_EVENT = 'vv-local-storage-update'

export function writeLocalStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    window.dispatchEvent(new CustomEvent(LOCAL_UPDATE_EVENT, { detail: { key } }))
    return true
  } catch {
    return false
  }
}

// Generic localStorage-backed state hook. Mirrors the load/save pattern used
// throughout the original vanilla-JS pages (inventory.js, patients.js, etc.)
// and stays in sync both same-tab (every component using this key re-reads
// on every write, anywhere in the tab) and cross-tab (native 'storage'
// event) - matching the original's real cross-tab sync feature.
// onWriteError is optional - called (with no args) if a write ever fails
// (e.g. storage quota exceeded), so callers can show the same
// "Could not save to local storage" toast the original vanilla-JS pages did.
export function useLocalStorageState(key, defaultValue, onWriteError) {
  const [value, setValue] = useState(() => readLocalStorage(key, defaultValue))

  useEffect(() => {
    function refresh() {
      setValue(readLocalStorage(key, defaultValue))
    }
    function handleStorage(e) {
      if (e.key === key) refresh()
    }
    function handleLocalUpdate(e) {
      if (e.detail?.key === key) refresh()
    }
    window.addEventListener('storage', handleStorage)
    window.addEventListener(LOCAL_UPDATE_EVENT, handleLocalUpdate)
    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener(LOCAL_UPDATE_EVENT, handleLocalUpdate)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const update = useCallback((newValue) => {
    setValue(prev => {
      const resolved = typeof newValue === 'function' ? newValue(prev) : newValue
      const ok = writeLocalStorage(key, resolved)
      if (!ok && onWriteError) onWriteError()
      return resolved
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return [value, update]
}
