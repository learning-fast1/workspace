import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  readSyncAuthorizationHint, writeSyncAuthorizationHint, clearSyncAuthorizationHint, computeUnsyncedTables
} from './syncAuthorizationHint.js'
import { MIGRATED_TABLE_NAMES, v2TableName } from './migratedTableNames.js'

// Περιβάλλον 'node' (βλ. vite.config.js) — ΔΕΝ υπάρχει global localStorage εξ ορισμού. Ένα ελάχιστο
// in-memory fake, ίδιο interface (getItem/setItem/removeItem), ώστε το ίδιο το module (γραμμένο να
// δουλεύει ΚΑΙ σε browser ΚΑΙ σε αυτό το test) να δοκιμάζεται χωρίς να χρειάζεται jsdom.
class FakeLocalStorage {
  constructor() { this.store = new Map() }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null }
  setItem(key, value) { this.store.set(key, String(value)) }
  removeItem(key) { this.store.delete(key) }
}

beforeEach(() => {
  globalThis.localStorage = new FakeLocalStorage()
})

afterEach(() => {
  delete globalThis.localStorage
})

describe('readSyncAuthorizationHint / writeSyncAuthorizationHint / clearSyncAuthorizationHint', () => {
  it('καμία εγγραφή → null', () => {
    expect(readSyncAuthorizationHint()).toBeNull()
  })

  it('γράφει και διαβάζει ένα μη κενό userId', () => {
    writeSyncAuthorizationHint('alice@example.com')
    expect(readSyncAuthorizationHint()).toBe('alice@example.com')
  })

  it('αρνείται να γράψει κενό/μη-string userId', () => {
    expect(() => writeSyncAuthorizationHint('')).toThrow()
    expect(() => writeSyncAuthorizationHint('   ')).toThrow()
    expect(() => writeSyncAuthorizationHint(null)).toThrow()
    expect(() => writeSyncAuthorizationHint(true)).toThrow()
    expect(readSyncAuthorizationHint()).toBeNull()
  })

  it('clear αφαιρεί το hint', () => {
    writeSyncAuthorizationHint('alice@example.com')
    clearSyncAuthorizationHint()
    expect(readSyncAuthorizationHint()).toBeNull()
  })

  it('malformed τιμή γραμμένη απευθείας στο storage (όχι μέσω write) → αγνοείται ως απούσα', () => {
    globalThis.localStorage.setItem('workspace.phase2SyncAuthorizedUserId', '   ')
    expect(readSyncAuthorizationHint()).toBeNull()
  })

  it('χωρίς localStorage καθόλου (π.χ. server/worker context) → read null, write πετάει, clear no-op', () => {
    delete globalThis.localStorage
    expect(readSyncAuthorizationHint()).toBeNull()
    expect(() => writeSyncAuthorizationHint('alice@example.com')).toThrow()
    expect(() => clearSyncAuthorizationHint()).not.toThrow()
  })
})

describe('computeUnsyncedTables', () => {
  const allTableNames = [...MIGRATED_TABLE_NAMES, ...MIGRATED_TABLE_NAMES.map(v2TableName), 'appMeta']

  it('hint απόν → η πλήρης λίστα, αναλλοίωτη', () => {
    expect(computeUnsyncedTables({ hint: null, allTableNames })).toEqual(allTableNames)
  })

  it('hint παρόν → όλα ΕΚΤΟΣ από τους 16 _v2 πίνακες', () => {
    const result = computeUnsyncedTables({ hint: 'alice@example.com', allTableNames })
    for (const legacy of MIGRATED_TABLE_NAMES) expect(result).toContain(legacy)
    expect(result).toContain('appMeta')
    for (const legacy of MIGRATED_TABLE_NAMES) expect(result).not.toContain(v2TableName(legacy))
    expect(result.length).toBe(allTableNames.length - MIGRATED_TABLE_NAMES.length)
  })

  it('hint παρόν, ένας μελλοντικός μη-migrated πίνακας στο allTableNames → παραμένει unsynced (μόνο οι γνωστοί _v2 εξαιρούνται)', () => {
    const withFuture = [...allTableNames, 'κάτιΜελλοντικό']
    const result = computeUnsyncedTables({ hint: 'alice@example.com', allTableNames: withFuture })
    expect(result).toContain('κάτιΜελλοντικό')
  })
})
