import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import db, { getActiveSchoolYear, createSchoolYear, setActiveSchoolYear } from '../db.js'
import {
  buildBackupPayload, restoreFromBackup, validateBackupPayload, getLastPreRestoreSafetyBackup
} from './backup.js'
import { MIGRATED_TABLE_NAMES } from '../migration/migratedTableNames.js'
import {
  resetActiveGenerationForTests, getActiveGeneration, activateV2Generation, initializeActiveGeneration
} from '../migration/activeGeneration.js'
import { getLegacyDataOwner, claimLegacyDataOwnership } from '../migration/legacyOwnership.js'
import { runMigration, resetMigrationForTests } from '../migration/migrationEngine.js'
import { deterministicId } from '../migration/deterministicId.js'

// Sprint 5A Phase 2, Commit 5 — ίδιο idiom με phase2EndToEndSwitchover.test.jsx: getAuthenticatedUserId
// override, αφού CLOUD_ENABLED είναι πάντα false σε αυτό το test environment (χωρίς πραγματικό
// db.cloud), άρα το currentUserIdOrNull() default θα επέστρεφε πάντα null χωρίς αυτό το override.
const ALICE = 'alice@example.com'
const BOB = 'bob@example.com'
const asAlice = { getAuthenticatedUserId: () => ALICE }
const asBob = { getAuthenticatedUserId: () => BOB }

function emptyData() {
  return Object.fromEntries(MIGRATED_TABLE_NAMES.map((t) => [t, []]))
}

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  await resetActiveGenerationForTests()
  await resetMigrationForTests()
  await Promise.all(MIGRATED_TABLE_NAMES.map((t) => db.table(t).clear()))
  db.close()
})

describe('validateBackupPayload', () => {
  it('απορρίπτει μη-αντικείμενο', () => {
    expect(validateBackupPayload(null).valid).toBe(false)
    expect(validateBackupPayload('κείμενο').valid).toBe(false)
  })

  it('απορρίπτει αρχείο χωρίς το σωστό app id', () => {
    const result = validateBackupPayload({ app: 'κάτι-άλλο', data: {} })
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/δεν μοιάζει/)
  })

  it('απορρίπτει αρχείο χωρίς πεδίο data', () => {
    const result = validateBackupPayload({ app: 'workspace' })
    expect(result.valid).toBe(false)
  })

  it('απορρίπτει όταν ένας πίνακας δεν είναι λίστα', () => {
    const data = emptyData()
    data.students = { not: 'an array' }
    const result = validateBackupPayload({ app: 'workspace', data })
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/students/)
  })

  it('δέχεται έγκυρο αρχείο και μετράει τις εγγραφές πάνω στους 16 κανονικούς πίνακες', () => {
    const data = emptyData()
    data.students = [{ id: 1 }, { id: 2 }]
    const result = validateBackupPayload({ app: 'workspace', data })
    expect(result.valid).toBe(true)
    expect(result.counts.students).toBe(2)
    expect(Object.keys(result.counts).sort()).toEqual([...MIGRATED_TABLE_NAMES].sort())
  })

  describe('γενιά (generation) — fail-closed', () => {
    it('λείπει το πεδίο generation → θεωρείται legacy, έγκυρο', () => {
      const result = validateBackupPayload({ app: 'workspace', data: emptyData() })
      expect(result.valid).toBe(true)
      expect(result.generation).toBe('legacy')
    })

    it("generation:'legacy' → έγκυρο", () => {
      const result = validateBackupPayload({ app: 'workspace', data: emptyData(), generation: 'legacy' })
      expect(result.valid).toBe(true)
      expect(result.generation).toBe('legacy')
    })

    it("generation:'v2' → έγκυρο", () => {
      const result = validateBackupPayload({ app: 'workspace', data: emptyData(), generation: 'v2' })
      expect(result.valid).toBe(true)
      expect(result.generation).toBe('v2')
    })

    it('οποιαδήποτε άλλη τιμή generation → σφάλμα', () => {
      const result = validateBackupPayload({ app: 'workspace', data: emptyData(), generation: 'κάτι-άλλο' })
      expect(result.valid).toBe(false)
      expect(result.error).toMatch(/Άγνωστη γενιά/)
    })
  })

  describe('ownership', () => {
    it('εξάγει ownership όταν υπάρχει έγκυρο, μη κενό userId string', () => {
      const result = validateBackupPayload({ app: 'workspace', data: emptyData(), ownership: { userId: ALICE } })
      expect(result.ownership).toEqual({ userId: ALICE })
    })

    it('ownership απόν/malformed/κενό → null', () => {
      expect(validateBackupPayload({ app: 'workspace', data: emptyData() }).ownership).toBeNull()
      expect(validateBackupPayload({ app: 'workspace', data: emptyData(), ownership: null }).ownership).toBeNull()
      expect(validateBackupPayload({ app: 'workspace', data: emptyData(), ownership: {} }).ownership).toBeNull()
      expect(validateBackupPayload({ app: 'workspace', data: emptyData(), ownership: { userId: '   ' } }).ownership).toBeNull()
    })
  })
})

describe('buildBackupPayload', () => {
  it('περιέχει ακριβώς τους 16 κανονικούς εκπαιδευτικούς πίνακες, όχι appMeta', async () => {
    const payload = await buildBackupPayload()
    expect(Object.keys(payload.data).sort()).toEqual([...MIGRATED_TABLE_NAMES].sort())
    expect(payload.data.appMeta).toBeUndefined()
  })

  it('generation ταιριάζει με την τρέχουσα ενεργή γενιά (legacy εξ ορισμού)', async () => {
    const payload = await buildBackupPayload()
    expect(payload.generation).toBe('legacy')
  })

  it('ownership είναι null όταν η συσκευή δεν έχει διεκδικηθεί ακόμα', async () => {
    const payload = await buildBackupPayload()
    expect(payload.ownership).toBeNull()
  })

  it('ownership περιλαμβάνει το userId όταν η συσκευή έχει ήδη διεκδικηθεί', async () => {
    await claimLegacyDataOwnership(ALICE, asAlice)
    const payload = await buildBackupPayload()
    expect(payload.ownership).toEqual({ userId: ALICE })
  })
})

describe('restoreFromBackup — legacy', () => {
  it('η επαναφορά αντικαθιστά πλήρως τα δεδομένα διατηρώντας τα id (round-trip)', async () => {
    await db.students.add({ id: 1, code: 'Μ1', active: true, functionalProfile: [], preferences: {} })
    await db.goals.add({ id: 1, studentId: 1, domain: 'reading', title: 'Στόχος Α', status: 'active', priority: 'high' })

    const payload = await buildBackupPayload()

    await db.students.clear()
    await db.goals.clear()
    await db.students.add({ id: 1, code: 'ΑΛΛΟΣ', active: true, functionalProfile: [], preferences: {} })

    const result = await restoreFromBackup(payload)

    expect(result.generation).toBe('legacy')
    const student = await db.students.get(1)
    const goal = await db.goals.get(1)
    expect(student.code).toBe('Μ1')
    expect(goal.title).toBe('Στόχος Α')
  })

  it('η επαναφορά από backup με άδειο domainTemplates ξαναγεμίζει τα seed πρότυπα', async () => {
    const payload = await buildBackupPayload()
    payload.data.domainTemplates = []

    await restoreFromBackup(payload)

    const templates = await db.domainTemplates.toArray()
    expect(templates.length).toBeGreaterThan(0)
  })

  it('δέχεται παλιά backups χωρίς πεδίο generation/ownership και χωρίς μερικά κλειδιά πινάκων', async () => {
    const payload = await buildBackupPayload()
    delete payload.generation
    delete payload.ownership
    for (const table of ['schoolYears', 'schoolYearParticipation', 'goalEvents', 'goalTemplates', 'sessionGoalAssessments']) {
      delete payload.data[table]
    }

    await expect(restoreFromBackup(payload)).resolves.not.toThrow()
    expect(await db.schoolYears.count()).toBe(0)
    expect(await db.sessionGoalAssessments.count()).toBe(0)
  })

  it('επιστρέφει ένα safetyBackup με στιγμιότυπο της κατάστασης πριν την επαναφορά', async () => {
    await db.students.add({ id: 1, code: 'ΠΡΙΝ', active: true, functionalProfile: [], preferences: {} })
    const before = await buildBackupPayload()

    const payload = await buildBackupPayload()
    payload.data.students = [{ id: 1, code: 'ΜΕΤΑ', active: true, functionalProfile: [], preferences: {} }]

    const result = await restoreFromBackup(payload)
    expect(result.safetyBackup.data.students).toEqual(before.data.students)
  })

  it('ξανατρέχει το migration ΚΑΙ επανενεργοποιεί τη v2 όταν ο χρήστης ήταν ήδη σε v2', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: true, functionalProfile: [], preferences: {} })
    await db.goals.add({ id: 1, studentId, domain: 'reading', title: 'Αρχικός τίτλος', status: 'active', priority: 'medium', startDate: '2025-09-01' })

    const payload = await buildBackupPayload()
    expect(payload.generation).toBe('legacy')

    await claimLegacyDataOwnership(ALICE, asAlice)
    await runMigration(asAlice)
    await activateV2Generation(ALICE, asAlice)
    expect(await getActiveGeneration(ALICE)).toBe('v2')

    // Προσομοιώνει τοπικές αλλαγές ΜΕΤΑ τη λήψη του backup.
    await db.goals.update(1, { title: 'Άλλαξε μετά το backup' })

    const result = await restoreFromBackup(payload, asAlice)

    expect(result.generation).toBe('legacy')
    expect((await db.goals.get(1)).title).toBe('Αρχικός τίτλος')
    expect(result.migrationState.status).toBe('complete')
    expect(await getActiveGeneration(ALICE)).toBe('v2')
    expect(result.finalization).toMatchObject({ userId: ALICE, targetGeneration: 'v2', status: 'complete' })

    const goalV2Id = await deterministicId(ALICE, 'goals', 1)
    expect((await db.table('goals_v2').get(goalV2Id)).title).toBe('Αρχικός τίτλος')
  })

  it('υποβιβάζει ΑΜΕΣΩΣ τη γενιά σε legacy και καταγράφει finalization "failed" όταν το claim/migrate μετά το restore δεν μπορεί να ολοκληρωθεί', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: true, functionalProfile: [], preferences: {} })
    await db.goals.add({ id: 1, studentId, domain: 'reading', title: 'Τίτλος', status: 'active', priority: 'medium', startDate: '2025-09-01' })

    // Σημαντικό: το backup λαμβάνεται ΠΡΙΝ την ενεργοποίηση v2 (όσο το cache είναι ακόμα 'legacy')
    // — αλλιώς buildBackupPayload θα διάβαζε από τους _v2 πίνακες, παράγοντας payload.generation:'v2'.
    const payload = await buildBackupPayload()
    expect(payload.generation).toBe('legacy')

    await claimLegacyDataOwnership(ALICE, asAlice)
    await runMigration(asAlice)
    await activateV2Generation(ALICE, asAlice)
    expect(await getActiveGeneration(ALICE)).toBe('v2')

    // ΧΩΡΙΣ getAuthenticatedUserId override → currentUserIdOrNull() πραγματικά null (CLOUD_ENABLED
    // false στο test environment) → το claim μέσα στο finalizeLegacyRestore αποτυγχάνει.
    const result = await restoreFromBackup(payload)

    // Τα ίδια τα δεδομένα αποκαταστάθηκαν κανονικά.
    expect((await db.goals.get(1)).title).toBe('Τίτλος')
    // Η ενεργή γενιά ΔΕΝ έμεινε αθόρυβα σε 'v2' (όπου τα _v2 δεδομένα είναι πλέον άδεια/μπαγιάτικα) —
    // υποβιβάστηκε ρητά σε legacy, τη ΜΟΝΗ γενιά εγγυημένα συνεπή αυτή τη στιγμή.
    expect(await getActiveGeneration(ALICE)).toBe('legacy')
    expect(result.finalization).toMatchObject({ userId: ALICE, targetGeneration: 'v2', status: 'failed' })
    expect(result.finalization.error).toBeTruthy()
  })
})

describe('restoreFromBackup — durability του safety backup', () => {
  it('το safety backup είναι ήδη persisted στο appMeta πριν καν κάνει commit η καταστροφική transaction', async () => {
    await db.students.add({ id: 1, code: 'ΠΡΙΝ', active: true, functionalProfile: [], preferences: {} })
    const before = await buildBackupPayload()

    const payload = await buildBackupPayload()
    payload.data.students = [{ id: 1, code: 'ΜΕΤΑ', active: true, functionalProfile: [], preferences: {} }]

    await restoreFromBackup(payload)

    // Ανεξάρτητα από την επιστρεφόμενη τιμή του restoreFromBackup, το appMeta έχει ήδη το
    // στιγμιότυπο ΠΡΙΝ την επαναφορά — προσομοιώνει έναν καλούντα που ΔΕΝ πρόλαβε να κάνει τίποτα
    // με το επιστρεφόμενο safetyBackup (π.χ. crash του browser αμέσως μετά το restore).
    const persisted = await getLastPreRestoreSafetyBackup()
    expect(persisted.data.students).toEqual(before.data.students)
  })
})

describe('restoreFromBackup — v2', () => {
  it('γράφει απευθείας στους _v2 πίνακες, οι legacy παραμένουν άδειοι, ενεργοποιείται ο δείκτης γενιάς', async () => {
    const payload = {
      app: 'workspace',
      dbVersion: db.verno,
      exportedAt: new Date().toISOString(),
      generation: 'v2',
      ownership: { userId: ALICE },
      data: emptyData()
    }
    payload.data.students = [{ id: 'stu-1', code: 'Μ1', active: true, functionalProfile: [], preferences: {} }]

    const result = await restoreFromBackup(payload, asAlice)

    expect(result.generation).toBe('v2')
    expect(await db.table('students_v2').get('stu-1')).toMatchObject({ code: 'Μ1' })
    expect(await db.students.count()).toBe(0)
    expect(await getActiveGeneration(ALICE)).toBe('v2')
  })
})

describe('restoreFromBackup — ασφάλεια ιδιοκτησίας (fail before clearing anything)', () => {
  it('αρνείται backup με ownership διαφορετικού λογαριασμού από τον τρέχοντα συνδεδεμένο χρήστη, χωρίς να αγγίξει δεδομένα', async () => {
    await db.students.add({ id: 1, code: 'ΥΠΑΡΧΩΝ', active: true, functionalProfile: [], preferences: {} })
    const payload = {
      app: 'workspace', dbVersion: db.verno, exportedAt: new Date().toISOString(),
      generation: 'legacy', ownership: { userId: BOB }, data: emptyData()
    }

    await expect(restoreFromBackup(payload, asAlice)).rejects.toThrow(/διαφορετικό λογαριασμό/)
    expect(await db.students.count()).toBe(1)
    expect((await db.students.get(1)).code).toBe('ΥΠΑΡΧΩΝ')
  })

  it('αρνείται v2 backup χωρίς στοιχεία ιδιοκτησίας, πριν αγγίξει οτιδήποτε', async () => {
    await db.students.add({ id: 1, code: 'ΥΠΑΡΧΩΝ', active: true, functionalProfile: [], preferences: {} })
    const payload = {
      app: 'workspace', dbVersion: db.verno, exportedAt: new Date().toISOString(),
      generation: 'v2', ownership: null, data: emptyData()
    }

    await expect(restoreFromBackup(payload)).rejects.toThrow(/ιδιοκτησίας/)
    expect(await db.students.count()).toBe(1)
  })

  it('αρνείται όταν η συσκευή ανήκει ήδη σε άλλο λογαριασμό από το ownership του backup', async () => {
    await claimLegacyDataOwnership(ALICE, asAlice)
    const payload = {
      app: 'workspace', dbVersion: db.verno, exportedAt: new Date().toISOString(),
      generation: 'legacy', ownership: { userId: BOB }, data: emptyData()
    }

    await expect(restoreFromBackup(payload, asBob)).rejects.toThrow(/άλλο λογαριασμό/)
  })

  it('αρνείται παλιό backup χωρίς ownership όταν η συσκευή ανήκει ήδη σε διαφορετικό τρέχοντα χρήστη', async () => {
    await claimLegacyDataOwnership(ALICE, asAlice)
    const payload = {
      app: 'workspace', dbVersion: db.verno, exportedAt: new Date().toISOString(),
      data: emptyData()
    }

    await expect(restoreFromBackup(payload, asBob)).rejects.toThrow(/άλλο λογαριασμό/)
  })

  it('δέχεται παλιό backup χωρίς ownership όταν δεν υπάρχει σύγκρουση ιδιοκτησίας', async () => {
    const payload = {
      app: 'workspace', dbVersion: db.verno, exportedAt: new Date().toISOString(),
      data: emptyData()
    }

    await expect(restoreFromBackup(payload, asAlice)).resolves.not.toThrow()
    expect(await getLegacyDataOwner()).toMatchObject({ userId: ALICE })
  })
})

// Ζητήθηκε ρητά (review, μετά την πρώτη έγκριση): πλήρης end-to-end απόδειξη ότι ένα restored legacy
// backup ΟΝΤΩΣ επαναφέρει την εφαρμογή σε πλήρως χρησιμοποιήσιμη v2 κατάσταση — ΟΧΙ μόνο ελέγχοντας
// raw πίνακες, αλλά περνώντας από ΟΛΗ την αλυσίδα: restore (→ migration μέσα στο ίδιο το finalization)
// → ρητή ενεργοποίηση → προσομοιωμένο hard reload → πραγματικό application read/write μέσω db.js.
describe('Πλήρης ροή: legacy backup → restore → migration → activation → reload → χρήση', () => {
  it('ένα restored legacy backup επαναφέρει την εφαρμογή σε πλήρως χρησιμοποιήσιμη v2 κατάσταση', async () => {
    // 1) Καθαρά legacy δεδομένα, ΠΡΙΝ από οποιαδήποτε διεκδίκηση/migration/ενεργοποίηση — η
    // κατάσταση μιας ήδη υπάρχουσας, pre-cloud εγκατάστασης.
    const studentId = await db.students.add({ code: 'Μ1', active: true, functionalProfile: [], preferences: {} })
    const yearId = await db.schoolYears.add({ label: '2025-2026', startDate: '2025-09-01', endDate: '2026-06-30', isActive: true })
    await db.goals.add({ id: 1, studentId, domain: 'reading', title: 'Στόχος Α', status: 'active', priority: 'medium', startDate: '2025-09-01' })

    // 2) Ένα LEGACY backup αυτής της κατάστασης (cache ακόμα legacy, καμία διεκδίκηση ακόμα —
    // ownership: null στο payload, ΑΚΡΙΒΩΣ όπως ένα backup ληφθέν πριν υπάρξει καν το Phase 2).
    const payload = await buildBackupPayload()
    expect(payload.generation).toBe('legacy')
    expect(payload.ownership).toBeNull()

    // 3) Restore σε (προσομοίωση) μια συσκευή όπου ο ALICE μόλις συνδέθηκε με cloud — το
    // finalization διεκδικεί εκ μέρους της ΚΑΙ τρέχει το migration μέσα στην ίδια κλήση.
    const result = await restoreFromBackup(payload, asAlice)
    expect(result.generation).toBe('legacy')
    expect(result.migrationState.status).toBe('complete')
    expect(result.finalization).toMatchObject({ userId: ALICE, targetGeneration: 'legacy', status: 'complete' })

    // 4) Η ενεργή γενιά ΔΕΝ αλλάζει αυτόματα σε v2 μόνο επειδή το migration πέτυχε — η συσκευή
    // δεν ήταν ήδη σε v2 πριν το restore, άρα χρειάζεται ΡΗΤΗ, ξεχωριστή ενεργοποίηση (ίδιο
    // μοντέλο με phase2EndToEndSwitchover.test.jsx).
    expect(await getActiveGeneration(ALICE)).toBe('legacy')
    const marker = await activateV2Generation(ALICE, asAlice)
    expect(marker.generation).toBe('v2')
    expect(await getActiveGeneration(ALICE)).toBe('v2')

    // 5) Προσομοίωση ΠΡΑΓΜΑΤΙΚΟΥ hard reload — ΑΚΡΙΒΩΣ ό,τι κάνει το main.jsx bootstrap.
    await resetActiveGenerationForTests({ clearPersisted: false })
    await initializeActiveGeneration({ getUserId: () => ALICE })

    // 6) Αντιπροσωπευτική ΑΝΑΓΝΩΣΗ μέσω πραγματικού application API — διαβάζει το ΜΕΤΑΦΕΡΜΕΝΟ έτος.
    expect(await getActiveSchoolYear()).toMatchObject({ label: '2025-2026' })

    // 7) Αντιπροσωπευτική ΔΗΜΙΟΥΡΓΙΑ μετά το reload — αποδεικνύει ότι η εγγραφή πηγαίνει σωστά
    // στο _v2 (νέο UUID id, ΟΧΙ αριθμητικό legacy-style).
    const newYearId = await createSchoolYear({ label: '2026-2027', startDate: '2026-09-01', endDate: '2027-06-30' })
    expect(typeof newYearId).toBe('string')
    expect(await db.table('schoolYears_v2').get(newYearId)).toMatchObject({ label: '2026-2027' })

    // 8) Αντιπροσωπευτική ΕΝΗΜΕΡΩΣΗ μετά το reload — πολυ-γραμμική αλλαγή (deactivate παλιού έτους).
    await setActiveSchoolYear(newYearId)
    expect((await db.table('schoolYears_v2').get(newYearId)).isActive).toBe(true)
    const oldYearV2Id = await deterministicId(ALICE, 'schoolYears', yearId)
    expect((await db.table('schoolYears_v2').get(oldYearV2Id)).isActive).toBe(false)

    // 9) Η legacy γενιά παραμένει ανέγγιχτη από τα βήματα 6-8 (καμία διαρροή εγγραφής στη λάθος γενιά).
    expect((await db.schoolYears.get(yearId)).isActive).toBe(true)
  })
})
