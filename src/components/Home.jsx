import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getLastBackupAt } from '../db.js'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const STALE_AFTER_DAYS = 14
const BACKUP_REMINDER_AFTER_DAYS = 7

async function checkBackupReminder() {
  const lastBackupAt = await getLastBackupAt()
  if (!lastBackupAt) return { needed: true, days: null }
  const days = Math.floor((new Date() - new Date(lastBackupAt)) / MS_PER_DAY)
  return { needed: days > BACKUP_REMINDER_AFTER_DAYS, days }
}

// Ενεργοί στόχοι (ενεργών μαθητών) χωρίς μέτρηση πάνω από STALE_AFTER_DAYS μέρες.
// Reference ημερομηνία: η πιο πρόσφατη μέτρηση του στόχου, αλλιώς η ημερομηνία έναρξής του.
async function findStaleGoals() {
  const [students, goals, measurements, sessions] = await Promise.all([
    db.students.toArray(),
    db.goals.where('status').equals('active').toArray(),
    db.measurements.toArray(),
    db.sessions.toArray()
  ])

  const activeStudentIds = new Set(students.filter((s) => s.active).map((s) => s.id))
  const sessionDateById = Object.fromEntries(sessions.map((s) => [s.id, s.date]))

  const lastMeasuredByGoal = {}
  for (const m of measurements) {
    const date = sessionDateById[m.sessionId]
    if (!date) continue
    if (!lastMeasuredByGoal[m.goalId] || date > lastMeasuredByGoal[m.goalId]) {
      lastMeasuredByGoal[m.goalId] = date
    }
  }

  const today = new Date()
  const stale = []
  for (const g of goals) {
    if (!activeStudentIds.has(g.studentId)) continue
    const referenceDate = lastMeasuredByGoal[g.id] || g.startDate
    if (!referenceDate) continue
    const days = Math.floor((today - new Date(referenceDate)) / MS_PER_DAY)
    if (days > STALE_AFTER_DAYS) {
      const student = students.find((s) => s.id === g.studentId)
      stale.push({ goalId: g.id, studentId: g.studentId, studentCode: student?.code, title: g.title, days })
    }
  }
  return stale.sort((a, b) => b.days - a.days)
}

// Αρχική οθόνη — «Τι κάνεις τώρα;» είναι το κέντρο της εφαρμογής (βλ. Φιλοσοφία UX στο SPEC).
export default function Home() {
  const staleGoals = useLiveQuery(findStaleGoals, [])
  const backupReminder = useLiveQuery(checkBackupReminder, [])

  return (
    <div className="page home-page">
      <div className="top-bar">
        <Link to="/settings" className="btn btn-link">⚙️ Ρυθμίσεις</Link>
        <Link to="/students" className="btn btn-link">🗂️ Μαθητές</Link>
      </div>

      {backupReminder?.needed && (
        <div className="notice">
          <h2>💾 {backupReminder.days === null ? 'Δεν έχεις κάνει ποτέ αντίγραφο ασφαλείας' : `${backupReminder.days} μέρες από το τελευταίο αντίγραφο ασφαλείας`}</h2>
          <p><Link to="/settings">Πήγαινε στις Ρυθμίσεις για λήψη →</Link></p>
        </div>
      )}

      {staleGoals && staleGoals.length > 0 && (
        <div className="notice">
          <h2>⚠️ {staleGoals.length} στόχ{staleGoals.length === 1 ? 'ος' : 'οι'} χωρίς μέτρηση πάνω από 14 μέρες</h2>
          <ul>
            {staleGoals.map((g) => (
              <li key={g.goalId}>
                <Link to={`/students/${g.studentId}/goals/${g.goalId}`}>{g.studentCode} — {g.title}</Link> ({g.days} μέρες)
              </li>
            ))}
          </ul>
        </div>
      )}

      <h1 className="home-question">Τι κάνεις τώρα;</h1>

      <div className="mode-buttons">
        <Link to="/teaching/individual" className="mode-btn mode-btn-individual">
          🟢 Ατομικό
        </Link>
        <Link to="/teaching/group" className="mode-btn mode-btn-group">
          🟣 Ομαδικό
        </Link>
      </div>
    </div>
  )
}
