import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, Users } from 'lucide-react'
import { activeTable } from '../../migration/activeGeneration.js'
import { todayLocalISO } from '../../utils/date.js'
import { matchedSession } from '../../utils/dailyQueue.js'
import './SidebarQuickSchedule.css'

const MAX_ROWS = 3

// Μικρό widget γρήγορου ελέγχου (Sprint 6) — κάτω από τις «Ρυθμίσεις» στο sidebar. Δείχνει ΜΟΝΟ
// την τρέχουσα/επόμενη και μέχρι δύο ακόμη ΕΚΚΡΕΜΕΙΣ σημερινές εμφανίσεις (όχι όλο το πρόγραμμα —
// αυτό θα ήταν απλά αντιγραφή της «Η μέρα μου» σε άλλη θέση). Desktop/tablet μόνο (βλ. CSS) —
// στο mobile bottom nav δεν υπάρχει καν sidebar container γι' αυτό να μπει.
async function loadUpcoming() {
  const today = todayLocalISO()
  const [entries, sessionsToday, students] = await Promise.all([
    activeTable('dailyQueue').where('date').equals(today).toArray(),
    activeTable('sessions').where('date').equals(today).toArray(),
    activeTable('students').toArray()
  ])
  const studentById = Object.fromEntries(students.map((s) => [s.id, s]))

  const upcoming = entries
    .filter((e) => e.status !== 'skipped' && e.plannedTime && matchedSession(e, sessionsToday) === null)
    .sort((a, b) => a.plannedTime.localeCompare(b.plannedTime))
    .slice(0, MAX_ROWS)
    .map((e) => ({
      time: e.plannedTime,
      isGroup: e.studentIds.length > 1,
      label: e.studentIds.map((id) => studentById[id]?.code).filter(Boolean).join(', ')
    }))

  return upcoming
}

export default function SidebarQuickSchedule() {
  const upcoming = useLiveQuery(loadUpcoming, [])

  return (
    <div className="sidebar-quick-schedule">
      <p className="sidebar-quick-schedule__title">Σήμερα</p>
      {upcoming && upcoming.length === 0 && (
        <p className="sidebar-quick-schedule__empty">Καμία εκκρεμής συνεδρία</p>
      )}
      {upcoming && upcoming.length > 0 && (
        <ul className="sidebar-quick-schedule__list">
          {upcoming.map((row, i) => (
            <li key={i} className="sidebar-quick-schedule__row">
              <span className="sidebar-quick-schedule__time">{row.time}</span>
              {row.isGroup && <Users size={12} aria-hidden="true" />}
              <span className="sidebar-quick-schedule__label">{row.label}</span>
            </li>
          ))}
        </ul>
      )}
      <Link to="/schedule" className="sidebar-quick-schedule__link">
        Πλήρες πρόγραμμα
        <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </div>
  )
}
