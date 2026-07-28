import { afterEach, describe, expect, it, vi } from 'vitest'
import { getStorageStatus, requestPersistentStorage } from './storagePersistence.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getStorageStatus', () => {
  it('χωρίς navigator.storage καθόλου → unsupported', async () => {
    vi.stubGlobal('navigator', {})
    expect(await getStorageStatus()).toBe('unsupported')
  })

  it('navigator.storage υπάρχει αλλά χωρίς persisted() → unsupported', async () => {
    vi.stubGlobal('navigator', { storage: {} })
    expect(await getStorageStatus()).toBe('unsupported')
  })

  it('persisted() === true → active', async () => {
    vi.stubGlobal('navigator', { storage: { persisted: vi.fn().mockResolvedValue(true) } })
    expect(await getStorageStatus()).toBe('active')
  })

  it('persisted() === false → requestable', async () => {
    vi.stubGlobal('navigator', { storage: { persisted: vi.fn().mockResolvedValue(false) } })
    expect(await getStorageStatus()).toBe('requestable')
  })

  it('persisted() πετάει → error, ΔΕΝ ξεφεύγει το exception', async () => {
    vi.stubGlobal('navigator', { storage: { persisted: vi.fn().mockRejectedValue(new Error('boom')) } })
    expect(await getStorageStatus()).toBe('error')
  })
})

describe('requestPersistentStorage', () => {
  it('χωρίς persist() καθόλου → unsupported, ΚΑΜΙΑ κλήση persisted()', async () => {
    const persisted = vi.fn()
    vi.stubGlobal('navigator', { storage: { persisted } })
    expect(await requestPersistentStorage()).toBe('unsupported')
    expect(persisted).not.toHaveBeenCalled()
  })

  it('persist() === true → active', async () => {
    vi.stubGlobal('navigator', { storage: { persist: vi.fn().mockResolvedValue(true) } })
    expect(await requestPersistentStorage()).toBe('active')
  })

  it('persist() === false → denied', async () => {
    vi.stubGlobal('navigator', { storage: { persist: vi.fn().mockResolvedValue(false) } })
    expect(await requestPersistentStorage()).toBe('denied')
  })

  it('persist() πετάει → error, ΔΕΝ ξεφεύγει το exception', async () => {
    vi.stubGlobal('navigator', { storage: { persist: vi.fn().mockRejectedValue(new Error('boom')) } })
    expect(await requestPersistentStorage()).toBe('error')
  })
})
