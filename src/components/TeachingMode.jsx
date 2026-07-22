import { useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ChevronLeft, ChevronRight, CircleCheck, MessageSquarePlus, UserCheck, UserX, X
} from 'lucide-react'
import { db, transitionGoalStatus } from '../db.js'
import { isEmptyRecordedValue } from '../utils/measurementTypes/index.js'
import { sortByPriority } from '../config/goalOptions.js'
import { DURATION_OPTIONS } from '../config/sessionOptions.js'
import { domainName } from '../config/domains.js'
import { todayLocalISO } from '../utils/date.js'
import '../design/tokens.css'
import Button from './ui/Button.jsx'
import Modal from './ui/Modal.jsx'
import FormField from './ui/FormField.jsx'
import Input from './ui/Input.jsx'
import DateField from './ui/DateField.jsx'
import Select from './ui/Select.jsx'
import Textarea from './ui/Textarea.jsx'
import MoodPicker from './ui/MoodPicker.jsx'
import EmptyState from './ui/EmptyState.jsx'
import Tabs from './ui/Tabs.jsx'
import ToggleRow from './ui/ToggleRow.jsx'
import GoalRecorderCard from './GoalRecorderCard.jsx'
import './TeachingMode.css'

// Teaching Mode: πλήρης οθόνη, μόνο οι ενεργοί στόχοι, καταχώρηση με ένα tap. Εξαιρείται ρητά από
// το AppShell (COMPONENT_GUIDE.md) — καμία sidebar/header πλοήγηση, μηδενική περίσπαση. Εφαρμόζουμε
// όμως την κλάση "app-shell" στο root ώστε να έχουμε πρόσβαση στα ίδια design tokens/components
// (Button/Card/Modal...) χωρίς να εμφανίζεται καμία από τη sidebar/header/bottom-nav πλοήγηση —
// αυτά τα δύο πράγματα (tokens vs πλοήγηση) είναι ανεξάρτητα στο src/design/tokens.css.
//
// Ατομικό = ένας μαθητής στο studentIds. Ομαδικό = πολλοί· μία κάρτα ανά μαθητή, swipe μεταξύ τους.
// ΑΜΕΤΑΒΛΗΤΟ workflow ολοκλήρωσης συνεδρίας (status πάντα 'completed', activity/note πάντα κενά) —
// μόνο η παρουσίαση αλλάζει σε αυτό το sprint.
export default function TeachingMode() {
  const { studentIds: studentIdsParam } = useParams()
  const navigate = useNavigate()
  const studentIds = useMemo(() => studentIdsParam.split(',').map(Number), [studentIdsParam])
  const isGroup = studentIds.length > 1

  const [studentPage, setStudentPage] = useState(0)
  // UX improvement (accordion): μόνο ένας στόχος ανοιχτός τη φορά· null = όλοι συμπτυγμένοι.
  // Μηδενίζεται σε αλλαγή μαθητή/tab (changeStudentPage) — κάθε μαθητής ξεκινά με όλους κλειστούς.
  const [expandedGoalId, setExpandedGoalId] = useState(null)
  const [absentIds, setAbsentIds] = useState(() => new Set())
  const [measurements, setMeasurements] = useState({})
  // Single-level αναίρεση ανά goalId: η τιμή ΠΡΙΝ την τελευταία αλλαγή. Ύπαρξη του key (όχι η τιμή
  // του) δείχνει αν υπάρχει κάτι να αναιρεθεί — βλ. canUndo/undoMeasurement παρακάτω.
  const [previousMeasurements, setPreviousMeasurements] = useState({})
  // Κλινική εκτίμηση ανά στόχο (συμπληρωματική του measurement) — { [goalId]: { rating, note } }.
  // Απουσία key = καμία εκτίμηση, ΠΟΤΕ συνάγεται αυτόματα. Καμία ανάγκη undo ξεχωριστό από το
  // click-to-deselect του ίδιου του GoalClinicalAssessment (βλ. updateClinicalAssessment παρακάτω).
  const [clinicalAssessments, setClinicalAssessments] = useState({})
  const [observationOpen, setObservationOpen] = useState(false)
  const [endSessionOpen, setEndSessionOpen] = useState(false)
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false)
  const [sessionDate, setSessionDate] = useState(todayLocalISO)
  const [sessionDuration, setSessionDuration] = useState(null)
  const [customDuration, setCustomDuration] = useState('')
  // Διάθεση μαθητή κατά τη συνεδρία — προαιρετική, ανά μαθητή (Sprint 5). { [studentId]: moodValue }.
  const [moods, setMoods] = useState({})
  const [savingSession, setSavingSession] = useState(false)
  const [saveError, setSaveError] = useState(null)
  // Ref εκτός από state: το setState δεν εφαρμόζεται συγχρονισμένα, οπότε δύο κλικ στο ίδιο tick
  // (γρήγορο διπλό tap) θα διάβαζαν και τα δύο το παλιό savingSession=false. Το ref ενημερώνεται αμέσως.
  const savingSessionRef = useRef(false)

  // bulkGet επιστρέφει undefined στη θέση κάθε μαθητή που διαγράφηκε (π.χ. από άλλη καρτέλα/συσκευή)
  // ενόσω η συνεδρία ήταν ανοιχτή — φιλτράρεται εδώ ώστε να μη σκάει το rendering παρακάτω.
  const rawStudents = useLiveQuery(() => db.students.bulkGet(studentIds), [studentIdsParam])
  const allGoals = useLiveQuery(
    () => db.goals.where('studentId').anyOf(studentIds).and((g) => g.status === 'active').toArray(),
    [studentIdsParam]
  )

  if (!rawStudents || !allGoals) {
    return <div className="app-shell teaching-mode"><p>Φόρτωση…</p></div>
  }

  const students = rawStudents.filter(Boolean)

  if (students.length === 0) {
    return (
      <div className="app-shell teaching-mode">
        <EmptyState
          icon={UserX}
          title="Οι μαθητές αυτής της συνεδρίας δεν υπάρχουν πια"
          description="Μπορεί να διαγράφηκαν ενόσω ήταν ανοιχτή αυτή η συνεδρία."
          actionLabel="Αρχική"
          actionTo="/"
        />
      </div>
    )
  }

  const goalStudentMap = Object.fromEntries(allGoals.map((g) => [g.id, g.studentId]))
  // Στάδιο 8 — χρειάζεται για να ξέρουμε ΠΟΙΟΥ τύπου είναι κάθε goalId στο handleSaveSession
  // παρακάτω (isEmptyRecordedValue), ώστε π.χ. ένα άθικτο textarea Περιγραφικής παρατήρησης να ΜΗΝ
  // παράγει κενή εγγραφή measurement.
  const goalTypeMap = Object.fromEntries(allGoals.map((g) => [g.id, g.measurementType]))

  function goalsFor(studentId) {
    return sortByPriority(allGoals.filter((g) => g.studentId === studentId))
  }

  // clamp: αν διαγράφηκε ο μαθητής που ήταν στην τελευταία σελίδα, η σελίδα μπορεί να μείνει εκτός ορίων.
  const currentStudent = students[Math.min(studentPage, students.length - 1)]
  const currentStudentGoals = currentStudent ? goalsFor(currentStudent.id) : []
  const isCurrentAbsent = currentStudent ? absentIds.has(currentStudent.id) : false
  const hasMeasurements = Object.keys(measurements).length > 0 || Object.keys(clinicalAssessments).length > 0

  function changeStudentPage(index) {
    setStudentPage(index)
    setExpandedGoalId(null)
  }

  // UX improvement (accordion): κλικ στον ήδη ανοιχτό στόχο τον κλείνει (κανένας ανοιχτός)· κλικ σε
  // άλλον στόχο τον ανοίγει και αυτόματα κλείνει τον προηγούμενο (μία μεταβλητή, όχι Set).
  function toggleExpandedGoal(goalId) {
    setExpandedGoalId((prev) => (prev === goalId ? null : goalId))
  }

  function toggleAbsent(studentId) {
    setAbsentIds((prev) => {
      const next = new Set(prev)
      if (next.has(studentId)) {
        next.delete(studentId)
      } else {
        next.add(studentId)
        // Ό,τι είχε ήδη καταγραφεί γι' αυτόν τον μαθητή δεν πρέπει να αποθηκευτεί αφού σημειώνεται απών.
        setMeasurements((prevMeasurements) => {
          const filtered = { ...prevMeasurements }
          for (const goalId of Object.keys(filtered)) {
            if (goalStudentMap[goalId] === studentId) delete filtered[goalId]
          }
          return filtered
        })
        setPreviousMeasurements((prevPrevious) => {
          const filtered = { ...prevPrevious }
          for (const goalId of Object.keys(filtered)) {
            if (goalStudentMap[goalId] === studentId) delete filtered[goalId]
          }
          return filtered
        })
        setClinicalAssessments((prevAssessments) => {
          const filtered = { ...prevAssessments }
          for (const goalId of Object.keys(filtered)) {
            if (goalStudentMap[goalId] === studentId) delete filtered[goalId]
          }
          return filtered
        })
      }
      return next
    })
  }

  function updateMeasurement(goalId, value) {
    setPreviousMeasurements((prev) => ({ ...prev, [goalId]: measurements[goalId] }))
    setMeasurements((prev) => ({ ...prev, [goalId]: value }))
  }

  // value === null σημαίνει «καμία εκτίμηση» (deselect) — αφαιρεί το key εντελώς, ΔΕΝ αποθηκεύει
  // null (ίδια σύμβαση με το «απουσία = καμία εκτίμηση» του GoalClinicalAssessment/schema).
  function updateClinicalAssessment(goalId, value) {
    setClinicalAssessments((prev) => {
      const next = { ...prev }
      if (value === null) {
        delete next[goalId]
      } else {
        next[goalId] = value
      }
      return next
    })
  }

  function canUndo(goalId) {
    return goalId in previousMeasurements
  }

  function undoMeasurement(goalId) {
    setMeasurements((prev) => {
      const next = { ...prev }
      if (previousMeasurements[goalId] === undefined) {
        delete next[goalId]
      } else {
        next[goalId] = previousMeasurements[goalId]
      }
      return next
    })
    setPreviousMeasurements((prev) => {
      const next = { ...prev }
      delete next[goalId]
      return next
    })
  }

  function requestExit() {
    if (hasMeasurements) {
      setExitConfirmOpen(true)
    } else {
      navigate('/')
    }
  }

  function selectDuration(d) {
    setSessionDuration(d)
    setCustomDuration('')
  }

  function handleCustomDurationChange(value) {
    setCustomDuration(value)
    const n = Number(value)
    setSessionDuration(value && n > 0 ? n : null)
  }

  function setMood(studentId, value) {
    setMoods((prev) => {
      const next = { ...prev }
      if (value === null) delete next[studentId]
      else next[studentId] = value
      return next
    })
  }

  async function handleSaveSession() {
    if (savingSessionRef.current) return // αποτρέπει διπλή αποθήκευση από γρήγορο διπλό tap
    savingSessionRef.current = true
    setSavingSession(true)
    setSaveError(null)
    try {
      // ΟΛΟΚΛΗΡΗ η αποθήκευση της συνεδρίας (session + measurements + κλινικές εκτιμήσεις + τυχόν
      // μεταβάσεις κατάστασης στόχου σε "Κατακτήθηκε") μέσα σε ΜΙΑ συναλλαγή — αν οτιδήποτε πετάξει
      // (π.χ. μη έγκυρη μετάβαση κατάστασης), ΤΙΠΟΤΑ δεν γράφεται μερικώς. Η transitionGoalStatus
      // ανοίγει τη ΔΙΚΗ της db.transaction(db.goals, db.goalEvents) — η Dexie αναγνωρίζει το ambient
      // context εδώ (και οι δύο πίνακες ήδη μέσα στη λίστα παρακάτω) και ΣΥΜΜΕΤΕΧΕΙ, δεν φωλιάζει.
      await db.transaction('rw', [db.sessions, db.measurements, db.sessionGoalAssessments, db.goals, db.goalEvents], async () => {
        const sessionId = await db.sessions.add({
          date: sessionDate,
          studentIds,
          status: 'completed',
          absentStudentIds: [...absentIds],
          durationMinutes: sessionDuration,
          activity: '',
          note: '',
          moods
        })

        // Στάδιο 8 — κενό textarea (Περιγραφική παρατήρηση) σημαίνει «καμία μέτρηση καταγράφηκε»,
        // ΟΧΙ «καταγράφηκε κενή τιμή» (σε αντίθεση με π.χ. έναν μετρητή στο 0, που ΕΙΝΑΙ πραγματική
        // καταγραφή) — φιλτράρεται εδώ, στο ΜΟΝΑΔΙΚΟ σημείο που γράφει στη βάση, ώστε να μην
        // χρειαστεί το γενικό undo (which only replaces a value, never removes the key) να ξέρει
        // τίποτα γι' αυτό.
        const entries = Object.entries(measurements).filter(
          ([goalId, value]) => !isEmptyRecordedValue(goalTypeMap[goalId], value)
        )
        if (entries.length > 0) {
          await db.measurements.bulkAdd(
            entries.map(([goalId, value]) => ({
              sessionId,
              studentId: goalStudentMap[goalId],
              goalId: Number(goalId),
              value,
              context: isGroup ? 'group' : 'individual',
              note: ''
            }))
          )
        }

        // Κλινική εκτίμηση — ΠΛΗΡΩΣ προαιρετική, ΠΟΤΕ συναγόμενη· μόνο goals με ρητά επιλεγμένη
        // βαθμίδα γράφουν εγγραφή (βλ. §4 του product proposal — Επιλογή Α για μη-δουλεμένους στόχους:
        // καμία εγγραφή = αυτόματα "δεν δουλεύτηκε", καμία ρητή σήμανση).
        const assessmentEntries = Object.entries(clinicalAssessments)
        if (assessmentEntries.length > 0) {
          await db.sessionGoalAssessments.bulkAdd(
            assessmentEntries.map(([goalId, { rating, note }]) => ({
              sessionId,
              studentId: goalStudentMap[goalId],
              goalId: Number(goalId),
              rating,
              note: note || ''
            }))
          )
        }

        // "Κατακτήθηκε" ΔΕΝ είναι απλώς μία βαθμίδα — ενεργοποιεί το ΗΔΗ υπάρχον, αναλλοίωτο
        // transitionGoalStatus (ΚΑΝΕΝΑΣ δεύτερος μηχανισμός ολοκλήρωσης στόχου). Εκτελείται εδώ,
        // ΟΧΙ στο κλικ επιβεβαίωσης — αν ο δάσκαλος βγει χωρίς αποθήκευση, ο στόχος παραμένει active.
        for (const [goalId, { rating, note }] of assessmentEntries) {
          if (rating !== 'mastered') continue
          // sessionId εδώ επιτρέπει στο utils/goalHistory.js να συγχωνεύσει αξιόπιστα αυτό το
          // goalEvent με την αντίστοιχη "mastered" εγγραφή sessionGoalAssessments σε μία γραμμή.
          await transitionGoalStatus(Number(goalId), 'achieved', { note: note || '', trigger: 'teachingMode', sessionId })
        }
      })

      navigate('/')
    } catch (err) {
      setSaveError(err?.message || 'Η αποθήκευση της συνεδρίας απέτυχε. Δοκίμασε ξανά.')
    } finally {
      savingSessionRef.current = false
      setSavingSession(false)
    }
  }

  return (
    <div className="app-shell teaching-mode">
      <header className="teaching-mode__header">
        <Button variant="ghost" icon={X} onClick={requestExit}>Έξοδος</Button>
        <p className="teaching-mode__student-name">
          {currentStudent ? `${currentStudent.code}${currentStudent.nickname ? ` — ${currentStudent.nickname}` : ''}` : ''}
        </p>
        <Button variant="primary" icon={CircleCheck} onClick={() => setEndSessionOpen(true)}>
          Τέλος
        </Button>
      </header>

      {isGroup && (
        <>
          <Tabs
            tabs={students.map((s) => ({
              id: String(s.id),
              label: (
                <span className={absentIds.has(s.id) ? 'teaching-mode__student-tab--absent' : ''}>
                  {s.code}
                </span>
              )
            }))}
            activeId={String(currentStudent?.id)}
            onChange={(id) => changeStudentPage(students.findIndex((s) => s.id === Number(id)))}
          />

          {currentStudent && (
            <Button
              variant="secondary"
              icon={isCurrentAbsent ? UserCheck : UserX}
              className="teaching-mode__absent-toggle"
              onClick={() => toggleAbsent(currentStudent.id)}
            >
              {isCurrentAbsent ? 'Σήμανση ως παρόντος' : 'Σήμανση ως απόντος'}
            </Button>
          )}
        </>
      )}

      {isCurrentAbsent ? (
        <EmptyState
          icon={UserX}
          title={`${currentStudent.code} είναι σημειωμένος/η ως απών/απούσα σήμερα`}
          description="Δεν καταγράφονται μετρήσεις για μαθητή που είναι σημειωμένος ως απών."
        />
      ) : (
        <>
          {currentStudentGoals.length === 0 && (
            <EmptyState
              icon={CircleCheck}
              title="Δεν υπάρχουν ενεργοί στόχοι για αυτόν τον μαθητή"
              description="Πρόσθεσε στόχους από την καρτέλα του μαθητή για να εμφανιστούν εδώ."
            />
          )}

          {currentStudentGoals.length > 0 && (
            <div className="teaching-mode__goal-list">
              {currentStudentGoals.map((goal) => (
                <GoalRecorderCard
                  key={goal.id}
                  domainLabel={domainName(goal.domain)}
                  title={goal.title}
                  description={goal.description}
                  criterionHint={goal.criterion ? `Κριτήριο: ${goal.criterion}` : null}
                  goal={goal}
                  value={measurements[goal.id]}
                  onChange={(value) => updateMeasurement(goal.id, value)}
                  canUndo={canUndo(goal.id)}
                  onUndo={() => undoMeasurement(goal.id)}
                  isRecorded={goal.id in measurements}
                  expanded={expandedGoalId === goal.id}
                  onToggleExpand={() => toggleExpandedGoal(goal.id)}
                  clinicalAssessment={clinicalAssessments[goal.id]}
                  onClinicalAssessmentChange={(value) => updateClinicalAssessment(goal.id, value)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {isGroup && (
        <div className="teaching-mode__student-nav">
          <Button variant="secondary" icon={ChevronLeft} disabled={studentPage === 0} onClick={() => changeStudentPage(studentPage - 1)}>
            Προηγ. μαθητής
          </Button>
          <Button
            variant="secondary"
            icon={ChevronRight}
            disabled={studentPage === students.length - 1}
            onClick={() => changeStudentPage(studentPage + 1)}
          >
            Επόμ. μαθητής
          </Button>
        </div>
      )}

      <button type="button" className="teaching-mode__fab" onClick={() => setObservationOpen(true)}>
        <MessageSquarePlus size={20} aria-hidden="true" />
        Παρατήρηση
      </button>

      <Modal
        open={endSessionOpen}
        onClose={() => setEndSessionOpen(false)}
        title="Ολοκλήρωση συνεδρίας"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEndSessionOpen(false)}>Πίσω</Button>
            <Button variant="primary" loading={savingSession} disabled={!sessionDuration} onClick={handleSaveSession}>
              Αποθήκευση
            </Button>
          </>
        }
      >
        <FormField htmlFor="sessionDate" label="Ημερομηνία">
          <DateField id="sessionDate" value={sessionDate} onChange={setSessionDate} />
        </FormField>

        <FormField htmlFor="customDuration" label="Διάρκεια">
          <div className="teaching-mode__duration-options">
            {DURATION_OPTIONS.map((d) => (
              <Button
                key={d}
                variant={sessionDuration === d ? 'primary' : 'secondary'}
                onClick={() => selectDuration(d)}
              >
                {d}′
              </Button>
            ))}
          </div>
          <Input
            id="customDuration"
            type="number"
            min="1"
            placeholder="Άλλη διάρκεια (λεπτά)"
            value={customDuration}
            onChange={(e) => handleCustomDurationChange(e.target.value)}
          />
        </FormField>

        <div className="teaching-mode__mood-section">
          <p className="teaching-mode__mood-title">Διάθεση μαθητή</p>
          {isGroup
            ? students
                .filter((s) => !absentIds.has(s.id))
                .map((s) => (
                  <MoodPicker key={s.id} label={s.code} value={moods[s.id] || null} onChange={(v) => setMood(s.id, v)} />
                ))
            : students[0] && (
                <MoodPicker value={moods[students[0].id] || null} onChange={(v) => setMood(students[0].id, v)} />
              )}
        </div>

        {saveError && <p className="teaching-mode__save-error" role="alert">{saveError}</p>}
      </Modal>

      <Modal
        open={exitConfirmOpen}
        onClose={() => setExitConfirmOpen(false)}
        title="Απώλεια καταχωρήσεων"
        footer={
          <>
            <Button variant="ghost" onClick={() => setExitConfirmOpen(false)}>Συνέχεια συνεδρίας</Button>
            <Button variant="danger" onClick={() => navigate('/')}>Έξοδος χωρίς αποθήκευση</Button>
          </>
        }
      >
        <p>Θα χαθούν οι καταχωρήσεις αυτής της συνεδρίας. Θέλεις σίγουρα να βγεις χωρίς αποθήκευση;</p>
      </Modal>

      {observationOpen && (
        <ObservationPanel
          students={students}
          defaultStudentId={currentStudent?.id}
          onClose={() => setObservationOpen(false)}
        />
      )}
    </div>
  )
}

function ObservationPanel({ students, defaultStudentId, onClose }) {
  const [studentId, setStudentId] = useState(defaultStudentId)
  const [text, setText] = useState('')
  const [milestone, setMilestone] = useState(false)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false) // βλ. σχόλιο στο savingSessionRef παραπάνω — το ref είναι συγχρονισμένο, το state όχι

  async function handleSave() {
    const trimmed = text.trim()
    if (!trimmed || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    try {
      await db.observations.add({
        studentId,
        date: todayLocalISO(),
        text: trimmed,
        milestone
      })
      onClose()
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Παρατήρηση"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Άκυρο</Button>
          <Button variant="primary" loading={saving} disabled={!text.trim()} onClick={handleSave}>
            Αποθήκευση
          </Button>
        </>
      }
    >
      {students.length > 1 && (
        <FormField htmlFor="observationStudent" label="Μαθητής">
          <Select
            id="observationStudent"
            value={studentId}
            onChange={(e) => setStudentId(Number(e.target.value))}
          >
            {students.map((s) => (
              <option key={s.id} value={s.id}>{s.code}{s.nickname ? ` — ${s.nickname}` : ''}</option>
            ))}
          </Select>
        </FormField>
      )}

      <FormField htmlFor="observationText" label="Τι παρατήρησες;">
        <Textarea
          id="observationText"
          autoFocus
          placeholder="π.χ. Πρώτη φορά ζήτησε μόνος του τουαλέτα"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </FormField>

      <ToggleRow checked={milestone} onChange={setMilestone}>Σημαντική στιγμή (milestone)</ToggleRow>
    </Modal>
  )
}
