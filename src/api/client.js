// Thin fetch wrapper for the Django API. The access token lives in memory. The refresh token lives in
// sessionStorage (signed out when the browser closes) or, after "Remember me", in localStorage (kept until it
// expires, one day). Either way a reload keeps you signed in.

const BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')
const REFRESH_KEY = 'vvRefreshToken'

let accessToken = null
let refreshing = null
let sessionId = 0 // changes when the tokens are cleared, so a refresh still on its way cannot sign the user back in

export class ApiError extends Error {
  constructor(status, data) {
    super(messageFrom(data, status))
    this.status = status
    this.data = data
  }
}

// The first readable message in a server error, however deeply it is nested: DRF reports a nested field as
// { prescription: { nextAppointment: ["Date has wrong format…"] } } or { labResults: [{ image: ["…"] }] }.
function firstMessage(value) {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(firstMessage).find(Boolean) || null
  if (value && typeof value === 'object') return Object.values(value).map(firstMessage).find(Boolean) || null
  return null
}

function messageFrom(data, status) {
  if (status === 413 || (status === 400 && !data)) {
    return status === 413 ? 'The attachments are too large to send at once. Remove some files and try again.'
      : `The server rejected the request (${status}). If you attached files, try fewer or smaller ones.`
  }
  return (data && (data.detail ? String(data.detail) : firstMessage(data))) || `Request failed (${status}).`
}

export function errorMessage(err, fallback = 'Something went wrong. Please try again.') {
  if (err instanceof ApiError) return err.message
  if (err instanceof TypeError) return 'Cannot reach the server. Check your connection and try again.'
  return fallback
}

export function getRefreshToken() {
  try { return sessionStorage.getItem(REFRESH_KEY) || localStorage.getItem(REFRESH_KEY) } catch { return null }
}

// `remember` true/false picks the store at sign-in; left out (a token refresh), the token stays where it was.
export function setTokens({ access, refresh }, remember) {
  if (access) accessToken = access
  if (!refresh) return
  try {
    const keep = remember ?? !!localStorage.getItem(REFRESH_KEY)
    ;(keep ? sessionStorage : localStorage).removeItem(REFRESH_KEY)
    ;(keep ? localStorage : sessionStorage).setItem(REFRESH_KEY, refresh)
  } catch { /* private mode: stays in memory only */ }
}

export function clearTokens() {
  sessionId += 1
  accessToken = null
  try {
    sessionStorage.removeItem(REFRESH_KEY)
    localStorage.removeItem(REFRESH_KEY)
  } catch { /* ignore */ }
}

// keepalive: signing out leaves the page at once, which would cancel a normal request and leave the token valid.
function revoke(refresh) {
  if (!refresh) return
  fetch(`${BASE}/auth/logout/`, {
    method: 'POST',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh })
  }).catch(() => {}) // best effort: the token is already gone from this browser
}

export function signOut() {
  revoke(getRefreshToken())
  clearTokens()
}

async function raw(method, path, body, withAuth = true) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (withAuth && accessToken) headers.Authorization = `Bearer ${accessToken}`
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  if (res.status === 204) return { res, data: null }
  let data = null
  try { data = await res.json() } catch { /* empty or non-JSON body */ }
  return { res, data }
}

// Returns true when a new access token was obtained.
export async function refreshAccess() {
  const refresh = getRefreshToken()
  if (!refresh) return false
  if (!refreshing) {
    const session = sessionId
    refreshing = raw('POST', '/auth/refresh/', { refresh }, false)
      .then(({ res, data }) => {
        if (session !== sessionId) { // signed out meanwhile: the server rotated the token, so revoke the new one too
          revoke(data?.refresh)
          return false
        }
        if (!res.ok) return false
        setTokens({ access: data.access, refresh: data.refresh })
        return true
      })
      .catch(() => false)
      .finally(() => { refreshing = null })
  }
  return refreshing
}

export async function request(method, path, body) {
  let { res, data } = await raw(method, path, body)
  if (res.status === 401 && !path.startsWith('/auth/login')) {
    if (await refreshAccess()) {
      ;({ res, data } = await raw(method, path, body))
    }
    if (res.status === 401) {
      clearTokens()
      window.dispatchEvent(new CustomEvent('vv-auth-expired'))
    }
  }
  if (!res.ok) throw new ApiError(res.status, data)
  // A password change returns a fresh token pair (the old ones were revoked): keep this session alive.
  if (data && data.tokens) {
    setTokens(data.tokens)
    delete data.tokens
  }
  return data
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body ?? {}),
  put: (path, body) => request('PUT', path, body ?? {}),
  patch: (path, body) => request('PATCH', path, body ?? {}),
  del: (path) => request('DELETE', path)
}
