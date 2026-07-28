import { activeTable } from '../migration/activeGeneration.js'
import { computeAttentionAcrossStudents } from './goalAttention.js'
import { sessionDateMap } from './sessions.js'

// Φορτώνει το ΠΛΗΡΕΣ caseload για το widget «Χρειάζονται προσοχή» της Αρχικής (Technical Plan
// Στάδιο 13, σημείο 7) σε μαζικά queries — ΑΚΡΙΒΩΣ 5 IndexedDB operations, ΑΝΕΞΑΡΤΗΤΑ από το πόσοι
// μαθητές/στόχοι υπάρχουν (καμία query ανά μαθητή, καμία query ανά goal):
//   1. db.students.toArray()
//   2. db.goals.toArray()
//   3. db.sessions.toArray()        — μόνο για date-join μετρήσεων (sessionDateMap)
//   4. db.measurements.toArray()
//   5. db.goalEvents.toArray()
// Πλήρες φιλτράρισμα/ομαδοποίηση στη μνήμη μετά — ίδιο idiom με το ήδη υπάρχον Home.jsx
// (loadDashboardStats κάνει ακριβώς το ίδιο, πλήρες table scan + φιλτράρισμα, όχι query ανά μαθητή).
export async function loadHomeAttentionItems(today) {
  const [students, allGoals, sessions, measurements, goalEvents] = await Promise.all([
    activeTable('students').toArray(),
    activeTable('goals').toArray(),
    activeTable('sessions').toArray(),
    activeTable('measurements').toArray(),
    activeTable('goalEvents').toArray()
  ])

  // Scope (σημείο 6) — ΜΟΝΟ ενεργοί μαθητές. Τα goals achieved/archived/paused-χωρίς-pausedTooLong
  // αποκλείονται ήδη ΑΠΟ ΤΟ ΙΔΙΟ το computeAttentionAcrossStudents/computeGoalAttention (Στάδιο 8) —
  // καμία δεύτερη, παράλληλη λογική εδώ γι' αυτά.
  const activeStudents = students.filter((s) => s.active)
  const activeStudentIds = new Set(activeStudents.map((s) => s.id))
  const sessionDateById = sessionDateMap(sessions)

  const entries = activeStudents.map((s) => {
    const goals = allGoals.filter((g) => g.studentId === s.id)
    const goalIds = new Set(goals.map((g) => g.id))
    const datedMeasurements = measurements
      .filter((m) => goalIds.has(m.goalId))
      .map((m) => ({ ...m, date: sessionDateById[m.sessionId] }))
    const events = goalEvents.filter((e) => goalIds.has(e.goalId))
    return { studentId: s.id, goals, measurements: datedMeasurements, goalEvents: events }
  })

  // ΜΙΑ γραμμή ανά goal με πολλαπλούς λόγους (σημείο 2), deterministic σειρά (σημείο 3) — ΑΠΟΚΛΕΙΣΤΙΚΑ
  // το ήδη εγκεκριμένο computeAttentionAcrossStudents του Σταδίου 8, καμία νέα ταξινόμηση εδώ.
  const items = computeAttentionAcrossStudents(entries, today)

  const studentById = Object.fromEntries(activeStudents.map((s) => [s.id, s]))
  const goalById = Object.fromEntries(allGoals.filter((g) => activeStudentIds.has(g.studentId)).map((g) => [g.id, g]))

  // Επισύναψη ήδη-φορτωμένου student/goal σε κάθε item — το widget ΔΕΝ κάνει καμία δική του
  // αναζήτηση/query, μόνο rendering.
  return items.map((item) => ({ ...item, student: studentById[item.studentId], goal: goalById[item.goalId] }))
}
