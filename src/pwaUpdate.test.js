import { describe, expect, it, vi } from 'vitest'
import { getNeedRefresh, subscribe, setUpdateAvailable, applyUpdate } from './pwaUpdate.js'

describe('pwaUpdate — external store για «νέα έκδοση διαθέσιμη»', () => {
  it('ξεκινά false, δεν καλεί updateSW πριν οριστεί', () => {
    expect(getNeedRefresh()).toBe(false)
  })

  it('setUpdateAvailable → getNeedRefresh true, ειδοποιεί τους subscribers', () => {
    const listener = vi.fn()
    const unsubscribe = subscribe(listener)
    const updateSW = vi.fn()

    setUpdateAvailable(updateSW)

    expect(getNeedRefresh()).toBe(true)
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it('applyUpdate καλεί το αποθηκευμένο updateSW με reloadPage:true', () => {
    const updateSW = vi.fn()
    setUpdateAvailable(updateSW)

    applyUpdate()

    expect(updateSW).toHaveBeenCalledWith(true)
  })

  it('unsubscribe σταματά τις ειδοποιήσεις', () => {
    const listener = vi.fn()
    const unsubscribe = subscribe(listener)
    unsubscribe()

    setUpdateAvailable(vi.fn())

    expect(listener).not.toHaveBeenCalled()
  })
})
