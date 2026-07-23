import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import db from '../db.js'
import {
  checkSyncPrerequisites, verifySyncAuthorizationOrShutdown, activateSyncForCurrentUser,
  isSessionSyncActive, deactivateSessionSync, resetSessionSyncForTests
} from './syncAuthorization.js'
import { readSyncAuthorizationHint, writeSyncAuthorizationHint } from './syncAuthorizationHint.js'
import { claimLegacyDataOwnership } from './legacyOwnership.js'
import { runMigration, resetMigrationForTests } from './migrationEngine.js'
import { activateV2Generation, resetActiveGenerationForTests, setRestoreFinalizationState } from './activeGeneration.js'
import { MIGRATED_TABLE_NAMES } from './migratedTableNames.js'

class FakeLocalStorage {
  constructor() { this.store = new Map() }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null }
  setItem(key, value) { this.store.set(key, String(value)) }
  removeItem(key) { this.store.delete(key) }
}

const ALICE = 'alice@example.com'
const BOB = 'bob@example.com'
const asAlice = { getAuthenticatedUserId: () => ALICE }
const asBob = { getAuthenticatedUserId: () => BOB }

beforeEach(async () => {
  globalThis.localStorage = new FakeLocalStorage()
  await db.open()
})

afterEach(async () => {
  await resetActiveGenerationForTests()
  await resetMigrationForTests()
  await Promise.all(MIGRATED_TABLE_NAMES.map((t) => db.table(t).clear()))
  resetSessionSyncForTests()
  db.close()
  delete globalThis.localStorage
})

// Φέρνει μια συσκευή στην κατάσταση «όλες οι 4 προϋποθέσεις ισχύουν για τον ALICE».
async function makeAliceFullyReady() {
  await claimLegacyDataOwnership(ALICE, asAlice)
  const state = await runMigration(asAlice)
  expect(state.status).toBe('complete')
  await activateV2Generation(ALICE, asAlice)
}

describe('checkSyncPrerequisites', () => {
  it('χωρίς userId → NO_USER', async () => {
    expect(await checkSyncPrerequisites(null)).toEqual({ ok: false, reason: 'NO_USER' })
    expect(await checkSyncPrerequisites('')).toEqual({ ok: false, reason: 'NO_USER' })
  })

  it('συσκευή χωρίς καμία διεκδίκηση → OWNERSHIP_MISMATCH', async () => {
    expect(await checkSyncPrerequisites(ALICE)).toEqual({ ok: false, reason: 'OWNERSHIP_MISMATCH' })
  })

  it('συσκευή διεκδικημένη από ΑΛΛΟΝ χρήστη → OWNERSHIP_MISMATCH', async () => {
    await claimLegacyDataOwnership(BOB, asBob)
    expect(await checkSyncPrerequisites(ALICE)).toEqual({ ok: false, reason: 'OWNERSHIP_MISMATCH' })
  })

  it('ιδιοκτησία σωστή, migration όχι ακόμα complete → MIGRATION_INCOMPLETE', async () => {
    await claimLegacyDataOwnership(ALICE, asAlice)
    expect(await checkSyncPrerequisites(ALICE)).toEqual({ ok: false, reason: 'MIGRATION_INCOMPLETE' })
  })

  it('migration complete αλλά η ενεργή γενιά παραμένει legacy (καμία ενεργοποίηση) → GENERATION_NOT_V2', async () => {
    await claimLegacyDataOwnership(ALICE, asAlice)
    await runMigration(asAlice)
    expect(await checkSyncPrerequisites(ALICE)).toEqual({ ok: false, reason: 'GENERATION_NOT_V2' })
  })

  it('όλα καλά αλλά restore finalization σε pending → RESTORE_FINALIZATION_NOT_OK', async () => {
    await makeAliceFullyReady()
    await setRestoreFinalizationState({ userId: ALICE, targetGeneration: 'v2', status: 'pending', startedAt: 'now', completedAt: null, error: null })
    expect(await checkSyncPrerequisites(ALICE)).toEqual({ ok: false, reason: 'RESTORE_FINALIZATION_NOT_OK' })
  })

  it('restore finalization σε failed → RESTORE_FINALIZATION_NOT_OK', async () => {
    await makeAliceFullyReady()
    await setRestoreFinalizationState({ userId: ALICE, targetGeneration: 'v2', status: 'failed', startedAt: 'now', completedAt: 'now', error: 'κάτι' })
    expect(await checkSyncPrerequisites(ALICE)).toEqual({ ok: false, reason: 'RESTORE_FINALIZATION_NOT_OK' })
  })

  it('restore finalization σε complete (ή απούσα) → δεν μπλοκάρει', async () => {
    await makeAliceFullyReady()
    await setRestoreFinalizationState({ userId: ALICE, targetGeneration: 'v2', status: 'complete', startedAt: 'now', completedAt: 'now', error: null })
    expect(await checkSyncPrerequisites(ALICE)).toEqual({ ok: true, reason: null })
  })

  it('όλες οι 4 προϋποθέσεις ισχύουν, καμία restore finalization εγγραφή καθόλου → ok', async () => {
    await makeAliceFullyReady()
    expect(await checkSyncPrerequisites(ALICE)).toEqual({ ok: true, reason: null })
  })

  it('ο BOB δεν επωφελείται από τις προϋποθέσεις του ALICE (strict per-user isolation)', async () => {
    await makeAliceFullyReady()
    expect(await checkSyncPrerequisites(BOB)).toEqual({ ok: false, reason: 'OWNERSHIP_MISMATCH' })
  })
})

describe('activateSyncForCurrentUser', () => {
  it('χωρίς συνδεδεμένο χρήστη → πετάει, ΔΕΝ γράφει hint', async () => {
    await expect(activateSyncForCurrentUser({ getAuthenticatedUserId: () => null })).rejects.toThrow()
    expect(readSyncAuthorizationHint()).toBeNull()
  })

  it('προϋποθέσεις δεν ισχύουν ακόμα → πετάει με το σωστό μήνυμα, ΔΕΝ γράφει hint', async () => {
    await expect(activateSyncForCurrentUser(asAlice)).rejects.toThrow(/δεδομένα αυτής της συσκευής/)
    expect(readSyncAuthorizationHint()).toBeNull()
  })

  it('όλες οι προϋποθέσεις ισχύουν → γράφει το hint με το σωστό userId', async () => {
    await makeAliceFullyReady()
    const result = await activateSyncForCurrentUser(asAlice)
    expect(result).toEqual({ userId: ALICE })
    expect(readSyncAuthorizationHint()).toBe(ALICE)
  })
})

describe('verifySyncAuthorizationOrShutdown', () => {
  it('κανένα hint → false, session ανενεργό, ΚΑΜΙΑ κλήση configure', async () => {
    const configure = () => { throw new Error('δεν έπρεπε να κληθεί') }
    const active = await verifySyncAuthorizationOrShutdown({ getAuthenticatedUserId: () => ALICE, configure })
    expect(active).toBe(false)
    expect(isSessionSyncActive()).toBe(false)
  })

  it('hint ταιριάζει, προϋποθέσεις ισχύουν → true, session ενεργό', async () => {
    await makeAliceFullyReady()
    writeSyncAuthorizationHint(ALICE)
    const configure = () => { throw new Error('δεν έπρεπε να κληθεί') }
    const active = await verifySyncAuthorizationOrShutdown({ getAuthenticatedUserId: () => ALICE, configure })
    expect(active).toBe(true)
    expect(isSessionSyncActive()).toBe(true)
  })

  it('hint υπάρχει αλλά ο τρέχων συνδεδεμένος χρήστης είναι διαφορετικός → shutdown', async () => {
    await makeAliceFullyReady()
    writeSyncAuthorizationHint(ALICE)
    let configuredWith = null
    const configure = (opts) => { configuredWith = opts }
    const active = await verifySyncAuthorizationOrShutdown({ getAuthenticatedUserId: () => BOB, configure })
    expect(active).toBe(false)
    expect(isSessionSyncActive()).toBe(false)
    expect(readSyncAuthorizationHint()).toBeNull()
    expect(configuredWith.unsyncedTables).toEqual(db.tables.map((t) => t.name))
  })

  it('hint υπάρχει, χρήστης ταιριάζει, αλλά οι προϋποθέσεις δεν ισχύουν πια (π.χ. migration state επαναφέρθηκε) → shutdown', async () => {
    await makeAliceFullyReady()
    writeSyncAuthorizationHint(ALICE)
    await resetMigrationForTests()

    let configuredWith = null
    const configure = (opts) => { configuredWith = opts }
    const active = await verifySyncAuthorizationOrShutdown({ getAuthenticatedUserId: () => ALICE, configure })

    expect(active).toBe(false)
    expect(readSyncAuthorizationHint()).toBeNull()
    expect(configuredWith).not.toBeNull()
  })

  it('κανένας συνδεδεμένος χρήστης (getAuthenticatedUserId → null) με hint παρόν → shutdown', async () => {
    writeSyncAuthorizationHint(ALICE)
    let configuredWith = null
    const configure = (opts) => { configuredWith = opts }
    const active = await verifySyncAuthorizationOrShutdown({ getAuthenticatedUserId: () => null, configure })
    expect(active).toBe(false)
    expect(readSyncAuthorizationHint()).toBeNull()
    expect(configuredWith).not.toBeNull()
  })
})

describe('deactivateSessionSync', () => {
  it('μηδενίζει το in-memory session state ανεξάρτητα από appMeta/localStorage', async () => {
    await makeAliceFullyReady()
    writeSyncAuthorizationHint(ALICE)
    await verifySyncAuthorizationOrShutdown({ getAuthenticatedUserId: () => ALICE, configure: () => {} })
    expect(isSessionSyncActive()).toBe(true)

    deactivateSessionSync()
    expect(isSessionSyncActive()).toBe(false)
    // Το hint ΚΑΙ οι προϋποθέσεις παραμένουν ανεπηρέαστα — deactivateSessionSync αγγίζει ΜΟΝΟ το
    // in-memory session state (review, verbatim).
    expect(readSyncAuthorizationHint()).toBe(ALICE)
  })
})
