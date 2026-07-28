import { describe, expect, it } from 'vitest'
import { findExistingEntryStatus, existingEntryStatusLabel, addToQueueLinks } from './dailyQueue.js'

// Regression tests για το bug (Sprint 6, δεύτερος γύρος διορθώσεων): «Έκτακτη ατομική/ομαδική»
// επέτρεπε σιωπηλά δεύτερη γραμμή για μαθητή/ομάδα που ήδη είχε σημερινή εμφάνιση. Το
// findExistingEntryStatus είναι η καθαρή συνάρτηση πίσω από τον έλεγχο — καθαρά unit tests, χωρίς
// Dexie/UI.
describe('findExistingEntryStatus', () => {
  it('εντοπίζει ήδη pending προγραμματισμένη γραμμή για τον ίδιο μαθητή', () => {
    const entries = [{ id: 1, studentIds: [1], status: 'pending' }]
    const result = findExistingEntryStatus([1], entries, [])
    expect(result).toEqual({ status: 'pending', entry: entries[0] })
    expect(existingEntryStatusLabel(result.status)).toBe('Ήδη στη μέρα μου')
  })

  it('εντοπίζει ήδη skipped γραμμή', () => {
    const entries = [{ id: 1, studentIds: [1], status: 'skipped' }]
    const result = findExistingEntryStatus([1], entries, [])
    expect(result.status).toBe('skipped')
    expect(existingEntryStatusLabel(result.status)).toBe('Παραλείφθηκε σήμερα')
  })

  it('εντοπίζει ήδη notHeld γραμμή (μέσω matching session)', () => {
    const entries = [{ id: 1, studentIds: [1], status: 'pending' }]
    const sessions = [{ studentIds: [1], status: 'notHeld' }]
    const result = findExistingEntryStatus([1], entries, sessions)
    expect(result.status).toBe('notHeld')
    expect(existingEntryStatusLabel(result.status)).toBe('Δεν πραγματοποιήθηκε')
  })

  it('εντοπίζει ήδη completed γραμμή (μέσω matching session)', () => {
    const entries = [{ id: 1, studentIds: [1], status: 'pending' }]
    const sessions = [{ studentIds: [1], status: 'completed' }]
    const result = findExistingEntryStatus([1], entries, sessions)
    expect(result.status).toBe('completed')
    expect(existingEntryStatusLabel(result.status)).toBe('Ολοκληρώθηκε ήδη σήμερα')
  })

  it('εντοπίζει ίδια ομάδα ΑΝΕΞΑΡΤΗΤΑ από τη σειρά των studentIds', () => {
    const entries = [{ id: 1, studentIds: [3, 1, 2], status: 'pending' }]
    const result = findExistingEntryStatus([1, 2, 3], entries, [])
    expect(result).not.toBeNull()
    expect(result.entry.id).toBe(1)
  })

  it('ΔΕΝ μπλοκάρει διαφορετική ομάδα με μερική επικάλυψη μαθητών', () => {
    const entries = [{ id: 1, studentIds: [1, 2], status: 'pending' }]
    const result = findExistingEntryStatus([1, 3], entries, []) // μοιράζεται μόνο τον μαθητή 1
    expect(result).toBeNull()
  })

  it('εντοπίζει ήδη υπάρχουσα ΕΚΤΑΚΤΗ (unplanned) συνεδρία εκτός ουράς', () => {
    const sessions = [{ studentIds: [1, 2], status: 'completed' }]
    const result = findExistingEntryStatus([1, 2], [], sessions)
    expect(result.status).toBe('completed')
  })

  it('επιστρέφει null όταν πραγματικά δεν υπάρχει τίποτα αντίστοιχο', () => {
    const entries = [{ id: 1, studentIds: [1], status: 'pending' }]
    const result = findExistingEntryStatus([2], entries, [])
    expect(result).toBeNull()
  })
})

// Product Design (feedback χρήστη): «Η μέρα μου» έδειχνε ΤΑΥΤΟΧΡΟΝΑ πληροφορία ΚΑΙ ενέργειες
// («Έκτακτη ατομική/ομαδική» μέσα στην ίδια κάρτα) — οι ενέργειες μετακινήθηκαν εκτός του
// TodayQueue.jsx (Home.jsx/DayDetailPage.jsx τις αποδίδουν πλέον οι ίδιοι). Αυτό εδώ είναι η ΜΙΑ
// πηγή αλήθειας για τα δύο URLs, ώστε οι δύο callers να μη γράψουν αποκλίνουσες εκδοχές.
describe('addToQueueLinks', () => {
  it('σήμερα (date === today) → καθαρά URLs, χωρίς query param', () => {
    expect(addToQueueLinks('2026-07-21', '2026-07-21')).toEqual({
      individual: '/today/add-individual',
      group: '/today/add-group'
    })
  })

  it('άλλη μέρα (date !== today) → URLs με ?date=', () => {
    expect(addToQueueLinks('2026-07-25', '2026-07-21')).toEqual({
      individual: '/today/add-individual?date=2026-07-25',
      group: '/today/add-group?date=2026-07-25'
    })
  })
})
