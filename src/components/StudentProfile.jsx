import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db.js'
import FunctionalProfileEditor from './FunctionalProfileEditor.jsx'
import PreferencesEditor from './PreferencesEditor.jsx'
import GoalsList from './GoalsList.jsx'
import StudentTimeline from './StudentTimeline.jsx'

export default function StudentProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const studentId = Number(id)

  // Τρίτο όρισμα (null) = τιμή-σημάδι "δεν έχει τρέξει ακόμα το query" — χωρίς αυτό, το `undefined`
  // που επιστρέφει το useLiveQuery ΠΡΙΝ την πρώτη εκτέλεση είναι πανομοιότυπο με το `undefined` που
  // επιστρέφει ένα ΠΡΑΓΜΑΤΙΚΟ resolved query για μαθητή που δεν υπάρχει — χωρίς διάκριση, η οθόνη θα
  // έμενε για πάντα σε «Φόρτωση…» αντί να δείξει «δεν βρέθηκε» (π.χ. μετά από διαγραφή ή παλιό link).
  const student = useLiveQuery(() => db.students.get(studentId), [studentId], null)

  if (student === null) {
    return <div className="page">Φόρτωση…</div>
  }

  if (!student) {
    return (
      <div className="page">
        <p className="empty-state">Ο μαθητής δεν βρέθηκε.</p>
        <Link to="/students" className="btn btn-secondary">Πίσω στη λίστα</Link>
      </div>
    )
  }

  async function toggleActive() {
    await db.students.update(studentId, { active: !student.active })
  }

  async function handleFunctionalProfileChange(functionalProfile) {
    await db.students.update(studentId, { functionalProfile })
  }

  async function handlePreferencesChange(preferences) {
    await db.students.update(studentId, { preferences })
  }

  return (
    <div className="page" key={studentId}>
      <div className="top-bar">
        <Link to="/students" className="btn btn-link">← Πίσω</Link>
        {!student.active && <span className="badge-archived">Αρχειοθετημένος</span>}
      </div>

      <h1>{student.code}{student.nickname ? ` — ${student.nickname}` : ''}</h1>

      <div className="section">
        {student.grade && <p><strong>Τάξη:</strong> {student.grade}</p>}
        {student.notes && <p><strong>Σημειώσεις:</strong> {student.notes}</p>}
        <div className="actions-row">
          <button className="btn btn-secondary" onClick={() => navigate(`/students/${studentId}/edit`)}>
            ✏️ Επεξεργασία στοιχείων
          </button>
          <button className="btn btn-secondary" onClick={toggleActive}>
            {student.active ? '🗄️ Αρχειοθέτηση' : '↩️ Επαναφορά'}
          </button>
          <Link to={`/students/${studentId}/report`} className="btn btn-secondary">📄 Προσχέδιο έκθεσης</Link>
        </div>
      </div>

      <GoalsList studentId={studentId} />

      <StudentTimeline studentId={studentId} />

      <PreferencesEditor
        preferences={student.preferences || {}}
        onChange={handlePreferencesChange}
      />

      <FunctionalProfileEditor
        functionalProfile={student.functionalProfile || []}
        onChange={handleFunctionalProfileChange}
      />
    </div>
  )
}
