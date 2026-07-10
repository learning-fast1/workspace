import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db.js'

// Ατομικό: επιλογή ενός μαθητή πριν την έναρξη του Teaching Mode.
export default function SelectIndividualStudent() {
  const navigate = useNavigate()
  const [selectedId, setSelectedId] = useState(null)

  const allStudents = useLiveQuery(
    () => db.students.orderBy('code').toArray(),
    []
  )

  if (!allStudents) {
    return <div className="page">Φόρτωση…</div>
  }

  const students = allStudents.filter((s) => s.active)
  // Αν ο επιλεγμένος μαθητής αρχειοθετήθηκε ενόσω ήταν ανοιχτή αυτή η οθόνη, η επιλογή ακυρώνεται.
  const selectionIsValid = selectedId !== null && students.some((s) => s.id === selectedId)

  return (
    <div className="page">
      <div className="top-bar">
        <Link to="/" className="btn btn-link">← Πίσω</Link>
      </div>

      <h1>Ατομικό — Επίλεξε μαθητή</h1>

      {students.length === 0 && (
        <p className="empty-state">Δεν υπάρχουν ενεργοί μαθητές. Πρόσθεσε μαθητή από τη λίστα.</p>
      )}

      {students.map((s) => (
        <button
          key={s.id}
          type="button"
          className={`student-card select-student-card ${selectedId === s.id ? 'selected' : ''}`}
          onClick={() => setSelectedId(s.id)}
        >
          <span>
            <span className="code">{s.code}</span>
            {s.nickname ? <span className="nickname"> — {s.nickname}</span> : null}
          </span>
          {selectedId === s.id && <span>✓</span>}
        </button>
      ))}

      <div className="actions-row">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!selectionIsValid}
          onClick={() => navigate(`/teaching/session/${selectedId}`)}
        >
          Έναρξη →
        </button>
      </div>
    </div>
  )
}
