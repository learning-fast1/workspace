import { describe, expect, it } from 'vitest'
import { schoolYearToDateRange, wasGoalLiveDuringRange, sortSchoolYearsByStartDate } from './schoolYearFilter.js'

describe('schoolYearToDateRange (Technical Plan Στάδιο 11, σημείο 1)', () => {
  it('μετατρέπει σχολικό έτος σε {dateFrom, dateTo} — καμία άλλη λογική', () => {
    expect(schoolYearToDateRange({ id: 1, label: '2026-2027', startDate: '2026-09-01', endDate: '2027-06-30' }))
      .toEqual({ dateFrom: '2026-09-01', dateTo: '2027-06-30' })
  })
})

// Bugfix (πραγματικό browser smoke test, κλείσιμο Sprint 7) — βλ. db.test.js «listSchoolYears» για
// το integration-level regression test πάνω στην πραγματική Dexie query.
describe('sortSchoolYearsByStartDate', () => {
  it('ταξινομεί αύξουσα κατά startDate, ανεξάρτητα από τη σειρά εισόδου', () => {
    const years = [
      { id: 3, startDate: '2027-09-01' },
      { id: 1, startDate: '2025-09-01' },
      { id: 2, startDate: '2026-09-01' }
    ]
    expect(sortSchoolYearsByStartDate(years).map((y) => y.id)).toEqual([1, 2, 3])
  })

  it('ΔΕΝ μεταλλάσσει το input array (immutable, όχι in-place sort)', () => {
    const years = [{ id: 2, startDate: '2026-09-01' }, { id: 1, startDate: '2025-09-01' }]
    const snapshot = JSON.stringify(years)
    sortSchoolYearsByStartDate(years)
    expect(JSON.stringify(years)).toBe(snapshot)
  })

  it('άδειο array → άδειο array', () => {
    expect(sortSchoolYearsByStartDate([])).toEqual([])
  })
})

describe('wasGoalLiveDuringRange (Technical Plan Στάδιο 11, σημείο 6)', () => {
  function createdEvent(at) {
    return { type: 'created', at, toStatus: 'active' }
  }
  function statusEvent(at, toStatus) {
    return { type: 'statusChanged', at, toStatus }
  }

  it('goal ενεργός καθ\' όλη τη διάρκεια του εύρους → true', () => {
    const goal = { status: 'active', startDate: '2025-01-01' }
    const events = [createdEvent('2025-01-01T00:00:00.000Z')]
    expect(wasGoalLiveDuringRange(goal, events, '2026-09-01', '2027-06-30')).toBe(true)
  })

  it('archived ΣΗΜΕΡΑ αλλά ήταν active μέσα στο επιλεγμένο ιστορικό έτος → true (σημείο 6, το βασικό σενάριο)', () => {
    const goal = { status: 'archived', startDate: '2025-01-01' }
    const events = [
      createdEvent('2025-01-01T00:00:00.000Z'),
      statusEvent('2027-08-01T00:00:00.000Z', 'archived') // αρχειοθετήθηκε ΜΕΤΑ το έτος 2026-2027
    ]
    expect(wasGoalLiveDuringRange(goal, events, '2026-09-01', '2027-06-30')).toBe(true)
  })

  it('goal που δημιουργήθηκε ΜΕΤΑ το εύρος → false', () => {
    const goal = { status: 'active', startDate: '2027-09-10' }
    const events = [createdEvent('2027-09-10T00:00:00.000Z')]
    expect(wasGoalLiveDuringRange(goal, events, '2026-09-01', '2027-06-30')).toBe(false)
  })

  it('goal αρχειοθετημένο ΠΡΙΝ ξεκινήσει το εύρος → false', () => {
    const goal = { status: 'archived', startDate: '2020-01-01' }
    const events = [
      createdEvent('2020-01-01T00:00:00.000Z'),
      statusEvent('2021-01-01T00:00:00.000Z', 'archived')
    ]
    expect(wasGoalLiveDuringRange(goal, events, '2026-09-01', '2027-06-30')).toBe(false)
  })

  it('paused μέσα στο εύρος μετράει ως ζωντανό (ίδιο σύνολο με LIVE_STATUSES του GoalsList)', () => {
    const goal = { status: 'paused', startDate: '2026-01-01' }
    const events = [
      createdEvent('2026-01-01T00:00:00.000Z'),
      statusEvent('2026-10-01T00:00:00.000Z', 'paused')
    ]
    expect(wasGoalLiveDuringRange(goal, events, '2026-09-01', '2027-06-30')).toBe(true)
  })

  it('achieved goal ΠΟΤΕ δεν μετράει ως ζωντανό, ακόμα κι αν επικαλύπτεται χρονικά', () => {
    const goal = { status: 'achieved', startDate: '2026-01-01' }
    const events = [
      createdEvent('2026-01-01T00:00:00.000Z'),
      statusEvent('2026-10-01T00:00:00.000Z', 'achieved')
    ]
    // Το διάστημα [2026-01-01, 2026-10-01) ΕΙΝΑΙ active, μέσα στο εύρος — άρα ΠΡΕΠΕΙ να είναι true
    // (ήταν ζωντανό ΠΡΙΝ ολοκληρωθεί), το achieved διάστημα μετά δεν μετράει καθόλου.
    expect(wasGoalLiveDuringRange(goal, events, '2026-09-01', '2027-06-30')).toBe(true)
  })

  it('goal που ΠΑΝΤΑ ήταν achieved (created→achieved αμέσως, ποτέ active μέσα στο εύρος) → false', () => {
    // Δημιουργήθηκε ΚΑΙ ολοκληρώθηκε πριν καν ξεκινήσει το επιλεγμένο έτος.
    const goal = { status: 'achieved', startDate: '2020-01-01' }
    const events = [
      createdEvent('2020-01-01T00:00:00.000Z'),
      statusEvent('2020-02-01T00:00:00.000Z', 'achieved')
    ]
    expect(wasGoalLiveDuringRange(goal, events, '2026-09-01', '2027-06-30')).toBe(false)
  })

  it('πολλαπλές μεταβάσεις — ζωντανό ΞΑΝΑ μέσα στο εύρος μετά από ενδιάμεση παύση/επανενεργοποίηση', () => {
    const goal = { status: 'active', startDate: '2025-01-01' }
    const events = [
      createdEvent('2025-01-01T00:00:00.000Z'),
      statusEvent('2026-01-01T00:00:00.000Z', 'archived'),
      statusEvent('2026-12-01T00:00:00.000Z', 'active') // επανενεργοποιήθηκε ΜΕΣΑ στο εύρος
    ]
    expect(wasGoalLiveDuringRange(goal, events, '2026-09-01', '2027-06-30')).toBe(true)
  })

  it('ακριβώς στα άκρα του εύρους (ημέρα έναρξης/λήξης του status) μετράει ως επικάλυψη', () => {
    const goal = { status: 'active', startDate: '2026-09-01' }
    const events = [createdEvent('2026-09-01T00:00:00.000Z')]
    expect(wasGoalLiveDuringRange(goal, events, '2026-09-01', '2027-06-30')).toBe(true)
  })

  it('goal χωρίς ΚΑΝΕΝΑ event (αμυντικό fallback) → βασίζεται στην τρέχουσα κατάσταση', () => {
    expect(wasGoalLiveDuringRange({ status: 'active', startDate: '2020-01-01' }, [], '2026-09-01', '2027-06-30')).toBe(true)
    expect(wasGoalLiveDuringRange({ status: 'archived', startDate: '2020-01-01' }, [], '2026-09-01', '2027-06-30')).toBe(false)
  })

  it('ΔΕΝ μεταλλάσσει το goalEvents array (ούτε in-place sort)', () => {
    const events = [statusEvent('2026-10-01T00:00:00.000Z', 'active'), createdEvent('2025-01-01T00:00:00.000Z')]
    const snapshot = JSON.stringify(events)
    wasGoalLiveDuringRange({ status: 'active', startDate: '2025-01-01' }, events, '2026-09-01', '2027-06-30')
    expect(JSON.stringify(events)).toBe(snapshot)
  })
})
