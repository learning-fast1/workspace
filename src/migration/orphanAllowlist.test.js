import { describe, expect, it } from 'vitest'
import { TOLERATED_ORPHAN_FOREIGN_KEYS, findToleratedOrphanEntry } from './orphanAllowlist.js'

describe('TOLERATED_ORPHAN_FOREIGN_KEYS', () => {
  it('είναι άδεια εξ ορισμού — καμία ΓΝΩΣΤΗ, τεκμηριωμένη περίπτωση επιτρεπτού κρεμασμένου FK σήμερα', () => {
    expect(TOLERATED_ORPHAN_FOREIGN_KEYS).toEqual([])
  })

  it('κάθε καταχώρηση (αν υπάρξει ποτέ) ΠΡΕΠΕΙ να έχει table, field ΚΑΙ reason — τεκμηρίωση υποχρεωτική', () => {
    for (const entry of TOLERATED_ORPHAN_FOREIGN_KEYS) {
      expect(entry.table).toBeTruthy()
      expect(entry.field).toBeTruthy()
      expect(entry.reason, `${entry.table}.${entry.field} λείπει reason`).toBeTruthy()
    }
  })
})

describe('findToleratedOrphanEntry', () => {
  it('null όταν η allowlist είναι άδεια (τρέχουσα, πραγματική κατάσταση)', () => {
    expect(findToleratedOrphanEntry('observations', 'sessionId')).toBe(null)
  })

  it('βρίσκει καταχώρηση σε ΕΝΕΣΙΜΗ (injected) allowlist — αποδεικνύει τον μηχανισμό χωρίς να χρειάζεται ΠΡΑΓΜΑΤΙΚΗ εξαίρεση στο production schema', () => {
    const fakeAllowlist = [{ table: 'observations', field: 'sessionId', reason: 'δοκιμαστική τεκμηρίωση' }]
    const found = findToleratedOrphanEntry('observations', 'sessionId', fakeAllowlist)
    expect(found).toEqual(fakeAllowlist[0])
  })

  it('δεν ταιριάζει σε λάθος πίνακα/πεδίο ακόμα κι αν η allowlist έχει καταχωρήσεις για ΑΛΛΑ ζεύγη', () => {
    const fakeAllowlist = [{ table: 'observations', field: 'sessionId', reason: 'x' }]
    expect(findToleratedOrphanEntry('measurements', 'sessionId', fakeAllowlist)).toBe(null)
    expect(findToleratedOrphanEntry('observations', 'studentId', fakeAllowlist)).toBe(null)
  })
})
