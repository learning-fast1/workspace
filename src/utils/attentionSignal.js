import { sessionDateMap } from './sessions.js'
import { NEGATIVE_MOODS } from '../config/moodOptions.js'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const STALE_GOAL_DAYS = 14
const MOOD_STREAK_LENGTH = 2
const MILESTONE_RECENCY_DAYS = 7
const ABSENCE_STREAK_LENGTH = 2

// Η ΜΟΝΑΔΙΚΗ πηγή αλήθειας για «ένα σημείο προσοχής ανά μαθητή» (Sprint 5 Product Design) — κάθε
// σημερινό ΚΑΙ μελλοντικό σημείο της εφαρμογής που θέλει να επισημάνει κάτι σε μαθητή περνάει από
// εδώ, όχι από τοπική λογική στην κάθε οθόνη. Σειρά προτεραιότητας (η πρώτη που ισχύει κερδίζει —
// ΠΟΤΕ περισσότερες από μία ταυτόχρονα):
//   1. Πρόσφατο μοτίβο δύσκολης διάθεσης
//   2. Στόχος χωρίς μέτρηση πολύ καιρό
//   3. Πρόσφατη σημαντική παρατήρηση (milestone)
//   4. Μοτίβο απουσιών
// Αρχική, λογική υπόθεση για τη σειρά — όχι κλειδωμένη επιστημονικά· αναθεωρείται μετά από
// πραγματική χρήση αν χρειαστεί, όχι με εικασία.
//
// Παίρνει ήδη φορτωμένα δεδομένα (goals/sessions/measurements/observations) — καμία δική της
// Dexie query, ίδιο μοτίβο με το υπόλοιπο utils/. Επιστρέφει { type, label } ή null.
export function attentionSignalForStudent(studentId, { goals, sessions, measurements, observations }) {
  return (
    detectMoodPattern(studentId, sessions) ||
    detectStaleGoal(studentId, goals, sessions, measurements) ||
    detectMilestone(studentId, observations) ||
    detectAbsencePattern(studentId, sessions) ||
    null
  )
}

function studentSessionsMostRecentFirst(studentId, sessions) {
  return sessions
    .filter((s) => s.studentIds?.includes(studentId))
    .sort((a, b) => b.date.localeCompare(a.date))
}

function detectMoodPattern(studentId, sessions) {
  const recentMoods = studentSessionsMostRecentFirst(studentId, sessions)
    .filter((s) => !s.absentStudentIds?.includes(studentId))
    .map((s) => s.moods?.[studentId])
    .filter(Boolean)
    .slice(0, MOOD_STREAK_LENGTH)

  if (recentMoods.length === MOOD_STREAK_LENGTH && recentMoods.every((m) => NEGATIVE_MOODS.includes(m))) {
    return { type: 'mood', label: `${MOOD_STREAK_LENGTH} συνεχόμενες συνεδρίες με δύσκολη διάθεση` }
  }
  return null
}

// Ίδιο κριτήριο «χωρίς μέτρηση» με το Home.jsx (findStaleGoals) — reference date = τελευταία
// μέτρηση, αλλιώς ημερομηνία έναρξης. Σκόπιμα ξεχωριστός, μικρός υπολογισμός εδώ (όχι import από
// το Home.jsx) — το Home.jsx κάνει global σάρωση για όλους τους μαθητές (διαφορετική ανάγκη), ενώ
// εδώ χρειαζόμαστε μόνο τον χειρότερο ενεργό στόχο ΕΝΟΣ μαθητή.
function detectStaleGoal(studentId, goals, sessions, measurements) {
  const sessionDateById = sessionDateMap(sessions)
  const activeGoals = goals.filter((g) => g.studentId === studentId && g.status === 'active')
  const today = new Date()

  let staleGoal = null
  let maxDays = 0
  for (const g of activeGoals) {
    const measuredDates = measurements
      .filter((m) => m.goalId === g.id)
      .map((m) => sessionDateById[m.sessionId])
      .filter(Boolean)
      .sort()
    const referenceDate = measuredDates[measuredDates.length - 1] || g.startDate
    if (!referenceDate) continue
    const days = Math.floor((today - new Date(referenceDate)) / MS_PER_DAY)
    if (days > STALE_GOAL_DAYS && days > maxDays) {
      maxDays = days
      staleGoal = g
    }
  }
  return staleGoal ? { type: 'stale-goal', label: `«${staleGoal.title}» χωρίς μέτρηση ${maxDays} μέρες` } : null
}

function detectMilestone(studentId, observations) {
  const today = new Date()
  const recentMilestone = observations
    .filter((o) => o.studentId === studentId && o.milestone)
    .sort((a, b) => b.date.localeCompare(a.date))[0]
  if (!recentMilestone) return null
  const days = Math.floor((today - new Date(recentMilestone.date)) / MS_PER_DAY)
  if (days > MILESTONE_RECENCY_DAYS) return null
  return { type: 'milestone', label: recentMilestone.text }
}

// «Απών» εδώ σημαίνει είτε σημειωμένος απών μέσα σε μια ομαδική συνεδρία που ΕΓΙΝΕ
// (absentStudentIds) είτε μια ολόκληρη προγραμματισμένη εμφάνιση που καταγράφηκε απευθείας ως
// notHeld (Sprint 6, βλ. db.js recordSessionNotHeld) — και οι δύο περιπτώσεις είναι το ίδιο
// πραγματικό μοτίβο («δεν είδα αυτόν τον μαθητή»), απλά διαφορετική προέλευση εγγραφής.
function detectAbsencePattern(studentId, sessions) {
  const recent = studentSessionsMostRecentFirst(studentId, sessions).slice(0, ABSENCE_STREAK_LENGTH)
  const wasAbsent = (s) => s.absentStudentIds?.includes(studentId) || s.status === 'notHeld'
  if (recent.length === ABSENCE_STREAK_LENGTH && recent.every(wasAbsent)) {
    return { type: 'absence', label: `Απών τις τελευταίες ${ABSENCE_STREAK_LENGTH} συνεδρίες` }
  }
  return null
}
