import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Users } from 'lucide-react'
import { activeTable, withNewRowId } from '../migration/activeGeneration.js'
import { todayLocalISO } from '../utils/date.js'
import { findExistingEntryStatus, existingEntryStatusLabel } from '../utils/dailyQueue.js'
import AppShell from './shell/AppShell.jsx'
import PageHeader from './ui/PageHeader.jsx'
import EmptyState from './ui/EmptyState.jsx'
import Button from './ui/Button.jsx'
import SelectableStudentRow from './SelectableStudentRow.jsx'
import './SelectStudent.css'

// Ξεχωριστό flow από το SelectGroupStudents.jsx (ΟΧΙ mode flag πάνω σε εκείνο, βλ. Sprint 5
// Technical Plan) — εδώ η επιβεβαίωση προσθέτει ΜΙΑ γραμμή-ομάδα στη σημερινή «Η μέρα μου» αντί
// να μπαίνει κατευθείαν σε Teaching Mode. Επαναχρησιμοποιεί μόνο τα μικρά reusable κομμάτια
// (SelectableStudentRow, το κοινό SelectStudent.css). Sprint 6: προαιρετικό ?date=, ίδιο σκεπτικό
// με το AddIndividualToToday.jsx — χωρίς αυτό, ίδια συμπεριφορά με πριν.
//
// Sprint 6, δεύτερος γύρος διορθώσεων — bug: επέτρεπε σιωπηλά δεύτερη γραμμή για ΑΚΡΙΒΩΣ το ίδιο
// σύνολο μαθητών. Ο έλεγχος (findExistingEntryStatus) συγκρίνει ΣΥΝΟΛΑ (ανεξάρτητα σειράς) — μια
// διαφορετική ομάδα που απλώς μοιράζεται έναν μαθητή με μια υπάρχουσα γραμμή ΔΕΝ μπλοκάρεται, όπως
// ζητήθηκε ρητά. Ο έλεγχος γίνεται στο ΤΡΕΧΟΝ επιλεγμένο σύνολο, όχι ανά-γραμμή (η ομάδα χτίζεται
// σταδιακά με checkboxes, όχι με ένα κλικ όπως η ατομική προσθήκη).
export default function AddGroupToToday() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const dateParam = searchParams.get('date')
  const date = dateParam || todayLocalISO()
  const [selectedIds, setSelectedIds] = useState([])
  const [saving, setSaving] = useState(false)

  const allStudents = useLiveQuery(() => activeTable('students').orderBy('code').toArray(), [])
  const dayData = useLiveQuery(() => Promise.all([
    activeTable('dailyQueue').where('date').equals(date).toArray(),
    activeTable('sessions').where('date').equals(date).toArray()
  ]), [date])

  if (!allStudents || !dayData) {
    return (
      <AppShell>
        <p>Φόρτωση…</p>
      </AppShell>
    )
  }

  const [entries, sessionsToday] = dayData
  const students = allStudents.filter((s) => s.active)
  const activeIds = new Set(students.map((s) => s.id))
  const validSelectedIds = selectedIds.filter((id) => activeIds.has(id))
  const existingMatch = validSelectedIds.length > 0 ? findExistingEntryStatus(validSelectedIds, entries, sessionsToday) : null

  function toggle(id) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]))
  }

  async function handleAdd() {
    setSaving(true)
    try {
      const dailyQueueTable = activeTable('dailyQueue')
      const existing = await dailyQueueTable.where('date').equals(date).toArray()
      const nextOrder = existing.reduce((max, e) => Math.max(max, e.order), -1) + 1
      await dailyQueueTable.add(withNewRowId({ date, studentIds: validSelectedIds, order: nextOrder, status: 'pending' }))
      navigate(dateParam ? `/schedule/day/${dateParam}` : '/')
    } finally {
      setSaving(false)
    }
  }

  const backTo = dateParam ? `/schedule/day/${dateParam}` : '/'

  return (
    <AppShell>
      <PageHeader
        title="Πρόσθεσε ομάδα στη μέρα μου"
        back={{ label: 'Πίσω', onClick: () => navigate(backTo) }}
      />

      {students.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Δεν υπάρχουν ενεργοί μαθητές"
          description="Πρόσθεσε μαθητή από τη λίστα μαθητών πρώτα."
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

          {existingMatch && (
            <p className="select-student-warning">
              Αυτή η ακριβής ομάδα υπάρχει ήδη σήμερα — {existingEntryStatusLabel(existingMatch.status).toLowerCase()}.
            </p>
          )}

          <div className="select-student-actions">
            <Button variant="primary" icon={Plus} loading={saving} disabled={validSelectedIds.length === 0 || !!existingMatch} onClick={handleAdd}>
              Πρόσθεσε στη μέρα μου
            </Button>
          </div>
        </>
      )}
    </AppShell>
  )
}
