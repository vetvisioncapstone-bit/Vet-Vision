import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { api } from './client'

// Tiny shared cache so every component reading the same endpoint (e.g. the Topbar bell and the
// Patients page both need /patients/) shares one copy, and a mutation anywhere refreshes everyone.

const cache = new Map() // key -> { data, error, loading, loaded }
const listeners = new Map() // key -> Set<fn>
const inflight = new Map()
const FRESH_MS = 15000 // focus refetch skips data newer than this
const EMPTY = { data: undefined, error: null, loading: false, loaded: false }

function entry(key) {
  return cache.get(key) || EMPTY
}

function emit(key) {
  ;(listeners.get(key) || []).forEach((fn) => fn())
}

function put(key, next) {
  cache.set(key, { ...entry(key), ...next })
  emit(key)
}

export function fetchKey(key) {
  if (inflight.has(key)) return inflight.get(key)
  put(key, { loading: true })
  const p = api
    .get(key)
    .then((data) => put(key, { data, error: null, loading: false, loaded: true, fetchedAt: Date.now() }))
    .catch((error) => put(key, { error, loading: false, loaded: true }))
    .finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p
}

// Re-fetch every cached key that starts with `prefix` and is currently in use.
export function invalidate(prefix) {
  const jobs = []
  for (const [key, subs] of listeners.entries()) {
    if (key.startsWith(prefix) && subs.size > 0) jobs.push(fetchKey(key))
  }
  // Keys nobody is watching are simply dropped; they refetch when next used.
  for (const key of [...cache.keys()]) {
    if (key.startsWith(prefix) && !(listeners.get(key)?.size > 0)) cache.delete(key)
  }
  return Promise.all(jobs)
}

export function clearCache() {
  cache.clear()
  inflight.clear()
  for (const key of listeners.keys()) emit(key)
}

function subscribe(key, fn) {
  if (!listeners.has(key)) listeners.set(key, new Set())
  listeners.get(key).add(fn)
  return () => listeners.get(key)?.delete(fn)
}

export function useResource(key, { enabled = true, refreshMs = 0 } = {}) {
  const snapshot = useSyncExternalStore(
    useCallback((fn) => (key ? subscribe(key, fn) : () => {}), [key]),
    () => (key ? entry(key) : EMPTY)
  )

  useEffect(() => {
    if (!key || !enabled) return undefined
    fetchKey(key) // stale-while-revalidate: cached data shows instantly, a fresh copy replaces it
    const onFocus = () => { if (Date.now() - (entry(key).fetchedAt || 0) > FRESH_MS) fetchKey(key) }
    window.addEventListener('focus', onFocus)
    // Poll only while the tab is on screen; coming back triggers an immediate refresh via the focus handler.
    const timer = refreshMs ? setInterval(() => { if (document.visibilityState === 'visible') fetchKey(key) }, refreshMs) : null
    return () => {
      window.removeEventListener('focus', onFocus)
      if (timer) clearInterval(timer)
    }
  }, [key, enabled, refreshMs])

  return {
    data: snapshot.data,
    loading: !snapshot.loaded && (snapshot.loading || (enabled && !!key)),
    error: snapshot.error,
    fetchedAt: snapshot.fetchedAt || null, // ms timestamp of the last successful load
    reload: () => (key ? fetchKey(key) : Promise.resolve())
  }
}
