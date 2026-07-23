import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { PlayCircle, Users } from 'lucide-react'
import { activeTable } from '../migration/activeGeneration.js'
import AppShell from './shell/AppShell.jsx'
import PageHeader from './ui/PageHeader.jsx'
import EmptyState from './ui/EmptyState.jsx'
import Button from './ui/Button.jsx'
import SelectableStudentRow from './SelectableStudentRow.jsx'
import './SelectStudent.css'

// Ομαδικό: επιλογή πολλών μαθητών με checkboxes πριν την έναρξη του Teaching Mode. ΑΜΕΤΑΒΛΗΤΗ
// business logic — ίδιο query/φιλτράρισμα/route target, μόνο η παρουσίαση αλλάζει.
export default function SelectGroupStudents() {
  const navigate = useNavigate()
  const [selectedIds, setSelectedIds] = useState([])

  const allStudents = useLiveQuery(() => activeTable('students').orderBy('code').toArray(), [])

  if (!allStudents) {
    return (
      <AppShell>
        <p>Φόρτωση…</p>
      </AppShell>
    )
  }

  const students = allStudents.filter((s) => s.active)
  // Αν κάποιος επιλεγμένος μαθητής αρχειοθετήθηκε ενόσω ήταν ανοιχτή αυτή η οθόνη, αγνοείται στην Έναρξη.
  const activeIds = new Set(students.map((s) => s.id))
  const validSelectedIds = selectedIds.filter((id) => activeIds.has(id))

  function toggle(id) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]))
  }

  return (
    <AppShell>
      <PageHeader
        title="Ομαδικό — Επίλεξε μαθητές"
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
                selected={selectedIds.includes(s.id)}
                onSelect={() => toggle(s.id)}
                mode="multiple"
              />
            ))}
          </div>

          <div className="select-student-actions">
            <Button
              variant="primary"
              icon={PlayCircle}
              disabled={validSelectedIds.length === 0}
              onClick={() => navigate(`/teaching/session/${validSelectedIds.join(',')}`)}
            >
              Έναρξη
            </Button>
          </div>
        </>
      )}
    </AppShell>
  )
}
