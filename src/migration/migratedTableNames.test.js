import { describe, expect, it } from 'vitest'
import {
  MIGRATED_TABLE_NAMES, legacyPrimaryKeyField, v2TableName, assertMigratedTablesComplete
} from './migratedTableNames.js'
import { DATA_TABLE_NAMES } from '../db.js'

describe('MIGRATED_TABLE_NAMES — canonical manifest', () => {
  it('περιέχει ακριβώς 17 πίνακες, χωρίς διπλότυπα', () => {
    expect(MIGRATED_TABLE_NAMES).toHaveLength(17)
    expect(new Set(MIGRATED_TABLE_NAMES).size).toBe(17)
  })

  it('δεν περιλαμβάνει appMeta (μόνιμα τοπικό, ποτέ δεν μεταφέρεται)', () => {
    expect(MIGRATED_TABLE_NAMES).not.toContain('appMeta')
  })

  it('students και schoolYears προηγούνται όσων εξαρτώνται από αυτούς (goals, schoolYearParticipation)', () => {
    const idx = (name) => MIGRATED_TABLE_NAMES.indexOf(name)
    expect(idx('students')).toBeLessThan(idx('goals'))
    expect(idx('students')).toBeLessThan(idx('schoolYearParticipation'))
    expect(idx('schoolYears')).toBeLessThan(idx('schoolYearParticipation'))
    expect(idx('goals')).toBeLessThan(idx('goalEvents'))
    expect(idx('sessions')).toBeLessThan(idx('measurements'))
    expect(idx('scheduleSlots')).toBeLessThan(idx('scheduleExceptions'))
  })
})

describe('legacyPrimaryKeyField', () => {
  it('domainTemplates: το legacy primary key είναι το domain, ΟΧΙ id', () => {
    expect(legacyPrimaryKeyField('domainTemplates')).toBe('domain')
  })

  it('κάθε άλλος πίνακας: το legacy primary key είναι το id', () => {
    for (const table of MIGRATED_TABLE_NAMES) {
      if (table === 'domainTemplates') continue
      expect(legacyPrimaryKeyField(table)).toBe('id')
    }
  })
})

describe('v2TableName', () => {
  it('προσθέτει το _v2 επίθημα', () => {
    expect(v2TableName('students')).toBe('students_v2')
    expect(v2TableName('sessionGoalAssessments')).toBe('sessionGoalAssessments_v2')
  })
})

describe('assertMigratedTablesComplete', () => {
  it('περνάει ενάντια στο ΠΡΑΓΜΑΤΙΚΟ schema (DATA_TABLE_NAMES) — fail-loud guard για dev/tests', () => {
    // appMeta εξαιρείται ήδη από το DATA_TABLE_NAMES (βλ. db.js) — καμία ανάγκη φιλτραρίσματος εδώ.
    expect(() => assertMigratedTablesComplete(DATA_TABLE_NAMES)).not.toThrow()
  })

  it('πετάει με σαφές μήνυμα όταν λείπει ένας πίνακας', () => {
    const withoutOne = DATA_TABLE_NAMES.filter((n) => n !== 'sessionGoalAssessments_v2')
    expect(() => assertMigratedTablesComplete(withoutOne)).toThrow(/sessionGoalAssessments_v2/)
  })

  it('πετάει όταν λείπει ολόκληρος ο legacy πίνακας (όχι μόνο ο _v2)', () => {
    const withoutLegacy = DATA_TABLE_NAMES.filter((n) => n !== 'schoolYears')
    expect(() => assertMigratedTablesComplete(withoutLegacy)).toThrow(/schoolYears/)
  })
})
