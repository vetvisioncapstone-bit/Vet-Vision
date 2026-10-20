import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./client', () => ({ api: { get: vi.fn() } }))

async function fresh() {
  vi.resetModules()
  const { api } = await import('./client')
  const store = await import('./store')
  return { api, ...store }
}

beforeEach(() => vi.clearAllMocks())

describe('shared resource cache', () => {
  it('shares one request between callers of the same key', async () => {
    const { api, fetchKey } = await fresh()
    api.get.mockResolvedValue([1, 2])
    await Promise.all([fetchKey('/patients/'), fetchKey('/patients/')])
    expect(api.get).toHaveBeenCalledTimes(1)
  })

  it('drops idle keys on invalidate so they refetch when next used', async () => {
    const { api, fetchKey, invalidate } = await fresh()
    api.get.mockResolvedValue([1])
    await fetchKey('/inventory/')
    await invalidate('/inventory/')
    expect(api.get).toHaveBeenCalledTimes(1) // nobody was watching, so nothing refetched
    await fetchKey('/inventory/')
    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it('remembers a failure instead of throwing', async () => {
    const { api, fetchKey } = await fresh()
    api.get.mockRejectedValue(new Error('offline'))
    await expect(fetchKey('/x/')).resolves.toBeUndefined()
  })
})
