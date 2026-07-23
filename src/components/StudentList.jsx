import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { SearchX, UserPlus, Users } from 'lucide-react'
import { deleteStudent, setStudentActive } from '../db.js'
import { activeTable } from '../migration/activeGeneration.js'
import { formatDateEl } from '../utils/date.js'
import AppShell from './shell/AppShell.jsx'
import PageHeader from './ui/PageHeader.jsx'
import SearchBar from './ui/SearchBar.jsx'
import EmptyState from './ui/EmptyState.jsx'
import Modal from './ui/Modal.jsx'
import Button from './ui/Button.jsx'
import ToggleRow from './ui/ToggleRow.jsx'
import StudentCard from './StudentCard.jsx'
import './StudentList.css'

// Συγκεντρωτικό, καθαρά αναγνωστικό query — ΕΝΑ query ανά πίνακα (students/goals/sessions) για
// ΟΛΟΥΣ τους μαθητές μαζί, όχι ένα query ανά μαθητή. Έτσι το StudentCard μένει καθαρά presentational
// (μηδενικές δικές του queries) χωρίς να δημιουργείται πρόβλημα N+1.
async function loadStudentsWithStats() {
  const [students, goals, sessions] = await Promise.all([
    activeTable('students').orderBy('code').toArray(),
    activeTable('goals').where('status').equals('active').toArray(),
    activeTable('sessions').toArray()
  ])

  const activeGoalsByStudent = {}
  for (const g of goals) {
    activeGoalsByStudent[g.studentId] = (activeGoalsByStudent[g.studentId] || 0) + 1
  }

  // Τελευταία συνεδρία ανά μαθητή — εξαιρούνται οι απουσίες (ίδια σύμβαση με StudentTimeline/reportText:
  // μια συνεδρία όπου ο μαθητής ήταν απών δεν μετράει ως δική του συνεδρία).
  const lastSessionByStudent = {}
  for (const s of sessions) {
    for (const studentId of s.studentIds) {
      if (s.absentStudentIds?.includes(studentId)) continue
      if (!lastSessionByStudent[studentId] || s.date > lastSessionByStudent[studentId]) {
        lastSessionByStudent[studentId] = s.date
      }
    }
  }

  return students.map((s) => ({
    ...s,
    activeGoalsCount: activeGoalsByStudent[s.id] || 0,
    lastSessionDate: lastSessionByStudent[s.id] || null
  }))
}

function matchesSearch(student, query) {
  if (!query) return true
  return (
    student.code?.toLowerCase().includes(query) ||
    student.nickname?.toLowerCase().includes(query) ||
    student.grade?.toLowerCase().includes(query)
  )
}

export default function StudentList() {
  const navigate = useNavigate()
  const [showArchived, setShowArchived] = useState(false)
  const [search, setSearch] = useState('')
  const [pendingDelete, setPendingDelete] = useState(null) // { id, code } | null

  const students = useLiveQuery(loadStudentsWithStats, [])

  const activeCount = useMemo(() => (students || []).filter((s) => s.active).length, [students])

  const visibleStudents = useMemo(() => {
    if (!students) return []
    const byArchived = students.filter((s) => (showArchived ? true : s.active))
    const q = search.trim().toLowerCase()
    if (!q) return byArchived
    return byArchived.filter((s) => matchesSearch(s, q))
  }, [students, showArchived, search])

  // Bugfix (βρέθηκε κατά τη διερεύνηση για το Στάδιο 10): αυτό το σημείο έκανε ακόμα απευθείας
  // db.students.update({active}), παρακάμπτοντας το atomic setStudentActive του Σταδίου 9 — η
  // αρχειοθέτηση από τη λίστα μαθητών δεν ενημέρωνε ποτέ τη συμμετοχή σχολικού έτους.
  async function handleToggleActive(student) {
    await setStudentActive(student.id, !student.active)
  }

  async function handleConfirmDelete() {
    if (!pendingDelete) return
    await deleteStudent(pendingDelete.id)
    setPendingDelete(null)
  }

  if (!students) {
    return (
      <AppShell>
        <p>Φόρτωση…</p>
      </AppShell>
    )
  }

  const noStudentsAtAll = students.length === 0
  const noResultsForFilter = !noStudentsAtAll && visibleStudents.length === 0

  return (
    <AppShell>
      <PageHeader
        title="Μαθητές"
        subtitle={`${activeCount} ${activeCount === 1 ? 'ενεργός μαθητής' : 'ενεργοί μαθητές'}`}
        primaryAction={{ label: 'Νέος μαθητής', icon: UserPlus, to: '/students/new' }}
      />

      {!noStudentsAtAll && (
        <div className="student-list-toolbar">
          <SearchBar
            value={search}
            onChange={setSearch}
            onClear={() => setSearch('')}
            placeholder="Αναζήτηση με κωδικό, όνομα ή τάξη…"
          />
          <ToggleRow checked={showArchived} onChange={setShowArchived} className="student-list-toggle">
            Εμφάνιση αρχειοθετημένων
          </ToggleRow>
        </div>
      )}

      {/* Mobile review (product polish): ΧΩΡΙΣ δικό του CTA — το PageHeader έχει ήδη primaryAction
          «Νέος μαθητής» προς το ίδιο /students/new. Κανόνας: header action κερδίζει, όχι διπλό. */}
      {noStudentsAtAll && (
        <EmptyState
          icon={Users}
          title="Δεν υπάρχουν μαθητές ακόμα"
          description="Πρόσθεσε τον πρώτο μαθητή για να ξεκινήσεις."
        />
      )}

      {noResultsForFilter && (
        <EmptyState
          icon={SearchX}
          title="Δεν βρέθηκαν μαθητές"
          description="Δοκίμασε διαφορετικό όρο αναζήτησης ή ενεργοποίησε την εμφάνιση αρχειοθετημένων."
          actionLabel="Καθαρισμός αναζήτησης"
          onAction={() => setSearch('')}
        />
      )}

      {visibleStudents.length > 0 && (
        <div className="student-list-grid">
          {visibleStudents.map((s) => (
            <StudentCard
              key={s.id}
              id={s.id}
              code={s.code}
              nickname={s.nickname}
              grade={s.grade}
              active={s.active}
              activeGoalsCount={s.activeGoalsCount}
              lastSessionLabel={s.lastSessionDate ? formatDateEl(s.lastSessionDate) : 'Καμία συνεδρία ακόμα'}
              onEdit={() => navigate(`/students/${s.id}/edit`)}
              onToggleActive={() => handleToggleActive(s)}
              onDelete={() => setPendingDelete({ id: s.id, code: s.code })}
            />
          ))}
        </div>
      )}

      <Modal
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title={`Οριστική διαγραφή «${pendingDelete?.code}»`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>Ακύρωση</Button>
            <Button variant="danger" onClick={handleConfirmDelete}>Διαγραφή οριστικά</Button>
          </>
        }
      >
        <p>Θα διαγραφούν επίσης όλοι οι στόχοι, οι μετρήσεις και οι παρατηρήσεις του. Δεν αναιρείται.</p>
      </Modal>
    </AppShell>
  )
}
