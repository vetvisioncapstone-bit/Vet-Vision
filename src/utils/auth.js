// ==================== ADMIN CREDENTIALS ====================
// This is a client-side prototype with no backend - these credentials
// live in this file (and localStorage) and are visible to anyone who
// opens dev tools. It gates access to the demo UI, not real authentication.

const ADMIN_PROFILE_KEY = 'vetVisionAdminProfile'
const DEFAULT_ADMIN_PROFILE = {
  name: 'June Jericho Humarang',
  email: 'junejerichohumarang@ecovet.ph',
  password: 'Vetvision2026!'
}

export function getAdminProfile() {
  try {
    const raw = localStorage.getItem(ADMIN_PROFILE_KEY)
    if (!raw) return { ...DEFAULT_ADMIN_PROFILE }
    const parsed = JSON.parse(raw)
    return {
      name: parsed.name || DEFAULT_ADMIN_PROFILE.name,
      email: parsed.email || DEFAULT_ADMIN_PROFILE.email,
      password: parsed.password || DEFAULT_ADMIN_PROFILE.password
    }
  } catch {
    return { ...DEFAULT_ADMIN_PROFILE }
  }
}

// ==================== STAFF (EMPLOYEE) ACCOUNTS ====================

const STAFF_ACCOUNTS_KEY = 'vvStaffAccounts'

export function getStaffAccounts() {
  try {
    const raw = localStorage.getItem(STAFF_ACCOUNTS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

// ==================== SESSION ====================

const SESSION_KEY = 'vvCurrentSession'

export function setSession(session) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    // Not critical - worst case the topbar falls back to defaults.
  }
}

export function getSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // Silent fail
  }
}
