import { describe, expect, it } from 'vitest'
import { FOREIGN_KEY_MAP } from './foreignKeyMap.js'
import { MIGRATED_TABLE_NAMES } from './migratedTableNames.js'

// Sprint 5A Phase 2, Commit 2 — πλέον επικυρώνεται έναντι της ΚΕΝΤΡΙΚΗΣ, εξαγόμενης λίστας
// (migratedTableNames.js), όχι ενός δεύτερου, καρφωμένου συνόλου εδώ (όπως ήταν προσωρινά στο
// Commit 1 — βλ. σχόλιο που είχε αφεθεί εκεί ρητά για αυτή την αντικατάσταση).
const KNOWN_TABLES = new Set(MIGRATED_TABLE_NAMES)

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
