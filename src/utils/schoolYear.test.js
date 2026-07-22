import { describe, expect, it } from 'vitest'
import { suggestSchoolYearDates, suggestSchoolYearLabel } from './schoolYear.js'

describe('suggestSchoolYearDates / suggestSchoolYearLabel (Technical Plan Στάδιο 10, σημείο 10)', () => {
  it('μήνες Ιανουάριος–Αύγουστος ανήκουν στο έτος που ξεκίνησε τον προηγούμενο Σεπτέμβριο', () => {
    const cases = [
      new Date(2026, 0, 15), // Ιανουάριος
      new Date(2026, 3, 1), // Απρίλιος
      new Date(2026, 6, 15), // Ιούλιος
      new Date(2026, 7, 31) // Αύγουστος
    ]
    for (const today of cases) {
      expect(suggestSchoolYearDates(today)).toEqual({ startDate: '2025-09-01', endDate: '2026-06-30' })
      expect(suggestSchoolYearLabel(today)).toBe('2025-2026')
    }
  })

  it('μήνες Σεπτέμβριος–Δεκέμβριος ανήκουν στο έτος που μόλις ξεκίνησε', () => {
    const cases = [
      new Date(2026, 8, 1), // Σεπτέμβριος
      new Date(2026, 9, 15), // Οκτώβριος
      new Date(2026, 11, 31) // Δεκέμβριος
    ]
    for (const today of cases) {
      expect(suggestSchoolYearDates(today)).toEqual({ startDate: '2026-09-01', endDate: '2027-06-30' })
      expect(suggestSchoolYearLabel(today)).toBe('2026-2027')
    }
  })

  it('έγκυρο format YYYY-YYYY, διαδοχικά έτη', () => {
    const label = suggestSchoolYearLabel(new Date(2026, 9, 1))
    expect(label).toMatch(/^\d{4}-\d{4}$/)
    const [a, b] = label.split('-').map(Number)
    expect(b).toBe(a + 1)
  })

  it('deterministic — ίδιο today, ίδιο αποτέλεσμα κάθε φορά', () => {
    const today = new Date(2026, 6, 15)
    expect(suggestSchoolYearDates(today)).toEqual(suggestSchoolYearDates(today))
    expect(suggestSchoolYearLabel(today)).toBe(suggestSchoolYearLabel(today))
  })

  it('το label προκύπτει ΑΠΟ τις ίδιες ημερομηνίες, όχι ανεξάρτητα (πάντα σε συμφωνία)', () => {
    for (let month = 0; month < 12; month++) {
      const today = new Date(2026, month, 10)
      const { startDate } = suggestSchoolYearDates(today)
      const startYear = Number(startDate.slice(0, 4))
      expect(suggestSchoolYearLabel(today)).toBe(`${startYear}-${startYear + 1}`)
    }
  })

  it('όριο έτους: 31 Αυγούστου vs 1 Σεπτεμβρίου δίνουν διαφορετικό, σωστό αποτέλεσμα', () => {
    expect(suggestSchoolYearLabel(new Date(2026, 7, 31))).toBe('2025-2026')
    expect(suggestSchoolYearLabel(new Date(2026, 8, 1))).toBe('2026-2027')
  })
})
