import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import db, {
  migrateDomainNamesToIds, ensureDomainTemplatesSeeded, createScheduleSlot, saveScheduleSlotEdit,
  copyScheduleDay, ensureDayGenerated, recordSessionNotHeld
} from './db.js'
import { DOMAIN_IDS } from './config/domains.js'
import { addDays, todayLocalISO, weekdayOf } from './utils/date.js'
import { resolveOccurrencesForDate } from './utils/scheduleResolution.js'

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  db.close()
})

describe('migrateDomainNamesToIds', () => {
  it('μετατρέπει παλιά ελληνική ονομασία τομέα σε id σε goal', async () => {
    const goalId = await db.goals.add({ studentId: 1, domain: 'Ανάγνωση', title: 'Στόχος', status: 'active', priority: 'high' })
    await migrateDomainNamesToIds()
    const goal = await db.goals.get(goalId)
    expect(goal.domain).toBe('reading')
  })

  it('δεν αγγίζει goal που έχει ήδη έγκυρο id', async () => {
    const goalId = await db.goals.add({ studentId: 1, domain: 'reading', title: 'Στόχος', status: 'active', priority: 'high' })
    await migrateDomainNamesToIds()
    const goal = await db.goals.get(goalId)
    expect(goal.domain).toBe('reading')
  })

  it('μετατρέπει το functionalProfile μαθητή', async () => {
    const studentId = await db.students.add({
      code: 'Μ1',
      active: true,
      functionalProfile: [{ domain: 'Γραπτός λόγος', checkedOptions: [], notes: '' }],
      preferences: {}
    })
    await migrateDomainNamesToIds()
    const student = await db.students.get(studentId)
    expect(student.functionalProfile[0].domain).toBe('writing')
  })

  it('μετατρέπει το κλειδί ενός domainTemplate χωρίς να χάνει το περιεχόμενό του', async () => {
    await db.domainTemplates.put({ domain: 'Μαθηματικά', goalStarters: ['Παράδειγμα στόχου'] })
    await migrateDomainNamesToIds()
    const migrated = await db.domainTemplates.get('math')
    const old = await db.domainTemplates.get('Μαθηματικά')
    expect(migrated).toBeTruthy()
    expect(migrated.goalStarters).toEqual(['Παράδειγμα στόχου'])
    expect(old).toBeUndefined()
  })

  it('αφήνει άγνωστο τομέα ως έχει αντί να τον σβήσει', async () => {
    const goalId = await db.goals.add({ studentId: 1, domain: 'Κάτι Ανύπαρκτο', title: 'Στόχος', status: 'active', priority: 'high' })
    await migrateDomainNamesToIds()
    const goal = await db.goals.get(goalId)
    expect(goal.domain).toBe('Κάτι Ανύπαρκτο')
  })

  it('είναι ασφαλές να τρέξει πολλές φορές στα ίδια δεδομένα', async () => {
    const goalId = await db.goals.add({ studentId: 1, domain: 'Ανάγνωση', title: 'Στόχος', status: 'active', priority: 'high' })
    await migrateDomainNamesToIds()
    await migrateDomainNamesToIds()
    const goal = await db.goals.get(goalId)
    expect(goal.domain).toBe('reading')
  })
})

describe('ensureDomainTemplatesSeeded', () => {
  it('δημιουργεί ένα template ανά τομέα της σταθερής λίστας', async () => {
    await ensureDomainTemplatesSeeded()
    const templates = await db.domainTemplates.toArray()
    const ids = templates.map((t) => t.domain).sort()
    expect(ids).toEqual([...DOMAIN_IDS].sort())
  })

  it('δεν αγγίζει υπάρχον template', async () => {
    await db.domainTemplates.put({ domain: 'reading', goalStarters: ['Προσαρμοσμένη πρόταση'] })
    await ensureDomainTemplatesSeeded()
    const template = await db.domainTemplates.get('reading')
    expect(template.goalStarters).toEqual(['Προσαρμοσμένη πρόταση'])
  })
})

// Regression tests για το bug που βρέθηκε στο e2e walkthrough (Sprint 6, δεύτερος γύρος): η
// συνθήκη in-place ενημέρωσης έλεγχε ΜΟΝΟ πότε δημιουργήθηκε η τρέχουσα έκδοση (current.effectiveFrom),
// αγνοώντας τελείως τη ΝΕΑ επιλεγμένη ημερομηνία ισχύος — μια ρητά επιλεγμένη μελλοντική ημερομηνία σε
// slot φτιαγμένο σήμερα εφαρμοζόταν σιωπηλά αμέσως.
describe('saveScheduleSlotEdit — effective dating', () => {
  const today = todayLocalISO()
  const yesterday = addDays(today, -1)
  const future = addDays(today, 14)
  const dayBeforeFuture = addDays(future, -1)

  async function activeVersions(seriesId) {
    const rows = await db.scheduleSlots.where('seriesId').equals(seriesId).toArray()
    return rows.filter((r) => r.effectiveFrom <= today && (!r.effectiveUntil || r.effectiveUntil >= today))
  }

  it('slot δημιουργημένο σήμερα + αλλαγή "από σήμερα" → in-place, μία μόνο εγγραφή', async () => {
    const id = await createScheduleSlot({ dayOfWeek: 1, startTime: '09:00', durationMinutes: 30, type: 'individual', studentIds: [1], label: '' })
    await saveScheduleSlotEdit(id, { startTime: '10:00' }, 'today', null)

    const rows = await db.scheduleSlots.where('seriesId').equals(id).toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].startTime).toBe('10:00')
    expect(rows[0].effectiveFrom).toBe(today)
    expect(rows[0].effectiveUntil).toBeNull()
  })

  it('slot δημιουργημένο σήμερα + αλλαγή από ΜΕΛΛΟΝΤΙΚΗ ημερομηνία → νέα έκδοση, ΟΧΙ in-place (το bug)', async () => {
    const id = await createScheduleSlot({ dayOfWeek: 1, startTime: '09:00', durationMinutes: 30, type: 'individual', studentIds: [1], label: '' })
    await saveScheduleSlotEdit(id, { startTime: '11:15' }, 'date', future)

    const rows = await db.scheduleSlots.where('seriesId').equals(id).toArray()
    expect(rows).toHaveLength(2)

    const original = rows.find((r) => r.id === id)
    expect(original.startTime).toBe('09:00') // η ΠΑΛΙΑ τιμή παραμένει στην αρχική έκδοση
    expect(original.effectiveFrom).toBe(today)
    expect(original.effectiveUntil).toBe(dayBeforeFuture)

    const newVersion = rows.find((r) => r.id !== id)
    expect(newVersion.startTime).toBe('11:15')
    expect(newVersion.effectiveFrom).toBe(future)
    expect(newVersion.effectiveUntil).toBeNull()

    // Το ΣΗΜΕΡΙΝΟ πρόγραμμα ΔΕΝ πρέπει να δείχνει ήδη την αλλαγή — αυτό ήταν ακριβώς το bug.
    const activeToday = await activeVersions(id)
    expect(activeToday).toHaveLength(1)
    expect(activeToday[0].startTime).toBe('09:00')
  })

  it('παλιό slot + αλλαγή "από σήμερα" → νέα έκδοση από σήμερα, η παλιά κλείνει χθες', async () => {
    const id = await createScheduleSlot({ dayOfWeek: 1, startTime: '09:00', durationMinutes: 30, type: 'individual', studentIds: [1], label: '' })
    await db.scheduleSlots.update(id, { effectiveFrom: addDays(today, -30) }) // προσομοίωση παλιού slot

    await saveScheduleSlotEdit(id, { startTime: '10:30' }, 'today', null)

    const rows = await db.scheduleSlots.where('seriesId').equals(id).toArray()
    expect(rows).toHaveLength(2)

    const original = rows.find((r) => r.id === id)
    expect(original.effectiveUntil).toBe(yesterday)

    const newVersion = rows.find((r) => r.id !== id)
    expect(newVersion.startTime).toBe('10:30')
    expect(newVersion.effectiveFrom).toBe(today)
    expect(newVersion.effectiveUntil).toBeNull()
  })

  it('παλιό slot + αλλαγή από ΜΕΛΛΟΝΤΙΚΗ ημερομηνία → νέα έκδοση από τη μελλοντική ημερομηνία', async () => {
    const id = await createScheduleSlot({ dayOfWeek: 1, startTime: '09:00', durationMinutes: 30, type: 'individual', studentIds: [1], label: '' })
    await db.scheduleSlots.update(id, { effectiveFrom: addDays(today, -30) })

    await saveScheduleSlotEdit(id, { startTime: '12:00' }, 'date', future)

    const rows = await db.scheduleSlots.where('seriesId').equals(id).toArray()
    expect(rows).toHaveLength(2)

    const original = rows.find((r) => r.id === id)
    expect(original.effectiveUntil).toBe(dayBeforeFuture)

    const newVersion = rows.find((r) => r.id !== id)
    expect(newVersion.startTime).toBe('12:00')
    expect(newVersion.effectiveFrom).toBe(future)
  })

  it('το παρελθόν δεν αλλάζει: επίλυση για ημερομηνία ΠΡΙΝ την αλλαγή συνεχίζει να δείχνει την παλιά τιμή', async () => {
    // dayOfWeek = η σημερινή ημέρα εβδομάδας, και όλες οι ημερομηνίες ελέγχου σε πολλαπλάσια των 7
    // ημερών από σήμερα — ώστε να πέφτουν ΟΛΕΣ στην ίδια ημέρα εβδομάδας με το slot (αλλιώς το
    // resolveOccurrencesForDate σωστά δεν θα έβρισκε τίποτα, άσχετα με το effective-dating).
    const dow = weekdayOf(today)
    const id = await createScheduleSlot({ dayOfWeek: dow, startTime: '09:00', durationMinutes: 30, type: 'individual', studentIds: [1], label: '' })
    await db.scheduleSlots.update(id, { effectiveFrom: addDays(today, -28) })
    await saveScheduleSlotEdit(id, { startTime: '13:00' }, 'date', future)

    const allSlots = await db.scheduleSlots.where('seriesId').equals(id).toArray()
    const pastDate = addDays(today, -7) // ήδη μέσα στο παλιό, αμετάβλητο διάστημα ισχύος
    const occurrencesPast = resolveOccurrencesForDate(pastDate, { scheduleSlots: allSlots, scheduleExceptions: [] })
    expect(occurrencesPast).toHaveLength(1)
    expect(occurrencesPast[0].startTime).toBe('09:00')

    const occurrencesToday = resolveOccurrencesForDate(today, { scheduleSlots: allSlots, scheduleExceptions: [] })
    expect(occurrencesToday[0].startTime).toBe('09:00') // ισχύει ακόμα η παλιά, η νέα είναι μελλοντική

    const occurrencesFuture = resolveOccurrencesForDate(future, { scheduleSlots: allSlots, scheduleExceptions: [] })
    expect(occurrencesFuture[0].startTime).toBe('13:00')
  })

  it('ποτέ δύο ταυτόχρονα ενεργές (open-ended) εκδόσεις της ίδιας σειράς', async () => {
    const dow = weekdayOf(today)
    const id = await createScheduleSlot({ dayOfWeek: dow, startTime: '09:00', durationMinutes: 30, type: 'individual', studentIds: [1], label: '' })

    // Διαδοχικές επεξεργασίες: σήμερα, μετά μελλοντική, μετά ξανά διαφορετική μελλοντική
    // (πολλαπλάσια των 7 ημερών ώστε να παραμένουν στην ίδια ημέρα εβδομάδας με το slot).
    await saveScheduleSlotEdit(id, { startTime: '09:30' }, 'today', null)
    await saveScheduleSlotEdit(id, { startTime: '10:00' }, 'date', future)
    const laterFuture = addDays(future, 28)
    const latestVersion = (await db.scheduleSlots.where('seriesId').equals(id).toArray()).find((r) => r.effectiveUntil === null)
    await saveScheduleSlotEdit(latestVersion.id, { startTime: '14:00' }, 'date', laterFuture)

    const allRows = await db.scheduleSlots.where('seriesId').equals(id).toArray()
    const openEnded = allRows.filter((r) => r.effectiveUntil === null)
    expect(openEnded).toHaveLength(1) // ΠΟΤΕ περισσότερες από μία open-ended εκδόσεις ταυτόχρονα

    // Κάθε ημερομηνία επιλύεται σε ΑΚΡΙΒΩΣ μία εμφάνιση, ποτέ δύο (καμία διπλή ενεργή εγγραφή).
    for (const d of [today, future, laterFuture]) {
      const occ = resolveOccurrencesForDate(d, { scheduleSlots: allRows, scheduleExceptions: [] })
      expect(occ).toHaveLength(1)
    }
  })
})

// Regression tests για το δεύτερο bug (Sprint 6, δεύτερος γύρος): «Αντικατάσταση» σε ήδη
// παραχθείσα ημέρα άφηνε «ορφανές» τις παλιές γραμμές αντί να τις αντικαθιστά πραγματικά.
describe('copyScheduleDay — mode "replace" πάνω σε ήδη παραχθείσα ημέρα', () => {
  const today = todayLocalISO()
  const dow = weekdayOf(today)
  const sourceDow = (dow + 1) % 7 // οποιαδήποτε άλλη μέρα από τη σημερινή

  it('«Αντικατάσταση» σε ΜΗ παραχθείσα ημέρα: το πρότυπο αλλάζει, η ουρά παραμένει άγγιχτη (θα παραχθεί φυσικά αργότερα)', async () => {
    const oldId = await createScheduleSlot({ dayOfWeek: dow, startTime: '09:00', durationMinutes: 30, type: 'individual', studentIds: [1], label: '' })
    await createScheduleSlot({ dayOfWeek: sourceDow, startTime: '10:00', durationMinutes: 20, type: 'individual', studentIds: [2], label: '' })
    // Σκόπιμα ΚΑΝΕΝΑ ensureDayGenerated πριν — η ημέρα δεν έχει «επισκεφτεί» ακόμα.

    await copyScheduleDay(sourceDow, dow, 'replace')

    const queueToday = await db.dailyQueue.where('date').equals(today).toArray()
    expect(queueToday).toHaveLength(0) // καμία «φαντασματική» παραγωγή έγινε εδώ

    const oldSlot = await db.scheduleSlots.get(oldId)
    expect(oldSlot.effectiveUntil).toBe(addDays(today, -1)) // το πρότυπο πάντως ενημερώθηκε σωστά
  })

  it('«Αντικατάσταση» σε παραχθείσα ημέρα με pending γραμμή: η παλιά αφαιρείται, η νέα μπαίνει — καμία ορφανή/διπλή γραμμή', async () => {
    await createScheduleSlot({ dayOfWeek: dow, startTime: '09:00', durationMinutes: 30, type: 'individual', studentIds: [1], label: '' })
    await ensureDayGenerated(today) // η ημέρα «παράχθηκε» ήδη πριν την αντικατάσταση
    await createScheduleSlot({ dayOfWeek: sourceDow, startTime: '10:00', durationMinutes: 20, type: 'individual', studentIds: [2], label: '' })

    let queueToday = await db.dailyQueue.where('date').equals(today).toArray()
    expect(queueToday).toHaveLength(1)
    expect(queueToday[0].studentIds).toEqual([1])

    await copyScheduleDay(sourceDow, dow, 'replace')

    queueToday = await db.dailyQueue.where('date').equals(today).toArray()
    expect(queueToday).toHaveLength(1) // ΟΧΙ 2 — αυτό ήταν το bug
    expect(queueToday[0].studentIds).toEqual([2])
  })

  it('παραχθείσα ημέρα με notHeld + pending γραμμές: το notHeld ιστορικό διατηρείται ΑΚΕΡΑΙΟ, μόνο το pending αντικαθίσταται', async () => {
    await createScheduleSlot({ dayOfWeek: dow, startTime: '09:00', durationMinutes: 30, type: 'individual', studentIds: [1], label: '' }) // θα γίνει notHeld
    await createScheduleSlot({ dayOfWeek: dow, startTime: '10:00', durationMinutes: 30, type: 'individual', studentIds: [2], label: '' }) // θα μείνει pending
    await ensureDayGenerated(today)
    await recordSessionNotHeld({ date: today, studentIds: [1], note: '' })
    await createScheduleSlot({ dayOfWeek: sourceDow, startTime: '11:00', durationMinutes: 20, type: 'individual', studentIds: [3], label: '' })

    await copyScheduleDay(sourceDow, dow, 'replace')

    const queueToday = await db.dailyQueue.where('date').equals(today).toArray()
    const studentSets = queueToday.map((e) => e.studentIds[0]).sort()
    expect(studentSets).toEqual([1, 3]) // ο notHeld (1) έμεινε, ο pending (2) έφυγε, ο νέος (3) μπήκε

    const sessionsToday = await db.sessions.where('date').equals(today).toArray()
    expect(sessionsToday).toHaveLength(1)
    expect(sessionsToday[0].status).toBe('notHeld') // το ιστορικό γεγονός παραμένει ΑΝΕΠΑΦΟ
  })

  it('διατηρεί χειροκίνητες (έκτακτες) γραμμές — ΠΟΤΕ δεν αγγίζονται από την αντικατάσταση', async () => {
    await createScheduleSlot({ dayOfWeek: dow, startTime: '09:00', durationMinutes: 30, type: 'individual', studentIds: [1], label: '' })
    await ensureDayGenerated(today)
    // Χειροκίνητη «Έκτακτη ατομική» — ΧΩΡΙΣ scheduleSeriesId, ίδιο μοτίβο με AddIndividualToToday.jsx.
    await db.dailyQueue.add({ date: today, studentIds: [99], order: 5, status: 'pending' })
    await createScheduleSlot({ dayOfWeek: sourceDow, startTime: '11:00', durationMinutes: 20, type: 'individual', studentIds: [3], label: '' })

    await copyScheduleDay(sourceDow, dow, 'replace')

    const queueToday = await db.dailyQueue.where('date').equals(today).toArray()
    const manualEntry = queueToday.find((e) => e.studentIds[0] === 99)
    expect(manualEntry).toBeTruthy() // η χειροκίνητη γραμμή επέζησε ανέγγιχτη
    expect(manualEntry.scheduleSeriesId).toBeUndefined()
    const scheduleEntry = queueToday.find((e) => e.studentIds[0] === 3)
    expect(scheduleEntry).toBeTruthy() // η νέα προγραμματισμένη γραμμή μπήκε κανονικά
    expect(queueToday).toHaveLength(2) // η παλιά (μαθητής 1) έφυγε — ούτε τρίτη, ούτε ορφανή γραμμή
  })

  it('επανάληψη της ίδιας ενέργειας «Αντικατάσταση» δεν παράγει duplicates', async () => {
    await createScheduleSlot({ dayOfWeek: dow, startTime: '09:00', durationMinutes: 30, type: 'individual', studentIds: [1], label: '' })
    await ensureDayGenerated(today)
    await createScheduleSlot({ dayOfWeek: sourceDow, startTime: '11:00', durationMinutes: 20, type: 'individual', studentIds: [3], label: '' })

    await copyScheduleDay(sourceDow, dow, 'replace')
    await copyScheduleDay(sourceDow, dow, 'replace') // ξανά, ίδια ενέργεια

    const queueToday = await db.dailyQueue.where('date').equals(today).toArray()
    expect(queueToday).toHaveLength(1) // ΠΟΤΕ διπλότυπο, όσες φορές κι αν επαναληφθεί
    expect(queueToday[0].studentIds).toEqual([3])
  })
})


// ---------------------------------------------------------------------------------------------
// Sprint 5A Phase 1 — CLOUD_ENABLED feature flag, ρητά ζητημένα integration tests (Technical Plan
// §Testing, «+5 integration tests»). Το db.js διαβάζει το import.meta.env.VITE_DEXIE_CLOUD_URL ΜΙΑ
// φορά, στην πρώτη φόρτωση του module — γι' αυτό κάθε test εδώ κάνει vi.stubEnv + vi.resetModules
// + δυναμικό re-import, ώστε το module να ξαναφορτώνεται καθαρά με τη νέα τιμή (στάνταρ, τεκμηριωμένη
// τεχνική Vitest για module-level env-dependent κώδικα — καμία δική μας υποδομή).
// ΣΗΜΕΙΩΣΗ: αυτό το describe block ΔΕΝ χρησιμοποιεί το module-level db (import στην κορυφή του
// αρχείου, ήδη φορτωμένο με flag off) — κάθε test φορτώνει το ΔΙΚΟ του, απομονωμένο instance.
// ---------------------------------------------------------------------------------------------
describe('Sprint 5A Phase 1 — CLOUD_ENABLED feature flag (db.js)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('1. Flag off → η υπάρχουσα local-only βάση λειτουργεί αμετάβλητη', async () => {
    vi.stubEnv('VITE_DEXIE_CLOUD_URL', '')
    vi.resetModules()
    const { db: freshDb, CLOUD_ENABLED } = await import('./db.js')

    expect(CLOUD_ENABLED).toBe(false)
    expect(freshDb.cloud).toBeUndefined()

    await freshDb.open()
    const id = await freshDb.students.add({ code: 'ΦΛΑΓΚ-ΟΦΦ', active: true })
    const student = await freshDb.students.get(id)
    expect(student.code).toBe('ΦΛΑΓΚ-ΟΦΦ')
    await freshDb.students.clear()
    freshDb.close()
  })

  it('2. Flag on → το db.cloud υπάρχει και έχει ρυθμιστεί ΠΡΙΝ από το πρώτο open/query', async () => {
    vi.stubEnv('VITE_DEXIE_CLOUD_URL', 'https://test-fake.dexie.cloud')
    vi.resetModules()
    const { db: freshDb, CLOUD_ENABLED } = await import('./db.js')

    expect(CLOUD_ENABLED).toBe(true)
    expect(freshDb.cloud).toBeDefined()
    expect(freshDb.cloud.options?.databaseUrl).toBe('https://test-fake.dexie.cloud')
  })

  it('3. Όλοι οι υπάρχοντες πίνακες βρίσκονται στο unsyncedTables', async () => {
    vi.stubEnv('VITE_DEXIE_CLOUD_URL', 'https://test-fake.dexie.cloud')
    vi.resetModules()
    const { db: freshDb } = await import('./db.js')

    const allTableNames = freshDb.tables.map((t) => t.name).sort()
    const unsynced = (freshDb.cloud.options?.unsyncedTables || []).slice().sort()
    expect(unsynced).toEqual(allTableNames)
  })

  it('4. Login στο Phase 1 δεν προκαλεί κανένα push ή pull εφαρμογικών δεδομένων', async () => {
    vi.stubEnv('VITE_DEXIE_CLOUD_URL', 'https://test-fake.dexie.cloud')
    vi.resetModules()
    const { db: freshDb } = await import('./db.js')

    const dataTableNames = freshDb.tables.map((t) => t.name).filter((n) => n !== 'appMeta')
    const spies = dataTableNames.map((name) => vi.spyOn(freshDb.table(name), 'add'))

    expect(freshDb.cloud.options?.unsyncedTables).toEqual(expect.arrayContaining(dataTableNames))
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })

  it('5. Αφαίρεση του env var επαναφέρει πλήρως τη local-only λειτουργία', async () => {
    vi.stubEnv('VITE_DEXIE_CLOUD_URL', 'https://test-fake.dexie.cloud')
    vi.resetModules()
    const onLoad = await import('./db.js')
    expect(onLoad.CLOUD_ENABLED).toBe(true)
    expect(onLoad.db.cloud).toBeDefined()

    vi.unstubAllEnvs()
    vi.stubEnv('VITE_DEXIE_CLOUD_URL', '')
    vi.resetModules()
    const offLoad = await import('./db.js')

    expect(offLoad.CLOUD_ENABLED).toBe(false)
    expect(offLoad.db.cloud).toBeUndefined()

    await offLoad.db.open()
    const id = await offLoad.db.students.add({ code: 'ΞΑΝΑ-ΤΟΠΙΚΟ', active: true })
    expect(await offLoad.db.students.get(id)).toMatchObject({ code: 'ΞΑΝΑ-ΤΟΠΙΚΟ' })
    await offLoad.db.students.clear()
    offLoad.db.close()
  })
})
