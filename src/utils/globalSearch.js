// Ενιαία (Google-like) global search — μία pure function πάνω σε ήδη φορτωμένα δεδομένα (καμία δική
// της Dexie query, ίδιο idiom με utils/sessions.js selectRecentActivity). Καμία αποθήκευση query
// οπουδήποτε — το state ζει αποκλειστικά στον caller (React component), ephemeral.
//
// Πεδία αναζήτησης ανά κατηγορία (ίδια με τα ήδη υπάρχοντα, live matching patterns του
// StudentList.jsx/SessionHistory.jsx — επέκταση σε goals/reports όπου δεν υπήρχε καθόλου πριν):
//   Μαθητές:   code, nickname, grade
//   Συνεδρίες: κωδικός/nickname μαθητή(ών), activity, note
//   Στόχοι:    title, domain label
//   Αναφορές:  κωδικός/nickname μαθητή, editedText (πλήρες κείμενο — βλ. τεκμηρίωση εφικτότητας
//              στο Product/Technical Proposal, naive substring scan, ρεαλιστικά λίγα MB συνολικά)
import { normalizeForSearch } from './textNormalize.js'
import { domainName } from '../config/domains.js'

const DEFAULT_LIMIT = 5

// Ranking μέσα σε κάθε κατηγορία: 0=exact, 1=starts-with, 2=contains, null=καμία αντιστοιχία.
// Το ΚΑΛΥΤΕΡΟ (μικρότερο) tier ανάμεσα σε όλα τα πεδία ενός item είναι αυτό που μετράει.
function fieldTier(fieldValue, normalizedQuery) {
  const normalizedField = normalizeForSearch(fieldValue)
  if (!normalizedField || !normalizedQuery) return null
  if (normalizedField === normalizedQuery) return 0
  if (normalizedField.startsWith(normalizedQuery)) return 1
  if (normalizedField.includes(normalizedQuery)) return 2
  return null
}

function bestTier(fieldValues, normalizedQuery) {
  let best = null
  for (const value of fieldValues) {
    const tier = fieldTier(value, normalizedQuery)
    if (tier !== null && (best === null || tier < best)) best = tier
  }
  return best
}

// Σύντομο απόσπασμα γύρω από το πρώτο σημείο ταιριάσματος μέσα σε μεγάλο κείμενο (π.χ. editedText
// αναφοράς) — ώστε το αποτέλεσμα να δείχνει ΓΙΑΤΙ ταίριαξε, όχι μόνο ΟΤΙ ταίριαξε.
const SNIPPET_RADIUS = 40
function extractSnippet(text, normalizedQuery) {
  const normalizedText = normalizeForSearch(text)
  const index = normalizedText.indexOf(normalizedQuery)
  if (index === -1) return null
  const start = Math.max(0, index - SNIPPET_RADIUS)
  const end = Math.min(text.length, index + normalizedQuery.length + SNIPPET_RADIUS)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < text.length ? '…' : ''
  return `${prefix}${text.slice(start, end).trim()}${suffix}`
}

function capWithTotal(items, limit) {
  return { items: items.slice(0, limit), total: items.length }
}

function searchStudents(students, normalizedQuery) {
  const scored = []
  for (const s of students) {
    const tier = bestTier([s.code, s.nickname, s.grade], normalizedQuery)
    if (tier !== null) scored.push({ id: s.id, code: s.code, nickname: s.nickname, active: s.active, tier })
  }
  scored.sort((a, b) => a.tier - b.tier || (a.code || '').localeCompare(b.code || ''))
  return scored
}

function searchSessions(sessions, studentById, normalizedQuery) {
  const scored = []
  for (const s of sessions) {
    const students = (s.studentIds || []).map((id) => studentById[id]).filter(Boolean)
    const studentFields = students.flatMap((st) => [st.code, st.nickname])
    const tier = bestTier([...studentFields, s.activity, s.note], normalizedQuery)
    if (tier === null) continue
    scored.push({
      id: s.id,
      date: s.date,
      studentIds: s.studentIds || [],
      studentLabel: students.map((st) => st.code).filter(Boolean).join(', ') || '—',
      activity: s.activity || null,
      note: s.note || null,
      tier
    })
  }
  scored.sort((a, b) => a.tier - b.tier || (b.date || '').localeCompare(a.date || ''))
  return scored
}

function searchGoals(goals, studentById, normalizedQuery) {
  const scored = []
  for (const g of goals) {
    const domainLabel = g.domain ? domainName(g.domain) : null
    const tier = bestTier([g.title, domainLabel], normalizedQuery)
    if (tier === null) continue
    scored.push({
      id: g.id,
      studentId: g.studentId,
      studentCode: studentById[g.studentId]?.code || '—',
      title: g.title,
      domainLabel,
      priority: g.priority,
      status: g.status,
      tier
    })
  }
  scored.sort((a, b) => a.tier - b.tier || (a.title || '').localeCompare(b.title || ''))
  return scored
}

function searchReports(reports, studentById, normalizedQuery) {
  const scored = []
  for (const r of reports) {
    const student = studentById[r.studentId]
    const studentFields = student ? [student.code, student.nickname] : []
    const tier = bestTier([...studentFields, r.editedText], normalizedQuery)
    if (tier === null) continue
    const matchedStudentField = bestTier(studentFields, normalizedQuery) !== null
    scored.push({
      id: r.id,
      studentId: r.studentId,
      studentCode: student?.code || '—',
      dateFrom: r.dateFrom,
      dateTo: r.dateTo,
      status: r.status,
      snippet: matchedStudentField ? null : extractSnippet(r.editedText || '', normalizedQuery),
      tier
    })
  }
  scored.sort((a, b) => a.tier - b.tier || (b.generatedAt || '').localeCompare(a.generatedAt || ''))
  return scored
}

// students/sessions/goals/reports: ήδη φορτωμένοι πίνακες (activeTable(...).toArray(), ένα batched
// Promise.all στον caller — καμία δική του query εδώ). limit: αποτελέσματα ανά κατηγορία πριν το
// «Δες όλα» (το `total` επιστρέφεται πάντα πλήρες, ανεξάρτητα από το cap).
export function searchAll(query, { students = [], sessions = [], goals = [], reports = [] }, { limit = DEFAULT_LIMIT } = {}) {
  const normalizedQuery = normalizeForSearch(query)
  if (!normalizedQuery) {
    return {
      query,
      students: { items: [], total: 0 },
      sessions: { items: [], total: 0 },
      goals: { items: [], total: 0 },
      reports: { items: [], total: 0 }
    }
  }

  const studentById = Object.fromEntries(students.map((s) => [s.id, s]))

  return {
    query,
    students: capWithTotal(searchStudents(students, normalizedQuery), limit),
    sessions: capWithTotal(searchSessions(sessions, studentById, normalizedQuery), limit),
    goals: capWithTotal(searchGoals(goals, studentById, normalizedQuery), limit),
    reports: capWithTotal(searchReports(reports, studentById, normalizedQuery), limit)
  }
}
