import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db.js'

// Ομαδικό: επιλογή πολλών μαθητών με checkboxes πριν την έναρξη του Teaching Mode.
export default function SelectGroupStudents() {
  const navigate = useNavigate()
  const [selectedIds, setSelectedIds] = useState([])

  const allStudents = useLiveQuery(
    () => db.students.orderBy('code').toArray(),
    []
  )

  if (!allStudents) {
    return <div className="page">Φόρτωση…</div>
  }

  const students = allStudents.filter((s) => s.active)
  // Αν κάποιος επιλεγμένος μαθητής αρχειοθετήθηκε ενόσω ήταν ανοιχτή αυτή η οθόνη, αγνοείται στην Έναρξη.
  const activeIds = new Set(students.map((s) => s.id))
  const validSelectedIds = selectedIds.filter((id) => activeIds.has(id))

  function toggle(id) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]))
  }

  return (
    <div className="page">
      <div className="top-bar">
        <Link to="/" className="btn btn-link">← Πίσω</Link>
      </div>

      <h1>Ομαδικό — Επίλεξε μαθητές</h1>

      {students.length === 0 && (
        <p className="empty-state">Δεν υπάρχουν ενεργοί μαθητές. Πρόσθεσε μαθητή από τη λίστα.</p>
      )}

      {students.map((s) => (
        <label key={s.id} className="student-card select-student-checkbox">
          <span>
            <input
              type="checkbox"
              checked={selectedIds.includes(s.id)}
              onChange={() => toggle(s.id)}
            />
            {' '}
            <span className="code">{s.code}</span>
            {s.nickname ? <span className="nickname"> — {s.nickname}</span> : null}
          </span>
        </label>
      ))}

      <div className="actions-row">
        <button
          type="button"
          className="btn btn-primary"
          disabled={validSelectedIds.length === 0}
          onClick={() => navigate(`/teaching/session/${validSelectedIds.join(',')}`)}
        >
          Έναρξη →
        </button>
      </div>
    </div>
  )
}
