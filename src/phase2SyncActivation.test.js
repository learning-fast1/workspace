import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import db from './db.js'
import { claimLegacyDataOwnership } from './migration/legacyOwnership.js'
import { runMigration, resetMigrationForTests } from './migration/migrationEngine.js'
import { activateV2Generation, resetActiveGenerationForTests, getActiveGeneration } from './migration/activeGeneration.js'
import {
  checkSyncPrerequisites, activateSyncForCurrentUser, verifySyncAuthorizationOrShutdown,
  isSessionSyncActive, resetSessionSyncForTests
} from './migration/syncAuthorization.js'
import { readSyncAuthorizationHint, computeUnsyncedTables } from './migration/syncAuthorizationHint.js'
import { MIGRATED_TABLE_NAMES, v2TableName } from './migration/migratedTableNames.js'

// Sprint 5A Phase 2, Commit 6 — πλήρης end-to-end απόδειξη ΟΛΗΣ της αλυσίδας: migrate → activate v2
// → ενεργοποίηση συγχρονισμού (γράφει hint) → ΠΡΟΣΟΜΟΙΩΣΗ επόμενου reload (computeUnsyncedTables
// πάνω στο ΙΔΙΟ hint, ΑΚΡΙΒΩΣ ό,τι θα έκανε το db.js bootstrap) → post-open επιβεβαίωση (ΑΚΡΙΒΩΣ
// ό,τι θα έκανε το main.jsx) — ΚΑΙ strict per-user isolation: ένας δεύτερος χρήστης/συσκευή ΔΕΝ
// επωφελείται ΠΟΤΕ από το hint/προϋποθέσεις του πρώτου.
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

describe('Πλήρης ροή: migrate → activate v2 → ενεργοποίηση συγχρονισμού → reload → sync ενεργό μόνο για τους 16 _v2 πίνακες', () => {
  it('ολόκληρη η αλυσίδα καταλήγει σε session ενεργού συγχρονισμού, με τη σωστή manifest λίστα', async () => {
    // 1) Πραγματικά legacy δεδομένα, migrate, activate v2 — ίδιο μοτίβο με
    // phase2EndToEndSwitchover.test.jsx.
    await db.students.add({ code: 'Μ1', active: true, functionalProfile: [], preferences: {} })
    await claimLegacyDataOwnership(ALICE, asAlice)
    const migrationState = await runMigration(asAlice)
    expect(migrationState.status).toBe('complete')
    await activateV2Generation(ALICE, asAlice)
    expect(await getActiveGeneration(ALICE)).toBe('v2')

    // 2) Οι 4 προϋποθέσεις ισχύουν πλέον.
    expect(await checkSyncPrerequisites(ALICE)).toEqual({ ok: true, reason: null })

    // 3) Ρητή ενεργοποίηση από τον χρήστη — γράφει ΜΟΝΟ το hint, ΔΕΝ έχει άμεσο αποτέλεσμα αυτή
    // τη σελίδα-φόρτωση (evidence-based εύρημα, βλ. syncAuthorization.js).
    await activateSyncForCurrentUser(asAlice)
    expect(readSyncAuthorizationHint()).toBe(ALICE)
    expect(isSessionSyncActive()).toBe(false) // ΑΚΟΜΑ όχι — χρειάζεται reload

    // 4) ΠΡΟΣΟΜΟΙΩΣΗ επόμενου reload — ΑΚΡΙΒΩΣ ό,τι υπολογίζει το db.js bootstrap ΠΡΙΝ το
    // db.cloud.configure()/db.open(): το hint είναι ήδη διαθέσιμο ΣΥΓΧΡΟΝΑ.
    // Review (real-device εύρημα: $baseRevs άδειο, καμία λήψη ΠΟΤΕ) — σε αυτό το test file
    // CLOUD_ENABLED=false (βλ. .env.test.local), άρα το πραγματικό db.tables ΔΕΝ περιλαμβάνει τους
    // εσωτερικούς πίνακες του addon (realms/members/roles/$...). Προσθέτονται εδώ ρητά στο
    // allTableNames ώστε το test να ελέγχει ΣΥΜΠΕΡΙΦΟΡΑ (ποτέ δεν αποκλείονται από το sync), όχι
    // απλή αριθμητική που θα περνούσε ακόμα κι αν ξαναγύριζε το bug.
    const allTableNames = db.tables.map((t) => t.name)
      .concat(['realms', 'members', 'roles', '$logins', '$baseRevs', '$syncState', '$jobs', '$students_v2_mutations'])
    const unsyncedTables = computeUnsyncedTables({ hint: readSyncAuthorizationHint(), allTableNames })
    for (const legacy of MIGRATED_TABLE_NAMES) expect(unsyncedTables).toContain(legacy)
    expect(unsyncedTables).toContain('appMeta')
    for (const legacy of MIGRATED_TABLE_NAMES) expect(unsyncedTables).not.toContain(v2TableName(legacy))
    expect(unsyncedTables).not.toContain('realms')
    expect(unsyncedTables).not.toContain('members')
    expect(unsyncedTables).not.toContain('roles')
    expect(unsyncedTables.some((name) => name.startsWith('$'))).toBe(false)

    // 5) ΠΡΟΣΟΜΟΙΩΣΗ post-open επιβεβαίωσης (main.jsx, ΑΜΕΣΩΣ μετά το initializeActiveGeneration).
    resetSessionSyncForTests() // νέα σελίδα-φόρτωση = καθαρό in-memory session state
    let configureCalled = false
    const active = await verifySyncAuthorizationOrShutdown({
      getAuthenticatedUserId: () => ALICE,
      configure: () => { configureCalled = true }
    })
    expect(active).toBe(true)
    expect(isSessionSyncActive()).toBe(true)
    expect(configureCalled).toBe(false) // καμία ανάγκη υποβιβασμού — όλα ταίριαζαν
  })

  it('strict per-user isolation: ο BOB δεν επωφελείται ΠΟΤΕ από το hint/προϋποθέσεις του ALICE', async () => {
    await db.students.add({ code: 'Μ1', active: true, functionalProfile: [], preferences: {} })
    await claimLegacyDataOwnership(ALICE, asAlice)
    await runMigration(asAlice)
    await activateV2Generation(ALICE, asAlice)
    await activateSyncForCurrentUser(asAlice)
    expect(readSyncAuthorizationHint()).toBe(ALICE)

    // Ο ΙΔΙΟΣ (μη έμπιστος) hint θα «κληρονομούνταν» συγχρονικά αν η συσκευή/browser profile
    // μοιράζεται — αλλά η post-open επιβεβαίωση ΠΑΝΤΑ ελέγχει τον ΠΡΑΓΜΑΤΙΚΑ authenticated χρήστη
    // ΤΩΡΑ, όχι το hint από μόνο του.
    let configuredWith = null
    const active = await verifySyncAuthorizationOrShutdown({
      getAuthenticatedUserId: () => BOB,
      configure: (opts) => { configuredWith = opts }
    })

    expect(active).toBe(false)
    expect(isSessionSyncActive()).toBe(false)
    expect(readSyncAuthorizationHint()).toBeNull() // το hint αφαιρέθηκε, ΔΕΝ διαρρέει σε επόμενο reload
    expect(configuredWith.unsyncedTables).toEqual(db.tables.map((t) => t.name)) // πλήρης λίστα, καμία εγγραφή syncable
    expect(await checkSyncPrerequisites(BOB)).toEqual({ ok: false, reason: 'OWNERSHIP_MISMATCH' })
  })

  it('ο BOB δεν μπορεί να ενεργοποιήσει συγχρονισμό πάνω σε δεδομένα που ήδη ανήκουν στον ALICE', async () => {
    await claimLegacyDataOwnership(ALICE, asAlice)
    await runMigration(asAlice)
    await activateV2Generation(ALICE, asAlice)

    await expect(activateSyncForCurrentUser(asBob)).rejects.toThrow()
    expect(readSyncAuthorizationHint()).toBeNull()
  })

  it('ανάκληση ιδιοκτησίας/migration ΜΕΤΑ την ενεργοποίηση αλλά ΠΡΙΝ το reload → shutdown κατά το post-open verify', async () => {
    await claimLegacyDataOwnership(ALICE, asAlice)
    await runMigration(asAlice)
    await activateV2Generation(ALICE, asAlice)
    await activateSyncForCurrentUser(asAlice)
    expect(readSyncAuthorizationHint()).toBe(ALICE)

    // Κάτι άλλαξε ανάμεσα στην ενεργοποίηση και το πραγματικό reload (π.χ. μια αποτυχημένη
    // επαναφορά legacy backup επαναφέρει το migration state, βλ. Commit 5).
    await resetMigrationForTests()
    await claimLegacyDataOwnership(ALICE, asAlice)

    const active = await verifySyncAuthorizationOrShutdown({ getAuthenticatedUserId: () => ALICE, configure: () => {} })
    expect(active).toBe(false)
    expect(readSyncAuthorizationHint()).toBeNull()
  })
})

// Review (real-device εύρημα: $baseRevs άδειο, καμία λήψη ΠΟΤΕ σε καθαρή συσκευή) — κατοχυρώνει ρητά
// την ΣΚΟΠΙΜΗ ασυμμετρία μεταξύ των δύο κλάδων του computeUnsyncedTables: χωρίς hint (Phase 1) η
// εγγύηση παραμένει απόλυτη («κυριολεκτικά τίποτα, ούτε υποδομή»)· ΜΟΝΟ αφού υπάρχει hint επιτρέπεται
// στην υποδομή του addon (realms/members/roles/$...) να συγχρονιστεί, μαζί με τους 16 _v2 πίνακες.
describe('computeUnsyncedTables — η ασυμμετρία των δύο κλάδων είναι σκόπιμη, όχι παράλειψη', () => {
  const SYNTHETIC_ADDON_TABLES = ['realms', 'members', 'roles', '$logins', '$baseRevs', '$syncState', '$jobs', '$students_v2_mutations']

  function fullTableNameList() {
    return MIGRATED_TABLE_NAMES
      .concat(MIGRATED_TABLE_NAMES.map(v2TableName))
      .concat(['appMeta'])
      .concat(SYNTHETIC_ADDON_TABLES)
  }

  it('χωρίς hint → επιστρέφονται ΟΛΑ τα ονόματα αναλλοίωτα, ΟΥΤΕ καν η υποδομή του addon εξαιρείται', () => {
    const allTableNames = fullTableNameList()
    expect(computeUnsyncedTables({ hint: null, allTableNames })).toEqual(allTableNames)
  })

  it('με hint → εξαιρούνται ΚΑΙ οι 16 _v2 πίνακες ΚΑΙ η υποδομή του addon (realms/members/roles/$...)', () => {
    const allTableNames = fullTableNameList()
    const unsyncedTables = computeUnsyncedTables({ hint: ALICE, allTableNames })

    for (const legacy of MIGRATED_TABLE_NAMES) expect(unsyncedTables).toContain(legacy)
    expect(unsyncedTables).toContain('appMeta')
    for (const legacy of MIGRATED_TABLE_NAMES) expect(unsyncedTables).not.toContain(v2TableName(legacy))
    for (const addonTable of SYNTHETIC_ADDON_TABLES) expect(unsyncedTables).not.toContain(addonTable)
  })
})
