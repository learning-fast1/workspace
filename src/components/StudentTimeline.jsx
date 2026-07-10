import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db.js'
import { formatDateEl as formatDate } from '../utils/date.js'

const STATUS_EVENTS = {
  achieved: { icon: '📈', text: (title) => `Επίτευξη κριτηρίου: ${title}` },
  revised: { icon: '🎯', text: (title) => `Αναθεώρηση στόχου: ${title}` },
  archived: { icon: '🗄️', text: (title) => `Αρχειοθέτηση στόχου: ${title}` }
}

function formatMonth(monthStr) {
  return new Date(`${monthStr}-01`).toLocaleDateString('el-GR', { month: 'long', year: 'numeric' })
}

// Χρονολογική αφήγηση της χρονιάς — παράγεται αυτόματα από στόχους, συνεδρίες και παρατηρήσεις, χωρίς δική του καταχώρηση.
export default function StudentTimeline({ studentId }) {
  const goals = useLiveQuery(() => db.goals.where('studentId').equals(studentId).toArray(), [studentId])
  const allSessions = useLiveQuery(() => db.sessions.toArray(), [])
  const observations = useLiveQuery(
    () => db.observations.where('studentId').equals(studentId).toArray(),
    [studentId]
  )

  if (!goals || !allSessions || !observations) {
    return null
  }

  const events = []

  for (const g of goals) {
    if (g.startDate) {
      events.push({ key: `goal-new-${g.id}`, date: g.startDate, icon: '🎯', text: `Νέος στόχος: ${g.title}` })
    }
    const statusEvent = STATUS_EVENTS[g.status]
    if (statusEvent && g.statusChangedAt) {
      events.push({
        key: `goal-status-${g.id}`,
        date: g.statusChangedAt.slice(0, 10),
        icon: statusEvent.icon,
        text: statusEvent.text(g.title)
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
      icon: '📅',
      text: `${count} συνεδρί${count === 1 ? 'α' : 'ες'} (${formatMonth(month)})`
    })
  }

  for (const o of observations) {
    events.push({
      key: `observation-${o.id}`,
      date: o.date,
      icon: o.milestone ? '⭐' : '📝',
      text: o.text,
      milestone: o.milestone
    })
  }

  events.sort((a, b) => a.date.localeCompare(b.date))

  return (
    <div className="section">
      <h2>Timeline</h2>
      {events.length === 0 ? (
        <p className="empty-state">Δεν υπάρχουν ακόμα καταχωρήσεις για το timeline.</p>
      ) : (
        <ul className="timeline">
          {events.map((e) => (
            <li key={e.key} className={`timeline-item ${e.milestone ? 'timeline-milestone' : ''}`}>
              <span className="timeline-icon">{e.icon}</span>
              <span className="timeline-text">{e.text}</span>
              <span className="timeline-date">{formatDate(e.date)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
