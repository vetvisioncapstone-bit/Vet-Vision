// ==================== ADMIN CREDENTIALS ====================
// This is a client-side prototype with no backend - these credentials
// live in this file (and localStorage) and are visible to anyone who
// opens dev tools. It gates access to the demo UI, not real authentication.

export const ADMIN_PROFILE_KEY = 'vetVisionAdminProfile'
export const DEFAULT_ADMIN_PROFILE = {
  name: 'June Jericho Humarang',
  email: 'junejerichohumarang@ecovet.ph',
  password: 'Vetvision2026!',
  photo: null
}

export function getAdminProfile() {
  try {
    const raw = localStorage.getItem(ADMIN_PROFILE_KEY)
    if (!raw) return { ...DEFAULT_ADMIN_PROFILE }
    const parsed = JSON.parse(raw)
    return {
      name: parsed.name || DEFAULT_ADMIN_PROFILE.name,
      email: parsed.email || DEFAULT_ADMIN_PROFILE.email,
      password: parsed.password || DEFAULT_ADMIN_PROFILE.password,
      photo: parsed.photo || null
    }
  } catch {
    return { ...DEFAULT_ADMIN_PROFILE }
  }
}

export function saveAdminProfile(profile) {
  localStorage.setItem(ADMIN_PROFILE_KEY, JSON.stringify(profile))
}

export function getInitialsFromName(name) {
  const parts = (name || '').split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// ==================== STAFF (EMPLOYEE) ACCOUNTS ====================

export const STAFF_ACCOUNTS_KEY = 'vvStaffAccounts'

export function getStaffAccounts() {
  try {
    const raw = localStorage.getItem(STAFF_ACCOUNTS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveStaffAccounts(accounts) {
  localStorage.setItem(STAFF_ACCOUNTS_KEY, JSON.stringify(accounts))
}

// ==================== SESSION ====================

export const SESSION_KEY = 'vvCurrentSession'

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
