import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import db, { DATA_TABLE_NAMES } from '../db.js'
import { buildBackupPayload, restoreFromBackup, validateBackupPayload } from './backup.js'

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
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
    const data = Object.fromEntries(DATA_TABLE_NAMES.map((t) => [t, []]))
    data.students = { not: 'an array' }
    const result = validateBackupPayload({ app: 'workspace', data })
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/students/)
  })

  it('δέχεται έγκυρο αρχείο και μετράει τις εγγραφές', () => {
    const data = Object.fromEntries(DATA_TABLE_NAMES.map((t) => [t, []]))
    data.students = [{ id: 1 }, { id: 2 }]
    const result = validateBackupPayload({ app: 'workspace', data })
    expect(result.valid).toBe(true)
    expect(result.counts.students).toBe(2)
  })
})

describe('buildBackupPayload / restoreFromBackup', () => {
  it('το backup περιέχει όλους τους πίνακες δεδομένων εκτός appMeta', async () => {
    const payload = await buildBackupPayload()
    expect(Object.keys(payload.data).sort()).toEqual([...DATA_TABLE_NAMES].sort())
    expect(payload.data.appMeta).toBeUndefined()
  })

  it('η επαναφορά αντικαθιστά πλήρως τα δεδομένα διατηρώντας τα id (round-trip)', async () => {
    await db.students.add({ id: 1, code: 'Μ1', active: true, functionalProfile: [], preferences: {} })
    await db.goals.add({ id: 1, studentId: 1, domain: 'reading', title: 'Στόχος Α', status: 'active', priority: 'high' })

    const payload = await buildBackupPayload()

    await db.students.clear()
    await db.goals.clear()
    await db.students.add({ id: 1, code: 'ΑΛΛΟΣ', active: true, functionalProfile: [], preferences: {} })

    await restoreFromBackup(payload)

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

  // Phase 2 Commit 1 (reconciled) — ένα backup ληφθέν ΠΡΙΝ τη reconciliation (π.χ. πριν το Sprint 7/8,
  // ή ακόμα και πριν το ίδιο το v9/v10) δεν έχει καθόλου κλειδιά για τους 5 νέους πίνακες ΚΑΙ τους
  // αντίστοιχους 5 νέους _v2 πίνακες. Το restoreFromBackup ήδη ελέγχει Array.isArray(rows) πριν
  // κάνει bulkPut — ένα λείπον κλειδί απλά παραλείπεται, ΔΕΝ πετάει. Αυτό εδώ αποδεικνύει ρητά ότι
  // η reconciliation δεν έσπασε τη συμβατότητα με παλιότερα backups.
  it('restoreFromBackup δέχεται payload χωρίς τα κλειδιά των νέων v9/v10/_v2 πινάκων, χωρίς σφάλμα', async () => {
    const payload = await buildBackupPayload()
    for (const table of DATA_TABLE_NAMES) {
      if (/^(schoolYears|schoolYearParticipation|goalEvents|goalTemplates|sessionGoalAssessments)(_v2)?$/.test(table)) {
        delete payload.data[table]
      }
    }

    await expect(restoreFromBackup(payload)).resolves.not.toThrow()
    expect(await db.schoolYears.count()).toBe(0)
    expect(await db.sessionGoalAssessments.count()).toBe(0)
  })
})
