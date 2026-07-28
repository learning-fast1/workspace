import { activeTable } from '../migration/activeGeneration.js'
import { addDays } from './date.js'
import { sessionDateMap } from './sessions.js'
import {
  UNRESOLVED_ENTRY_LOOKBACK_DAYS,
  groupByStudentIdField,
  groupEntriesByStudentId,
  groupSessionsByDate
} from './queueAttention.js'
import { categorizeNotifications, computeCandidateNotifications } from './notificationEngine.js'

// Φορτώνει ΟΛΑ όσα χρειάζεται ο notification engine για ΟΛΟΚΛΗΡΟ το caseload σε μαζικά queries
// (Smart Notifications, review χρήστη) — ΑΝΤΙΚΑΘΙΣΤΑ το πρώην utils/homeAttentionData.js (η
// goal-level έξοδος εκείνου είναι πλέον γνήσιο υποσύνολο αυτής εδώ). ΑΚΡΙΒΩΣ 8 IndexedDB
// operations, ΑΝΕΞΑΡΤΗΤΑ από caseload size — καμία query ανά μαθητή/goal:
//   1. students · 2. goals · 3. sessions (whole-table — date-join μετρήσεων ΚΑΙ unresolved-session
//   filtering) · 4. measurements · 5. goalEvents · 6. reports · 7. bounded dailyQueue past-window
//   (ίδιο lookback με utils/queueAttention.js) · 8. notificationState (persisted dismiss/snooze)
//
// Notifications Inbox (review χρήστη) — ΜΙΑ φόρτωση εξυπηρετεί ΚΑΙ το Header (visible count) ΚΑΙ
// το Home widget (visible items) ΚΑΙ το Inbox (visible + snoozed) μέσω του κοινού
// NotificationsProvider (shell/NotificationsProvider.jsx) — αυτή η συνάρτηση δεν ξέρει τίποτα γι'
// αυτό, απλά επιστρέφει και τα δύο σύνολα μία φορά.
export async function loadNotificationCategories(today) {
  const lookbackStart = addDays(today, -UNRESOLVED_ENTRY_LOOKBACK_DAYS)
  const [students, allGoals, sessions, measurements, goalEvents, reports, pastEntries, notificationStateRows] = await Promise.all([
    activeTable('students').toArray(),
    activeTable('goals').toArray(),
    activeTable('sessions').toArray(),
    activeTable('measurements').toArray(),
    activeTable('goalEvents').toArray(),
    activeTable('reports').toArray(),
    activeTable('dailyQueue').where('date').between(lookbackStart, today, true, false).toArray(),
    activeTable('notificationState').toArray()
  ])

  // Scope — ΜΟΝΟ ενεργοί μαθητές (ίδιο σκεπτικό με το πρώην homeAttentionData.js): τα goals
  // achieved/archived/paused-χωρίς-pausedTooLong αποκλείονται ήδη ΑΠΟ ΤΟ ΙΔΙΟ το
  // notificationEngine.js/goalAttention.js — καμία δεύτερη, παράλληλη λογική εδώ γι' αυτά.
  const activeStudents = students.filter((s) => s.active)

  const sessionDateById = sessionDateMap(sessions)
  const datedMeasurements = measurements.map((m) => ({ ...m, date: sessionDateById[m.sessionId] }))
  const goalsByStudentId = groupByStudentIdField(allGoals)
  const reportsByStudentId = groupByStudentIdField(reports)
  const pastEntriesByStudentId = groupEntriesByStudentId(pastEntries)
  const sessionsByDate = groupSessionsByDate(sessions)

  const entries = activeStudents.map((s) => {
    const goals = goalsByStudentId[s.id] || []
    const datedMeasurementsByGoalId = {}
    const goalEventsByGoalId = {}
    for (const g of goals) {
      datedMeasurementsByGoalId[g.id] = datedMeasurements.filter((m) => m.goalId === g.id)
      goalEventsByGoalId[g.id] = goalEvents.filter((e) => e.goalId === g.id)
    }
    return {
      studentId: s.id,
      goals,
      datedMeasurementsByGoalId,
      goalEventsByGoalId,
      reports: reportsByStudentId[s.id] || [],
      pastEntries: pastEntriesByStudentId[s.id] || []
    }
  })

  const candidates = computeCandidateNotifications(entries, { sessionsByDate, today })
  const notificationStateById = Object.fromEntries(notificationStateRows.map((r) => [r.id, r]))
  const { visible, snoozed } = categorizeNotifications(candidates, notificationStateById, today)

  // Επισύναψη ήδη-φορτωμένου student σε κάθε notification — ο καταναλωτής (Provider/widget/Inbox)
  // ΔΕΝ κάνει καμία δική του αναζήτηση/query, μόνο rendering (ίδιο idiom με το πρώην
  // homeAttentionData.js). Το student filter του Inbox (review χρήστη, σημείο 4) χρειάζεται την
  // ΕΝΩΣΗ visible+snoozed — γι' αυτό επισυνάπτεται και στα δύο σύνολα εδώ, μία φορά.
  const studentById = Object.fromEntries(activeStudents.map((s) => [s.id, s]))
  const attachStudent = (n) => ({ ...n, student: studentById[n.studentId] })

  // candidateIds: ΟΛΟΙ οι ζωντανά υπολογισμένοι ids (πριν το dismiss/snooze φιλτράρισμα) — ΟΧΙ
  // μόνο οι ορατοί. Ο caller τα χρειάζεται ΑΠΟΚΛΕΙΣΤΙΚΑ για cleanupOrphanedNotificationState (βλ.
  // db.js) — ΠΟΤΕ για rendering. Ένα dismissed/snoozed notification παραμένει «έγκυρο» εδώ, δεν
  // πρέπει να καθαριστεί το state row του απλά επειδή δεν είναι ορατό αυτή τη στιγμή.
  return {
    visible: visible.map(attachStudent),
    snoozed: snoozed.map(attachStudent),
    candidateIds: candidates.map((n) => n.id)
  }
}
