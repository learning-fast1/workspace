import { useLiveQuery } from 'dexie-react-hooks'
import { Archive, CalendarDays, RefreshCw, Sparkles, FileText, Star, Target } from 'lucide-react'
import { db } from '../db.js'
import { formatDateEl as formatDate } from '../utils/date.js'
import EmptyState from './ui/EmptyState.jsx'
import ActivityItem from './ui/ActivityItem.jsx'
import './StudentTimeline.css'

const STATUS_EVENTS = {
  achieved: { icon: Target, text: (title) => `Επίτευξη κριτηρίου: ${title}` },
  revised: { icon: RefreshCw, text: (title) => `Αναθεώρηση στόχου: ${title}` },
  archived: { icon: Archive, text: (title) => `Αρχειοθέτηση στόχου: ${title}` }
}

function formatMonth(monthStr) {
  return new Date(`${monthStr}-01`).toLocaleDateString('el-GR', { month: 'long', year: 'numeric' })
}

// Χρονολογική αφήγηση της χρονιάς — παράγεται αυτόματα από στόχους, συνεδρίες και παρατηρήσεις,
// χωρίς δική του καταχώρηση (SPEC.md Βήμα 5β). Αυτό το tab («Συνεδρίες») δείχνει το ίδιο το
// Timeline αντί για μια στεγνή λίστα συνεδριών — βλ. UX proposal §3.
export default function StudentTimeline({ studentId }) {
  const goals = useLiveQuery(() => db.goals.where('studentId').equals(studentId).toArray(), [studentId])
  const allSessions = useLiveQuery(() => db.sessions.toArray(), [])
  const observations = useLiveQuery(
    () => db.observations.where('studentId').equals(studentId).toArray(),
    [studentId]
  )

  if (!goals || !allSessions || !observations) {
    return <p>Φόρτωση…</p>
  }

  const events = []

  for (const g of goals) {
    if (g.startDate) {
      events.push({ key: `goal-new-${g.id}`, date: g.startDate, icon: Target, text: `Νέος στόχος: ${g.title}`, to: `/students/${studentId}/goals/${g.id}` })
    }
    const statusEvent = STATUS_EVENTS[g.status]
    if (statusEvent && g.statusChangedAt) {
      events.push({
        key: `goal-status-${g.id}`,
        date: g.statusChangedAt.slice(0, 10),
        icon: statusEvent.icon,
        text: statusEvent.text(g.title),
        to: `/students/${studentId}/goals/${g.id}`
      })
    }
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

  // Πιο πρόσφατα πρώτα (COMPONENT_GUIDE.md § ActivityItem) — αντίστροφα από τη σημερινή σειρά.
  events.sort((a, b) => b.date.localeCompare(a.date))

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
