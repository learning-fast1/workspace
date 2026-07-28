import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, CalendarClock, CircleCheck, ClipboardList, PauseCircle, PlayCircle, Sparkles, Target, TrendingUp } from 'lucide-react'
import { activeTable } from '../migration/activeGeneration.js'
import { todayLocalISO } from '../utils/date.js'
import { isEntryDone } from '../utils/dailyQueue.js'
import { sessionDateMap } from '../utils/sessions.js'
import { computeGoalAttention } from '../utils/goalAttention.js'
import { measurementUnitLabel } from '../utils/measurementValue.js'
import { domainName } from '../config/domains.js'
import {
  computeTodaysPlanGoals, computeGoalPriorityReason, computeGoalSessionDelta, computeNextBestAction
} from '../utils/studentDashboard.js'
import Card from './ui/Card.jsx'
import Button from './ui/Button.jsx'
import './StudentDashboardPanel.css'

const NEXT_ACTION_ICON = {
  startSession: PlayCircle,
  reviewCompletion: CircleCheck,
  recordMeasurement: ClipboardList,
  createFirstGoal: Target,
  allCaughtUp: Sparkles
}

const ATTENTION_REASON_ICON = {
  stale: CalendarClock,
  nearCriterion: TrendingUp,
  pausedTooLong: PauseCircle
}

// Φορτώνει ΟΛΑ όσα χρειάζεται το panel σε μαζικά queries (Technical Plan Στάδιο 12, σημείο 8) —
// ΑΚΡΙΒΩΣ 5 IndexedDB operations, ΑΝΕΞΑΡΤΗΤΑ από το πόσους στόχους έχει ο μαθητής (καμία query
// ανά στόχο):
//   1. db.goals.where('studentId').equals(studentId).toArray()
//   2. db.sessions.toArray()                    — date-join μετρήσεων ΚΑΙ σημερινές συνεδρίες
//   3. db.dailyQueue.where('date').equals(today).toArray()
//   4. db.measurements.where('studentId').equals(studentId).toArray()
//   5. db.goalEvents.where('goalId').anyOf(goalIds).toArray()  (0 queries αν goalIds.length === 0)
// Οι pure functions του utils/studentDashboard.js κάνουν ΟΛΗ την aggregation στη μνήμη μετά.
async function loadDashboardData(studentId) {
  const today = todayLocalISO()
  const [goals, sessions, todayQueueEntries] = await Promise.all([
    activeTable('goals').where('studentId').equals(studentId).toArray(),
    activeTable('sessions').toArray(),
    activeTable('dailyQueue').where('date').equals(today).toArray()
  ])
  const goalIds = goals.map((g) => g.id)
  const [measurements, goalEvents] = await Promise.all([
    activeTable('measurements').where('studentId').equals(studentId).toArray(),
    goalIds.length > 0 ? activeTable('goalEvents').where('goalId').anyOf(goalIds).toArray() : Promise.resolve([])
  ])

  const sessionDateById = sessionDateMap(sessions)
  const todaySessions = sessions.filter((s) => s.date === today)

  const datedMeasurementsByGoalId = {}
  const goalEventsByGoalId = {}
  for (const g of goals) {
    datedMeasurementsByGoalId[g.id] = measurements
      .filter((m) => m.goalId === g.id)
      .map((m) => ({ ...m, date: sessionDateById[m.sessionId] }))
    goalEventsByGoalId[g.id] = goalEvents.filter((e) => e.goalId === g.id)
  }

  // «Σημερινή συνεδρία ανολοκλήρωτη» (σημείο 3, κανόνας 1) — ίδιο idiom με TodayQueue.jsx:
  // isEntryDone(entry, todaySessions) αποφασίζει αν μια γραμμή ουράς έχει ήδη πραγματική συνεδρία,
  // ΚΑΜΙΑ δική μας δεύτερη λογική «ολοκλήρωσης».
  const myEntries = todayQueueEntries.filter((e) => e.studentIds.includes(studentId) && e.status !== 'skipped')
  let hasIncompleteSessionToday = false
  let todaySessionStudentIds = null
  for (const entry of myEntries) {
    if (!isEntryDone(entry, todaySessions)) {
      hasIncompleteSessionToday = true
      todaySessionStudentIds = entry.studentIds
      break
    }
  }

  return {
    goals,
    datedMeasurementsByGoalId,
    goalEventsByGoalId,
    hasIncompleteSessionToday,
    todaySessionStudentIds,
    hasSessionToday: myEntries.length > 0
  }
}

function formatDeltaValue(goal, value) {
  const unit = measurementUnitLabel(goal.measurementType)
  return unit === '%' ? `${value}%` : `${value} ${unit}`
}

// Panel-αντικατάσταση των 4 στατιστικών καρτών του StudentProfileHero (Technical Plan Στάδιο 12) —
// απαντά 5 συγκεκριμένες ερωτήσεις (σημείο 2) γύρω από ΜΙΑ κυρίαρχη ενέργεια (σημείο 3). Καθαρά
// presentational πάνω στα structured αποτελέσματα του utils/studentDashboard.js/goalAttention.js —
// καμία επιχειρησιακή λογική εδώ μέσα (σημεία 3/6).
export default function StudentDashboardPanel({ studentId, focusGoalId }) {
  const navigate = useNavigate()
  const sectionRef = useRef(null)
  // Προσωρινή οπτική επισήμανση της γραμμής/goal που έφερε τον χρήστη εδώ από το widget της
  // Αρχικής (Technical Plan Στάδιο 13, σημείο 5) — ΕΝΙΣΧΥΣΗ πάνω στο ασφαλές fallback (το panel
  // είναι ήδη η πρώτη ενότητα μετά το Hero, άρα ήδη ορατό ακόμα κι αν χαθεί το focusGoalId).
  const [highlightedGoalId, setHighlightedGoalId] = useState(null)

  const data = useLiveQuery(async () => {
    try {
      const result = await loadDashboardData(studentId)
      return { status: 'ok', ...result }
    } catch (err) {
      return { status: 'error', message: err?.message || 'Δεν ήταν δυνατή η φόρτωση της σημερινής εικόνας.' }
    }
  }, [studentId])

  // Πάντα καλείται (Rules of Hooks) — ο ίδιος ελέγχει εσωτερικά αν έχει νόημα να τρέξει. Εξαρτάται
  // από `data?.status` (ΟΧΙ ολόκληρο το `data`) ώστε να ΜΗΝ ξανατρέχει σε κάθε ζωντανή ανανέωση των
  // δεδομένων — μόνο μία φορά, όταν πρωτοφορτώσουν με επιτυχία μετά από πλοήγηση με focusGoalId.
  useEffect(() => {
    if (!focusGoalId || data?.status !== 'ok') return
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    sectionRef.current?.focus()
    setHighlightedGoalId(focusGoalId)
    const timer = setTimeout(() => setHighlightedGoalId(null), 4000)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusGoalId, data?.status])

  // Loading — ίδιο ύψος/σχήμα με το τελικό περιεχόμενο (καμία μετατόπιση διάταξης, σημείο 9).
  if (data === undefined) {
    return (
      <Card className="student-dashboard-panel" aria-busy="true">
        <p className="student-dashboard-panel__loading">Φόρτωση σημερινής εικόνας…</p>
      </Card>
    )
  }

  if (data.status === 'error') {
    return (
      <Card className="student-dashboard-panel student-dashboard-panel--error">
        <p role="alert" className="student-dashboard-panel__error-text">
          <AlertTriangle size={16} aria-hidden="true" /> {data.message}
        </p>
      </Card>
    )
  }

  const { goals, datedMeasurementsByGoalId, goalEventsByGoalId, hasIncompleteSessionToday, todaySessionStudentIds, hasSessionToday } = data
  const today = new Date()
  const goalById = Object.fromEntries(goals.map((g) => [g.id, g]))

  const nextBestAction = computeNextBestAction({
    hasIncompleteSessionToday, todaySessionStudentIds, goals, datedMeasurementsByGoalId, goalEventsByGoalId, today
  })

  const todaysPlanGoals = computeTodaysPlanGoals(goals)
  const planItems = todaysPlanGoals.map((g) => {
    const attention = computeGoalAttention(g, datedMeasurementsByGoalId[g.id] || [], goalEventsByGoalId[g.id] || [], today)
    return { goal: g, reason: computeGoalPriorityReason(g, { hasSessionToday, attention }) }
  })

  const deltaItems = todaysPlanGoals.map((g) => ({ goal: g, delta: computeGoalSessionDelta(g, datedMeasurementsByGoalId[g.id] || []) }))

  // «Χρειάζεται κάτι προσοχή» — σε ΟΛΟΥΣ τους στόχους (όχι μόνο το σημερινό πλάνο), ίδιο σύνολο
  // λόγων/σειράς με το goalAttention.js (Στάδιο 8) — καμία επανάληψη υπολογισμού.
  const attentionItems = goals
    .map((g) => computeGoalAttention(g, datedMeasurementsByGoalId[g.id] || [], goalEventsByGoalId[g.id] || [], today))
    .filter(Boolean)
    .sort((a, b) => a.goalId - b.goalId)

  // CTA destinations (σημείο 10) — πάντα το ΣΥΓΚΕΚΡΙΜΕΝΟ αντικείμενο, ποτέ γενική λίστα.
  function handleNextActionClick() {
    if (nextBestAction.type === 'startSession') {
      navigate(`/teaching/session/${nextBestAction.studentIds.join(',')}`)
    } else if (nextBestAction.type === 'reviewCompletion') {
      navigate(`/students/${nextBestAction.studentId}/goals/${nextBestAction.goalId}`)
    } else if (nextBestAction.type === 'recordMeasurement') {
      // Οι μετρήσεις καταγράφονται ΜΕΣΑ σε συνεδρία (Teaching Mode) — δεν υπάρχει ξεχωριστή,
      // αυτόνομη ροή «καταγραφή μέτρησης» εκτός συνεδρίας σε αυτή την εφαρμογή.
      navigate(`/teaching/session/${nextBestAction.studentId}`)
    } else if (nextBestAction.type === 'createFirstGoal') {
      navigate(`/students/${studentId}/goals/new`)
    }
  }

  const NextIcon = NEXT_ACTION_ICON[nextBestAction.type]
  const nextActionGoal = nextBestAction.goalId != null ? goalById[nextBestAction.goalId] : null
  const isActionable = nextBestAction.type !== 'allCaughtUp'

  return (
    <section
      ref={sectionRef}
      id="student-dashboard-panel"
      tabIndex={-1}
      className="student-dashboard-panel-wrap"
      aria-labelledby="studentDashboardHeading"
    >
      <h2 id="studentDashboardHeading" className="student-dashboard-panel__heading">Σήμερα</h2>

      {/* Ερώτηση 5 — η ΜΙΑ κυρίαρχη ενέργεια, πρώτη στη σελίδα (σημείο 11: καμία υπερβολική
          κύλιση πριν από αυτήν). */}
      <Card className={`student-dashboard-panel__cta student-dashboard-panel__cta--${nextBestAction.type}`}>
        {NextIcon && <NextIcon size={22} aria-hidden="true" className="student-dashboard-panel__cta-icon" />}
        <div className="student-dashboard-panel__cta-text">
          <p className="student-dashboard-panel__cta-label">{nextBestAction.label}</p>
          {nextActionGoal && (
            <p className="student-dashboard-panel__cta-detail">«{nextActionGoal.title}» — {domainName(nextActionGoal.domain)}</p>
          )}
        </div>
        {isActionable && (
          <Button variant="primary" onClick={handleNextActionClick}>{nextBestAction.label}</Button>
        )}
      </Card>

      <div className="student-dashboard-panel__grid">
        {/* Ερωτήσεις 1+2 — «τι θα δουλέψω σήμερα» ΜΑΖΙ με το «γιατί» ανά γραμμή (σημείο 2: όχι
            ξεχωριστές βαριές κάρτες, αλλά ούτε συγχωνευμένο ασαφές κείμενο). */}
        <Card as="section" aria-labelledby="dashboardPlanHeading" className="student-dashboard-panel__section">
          <h3 id="dashboardPlanHeading" className="student-dashboard-panel__section-title">Τι θα δουλέψω σήμερα</h3>
          {planItems.length === 0 && (
            <p className="student-dashboard-panel__empty">Κανένας ενεργός στόχος αυτή τη στιγμή.</p>
          )}
          {planItems.length > 0 && (
            <ul className="student-dashboard-panel__list">
              {planItems.map(({ goal, reason }) => (
                <li key={goal.id} className="student-dashboard-panel__plan-item">
                  <span className="student-dashboard-panel__plan-title">{goal.title}</span>
                  <span className="student-dashboard-panel__plan-reason">{reason}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Ερώτηση 3 — τι άλλαξε από την προηγούμενη συνεδρία, ανά goal (σημείο 7). */}
        <Card as="section" aria-labelledby="dashboardDeltaHeading" className="student-dashboard-panel__section">
          <h3 id="dashboardDeltaHeading" className="student-dashboard-panel__section-title">Τι άλλαξε από την προηγούμενη συνεδρία</h3>
          {deltaItems.length === 0 && (
            <p className="student-dashboard-panel__empty">Κανένας ενεργός στόχος για σύγκριση.</p>
          )}
          {deltaItems.length > 0 && (
            <ul className="student-dashboard-panel__list">
              {deltaItems.map(({ goal, delta }) => (
                <li key={goal.id} className="student-dashboard-panel__delta-item">
                  <span className="student-dashboard-panel__plan-title">{goal.title}</span>
                  {delta.available ? (
                    <span className={`student-dashboard-panel__delta-value student-dashboard-panel__delta-value--${delta.direction}`}>
                      {formatDeltaValue(goal, delta.previousValue)} → {formatDeltaValue(goal, delta.latestValue)}
                    </span>
                  ) : (
                    <span className="student-dashboard-panel__plan-reason">{delta.message}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Ερώτηση 4 — χρειάζεται κάτι προσοχή; Εικονίδιο ΚΑΙ κείμενο ανά λόγο — ποτέ μόνο χρώμα
            (σημείο 11). */}
        <Card as="section" aria-labelledby="dashboardAttentionHeading" className="student-dashboard-panel__section">
          <h3 id="dashboardAttentionHeading" className="student-dashboard-panel__section-title">Χρειάζεται κάτι προσοχή</h3>
          {attentionItems.length === 0 && (
            <p className="student-dashboard-panel__empty">Κανένας στόχος δεν χρειάζεται άμεση προσοχή.</p>
          )}
          {attentionItems.length > 0 && (
            <ul className="student-dashboard-panel__list">
              {attentionItems.map((item) => {
                const goal = goalById[item.goalId]
                if (!goal) return null
                const isHighlighted = item.goalId === highlightedGoalId
                return (
                  <li
                    key={item.goalId}
                    className={`student-dashboard-panel__attention-item ${isHighlighted ? 'student-dashboard-panel__attention-item--highlighted' : ''}`}
                  >
                    <span className="student-dashboard-panel__plan-title">{goal.title}</span>
                    <span className="student-dashboard-panel__attention-reasons">
                      {item.reasons.map((r) => {
                        const Icon = ATTENTION_REASON_ICON[r.type]
                        return (
                          <span key={r.type} className="student-dashboard-panel__attention-reason">
                            {Icon && <Icon size={14} aria-hidden="true" />} {r.label}
                          </span>
                        )
                      })}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>
    </section>
  )
}
