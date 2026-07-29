import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db.js'
import { MIGRATED_TABLE_NAMES, v2TableName } from './migratedTableNames.js'
import { claimLegacyDataOwnership } from './legacyOwnership.js'
import { runMigration, resetMigrationForTests } from './migrationEngine.js'
import {
  getActiveGeneration, initializeActiveGeneration, activateV2Generation, activeTable,
  resetActiveGenerationForTests, resolveEntityId
} from './activeGeneration.js'

const ALICE = 'alice@example.com'
const BOB = 'bob@example.com'
const asAlice = { getAuthenticatedUserId: () => ALICE }
const asBob = { getAuthenticatedUserId: () => BOB }

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  await resetActiveGenerationForTests()
  await resetMigrationForTests()
  await Promise.all(MIGRATED_TABLE_NAMES.map((t) => db.table(t).clear()))
  db.close()
})

// Τρέχει ένα ολόκληρο, πραγματικό migration μέχρι 'complete' για τον δοσμένο χρήστη — με άδειους
// legacy πίνακες το verifyMigration περνάει τετριμμένα (καμία legacy γραμμή να ελεγχθεί), άρα αυτό
// είναι η απλούστερη διαδρομή προς ένα γνήσιο 'complete' state χωρίς να χρειάζεται seeding.
async function completeMigrationFor(userId, auth) {
  await claimLegacyDataOwnership(userId, auth)
  const state = await runMigration(auth)
  expect(state.status).toBe('complete')
}

describe('getActiveGeneration — καθαρή ανάγνωση appMeta, fail-closed', () => {
  it('καμία εγγραφή marker → legacy', async () => {
    expect(await getActiveGeneration(ALICE)).toBe('legacy')
  })

  it('marker generation:"v2" ΓΙΑ ΤΟΝ ΙΔΙΟ χρήστη → v2', async () => {
    await completeMigrationFor(ALICE, asAlice)
    await activateV2Generation(ALICE, asAlice)
    expect(await getActiveGeneration(ALICE)).toBe('v2')
  })

  it('marker v2 άφησε ΑΛΛΟΣ χρήστης στην ΙΔΙΑ συσκευή → legacy (ΔΕΝ κληρονομείται σιωπηλά)', async () => {
    await completeMigrationFor(ALICE, asAlice)
    await activateV2Generation(ALICE, asAlice)
    expect(await getActiveGeneration(BOB)).toBe('legacy')
  })

  it('χωρίς userId (undefined) ακόμα κι αν υπάρχει marker → legacy', async () => {
    await completeMigrationFor(ALICE, asAlice)
    await activateV2Generation(ALICE, asAlice)
    expect(await getActiveGeneration(undefined)).toBe('legacy')
  })

  it('ΔΕΝ αγγίζει το cache — καθαρή ανάγνωση, βλ. cache-discipline tests παρακάτω', async () => {
    await completeMigrationFor(ALICE, asAlice)
    await activateV2Generation(ALICE, asAlice)
    await resetActiveGenerationForTests() // cache→legacy, ΔΕΝ σβήνει το migration/ownership state
    // Ξαναγράφουμε το marker απευθείας μέσω claim+activate ώστε το appMeta να δείχνει v2 ξανά,
    // ΧΩΡΙΣ να περάσει από initializeActiveGeneration/activateV2Generation's cache-write.
    await db.appMeta.put({ key: 'phase2ActiveGeneration', value: { generation: 'v2', userId: ALICE, setAt: 'now' } })
    expect(await getActiveGeneration(ALICE)).toBe('v2') // το appMeta λέει v2...
    expect(activeTable('students')).toBe(db.table('students')) // ...αλλά το cache ΔΕΝ άλλαξε, παραμένει legacy
  })
})

describe('activeTable — συγχρονικό, διαβάζει ΜΟΝΟ το cache', () => {
  it('πριν από ΚΑΘΕ initialize/activate → legacy πίνακες (ασφαλής προεπιλογή)', () => {
    expect(activeTable('students')).toBe(db.table('students'))
    expect(activeTable('goals')).toBe(db.table('goals'))
  })

  it('όνομα εκτός MIGRATED_TABLE_NAMES → πετάει (π.χ. appMeta)', () => {
    expect(() => activeTable('appMeta')).toThrow(/δεν είναι γνωστός εκπαιδευτικός πίνακας/)
    expect(() => activeTable('students_v2')).toThrow()
  })

  it('μετά από επιτυχή initializeActiveGeneration με v2 marker → _v2 πίνακες', async () => {
    await completeMigrationFor(ALICE, asAlice)
    await activateV2Generation(ALICE, asAlice)
    await resetActiveGenerationForTests()
    await db.appMeta.put({ key: 'phase2ActiveGeneration', value: { generation: 'v2', userId: ALICE, setAt: 'now' } })

    await initializeActiveGeneration({ getUserId: () => ALICE })
    expect(activeTable('students')).toBe(db.table('students_v2'))
    expect(activeTable('domainTemplates')).toBe(db.table(v2TableName('domainTemplates')))
  })

  it('initializeActiveGeneration ΧΩΡΙΣ authenticated χρήστη (getUserId→null) → παραμένει legacy', async () => {
    await initializeActiveGeneration({ getUserId: () => null })
    expect(activeTable('sessions')).toBe(db.table('sessions'))
  })
})

describe('activateV2Generation — αδύνατη πρόωρη ενεργοποίηση', () => {
  it('χωρίς authenticated χρήστη → πετάει', async () => {
    await expect(activateV2Generation(ALICE, { getAuthenticatedUserId: () => null })).rejects.toThrow(/ταιριάζει/)
  })

  it('userId ορίσματος ΔΕΝ ταιριάζει με τον authenticated χρήστη (spoofing) → πετάει', async () => {
    await expect(activateV2Generation(BOB, asAlice)).rejects.toThrow(/ταιριάζει/)
  })

  it('legacy δεδομένα ΑΝΕΞΑΡΤΗΤΑ (κανείς δεν τα διεκδίκησε) → πετάει LEGACY_OWNER_UNCLAIMED', async () => {
    await expect(activateV2Generation(ALICE, asAlice)).rejects.toMatchObject({ code: 'LEGACY_OWNER_UNCLAIMED' })
  })

  it('legacy δεδομένα διεκδικημένα από ΑΛΛΟΝ χρήστη → πετάει LEGACY_OWNER_MISMATCH', async () => {
    await claimLegacyDataOwnership(ALICE, asAlice)
    await expect(activateV2Generation(BOB, asBob)).rejects.toMatchObject({ code: 'LEGACY_OWNER_MISMATCH' })
  })

  it('migration δεν έχει ξεκινήσει ακόμα → πετάει MIGRATION_NOT_COMPLETE', async () => {
    await claimLegacyDataOwnership(ALICE, asAlice)
    await expect(activateV2Generation(ALICE, asAlice)).rejects.toMatchObject({ code: 'MIGRATION_NOT_COMPLETE' })
  })

  it('migration απέτυχε (failed) → πετάει MIGRATION_NOT_COMPLETE', async () => {
    await claimLegacyDataOwnership(ALICE, asAlice)
    // Προσομοιώνουμε "failed" γράφοντας κατευθείαν το ήδη τεκμηριωμένο migration state shape
    // (migrationEngine.js, STATE_KEY='phase2MigrationState') — αποφεύγει τεχνητό migrateTable
    // spy μόνο για να παράγουμε ένα failed state. Η πραγματική getMigrationState (καμία
    // παράκαμψη εδώ) το διαβάζει κανονικά.
    await db.appMeta.put({
      key: 'phase2MigrationState',
      value: { version: 1, userId: ALICE, status: 'failed', tables: {}, verification: null, lastError: { table: null, message: 'x', at: 'now' } }
    })
    await expect(activateV2Generation(ALICE, asAlice)).rejects.toMatchObject({ code: 'MIGRATION_NOT_COMPLETE' })
  })

  it('ΟΛΑ έγκυρα (userId ταιριάζει, ownership ταιριάζει, migration complete) → επιτυχία, γράφει appMeta ΚΑΙ ενημερώνει το cache', async () => {
    await completeMigrationFor(ALICE, asAlice)
    const marker = await activateV2Generation(ALICE, asAlice)

    expect(marker.generation).toBe('v2')
    expect(marker.userId).toBe(ALICE)
    expect(await getActiveGeneration(ALICE)).toBe('v2')
    expect(activeTable('students')).toBe(db.table('students_v2'))
  })

  it('idempotent: δεύτερη κλήση για τον ΙΔΙΟ ήδη-ενεργοποιημένο χρήστη → no-op, ΔΕΝ αλλάζει το setAt', async () => {
    await completeMigrationFor(ALICE, asAlice)
    const first = await activateV2Generation(ALICE, asAlice)
    const second = await activateV2Generation(ALICE, asAlice)
    expect(second.setAt).toBe(first.setAt)
  })
})

// Critical hotfix (Technical Fix Plan) — resolveEntityId αντικαθιστά ΚΑΘΕ σκόρπιο Number(id) σε
// components. Πριν αυτό, ένα v2 UUID/SHA route id γινόταν σιωπηλά NaN, και ένα .get(NaN)/.equals(NaN)
// στην IndexedDB πετάει invalid-key σφάλμα αντί να επιστρέψει «δεν βρέθηκε» (βλ. StudentProfile.jsx/
// StudentForm.jsx ErrorBoundary crash, αναπαραχθέν ζωντανά κατά το Real Multi-Device Sync Validation).
describe('resolveEntityId — κεντρικός helper μετατροπής route/entity id ανά γενιά', () => {
  it('null/undefined → null', () => {
    expect(resolveEntityId(null)).toBe(null)
    expect(resolveEntityId(undefined)).toBe(null)
  })

  it('κενό string ή μόνο κενά → null', () => {
    expect(resolveEntityId('')).toBe(null)
    expect(resolveEntityId(' ')).toBe(null)
    expect(resolveEntityId('   ')).toBe(null)
  })

  describe('legacy γενιά — αυστηρή επικύρωση θετικού ακέραιου', () => {
    it('έγκυρο θετικό ακέραιο string → number', () => {
      expect(resolveEntityId('42')).toBe(42)
      expect(resolveEntityId(42)).toBe(42)
    })

    it('δεκαδικό → null (όχι έγκυρο legacy ++id)', () => {
      expect(resolveEntityId('4.5')).toBe(null)
    })

    it('αρνητικό → null', () => {
      expect(resolveEntityId('-1')).toBe(null)
    })

    it('μηδέν → null (Dexie ++id ξεκινάει από 1)', () => {
      expect(resolveEntityId('0')).toBe(null)
    })

    it('Infinity → null', () => {
      expect(resolveEntityId('Infinity')).toBe(null)
      expect(resolveEntityId(Infinity)).toBe(null)
    })

    it('μη ασφαλής ακέραιος (πέρα από Number.MAX_SAFE_INTEGER) → null', () => {
      expect(resolveEntityId(String(Number.MAX_SAFE_INTEGER + 10))).toBe(null)
    })

    it('μη αριθμητικό/κατεστραμμένο string (π.χ. garbage URL) → null, ΠΟΤΕ NaN', () => {
      expect(resolveEntityId('abc123xyz')).toBe(null)
      expect(resolveEntityId('f4fff8e7-8da0-4975-8245-4455a7777ef3')).toBe(null) // v2 uuid ζητημένο σε legacy γενιά
    })
  })

  describe('v2 γενιά — παραμένει string, ΑΜΕΤΑΒΛΗΤΟ', () => {
    async function activateV2() {
      await claimLegacyDataOwnership(ALICE, asAlice)
      const state = await runMigration(asAlice)
      expect(state.status).toBe('complete')
      await activateV2Generation(ALICE, asAlice)
    }

    it('UUID (crypto.randomUUID σχήμα) διατηρείται ακριβώς', async () => {
      await activateV2()
      const uuid = 'f4fff8e7-8da0-4975-8245-4455a7777ef3'
      expect(resolveEntityId(uuid)).toBe(uuid)
    })

    it('SHA-256 hex digest (deterministicId σχήμα, migrated εγγραφές) διατηρείται ακριβώς', async () => {
      await activateV2()
      const sha = 'a'.repeat(64) // 64-char hex, ίδιο μήκος με πραγματικό SHA-256 digest
      expect(resolveEntityId(sha)).toBe(sha)
    })

    it('εξωτερικό whitespace κόβεται, το ίδιο το id ΔΕΝ αλλάζει', async () => {
      await activateV2()
      expect(resolveEntityId('  some-v2-id  ')).toBe('some-v2-id')
    })

    it('ένα «αριθμητικό-looking» v2 id ΔΕΝ μετατρέπεται σε number', async () => {
      await activateV2()
      expect(resolveEntityId('42')).toBe('42')
      expect(typeof resolveEntityId('42')).toBe('string')
    })
  })
})

describe('cache discipline (review) — το cache γράφεται ΜΟΝΟ από initialize/activate/test-reset', () => {
  it('getActiveGeneration (καθαρή ανάγνωση) ΔΕΝ επηρεάζει το τι επιστρέφει το activeTable()', async () => {
    await completeMigrationFor(ALICE, asAlice)
    // appMeta ΔΕΝ έχει ακόμα v2 marker — getActiveGeneration απλά διαβάζει, δεν γράφει τίποτα.
    await getActiveGeneration(ALICE)
    expect(activeTable('students')).toBe(db.table('students')) // cache παραμένει legacy

    await activateV2Generation(ALICE, asAlice) // ΤΩΡΑ το cache αλλάζει, μέσω του ΜΟΝΑΔΙΚΟΥ setter
    expect(activeTable('students')).toBe(db.table('students_v2'))
  })

  it('resetActiveGenerationForTests επαναφέρει το cache σε legacy ΚΑΙ σβήνει το appMeta marker', async () => {
    await completeMigrationFor(ALICE, asAlice)
    await activateV2Generation(ALICE, asAlice)
    expect(activeTable('students')).toBe(db.table('students_v2'))

    await resetActiveGenerationForTests()
    expect(activeTable('students')).toBe(db.table('students'))
    expect(await getActiveGeneration(ALICE)).toBe('legacy')
  })
})
