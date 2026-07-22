import { describe, expect, it } from 'vitest'
import { FOREIGN_KEY_MAP } from './foreignKeyMap.js'

// Η πλήρης λίστα λογικών πινάκων δεδομένων (χωρίς appMeta) όπως στο src/db.js v10/v11 — καρφωμένη
// εδώ σκόπιμα (η κεντρική, εξαγόμενη έκδοση migratedTableNames.js είναι Commit 2). Χρησιμεύει μόνο
// για να επιβεβαιώσει ότι ο χάρτης δεν αναφέρεται ποτέ σε ανύπαρκτο πίνακα.
const KNOWN_TABLES = new Set([
  'students', 'goals', 'domainTemplates', 'sessions', 'measurements', 'observations',
  'reports', 'dailyQueue', 'scheduleSlots', 'scheduleExceptions', 'calendarEvents',
  'schoolYears', 'schoolYearParticipation', 'goalEvents', 'goalTemplates', 'sessionGoalAssessments'
])

describe('FOREIGN_KEY_MAP — εσωτερική συνέπεια', () => {
  it('κάθε κλειδί-πίνακας του χάρτη είναι γνωστός πίνακας', () => {
    for (const tableName of Object.keys(FOREIGN_KEY_MAP)) {
      expect(KNOWN_TABLES.has(tableName), `άγνωστος πίνακας στο χάρτη: ${tableName}`).toBe(true)
    }
  })

  it('κάθε target table (απλό ή array) είναι γνωστός πίνακας', () => {
    for (const [tableName, fields] of Object.entries(FOREIGN_KEY_MAP)) {
      for (const [fieldName, target] of Object.entries(fields)) {
        const targetTable = typeof target === 'string' ? target : target.table
        expect(
          KNOWN_TABLES.has(targetTable),
          `${tableName}.${fieldName} δείχνει σε άγνωστο πίνακα: ${targetTable}`
        ).toBe(true)
      }
    }
  })

  it('scheduleSlots.seriesId είναι σκόπιμα αυτο-αναφορικό', () => {
    expect(FOREIGN_KEY_MAP.scheduleSlots.seriesId).toBe('scheduleSlots')
  })

  it('τα array-πεδία (studentIds) δηλώνονται με { table, array: true }, όχι απλό string', () => {
    expect(FOREIGN_KEY_MAP.sessions.studentIds).toEqual({ table: 'students', array: true })
    expect(FOREIGN_KEY_MAP.dailyQueue.studentIds).toEqual({ table: 'students', array: true })
  })
})
