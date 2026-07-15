import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Users } from 'lucide-react'
import { db } from '../db.js'
import { todayLocalISO } from '../utils/date.js'
import { findExistingEntryStatus, existingEntryStatusLabel } from '../utils/dailyQueue.js'
import AppShell from './shell/AppShell.jsx'
import PageHeader from './ui/PageHeader.jsx'
import EmptyState from './ui/EmptyState.jsx'
import Button from './ui/Button.jsx'
import SelectableStudentRow from './SelectableStudentRow.jsx'
import './SelectStudent.css'

// Ξεχωριστό flow από το SelectIndividualStudent.jsx (ΟΧΙ mode flag πάνω σε εκείνο, βλ. Sprint 5
// Technical Plan) — εδώ η επιβεβαίωση προσθέτει μια γραμμή στη σημερινή «Η μέρα μου» αντί να
// μπαίνει κατευθείαν σε Teaching Mode. Επαναχρησιμοποιεί μόνο τα μικρά reusable κομμάτια
// (SelectableStudentRow, το κοινό SelectStudent.css) — δύο ξεχωριστά, μονο-σκοπικά components.
// Sprint 6: δέχεται προαιρετικό ?date= (χρησιμοποιείται από τη λεπτομέρεια ημέρας του
// ημερολογίου, βλ. DayDetailPage) — χωρίς αυτό συμπεριφέρεται ΑΚΡΙΒΩΣ όπως πριν (σήμερα, πίσω
// στην Αρχική), μηδενική αλλαγή στη ροή που ήδη εγκρίθηκε στο Sprint 5.
//
// Sprint 6, δεύτερος γύρος διορθώσεων — bug: επέτρεπε σιωπηλά δεύτερη γραμμή για μαθητή που έχει
// ήδη σημερινή εμφάνιση. Τώρα ελέγχει (findExistingEntryStatus) και αποτρέπει την επιλογή —
// disabled + εξήγηση, ΟΧΙ νέο flow «επαναφοράς από εδώ»: το «Πίσω» οδηγεί ήδη στην υπάρχουσα
// γραμμή, όπου ήδη υπάρχει «Επαναφορά στη σειρά» αν χρειάζεται.
export default function AddIndividualToToday() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const dateParam = searchParams.get('date')
  const date = dateParam || todayLocalISO()
  const [selectedId, setSelectedId] = useState(null)
  const [saving, setSaving] = useState(false)

  const allStudents = useLiveQuery(() => db.students.orderBy('code').toArray(), [])
  const dayData = useLiveQuery(() => Promise.all([
    db.dailyQueue.where('date').equals(date).toArray(),
    db.sessions.where('date').equals(date).toArray()
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
  const existingByStudentId = Object.fromEntries(
    students.map((s) => [s.id, findExistingEntryStatus([s.id], entries, sessionsToday)])
  )
  const selectionIsValid = selectedId !== null && students.some((s) => s.id === selectedId) && !existingByStudentId[selectedId]

  async function handleAdd() {
    setSaving(true)
    try {
      const existing = await db.dailyQueue.where('date').equals(date).toArray()
      const nextOrder = existing.reduce((max, e) => Math.max(max, e.order), -1) + 1
      await db.dailyQueue.add({ date, studentIds: [selectedId], order: nextOrder, status: 'pending' })
      navigate(dateParam ? `/schedule/day/${dateParam}` : '/')
    } finally {
      setSaving(false)
    }
  }

  const backTo = dateParam ? `/schedule/day/${dateParam}` : '/'

  return (
    <AppShell>
      <PageHeader
        title="Πρόσθεσε μαθητή στη μέρα μου"
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
            {students.map((s) => {
              const existing = existingByStudentId[s.id]
              return (
                <SelectableStudentRow
                  key={s.id}
                  code={s.code}
                  nickname={s.nickname}
                  selected={selectedId === s.id}
                  onSelect={() => setSelectedId(s.id)}
                  mode="single"
                  name="add-individual-today"
                  disabled={!!existing}
                  statusLabel={existing ? existingEntryStatusLabel(existing.status) : undefined}
                />
              )
            })}
          </div>

          <div className="select-student-actions">
            <Button variant="primary" icon={Plus} loading={saving} disabled={!selectionIsValid} onClick={handleAdd}>
              Πρόσθεσε στη μέρα μου
            </Button>
          </div>
        </>
      )}
    </AppShell>
  )
}
