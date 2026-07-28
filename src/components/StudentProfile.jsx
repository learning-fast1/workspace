import { useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { UserX } from 'lucide-react'
import { deleteStudent, setStudentActive } from '../db.js'
import { activeTable } from '../migration/activeGeneration.js'
import AppShell from './shell/AppShell.jsx'
import EmptyState from './ui/EmptyState.jsx'
import Tabs from './ui/Tabs.jsx'
import Modal from './ui/Modal.jsx'
import Button from './ui/Button.jsx'
import StudentProfileHero from './StudentProfileHero.jsx'
import StudentDashboardPanel from './StudentDashboardPanel.jsx'
import FunctionalProfileEditor from './FunctionalProfileEditor.jsx'
import PreferencesEditor from './PreferencesEditor.jsx'
import GoalsList from './GoalsList.jsx'
import StudentTimeline from './StudentTimeline.jsx'
import SessionHistory from './SessionHistory.jsx'
import ReportTab from './ReportTab.jsx'
import './StudentProfile.css'

const TABS = [
  { id: 'profile', label: 'Προφίλ' },
  { id: 'preferences', label: 'Ενισχυτές' },
  { id: 'goals', label: 'Στόχοι' },
  { id: 'sessions', label: 'Συνεδρίες' },
  { id: 'report', label: 'Έκθεση' }
]

export default function StudentProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const studentId = Number(id)
  // Από το HomeAttentionWidget (Technical Plan Στάδιο 13, σημείο 5) — best-effort, ΔΕΝ επιβιώνει
  // σε reload (react-router state). Το StudentDashboardPanel έχει ήδη ασφαλές fallback χωρίς αυτό.
  const focusGoalId = location.state?.focusGoalId ?? null
  // Smart Notifications (review χρήστη) — π.χ. μια ειδοποίηση «πρόχειρη αναφορά» πρέπει να ανοίγει
  // ΚΑΤΕΥΘΕΙΑΝ στο tab «Έκθεση», όχι στο προεπιλεγμένο «Στόχοι». Ίδιο idiom με το ήδη υπάρχον
  // location.state.focusGoalId — best-effort, ΔΕΝ επιβιώνει σε reload.
  const [activeTab, setActiveTab] = useState(location.state?.activeTab || 'goals')
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

  // null = «δεν έχει τρέξει ακόμα» (βλ. ίδιο μοτίβο ήδη στην παλιά υλοποίηση) — χωρίς αυτό, ένας
  // μαθητής που πραγματικά δεν υπάρχει δεν θα ξεχώριζε από «φορτώνει ακόμα».
  const student = useLiveQuery(() => activeTable('students').get(studentId), [studentId], null)

  if (student === null) {
    return (
      <AppShell>
        <p>Φόρτωση…</p>
      </AppShell>
    )
  }

  if (!student) {
    return (
      <AppShell>
        <EmptyState
          icon={UserX}
          title="Ο μαθητής δεν βρέθηκε"
          description="Μπορεί να διαγράφηκε ή ο σύνδεσμος να μην είναι πια έγκυρος."
          actionLabel="Επιστροφή στη λίστα μαθητών"
          actionTo="/students"
        />
      </AppShell>
    )
  }

  // Κεντρική, ατομική συνάρτηση (Technical Plan Στάδιο 9, σημείο 2) — αλλάζει student.active ΚΑΙ
  // ενημερώνει τη συμμετοχή σχολικού έτους στην ΙΔΙΑ συναλλαγή, αντί το component να κάνει δύο
  // ανεξάρτητες ενέργειες (db.students.update απευθείας, όπως πριν).
  async function toggleActive() {
    await setStudentActive(studentId, !student.active)
  }

  async function handleFunctionalProfileChange(functionalProfile) {
    await activeTable('students').update(studentId, { functionalProfile })
  }

  async function handlePreferencesChange(preferences) {
    await activeTable('students').update(studentId, { preferences })
  }

  async function handleConfirmDelete() {
    await deleteStudent(studentId)
    navigate('/students')
  }

  return (
    <AppShell key={studentId}>
      <StudentProfileHero
        code={student.code}
        nickname={student.nickname}
        grade={student.grade}
        active={student.active}
        sessionTo={`/teaching/session/${studentId}`}
        onBack={() => navigate('/students')}
        onEdit={() => navigate(`/students/${studentId}/edit`)}
        onToggleActive={toggleActive}
        onDelete={() => setConfirmDeleteOpen(true)}
      />

      {/* Πλήρης αντικατάσταση των παλιών 4 στατιστικών καρτών (Technical Plan Στάδιο 12, σημείο 1)
          — ΟΧΙ προσθήκη πάνω/κάτω από αυτές, ήδη αφαιρέθηκαν εντελώς από το StudentProfileHero. */}
      <StudentDashboardPanel studentId={studentId} focusGoalId={focusGoalId} />

      <Tabs tabs={TABS} activeId={activeTab} onChange={setActiveTab} />

      {/* Όλα τα tab panels μένουν ΠΑΝΤΑ mounted (hidden attribute, όχι conditional unmount) — αλλιώς
          η εναλλαγή tab θα πετούσε π.χ. ένα μισο-γραμμένο προσχέδιο έκθεσης στο tab Έκθεση. */}
      <div role="tabpanel" id="tabpanel-profile" aria-labelledby="tab-profile" hidden={activeTab !== 'profile'}>
        {student.notes && (
          <div className="student-profile__notes">
            <h3 className="student-profile__notes-title">Σημειώσεις</h3>
            <p className="student-profile__notes-text">{student.notes}</p>
          </div>
        )}
        <FunctionalProfileEditor
          functionalProfile={student.functionalProfile || []}
          onChange={handleFunctionalProfileChange}
        />
      </div>
      <div role="tabpanel" id="tabpanel-preferences" aria-labelledby="tab-preferences" hidden={activeTab !== 'preferences'}>
        <PreferencesEditor preferences={student.preferences || {}} onChange={handlePreferencesChange} />
      </div>
      <div role="tabpanel" id="tabpanel-goals" aria-labelledby="tab-goals" hidden={activeTab !== 'goals'}>
        <GoalsList studentId={studentId} />
      </div>
      <div role="tabpanel" id="tabpanel-sessions" aria-labelledby="tab-sessions" hidden={activeTab !== 'sessions'}>
        <SessionHistory studentId={studentId} embedded />
        {/* Δευτερεύουσα προβολή — η αφηγηματική χρονολόγηση (goals/sessions/observations μαζί) δεν
            χάνεται, απλά δεν κυριαρχεί πλέον οπτικά. Native <details> αντί για tab: αποφεύγει nested
            tabs-μέσα-σε-tab, μηδενικό επιπλέον state, δωρεάν προσβασιμότητα (πληκτρολόγιο/screen reader). */}
        <details className="student-profile__activity-history">
          <summary>Ιστορικό δραστηριότητας</summary>
          <StudentTimeline studentId={studentId} />
        </details>
      </div>
      <div role="tabpanel" id="tabpanel-report" aria-labelledby="tab-report" hidden={activeTab !== 'report'}>
        <ReportTab student={student} studentId={studentId} />
      </div>

      <Modal
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        title={`Οριστική διαγραφή «${student.code}»`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDeleteOpen(false)}>Ακύρωση</Button>
            <Button variant="danger" onClick={handleConfirmDelete}>Διαγραφή οριστικά</Button>
          </>
        }
      >
        <p>Θα διαγραφούν επίσης όλοι οι στόχοι, οι μετρήσεις και οι παρατηρήσεις του. Δεν αναιρείται.</p>
      </Modal>
    </AppShell>
  )
}
