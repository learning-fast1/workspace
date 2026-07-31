import { describe, expect, it } from 'vitest'
import { searchAll } from './globalSearch.js'

const students = [
  { id: 1, code: 'Μ1', nickname: 'Γιώργος', grade: 'Β Δημοτικού', active: true },
  { id: 2, code: 'Μ2', nickname: 'Μαρία', grade: 'Γ Δημοτικού', active: true },
  { id: 3, code: 'Γιώργος-αρχειοθ', nickname: null, grade: null, active: false }
]

describe('searchAll — κενό/χωρίς query', () => {
  it('κενό query → μηδενικά αποτελέσματα παντού, καμία εξαίρεση', () => {
    const result = searchAll('', { students, sessions: [], goals: [], reports: [] })
    expect(result.students.items).toHaveLength(0)
    expect(result.students.total).toBe(0)
  })
})

describe('searchAll — accent/case-insensitive (χρησιμοποιεί το ίδιο normalizeForSearch)', () => {
  it('«γιωργος» χωρίς τόνο βρίσκει το «Γιώργος»', () => {
    const result = searchAll('γιωργος', { students, sessions: [], goals: [], reports: [] })
    expect(result.students.items.some((s) => s.nickname === 'Γιώργος')).toBe(true)
  })
})

describe('searchAll — ranking μέσα σε κατηγορία (exact > starts-with > contains)', () => {
  const rankStudents = [
    { id: 1, code: 'ΑΒΓ-Μ1', nickname: null, grade: null, active: true }, // contains 'μ1'
    { id: 2, code: 'Μ1', nickname: null, grade: null, active: true }, // exact
    { id: 3, code: 'Μ10', nickname: null, grade: null, active: true } // starts-with
  ]

  it('exact πρώτο, μετά starts-with, μετά contains', () => {
    const result = searchAll('μ1', { students: rankStudents, sessions: [], goals: [], reports: [] })
    expect(result.students.items.map((s) => s.code)).toEqual(['Μ1', 'Μ10', 'ΑΒΓ-Μ1'])
  })
})

describe('searchAll — μαθητές: πεδία code/nickname/grade, περιλαμβάνει αρχειοθετημένους', () => {
  it('βρίσκει μέσω grade', () => {
    const result = searchAll('Γ Δημοτικού', { students, sessions: [], goals: [], reports: [] })
    expect(result.students.items.map((s) => s.id)).toContain(2)
  })

  it('αρχειοθετημένος μαθητής (active:false) περιλαμβάνεται στα αποτελέσματα', () => {
    const result = searchAll('αρχειοθ', { students, sessions: [], goals: [], reports: [] })
    expect(result.students.items).toHaveLength(1)
    expect(result.students.items[0].active).toBe(false)
  })
})

describe('searchAll — συνεδρίες: κωδικός/nickname μαθητή, activity, note', () => {
  const sessions = [
    { id: 1, date: '2026-07-20', studentIds: [1], activity: 'Άρθρωση φωνημάτων', note: '', status: 'completed' },
    { id: 2, date: '2026-07-21', studentIds: [2], activity: '', note: 'καλή συνεργασία σήμερα', status: 'completed' }
  ]

  it('βρίσκει μέσω activity (accent-insensitive)', () => {
    const result = searchAll('αρθρωση', { students, sessions, goals: [], reports: [] })
    expect(result.sessions.items.map((s) => s.id)).toContain(1)
  })

  it('βρίσκει μέσω note', () => {
    const result = searchAll('συνεργασια', { students, sessions, goals: [], reports: [] })
    expect(result.sessions.items.map((s) => s.id)).toContain(2)
  })

  it('βρίσκει μέσω κωδικού μαθητή της συνεδρίας', () => {
    const result = searchAll('Μ1', { students, sessions, goals: [], reports: [] })
    expect(result.sessions.items.map((s) => s.id)).toContain(1)
  })
})

describe('searchAll — στόχοι: title, domain label', () => {
  const goals = [
    { id: 1, studentId: 1, title: 'Άρθρωση /ρ/', domain: 'communication', priority: 'high', status: 'active' },
    { id: 2, studentId: 2, title: 'Ισορροπία', domain: 'mobility', priority: 'medium', status: 'active' }
  ]

  it('βρίσκει μέσω τίτλου (accent-insensitive)', () => {
    const result = searchAll('αρθρωση', { students, sessions: [], goals, reports: [] })
    expect(result.goals.items.map((g) => g.id)).toContain(1)
  })

  it('βρίσκει μέσω ετικέτας τομέα (π.χ. "Επικοινωνία")', () => {
    const result = searchAll('επικοινωνια', { students, sessions: [], goals, reports: [] })
    expect(result.goals.items.map((g) => g.id)).toContain(1)
  })
})

describe('searchAll — αναφορές: μαθητής + πλήρες κείμενο (editedText)', () => {
  const reports = [
    {
      id: 1,
      studentId: 1,
      dateFrom: '2026-01-01',
      dateTo: '2026-06-01',
      status: 'draft',
      generatedAt: '2026-06-01T10:00:00.000Z',
      editedText: '# Προσχέδιο έκθεσης\nΟ μαθητής έδειξε πρόοδο στους στόχους κινητικότητας αυτή την περίοδο.'
    }
  ]

  it('βρίσκει μέσω κωδικού μαθητή', () => {
    const result = searchAll('Μ1', { students, sessions: [], goals: [], reports })
    expect(result.reports.items).toHaveLength(1)
  })

  it('βρίσκει μέσα στο πλήρες κείμενο (editedText), accent-insensitive, με απόσπασμα', () => {
    const result = searchAll('κινητικοτητας', { students, sessions: [], goals: [], reports })
    expect(result.reports.items).toHaveLength(1)
    expect(result.reports.items[0].snippet).toMatch(/κινητικότητας/)
  })

  it('όταν το ταίριασμα είναι μέσω μαθητή (όχι κειμένου), δεν παράγεται snippet', () => {
    const result = searchAll('Μ1', { students, sessions: [], goals: [], reports })
    expect(result.reports.items[0].snippet).toBeNull()
  })
})

describe('searchAll — cap ανά κατηγορία με σωστό total', () => {
  const manyStudents = Array.from({ length: 8 }, (_, i) => ({ id: i, code: `Μαθητής${i}`, nickname: null, grade: null, active: true }))

  it('περιορίζει σε limit, αλλά το total παραμένει το πραγματικό πλήθος', () => {
    const result = searchAll('μαθητης', { students: manyStudents, sessions: [], goals: [], reports: [] }, { limit: 5 })
    expect(result.students.items).toHaveLength(5)
    expect(result.students.total).toBe(8)
  })
})

describe('searchAll — καμία αντιστοιχία', () => {
  it('query που δεν ταιριάζει με τίποτα → κενές λίστες', () => {
    const result = searchAll('ζζζζζανύπαρκτο', { students, sessions: [], goals: [], reports: [] })
    expect(result.students.total).toBe(0)
  })
})
