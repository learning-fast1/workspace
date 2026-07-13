import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { PlayCircle, Users } from 'lucide-react'
import { db } from '../db.js'
import AppShell from './shell/AppShell.jsx'
import PageHeader from './ui/PageHeader.jsx'
import EmptyState from './ui/EmptyState.jsx'
import Button from './ui/Button.jsx'
import SelectableStudentRow from './SelectableStudentRow.jsx'
import './SelectStudent.css'

// Ατομικό: επιλογή ενός μαθητή πριν την έναρξη του Teaching Mode. ΑΜΕΤΑΒΛΗΤΗ business logic
// (ίδιο query/φιλτράρισμα/route target) — μόνο η παρουσίαση αλλάζει.
export default function SelectIndividualStudent() {
  const navigate = useNavigate()
  const [selectedId, setSelectedId] = useState(null)

  const allStudents = useLiveQuery(() => db.students.orderBy('code').toArray(), [])

  if (!allStudents) {
    return (
      <AppShell>
        <p>Φόρτωση…</p>
      </AppShell>
    )
  }

  const students = allStudents.filter((s) => s.active)
  // Αν ο επιλεγμένος μαθητής αρχειοθετήθηκε ενόσω ήταν ανοιχτή αυτή η οθόνη, η επιλογή ακυρώνεται.
  const selectionIsValid = selectedId !== null && students.some((s) => s.id === selectedId)

  return (
    <AppShell>
      <PageHeader
        title="Ατομικό — Επίλεξε μαθητή"
        back={{ label: 'Πίσω', onClick: () => navigate('/') }}
      />

      {students.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Δεν υπάρχουν ενεργοί μαθητές"
          description="Πρόσθεσε μαθητή από τη λίστα μαθητών για να ξεκινήσεις συνεδρία."
          actionLabel="Λίστα μαθητών"
          actionTo="/students"
        />
      ) : (
        <>
          <div className="select-student-list">
            {students.map((s) => (
              <SelectableStudentRow
                key={s.id}
                code={s.code}
                nickname={s.nickname}
                selected={selectedId === s.id}
                onSelect={() => setSelectedId(s.id)}
                mode="single"
                name="individual-student"
              />
            ))}
          </div>

          <div className="select-student-actions">
            <Button
              variant="primary"
              icon={PlayCircle}
              disabled={!selectionIsValid}
              onClick={() => navigate(`/teaching/session/${selectedId}`)}
            >
              Έναρξη
            </Button>
          </div>
        </>
      )}
    </AppShell>
  )
}
