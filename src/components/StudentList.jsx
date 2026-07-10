import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, deleteStudent } from '../db.js'
import TrashIcon from './icons/TrashIcon.jsx'

export default function StudentList() {
  const [showArchived, setShowArchived] = useState(false)

  const students = useLiveQuery(
    () => db.students.orderBy('code').toArray(),
    []
  )

  if (!students) {
    return <div className="page">Φόρτωση…</div>
  }

  const visible = students.filter((s) => (showArchived ? true : s.active))

  async function handleDelete(s) {
    const label = s.nickname ? `${s.code} — ${s.nickname}` : s.code
    if (!window.confirm(`Οριστική διαγραφή του «${label}»;\n\nΘα διαγραφούν επίσης όλοι οι στόχοι, οι μετρήσεις και οι παρατηρήσεις του. Δεν αναιρείται.`)) {
      return
    }
    await deleteStudent(s.id)
  }

  return (
    <div className="page">
      <div className="top-bar">
        <Link to="/" className="btn btn-link">← Αρχική</Link>
      </div>

      <div className="top-bar">
        <h1>Μαθητές</h1>
        <Link to="/students/new" className="btn btn-primary">➕ Νέος μαθητής</Link>
      </div>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(e) => setShowArchived(e.target.checked)}
        />
        Εμφάνιση αρχειοθετημένων
      </label>

      {visible.length === 0 && (
        <p className="empty-state">Δεν υπάρχουν μαθητές ακόμα.</p>
      )}

      {visible.map((s) => (
        <div key={s.id} className="student-card">
          {/* Ξεχωριστό στοιχείο από το κουμπί διαγραφής — ένα <button> μέσα σε <a> είναι άκυρο HTML
              και μπερδεύει screen readers, ακόμα κι αν λειτουργικά «δουλεύει» με stopPropagation. */}
          <Link to={`/students/${s.id}`} className="student-card-link">
            <span className="code">{s.code}</span>
            {s.nickname ? <span className="nickname"> — {s.nickname}</span> : null}
            {!s.active && <span className="badge-archived">Αρχειοθετημένος</span>}
          </Link>
          <button
            type="button"
            className="btn-icon-delete"
            aria-label={`Διαγραφή ${s.code}`}
            onClick={() => handleDelete(s)}
          >
            <TrashIcon />
          </button>
        </div>
      ))}
    </div>
  )
}
