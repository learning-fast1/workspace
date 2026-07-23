import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Dexie from 'dexie'
import db, {
  migrateDomainNamesToIds, ensureDomainTemplatesSeeded, createScheduleSlot, saveScheduleSlotEdit,
  copyScheduleDay, ensureDayGenerated, recordSessionNotHeld,
  migrateRevisedGoalStatusToActive, backfillGoalEvents,
  transitionGoalStatus, createGoal, getAllowedGoalStatusTransitions,
  saveGoalAsTemplate, listGoalTemplates, updateGoalTemplate, deleteGoalTemplate,
  createSchoolYear, getActiveSchoolYear, setActiveSchoolYear, listSchoolYears,
  recordSchoolYearParticipation, setStudentActive, applySchoolYearTransition,
  updateGoalCriterion, deleteStudent, deleteSession, migrateGoalDomainsToBroaderDomains,
  DATA_TABLE_NAMES
} from './db.js'
import { restoreFromBackup } from './utils/backup.js'
import { DOMAIN_IDS, domainName } from './config/domains.js'
import { FUNCTIONAL_PROFILE_DOMAIN_IDS, functionalProfileDomainName } from './config/functionalProfileDomains.js'
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
  it('μετατρέπει παλιά ελληνική ονομασία τομέα σε id σε goal (νέα, απλοποιημένη ταξινόμηση 8 τομέων)', async () => {
    const goalId = await db.goals.add({ studentId: 1, domain: 'Ανάγνωση', title: 'Στόχος', status: 'active', priority: 'high' })
    await migrateDomainNamesToIds()
    const goal = await db.goals.get(goalId)
    expect(goal.domain).toBe('communication')
  })

  it('δεν αγγίζει goal που έχει ήδη έγκυρο id', async () => {
    const goalId = await db.goals.add({ studentId: 1, domain: 'communication', title: 'Στόχος', status: 'active', priority: 'high' })
    await migrateDomainNamesToIds()
    const goal = await db.goals.get(goalId)
    expect(goal.domain).toBe('communication')
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
    const migrated = await db.domainTemplates.get('cognitive')
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
    expect(goal.domain).toBe('communication')
  })
})

// Απλοποίηση τομέων στόχων (8 βασικοί, από 14 αναλυτικούς) — μεταφέρει ΑΠΟΚΛΕΙΣΤΙΚΑ goals.domain
// και goalTemplates.domain, ΠΟΤΕ students.functionalProfile (ρητή απόφαση χρήστη, βλ.
// config/functionalProfileDomains.js). ΜΟΝΟ τα 9 legacy ids που πραγματικά συγχωνεύτηκαν.
describe('migrateGoalDomainsToBroaderDomains (απλοποίηση τομέων στόχων) — idempotent, ασφαλές scope', () => {
  const MERGED_LEGACY_IDS = [
    'fine-motor', 'gross-motor', 'attention', 'executive-functions', 'math',
    'phonological-awareness', 'reading', 'writing', 'oral-language'
  ]
  const EXPECTED_NEW_ID = {
    'fine-motor': 'mobility', 'gross-motor': 'mobility',
    attention: 'cognitive', 'executive-functions': 'cognitive', math: 'cognitive',
    'phonological-awareness': 'communication', reading: 'communication',
    writing: 'communication', 'oral-language': 'communication'
  }

  it('μεταφέρει και τα 9 legacy ids στο σωστό νέο id', async () => {
    for (const legacyId of MERGED_LEGACY_IDS) {
      const goalId = await db.goals.add({ studentId: 1, domain: legacyId, title: `Στόχος ${legacyId}`, status: 'active', priority: 'high' })
      await migrateGoalDomainsToBroaderDomains()
      const goal = await db.goals.get(goalId)
      expect(goal.domain, `legacy id «${legacyId}»`).toBe(EXPECTED_NEW_ID[legacyId])
    }
  })

  it('ΔΕΝ αλλοιώνει ήδη-νέα ids', async () => {
    const goalId = await db.goals.add({ studentId: 1, domain: 'communication', title: 'Στόχος', status: 'active', priority: 'high' })
    await migrateGoalDomainsToBroaderDomains()
    const goal = await db.goals.get(goalId)
    expect(goal.domain).toBe('communication')
  })

  it('ΔΕΝ αλλοιώνει τα 5 ids που παρέμειναν ίδια (μόνο η ονομασία εμφάνισης άλλαξε)', async () => {
    for (const unchangedId of ['sensory', 'social-skills', 'emotional-development', 'self-care', 'behavior']) {
      const goalId = await db.goals.add({ studentId: 1, domain: unchangedId, title: `Στόχος ${unchangedId}`, status: 'active', priority: 'high' })
      await migrateGoalDomainsToBroaderDomains()
      const goal = await db.goals.get(goalId)
      expect(goal.domain, `unchanged id «${unchangedId}»`).toBe(unchangedId)
    }
  })

  it('ΔΕΝ αλλοιώνει άγνωστη/μη αναγνωρισμένη τιμή', async () => {
    const goalId = await db.goals.add({ studentId: 1, domain: 'Κάτι Ανύπαρκτο', title: 'Στόχος', status: 'active', priority: 'high' })
    await migrateGoalDomainsToBroaderDomains()
    const goal = await db.goals.get(goalId)
    expect(goal.domain).toBe('Κάτι Ανύπαρκτο')
  })

  it('μεταφέρει ΚΑΙ goalTemplates.domain, ταυτόχρονα με τα goals', async () => {
    const goalId = await db.goals.add({ studentId: 1, domain: 'reading', title: 'Στόχος', status: 'active', priority: 'high' })
    const templateId = await db.goalTemplates.add({ domain: 'reading', title: 'Πρότυπο', criterion: '', measurementType: 'successRatio' })
    await migrateGoalDomainsToBroaderDomains()
    expect((await db.goals.get(goalId)).domain).toBe('communication')
    expect((await db.goalTemplates.get(templateId)).domain).toBe('communication')
  })

  it('είναι idempotent — δεύτερη εκτέλεση στα ίδια, ήδη μεταφερμένα δεδομένα δεν αλλάζει τίποτα', async () => {
    const goalId = await db.goals.add({ studentId: 1, domain: 'reading', title: 'Στόχος', status: 'active', priority: 'high' })
    const first = await migrateGoalDomainsToBroaderDomains()
    expect(first).toEqual({ goalsMigrated: 1, templatesMigrated: 0 })

    const second = await migrateGoalDomainsToBroaderDomains()
    expect(second).toEqual({ goalsMigrated: 0, templatesMigrated: 0 })
    expect((await db.goals.get(goalId)).domain).toBe('communication')
  })

  it('ΔΕΝ αγγίζει students.functionalProfile (ρητή απόφαση χρήστη — παραμένει στους 14 τομείς)', async () => {
    const studentId = await db.students.add({
      code: 'Μ1', active: true,
      functionalProfile: [{ domain: 'reading', checkedOptions: [], notes: '' }],
      preferences: {}
    })
    await db.goals.add({ studentId, domain: 'reading', title: 'Στόχος', status: 'active', priority: 'high' })

    await migrateGoalDomainsToBroaderDomains()

    const student = await db.students.get(studentId)
    // Το goal ΜΕΤΑΦΕΡΘΗΚΕ, το functionalProfile ΟΧΙ — ίδιο ελεύθερο κείμενο id ('reading'),
    // διαφορετική τύχη, ακριβώς όπως σχεδιάστηκε.
    expect(student.functionalProfile[0].domain).toBe('reading')
    expect(FUNCTIONAL_PROFILE_DOMAIN_IDS).toContain('reading')
  })

  it('ατομικό: αν αποτύχει η ενημέρωση του goalTemplates, ΚΑΝΕΝΑ goal δεν μένει μισο-μεταφερμένο', async () => {
    await db.goals.add({ studentId: 1, domain: 'reading', title: 'Στόχος Α', status: 'active', priority: 'high' })
    await db.goals.add({ studentId: 1, domain: 'math', title: 'Στόχος Β', status: 'active', priority: 'high' })
    await db.goalTemplates.add({ domain: 'reading', title: 'Πρότυπο', criterion: '', measurementType: 'successRatio' })

    const spy = vi.spyOn(db.goalTemplates, 'update').mockImplementationOnce(() => {
      throw new Error('Εσκεμμένο σφάλμα δοκιμής — προσομοιώνει διακοπή στη μέση')
    })

    try {
      await expect(migrateGoalDomainsToBroaderDomains()).rejects.toThrow('Εσκεμμένο σφάλμα δοκιμής')
    } finally {
      spy.mockRestore()
    }

    // Η ΟΛΗ συναλλαγή ακυρώθηκε — ΚΑΝΕΝΑ goal δεν μεταφέρθηκε, ούτε καν αυτά που δεν σχετίζονται
    // με το goalTemplate που απέτυχε (ίδιο all-or-nothing σκεπτικό με το transitionGoalStatus).
    const goals = await db.goals.toArray()
    expect(goals.every((g) => g.domain === 'reading' || g.domain === 'math')).toBe(true)
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

describe('Schema v9 (Sprint 7, Technical Plan Στάδιο 1) — καθαρή εγκατάσταση', () => {
  it('οι 4 νέοι πίνακες υπάρχουν και είναι άδειοι χωρίς προϋπάρχοντα δεδομένα', async () => {
    expect(await db.schoolYears.count()).toBe(0)
    expect(await db.schoolYearParticipation.count()).toBe(0)
    expect(await db.goalEvents.count()).toBe(0)
    expect(await db.goalTemplates.count()).toBe(0)
  })
})

describe('Schema v9 — πραγματικό upgrade v8→v9 (ατομικό migration)', () => {
  // Σε αντίθεση με τα υπόλοιπα tests αυτού του αρχείου, εδώ ΔΕΝ καλούμε τις migration
  // συναρτήσεις απευθείας — αναγκάζουμε μια ΓΝΗΣΙΑ μετάβαση εκδόσεων: διαγραφή της υποκείμενης
  // IndexedDB βάσης, αναδημιουργία της ΜΟΝΟ στο v8 σχήμα μέσω ξεχωριστού raw Dexie instance,
  // σπορά δεδομένων, και μετά άνοιγμα του πραγματικού db (v1..v9 δηλωμένα) — έτσι ώστε το
  // πραγματικό db.version(9).upgrade(...) hook να τρέξει, ακριβώς όπως θα έτρεχε σε πραγματική
  // συσκευή χρήστη.
  it('μεταφέρει goals με status "revised" σε "active" και δημιουργεί goalEvents ατομικά μέσα στο ίδιο upgrade', async () => {
    db.close()
    await new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase('workspace')
      req.onsuccess = resolve
      req.onerror = () => reject(req.error)
      req.onblocked = resolve
    })

    const rawV8 = new Dexie('workspace')
    rawV8.version(8).stores({
      students: '++id, code, active',
      goals: '++id, studentId, status, priority',
      domainTemplates: 'domain',
      sessions: '++id, date',
      measurements: '++id, sessionId, studentId, goalId',
      observations: '++id, studentId, date',
      appMeta: 'key',
      reports: '++id, studentId, generatedAt',
      dailyQueue: '++id, date',
      scheduleSlots: '++id, seriesId, dayOfWeek',
      scheduleExceptions: '++id, seriesId, originalDate',
      calendarEvents: '++id, date'
    })
    await rawV8.open()
    const revisedGoalId = await rawV8.table('goals').add({
      studentId: 1, domain: 'reading', title: 'Παλιός στόχος', status: 'revised',
      statusChangedAt: '2025-03-01T10:00:00.000Z', startDate: '2025-01-10', priority: 'medium'
    })
    const activeGoalId = await rawV8.table('goals').add({
      studentId: 1, domain: 'math', title: 'Άλλος στόχος', status: 'active', startDate: '2025-02-01', priority: 'high'
    })
    rawV8.close()

    await db.open() // πραγματικό upgrade v8 → v9 τρέχει εδώ, όχι χειροκίνητη κλήση migration

    const migratedGoal = await db.goals.get(revisedGoalId)
    expect(migratedGoal.status).toBe('active')

    const revisedGoalEvents = await db.goalEvents.where('goalId').equals(revisedGoalId).toArray()
    const revisedEvent = revisedGoalEvents.find((e) => e.type === 'revised')
    expect(revisedEvent).toBeTruthy()
    expect(revisedEvent.fromStatus).toBe('revised')
    expect(revisedEvent.toStatus).toBe('active')
    expect(revisedEvent.trigger).toBe('migration') // ΠΟΤΕ 'manual' — δεν είναι πραγματική ενέργεια χρήστη
    expect(revisedEvent.at).toBe('2025-03-01T10:00:00.000Z') // διατηρεί το πιο αξιόπιστο timestamp (statusChangedAt)
    expect(revisedGoalEvents.some((e) => e.type === 'created')).toBe(true) // backfill έτρεξε στο ίδιο upgrade

    const activeGoalEvents = await db.goalEvents.where('goalId').equals(activeGoalId).toArray()
    expect(activeGoalEvents).toHaveLength(1)
    expect(activeGoalEvents[0].type).toBe('created') // active goal: μόνο 'created', καμία statusChanged
  })

  it('goal με status διαφορετικό του active ΚΑΙ χωρίς statusChangedAt χρησιμοποιεί startDate ως fallback timestamp', async () => {
    db.close()
    await new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase('workspace')
      req.onsuccess = resolve
      req.onerror = () => reject(req.error)
      req.onblocked = resolve
    })

    const rawV8 = new Dexie('workspace')
    rawV8.version(8).stores({
      students: '++id, code, active',
      goals: '++id, studentId, status, priority',
      domainTemplates: 'domain',
      sessions: '++id, date',
      measurements: '++id, sessionId, studentId, goalId',
      observations: '++id, studentId, date',
      appMeta: 'key',
      reports: '++id, studentId, generatedAt',
      dailyQueue: '++id, date',
      scheduleSlots: '++id, seriesId, dayOfWeek',
      scheduleExceptions: '++id, seriesId, originalDate',
      calendarEvents: '++id, date'
    })
    await rawV8.open()
    const archivedGoalId = await rawV8.table('goals').add({
      studentId: 2, domain: 'writing', title: 'Παλιός αρχειοθετημένος στόχος', status: 'archived',
      startDate: '2024-09-05', priority: 'low'
    })
    rawV8.close()

    await db.open()

    const events = await db.goalEvents.where('goalId').equals(archivedGoalId).toArray()
    const statusEvent = events.find((e) => e.type === 'statusChanged')
    expect(statusEvent).toBeTruthy()
    expect(statusEvent.toStatus).toBe('archived')
    expect(statusEvent.at).toBe(new Date('2024-09-05').toISOString()) // fallback: startDate
  })
})

describe('restoreFromBackup — παλιό v8 backup, idempotent migrations, atomicity', () => {
  function oldV8BackupPayload() {
    return {
      app: 'workspace',
      dbVersion: 8,
      exportedAt: '2025-06-01T00:00:00.000Z',
      data: {
        // ΧΩΡΙΣ τα 4 νέα Sprint-7 keys — έτσι ακριβώς μοιάζει ένα πραγματικό παλιό backup.
        students: [{
          id: 1, code: 'Μ1', active: true,
          // Παλιά (αναλυτική) καταχώρηση Λειτουργικού Προφίλ — ΠΡΕΠΕΙ να παραμείνει ανέγγιχτη
          // ακόμα και μετά την απλοποίηση των τομέων ΣΤΟΧΩΝ (βλ. test παρακάτω).
          functionalProfile: [{ domain: 'reading', checkedOptions: ['Διαβάζει συλλαβές'], notes: 'Παλιά σημείωση' }]
        }],
        goals: [
          { id: 10, studentId: 1, domain: 'reading', title: 'Ανάγνωση', status: 'revised', statusChangedAt: '2025-05-01T00:00:00.000Z', startDate: '2025-01-01', priority: 'high' },
          { id: 11, studentId: 1, domain: 'math', title: 'Μαθηματικά', status: 'active', startDate: '2025-01-01', priority: 'medium' }
        ],
        domainTemplates: [],
        sessions: [],
        measurements: [],
        observations: [],
        reports: [],
        dailyQueue: [],
        scheduleSlots: [],
        scheduleExceptions: [],
        calendarEvents: []
      }
    }
  }

  it('δέχεται παλιό v8 backup χωρίς τους 4 νέους πίνακες, και μετά το restore οι migrations τρέχουν σωστά', async () => {
    await restoreFromBackup(oldV8BackupPayload())

    expect(await db.schoolYears.count()).toBe(0)
    expect(await db.schoolYearParticipation.count()).toBe(0)
    expect(await db.goalTemplates.count()).toBe(0)

    const migratedGoal = await db.goals.get(10)
    expect(migratedGoal.status).toBe('active')
    const events = await db.goalEvents.where('goalId').equals(10).toArray()
    expect(events.some((e) => e.type === 'revised')).toBe(true)
    expect(events.some((e) => e.type === 'created')).toBe(true)

    const activeGoalEvents = await db.goalEvents.where('goalId').equals(11).toArray()
    expect(activeGoalEvents).toHaveLength(1)
    expect(activeGoalEvents[0].type).toBe('created')
  })

  // Απαίτηση χρήστη (§2, Απλοποίηση τομέων στόχων): ένας χρήστης μπορεί στο μέλλον να επαναφέρει
  // παλαιότερο backup — η πλήρης αλυσίδα migration πρέπει να δουλέψει σωστά και τότε, ΟΧΙ μόνο για
  // δεδομένα που υπάρχουν ήδη σήμερα στη βάση. Η σειρά εδώ αναπαράγει ΑΚΡΙΒΩΣ το main.jsx: restore
  // → migrateDomainNamesToIds (ελεύθερο κείμενο → id) → migrateGoalDomainsToBroaderDomains (14→8).
  it('restore παλιού backup με legacy domain ids + πλήρης αλυσίδα migration → σωστά goals.domain, ΑΝΕΓΓΙΧΤΟ functionalProfile', async () => {
    await restoreFromBackup(oldV8BackupPayload())
    await migrateDomainNamesToIds()
    const { goalsMigrated } = await migrateGoalDomainsToBroaderDomains()

    expect(goalsMigrated).toBe(2) // goal 10 (reading) + goal 11 (math)

    const goal10 = await db.goals.get(10)
    const goal11 = await db.goals.get(11)
    expect(goal10.domain).toBe('communication')
    expect(goal11.domain).toBe('cognitive')
    // Το ίδιο domainName() που καλούν Goal Card/Goal Detail/Βιβλιοθήκη/Reports — σωστή ελληνική
    // ονομασία μετά τη μετανάστευση, χωρίς να χρειάζεται ξεχωριστό component test ανά οθόνη.
    expect(domainName(goal10.domain)).toBe('Επικοινωνία')
    expect(domainName(goal11.domain)).toBe('Γνωστικές & Εκτελεστικές λειτουργίες')

    // Το Λειτουργικό Προφίλ ΔΕΝ αγγίχτηκε — ίδιο ελεύθερο κείμενο id ('reading'), ίδιες επιλογές/σημείωση.
    const student = await db.students.get(1)
    expect(student.functionalProfile).toEqual([
      { domain: 'reading', checkedOptions: ['Διαβάζει συλλαβές'], notes: 'Παλιά σημείωση' }
    ])
    expect(functionalProfileDomainName('reading')).toBe('Ανάγνωση')
  })

  it('δεύτερη εκτέλεση (restore ξανά, ή κλήση migrations ξανά) δεν παράγει διπλότυπα goalEvents', async () => {
    await restoreFromBackup(oldV8BackupPayload())
    const countAfterFirst = await db.goalEvents.count()

    // Ξανακαλούμε απευθείας — προσομοιώνει restore του ΙΔΙΟΥ backup ξανά, ή απλή επανεκτέλεση.
    await migrateRevisedGoalStatusToActive()
    await backfillGoalEvents()

    const countAfterSecond = await db.goalEvents.count()
    expect(countAfterSecond).toBe(countAfterFirst)
  })

  it('goal που ήδη έχει αντίστοιχο goalEvent (π.χ. restore ήδη-migrated backup) δεν αγγίζεται ξανά από το backfill', async () => {
    const goalId = await db.goals.add({ studentId: 1, domain: 'reading', title: 'Ήδη migrated', status: 'active', startDate: '2025-01-01', priority: 'medium' })
    await db.goalEvents.add({ goalId, at: '2025-01-01T00:00:00.000Z', type: 'created', fromStatus: null, toStatus: 'active', note: 'χειροκίνητο seed για το test', trigger: 'manual' })

    await backfillGoalEvents()

    const events = await db.goalEvents.where('goalId').equals(goalId).toArray()
    expect(events).toHaveLength(1) // ΔΕΝ προστέθηκε δεύτερο 'created'
  })

  it('αποτυχία migration δεν αφήνει μερικώς ενημερωμένα δεδομένα (atomicity)', async () => {
    const goalId1 = await db.goals.add({ studentId: 1, domain: 'reading', title: 'Στόχος Α', status: 'revised', statusChangedAt: '2025-03-01T00:00:00.000Z', startDate: '2025-01-01', priority: 'high' })
    const goalId2 = await db.goals.add({ studentId: 2, domain: 'math', title: 'Στόχος Β', status: 'revised', statusChangedAt: '2025-03-02T00:00:00.000Z', startDate: '2025-01-02', priority: 'high' })

    const originalAdd = db.goalEvents.add.bind(db.goalEvents)
    const spy = vi.spyOn(db.goalEvents, 'add')
      .mockImplementationOnce((...args) => originalAdd(...args)) // 1ο goalEvents.add πετυχαίνει κανονικά
      .mockImplementationOnce(() => { throw new Error('Εσκεμμένο σφάλμα δοκιμής — προσομοιώνει διακοπή στη μέση') })

    try {
      await expect(migrateRevisedGoalStatusToActive()).rejects.toThrow('Εσκεμμένο σφάλμα δοκιμής')
    } finally {
      spy.mockRestore()
    }

    // ΚΑΝΕΝΑ από τα δύο goals δεν πρέπει να έχει αλλάξει status — ούτε καν το πρώτο, παρότι το
    // δικό του goalEvents.add πρόλαβε να «πετύχει» πριν αποτύχει το δεύτερο. Η Dexie transaction
    // γύρω από ολόκληρο το migrateRevisedGoalStatusToActive ακυρώνει τα πάντα μαζί.
    const g1 = await db.goals.get(goalId1)
    const g2 = await db.goals.get(goalId2)
    expect(g1.status).toBe('revised')
    expect(g2.status).toBe('revised')
    expect(await db.goalEvents.count()).toBe(0)
  })
})

describe('schoolYearParticipation — compound unique index [studentId+schoolYearId]', () => {
  it('αποτρέπει δεύτερη εγγραφή συμμετοχής για τον ίδιο συνδυασμό μαθητή/έτους', async () => {
    const schoolYearId = await db.schoolYears.add({ label: '2026-2027', startDate: '2026-09-01', endDate: '2027-06-30', isActive: true })
    await db.schoolYearParticipation.add({ studentId: 1, schoolYearId, status: 'new', reason: '', recordedAt: new Date().toISOString() })

    await expect(
      db.schoolYearParticipation.add({ studentId: 1, schoolYearId, status: 'continued', reason: '', recordedAt: new Date().toISOString() })
    ).rejects.toThrow()

    expect(await db.schoolYearParticipation.where('studentId').equals(1).count()).toBe(1)
  })

  it('επιτρέπει τον ίδιο μαθητή σε ΔΙΑΦΟΡΕΤΙΚΑ σχολικά έτη', async () => {
    const yearA = await db.schoolYears.add({ label: '2025-2026', startDate: '2025-09-01', endDate: '2026-06-30', isActive: false })
    const yearB = await db.schoolYears.add({ label: '2026-2027', startDate: '2026-09-01', endDate: '2027-06-30', isActive: true })

    await db.schoolYearParticipation.add({ studentId: 1, schoolYearId: yearA, status: 'departed', reason: '', recordedAt: new Date().toISOString() })
    await db.schoolYearParticipation.add({ studentId: 1, schoolYearId: yearB, status: 'returned', reason: '', recordedAt: new Date().toISOString() })

    expect(await db.schoolYearParticipation.where('studentId').equals(1).count()).toBe(2)
  })
})

describe('transitionGoalStatus (Sprint 7, Technical Plan Στάδιο 2) — επιτρεπτές μεταβάσεις', () => {
  async function seedGoal(status) {
    return db.goals.add({ studentId: 1, domain: 'reading', title: 'Στόχος', status, priority: 'medium', startDate: '2025-01-01' })
  }

  const cases = [
    ['active', 'paused'],
    ['paused', 'active'],
    ['active', 'achieved'],
    ['paused', 'achieved'],
    ['active', 'archived'],
    ['paused', 'archived'],
    ['achieved', 'active'],
    ['archived', 'active']
  ]

  for (const [from, to] of cases) {
    it(`${from} → ${to} επιτρέπεται, ενημερώνει status και γράφει ακριβώς 1 goalEvent`, async () => {
      const goalId = await seedGoal(from)
      await transitionGoalStatus(goalId, to, { note: 'σημείωση δοκιμής', trigger: 'manual' })

      const goal = await db.goals.get(goalId)
      expect(goal.status).toBe(to)

      const events = await db.goalEvents.where('goalId').equals(goalId).toArray()
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({ type: 'statusChanged', fromStatus: from, toStatus: to, note: 'σημείωση δοκιμής', trigger: 'manual' })
    })
  }
})

describe('transitionGoalStatus — προαιρετικό sessionId (Goal History review, mastery merge)', () => {
  it('sessionId περνάει στο goalEvent όταν δίνεται (π.χ. trigger teachingMode)', async () => {
    const goalId = await db.goals.add({ studentId: 1, domain: 'reading', title: 'Στόχος', status: 'active', priority: 'medium', startDate: '2025-01-01' })

    await transitionGoalStatus(goalId, 'achieved', { trigger: 'teachingMode', sessionId: 42 })

    const events = await db.goalEvents.where('goalId').equals(goalId).toArray()
    expect(events[0]).toMatchObject({ trigger: 'teachingMode', sessionId: 42 })
  })

  it('χωρίς sessionId (π.χ. GoalStatusModal) → null, ίδια συμπεριφορά με πριν', async () => {
    const goalId = await db.goals.add({ studentId: 1, domain: 'reading', title: 'Στόχος', status: 'active', priority: 'medium', startDate: '2025-01-01' })

    await transitionGoalStatus(goalId, 'achieved', { trigger: 'manual' })

    const events = await db.goalEvents.where('goalId').equals(goalId).toArray()
    expect(events[0].sessionId).toBe(null)
  })
})

describe('transitionGoalStatus — μη έγκυρη είσοδος (καθορισμένη συμπεριφορά)', () => {
  it('goal δεν υπάρχει → throw, καμία εγγραφή goalEvents', async () => {
    await expect(transitionGoalStatus(999999, 'active')).rejects.toThrow(/Δεν βρέθηκε στόχος/)
    expect(await db.goalEvents.count()).toBe(0)
  })

  it('άγνωστο status → throw πριν καν αγγίξει τη βάση', async () => {
    const goalId = await db.goals.add({ studentId: 1, domain: 'reading', title: 'Στόχος', status: 'active', priority: 'medium', startDate: '2025-01-01' })
    await expect(transitionGoalStatus(goalId, 'bogus')).rejects.toThrow(/Άγνωστη κατάσταση/)
    const goal = await db.goals.get(goalId)
    expect(goal.status).toBe('active') // αμετάβλητο
    expect(await db.goalEvents.count()).toBe(0)
  })

  it('ίδια κατάσταση (active→active) → throw, καμία μετάβαση', async () => {
    const goalId = await db.goals.add({ studentId: 1, domain: 'reading', title: 'Στόχος', status: 'active', priority: 'medium', startDate: '2025-01-01' })
    await expect(transitionGoalStatus(goalId, 'active')).rejects.toThrow(/δεν επιτρέπεται/)
    expect(await db.goalEvents.count()).toBe(0)
  })

  it('μη επιτρεπτή μετάβαση (achieved→archived) → throw', async () => {
    const goalId = await db.goals.add({ studentId: 1, domain: 'reading', title: 'Στόχος', status: 'achieved', priority: 'medium', startDate: '2025-01-01' })
    await expect(transitionGoalStatus(goalId, 'archived')).rejects.toThrow(/δεν επιτρέπεται/)
    const goal = await db.goals.get(goalId)
    expect(goal.status).toBe('achieved') // αμετάβλητο
    expect(await db.goalEvents.count()).toBe(0)
  })
})

describe('transitionGoalStatus — atomicity (rollback αν αποτύχει το goalEvents.add)', () => {
  it('αν το goalEvents.add πετάξει, το goal διατηρεί το ΑΡΧΙΚΟ status — καμία μερική ενημέρωση', async () => {
    const goalId = await db.goals.add({ studentId: 1, domain: 'reading', title: 'Στόχος', status: 'active', priority: 'medium', startDate: '2025-01-01' })

    const spy = vi.spyOn(db.goalEvents, 'add').mockImplementationOnce(() => {
      throw new Error('Εσκεμμένο σφάλμα δοκιμής — προσομοιώνει διακοπή στη μέση')
    })

    try {
      await expect(transitionGoalStatus(goalId, 'paused')).rejects.toThrow('Εσκεμμένο σφάλμα δοκιμής')
    } finally {
      spy.mockRestore()
    }

    const goal = await db.goals.get(goalId)
    expect(goal.status).toBe('active') // ΟΧΙ 'paused' — η update() μέσα στην ίδια transaction ακυρώθηκε κι αυτή
    expect(await db.goalEvents.count()).toBe(0)
  })
})

describe('Schema v10 (Κλινική εκτίμηση στόχου ανά συνεδρία) — καθαρή εγκατάσταση', () => {
  it('ο νέος πίνακας sessionGoalAssessments υπάρχει και είναι άδειος χωρίς προϋπάρχοντα δεδομένα', async () => {
    expect(await db.sessionGoalAssessments.count()).toBe(0)
  })

  it('&[sessionId+goalId] είναι compound unique — δεύτερη εγγραφή για τον ίδιο συνδυασμό απορρίπτεται', async () => {
    await db.sessionGoalAssessments.add({ sessionId: 1, studentId: 1, goalId: 1, rating: 'improved', note: '' })
    await expect(
      db.sessionGoalAssessments.add({ sessionId: 1, studentId: 1, goalId: 1, rating: 'stable', note: '' })
    ).rejects.toThrow()
  })
})

describe('deleteStudent/deleteSession — cascade delete του sessionGoalAssessments', () => {
  it('deleteStudent αφαιρεί ΚΑΙ τις κλινικές εκτιμήσεις του μαθητή', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    const goalId = await db.goals.add({ studentId, domain: 'reading', title: 'Στόχος', status: 'active', priority: 'medium', startDate: '2025-01-01' })
    const sessionId = await db.sessions.add({ date: '2025-01-01', studentIds: [studentId], status: 'completed' })
    await db.sessionGoalAssessments.add({ sessionId, studentId, goalId, rating: 'improved', note: '' })

    await deleteStudent(studentId)

    expect(await db.sessionGoalAssessments.where('studentId').equals(studentId).count()).toBe(0)
  })

  it('deleteSession αφαιρεί ΚΑΙ τις κλινικές εκτιμήσεις της συνεδρίας', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    const goalId = await db.goals.add({ studentId, domain: 'reading', title: 'Στόχος', status: 'active', priority: 'medium', startDate: '2025-01-01' })
    const sessionId = await db.sessions.add({ date: '2025-01-01', studentIds: [studentId], status: 'completed' })
    await db.sessionGoalAssessments.add({ sessionId, studentId, goalId, rating: 'improved', note: '' })

    await deleteSession(sessionId)

    expect(await db.sessionGoalAssessments.where('sessionId').equals(sessionId).count()).toBe(0)
  })
})

describe('createGoal (Technical Plan Στάδιο 2)', () => {
  it('δημιουργεί goal με status "active" και ακριβώς 1 goalEvent τύπου "created", ατομικά', async () => {
    const goalId = await createGoal({ studentId: 1, domain: 'reading', title: 'Νέος στόχος', description: '', baseline: '', criterion: '8/10', measurementType: 'successRatio', supportLevel: '', priority: 'high', startDate: '2025-06-01' })

    const goal = await db.goals.get(goalId)
    expect(goal.status).toBe('active')
    expect(goal.title).toBe('Νέος στόχος')

    const events = await db.goalEvents.where('goalId').equals(goalId).toArray()
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'created', fromStatus: null, toStatus: 'active' })
  })

  it('αγνοεί/υπερισχύει οποιοδήποτε status περάσει ο καλών — πάντα "active" σε νέο στόχο', async () => {
    const goalId = await createGoal({ studentId: 1, domain: 'reading', title: 'Στόχος', status: 'achieved', priority: 'medium', startDate: '2025-06-01' })
    const goal = await db.goals.get(goalId)
    expect(goal.status).toBe('active')
  })

  it('atomicity: αν το goalEvents.add πετάξει, ΔΕΝ παραμένει ορφανό goal row', async () => {
    const spy = vi.spyOn(db.goalEvents, 'add').mockImplementationOnce(() => {
      throw new Error('Εσκεμμένο σφάλμα δοκιμής')
    })

    const countBefore = await db.goals.count()
    try {
      await expect(createGoal({ studentId: 1, domain: 'reading', title: 'Στόχος', priority: 'medium', startDate: '2025-06-01' })).rejects.toThrow('Εσκεμμένο σφάλμα δοκιμής')
    } finally {
      spy.mockRestore()
    }

    expect(await db.goals.count()).toBe(countBefore) // κανένα νέο goal επέζησε
    expect(await db.goalEvents.count()).toBe(0)
  })

  it('legacy path (χωρίς criterionConfig): συμπεριφορά ΑΚΡΙΒΩΣ όπως πριν — criterion όπως στάλθηκε, αμετάβλητο', async () => {
    const goalId = await createGoal({ studentId: 1, domain: 'reading', title: 'Παλιός στόχος', criterion: '8/10 στα ελεύθερα', measurementType: 'successRatio', priority: 'medium', startDate: '2025-06-01' })
    const goal = await db.goals.get(goalId)
    expect(goal.criterion).toBe('8/10 στα ελεύθερα')
    expect(goal.criterionConfig).toBeUndefined()
  })

  it('με έγκυρο criterionConfig: επικυρώνει ΚΑΙ παράγει αυτόματα το criterion, αγνοώντας οποιοδήποτε criterion στάλθηκε απευθείας', async () => {
    const goalId = await createGoal({
      studentId: 1, domain: 'reading', title: 'Νέος στόχος', measurementType: 'successRatio', priority: 'medium', startDate: '2025-06-01',
      criterion: 'αγνοείται', criterionConfig: { targetSuccesses: 4, targetAttempts: 5 }
    })
    const goal = await db.goals.get(goalId)
    expect(goal.criterion).toBe('4 από 5 προσπάθειες')
    expect(goal.criterionConfig).toEqual({ targetSuccesses: 4, targetAttempts: 5 })
  })

  it('με άκυρο criterionConfig (δεν αντιστοιχεί στο measurementType): throw, καμία εγγραφή', async () => {
    const countBefore = await db.goals.count()
    await expect(createGoal({
      studentId: 1, domain: 'reading', title: 'Στόχος', measurementType: 'ratingScale', priority: 'medium', startDate: '2025-06-01',
      criterionConfig: { direction: 'increase', targetMinutes: 10 } // σχήμα του duration, όχι ratingScale
    })).rejects.toThrow()
    expect(await db.goals.count()).toBe(countBefore)
    expect(await db.goalEvents.count()).toBe(0) // ατομικότητα: ούτε το event δημιουργήθηκε
  })
})

describe('updateGoalCriterion (Goal Wizard Step 3 redesign, Technical Plan Στάδιο 1)', () => {
  it('ενημερώνει criterionConfig/criterionNote και ξαναπαράγει το criterion κείμενο', async () => {
    const goalId = await createGoal({ studentId: 1, domain: 'reading', title: 'Στόχος', measurementType: 'successRatio', priority: 'medium', startDate: '2025-06-01', criterion: '' })
    await updateGoalCriterion(goalId, { criterionConfig: { targetSuccesses: 3, targetAttempts: 4 }, criterionNote: 'Σε ήσυχο περιβάλλον' })
    const goal = await db.goals.get(goalId)
    expect(goal.criterion).toBe('3 από 4 προσπάθειες')
    expect(goal.criterionConfig).toEqual({ targetSuccesses: 3, targetAttempts: 4 })
    expect(goal.criterionNote).toBe('Σε ήσυχο περιβάλλον')
  })

  it('criterionNote προαιρετικό — προεπιλογή κενό αν παραλειφθεί', async () => {
    const goalId = await createGoal({ studentId: 1, domain: 'reading', title: 'Στόχος', measurementType: 'successRatio', priority: 'medium', startDate: '2025-06-01', criterion: '' })
    await updateGoalCriterion(goalId, { criterionConfig: { targetSuccesses: 1, targetAttempts: 2 } })
    expect((await db.goals.get(goalId)).criterionNote).toBe('')
  })

  it('άκυρο criterionConfig → throw, καμία μεταβολή στο goal', async () => {
    const goalId = await createGoal({ studentId: 1, domain: 'reading', title: 'Στόχος', measurementType: 'successRatio', priority: 'medium', startDate: '2025-06-01', criterion: 'αρχικό' })
    await expect(updateGoalCriterion(goalId, { criterionConfig: { targetSuccesses: 9, targetAttempts: 5 } })).rejects.toThrow()
    expect((await db.goals.get(goalId)).criterion).toBe('αρχικό')
  })

  it('ανύπαρκτο goalId → throw', async () => {
    await expect(updateGoalCriterion(999999, { criterionConfig: { targetSuccesses: 1, targetAttempts: 2 } })).rejects.toThrow(/Δεν βρέθηκε/)
  })
})

describe('getAllowedGoalStatusTransitions — μοναδική πηγή αλήθειας για το GoalStatusModal', () => {
  it('επιστρέφει τις σωστές επιτρεπτές μεταβάσεις ανά κατάσταση', () => {
    expect(getAllowedGoalStatusTransitions('active')).toEqual(['paused', 'achieved', 'archived'])
    expect(getAllowedGoalStatusTransitions('paused')).toEqual(['active', 'achieved', 'archived'])
    expect(getAllowedGoalStatusTransitions('achieved')).toEqual(['active'])
    expect(getAllowedGoalStatusTransitions('archived')).toEqual(['active'])
  })

  it('άγνωστη κατάσταση → άδειο array, όχι throw/undefined', () => {
    expect(getAllowedGoalStatusTransitions('bogus')).toEqual([])
    expect(getAllowedGoalStatusTransitions(undefined)).toEqual([])
  })

  it('καμία κατάσταση δεν περιλαμβάνει τον εαυτό της (ίδια-κατάσταση ποτέ "επιτρεπτή")', () => {
    for (const status of ['active', 'paused', 'achieved', 'archived']) {
      expect(getAllowedGoalStatusTransitions(status)).not.toContain(status)
    }
  })
})

describe('createSchoolYear (Technical Plan Στάδιο 9, σημείο 4/7) — validation', () => {
  it('δημιουργεί έτος ΜΗ ενεργό από προεπιλογή', async () => {
    const id = await createSchoolYear({ label: '2026-2027', startDate: '2026-09-01', endDate: '2027-06-30' })
    const year = await db.schoolYears.get(id)
    expect(year.isActive).toBe(false)
  })

  it('κενός τίτλος → throw, καμία εγγραφή', async () => {
    await expect(createSchoolYear({ label: '', startDate: '2026-09-01', endDate: '2027-06-30' })).rejects.toThrow(/τίτλος/)
    await expect(createSchoolYear({ label: '   ', startDate: '2026-09-01', endDate: '2027-06-30' })).rejects.toThrow(/τίτλος/)
    expect(await db.schoolYears.count()).toBe(0)
  })

  it('startDate μετά το endDate → throw, καμία εγγραφή', async () => {
    await expect(createSchoolYear({ label: '2026-2027', startDate: '2027-06-30', endDate: '2026-09-01' })).rejects.toThrow(/λήξης/)
    expect(await db.schoolYears.count()).toBe(0)
  })

  it('λείπει ημερομηνία → throw', async () => {
    await expect(createSchoolYear({ label: '2026-2027', startDate: '', endDate: '2027-06-30' })).rejects.toThrow()
    await expect(createSchoolYear({ label: '2026-2027', startDate: '2026-09-01', endDate: '' })).rejects.toThrow()
  })

  it('startDate === endDate επιτρέπεται (όριο, όχι αυστηρή ανισότητα)', async () => {
    const id = await createSchoolYear({ label: 'Μονοήμερο', startDate: '2026-09-01', endDate: '2026-09-01' })
    expect(await db.schoolYears.get(id)).toBeTruthy()
  })
})

describe('getActiveSchoolYear / setActiveSchoolYear (Technical Plan Στάδιο 9, σημείο 5)', () => {
  it('μηδέν ενεργά έτη πριν από την αρχική ρύθμιση → null, όχι throw', async () => {
    expect(await getActiveSchoolYear()).toBe(null)
    await createSchoolYear({ label: '2026-2027', startDate: '2026-09-01', endDate: '2027-06-30' })
    expect(await getActiveSchoolYear()).toBe(null) // δημιουργήθηκε αλλά δεν ενεργοποιήθηκε ακόμη
  })

  it('ενεργοποίηση ανύπαρκτου έτους → throw, καμία αλλαγή', async () => {
    await expect(setActiveSchoolYear(999999)).rejects.toThrow(/Δεν βρέθηκε/)
    expect(await getActiveSchoolYear()).toBe(null)
  })

  it('ενεργοποιεί το ζητούμενο έτος ΚΑΙ απενεργοποιεί το προηγούμενο ενεργό, ατομικά', async () => {
    const yearA = await createSchoolYear({ label: 'Α', startDate: '2025-09-01', endDate: '2026-06-30' })
    const yearB = await createSchoolYear({ label: 'Β', startDate: '2026-09-01', endDate: '2027-06-30' })
    await setActiveSchoolYear(yearA)
    await setActiveSchoolYear(yearB)

    const active = await getActiveSchoolYear()
    expect(active.id).toBe(yearB)
    const a = await db.schoolYears.get(yearA)
    expect(a.isActive).toBe(false)
  })

  it('επανενεργοποίηση ήδη ενεργού έτους → idempotent no-op, εξακολουθεί να υπάρχει ΑΚΡΙΒΩΣ ένα ενεργό', async () => {
    const yearA = await createSchoolYear({ label: 'Α', startDate: '2025-09-01', endDate: '2026-06-30' })
    await setActiveSchoolYear(yearA)
    await setActiveSchoolYear(yearA) // ξανά, ίδιο id

    const allActive = (await db.schoolYears.toArray()).filter((y) => y.isActive)
    expect(allActive).toHaveLength(1)
    expect(allActive[0].id).toBe(yearA)
  })

  it('πάντα ΑΚΡΙΒΩΣ ένα ενεργό έτος μετά από πολλαπλές διαδοχικές ενεργοποιήσεις', async () => {
    const yearA = await createSchoolYear({ label: 'Α', startDate: '2024-09-01', endDate: '2025-06-30' })
    const yearB = await createSchoolYear({ label: 'Β', startDate: '2025-09-01', endDate: '2026-06-30' })
    const yearC = await createSchoolYear({ label: 'Γ', startDate: '2026-09-01', endDate: '2027-06-30' })
    await setActiveSchoolYear(yearA)
    await setActiveSchoolYear(yearB)
    await setActiveSchoolYear(yearC)
    await setActiveSchoolYear(yearA)

    const allActive = (await db.schoolYears.toArray()).filter((y) => y.isActive)
    expect(allActive).toHaveLength(1)
    expect(allActive[0].id).toBe(yearA)
  })
})

// Regression test για πραγματικό production bug (browser smoke test, κλείσιμο Sprint 7):
// GoalsList.jsx και Settings.jsx έκαναν το καθένα db.schoolYears.orderBy('startDate') απευθείας —
// το startDate ΔΕΝ είναι indexed πεδίο σε αυτόν τον πίνακα (σχήμα: 'schoolYears: ++id, isActive'),
// οπότε το Dexie πετούσε SchemaError αμέσως μόλις έτρεχε η query. Επειδή το GoalsList είναι πάντα
// mounted μέσα στα tabs του StudentProfile.jsx (hidden attribute, όχι conditional unmount — βλ.
// Στάδιο 7), το σφάλμα εμφανιζόταν ΑΜΕΣΩΣ με το άνοιγμα οποιουδήποτε μαθητή, πριν καν επιλεγεί το
// tab «Στόχοι» — γι' αυτό δεν εντοπίστηκε νωρίτερα: καμία δοκιμή αυτού του Sprint δεν έτρεξε ποτέ
// πραγματικά τα components (GoalsList.jsx/Settings.jsx) σε browser/DOM περιβάλλον, μόνο τα
// db.js exports και τα pure utils. Το πρώτο test παρακάτω τεκμηριώνει/κλειδώνει ΤΗΝ ΑΚΡΙΒΗ αιτία
// (ώστε να μην ξαναχρησιμοποιηθεί κατά λάθος .orderBy('startDate') πουθενά)· το δεύτερο επιβεβαιώνει
// ότι η πραγματική διόρθωση (listSchoolYears, που τώρα χρησιμοποιούν ΚΑΙ τα δύο components) δουλεύει
// σωστά πάνω σε πραγματική Dexie/IndexedDB query, όχι μόνο στη θεωρία μιας pure συνάρτησης.
describe('listSchoolYears (bugfix — regression, βλ. σχόλιο παραπάνω)', () => {
  it('τεκμηριώνει την ακριβή αιτία: db.schoolYears.orderBy("startDate") πετάει SchemaError', async () => {
    await createSchoolYear({ label: 'Α', startDate: '2025-09-01', endDate: '2026-06-30' })
    await expect(db.schoolYears.orderBy('startDate').toArray()).rejects.toThrow(/not indexed|SchemaError/i)
  })

  it('listSchoolYears() επιστρέφει όλα τα έτη ταξινομημένα, ΧΩΡΙΣ να πετάει — πραγματική Dexie query', async () => {
    const yearB = await createSchoolYear({ label: 'Β', startDate: '2026-09-01', endDate: '2027-06-30' })
    const yearA = await createSchoolYear({ label: 'Α', startDate: '2025-09-01', endDate: '2026-06-30' })
    const yearC = await createSchoolYear({ label: 'Γ', startDate: '2027-09-01', endDate: '2028-06-30' })

    const result = await listSchoolYears()
    expect(result.map((y) => y.id)).toEqual([yearA, yearB, yearC])
  })

  it('μηδέν σχολικά έτη → άδειο array, όχι throw', async () => {
    expect(await listSchoolYears()).toEqual([])
  })
})

describe('recordSchoolYearParticipation (Technical Plan Στάδιο 9, σημείο 1/4) — idempotent upsert', () => {
  it('μαθητής ή σχολικό έτος δεν υπάρχουν → throw σαφές σφάλμα, καμία εγγραφή', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    const yearId = await createSchoolYear({ label: 'Α', startDate: '2026-09-01', endDate: '2027-06-30' })

    await expect(recordSchoolYearParticipation(999999, yearId, 'new')).rejects.toThrow(/μαθητής/)
    await expect(recordSchoolYearParticipation(studentId, 999999, 'new')).rejects.toThrow(/σχολικό έτος/)
    expect(await db.schoolYearParticipation.count()).toBe(0)
  })

  it('άγνωστη κατάσταση συμμετοχής → throw', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    const yearId = await createSchoolYear({ label: 'Α', startDate: '2026-09-01', endDate: '2027-06-30' })
    await expect(recordSchoolYearParticipation(studentId, yearId, 'bogus')).rejects.toThrow(/Άγνωστη κατάσταση/)
  })

  it('δεύτερη κλήση με νέα κατάσταση ΕΝΗΜΕΡΩΝΕΙ την ίδια εγγραφή, δεν προσθέτει δεύτερη (idempotent upsert)', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    const yearId = await createSchoolYear({ label: 'Α', startDate: '2026-09-01', endDate: '2027-06-30' })

    await recordSchoolYearParticipation(studentId, yearId, 'new')
    await recordSchoolYearParticipation(studentId, yearId, 'departed', { reason: 'Μετακόμιση' })

    const rows = await db.schoolYearParticipation.where('studentId').equals(studentId).toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('departed')
    expect(rows[0].reason).toBe('Μετακόμιση')
  })

  it('ίδια κλήση επαναλαμβανόμενη πολλές φορές παραμένει μία εγγραφή (idempotent επανάληψη)', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    const yearId = await createSchoolYear({ label: 'Α', startDate: '2026-09-01', endDate: '2027-06-30' })

    await recordSchoolYearParticipation(studentId, yearId, 'new')
    await recordSchoolYearParticipation(studentId, yearId, 'new')
    await recordSchoolYearParticipation(studentId, yearId, 'new')

    expect(await db.schoolYearParticipation.where('studentId').equals(studentId).count()).toBe(1)
  })
})

describe('setStudentActive (Technical Plan Στάδιο 9, σημείο 2) — atomic student.active + participation', () => {
  it('χωρίς κανένα ενεργό σχολικό έτος: αλλάζει student.active, ΔΕΝ αγγίζει participation', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    await setStudentActive(studentId, false)

    const student = await db.students.get(studentId)
    expect(student.active).toBe(false)
    expect(await db.schoolYearParticipation.count()).toBe(0)
  })

  it('αρχειοθέτηση μαθητή με ενεργό έτος → participation "departed"', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    const yearId = await createSchoolYear({ label: 'Α', startDate: '2026-09-01', endDate: '2027-06-30' })
    await setActiveSchoolYear(yearId)

    await setStudentActive(studentId, false, { reason: 'Αποχώρησε' })

    const rows = await db.schoolYearParticipation.where('studentId').equals(studentId).toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ schoolYearId: yearId, status: 'departed', reason: 'Αποχώρησε' })
  })

  it('αρχειοθέτηση ΚΑΙ επαναφορά μαθητή μέσα στο ΙΔΙΟ σχολικό έτος → μία εγγραφή, κατάληξη "returned"', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    const yearId = await createSchoolYear({ label: 'Α', startDate: '2026-09-01', endDate: '2027-06-30' })
    await setActiveSchoolYear(yearId)

    await setStudentActive(studentId, false) // departed
    await setStudentActive(studentId, true) // returned

    const rows = await db.schoolYearParticipation.where('studentId').equals(studentId).toArray()
    expect(rows).toHaveLength(1) // ΟΧΙ δύο — σύνοψη, όχι log (σημείο 1)
    expect(rows[0].status).toBe('returned')

    const student = await db.students.get(studentId)
    expect(student.active).toBe(true)
  })

  it('ενεργοποίηση μαθητή που δεν είχε ΠΟΤΕ εγγραφή αυτό το έτος → "new", όχι "returned"', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: false })
    const yearId = await createSchoolYear({ label: 'Α', startDate: '2026-09-01', endDate: '2027-06-30' })
    await setActiveSchoolYear(yearId)

    await setStudentActive(studentId, true)

    const rows = await db.schoolYearParticipation.where('studentId').equals(studentId).toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('new')
  })

  it('δεύτερη ΙΔΙΑ κλήση (ήδη στη ζητούμενη κατάσταση) → idempotent no-op, καμία επιπλέον participation', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    const yearId = await createSchoolYear({ label: 'Α', startDate: '2026-09-01', endDate: '2027-06-30' })
    await setActiveSchoolYear(yearId)

    await setStudentActive(studentId, false)
    const countAfterFirst = await db.schoolYearParticipation.count()
    await setStudentActive(studentId, false) // ίδια τιμή ξανά

    expect(await db.schoolYearParticipation.count()).toBe(countAfterFirst)
    const rows = await db.schoolYearParticipation.where('studentId').equals(studentId).toArray()
    expect(rows).toHaveLength(1)
  })

  it('atomicity: αν η εγγραφή participation πετάξει, το student.active ΔΕΝ αλλάζει (πλήρες rollback)', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    const yearId = await createSchoolYear({ label: 'Α', startDate: '2026-09-01', endDate: '2027-06-30' })
    await setActiveSchoolYear(yearId)

    const spy = vi.spyOn(db.schoolYearParticipation, 'add').mockImplementationOnce(() => {
      throw new Error('Εσκεμμένο σφάλμα δοκιμής')
    })

    try {
      await expect(setStudentActive(studentId, false)).rejects.toThrow('Εσκεμμένο σφάλμα δοκιμής')
    } finally {
      spy.mockRestore()
    }

    const student = await db.students.get(studentId)
    expect(student.active).toBe(true) // ΑΜΕΤΑΒΛΗΤΟ — η db.students.update μέσα στην ίδια συναλλαγή ακυρώθηκε κι αυτή
    expect(await db.schoolYearParticipation.count()).toBe(0)
  })
})

describe('applySchoolYearTransition (Technical Plan Στάδιο 10) — μαζική, ατομική μετάβαση έτους', () => {
  async function seedStudentWithGoal(status = 'active') {
    const studentId = await db.students.add({ code: 'Μ' + Math.random().toString(36).slice(2, 6), active: true })
    const goalId = await db.goals.add({ studentId, domain: 'reading', title: 'Στόχος', status, priority: 'medium', startDate: '2025-01-01' })
    return { studentId, goalId }
  }

  const newYear = () => ({ label: 'Νέο ' + Math.random().toString(36).slice(2, 8), startDate: '2026-09-01', endDate: '2027-06-30' })

  it('δημιουργεί ΚΑΙ ενεργοποιεί το νέο έτος μέσα στην ΙΔΙΑ κλήση — καμία προγενέστερη createSchoolYear (σημείο 1)', async () => {
    expect(await getActiveSchoolYear()).toBe(null)
    const yearId = await applySchoolYearTransition({ label: '2026-2027', startDate: '2026-09-01', endDate: '2027-06-30' })

    const active = await getActiveSchoolYear()
    expect(active.id).toBe(yearId)
    expect(active.label).toBe('2026-2027')
  })

  it('απενεργοποιεί το προηγούμενο ενεργό έτος στην ΙΔΙΑ συναλλαγή (σημείο 2)', async () => {
    const oldYearId = await createSchoolYear({ label: 'Παλιό', startDate: '2025-09-01', endDate: '2026-06-30' })
    await setActiveSchoolYear(oldYearId)

    await applySchoolYearTransition({ label: 'Νέο', startDate: '2026-09-01', endDate: '2027-06-30' })

    const allActive = (await db.schoolYears.toArray()).filter((y) => y.isActive)
    expect(allActive).toHaveLength(1)
    expect(allActive[0].label).toBe('Νέο')
  })

  it('άκυρα πεδία έτους (κενό label / startDate>endDate) → throw, ΚΑΜΙΑ εγγραφή πουθενά', async () => {
    await expect(applySchoolYearTransition({ label: '', startDate: '2026-09-01', endDate: '2027-06-30' })).rejects.toThrow()
    await expect(applySchoolYearTransition({ label: 'Χ', startDate: '2027-06-30', endDate: '2026-09-01' })).rejects.toThrow()
    expect(await db.schoolYears.count()).toBe(0)
  })

  it('διπλότυπος τίτλος έτους → throw, ΚΑΜΙΑ εγγραφή (καμία μερική ενεργοποίηση)', async () => {
    await applySchoolYearTransition({ label: '2026-2027', startDate: '2026-09-01', endDate: '2027-06-30' })
    const countAfterFirst = await db.schoolYears.count()

    await expect(
      applySchoolYearTransition({ label: '2026-2027', startDate: '2026-09-05', endDate: '2027-06-30' })
    ).rejects.toThrow(/τίτλο/)

    expect(await db.schoolYears.count()).toBe(countAfterFirst) // ΔΕΝ δημιουργήθηκε δεύτερο έτος
    const allActive = (await db.schoolYears.toArray()).filter((y) => y.isActive)
    expect(allActive).toHaveLength(1) // ακριβώς ένα ενεργό, αμετάβλητο
  })

  it('"continue": καμία αλλαγή status, ΚΑΝΕΝΑ νέο goalEvent — ΚΑΙ για paused goals (σημείο 5)', async () => {
    const { studentId, goalId } = await seedStudentWithGoal('paused')
    const eventsBefore = await db.goalEvents.where('goalId').equals(goalId).count()

    await applySchoolYearTransition(newYear(), { goalDecisions: [{ goalId, studentId, decision: 'continue' }] })

    const goal = await db.goals.get(goalId)
    expect(goal.status).toBe('paused') // ΠΑΡΑΜΕΝΕΙ paused — ΔΕΝ επανενεργοποιείται σιωπηλά
    expect(await db.goalEvents.where('goalId').equals(goalId).count()).toBe(eventsBefore)
  })

  it('"achieved": μεταβαίνει μέσω transitionGoalStatusCore με trigger "schoolYearWizard"', async () => {
    const { studentId, goalId } = await seedStudentWithGoal()

    await applySchoolYearTransition(newYear(), { goalDecisions: [{ goalId, studentId, decision: 'achieved' }] })

    const goal = await db.goals.get(goalId)
    expect(goal.status).toBe('achieved')
    const events = await db.goalEvents.where('goalId').equals(goalId).toArray()
    expect(events.find((e) => e.type === 'statusChanged')).toMatchObject({ toStatus: 'achieved', trigger: 'schoolYearWizard' })
  })

  it('"newGoal": ο παλιός στόχος αρχειοθετείται ΑΥΤΟΜΑΤΑ, δημιουργείται νέος ΕΝΕΡΓΟΣ με κενό baseline', async () => {
    const { studentId, goalId } = await seedStudentWithGoal()

    await applySchoolYearTransition(newYear(), {
      goalDecisions: [{
        goalId, studentId, decision: 'newGoal',
        newGoalFields: { domain: 'reading', title: 'Νέος στόχος για το νέο έτος', baseline: 'ΘΑ ΠΡΕΠΕΙ ΝΑ ΑΓΝΟΗΘΕΙ', criterion: '8/10', measurementType: 'successRatio', priority: 'high', startDate: '2026-09-05' }
      }]
    })

    const oldGoal = await db.goals.get(goalId)
    expect(oldGoal.status).toBe('archived')
    const oldEvents = await db.goalEvents.where('goalId').equals(goalId).toArray()
    expect(oldEvents.find((e) => e.type === 'statusChanged')).toMatchObject({ toStatus: 'archived', trigger: 'schoolYearWizard' })

    const allGoals = await db.goals.where('studentId').equals(studentId).toArray()
    const newGoal = allGoals.find((g) => g.id !== goalId)
    expect(newGoal).toBeTruthy()
    expect(newGoal.status).toBe('active')
    expect(newGoal.baseline).toBe('') // ΠΟΤΕ κληρονομημένο baseline, ακόμα κι αν στάλθηκε
    expect(newGoal.studentId).toBe(studentId)

    const newGoalEvents = await db.goalEvents.where('goalId').equals(newGoal.id).toArray()
    expect(newGoalEvents).toHaveLength(1)
    expect(newGoalEvents[0]).toMatchObject({ type: 'created', trigger: 'schoolYearWizard' })
  })

  it('goal που ΔΕΝ ανήκει στον μαθητή της απόφασης → throw, ΚΑΜΙΑ εγγραφή πουθενά (ούτε το έτος)', async () => {
    const { goalId } = await seedStudentWithGoal()
    const otherStudentId = await db.students.add({ code: 'Άλλος', active: true })

    await expect(
      applySchoolYearTransition(newYear(), { goalDecisions: [{ goalId, studentId: otherStudentId, decision: 'achieved' }] })
    ).rejects.toThrow(/δεν ανήκει/)

    const goal = await db.goals.get(goalId)
    expect(goal.status).toBe('active')
    expect(await db.goalEvents.where('goalId').equals(goalId).count()).toBe(0)
    expect(await db.schoolYears.count()).toBe(0)
  })

  it('διπλή απόφαση για τον ίδιο στόχο → throw, καμία εγγραφή', async () => {
    const { studentId, goalId } = await seedStudentWithGoal()

    await expect(
      applySchoolYearTransition(newYear(), {
        goalDecisions: [
          { goalId, studentId, decision: 'continue' },
          { goalId, studentId, decision: 'achieved' }
        ]
      })
    ).rejects.toThrow(/Διπλή απόφαση/)

    const goal = await db.goals.get(goalId)
    expect(goal.status).toBe('active')
  })

  it('αποχωρών μαθητής (departed): student.active γίνεται false ΚΑΙ participation "departed", bundled (σημείο 2)', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: true })

    const yearId = await applySchoolYearTransition(newYear(), { participationDecisions: [{ studentId, status: 'departed', reason: 'Αποχώρησε' }] })

    const student = await db.students.get(studentId)
    expect(student.active).toBe(false)
    const rows = await db.schoolYearParticipation.where('schoolYearId').equals(yearId).toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ studentId, status: 'departed', reason: 'Αποχώρησε' })
  })

  it('συνεχίζων μαθητής (continued): student.active παραμένει/γίνεται true', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: true })

    await applySchoolYearTransition(newYear(), { participationDecisions: [{ studentId, status: 'continued', reason: '' }] })

    const student = await db.students.get(studentId)
    expect(student.active).toBe(true)
  })

  it('goalDecision για μαθητή που ταυτόχρονα αποχωρεί → throw, ΚΑΜΙΑ εγγραφή πουθενά (σημείο 6)', async () => {
    const { studentId, goalId } = await seedStudentWithGoal()

    await expect(
      applySchoolYearTransition(newYear(), {
        goalDecisions: [{ goalId, studentId, decision: 'achieved' }],
        participationDecisions: [{ studentId, status: 'departed', reason: '' }]
      })
    ).rejects.toThrow(/αποχωρεί/)

    const goal = await db.goals.get(goalId)
    expect(goal.status).toBe('active')
    expect(await db.schoolYears.count()).toBe(0)
    const student = await db.students.get(studentId)
    expect(student.active).toBe(true) // αμετάβλητο
  })

  it('idempotent επανάληψη: η ΙΔΙΑ κλήση (ίδιο label) δεύτερη φορά απορρίπτεται καθαρά, όχι διπλότυπη participation', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    const decisions = { participationDecisions: [{ studentId, status: 'continued', reason: '' }] }
    const year = { label: 'Επανάληψη 2026-2027', startDate: '2026-09-01', endDate: '2027-06-30' }

    await applySchoolYearTransition(year, decisions)
    await expect(applySchoolYearTransition(year, decisions)).rejects.toThrow(/τίτλο/)

    expect(await db.schoolYearParticipation.count()).toBe(1) // ΟΧΙ 2 — το 2ο call δεν άφησε ίχνος
    expect(await db.schoolYears.count()).toBe(1)
  })

  it('copySchedule=false (προεπιλογή): ΔΕΝ αγγίζει καθόλου το scheduleSlots', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    const slotId = await createScheduleSlot({ dayOfWeek: weekdayOf(todayLocalISO()), startTime: '09:00', durationMinutes: 30, type: 'individual', studentIds: [studentId], label: '' })

    await applySchoolYearTransition(newYear(), { participationDecisions: [{ studentId, status: 'continued', reason: '' }] })

    const versions = await db.scheduleSlots.where('seriesId').equals(slotId).toArray()
    expect(versions).toHaveLength(1) // καμία νέα έκδοση
  })

  it('copySchedule=true: κλείνει την τρέχουσα έκδοση και ανοίγει νέα από το startDate του νέου έτους, χωρίς τον αποχωρούντα', async () => {
    const staying = await db.students.add({ code: 'Μένει', active: true })
    const leaving = await db.students.add({ code: 'Φεύγει', active: true })
    const today = todayLocalISO()
    const slotId = await createScheduleSlot({ dayOfWeek: weekdayOf(today), startTime: '10:00', durationMinutes: 45, type: 'group', studentIds: [staying, leaving], label: 'Ομάδα' })

    await applySchoolYearTransition(
      { label: 'ΝέοΠρόγραμμα', startDate: '2026-09-01', endDate: '2027-06-30' },
      { participationDecisions: [{ studentId: leaving, status: 'departed', reason: '' }], copySchedule: true }
    )

    const versions = await db.scheduleSlots.where('seriesId').equals(slotId).toArray()
    expect(versions).toHaveLength(2)
    const closed = versions.find((v) => v.id === slotId)
    const fresh = versions.find((v) => v.id !== slotId)
    expect(closed.effectiveUntil).toBe(addDays('2026-09-01', -1))
    expect(fresh.effectiveFrom).toBe('2026-09-01')
    expect(fresh.effectiveUntil).toBeNull()
    expect(fresh.studentIds).toEqual([staying]) // ο αποχωρών αφαιρέθηκε
  })

  it('copySchedule=true, δεύτερη κλήση με ΙΔΙΟ startDate → idempotent, καμία τρίτη έκδοση (σημείο 7)', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    const today = todayLocalISO()
    const slotId = await createScheduleSlot({ dayOfWeek: weekdayOf(today), startTime: '10:00', durationMinutes: 45, type: 'individual', studentIds: [studentId], label: '' })

    await refreshScheduleForYearStart('2026-09-01', [])
    await refreshScheduleForYearStart('2026-09-01', [])

    async function refreshScheduleForYearStart(startDate, departedIds) {
      // Καλεί απευθείας τη internal-only core λογική μέσω ενός πραγματικού applySchoolYearTransition —
      // ΔΕΝ εξάγεται ξεχωριστά, ίδιο idiom με τα υπόλοιπα core functions αυτού του αρχείου.
      await applySchoolYearTransition(
        { label: 'Επανάληψη-' + Math.random().toString(36).slice(2, 8), startDate, endDate: '2027-06-30' },
        { participationDecisions: departedIds.map((id) => ({ studentId: id, status: 'departed', reason: '' })), copySchedule: true }
      )
    }

    const versions = await db.scheduleSlots.where('seriesId').equals(slotId).toArray()
    expect(versions).toHaveLength(2) // ΟΧΙ 3 — η δεύτερη κλήση δεν άνοιξε δεύτερη νέα έκδοση
  })

  it('πλήρες rollback σε αποτυχία στη μέση ενός μαζικού transition (πολλαπλοί πίνακες, ΚΑΙ το ίδιο το έτος)', async () => {
    const a = await seedStudentWithGoal()
    const b = await seedStudentWithGoal()

    // Το 1ο goalEvents.add (goal του a, decision 'achieved') πετυχαίνει κανονικά· το 2ο (goal του b)
    // πετάει — προσομοιώνει διακοπή ΑΦΟΥ αρκετές ενέργειες (μαζί με τη δημιουργία/ενεργοποίηση του
    // ίδιου του νέου έτους, που έχει ήδη προηγηθεί) έχουν «πετύχει» μέσα στην ίδια, ανοιχτή συναλλαγή.
    const originalAdd = db.goalEvents.add.bind(db.goalEvents)
    const spy = vi.spyOn(db.goalEvents, 'add')
      .mockImplementationOnce((...args) => originalAdd(...args))
      .mockImplementationOnce(() => { throw new Error('Εσκεμμένο σφάλμα δοκιμής — προσομοιώνει διακοπή στη μέση') })

    try {
      await expect(applySchoolYearTransition(newYear(), {
        goalDecisions: [
          { goalId: a.goalId, studentId: a.studentId, decision: 'achieved' },
          { goalId: b.goalId, studentId: b.studentId, decision: 'achieved' }
        ],
        participationDecisions: [
          { studentId: a.studentId, status: 'continued', reason: '' },
          { studentId: b.studentId, status: 'continued', reason: '' }
        ]
      })).rejects.toThrow('Εσκεμμένο σφάλμα δοκιμής')
    } finally {
      spy.mockRestore()
    }

    // ΤΙΠΟΤΑ δεν πρέπει να έχει εφαρμοστεί — ΟΥΤΕ ΤΟ ΝΕΟ ΕΤΟΣ (σημείο 2: «δεν πρέπει να μείνει
    // νέο ενεργό έτος ή μερικώς μεταφερμένοι μαθητές»), ούτε καν η πρώτη goal-απόφαση, παρότι το
    // δικό της goalEvents.add πρόλαβε να «πετύχει» πριν αποτύχει η δεύτερη.
    expect(await db.schoolYears.count()).toBe(0)
    const goalA = await db.goals.get(a.goalId)
    const goalB = await db.goals.get(b.goalId)
    expect(goalA.status).toBe('active')
    expect(goalB.status).toBe('active')
    expect(await db.goalEvents.where('goalId').equals(a.goalId).count()).toBe(0)
    expect(await db.goalEvents.where('goalId').equals(b.goalId).count()).toBe(0)
    expect(await db.schoolYearParticipation.count()).toBe(0)
  })
})

describe('saveGoalAsTemplate (Sprint 7, Technical Plan Στάδιο 6)', () => {
  it('αντιγράφει ΑΚΡΙΒΩΣ το whitelist πεδίων — τίποτα άλλο', async () => {
    const goalId = await db.goals.add({
      studentId: 1, domain: 'communication', title: 'Ανάγνωση προτάσεων', description: 'περιγραφή',
      baseline: 'ΕΥΑΙΣΘΗΤΟ — 5 λέξεις με βοήθεια', criterion: '8/10', measurementType: 'successRatio',
      supportLevel: 'λεκτική υπόδειξη', priority: 'high', startDate: '2026-01-01',
      status: 'active', statusChangedAt: '2026-01-01T00:00:00.000Z'
    })

    const templateId = await saveGoalAsTemplate(goalId)
    const template = await db.goalTemplates.get(templateId)

    expect(template.domain).toBe('communication')
    expect(template.title).toBe('Ανάγνωση προτάσεων')
    expect(template.description).toBe('περιγραφή')
    expect(template.criterion).toBe('8/10')
    expect(template.measurementType).toBe('successRatio')

    // Ρητά ΔΕΝ πρέπει να υπάρχουν — baseline/status/studentId/statusChangedAt/goalEvents/κλπ.
    expect(template.baseline).toBeUndefined()
    expect(template.status).toBeUndefined()
    expect(template.statusChangedAt).toBeUndefined()
    expect(template.studentId).toBeUndefined()
    expect(template.priority).toBeUndefined()
    expect(template.startDate).toBeUndefined()
    expect(template.supportLevel).toBeUndefined()

    const events = await db.goalEvents.where('goalId').equals(goalId).toArray()
    expect(events).toHaveLength(0) // η αποθήκευση ως πρότυπο δεν είναι goal lifecycle ενέργεια
  })

  it('goal δεν υπάρχει → throw, καμία εγγραφή goalTemplates', async () => {
    await expect(saveGoalAsTemplate(999999)).rejects.toThrow(/Δεν βρέθηκε στόχος/)
    expect(await db.goalTemplates.count()).toBe(0)
  })

  it('goal με άγνωστο/κενό domain → throw (defensive — δεν έχει συμβεί ποτέ μέσω Wizard, αλλά προστατεύεται)', async () => {
    const goalId = await db.goals.add({ studentId: 1, domain: 'ανύπαρκτος-τομέας', title: 'Τ', status: 'active', priority: 'medium', startDate: '2026-01-01' })
    await expect(saveGoalAsTemplate(goalId)).rejects.toThrow(/τομέας/)
    expect(await db.goalTemplates.count()).toBe(0)
  })
})

describe('listGoalTemplates', () => {
  async function seedThree() {
    const a = await db.goalTemplates.add({ domain: 'communication', title: 'Α', description: '', criterion: '', measurementType: '' })
    const b = await db.goalTemplates.add({ domain: 'cognitive', title: 'Β', description: '', criterion: '', measurementType: '' })
    const c = await db.goalTemplates.add({ domain: 'communication', title: 'Γ', description: '', criterion: '', measurementType: '' })
    return { a, b, c }
  }

  it('χωρίς domain → όλα τα πρότυπα', async () => {
    await seedThree()
    const all = await listGoalTemplates()
    expect(all).toHaveLength(3)
  })

  it('με domain → μόνο τα πρότυπα αυτού του τομέα', async () => {
    await seedThree()
    const readingOnly = await listGoalTemplates('communication')
    expect(readingOnly).toHaveLength(2)
    expect(readingOnly.every((t) => t.domain === 'communication')).toBe(true)
  })

  it('deterministic σειρά — κατά id, ίδια σε επαναλαμβανόμενες κλήσεις', async () => {
    const { a, b, c } = await seedThree()
    const first = await listGoalTemplates()
    const second = await listGoalTemplates()
    expect(first.map((t) => t.id)).toEqual([a, b, c])
    expect(first.map((t) => t.id)).toEqual(second.map((t) => t.id))
  })
})

describe('updateGoalTemplate', () => {
  it('ενημερώνει επιτρεπτά πεδία περιεχομένου', async () => {
    const id = await db.goalTemplates.add({ domain: 'communication', title: 'Παλιός τίτλος', description: '', criterion: '', measurementType: '' })
    await updateGoalTemplate(id, { title: 'Νέος τίτλος', criterion: '9/10' })
    const updated = await db.goalTemplates.get(id)
    expect(updated.title).toBe('Νέος τίτλος')
    expect(updated.criterion).toBe('9/10')
  })

  it('μη επιτρεπτά πεδία (π.χ. status) αγνοούνται σιωπηλά — ΠΟΤΕ δεν εφαρμόζονται', async () => {
    const id = await db.goalTemplates.add({ domain: 'communication', title: 'Τίτλος', description: '', criterion: '', measurementType: '' })
    await updateGoalTemplate(id, { title: 'Ενημερωμένος', status: 'archived', studentId: 999 })
    const updated = await db.goalTemplates.get(id)
    expect(updated.title).toBe('Ενημερωμένος')
    expect(updated.status).toBeUndefined()
    expect(updated.studentId).toBeUndefined()
  })

  it('άδειασμα υποχρεωτικού πεδίου (title) → throw, ΚΑΜΙΑ μερική ενημέρωση', async () => {
    const id = await db.goalTemplates.add({ domain: 'communication', title: 'Αρχικός', description: 'περιγρ', criterion: '', measurementType: '' })
    await expect(updateGoalTemplate(id, { title: '  ', description: 'νέα περιγραφή' })).rejects.toThrow(/τίτλος/)
    const stillThere = await db.goalTemplates.get(id)
    expect(stillThere.title).toBe('Αρχικός')
    expect(stillThere.description).toBe('περιγρ') // ΟΥΤΕ η άσχετη αλλαγή εφαρμόστηκε — atomic all-or-nothing
  })

  it('άγνωστο domain → throw, καμία μερική ενημέρωση', async () => {
    const id = await db.goalTemplates.add({ domain: 'communication', title: 'Τ', description: '', criterion: '', measurementType: '' })
    await expect(updateGoalTemplate(id, { domain: 'ανύπαρκτος' })).rejects.toThrow(/τομέας/)
    const stillThere = await db.goalTemplates.get(id)
    expect(stillThere.domain).toBe('communication')
  })

  it('πρότυπο δεν υπάρχει → throw', async () => {
    await expect(updateGoalTemplate(999999, { title: 'Χ' })).rejects.toThrow(/Δεν βρέθηκε πρότυπο/)
  })
})

describe('deleteGoalTemplate', () => {
  it('διαγράφει το πρότυπο', async () => {
    const id = await db.goalTemplates.add({ domain: 'communication', title: 'Τ', description: '', criterion: '', measurementType: '' })
    await deleteGoalTemplate(id)
    expect(await db.goalTemplates.get(id)).toBeUndefined()
  })

  it('πρότυπο δεν υπάρχει → throw', async () => {
    await expect(deleteGoalTemplate(999999)).rejects.toThrow(/Δεν βρέθηκε πρότυπο/)
  })

  it('καμία cascade — goal που δημιουργήθηκε "από" αυτό το πρότυπο παραμένει πλήρως ανέπαφο', async () => {
    const goalId = await db.goals.add({
      studentId: 1, domain: 'communication', title: 'Πρωτότυπος στόχος', description: 'περιγραφή',
      baseline: 'baseline παραμένει', criterion: '8/10', measurementType: 'successRatio',
      priority: 'high', startDate: '2026-01-01', status: 'active', statusChangedAt: '2026-01-01T00:00:00.000Z'
    })
    const templateId = await saveGoalAsTemplate(goalId)

    await deleteGoalTemplate(templateId)

    const goalAfter = await db.goals.get(goalId)
    expect(goalAfter.title).toBe('Πρωτότυπος στόχος')
    expect(goalAfter.baseline).toBe('baseline παραμένει')
    expect(goalAfter.status).toBe('active')
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

    // Ελέγχεται ΠΡΙΝ από οποιοδήποτε freshDb.open()/query — ακριβώς η απαίτηση.
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

    // Μηχανιστική εγγύηση (Technical Plan §Testing, τεστ #4): αφού ΟΛΟΙ οι πίνακες είναι στο
    // unsyncedTables (test #3), το ίδιο το Dexie Cloud δεν έχει κανέναν πίνακα δεδομένων να
    // συγχρονίσει — οποιαδήποτε μελλοντική κλήση login/sync δεν μπορεί να αγγίξει app data.
    // Επιβεβαιώνεται εδώ και συμπεριφορικά: spy πάνω σε κάθε data table's πράξεις, καμία κλήση
    // ΠΡΙΝ ΚΑΙ ΜΕΤΑ την ύπαρξη του db.cloud API (χωρίς πραγματικό login/OTP — εκτός πεδίου αυτού
    // του unit-level test, βλ. Phase 0.5 για ζωντανή επιβεβαίωση με πραγματικό λογαριασμό).
    const dataTableNames = freshDb.tables.map((t) => t.name).filter((n) => n !== 'appMeta')
    const spies = dataTableNames.map((name) => vi.spyOn(freshDb.table(name), 'add'))

    expect(freshDb.cloud.options?.unsyncedTables).toEqual(expect.arrayContaining(dataTableNames))
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })

  it('5. Αφαίρεση του env var επαναφέρει πλήρως τη local-only λειτουργία', async () => {
    // Σκόπιμα: ΠΡΩΤΑ on, ΜΕΤΑ off, στο ΙΔΙΟ test — αποδεικνύει ότι δεν μένει καμία «κολλημένη»
    // κατάσταση από το προηγούμενο module load, χάρη στο vi.resetModules().
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

// Sprint 5A Phase 2, Commit 1 (reconciled) — μέχρι τώρα το v11 δεν είχε ΚΑΜΙΑ δική του δοκιμή (το
// αρχικό, 11-πινάκων Commit 1 επαληθεύτηκε μόνο χειροκίνητα, βλ. commit a6cbb9a). Αυτό εδώ είναι η
// πρώτη πραγματική, μόνιμη κάλυψη: επιβεβαιώνει ότι το reconciled schema (πλέον 16 _v2 πίνακες,
// ίδιοι με το πλήρες legacy σχήμα μέχρι v10) ανοίγει σωστά ΚΑΙ ότι οι νέοι _v2 πίνακες είναι
// πραγματικά χρησιμοποιήσιμοι — όχι μόνο δηλωμένοι.
describe('Schema v11 (Phase 2 parallel-table foundation, reconciled μετά τα Sprint 7/8)', () => {
  it('ανοίγει στο v11 και δηλώνει _v2 αντίστοιχο για ΚΑΘΕ πίνακα δεδομένων του legacy σχήματος', async () => {
    expect(db.verno).toBe(11)

    const tableNames = db.tables.map((t) => t.name)
    const legacyDataTables = [
      'students', 'goals', 'domainTemplates', 'sessions', 'measurements', 'observations',
      'reports', 'dailyQueue', 'scheduleSlots', 'scheduleExceptions', 'calendarEvents',
      'schoolYears', 'schoolYearParticipation', 'goalEvents', 'goalTemplates', 'sessionGoalAssessments'
    ]
    for (const name of legacyDataTables) {
      expect(tableNames, `λείπει ο legacy πίνακας: ${name}`).toContain(name)
      expect(tableNames, `λείπει το _v2 αντίστοιχο: ${name}_v2`).toContain(`${name}_v2`)
    }
    // appMeta: ΚΑΜΙΑ _v2 εκδοχή — μόνιμα τοπικό/ανά-συσκευή, ρητή εξαίρεση (βλ. σχόλιο στο db.js).
    expect(tableNames).toContain('appMeta')
    expect(tableNames).not.toContain('appMeta_v2')
  })

  it('οι 5 νέοι _v2 πίνακες (Sprint 7/8) είναι πραγματικά εγγράψιμοι/αναγνώσιμοι με string id', async () => {
    await db.schoolYears_v2.put({ id: 'sy-1', label: 'Smoke', startDate: '2026-09-01', endDate: '2027-06-30', isActive: false })
    expect(await db.schoolYears_v2.get('sy-1')).toBeTruthy()

    await db.schoolYearParticipation_v2.put({ id: 'syp-1', studentId: 'st-1', schoolYearId: 'sy-1', status: 'new', reason: '', recordedAt: new Date().toISOString() })
    expect(await db.schoolYearParticipation_v2.get('syp-1')).toBeTruthy()

    await db.goalEvents_v2.put({ id: 'ge-1', goalId: 'g-1', at: new Date().toISOString(), type: 'created', fromStatus: null, toStatus: 'active', note: '', trigger: 'manual' })
    expect(await db.goalEvents_v2.get('ge-1')).toBeTruthy()

    await db.goalTemplates_v2.put({ id: 'gt-1', domain: 'communication', title: 'Πρότυπο' })
    expect(await db.goalTemplates_v2.get('gt-1')).toBeTruthy()

    await db.sessionGoalAssessments_v2.put({ id: 'sga-1', sessionId: 's-1', studentId: 'st-1', goalId: 'g-1', rating: 'improved', note: '' })
    expect(await db.sessionGoalAssessments_v2.get('sga-1')).toBeTruthy()

    await Promise.all([
      db.schoolYears_v2.clear(), db.schoolYearParticipation_v2.clear(), db.goalEvents_v2.clear(),
      db.goalTemplates_v2.clear(), db.sessionGoalAssessments_v2.clear()
    ])
  })

  it('sessionGoalAssessments_v2.&[sessionId+goalId] είναι compound unique, ίδιο idiom με τον legacy πίνακα', async () => {
    await db.sessionGoalAssessments_v2.add({ id: 'sga-a', sessionId: 's-1', studentId: 'st-1', goalId: 'g-1', rating: 'improved', note: '' })
    await expect(
      db.sessionGoalAssessments_v2.add({ id: 'sga-b', sessionId: 's-1', studentId: 'st-1', goalId: 'g-1', rating: 'stable', note: '' })
    ).rejects.toThrow()
    await db.sessionGoalAssessments_v2.clear()
  })

  it('schoolYearParticipation_v2.&[studentId+schoolYearId] είναι compound unique, ίδιο idiom με τον legacy πίνακα', async () => {
    await db.schoolYearParticipation_v2.add({ id: 'syp-a', studentId: 'st-1', schoolYearId: 'sy-1', status: 'new', reason: '', recordedAt: new Date().toISOString() })
    await expect(
      db.schoolYearParticipation_v2.add({ id: 'syp-b', studentId: 'st-1', schoolYearId: 'sy-1', status: 'continued', reason: '', recordedAt: new Date().toISOString() })
    ).rejects.toThrow()
    await db.schoolYearParticipation_v2.clear()
  })

  it('DATA_TABLE_NAMES περιλαμβάνει ΟΛΟΥΣ τους νέους _v2 πίνακες, ΟΧΙ το appMeta', async () => {
    for (const name of ['schoolYears_v2', 'schoolYearParticipation_v2', 'goalEvents_v2', 'goalTemplates_v2', 'sessionGoalAssessments_v2']) {
      expect(DATA_TABLE_NAMES).toContain(name)
    }
    expect(DATA_TABLE_NAMES).not.toContain('appMeta')
  })

  it('οι legacy πίνακες παραμένουν πλήρως ανεπηρέαστοι από τη reconciliation (καμία στήλη/δείκτης άλλαξε)', async () => {
    // Ίδιο idiom με το ήδη υπάρχον schema v9 test — sanity check ότι το v11 bump δεν άγγιξε τίποτα
    // από το ενεργό, legacy σχήμα (τα _v2 είναι ΑΠΟΚΛΕΙΣΤΙΚΑ πρόσθετες δηλώσεις).
    const studentId = await db.students.add({ code: 'ΝΤΤ2', active: true })
    expect(await db.students.get(studentId)).toMatchObject({ code: 'ΝΤΤ2' })
    await db.students.delete(studentId)
  })
})
