import { CalendarClock, CircleCheck, FileText, History, PauseCircle, TrendingUp } from 'lucide-react'
import { latestDatedMeasurement } from './measurementValue.js'
import { computeGoalAttention } from './goalAttention.js'
import { isCompletionCandidate } from './studentDashboard.js'
import { unresolvedSessionReason, draftReportReason } from './queueAttention.js'

// Smart Notifications — ενιαίος engine (review χρήστη). ΚΑΘΑΡΗ υπολογιστική λογική, καμία Dexie
// query εδώ (ίδιο idiom με goalAttention.js/queueAttention.js/studentDashboard.js) — αυτά τα τρία
// επαναχρησιμοποιούνται εδώ ΑΥΤΟΥΣΙΑ, καμία αντιγραφή λογικής. Η μόνη ΝΕΑ δουλειά εδώ είναι:
// (1) μετατροπή κάθε ήδη-υπολογισμένου reason σε ΕΝΑ notification με deterministic id/severity/
// icon/primaryAction, (2) εφαρμογή της persisted dismiss/snooze κατάστασης πάνω σε αυτό το
// ζωντανά υπολογισμένο σύνολο.
//
// ΣΗΜΑΝΤΙΚΟ (review χρήστη, ρητή αρχιτεκτονική δέσμευση): severity/label/icon/primaryAction ΔΕΝ
// αποθηκεύονται ΠΟΤΕ στο notificationState πίνακα (βλ. db.js) — υπολογίζονται ΠΑΝΤΑ ζωντανά εδώ,
// σε κάθε φόρτωση. Το notificationState κρατά ΑΠΟΚΛΕΙΣΤΙΚΑ dismiss/snooze κατάσταση ανά id· αν
// ξεσυγχρονιστεί με τα πραγματικά δεδομένα, το επόμενο recomputation το διορθώνει αυτόματα.
//
// «εκκρεμής αξιολόγηση» ΔΕΝ συμπεριλαμβάνεται (review χρήστη) — το schema δεν έχει καμία έννοια
// due date/περιοδικότητας για κλινική αξιολόγηση. attentionSignal.js (mood/absence/milestone)
// ΕΠΙΣΗΣ ΔΕΝ συμπεριλαμβάνεται — contextual σήματα «τώρα, πριν τη σημερινή συνεδρία» μέσα στο
// TodayQueue, όχι αυτόνομες, ασύγχρονες ειδοποιήσεις.

// Αυξάνεται ΜΟΝΟ όταν αλλάξει η φόρμουλα ενός id/fingerprint παρακάτω ή προστεθεί κανόνας
// ασύμβατος με ήδη αποθηκευμένα state rows (review χρήστη, σημείο 2) — γράφεται σε κάθε
// dismiss/snooze εγγραφή (βλ. db.js). Rows με διαφορετικό schemaVersion αγνοούνται σιωπηλά εδώ
// (isSuppressed παρακάτω) αντί να υποτεθεί ότι εξακολουθούν να έχουν νόημα.
export const NOTIFICATION_STATE_SCHEMA_VERSION = 1

export const NOTIFICATION_TYPE_META = {
  goalStale: { severity: 'warning', icon: CalendarClock },
  goalPausedTooLong: { severity: 'warning', icon: PauseCircle },
  goalNearCriterion: { severity: 'positive', icon: TrendingUp },
  goalCompletionCandidate: { severity: 'positive', icon: CircleCheck },
  draftReport: { severity: 'info', icon: FileText },
  unresolvedSession: { severity: 'warning', icon: History }
}

const SEVERITY_RANK = { warning: 0, info: 1, positive: 2 }

function buildNotification({ id, type, studentId, entityType, entityId, label, primaryAction }) {
  const meta = NOTIFICATION_TYPE_META[type]
  return {
    id,
    type,
    severity: meta.severity,
    icon: meta.icon,
    studentId,
    entityType,
    entityId,
    label,
    primaryAction,
    dismissible: true,
    snoozable: true
  }
}

// goalAttention.js reasons → notification. nearCriterion δεν κουβαλάει δικό του «since» — η άγκυρα
// είναι η ΤΕΛΕΥΤΑΙΑ μέτρηση (latestDatedMeasurement, ήδη υπάρχον helper) — νέα μέτρηση, νέο id.
function buildGoalReasonNotification(studentId, goal, reason, measurements) {
  if (reason.type === 'stale') {
    return buildNotification({
      id: `goalStale:${goal.id}:${reason.since}`,
      type: 'goalStale',
      studentId,
      entityType: 'goal',
      entityId: goal.id,
      label: `«${goal.title}» — ${reason.label}`,
      primaryAction: { type: 'openGoal', studentId, goalId: goal.id }
    })
  }
  if (reason.type === 'pausedTooLong') {
    return buildNotification({
      id: `goalPausedTooLong:${goal.id}:${reason.since}`,
      type: 'goalPausedTooLong',
      studentId,
      entityType: 'goal',
      entityId: goal.id,
      label: `«${goal.title}» — ${reason.label}`,
      primaryAction: { type: 'openGoal', studentId, goalId: goal.id }
    })
  }
  if (reason.type === 'nearCriterion') {
    const latest = latestDatedMeasurement(measurements)
    if (!latest) return null
    return buildNotification({
      id: `goalNearCriterion:${goal.id}:${latest.id}`,
      type: 'goalNearCriterion',
      studentId,
      entityType: 'goal',
      entityId: goal.id,
      label: `«${goal.title}» — ${reason.label}`,
      primaryAction: { type: 'openGoal', studentId, goalId: goal.id }
    })
  }
  return null
}

// entries: [{ studentId, goals, datedMeasurementsByGoalId, goalEventsByGoalId, reports, pastEntries }]
// ΗΔΗ ομαδοποιημένα/date-joined από τον caller (utils/notificationData.js) — batched, καμία query
// εδώ μέσα, καμία επανάληψη ομαδοποίησης ανά goal/μαθητή.
//
// `today`: ISO string (YYYY-MM-DD) — ίδια σύμβαση με queueAttention.js (unresolvedSessionReason
// το χρειάζεται ως string). Το goalAttention.js όμως περιμένει Date object (daysBetween καλεί
// today.getTime()) — ίδιο idiom με TodayQueue.jsx/StudentDashboardPanel.jsx: `new Date()`
// ανεξάρτητα εδώ, ΟΧΙ παραγόμενο από το ISO string (θα παρσάριζε σε UTC μεσάνυχτα, βλ. σχόλιο
// utils/date.js).
export function computeCandidateNotifications(entries, { sessionsByDate, today }) {
  const results = []
  const now = new Date()

  for (const entry of entries) {
    const { studentId, goals, datedMeasurementsByGoalId, goalEventsByGoalId, reports, pastEntries } = entry

    for (const goal of goals) {
      const measurements = datedMeasurementsByGoalId[goal.id] || []
      const goalEvents = goalEventsByGoalId[goal.id] || []

      const attention = computeGoalAttention(goal, measurements, goalEvents, now)
      if (attention) {
        for (const reason of attention.reasons) {
          const notification = buildGoalReasonNotification(studentId, goal, reason, measurements)
          if (notification) results.push(notification)
        }
      }

      // completionCandidate: ΞΕΧΩΡΙΣΤΗ έννοια από goalAttention.js's nearCriterion (βλ.
      // studentDashboard.js) — μόνο active goals, ίδιο guard με computeNextBestAction.
      if (goal.status === 'active' && isCompletionCandidate(goal, measurements)) {
        const latest = latestDatedMeasurement(measurements)
        results.push(buildNotification({
          id: `goalCompletionCandidate:${goal.id}:${latest.id}`,
          type: 'goalCompletionCandidate',
          studentId,
          entityType: 'goal',
          entityId: goal.id,
          label: `«${goal.title}» φαίνεται έτοιμος για ολοκλήρωση`,
          primaryAction: { type: 'openGoal', studentId, goalId: goal.id }
        }))
      }
    }

    const draft = draftReportReason(reports)
    if (draft) {
      const draftIds = [...new Set(reports.filter((r) => r.status === 'draft').map((r) => r.id))].sort((a, b) => a - b)
      results.push(buildNotification({
        id: `draftReport:${studentId}:${draftIds.join(',')}`,
        type: 'draftReport',
        studentId,
        entityType: 'report',
        entityId: draftIds[0],
        label: draft.label,
        primaryAction: { type: 'openStudent', studentId, activeTab: 'report' }
      }))
    }

    const unresolved = unresolvedSessionReason(pastEntries, sessionsByDate, today)
    if (unresolved) {
      results.push(buildNotification({
        id: `unresolvedSession:${studentId}:${unresolved.latestDate}`,
        type: 'unresolvedSession',
        studentId,
        entityType: 'student',
        entityId: studentId,
        label: unresolved.label,
        primaryAction: { type: 'openStudent', studentId }
      }))
    }
  }

  return results
}

// Μοναδική πηγή αλήθειας για το πώς «διαβάζεται» ένα state row (Notifications Inbox review,
// σημείο 1) — isSuppressed/categorizeNotifications παρακάτω ΚΑΝΕΝΑ δεν ξαναγράφει αυτή τη λογική.
// Ληγμένο snooze ΔΕΝ κρύβει πια (review χρήστη) — ξαναγίνεται ορατό ('none'), το state row ΔΕΝ
// διαγράφεται εδώ (βλ. cleanupOrphanedNotificationState στο db.js για το πότε ΠΡΑΓΜΑΤΙΚΑ
// διαγράφεται). Rows με παλιό/άγνωστο schemaVersion αγνοούνται σιωπηλά ('none') — ασφαλές
// fallback αντί να υποτεθεί ότι ένα fingerprint που υπολογίστηκε με παλιούς κανόνες εξακολουθεί
// να έχει νόημα.
function stateStatus(state, today) {
  if (!state || state.schemaVersion !== NOTIFICATION_STATE_SCHEMA_VERSION) return 'none'
  if (state.dismissedAt) return 'dismissed'
  if (state.snoozedUntil && state.snoozedUntil > today) return 'snoozed'
  return 'none'
}

export function isSuppressed(state, today) {
  const status = stateStatus(state, today)
  return status === 'dismissed' || status === 'snoozed'
}

// notificationStateById: {[id]: stateRow} — ήδη φορτωμένο ΜΙΑ φορά από τον caller (batched read),
// καμία query ανά notification εδώ.
export function filterVisibleNotifications(candidates, notificationStateById, today) {
  return candidates.filter((n) => !isSuppressed(notificationStateById[n.id], today))
}

// Notifications Inbox (review χρήστη) — ΞΕΧΩΡΙΖΕΙ dismissed (αποκλείεται εντελώς, καμία «ιστορία»
// — ρητή απόφαση χρήστη, όχι εδώ) από snoozed (δική του ενότητα, με ημερομηνία λήξης) από visible.
// ΙΔΙΟ stateStatus με το isSuppressed παραπάνω — καμία δεύτερη ερμηνεία του state row.
export function categorizeNotifications(candidates, notificationStateById, today) {
  const visible = []
  const snoozed = []
  for (const n of candidates) {
    const state = notificationStateById[n.id]
    const status = stateStatus(state, today)
    if (status === 'dismissed') continue
    if (status === 'snoozed') {
      snoozed.push({ ...n, snoozedUntil: state.snoozedUntil })
      continue
    }
    visible.push(n)
  }
  return { visible: sortNotifications(visible), snoozed: sortSnoozedNotifications(snoozed) }
}

// Deterministic ταξινόμηση: severity (warning πρώτα, positive τελευταία — ίδιο σκεπτικό με
// utils/queueAttention.js PRIORITY_RANK), μετά studentId, μετά το ίδιο το id (tie-break).
export function sortNotifications(notifications) {
  return [...notifications].sort((a, b) =>
    (SEVERITY_RANK[a.severity] ?? 99) - (SEVERITY_RANK[b.severity] ?? 99) ||
    a.studentId - b.studentId ||
    a.id.localeCompare(b.id)
  )
}

// Snoozed (review χρήστη, σημείο 4): ΠΡΩΤΑ η πιο κοντινή λήξη αναβολής (αύξουσα σειρά — αυτό που
// θα ξαναφανεί πρώτο βρίσκεται πρώτο), μετά ΙΔΙΟ tie-break με το sortNotifications.
export function sortSnoozedNotifications(notifications) {
  return [...notifications].sort((a, b) =>
    a.snoozedUntil.localeCompare(b.snoozedUntil) ||
    (SEVERITY_RANK[a.severity] ?? 99) - (SEVERITY_RANK[b.severity] ?? 99) ||
    a.studentId - b.studentId ||
    a.id.localeCompare(b.id)
  )
}

// Notifications Inbox (review χρήστη, σημείο 10) — η ΙΔΙΑ μετάφραση primaryAction→route που ζούσε
// inline μέσα στο HomeAttentionWidget.jsx, εξαγμένη εδώ ώστε το Inbox να ΜΗΝ την αντιγράψει.
// Καθαρή συνάρτηση — ΔΕΝ καλεί το ίδιο navigate(), μόνο υπολογίζει {path, state}· ο caller
// αποφασίζει πώς να πλοηγηθεί (π.χ. react-router useNavigate).
export function resolveNotificationRoute(primaryAction) {
  if (primaryAction.type === 'openGoal') {
    return { path: `/students/${primaryAction.studentId}/goals/${primaryAction.goalId}`, state: undefined }
  }
  if (primaryAction.type === 'openStudent') {
    return {
      path: `/students/${primaryAction.studentId}`,
      state: primaryAction.activeTab ? { activeTab: primaryAction.activeTab } : undefined
    }
  }
  return null
}
