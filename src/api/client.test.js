import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The client keeps the access token in module state, so load a fresh copy for every test.
async function freshClient() {
  vi.resetModules()
  return import('./client')
}

const json = (status, body) => ({ status, ok: status < 400, json: async () => body })

const fakeStorage = () => {
  const store = {}
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v) },
    removeItem: (k) => { delete store[k] }
  }
}

beforeEach(() => {
  vi.stubGlobal('sessionStorage', fakeStorage())
  vi.stubGlobal('localStorage', fakeStorage())
  vi.stubGlobal('window', new EventTarget())
})
afterEach(() => vi.unstubAllGlobals())

describe('api client', () => {
  it('sends the bearer token and returns the JSON body', async () => {
    const { api, setTokens } = await freshClient()
    const fetchMock = vi.fn().mockResolvedValue(json(200, { ok: 1 }))
    vi.stubGlobal('fetch', fetchMock)
    setTokens({ access: 'A1', refresh: 'R1' })
    expect(await api.get('/branches/')).toEqual({ ok: 1 })
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer A1')
  })

  it('turns an error response into an ApiError with the server message', async () => {
    const { api, ApiError } = await freshClient()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(400, { email: ['That email is already in use.'] })))
    await expect(api.post('/x/', {})).rejects.toMatchObject({ status: 400, message: 'That email is already in use.' })
    await expect(api.post('/x/', {})).rejects.toBeInstanceOf(ApiError)
  })

  it('refreshes once on a 401, keeps the rotated refresh token and retries', async () => {
    const { api, setTokens, getRefreshToken } = await freshClient()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(401, { detail: 'expired' })) // original call
      .mockResolvedValueOnce(json(200, { access: 'A2', refresh: 'R2' })) // refresh (rotated)
      .mockResolvedValueOnce(json(200, { rows: [] })) // retry
    vi.stubGlobal('fetch', fetchMock)
    setTokens({ access: 'A1', refresh: 'R1' })
    expect(await api.get('/patients/')).toEqual({ rows: [] })
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe('Bearer A2')
    expect(getRefreshToken()).toBe('R2')
  })

  it('signals an expired session when the refresh fails', async () => {
    const { api, setTokens, getRefreshToken } = await freshClient()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(401, { detail: 'no' })))
    const expired = vi.fn()
    window.addEventListener('vv-auth-expired', expired)
    setTokens({ access: 'A1', refresh: 'R1' })
    await expect(api.get('/patients/')).rejects.toMatchObject({ status: 401 })
    expect(expired).toHaveBeenCalledTimes(1)
    expect(getRefreshToken()).toBeNull()
  })

  it('adopts the fresh token pair a password change returns, and hides it from the caller', async () => {
    const { api, setTokens, getRefreshToken } = await freshClient()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, { name: 'A', tokens: { access: 'A9', refresh: 'R9' } })))
    setTokens({ access: 'A1', refresh: 'R1' })
    expect(await api.patch('/auth/me/', { newPassword: 'x' })).toEqual({ name: 'A' })
    expect(getRefreshToken()).toBe('R9')
  })
})

describe('server error messages', () => {
  it('finds the message in nested field errors', async () => {
    const { ApiError } = await import('./client')
    expect(new ApiError(400, { prescription: { nextAppointment: ['Date has wrong format.'] } }).message).toBe('Date has wrong format.')
    expect(new ApiError(400, { labResults: [{ image: ['Upload a PNG, JPG, WebP, GIF or PDF file.'] }] }).message).toBe('Upload a PNG, JPG, WebP, GIF or PDF file.')
    expect(new ApiError(400, { detail: 'Nope.' }).message).toBe('Nope.')
    expect(new ApiError(400, null).message).toMatch(/fewer or smaller/)
  })
})

describe('remember me', () => {
  it('keeps the session past a browser close only when asked, and a refresh keeps it where it is', async () => {
    const { setTokens, getRefreshToken, clearTokens } = await freshClient()
    setTokens({ access: 'A', refresh: 'R1' }, true)
    expect(localStorage.getItem('vvRefreshToken')).toBe('R1')
    setTokens({ access: 'A', refresh: 'R2' }) // token rotation
    expect(localStorage.getItem('vvRefreshToken')).toBe('R2')
    expect(sessionStorage.getItem('vvRefreshToken')).toBeNull()
    setTokens({ access: 'A', refresh: 'R3' }, false)
    expect(sessionStorage.getItem('vvRefreshToken')).toBe('R3')
    expect(localStorage.getItem('vvRefreshToken')).toBeNull()
    expect(getRefreshToken()).toBe('R3')
    clearTokens()
    expect(getRefreshToken()).toBeNull()
  })
})
