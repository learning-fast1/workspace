import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isCaptureArmed,
  armCapture,
  disarmCapture,
  installConsoleCapture,
  getCapturedEvents,
  resetSyncResponseCaptureForTests
} from './syncResponseCapture.js'

// Περιβάλλον 'node' (βλ. vite.config.js) — ΔΕΝ υπάρχει global localStorage εξ ορισμού. Ίδιο
// ελάχιστο fake με το syncAuthorizationHint.test.js.
class FakeLocalStorage {
  constructor() { this.store = new Map() }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null }
  setItem(key, value) { this.store.set(key, String(value)) }
  removeItem(key) { this.store.delete(key) }
}

let originalDebug

beforeEach(() => {
  globalThis.localStorage = new FakeLocalStorage()
  resetSyncResponseCaptureForTests()
  originalDebug = console.debug
})

afterEach(() => {
  console.debug = originalDebug
  delete globalThis.localStorage
  resetSyncResponseCaptureForTests()
})

describe('syncResponseCapture — arm/disarm (localStorage flag)', () => {
  it('εξ ορισμού ανενεργό', () => {
    expect(isCaptureArmed()).toBe(false)
  })

  it('armCapture()/disarmCapture() γράφουν/καθαρίζουν το localStorage flag', () => {
    armCapture()
    expect(isCaptureArmed()).toBe(true)
    disarmCapture()
    expect(isCaptureArmed()).toBe(false)
  })
})

describe('syncResponseCapture — installConsoleCapture()', () => {
  it('καλεί ΠΑΝΤΑ πρώτα το πραγματικό console.debug (καμία αλλαγή στην υπάρχουσα συμπεριφορά)', () => {
    const spy = vi.fn()
    console.debug = spy
    installConsoleCapture()
    console.debug('κάτι άσχετο', { x: 1 })
    expect(spy).toHaveBeenCalledWith('κάτι άσχετο', { x: 1 })
  })

  it('αγνοεί ετικέτες εκτός των 3 παρακολουθούμενων — καμία καταγραφή', () => {
    console.debug = vi.fn()
    installConsoleCapture()
    console.debug('κάτι άσχετο', { secret: 'μαθητής Χ' })
    expect(getCapturedEvents()).toEqual([])
  })

  it('idempotent — δεύτερη κλήση δεν διπλο-τυλίγει το console.debug', () => {
    console.debug = vi.fn()
    installConsoleCapture()
    const wrapped = console.debug
    installConsoleCapture()
    expect(console.debug).toBe(wrapped)
  })

  it('καταγράφει "Sync response" — ΜΟΝΟ table/type/keys, ΠΟΤΕ τα πραγματικά περιεχόμενα (values)', () => {
    console.debug = vi.fn()
    installConsoleCapture()
    console.debug('Sync response', {
      serverRevision: '1:2',
      dbId: 'db-1',
      realms: ['victoriacharalam@gmail.com'],
      inviteRealms: [],
      changes: [
        {
          table: 'students_v2',
          muts: [
            {
              type: 'insert',
              keys: ['08ec81fe-6990-4f4f-a496-4ec444c7239f', '96e5a3be-b0fe-4af8-b4c6-5f275588912f'],
              values: [
                { code: 'n2', notes: 'ΑΠΟΡΡΗΤΗ ΣΗΜΕΙΩΣΗ ΜΑΘΗΤΗ' },
                { code: 'Ν1', notes: 'ΑΛΛΗ ΑΠΟΡΡΗΤΗ ΣΗΜΕΙΩΣΗ' }
              ]
            }
          ]
        }
      ]
    })

    const events = getCapturedEvents()
    expect(events).toHaveLength(1)
    expect(events[0].label).toBe('Sync response')
    expect(events[0].serverRevision).toBe('1:2')
    expect(events[0].changes).toEqual([
      {
        table: 'students_v2',
        muts: [{ type: 'insert', keys: ['08ec81fe-6990-4f4f-a496-4ec444c7239f', '96e5a3be-b0fe-4af8-b4c6-5f275588912f'] }]
      }
    ])

    const serialized = JSON.stringify(events)
    expect(serialized).not.toContain('ΑΠΟΡΡΗΤΗ')
    expect(serialized).not.toContain('notes')
  })

  it('καταγράφει "Applying server changes" — ίδιο redaction, αγνοεί το 2ο όρισμα (Dexie.currentTransaction)', () => {
    console.debug = vi.fn()
    installConsoleCapture()
    const hugeInternalTransactionObject = { idbtrans: {}, circular: null }
    hugeInternalTransactionObject.circular = hugeInternalTransactionObject // θα έσπαγε ένα naive JSON.stringify

    console.debug('Applying server changes', [
      { table: 'students_v2', muts: [{ type: 'insert', keys: ['id-1'], values: [{ code: 'n2', notes: 'μυστικό' }] }] }
    ], hugeInternalTransactionObject)

    const events = getCapturedEvents()
    expect(events).toHaveLength(1)
    expect(events[0].changes).toEqual([
      { table: 'students_v2', muts: [{ type: 'insert', keys: ['id-1'] }] }
    ])
    expect(JSON.stringify(events)).not.toContain('μυστικό')
  })

  it('καταγράφει "Sync request" — μόνο lastPull + περίληψη πλήθους, όχι τα ίδια τα changes', () => {
    console.debug = vi.fn()
    installConsoleCapture()
    console.debug('Sync request', {
      lastPull: { serverRevision: '1:2', realms: ['victoriacharalam@gmail.com'] },
      changes: [{ table: 'students_v2', muts: [{ type: 'insert', keys: ['id-1'], values: [{ notes: 'μυστικό' }] }] }]
    })

    const events = getCapturedEvents()
    expect(events[0].lastPull).toEqual({ serverRevision: '1:2', realms: ['victoriacharalam@gmail.com'] })
    expect(events[0].changesSummary).toEqual([{ table: 'students_v2', mutCount: 1 }])
    expect(JSON.stringify(events)).not.toContain('μυστικό')
  })

  it('ποτέ δεν πετάει, ακόμα κι αν το payload είναι malformed', () => {
    console.debug = vi.fn()
    installConsoleCapture()
    expect(() => console.debug('Sync response', null)).not.toThrow()
    expect(() => console.debug('Applying server changes', undefined)).not.toThrow()
  })
})
