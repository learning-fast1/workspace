import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db.js'
import { STATUSES, priorityLabel, sortByPriority } from '../config/goalOptions.js'
import { domainName } from '../config/domains.js'

export default function GoalsList({ studentId }) {
  const [showAll, setShowAll] = useState(false)

  const goals = useLiveQuery(
    () => db.goals.where('studentId').equals(studentId).toArray(),
    [studentId]
  )

  if (!goals) {
    return null
  }

  const visible = sortByPriority(goals.filter((g) => (showAll ? true : g.status === 'active')))

  async function changeStatus(goalId, status) {
    await db.goals.update(goalId, { status, statusChangedAt: new Date().toISOString() })
  }

  return (
    <div className="section">
      <div className="top-bar">
        <h2>Στόχοι</h2>
        <Link to={`/students/${studentId}/goals/new`} className="btn btn-primary">➕ Νέος στόχος</Link>
      </div>

      <label className="checkbox-row">
        <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
        Εμφάνιση όλων (όχι μόνο ενεργών)
      </label>

      {visible.length === 0 && <p className="empty-state">Δεν υπάρχουν στόχοι ακόμα.</p>}

      {visible.map((g) => (
        <div key={g.id} className="goal-card">
          <div className="goal-card-top">
            <div>
              <div><Link to={`/students/${studentId}/goals/${g.id}`}><strong>{g.title}</strong></Link></div>
              <div className="goal-domain">{domainName(g.domain)}</div>
            </div>
            <span className={`priority-badge priority-${g.priority}`}>{priorityLabel(g.priority)}</span>
          </div>
          {g.criterion && <p><strong>Κριτήριο:</strong> {g.criterion}</p>}
          <div className="actions-row">
            <select value={g.status} onChange={(e) => changeStatus(g.id, e.target.value)}>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <Link to={`/students/${studentId}/goals/${g.id}`} className="btn btn-secondary">📈 Πρόοδος</Link>
            <Link to={`/students/${studentId}/goals/${g.id}/edit`} className="btn btn-secondary">✏️ Επεξεργασία</Link>
          </div>
        </div>
      ))}
    </div>
  )
}
