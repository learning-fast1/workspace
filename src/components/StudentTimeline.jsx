import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarDays, Sparkles, FileText, Star } from 'lucide-react'
import { activeTable } from '../migration/activeGeneration.js'
import { formatDateEl as formatDate } from '../utils/date.js'
import { describeGoalEvent } from '../utils/goalEvents.js'
import EmptyState from './ui/EmptyState.jsx'
import ActivityItem from './ui/ActivityItem.jsx'
import './StudentTimeline.css'

function formatMonth(monthStr) {
  return new Date(`${monthStr}-01`).toLocaleDateString('el-GR', { month: 'long', year: 'numeric' })
}

// Χρονολογική αφήγηση της χρονιάς — παράγεται αυτόματα από στόχους, συνεδρίες και παρατηρήσεις,
// χωρίς δική του καταχώρηση (SPEC.md Βήμα 5β). Αυτό το tab («Συνεδρίες») δείχνει το ίδιο το
// Timeline αντί για μια στεγνή λίστα συνεδριών — βλ. UX proposal §3.
export default function StudentTimeline({ studentId }) {
  const goals = useLiveQuery(() => activeTable('goals').where('studentId').equals(studentId).toArray(), [studentId])
  const allSessions = useLiveQuery(() => activeTable('sessions').toArray(), [])
  const observations = useLiveQuery(
    () => activeTable('observations').where('studentId').equals(studentId).toArray(),
    [studentId]
  )
  // ΕΝΑ query για ΟΛΑ τα goalEvents όλων των στόχων του μαθητή μαζί (goalId indexed, .anyOf σε
  // batch) — ΟΧΙ ένα query ανά στόχο (Technical Plan Στάδιο 5, σημείο 6: καμία N+1). Εξαρτάται
  // από το `goals` query — γι' αυτό ξεχωριστό useLiveQuery με [goals] ως dependency, ώστε να
  // ξανατρέξει μόνο όταν αλλάξει η λίστα στόχων, όχι σε κάθε render.
  const goalEvents = useLiveQuery(
    () => (goals ? activeTable('goalEvents').where('goalId').anyOf(goals.map((g) => g.id)).toArray() : undefined),
    [goals]
  )

  if (!goals || !allSessions || !observations || !goalEvents) {
    return <p>Φόρτωση…</p>
  }

  const events = []

  // Ένα timeline entry ΑΝΑ goalEvent (όχι ανά goal) — αυτό ακριβώς αντικαθιστά το παλιό «μόνο η
  // τελευταία κατάσταση φαίνεται»: όλο το ιστορικό ενός στόχου (δημιουργία, παύσεις, επαναφορές,
  // ολοκλήρωση) εμφανίζεται τώρα ξεχωριστά, στη σωστή χρονολογική θέση του. Ταξινόμηση/περιγραφή
  // ΑΠΟΚΛΕΙΣΤΙΚΑ μέσω του κοινού utils/goalEvents.js — καμία δική του ερμηνεία εδώ (σημείο 2).
  const goalById = Object.fromEntries(goals.map((g) => [g.id, g]))
  for (const event of goalEvents) {
    const goal = goalById[event.goalId]
    const { icon, text } = describeGoalEvent(event, goal)
    events.push({
      key: `goal-event-${event.id}`,
      date: event.at.slice(0, 10),
      at: event.at,
      icon,
      text,
      to: goal ? `/students/${studentId}/goals/${goal.id}` : undefined
    })
  }

  const sessionsByMonth = {}
  for (const s of allSessions) {
    if (!s.studentIds?.includes(studentId)) continue
    if (s.absentStudentIds?.includes(studentId)) continue // απών — δεν μετράει ως συνεδρία του
    const month = s.date.slice(0, 7)
    sessionsByMonth[month] = (sessionsByMonth[month] || 0) + 1
  }
  for (const [month, count] of Object.entries(sessionsByMonth)) {
    events.push({
      key: `sessions-${month}`,
      date: `${month}-01`,
      icon: CalendarDays,
      text: `${count} συνεδρί${count === 1 ? 'α' : 'ες'} (${formatMonth(month)})`
    })
  }

  for (const o of observations) {
    events.push({
      key: `observation-${o.id}`,
      date: o.date,
      icon: o.milestone ? Star : FileText,
      text: o.text,
      milestone: o.milestone
    })
  }

  // Πιο πρόσφατα πρώτα (COMPONENT_GUIDE.md § ActivityItem). Χρησιμοποιεί το πλήρες `at` (ώρα
  // included) όπου υπάρχει — δηλαδή για goal events — ώστε δύο events την ΙΔΙΑ μέρα να μπαίνουν
  // στη σωστή σειρά αναμεταξύ τους (Technical Plan Στάδιο 5, σημείο 3/7)· sessions/observations
  // δεν έχουν ποτέ αποθηκευμένη ώρα, άρα πέφτουν πίσω στο απλό date.
  events.sort((a, b) => (b.at || b.date).localeCompare(a.at || a.date))

  if (events.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title="Δεν υπάρχει ακόμα δραστηριότητα"
        description="Το timeline γεμίζει αυτόματα από στόχους, συνεδρίες και παρατηρήσεις."
      />
    )
  }

  // Grouping ανά μήνα (COMPONENT_GUIDE.md § ActivityItem — «grouping ανά ημερομηνία σε μεγάλες λίστες»).
  const groups = []
  let currentGroup = null
  for (const e of events) {
    const month = e.date.slice(0, 7)
    if (!currentGroup || currentGroup.month !== month) {
      currentGroup = { month, label: formatMonth(month), items: [] }
      groups.push(currentGroup)
    }
    currentGroup.items.push(e)
  }

  return (
    <div className="profile-timeline">
      {groups.map((group) => (
        <div key={group.month} className="profile-timeline__group">
          <h3 className="profile-timeline__group-title">{group.label}</h3>
          <div className="profile-timeline__items">
            {group.items.map((e) => (
              <ActivityItem
                key={e.key}
                icon={e.icon}
                text={e.text}
                dateLabel={formatDate(e.date)}
                to={e.to}
                milestone={e.milestone}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
