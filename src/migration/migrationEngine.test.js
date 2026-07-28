import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db.js'
import { deterministicId } from './deterministicId.js'
import { MIGRATED_TABLE_NAMES, v2TableName } from './migratedTableNames.js'
import { runMigration, getMigrationState, verifyMigration, resetMigrationForTests } from './migrationEngine.js'
import { claimLegacyDataOwnership } from './legacyOwnership.js'

const ALICE = 'alice@example.com'
const BOB = 'bob@example.com'
const withAlice = { getAuthenticatedUserId: () => ALICE }
const withBob = { getAuthenticatedUserId: () => BOB }

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  await resetMigrationForTests()
  await Promise.all(db.tables.map((t) => t.clear()))
  db.close()
})

// Γεμίζει ΚΑΙ τους 16 legacy πίνακες με τουλάχιστον μία πραγματική, διασυνδεδεμένη γραμμή —
// χρησιμοποιείται από τα tests «καθαρού» migration/referential integrity ώστε να καλύπτεται
// ΟΛΟΚΛΗΡΟ το σχήμα, όχι μόνο μερικοί πίνακες.
async function seedAllTables() {
  const studentId = await db.students.add({ code: 'Μ1', active: true, functionalProfile: [], preferences: {} })
  const yearId = await db.schoolYears.add({ label: '2026-2027', startDate: '2026-09-01', endDate: '2027-06-30', isActive: true })
  const goalId = await db.goals.add({ studentId, domain: 'reading', title: 'Στόχος', status: 'active', priority: 'medium', startDate: '2026-01-01' })
  await db.domainTemplates.add({ domain: 'communication', suggestedMeasurementTypes: [], commonCriteria: [], baselineExamples: [], goalStarters: [] })
  const sessionId = await db.sessions.add({ date: '2026-01-05', studentIds: [studentId], status: 'completed', absentStudentIds: [] })
  const slotId = await db.scheduleSlots.add({ seriesId: null, dayOfWeek: 1, startTime: '09:00', durationMinutes: 30, type: 'individual', studentIds: [studentId], label: '', active: true, effectiveFrom: '2026-01-01', effectiveUntil: null })
  await db.scheduleSlots.update(slotId, { seriesId: slotId })

  await db.measurements.add({ sessionId, studentId, goalId, value: { successes: 3, attempts: 4 }, context: 'individual', note: '' })
  await db.observations.add({ studentId, sessionId, date: '2026-01-05', text: 'Παρατήρηση' })
  await db.reports.add({ studentId, generatedAt: '2026-01-10', type: 'progress', status: 'draft', content: {} })
  await db.dailyQueue.add({ date: '2026-01-05', studentIds: [studentId], order: 0, status: 'pending', scheduleSeriesId: slotId, plannedTime: '09:00', plannedDuration: 30 })
  await db.scheduleExceptions.add({ seriesId: slotId, originalDate: '2026-01-12', type: 'cancelled', newDate: null, reason: '' })
  await db.schoolYearParticipation.add({ studentId, schoolYearId: yearId, status: 'new', reason: '', recordedAt: '2026-01-01T00:00:00.000Z' })
  await db.goalEvents.add({ goalId, at: '2026-01-01T00:00:00.000Z', type: 'created', fromStatus: null, toStatus: 'active', note: '', trigger: 'manual' })
  await db.sessionGoalAssessments.add({ sessionId, studentId, goalId, rating: 'improved', note: '' })
  await db.goalTemplates.add({ domain: 'reading', title: 'Πρότυπο', criterion: 'x', measurementType: 'successRatio' })
  await db.calendarEvents.add({ date: '2026-03-17', title: 'Αργία', category: 'holiday' })
  // Smart Notifications — ΜΟΝΑΔΙΚΟΣ πίνακας με ΜΗ-αυτόματο (string, deterministic) legacy primary
  // key· επιβεβαιώνει ότι η γενική migration μηχανή δεν υποθέτει numeric ++id οπουδήποτε.
  await db.notificationState.add({ id: `goalStale:${goalId}:2026-01-01`, studentId, snoozedUntil: null, dismissedAt: null, schemaVersion: 1, updatedAt: '2026-01-01T00:00:00.000Z' })
  // Readiness blockers — userSettings: legacy primary key `key` (string, ΟΧΙ id), _v2 primary key
  // `id` (deterministic hash) — επιβεβαιώνει ότι η γενική migration μηχανή χειρίζεται σωστά έναν
  // πίνακα όπου το legacy ΚΑΙ το _v2 primary key ΔΙΑΦΕΡΟΥΝ ονομαστικά (ίδιο σκεπτικό με
  // domainTemplates/domain, βλ. db.js#userSettings_v2).
  await db.userSettings.add({ key: 'displayName', value: 'Δοκιμαστική Όλγα', updatedAt: '2026-01-01T00:00:00.000Z' })

  return { studentId, yearId, goalId, sessionId, slotId }
}

describe('runMigration — ιδιοκτησία τοπικών δεδομένων (Blocker 1)', () => {
  it('ΧΩΡΙΣ καμία διεκδίκηση ιδιοκτησίας ακόμα → migration ΑΡΝΕΙΤΑΙ να τρέξει (πετάει LEGACY_OWNER_UNCLAIMED), ΚΑΜΙΑ εγγραφή (safe blocked state, όχι αυτόματη απόδοση)', async () => {
    await seedAllTables()

    await expect(runMigration(withAlice)).rejects.toMatchObject({ code: 'LEGACY_OWNER_UNCLAIMED' })

    expect(await db.students_v2.count()).toBe(0)
    expect(await getMigrationState(ALICE)).toMatchObject({ status: 'not_started' })
  })

  it('User A αφήνει legacy δεδομένα, διεκδικεί ιδιοκτησία, το migration πετυχαίνει ΚΑΙ τα _v2 δεδομένα φέρουν το ΣΩΣΤΟ userId (Alice)', async () => {
    const { studentId } = await seedAllTables()
    await claimLegacyDataOwnership(ALICE, withAlice)

    const state = await runMigration(withAlice)

    expect(state.status).toBe('complete')
    const expectedId = await deterministicId(ALICE, 'students', studentId)
    expect(await db.students_v2.get(expectedId)).toBeTruthy()
  })

  it('User A διεκδικεί ΚΑΙ μεταφέρει· User B συνδέεται ΜΕΤΑ στην ΙΔΙΑ συσκευή και προσπαθεί migration → ΑΡΝΕΙΤΑΙ, τα δεδομένα του Alice ΔΕΝ ξαναγράφονται στο όνομα του Bob (η κρίσιμη περίπτωση του Blocker 1)', async () => {
    const { studentId } = await seedAllTables()
    await claimLegacyDataOwnership(ALICE, withAlice)
    await runMigration(withAlice)

    await expect(runMigration(withBob)).rejects.toMatchObject({ code: 'LEGACY_OWNER_MISMATCH' })

    // Bob ΔΕΝ απέκτησε ΚΑΝΕΝΑ δικό του _v2 state.
    expect(await getMigrationState(BOB)).toMatchObject({ status: 'not_started' })
    // Τα _v2 δεδομένα ΠΑΡΑΜΕΝΟΥΝ αποκλειστικά στο όνομα του Alice — ΚΑΝΕΝΑ νέο id με βάση το Bob.
    const aliceId = await deterministicId(ALICE, 'students', studentId)
    const bobId = await deterministicId(BOB, 'students', studentId)
    expect(await db.students_v2.get(aliceId)).toBeTruthy()
    expect(await db.students_v2.get(bobId)).toBeUndefined()
    expect(await db.students_v2.count()).toBe(1)
  })

  it('rejects.toThrow με code LEGACY_OWNER_MISMATCH όταν διαφορετικός χρήστης προσπαθεί migration', async () => {
    await seedAllTables()
    await claimLegacyDataOwnership(ALICE, withAlice)
    await expect(runMigration(withBob)).rejects.toMatchObject({ code: 'LEGACY_OWNER_MISMATCH' })
  })

  it('User B διεκδικεί ΠΡΩΤΟΣ σε καθαρή συσκευή (καμία προηγούμενη διεκδίκηση) → επιτρέπεται κανονικά, είναι νόμιμος πρώτος ιδιοκτήτης', async () => {
    const { studentId } = await seedAllTables()
    await claimLegacyDataOwnership(BOB, withBob)

    const state = await runMigration(withBob)

    expect(state.status).toBe('complete')
    const expectedId = await deterministicId(BOB, 'students', studentId)
    expect(await db.students_v2.get(expectedId)).toBeTruthy()
  })
})

describe('runMigration — καθαρό migration (χωρίς προηγούμενη κατάσταση, όλοι οι πίνακες)', () => {
  it('μεταφέρει και τους 18 πίνακες, σημειώνει complete, verification passed, appMeta persisted', async () => {
    const ids = await seedAllTables()
    await claimLegacyDataOwnership(ALICE, withAlice)

    const state = await runMigration(withAlice)

    expect(state.status).toBe('complete')
    expect(state.completedAt).toBeTruthy()
    expect(state.verification.status).toBe('passed')
    expect(state.verification.issues).toEqual([])

    for (const table of MIGRATED_TABLE_NAMES) {
      expect(state.tables[table].status).toBe('done')
      expect(state.tables[table].error).toBe(null)
    }

    const persisted = await getMigrationState(ALICE)
    expect(persisted.status).toBe('complete')

    const goalV2Id = await deterministicId(ALICE, 'goals', ids.goalId)
    const goalV2 = await db.goals_v2.get(goalV2Id)
    expect(goalV2.studentId).toBe(await deterministicId(ALICE, 'students', ids.studentId))
    expect(goalV2.title).toBe('Στόχος')
  })

  it('userSettings: το legacy row (primary key `key`) μεταφέρεται σε _v2 row με deterministic `id`, το πεδίο `key` παραμένει αναζητήσιμο ΑΝΕΠΑΦΟ', async () => {
    await seedAllTables()
    await claimLegacyDataOwnership(ALICE, withAlice)

    const state = await runMigration(withAlice)
    expect(state.status).toBe('complete')

    const expectedId = await deterministicId(ALICE, 'userSettings', 'displayName')
    const row = await db.userSettings_v2.get(expectedId)
    expect(row).toMatchObject({ id: expectedId, key: 'displayName', value: 'Δοκιμαστική Όλγα' })
  })

  it('κάθε _v2 πίνακας έχει ΑΚΡΙΒΩΣ τον ίδιο αριθμό γραμμών με τον legacy πίνακά του', async () => {
    await seedAllTables()
    await claimLegacyDataOwnership(ALICE, withAlice)
    await runMigration(withAlice)

    for (const table of MIGRATED_TABLE_NAMES) {
      const legacyCount = await db.table(table).count()
      const v2Count = await db.table(v2TableName(table)).count()
      expect(v2Count, `${table}: legacy=${legacyCount}, _v2=${v2Count}`).toBe(legacyCount)
    }
  })

  it('χωρίς authentication (καμία υπερίσχυση getAuthenticatedUserId) → πετάει σαφές σφάλμα, ΚΑΜΙΑ εγγραφή', async () => {
    await seedAllTables()
    await expect(runMigration()).rejects.toThrow(/cloud sync|συνδεδεμένο χρήστη/)
    expect(await db.students_v2.count()).toBe(0)
  })

  it('ένα ήδη ολοκληρωμένο migration επιστρέφει αμέσως (no-op) — δεν ξαναγράφει τίποτα', async () => {
    await seedAllTables()
    await claimLegacyDataOwnership(ALICE, withAlice)
    await runMigration(withAlice)

    const spy = vi.spyOn(db.table('students_v2'), 'bulkPut')
    const state = await runMigration(withAlice)

    expect(state.status).toBe('complete')
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('runMigration — διακοπή στη μέση (interrupted) και resume', () => {
  it('αποτυχία σε πίνακα ΣΤΑΜΑΤΑΕΙ το migration εκεί — προηγούμενοι πίνακες παραμένουν done, επόμενοι pending', async () => {
    await seedAllTables()
    await claimLegacyDataOwnership(ALICE, withAlice)

    const failingSpy = vi.spyOn(db.table('goals_v2'), 'bulkPut').mockRejectedValueOnce(new Error('Προσομοιωμένη διακοπή'))

    const state = await runMigration(withAlice)

    expect(state.status).toBe('failed')
    expect(state.tables.students.status).toBe('done')
    expect(state.tables.schoolYears.status).toBe('done')
    expect(state.tables.goals.status).toBe('failed')
    expect(state.tables.goals.error).toMatch(/Προσομοιωμένη διακοπή/)
    expect(state.tables.domainTemplates.status).toBe('pending')
    expect(state.tables.sessions.status).toBe('pending')
    expect(state.lastError.table).toBe('goals')

    expect(await db.goals_v2.count()).toBe(0)
    expect(await db.students_v2.count()).toBe(1)
    expect(await db.schoolYears_v2.count()).toBe(1)

    failingSpy.mockRestore()
  })

  it('resume μετά τη διόρθωση: συνεχίζει ΑΠΟ τον πίνακα που απέτυχε, ΔΕΝ ξαναγράφει τους ήδη done πίνακες', async () => {
    await seedAllTables()
    await claimLegacyDataOwnership(ALICE, withAlice)

    const failingSpy = vi.spyOn(db.table('goals_v2'), 'bulkPut').mockRejectedValueOnce(new Error('Προσομοιωμένη διακοπή'))
    const firstAttempt = await runMigration(withAlice)
    expect(firstAttempt.status).toBe('failed')
    failingSpy.mockRestore()

    const studentsSpy = vi.spyOn(db.table('students_v2'), 'bulkPut')
    const schoolYearsSpy = vi.spyOn(db.table('schoolYears_v2'), 'bulkPut')

    const resumed = await runMigration(withAlice)

    expect(resumed.status).toBe('complete')
    expect(studentsSpy).not.toHaveBeenCalled()
    expect(schoolYearsSpy).not.toHaveBeenCalled()
    expect(resumed.tables.goals.status).toBe('done')
    for (const table of MIGRATED_TABLE_NAMES) {
      expect(resumed.tables[table].status).toBe('done')
    }
  })

  it('πολλαπλές διαδοχικές διακοπές (προσομοίωση επανεκκίνησης εφαρμογής) εξακολουθούν να συγκλίνουν σε complete', async () => {
    await seedAllTables()
    await claimLegacyDataOwnership(ALICE, withAlice)

    vi.spyOn(db.table('sessions_v2'), 'bulkPut').mockRejectedValueOnce(new Error('crash 1'))
    const attempt1 = await runMigration(withAlice)
    expect(attempt1.status).toBe('failed')
    expect(attempt1.tables.sessions.status).toBe('failed')

    vi.spyOn(db.table('scheduleSlots_v2'), 'bulkPut').mockRejectedValueOnce(new Error('crash 2'))
    const attempt2 = await runMigration(withAlice)
    expect(attempt2.status).toBe('failed')
    expect(attempt2.tables.sessions.status).toBe('done')
    expect(attempt2.tables.scheduleSlots.status).toBe('failed')

    const attempt3 = await runMigration(withAlice)
    expect(attempt3.status).toBe('complete')
  })
})

describe('verifyMigration — αναφορική ακεραιότητα (Blocker 2 — αυστηρή εξ ορισμού)', () => {
  it('κάθε foreign key σε _v2 γραμμή δείχνει σε ΥΠΑΡΚΤΗ γραμμή του πίνακα-στόχου', async () => {
    await seedAllTables()
    await claimLegacyDataOwnership(ALICE, withAlice)
    await runMigration(withAlice)

    const verification = await verifyMigration(ALICE)
    expect(verification.status).toBe('passed')
    expect(verification.issues).toEqual([])
  })

  it('ΜΗ ταξινομημένο (unclassified) κρεμασμένο μη-null foreign key ΜΠΛΟΚΑΡΕΙ το migration — ΔΕΝ γίνεται complete', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    const sessionId = await db.sessions.add({ date: '2026-01-01', studentIds: [studentId], status: 'completed' })
    // goalId δείχνει σε στόχο που ΔΕΝ υπάρχει καθόλου — ΚΑΜΙΑ τεκμηρίωση/allowlist γι' αυτό.
    await db.measurements.add({ sessionId, studentId, goalId: 999999, value: { successes: 1, attempts: 1 }, context: 'individual', note: '' })
    await claimLegacyDataOwnership(ALICE, withAlice)

    const state = await runMigration(withAlice)

    expect(state.status).toBe('failed')
    expect(state.verification.status).toBe('failed')
    const orphan = state.verification.issues.find((i) => i.type === 'orphaned_foreign_key' && i.table === 'measurements')
    expect(orphan).toBeTruthy()
    expect(orphan.targetTable).toBe('goals')
    expect(orphan.field).toBe('goalId')
    expect(orphan.sourceRowId).toBeTruthy()
    expect(orphan.reason).toBe(null)

    // Ανάκτηση (recovery): οι δύο εμπλεκόμενοι πίνακες (measurements — η γραμμή με το πρόβλημα, goals
    // — ο στόχος-αναφοράς) επαναφέρθηκαν σε 'pending' ώστε το επόμενο runMigration() να τους
    // ξαναπροσπαθήσει· οι υπόλοιποι 14 πίνακες ΠΑΡΑΜΕΝΟΥΝ 'done', ΔΕΝ επηρεάστηκαν.
    expect(state.tables.measurements.status).toBe('pending')
    expect(state.tables.goals.status).toBe('pending')
    expect(state.tables.students.status).toBe('done')
    expect(state.tables.sessions.status).toBe('done')
  })

  it('ΑΝΑΚΤΗΣΗ: verification αποτυγχάνει λόγω ορφανού FK, η legacy σχέση διορθώνεται, rerun ξαναγράφει τη σωστή _v2 γραμμή και φτάνει σε complete', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    const sessionId = await db.sessions.add({ date: '2026-01-01', studentIds: [studentId], status: 'completed' })
    const measurementId = await db.measurements.add({ sessionId, studentId, goalId: 999999, value: { successes: 1, attempts: 1 }, context: 'individual', note: '' })
    await claimLegacyDataOwnership(ALICE, withAlice)

    const firstAttempt = await runMigration(withAlice)
    expect(firstAttempt.status).toBe('failed')
    expect(firstAttempt.tables.measurements.status).toBe('pending')
    expect(firstAttempt.tables.goals.status).toBe('pending')

    // Επιδιόρθωση της legacy σχέσης — δημιουργείται ο στόχος που έλειπε, με ΤΟ ΙΔΙΟ id που ήδη
    // ανέμενε η μέτρηση (ρεαλιστικό σενάριο διόρθωσης: το δεδομένο-στόχος ανακτήθηκε/ξαναδημιουργήθηκε).
    await db.goals.add({ id: 999999, studentId, domain: 'reading', title: 'Ανακτημένος στόχος', status: 'active', priority: 'medium', startDate: '2026-01-01' })

    const resumed = await runMigration(withAlice)

    expect(resumed.status).toBe('complete')
    expect(resumed.verification.status).toBe('passed')

    const measurementV2Id = await deterministicId(ALICE, 'measurements', measurementId)
    const goalV2Id = await deterministicId(ALICE, 'goals', 999999)
    const measurementV2 = await db.measurements_v2.get(measurementV2Id)
    expect(measurementV2.goalId).toBe(goalV2Id)
    expect(await db.goals_v2.get(goalV2Id)).toMatchObject({ title: 'Ανακτημένος στόχος' })

    // Καμία μεταβολή στα ίδια τα legacy δεδομένα από το migration/verification — μόνο ανάγνωση.
    expect(await db.measurements.get(measurementId)).toMatchObject({ goalId: 999999 })
  })

  it('missing_v2_row (πραγματική απώλεια γραμμής) ΜΠΛΟΚΑΡΕΙ — δοκιμάζεται απευθείας η verifyMigration', async () => {
    await seedAllTables()
    await claimLegacyDataOwnership(ALICE, withAlice)
    await runMigration(withAlice)

    await db.students_v2.clear()

    const verification = await verifyMigration(ALICE)
    expect(verification.status).toBe('failed')
    const issue = verification.issues.find((i) => i.type === 'missing_v2_row' && i.table === 'students')
    expect(issue).toBeTruthy()
  })

  it('ρητά επιτρεπτή σχέση (μέσω ενέσιμης allowlist) — ταξινομείται ως tolerated, ΔΕΝ μπλοκάρει, καταγράφει table/field/sourceRowId/reason', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    const sessionId = await db.sessions.add({ date: '2026-01-01', studentIds: [studentId], status: 'completed' })
    await db.measurements.add({ sessionId, studentId, goalId: 999999, value: { successes: 1, attempts: 1 }, context: 'individual', note: '' })
    await claimLegacyDataOwnership(ALICE, withAlice)

    // ΔΕΝ αγγίζουμε το πραγματικό orphanAllowlist.js (παραμένει άδειο) — δοκιμάζουμε τον μηχανισμό
    // μέσω injection, ίδιο idiom με το getAuthenticatedUserId.
    const testAllowlist = [{ table: 'measurements', field: 'goalId', reason: 'δοκιμαστική, τεκμηριωμένη εξαίρεση' }]

    // Τρέχουμε το πλήρες migration (θα αποτύχει στο verification με την ΚΑΝΟΝΙΚΗ, άδεια allowlist —
    // τα table migrations ΟΛΟΚΛΗΡΩΝΟΝΤΑΙ κανονικά, μόνο η verification αποτυγχάνει, άρα τα _v2
    // δεδομένα ΥΠΑΡΧΟΥΝ ήδη για τον επόμενο, ξεχωριστό verifyMigration έλεγχο παρακάτω)...
    const state = await runMigration(withAlice)
    expect(state.status).toBe('failed')

    // ...αλλά η ΙΔΙΑ verification, με την ενέσιμη allowlist, το ταξινομεί ως tolerated.
    const verification = await verifyMigration(ALICE, { allowlist: testAllowlist })
    expect(verification.status).toBe('passed')
    const tolerated = verification.issues.find((i) => i.type === 'tolerated_orphan_foreign_key')
    expect(tolerated).toBeTruthy()
    expect(tolerated.table).toBe('measurements')
    expect(tolerated.targetTable).toBe('goals')
    expect(tolerated.field).toBe('goalId')
    expect(tolerated.sourceRowId).toBeTruthy()
    expect(tolerated.reason).toBe('δοκιμαστική, τεκμηριωμένη εξαίρεση')
  })

  it('null/undefined foreign key values ΔΕΝ παράγουν ΚΑΝΕΝΑ issue (ήδη επιτρεπτό από το ίδιο το σχήμα, βλ. observations.sessionId)', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    await db.observations.add({ studentId, sessionId: null, date: '2026-01-01', text: 'x' })
    await claimLegacyDataOwnership(ALICE, withAlice)

    const state = await runMigration(withAlice)

    expect(state.status).toBe('complete')
    expect(state.verification.issues).toEqual([])
  })
})

describe('getMigrationState', () => {
  it('χωρίς κανένα προηγούμενο migration → φρέσκο state, όλοι οι πίνακες pending', async () => {
    const state = await getMigrationState(ALICE)
    expect(state.status).toBe('not_started')
    expect(state.userId).toBe(ALICE)
    for (const table of MIGRATED_TABLE_NAMES) {
      expect(state.tables[table].status).toBe('pending')
    }
  })

  it('state ενός ΔΙΑΦΟΡΕΤΙΚΟΥ userId ΔΕΝ επαναχρησιμοποιείται — επιστρέφει φρέσκο state για τον νέο χρήστη', async () => {
    await seedAllTables()
    await claimLegacyDataOwnership(ALICE, withAlice)
    await runMigration(withAlice)

    const otherUserState = await getMigrationState(BOB)
    expect(otherUserState.status).toBe('not_started')
    expect(otherUserState.userId).toBe(BOB)

    const aliceState = await getMigrationState(ALICE)
    expect(aliceState.status).toBe('complete')
  })
})
