import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import db from '../db.js'
import {
  captureFullDeviceSnapshot, restoreFullDeviceSnapshot,
  persistPendingSnapshot, readPendingSnapshot, clearPendingSnapshot
} from './deviceSnapshot.js'
import { MIGRATED_TABLE_NAMES, v2TableName } from './migratedTableNames.js'

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  db.close()
})

describe('captureFullDeviceSnapshot / restoreFullDeviceSnapshot', () => {
  it('περιέχει και τις δύο γενιές (16 legacy + 16 _v2) ΚΑΙ όλες τις γραμμές appMeta', async () => {
    await db.students.add({ id: 1, code: 'Μ1', active: true, functionalProfile: [], preferences: {} })
    await db.table('students_v2').add({ id: 'stu-1', code: 'Μ2', active: true, functionalProfile: [], preferences: {} })
    await db.appMeta.put({ key: 'legacyDataOwner', value: { userId: 'alice@example.com', claimedAt: 'now' } })
    await db.appMeta.put({ key: 'lastBackupAt', value: '2026-01-01T00:00:00.000Z' })

    const snapshot = await captureFullDeviceSnapshot()

    expect(snapshot.data.students).toEqual([{ id: 1, code: 'Μ1', active: true, functionalProfile: [], preferences: {} }])
    expect(snapshot.data.students_v2).toEqual([{ id: 'stu-1', code: 'Μ2', active: true, functionalProfile: [], preferences: {} }])
    for (const table of MIGRATED_TABLE_NAMES) {
      expect(Array.isArray(snapshot.data[table])).toBe(true)
      expect(Array.isArray(snapshot.data[v2TableName(table)])).toBe(true)
    }
    const keys = snapshot.appMetaRows.map((r) => r.key).sort()
    expect(keys).toEqual(['lastBackupAt', 'legacyDataOwner'])
  })

  it('η επαναφορά αναδημιουργεί ΑΚΡΙΒΩΣ ό,τι καταγράφηκε, διατηρώντας τα id', async () => {
    await db.students.add({ id: 1, code: 'Μ1', active: true, functionalProfile: [], preferences: {} })
    await db.table('goals_v2').add({ id: 'g-1', studentId: 'stu-1', domain: 'reading', title: 'Στόχος', status: 'active', priority: 'medium' })
    await db.appMeta.put({ key: 'legacyDataOwner', value: { userId: 'alice@example.com', claimedAt: 'now' } })

    const snapshot = await captureFullDeviceSnapshot()

    // Προσομοιώνει την καταστροφική πλευρική ενέργεια του db.cloud.logout() — καθαρίζει τα πάντα.
    await Promise.all(db.tables.map((t) => t.clear()))
    expect(await db.students.count()).toBe(0)
    expect(await db.appMeta.count()).toBe(0)

    await restoreFullDeviceSnapshot(snapshot)

    expect(await db.students.get(1)).toMatchObject({ code: 'Μ1' })
    expect(await db.table('goals_v2').get('g-1')).toMatchObject({ title: 'Στόχος' })
    expect(await db.appMeta.get('legacyDataOwner')).toMatchObject({ value: { userId: 'alice@example.com' } })
  })

  it('idempotent: επαναφορά πάνω σε ήδη-γεμάτους πίνακες αντικαθιστά πλήρως (clear πριν το bulkPut)', async () => {
    await db.students.add({ id: 1, code: 'ΠΡΩΤΟΤΥΠΟ', active: true, functionalProfile: [], preferences: {} })
    const snapshot = await captureFullDeviceSnapshot()

    await db.students.clear()
    await db.students.add({ id: 2, code: 'ΞΕΝΗ-ΓΡΑΜΜΗ', active: true, functionalProfile: [], preferences: {} })

    await restoreFullDeviceSnapshot(snapshot)

    expect(await db.students.get(1)).toMatchObject({ code: 'ΠΡΩΤΟΤΥΠΟ' })
    expect(await db.students.get(2)).toBeUndefined()
  })

  it('κενό στιγμιότυπο (καμία γραμμή πουθενά) επαναφέρεται χωρίς σφάλμα', async () => {
    const snapshot = await captureFullDeviceSnapshot()
    await expect(restoreFullDeviceSnapshot(snapshot)).resolves.not.toThrow()
    expect(await db.students.count()).toBe(0)
    expect(await db.appMeta.count()).toBe(0)
  })
})

describe('persistPendingSnapshot / readPendingSnapshot / clearPendingSnapshot', () => {
  it('τίποτα αποθηκευμένο → null', async () => {
    expect(await readPendingSnapshot()).toBeNull()
  })

  it('γράφει και διαβάζει ένα στιγμιότυπο', async () => {
    const snapshot = await captureFullDeviceSnapshot()
    await persistPendingSnapshot(snapshot)
    expect(await readPendingSnapshot()).toEqual(snapshot)
  })

  it('clear αφαιρεί το αποθηκευμένο στιγμιότυπο', async () => {
    const snapshot = await captureFullDeviceSnapshot()
    await persistPendingSnapshot(snapshot)
    await clearPendingSnapshot()
    expect(await readPendingSnapshot()).toBeNull()
  })

  it('ζει σε ΞΕΧΩΡΙΣΤΗ IndexedDB βάση από το κύριο "workspace" — καθαρισμός ΟΛΩΝ των db.tables ΔΕΝ το αγγίζει', async () => {
    const snapshot = await captureFullDeviceSnapshot()
    await persistPendingSnapshot(snapshot)
    await Promise.all(db.tables.map((t) => t.clear())) // ακριβώς ό,τι κάνει το db.cloud.logout()
    expect(await readPendingSnapshot()).toEqual(snapshot)
  })
})

// Review, 2η αναθεώρηση — απαιτήθηκε ΜΕΤΡΗΣΗ, όχι εκτίμηση, του χειρότερου ρεαλιστικού μεγέθους
// ενός στιγμιότυπου. Το χειρότερο ρεαλιστικό σενάριο για ΑΥΤΟ το στιγμιότυπο συγκεκριμένα (σε
// αντίθεση με το generation-aware utils/backup.js backup, που εξάγει ΜΟΝΟ μία γενιά) είναι ένας
// βετεράνος εκπαιδευτικός με ΠΟΛΛΑ χρόνια ιστορικού που έχει ήδη μεταβεί σε v2 αλλά τα legacy
// δεδομένα ΔΕΝ έχουν ποτέ διαγραφεί (Commit 5/6 requirement: «Do not delete either generation») —
// άρα ΚΑΙ οι δύο γενιές γεμάτες ταυτόχρονα, όχι μόνο η μία.
//
// Η ΠΡΩΤΗ μέτρηση (πριν αυτή την αναθεώρηση) έδειξε ~36MB για 42.080 γραμμές — 7x πάνω από το
// τυπικό όριο localStorage (~5MB/origin). Αυτό ΔΕΝ ήταν αποδεκτό περιθώριο ασφαλείας — το
// στιγμιότυπο μετακινήθηκε σε ξεχωριστή IndexedDB βάση (βλ. deviceSnapshot.js#persistPendingSnapshot,
// auth/signOut.js). Το test παρακάτω επιβεβαιώνει ΤΩΡΑ ότι το ΙΔΙΟ μέγεθος αποθηκεύεται επιτυχώς
// ΣΤΗΝ ΠΡΑΞΗ μέσω persistPendingSnapshot/readPendingSnapshot (πάνω σε fake-indexeddb) — όχι απλά
// έναν αριθμό byte κάτω από ένα καρφωμένο όριο.
describe('Μέτρηση μεγέθους — ρεαλιστικό μεγάλο dataset βετεράνου εκπαιδευτικού (ΚΑΙ οι δύο γενιές γεμάτες)', () => {
  // Αριθμοί γενναιόδωροι σκόπιμα (πάνω από τυπικό caseload) — 150 μαθητές, 12 σχολικά έτη
  // ιστορικού, χιλιάδες συνεδρίες/μετρήσεις. Ελεύθερο κείμενο 150-300 χαρακτήρων ανά πεδίο
  // σημειώσεων/κριτηρίου, ώστε να ΜΗΝ υποεκτιμηθεί το μέγεθος.
  const STUDENTS = 150
  const YEARS = 12
  const GOALS = 600
  const SESSIONS = 2500
  const MEASUREMENTS = 8000
  const OBSERVATIONS = 1200
  const REPORTS = 400
  const GOAL_EVENTS = 1800
  const SESSION_GOAL_ASSESSMENTS = 5000
  const SCHOOL_YEAR_PARTICIPATION = 450
  const DAILY_QUEUE = 500
  const CALENDAR_EVENTS = 200
  const SCHEDULE_SLOTS = 40
  const SCHEDULE_EXCEPTIONS = 150
  const GOAL_TEMPLATES = 30

  const LOREM = 'Ο μαθητής έδειξε σταθερή πρόοδο στη σημερινή συνεδρία, με μικρές διακυμάνσεις ' +
    'στη συγκέντρωση κατά τα τελευταία δέκα λεπτά. Χρειάστηκε οπτική υπενθύμιση δύο φορές αλλά ' +
    'ανταποκρίθηκε θετικά σε λεκτική ενίσχυση. Προτείνεται συνέχιση του ίδιου προγράμματος με ' +
    'σταδιακή αύξηση δυσκολίας την επόμενη εβδομάδα.'

  // bulkAdd/bulkPut αντί για χιλιάδες μεμονωμένες .add() κλήσεις — καθαρά για ταχύτητα αυτού του
  // test πάνω σε fake-indexeddb (~40.000 γραμμές συνολικά· οι μεμονωμένες .add() timeout-άρισαν).
  async function seedGeneration({ v2 }) {
    const t = (name) => (v2 ? db.table(`${name}_v2`) : db.table(name))
    const newId = (prefix) => `${prefix}-${crypto.randomUUID()}`
    const withId = (fields, prefix) => (v2 ? { ...fields, id: newId(prefix) } : fields)

    const studentRows = Array.from({ length: STUDENTS }, (_, i) => withId({
      code: `Μ${i}`,
      active: i % 5 !== 0,
      functionalProfile: Array.from({ length: 8 }, (_, d) => ({
        domain: `Τομέας ${d}`, checkedOptions: ['Επιλογή Α', 'Επιλογή Β'], notes: LOREM
      })),
      preferences: {
        likes: ['Παζλ', 'Μουσική'], dislikes: ['Δυνατός θόρυβος'], reinforcers: ['Αυτοκόλλητα'],
        favoriteActivities: ['Ζωγραφική'], triggers: ['Αλλαγή ρουτίνας'], calmingThings: ['Ήσυχη γωνιά']
      }
    }, 'stu'))
    const studentIds = v2 ? studentRows.map((r) => r.id) : await t('students').bulkAdd(studentRows, { allKeys: true })
    if (v2) await t('students').bulkAdd(studentRows)

    const yearRows = Array.from({ length: YEARS }, (_, i) => withId({
      label: `${2013 + i}-${2014 + i}`, startDate: `${2013 + i}-09-01`, endDate: `${2014 + i}-06-30`, isActive: i === YEARS - 1
    }, 'yr'))
    const yearIds = v2 ? yearRows.map((r) => r.id) : await t('schoolYears').bulkAdd(yearRows, { allKeys: true })
    if (v2) await t('schoolYears').bulkAdd(yearRows)

    // Μοναδικός συνδυασμός (studentId, schoolYearId) ανά γραμμή — ταιριάζει με το πραγματικό
    // &[studentId+schoolYearId] unique index (βλ. db.js schema), αλλιώς bulkAdd πετάει ConstraintError.
    await t('schoolYearParticipation').bulkAdd(Array.from({ length: SCHOOL_YEAR_PARTICIPATION }, (_, i) => withId({
      studentId: studentIds[i % STUDENTS], schoolYearId: yearIds[Math.floor(i / STUDENTS) % YEARS], status: 'active', reason: '', recordedAt: '2020-09-01T00:00:00.000Z'
    }, 'part')))

    await t('domainTemplates').bulkAdd(Array.from({ length: 8 }, (_, d) => withId({
      domain: `domain-${d}`, suggestedMeasurementTypes: ['successRatio'], commonCriteria: [LOREM],
      baselineExamples: [LOREM], goalStarters: [LOREM, LOREM]
    }, 'dt')))

    await t('goalTemplates').bulkAdd(Array.from({ length: GOAL_TEMPLATES }, (_, i) => withId({
      domain: `domain-${i % 8}`, title: `Πρότυπο στόχου ${i}`, description: LOREM
    }, 'gt')))

    const goalRows = Array.from({ length: GOALS }, (_, i) => withId({
      studentId: studentIds[i % STUDENTS], domain: `domain-${i % 8}`, title: `Στόχος ${i}`, status: 'active',
      priority: 'medium', startDate: '2023-09-01', measurementType: 'successRatio',
      criterionConfig: { attempts: 10, successesNeeded: 8 }, criterion: '8/10 επιτυχίες', criterionNote: LOREM
    }, 'goal'))
    const goalIds = v2 ? goalRows.map((r) => r.id) : await t('goals').bulkAdd(goalRows, { allKeys: true })
    if (v2) await t('goals').bulkAdd(goalRows)

    const sessionRows = Array.from({ length: SESSIONS }, (_, i) => withId({
      date: '2024-01-15', studentIds: [studentIds[i % STUDENTS], studentIds[(i + 1) % STUDENTS]],
      status: 'completed', absentStudentIds: [], notes: LOREM
    }, 'sess'))
    const sessionIds = v2 ? sessionRows.map((r) => r.id) : await t('sessions').bulkAdd(sessionRows, { allKeys: true })
    if (v2) await t('sessions').bulkAdd(sessionRows)

    await t('measurements').bulkAdd(Array.from({ length: MEASUREMENTS }, (_, i) => withId({
      sessionId: sessionIds[i % SESSIONS], studentId: studentIds[i % STUDENTS], goalId: goalIds[i % GOALS],
      value: { successes: 7, attempts: 10 }, context: 'individual', note: LOREM
    }, 'meas')))

    await t('observations').bulkAdd(Array.from({ length: OBSERVATIONS }, (_, i) => withId({
      studentId: studentIds[i % STUDENTS], date: '2024-02-01', text: LOREM
    }, 'obs')))

    await t('reports').bulkAdd(Array.from({ length: REPORTS }, (_, i) => withId({
      studentId: studentIds[i % STUDENTS], generatedAt: '2024-06-01T00:00:00.000Z', type: 'progress', status: 'final',
      content: LOREM + LOREM + LOREM
    }, 'rep')))

    await t('goalEvents').bulkAdd(Array.from({ length: GOAL_EVENTS }, (_, i) => withId({
      goalId: goalIds[i % GOALS], at: '2024-01-01T00:00:00.000Z', type: 'statusChanged', fromStatus: 'active',
      toStatus: 'active', note: LOREM, trigger: 'manual'
    }, 'ge')))

    // Μοναδικός συνδυασμός (sessionId, goalId) ανά γραμμή — ίδιο σκεπτικό με το
    // schoolYearParticipation παραπάνω (&[sessionId+goalId] unique index).
    await t('sessionGoalAssessments').bulkAdd(Array.from({ length: SESSION_GOAL_ASSESSMENTS }, (_, i) => withId({
      sessionId: sessionIds[i % SESSIONS], studentId: studentIds[i % STUDENTS], goalId: goalIds[Math.floor(i / SESSIONS) % GOALS],
      criterionConfig: { attempts: 10, successesNeeded: 8 }, value: { successes: 6, attempts: 10 }
    }, 'sga')))

    await t('dailyQueue').bulkAdd(Array.from({ length: DAILY_QUEUE }, (_, i) => withId({
      date: '2024-03-01', studentIds: [studentIds[i % STUDENTS]], scheduleSeriesId: null
    }, 'dq')))

    await t('calendarEvents').bulkAdd(Array.from({ length: CALENDAR_EVENTS }, (_, i) => withId({
      date: '2024-04-01', title: `Γεγονός ${i}`, notes: LOREM
    }, 'ce')))

    await t('scheduleSlots').bulkAdd(Array.from({ length: SCHEDULE_SLOTS }, (_, i) => withId({
      seriesId: `series-${i}`, dayOfWeek: i % 5, startTime: '09:00', endTime: '09:30', studentIds: [studentIds[i % STUDENTS]]
    }, 'ss')))

    await t('scheduleExceptions').bulkAdd(Array.from({ length: SCHEDULE_EXCEPTIONS }, (_, i) => withId({
      seriesId: `series-${i % SCHEDULE_SLOTS}`, originalDate: '2024-05-01', type: 'cancelled', note: LOREM
    }, 'sex')))
  }

  it('ρεαλιστικό μέγεθος (μετρημένο, όχι εκτιμημένο) αποθηκεύεται ΚΑΙ ανακτάται επιτυχώς μέσω persistPendingSnapshot/readPendingSnapshot', async () => {
    await seedGeneration({ v2: false })
    await seedGeneration({ v2: true })
    await db.appMeta.put({ key: 'legacyDataOwner', value: { userId: 'βετεράνος-εκπαιδευτικός@example.com', claimedAt: '2024-01-01T00:00:00.000Z' } })
    await db.appMeta.put({ key: 'phase2MigrationState', value: { version: 1, userId: 'x', status: 'complete', tables: {} } })

    const snapshot = await captureFullDeviceSnapshot()
    const serialized = JSON.stringify(snapshot)
    const utf16Bytes = serialized.length * 2 // χαρακτήρες σε UTF-16 code units, 2 bytes/μονάδα
    const totalRows = Object.values(snapshot.data).reduce((sum, rows) => sum + rows.length, 0)

    // eslint-disable-next-line no-console
    console.log(
      `[deviceSnapshot size] rows=${totalRows} chars=${serialized.length} ` +
      `utf16Bytes=${utf16Bytes} (${(utf16Bytes / 1024 / 1024).toFixed(2)} MB)`
    )

    // Ενδεικτικό, όχι το ίδιο το κριτήριο αποδοχής πλέον: τεκμηριώνει ΓΙΑΤΙ localStorage (~5MB
    // τυπικό όριο) ΔΕΝ θα αρκούσε — το πραγματικό μέγεθος είναι πολλαπλάσιο αυτού.
    expect(utf16Bytes).toBeGreaterThan(5 * 1024 * 1024)

    // Το ΠΡΑΓΜΑΤΙΚΟ κριτήριο αποδοχής: το ΑΚΡΙΒΩΣ ίδιο στιγμιότυπο αποθηκεύεται ΚΑΙ διαβάζεται πίσω
    // επιτυχώς μέσω του μηχανισμού που όντως χρησιμοποιεί το auth/signOut.js (ξεχωριστή IndexedDB
    // βάση, πάνω σε fake-indexeddb εδώ) — όχι απλά ένας αριθμός byte κάτω από ένα καρφωμένο όριο.
    await persistPendingSnapshot(snapshot)
    const readBack = await readPendingSnapshot()
    expect(readBack.data.students.length).toBe(snapshot.data.students.length)
    expect(Object.values(readBack.data).reduce((sum, rows) => sum + rows.length, 0)).toBe(totalRows)
    await clearPendingSnapshot()
    expect(await readPendingSnapshot()).toBeNull()
  }, 30000)
})
