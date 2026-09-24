// Thin fetch wrapper for the Django API. The access token lives in memory; the refresh token
// lives in sessionStorage (tab-scoped, like the prototype's session) so a reload keeps you signed in.

const BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')
const REFRESH_KEY = 'vvRefreshToken'

let accessToken = null
let refreshing = null

export class ApiError extends Error {
  constructor(status, data) {
    super(messageFrom(data, status))
    this.status = status
    this.data = data
  }
}

function messageFrom(data, status) {
  if (!data) return `Request failed (${status}).`
  if (typeof data === 'string') return data
  if (data.detail) return String(data.detail)
  const first = Object.values(data)[0]
  if (Array.isArray(first)) return String(first[0])
  if (typeof first === 'string') return first
  return `Request failed (${status}).`
}

export function errorMessage(err, fallback = 'Something went wrong. Please try again.') {
  if (err instanceof ApiError) return err.message
  if (err instanceof TypeError) return 'Cannot reach the server. Check your connection and try again.'
  return fallback
}

export function getRefreshToken() {
  try { return sessionStorage.getItem(REFRESH_KEY) } catch { return null }
}

export function setTokens({ access, refresh }) {
  if (access) accessToken = access
  if (refresh) {
    try { sessionStorage.setItem(REFRESH_KEY, refresh) } catch { /* private mode: stays in memory only */ }
  }
}

export function clearTokens() {
  accessToken = null
  try { sessionStorage.removeItem(REFRESH_KEY) } catch { /* ignore */ }
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
    refreshing = raw('POST', '/auth/refresh/', { refresh }, false)
      .then(({ res, data }) => {
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
  return data
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body ?? {}),
  put: (path, body) => request('PUT', path, body ?? {}),
  patch: (path, body) => request('PATCH', path, body ?? {}),
  del: (path) => request('DELETE', path)
}
