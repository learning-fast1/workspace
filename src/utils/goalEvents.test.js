import { describe, expect, it } from 'vitest'
import { describeGoalEvent, sortGoalEventsChronologically } from './goalEvents.js'

const goal = { id: 1, title: 'Ανάγνωση προτάσεων' }

describe('describeGoalEvent — κανονικά (μη-migration) events', () => {
  it('type "created" χωρίς σημείωση', () => {
    const result = describeGoalEvent({ type: 'created', trigger: 'manual', note: '' }, goal)
    expect(result.text).toBe('Νέος στόχος: Ανάγνωση προτάσεων')
    expect(result.isMigration).toBe(false)
  })

  it('type "created" ΜΕ σημείωση — η σημείωση εμφανίζεται', () => {
    const result = describeGoalEvent({ type: 'created', trigger: 'manual', note: 'ξεκίνησε μετά από αξιολόγηση' }, goal)
    expect(result.text).toBe('Νέος στόχος: Ανάγνωση προτάσεων — «ξεκίνησε μετά από αξιολόγηση»')
  })

  it.each([
    ['paused', 'Τέθηκε σε παύση: Ανάγνωση προτάσεων'],
    ['achieved', 'Ολοκληρώθηκε: Ανάγνωση προτάσεων'],
    ['archived', 'Αρχειοθετήθηκε: Ανάγνωση προτάσεων'],
    ['active', 'Επανενεργοποιήθηκε: Ανάγνωση προτάσεων']
  ])('type "statusChanged" → toStatus "%s"', (toStatus, expectedText) => {
    const result = describeGoalEvent({ type: 'statusChanged', trigger: 'manual', toStatus, note: '' }, goal)
    expect(result.text).toBe(expectedText)
    expect(result.isMigration).toBe(false)
  })

  it('type "statusChanged" ΜΕ σημείωση — η σημείωση εμφανίζεται στο τέλος', () => {
    const result = describeGoalEvent({ type: 'statusChanged', trigger: 'manual', toStatus: 'paused', note: 'Αναρρωτική άδεια' }, goal)
    expect(result.text).toBe('Τέθηκε σε παύση: Ανάγνωση προτάσεων — «Αναρρωτική άδεια»')
  })

  it('type "schoolYearTransition" (Στάδιο 10, δεν παράγεται ακόμα αλλά ήδη υποστηρίζεται)', () => {
    const result = describeGoalEvent({ type: 'schoolYearTransition', trigger: 'schoolYearWizard', note: '' }, goal)
    expect(result.text).toBe('Μεταφέρθηκε στο νέο σχολικό έτος: Ανάγνωση προτάσεων')
  })
})

describe('describeGoalEvent — migration events (Στάδιο 1 backfill) εμφανίζονται ρητά διαφορετικά', () => {
  it('trigger:"migration" → πρόθεμα "Ιστορικό:" ΚΑΙ isMigration:true, ανεξαρτήτως type', () => {
    const revisedMigration = describeGoalEvent(
      { type: 'revised', trigger: 'migration', note: 'Μεταφέρθηκε αυτόματα από παλιά κατάσταση «Αναθεωρήθηκε» (migration Sprint 7)' },
      goal
    )
    expect(revisedMigration.text).toBe('Ιστορικό: Μεταφέρθηκε αυτόματα από παλιά κατάσταση «Αναθεωρήθηκε» (migration Sprint 7)')
    expect(revisedMigration.isMigration).toBe(true)

    const createdMigration = describeGoalEvent(
      { type: 'created', trigger: 'migration', note: 'Συμπληρώθηκε αυτόματα κατά τη μετάβαση σε Sprint 7' },
      goal
    )
    expect(createdMigration.text).toBe('Ιστορικό: Συμπληρώθηκε αυτόματα κατά τη μετάβαση σε Sprint 7')
    expect(createdMigration.isMigration).toBe(true)
  })

  it('ΠΟΤΕ δεν διαβάζεται σαν κανονική ενέργεια εκπαιδευτικού — το text ΔΕΝ ταυτίζεται με το κανονικό statusChanged text', () => {
    const migrationEvent = describeGoalEvent({ type: 'statusChanged', trigger: 'migration', toStatus: 'active', note: 'κάτι' }, goal)
    const manualEvent = describeGoalEvent({ type: 'statusChanged', trigger: 'manual', toStatus: 'active', note: 'κάτι' }, goal)
    expect(migrationEvent.text).not.toBe(manualEvent.text)
    expect(migrationEvent.isMigration).toBe(true)
    expect(manualEvent.isMigration).toBe(false)
  })

  it('migration event χωρίς note → ασφαλές fallback κείμενο, όχι "undefined"', () => {
    const result = describeGoalEvent({ type: 'created', trigger: 'migration', note: '' }, goal)
    expect(result.text).toBe('Ιστορικό: Αυτόματη καταγραφή από παλιότερη έκδοση')
  })
})

describe('describeGoalEvent — ασφάλεια σε άγνωστο τύπο event (μελλοντική προσθήκη)', () => {
  it('άγνωστο type → ασφαλές generic fallback, ΔΕΝ πετάει exception', () => {
    expect(() => describeGoalEvent({ type: 'somethingFromTheFuture', trigger: 'manual', note: '' }, goal)).not.toThrow()
    const result = describeGoalEvent({ type: 'somethingFromTheFuture', trigger: 'manual', note: '' }, goal)
    expect(result.text).toContain('Ανάγνωση προτάσεων')
    expect(result.icon).toBeTruthy()
  })

  it('γνωστό type αλλά άγνωστο toStatus → ασφαλές fallback, όχι throw', () => {
    expect(() => describeGoalEvent({ type: 'statusChanged', trigger: 'manual', toStatus: 'somethingNew', note: '' }, goal)).not.toThrow()
    const result = describeGoalEvent({ type: 'statusChanged', trigger: 'manual', toStatus: 'somethingNew', note: '' }, goal)
    expect(result.text).toBe('Άλλαξε κατάσταση: Ανάγνωση προτάσεων')
  })

  it('goal undefined (π.χ. διαγράφηκε) → δεν πετάει, γενικός τίτλος', () => {
    expect(() => describeGoalEvent({ type: 'created', trigger: 'manual', note: '' }, undefined)).not.toThrow()
    const result = describeGoalEvent({ type: 'created', trigger: 'manual', note: '' }, undefined)
    expect(result.text).toContain('στόχος')
  })
})

describe('sortGoalEventsChronologically — ΑΠΟΚΛΕΙΣΤΙΚΑ βάσει event.at', () => {
  it('σωστή σειρά για timestamps πολύ κοντινά (ίδια μέρα, διαφορά λίγων λεπτών)', () => {
    const events = [
      { id: 1, at: '2026-07-16T10:05:00.000Z' },
      { id: 2, at: '2026-07-16T10:00:00.000Z' },
      { id: 3, at: '2026-07-16T10:02:30.000Z' }
    ]
    const asc = sortGoalEventsChronologically(events, 'asc')
    expect(asc.map((e) => e.id)).toEqual([2, 3, 1])

    const desc = sortGoalEventsChronologically(events, 'desc')
    expect(desc.map((e) => e.id)).toEqual([1, 3, 2])
  })

  it('δεν επηρεάζεται από goal.status/statusChangedAt — δεν τα διαβάζει καν, μόνο event.at', () => {
    // Goal objects με παραπλανητικά status/statusChangedAt περνιούνται, αλλά η ταξινόμηση
    // βασίζεται ΜΟΝΟ στο δικό τους events[].at — αν η υλοποίηση διάβαζε κρυφά goal.status θα
    // έσκαγε εδώ αφού δεν περνάμε καθόλου goal στη sortGoalEventsChronologically.
    const events = [
      { id: 'later', at: '2026-01-01T00:00:00.000Z' },
      { id: 'earlier', at: '2025-01-01T00:00:00.000Z' }
    ]
    const sorted = sortGoalEventsChronologically(events, 'asc')
    expect(sorted.map((e) => e.id)).toEqual(['earlier', 'later'])
  })

  it('δεν μεταλλάσσει το αρχικό array (immutable)', () => {
    const events = [{ id: 1, at: '2026-01-02T00:00:00.000Z' }, { id: 2, at: '2026-01-01T00:00:00.000Z' }]
    const original = [...events]
    sortGoalEventsChronologically(events, 'asc')
    expect(events).toEqual(original)
  })
})
