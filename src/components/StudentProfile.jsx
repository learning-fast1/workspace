import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { UserX } from 'lucide-react'
import { db, deleteStudent } from '../db.js'
import { sessionDateMap } from '../utils/sessions.js'
import { measurementNumericValue, parseCriterionTarget } from '../utils/measurementValue.js'
import { formatDateElShort } from '../utils/date.js'
import AppShell from './shell/AppShell.jsx'
import EmptyState from './ui/EmptyState.jsx'
import Tabs from './ui/Tabs.jsx'
import Modal from './ui/Modal.jsx'
import Button from './ui/Button.jsx'
import StudentProfileHero from './StudentProfileHero.jsx'
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

// Συγκεντρωτικό query για τα 4 στατιστικά του Hero — ίδιο πνεύμα με το loadDashboardStats του
// Home.jsx (ξεχωριστό, μικρό aggregate query ανά ενότητα οθόνης, όχι κοινόχρηστο cross-component
// state). «Στόχοι στο κριτήριο»: μόνο ενεργοί στόχοι με μετρήσιμη τελευταία τιμή ΚΑΙ αναγνωρίσιμο
// κριτήριο μετράνε ως «στο κριτήριο» — οι υπόλοιποι (π.χ. duration, ή χωρίς ακόμα μέτρηση)
// παραμένουν στον παρονομαστή αλλά όχι στον αριθμητή, ώστε να μη δείχνουμε fake ακρίβεια.
async function loadHeroStats(studentId) {
  const [goals, measurements, sessions] = await Promise.all([
    db.goals.where('studentId').equals(studentId).toArray(),
    db.measurements.where('studentId').equals(studentId).toArray(),
    db.sessions.toArray()
  ])
  const sessionDateById = sessionDateMap(sessions)
  const activeGoals = goals.filter((g) => g.status === 'active')

  let atCriterionCount = 0
  for (const g of activeGoals) {
    const goalMeasurements = measurements
      .filter((m) => m.goalId === g.id)
      .map((m) => ({ ...m, date: sessionDateById[m.sessionId] }))
      .filter((m) => m.date)
      .sort((a, b) => a.date.localeCompare(b.date))
    const latest = goalMeasurements[goalMeasurements.length - 1]
    if (!latest) continue
    // Το duration εξαιρείται σκόπιμα: η κατεύθυνση του «καλού» δεν είναι πάντα σαφής (π.χ. διάρκεια
    // δραστηριότητας θέλουμε να ΑΥΞΗΘΕΙ, διάρκεια δύσκολης συμπεριφοράς θέλουμε να ΜΕΙΩΘΕΙ) — μια απλή
    // "τιμή >= κριτήριο" σύγκριση θα έδειχνε ψευδώς «στο κριτήριο» ανεξάρτητα από ποια κατεύθυνση ισχύει.
    if (g.measurementType === 'duration') continue
    const numericValue = measurementNumericValue(g.measurementType, latest.value)
    const criterionTarget = parseCriterionTarget(g.criterion, g.measurementType)
    if (numericValue !== null && criterionTarget !== null && numericValue >= criterionTarget) {
      atCriterionCount++
    }
  }

  let totalSessions = 0
  let lastSessionDate = null
  for (const s of sessions) {
    if (!s.studentIds?.includes(studentId)) continue
    if (s.absentStudentIds?.includes(studentId)) continue
    // Sprint 6: μια συνεδρία που καταγράφηκε απευθείας ως notHeld (δεν πραγματοποιήθηκε) δεν
    // μετράει ως πραγματική συνεδρία εδώ — ίδιο σκεπτικό με το absentStudentIds παραπάνω.
    if (s.status === 'notHeld') continue
    totalSessions++
    if (!lastSessionDate || s.date > lastSessionDate) lastSessionDate = s.date
  }

  return {
    activeGoalsCount: activeGoals.length,
    totalSessions,
    goalsAtCriterionLabel: activeGoals.length > 0 ? `${atCriterionCount}/${activeGoals.length}` : '—',
    lastSessionLabel: lastSessionDate ? formatDateElShort(lastSessionDate) : 'Καμία ακόμα'
  }
}

export default function StudentProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const studentId = Number(id)
  const [activeTab, setActiveTab] = useState('goals')
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

  // null = «δεν έχει τρέξει ακόμα» (βλ. ίδιο μοτίβο ήδη στην παλιά υλοποίηση) — χωρίς αυτό, ένας
  // μαθητής που πραγματικά δεν υπάρχει δεν θα ξεχώριζε από «φορτώνει ακόμα».
  const student = useLiveQuery(() => db.students.get(studentId), [studentId], null)
  const heroStats = useLiveQuery(() => loadHeroStats(studentId), [studentId])

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

  async function toggleActive() {
    await db.students.update(studentId, { active: !student.active })
  }

  async function handleFunctionalProfileChange(functionalProfile) {
    await db.students.update(studentId, { functionalProfile })
  }

  async function handlePreferencesChange(preferences) {
    await db.students.update(studentId, { preferences })
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
        activeGoalsCount={heroStats ? heroStats.activeGoalsCount : '—'}
        totalSessions={heroStats ? heroStats.totalSessions : '—'}
        goalsAtCriterionLabel={heroStats ? heroStats.goalsAtCriterionLabel : '—'}
        lastSessionLabel={heroStats ? heroStats.lastSessionLabel : '—'}
        sessionTo={`/teaching/session/${studentId}`}
        onBack={() => navigate('/students')}
        onEdit={() => navigate(`/students/${studentId}/edit`)}
        onToggleActive={toggleActive}
        onDelete={() => setConfirmDeleteOpen(true)}
      />

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
