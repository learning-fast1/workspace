import { describe, expect, it } from 'vitest'
import { mapRowForMigration, mapRowsForMigration } from './rowMapper.js'
import { deterministicId } from './deterministicId.js'

const USER = 'alice@example.com'

describe('mapRowForMigration — πίνακας ΧΩΡΙΣ κανένα foreign key', () => {
  it('students: αντικαθιστά ΜΟΝΟ το id, διατηρεί όλα τα υπόλοιπα πεδία αναλλοίωτα', async () => {
    const row = { id: 1, code: 'Μ1', active: true, functionalProfile: [{ domain: 'reading' }], preferences: { likes: [] } }
    const mapped = await mapRowForMigration(USER, 'students', row)

    expect(mapped.id).toBe(await deterministicId(USER, 'students', 1))
    expect(mapped.id).not.toBe(1)
    expect(mapped.code).toBe('Μ1')
    expect(mapped.active).toBe(true)
    expect(mapped.functionalProfile).toEqual([{ domain: 'reading' }])
    expect(mapped.preferences).toEqual({ likes: [] })
  })
})

describe('mapRowForMigration — απλό (single-value) foreign key', () => {
  it('goals.studentId μετατρέπεται στο deterministic id ΤΟΥ ΙΔΙΟΥ old value, ίδιος πίνακας-στόχος students', async () => {
    const row = { id: 5, studentId: 1, domain: 'reading', title: 'Στόχος', status: 'active', priority: 'medium' }
    const mapped = await mapRowForMigration(USER, 'goals', row)

    expect(mapped.id).toBe(await deterministicId(USER, 'goals', 5))
    expect(mapped.studentId).toBe(await deterministicId(USER, 'students', 1))
    expect(mapped.title).toBe('Στόχος')
  })

  it('observations.sessionId nullable — null ΠΑΡΑΜΕΝΕΙ null, ΔΕΝ περνάει από deterministicId', async () => {
    const row = { id: 3, studentId: 1, sessionId: null, date: '2026-01-01', text: 'x' }
    const mapped = await mapRowForMigration(USER, 'observations', row)

    expect(mapped.sessionId).toBe(null)
    expect(mapped.studentId).toBe(await deterministicId(USER, 'students', 1))
  })

  it('observations.sessionId undefined ΠΑΡΑΜΕΝΕΙ undefined', async () => {
    const row = { id: 4, studentId: 1, date: '2026-01-01', text: 'x' }
    const mapped = await mapRowForMigration(USER, 'observations', row)

    expect(mapped.sessionId).toBeUndefined()
  })
})

describe('mapRowForMigration — array foreign key', () => {
  it('sessions.studentIds: ΚΑΘΕ στοιχείο μετατρέπεται ξεχωριστά, ίδια σειρά διατηρείται', async () => {
    const row = { id: 10, date: '2026-01-01', studentIds: [1, 2, 3], status: 'completed' }
    const mapped = await mapRowForMigration(USER, 'sessions', row)

    expect(mapped.studentIds).toEqual([
      await deterministicId(USER, 'students', 1),
      await deterministicId(USER, 'students', 2),
      await deterministicId(USER, 'students', 3)
    ])
  })

  it('dailyQueue.scheduleSeriesId nullable (χειροκίνητη προσθήκη) ΠΑΡΑΜΕΝΕΙ null, ΕΝΩ το studentIds array μετατρέπεται κανονικά', async () => {
    const row = { id: 7, date: '2026-01-01', studentIds: [1], scheduleSeriesId: null, order: 0, status: 'pending' }
    const mapped = await mapRowForMigration(USER, 'dailyQueue', row)

    expect(mapped.scheduleSeriesId).toBe(null)
    expect(mapped.studentIds).toEqual([await deterministicId(USER, 'students', 1)])
  })
})

describe('mapRowForMigration — αυτο-αναφορικό foreign key (scheduleSlots.seriesId)', () => {
  it('μια ΠΡΩΤΗ έκδοση σειράς (seriesId === το ίδιο id) παράγει ΤΟ ΙΔΙΟ νέο id και στα δύο πεδία', async () => {
    const row = { id: 1, seriesId: 1, dayOfWeek: 1, startTime: '09:00', durationMinutes: 30, type: 'individual', studentIds: [1], active: true, effectiveFrom: '2026-01-01', effectiveUntil: null }
    const mapped = await mapRowForMigration(USER, 'scheduleSlots', row)

    expect(mapped.id).toBe(mapped.seriesId)
    expect(mapped.id).toBe(await deterministicId(USER, 'scheduleSlots', 1))
  })

  it('μια ΔΕΥΤΕΡΗ έκδοση (seriesId δείχνει σε ΠΑΛΑΙΟΤΕΡΟ id) παράγει ΔΙΑΦΟΡΕΤΙΚΟ id/seriesId, αλλά το seriesId ταιριάζει με το deterministic id ΤΗΣ ΠΡΩΤΗΣ έκδοσης — ανεξάρτητα από τη σειρά επεξεργασίας', async () => {
    const secondVersion = { id: 2, seriesId: 1, dayOfWeek: 1, startTime: '10:00', durationMinutes: 30, type: 'individual', studentIds: [1], active: true, effectiveFrom: '2026-02-01', effectiveUntil: null }
    const mapped = await mapRowForMigration(USER, 'scheduleSlots', secondVersion)

    expect(mapped.id).toBe(await deterministicId(USER, 'scheduleSlots', 2))
    expect(mapped.seriesId).toBe(await deterministicId(USER, 'scheduleSlots', 1))
    expect(mapped.id).not.toBe(mapped.seriesId)
  })
})

describe('mapRowForMigration — domainTemplates (legacy primary key = domain, ΟΧΙ id)', () => {
  it('το νέο id υπολογίζεται από το domain (ΟΧΙ από ένα ανύπαρκτο row.id), το domain παραμένει ως πεδίο', async () => {
    const row = { domain: 'communication', suggestedMeasurementTypes: [], commonCriteria: [], baselineExamples: [], goalStarters: [] }
    const mapped = await mapRowForMigration(USER, 'domainTemplates', row)

    expect(mapped.id).toBe(await deterministicId(USER, 'domainTemplates', 'communication'))
    expect(mapped.domain).toBe('communication')
  })

  it('δύο διαφορετικοί χρήστες με το ΙΔΙΟ domain name → διαφορετικό _v2 id (global uniqueness, Phase 2 Rev.2 §1)', async () => {
    const row = { domain: 'communication', suggestedMeasurementTypes: [], commonCriteria: [], baselineExamples: [], goalStarters: [] }
    const alice = await mapRowForMigration('alice@example.com', 'domainTemplates', row)
    const bob = await mapRowForMigration('bob@example.com', 'domainTemplates', row)
    expect(alice.id).not.toBe(bob.id)
  })
})

describe('mapRowForMigration — πολλαπλά foreign key πεδία στην ΙΔΙΑ γραμμή', () => {
  it('measurements: sessionId, studentId, goalId μετατρέπονται ΚΑΘΕ ένα στον σωστό πίνακα-στόχο', async () => {
    const row = { id: 1, sessionId: 10, studentId: 1, goalId: 5, value: { successes: 3, attempts: 4 }, context: 'individual', note: '' }
    const mapped = await mapRowForMigration(USER, 'measurements', row)

    expect(mapped.sessionId).toBe(await deterministicId(USER, 'sessions', 10))
    expect(mapped.studentId).toBe(await deterministicId(USER, 'students', 1))
    expect(mapped.goalId).toBe(await deterministicId(USER, 'goals', 5))
  })

  it('sessionGoalAssessments: sessionId/studentId/goalId μετατρέπονται όλα, rating/note αναλλοίωτα', async () => {
    const row = { id: 1, sessionId: 10, studentId: 1, goalId: 5, rating: 'improved', note: 'Καλά' }
    const mapped = await mapRowForMigration(USER, 'sessionGoalAssessments', row)

    expect(mapped.sessionId).toBe(await deterministicId(USER, 'sessions', 10))
    expect(mapped.studentId).toBe(await deterministicId(USER, 'students', 1))
    expect(mapped.goalId).toBe(await deterministicId(USER, 'goals', 5))
    expect(mapped.rating).toBe('improved')
    expect(mapped.note).toBe('Καλά')
  })
})

describe('mapRowsForMigration — μαζική εκδοχή', () => {
  it('μεταφέρει πολλές γραμμές, διατηρώντας τη σειρά', async () => {
    const rows = [{ id: 1, code: 'Α', active: true }, { id: 2, code: 'Β', active: true }]
    const mapped = await mapRowsForMigration(USER, 'students', rows)

    expect(mapped).toHaveLength(2)
    expect(mapped[0].code).toBe('Α')
    expect(mapped[1].code).toBe('Β')
    expect(mapped[0].id).not.toBe(mapped[1].id)
  })

  it('άδειο array → άδειο αποτέλεσμα', async () => {
    expect(await mapRowsForMigration(USER, 'students', [])).toEqual([])
  })
})
