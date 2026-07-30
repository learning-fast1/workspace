import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Pencil, Star, ClipboardList, Stethoscope } from 'lucide-react'
import { db, transitionGoalStatus, getAllowedGoalStatusTransitions } from '../db.js'
import { activeTable, withNewRowId } from '../migration/activeGeneration.js'
import { diffFields } from '../utils/formDiff.js'
import { formatDateEl } from '../utils/date.js'
import { domainName } from '../config/domains.js'
import { sortByPriority, statusLabel } from '../config/goalOptions.js'
import { DURATION_OPTIONS, SESSION_STATUSES, sessionStatusLabel, SESSION_STATUS_BADGE_VARIANT } from '../config/sessionOptions.js'
import { formatRecordedValue, isEmptyRecordedValue } from '../utils/measurementTypes/index.js'
import { clinicalRatingLabel } from '../config/clinicalAssessmentRatings.js'
import Modal from './ui/Modal.jsx'
import Badge from './ui/Badge.jsx'
import Button from './ui/Button.jsx'
import FormField from './ui/FormField.jsx'
import Input from './ui/Input.jsx'
import DateField from './ui/DateField.jsx'
import Select from './ui/Select.jsx'
import Textarea from './ui/Textarea.jsx'
import MoodPicker from './ui/MoodPicker.jsx'
import GoalRecorderCard from './GoalRecorderCard.jsx'
import { moodOption } from '../config/moodOptions.js'
import './SessionModal.css'

// Αυτόνομο query με βάση μόνο το sessionId — επαναχρησιμοποιήσιμο από οπουδήποτε (Session History,
// GoalDetail όταν ένα σημείο του γραφήματος ανοίγει τη συνεδρία στην οποία μετρήθηκε).
async function loadSessionDetail(sessionId) {
  const session = await activeTable('sessions').get(sessionId)
  if (!session) return null

  const [students, measurements, assessments, allObservations, activeGoals] = await Promise.all([
    activeTable('students').bulkGet(session.studentIds),
    activeTable('measurements').where('sessionId').equals(sessionId).toArray(),
    activeTable('sessionGoalAssessments').where('sessionId').equals(sessionId).toArray(),
    activeTable('observations').toArray(),
    activeTable('goals').where('studentId').anyOf(session.studentIds).and((g) => g.status === 'active').toArray()
  ])
  // sessionId δεν είναι indexed πεδίο στο observations (μόνο studentId/date) — φιλτράρισμα στη μνήμη.
  const observations = allObservations.filter((o) => o.sessionId === sessionId)

  // Edit Session (λειτουργικό κενό) — η επεξεργασία χρειάζεται την ΕΝΩΣΗ ενεργών στόχων (ώστε να
  // μπορεί να προστεθεί νέα καταγραφή σε στόχο που δεν είχε καμία ακόμα) ΜΕ όσους έχουν ήδη ιστορική
  // καταγραφή σε ΑΥΤΗ τη συνεδρία, ακόμα κι αν έκτοτε άλλαξαν κατάσταση (π.χ. archived/achieved).
  const historicalGoalIds = [...new Set([...measurements.map((m) => m.goalId), ...assessments.map((a) => a.goalId)])]
  const editableGoalIds = [...new Set([...historicalGoalIds, ...activeGoals.map((g) => g.id)])]
  const goals = await activeTable('goals').bulkGet(editableGoalIds)
  const goalById = Object.fromEntries(goals.filter(Boolean).map((g) => [g.id, g]))
  const studentById = Object.fromEntries(students.filter(Boolean).map((s) => [s.id, s]))

  const editableGoalsByStudent = {}
  for (const g of Object.values(goalById)) {
    if (!editableGoalsByStudent[g.studentId]) editableGoalsByStudent[g.studentId] = []
    editableGoalsByStudent[g.studentId].push(g)
  }
  for (const studentId of Object.keys(editableGoalsByStudent)) {
    editableGoalsByStudent[studentId] = sortByPriority(editableGoalsByStudent[studentId])
  }

  const measurementsByStudent = {}
  for (const m of measurements) {
    if (!measurementsByStudent[m.studentId]) measurementsByStudent[m.studentId] = []
    measurementsByStudent[m.studentId].push(m)
  }

  // Κλινικές εκτιμήσεις (Teaching Mode, συμπληρωματικές του measurement) — μέχρι τώρα δεν
  // εμφανίζονταν πουθενά μετά την αποθήκευση της συνεδρίας. Ίδιο grouping idiom με τα measurements.
  const assessmentsByStudent = {}
  for (const a of assessments) {
    if (!assessmentsByStudent[a.studentId]) assessmentsByStudent[a.studentId] = []
    assessmentsByStudent[a.studentId].push(a)
  }

  return { session, studentById, measurementsByStudent, assessmentsByStudent, goalById, observations, editableGoalsByStudent }
}

// Ένα modal, δύο εσωτερικές όψεις (view/edit) — ίδιο pattern με το preview/edit toggle του ReportTab,
// αντί για δύο ξεχωριστά modals με μετάβαση κλείσιμο→άνοιγμα (βλ. Sprint 4 UX review). Η επεξεργασία
// είναι πλέον πλήρως εσωτερική στο component (όχι πια προαιρετικό onEdit prop από τον γονέα) — κάθε
// χρήση (Session History, GoalDetail) παίρνει view+edit έτοιμα, χωρίς έξτρα καλωδίωση.
// sessionId: number. initialMode: 'view' | 'edit' (default 'view'). onClose: () => void.
export default function SessionModal({ sessionId, initialMode = 'view', onClose }) {
  const [mode, setMode] = useState(initialMode)
  const [formReady, setFormReady] = useState(false)
  // Partial-update fix (Root Cause Investigation, Scenario E) — στιγμιότυπο των πεδίων της
  // συνεδρίας ΟΠΩΣ φορτώθηκαν αρχικά (ίδια normalization με το syncForm παρακάτω), ώστε το save
  // να μπορεί να στείλει diffFields() αντί για ολόκληρο το τοπικό state.
  const initialSessionFieldsRef = useRef(null)

  const [date, setDate] = useState('')
  const [status, setStatus] = useState('completed')
  const [duration, setDuration] = useState(null)
  const [customDuration, setCustomDuration] = useState('')
  const [activity, setActivity] = useState('')
  const [note, setNote] = useState('')
  const [moods, setMoods] = useState({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  // Λειτουργικό κενό (Edit Session): μέχρι τώρα μόνο τα metadata της συνεδρίας ήταν επεξεργάσιμα —
  // μια λάθος μέτρηση/κλινική εκτίμηση απαιτούσε διαγραφή ΟΛΗΣ της συνεδρίας. measurements/
  // clinicalAssessments εδώ έχουν ΑΚΡΙΒΩΣ το ίδιο σχήμα {goalId: value}/{goalId: {rating,note}} με
  // το TeachingMode.jsx, προφορτωμένα από τις ήδη αποθηκευμένες εγγραφές (βλ. syncForm).
  const [measurements, setMeasurements] = useState({})
  const [clinicalAssessments, setClinicalAssessments] = useState({})
  const [initialRatingByGoalId, setInitialRatingByGoalId] = useState({})
  const [expandedGoalByStudent, setExpandedGoalByStudent] = useState({})

  const detail = useLiveQuery(() => loadSessionDetail(sessionId), [sessionId])
  const session = detail?.session

  // Γέμισμα της φόρμας μία φορά, όταν φτάσουν τα δεδομένα (καλύπτει initialMode="edit" απευθείας) —
  // επόμενες είσοδοι σε edit mode γίνονται μέσω handleEditClick, που ξανασυγχρονίζει επίτηδες.
  useEffect(() => {
    if (detail && !formReady) {
      syncForm(detail)
      setFormReady(true)
    }
  }, [detail, formReady])

  function syncForm(d) {
    const s = d.session
    setDate(s.date)
    setStatus(s.status)
    setDuration(s.durationMinutes)
    setCustomDuration('')
    setActivity(s.activity || '')
    setNote(s.note || '')
    setMoods(s.moods || {})
    initialSessionFieldsRef.current = {
      date: s.date, status: s.status, durationMinutes: s.durationMinutes,
      activity: s.activity || '', note: s.note || '', moods: s.moods || {}
    }

    const nextMeasurements = {}
    for (const rows of Object.values(d.measurementsByStudent)) {
      for (const m of rows) nextMeasurements[m.goalId] = m.value
    }
    const nextAssessments = {}
    const nextInitialRating = {}
    for (const rows of Object.values(d.assessmentsByStudent)) {
      for (const a of rows) {
        nextAssessments[a.goalId] = { rating: a.rating, note: a.note }
        nextInitialRating[a.goalId] = a.rating
      }
    }
    setMeasurements(nextMeasurements)
    setClinicalAssessments(nextAssessments)
    setInitialRatingByGoalId(nextInitialRating)
    setExpandedGoalByStudent({})
  }

  function setMood(studentId, value) {
    setMoods((prev) => {
      const next = { ...prev }
      if (value === null) delete next[studentId]
      else next[studentId] = value
      return next
    })
  }

  function updateMeasurement(goalId, value) {
    setMeasurements((prev) => ({ ...prev, [goalId]: value }))
  }

  function removeMeasurement(goalId) {
    setMeasurements((prev) => {
      const next = { ...prev }
      delete next[goalId]
      return next
    })
  }

  function updateClinicalAssessment(goalId, value) {
    setClinicalAssessments((prev) => {
      const next = { ...prev }
      if (value === null) delete next[goalId]
      else next[goalId] = value
      return next
    })
  }

  function toggleExpandedGoal(studentId, goalId) {
    setExpandedGoalByStudent((prev) => ({
      ...prev,
      [studentId]: prev[studentId] === goalId ? null : goalId
    }))
  }

  function handleEditClick() {
    syncForm(detail)
    setMode('edit')
  }

  function handleCancelEdit() {
    syncForm(detail) // απορρίπτει τυχόν αλλαγές που δεν αποθηκεύτηκαν
    setSaveError(null)
    setMode('view')
  }

  function selectDuration(d) {
    setDuration(d)
    setCustomDuration('')
  }

  function handleCustomDurationChange(value) {
    setCustomDuration(value)
    const n = Number(value)
    setDuration(value && n > 0 ? n : null)
  }

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    try {
      // ΟΛΟΚΛΗΡΗ η αποθήκευση (metadata + measurements + κλινικές εκτιμήσεις + τυχόν μεταβάσεις
      // κατάστασης σε "Κατακτήθηκε") μέσα σε ΜΙΑ transaction — ίδιο idiom με το handleSaveSession
      // του TeachingMode.jsx. Η transitionGoalStatus ανοίγει τη ΔΙΚΗ της db.transaction(...) πάνω
      // στα ΙΔΙΑ resolved activeTable('goals')/activeTable('goalEvents') αντικείμενα — και οι δύο
      // πίνακες είναι ήδη μέσα στη λίστα παρακάτω, οπότε η Dexie αναγνωρίζει το ambient context και
      // ΣΥΜΜΕΤΕΧΕΙ, δεν φωλιάζει (ίδιο, ήδη δοκιμασμένο precedent). Αν οτιδήποτε πετάξει (π.χ. μη
      // επιτρεπτή μετάβαση), ΤΙΠΟΤΑ δεν μένει αποθηκευμένο — ούτε καν τα metadata της συνεδρίας.
      const sessionsTable = activeTable('sessions')
      const measurementsTable = activeTable('measurements')
      const sessionGoalAssessmentsTable = activeTable('sessionGoalAssessments')
      const goalsTable = activeTable('goals')
      const goalEventsTable = activeTable('goalEvents')
      await db.transaction('rw', [sessionsTable, measurementsTable, sessionGoalAssessmentsTable, goalsTable, goalEventsTable], async () => {
        // Partial-update fix (Root Cause Investigation, Scenario E) — diffFields αντί για ολόκληρο
        // το σύνολο πεδίων της συνεδρίας.
        const sessionChanges = diffFields(
          initialSessionFieldsRef.current,
          { date, status, durationMinutes: duration, activity, note, moods }
        )
        if (Object.keys(sessionChanges).length > 0) {
          await sessionsTable.update(sessionId, sessionChanges)
        }

        const existingMeasurementByGoalId = {}
        for (const rows of Object.values(detail.measurementsByStudent)) {
          for (const m of rows) existingMeasurementByGoalId[m.goalId] = m
        }
        const measurementGoalIds = new Set([
          ...Object.keys(existingMeasurementByGoalId).map(Number),
          ...Object.keys(measurements).map(Number)
        ])
        for (const goalId of measurementGoalIds) {
          const goal = detail.goalById[goalId]
          if (!goal) continue
          const existing = existingMeasurementByGoalId[goalId]
          const value = measurements[goalId]
          const hasValue = value !== undefined && !isEmptyRecordedValue(goal.measurementType, value)
          if (hasValue && existing) {
            await measurementsTable.update(existing.id, { value })
          } else if (hasValue && !existing) {
            await measurementsTable.add(withNewRowId({
              sessionId, studentId: goal.studentId, goalId, value,
              context: session.studentIds.length > 1 ? 'group' : 'individual', note: ''
            }))
          } else if (!hasValue && existing) {
            await measurementsTable.delete(existing.id)
          }
        }

        const existingAssessmentByGoalId = {}
        for (const rows of Object.values(detail.assessmentsByStudent)) {
          for (const a of rows) existingAssessmentByGoalId[a.goalId] = a
        }
        const assessmentGoalIds = new Set([
          ...Object.keys(existingAssessmentByGoalId).map(Number),
          ...Object.keys(clinicalAssessments).map(Number)
        ])
        for (const goalId of assessmentGoalIds) {
          const goal = detail.goalById[goalId]
          if (!goal) continue
          const existing = existingAssessmentByGoalId[goalId]
          const assessment = clinicalAssessments[goalId]
          if (assessment && existing) {
            await sessionGoalAssessmentsTable.update(existing.id, { rating: assessment.rating, note: assessment.note || '' })
          } else if (assessment && !existing) {
            await sessionGoalAssessmentsTable.add(withNewRowId({
              sessionId, studentId: goal.studentId, goalId, rating: assessment.rating, note: assessment.note || ''
            }))
          } else if (!assessment && existing) {
            await sessionGoalAssessmentsTable.delete(existing.id)
          }

          // «Κατακτήθηκε» ΝΕΟ σε αυτή την επεξεργασία (δεν ήταν ήδη mastered πριν) → ο ΜΟΝΑΔΙΚΟΣ
          // δημόσιος τρόπος ολοκλήρωσης στόχου. Αλλαγή/αφαίρεση ήδη-mastered ΔΕΝ αγγίζει ποτέ την
          // κατάσταση του στόχου (Επιλογή Α — goal lifecycle και session data παραμένουν διακριτά).
          // Αν η τρέχουσα κατάσταση δεν επιτρέπει τη μετάβαση, η transitionGoalStatus πετάει σφάλμα
          // και ΟΛΟΚΛΗΡΗ η transaction κάνει rollback (καμία σιωπηλή παράλειψη, βλ. GoalClinicalAssessment.jsx
          // που ήδη μπλοκάρει προληπτικά αυτή την επιλογή στο UI).
          if (assessment?.rating === 'mastered' && initialRatingByGoalId[goalId] !== 'mastered') {
            await transitionGoalStatus(goalId, 'achieved', { note: assessment.note || '', trigger: 'sessionEdit', sessionId })
          }
        }
      })

      setMode('view')
    } catch (err) {
      setSaveError(err?.message || 'Η αποθήκευση απέτυχε. Δοκίμασε ξανά.')
    } finally {
      setSaving(false)
    }
  }

  if (detail === undefined) {
    return (
      <Modal open onClose={onClose} title="Συνεδρία">
        <p>Φόρτωση…</p>
      </Modal>
    )
  }

  if (detail === null) {
    return (
      <Modal open onClose={onClose} title="Συνεδρία">
        <p>Η συνεδρία δεν βρέθηκε — μπορεί να διαγράφηκε.</p>
      </Modal>
    )
  }

  const { studentById, measurementsByStudent, assessmentsByStudent, goalById, observations, editableGoalsByStudent } = detail
  const isEdit = mode === 'edit'

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? 'Επεξεργασία συνεδρίας' : `Συνεδρία — ${formatDateEl(session.date)}`}
      footer={
        isEdit ? (
          <>
            <Button variant="ghost" onClick={handleCancelEdit}>Ακύρωση</Button>
            <Button variant="primary" loading={saving} disabled={!duration} onClick={handleSave}>Αποθήκευση</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>Κλείσιμο</Button>
            <Button variant="primary" icon={Pencil} onClick={handleEditClick}>Επεξεργασία</Button>
          </>
        )
      }
    >
      {isEdit ? (
        <div className="session-modal__form">
          <FormField htmlFor="sessionModalDate" label="Ημερομηνία">
            <DateField id="sessionModalDate" value={date} onChange={setDate} />
          </FormField>

          <FormField htmlFor="sessionModalStatus" label="Κατάσταση" helperText="Άλλαξε εδώ αν μια συνεδρία τελικά διακόπηκε ή δεν έγινε — δεν επηρεάζει το Teaching Mode.">
            <Select id="sessionModalStatus" value={status} onChange={(e) => setStatus(e.target.value)}>
              {SESSION_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </Select>
          </FormField>

          <FormField htmlFor="sessionModalCustomDuration" label="Διάρκεια">
            <div className="session-modal__duration-options">
              {DURATION_OPTIONS.map((d) => (
                <Button key={d} variant={duration === d ? 'primary' : 'secondary'} onClick={() => selectDuration(d)}>
                  {d}′
                </Button>
              ))}
            </div>
            <Input
              id="sessionModalCustomDuration"
              type="number"
              min="1"
              placeholder="Άλλη διάρκεια (λεπτά)"
              value={customDuration}
              onChange={(e) => handleCustomDurationChange(e.target.value)}
            />
          </FormField>

          <FormField htmlFor="sessionModalActivity" label="Δραστηριότητα">
            <Textarea id="sessionModalActivity" value={activity} onChange={(e) => setActivity(e.target.value)} />
          </FormField>

          <FormField htmlFor="sessionModalNote" label="Σημείωση">
            <Textarea id="sessionModalNote" value={note} onChange={(e) => setNote(e.target.value)} />
          </FormField>

          <div className="session-modal__mood-section">
            <p className="session-modal__mood-title">Διάθεση μαθητή</p>
            {session.studentIds
              .filter((id) => !session.absentStudentIds?.includes(id))
              .map((id) => (
                <MoodPicker
                  key={id}
                  label={studentById[id]?.code}
                  value={moods[id] || null}
                  onChange={(v) => setMood(id, v)}
                />
              ))}
          </div>

          {/* Λειτουργικό κενό (Edit Session) — επαναχρησιμοποίηση του ΙΔΙΟΥ GoalRecorderCard/
              GoalRecorder/GoalClinicalAssessment με το Teaching Mode, προφορτωμένα με τις ήδη
              αποθηκευμένες τιμές (βλ. syncForm). Στοίβα ανά μαθητή (όχι tabs — matches ήδη
              stacked mood section παραπάνω). Ένωση ενεργών ∪ ιστορικών-σε-αυτή-τη-συνεδρία στόχων. */}
          <div className="session-modal__goals-section">
            {session.studentIds.map((studentId) => {
              const student = studentById[studentId]
              const studentGoals = editableGoalsByStudent[studentId] || []
              if (studentGoals.length === 0) return null
              return (
                <div key={studentId} className="session-modal__student-goals">
                  {session.studentIds.length > 1 && (
                    <h3 className="session-modal__student-goals-title">{student?.code}</h3>
                  )}
                  {studentGoals.map((goal) => {
                    const canMarkMastered = getAllowedGoalStatusTransitions(goal.status).includes('achieved')
                    return (
                      <GoalRecorderCard
                        key={goal.id}
                        domainLabel={domainName(goal.domain)}
                        title={goal.title}
                        description={goal.description}
                        criterionHint={goal.criterion ? `Κριτήριο: ${goal.criterion}` : null}
                        goal={goal}
                        value={measurements[goal.id]}
                        onChange={(value) => updateMeasurement(goal.id, value)}
                        canUndo={false}
                        onUndo={() => {}}
                        isRecorded={goal.id in measurements}
                        expanded={expandedGoalByStudent[studentId] === goal.id}
                        onToggleExpand={() => toggleExpandedGoal(studentId, goal.id)}
                        clinicalAssessment={clinicalAssessments[goal.id]}
                        onClinicalAssessmentChange={(value) => updateClinicalAssessment(goal.id, value)}
                        canMarkMastered={canMarkMastered}
                        masteredDisabledReason={canMarkMastered ? undefined : `Ο στόχος έχει κατάσταση «${statusLabel(goal.status)}» — δεν μπορεί να ολοκληρωθεί απευθείας από εδώ. Χρησιμοποίησε πρώτα «Αλλαγή κατάστασης» στον στόχο.`}
                        onRemoveMeasurement={goal.id in measurements ? () => removeMeasurement(goal.id) : undefined}
                      />
                    )
                  })}
                </div>
              )
            })}
          </div>

          {saveError && <p className="session-modal__save-error" role="alert">{saveError}</p>}
        </div>
      ) : (
        <div className="session-detail">
          <div className="session-detail__row">
            {session.status !== 'completed' && (
              <Badge variant={SESSION_STATUS_BADGE_VARIANT[session.status] || 'neutral'}>
                {sessionStatusLabel(session.status)}
              </Badge>
            )}
            {session.durationMinutes != null && <span className="session-detail__duration">{session.durationMinutes}′</span>}
          </div>

          {(session.activity || session.note) && (
            <div className="session-detail__section">
              {session.activity && <p><strong>Δραστηριότητα:</strong> {session.activity}</p>}
              {session.note && <p><strong>Σημείωση:</strong> {session.note}</p>}
            </div>
          )}

          {session.studentIds.map((studentId) => {
            const student = studentById[studentId]
            const isAbsent = session.absentStudentIds?.includes(studentId)
            const studentMeasurements = measurementsByStudent[studentId] || []
            const studentAssessments = assessmentsByStudent[studentId] || []
            const studentObservations = observations.filter((o) => o.studentId === studentId)
            const studentMoodDef = moodOption(session.moods?.[studentId])

            return (
              <div key={studentId} className="session-detail__student">
                <h3 className="session-detail__student-name">
                  {student?.code || '—'}
                  {isAbsent && <Badge variant="neutral">Απών</Badge>}
                  {studentMoodDef && <studentMoodDef.icon size={16} aria-label={studentMoodDef.label} />}
                </h3>

                {!isAbsent && studentMeasurements.length === 0 && studentAssessments.length === 0 && studentObservations.length === 0 && (
                  <p className="session-detail__empty">Καμία καταχώρηση για αυτόν τον μαθητή σε αυτή τη συνεδρία.</p>
                )}

                {/* Ομαδοποίηση ΑΝΑ ΣΤΟΧΟ (όχι πια δύο ξεχωριστές, επίπεδες λίστες) — ώστε η μέτρηση
                    και η κλινική εκτίμηση του ΙΔΙΟΥ στόχου να διαβάζονται μαζί, ως μία ενότητα, με
                    σαφή οπτική ιεράρχηση: τίτλος στόχου → τι μετρήθηκε → ποια η κλινική εκτίμηση.
                    Το πολύ ΜΙΑ μέτρηση + ΜΙΑ εκτίμηση ανά (συνεδρία, στόχος) — βλ. TeachingMode.jsx
                    (measurements keyed by goalId) και το compound unique index του sessionGoalAssessments. */}
                {[...new Set([...studentMeasurements.map((m) => m.goalId), ...studentAssessments.map((a) => a.goalId)])].map((goalId) => {
                  const goal = goalById[goalId]
                  if (!goal) return null
                  const measurement = studentMeasurements.find((m) => m.goalId === goalId)
                  const assessment = studentAssessments.find((a) => a.goalId === goalId)
                  return (
                    <div key={goalId} className="session-detail__goal-entry">
                      <p className="session-detail__goal-entry-title">
                        <span className="session-detail__measurement-domain">{domainName(goal.domain)}</span>
                        {' — '}{goal.title}
                      </p>
                      {measurement && (
                        <p className="session-detail__measurement">
                          <ClipboardList size={14} className="session-detail__row-icon" aria-hidden="true" />
                          <span className="session-detail__row-label">Μέτρηση:</span>{' '}
                          <strong>{formatRecordedValue(goal.measurementType, measurement.value, goal.criterionConfig)}</strong>
                        </p>
                      )}
                      {assessment && (
                        <p className="session-detail__assessment">
                          <Stethoscope size={14} className="session-detail__row-icon" aria-hidden="true" />
                          <span className="session-detail__row-label">Κλινική εκτίμηση:</span>{' '}
                          <strong>{clinicalRatingLabel(assessment.rating)}</strong>
                          {assessment.note && ` — «${assessment.note}»`}
                        </p>
                      )}
                    </div>
                  )
                })}

                {studentObservations.map((o) => (
                  <p key={o.id} className="session-detail__observation">
                    {o.milestone && <Star size={12} aria-hidden="true" />}
                    {o.text}
                  </p>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
