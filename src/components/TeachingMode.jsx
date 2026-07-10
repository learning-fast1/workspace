import { useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db.js'
import { sortByPriority } from '../config/goalOptions.js'
import { DURATION_OPTIONS } from '../config/sessionOptions.js'
import { domainName } from '../config/domains.js'
import { todayLocalISO } from '../utils/date.js'
import GoalRecorder from './GoalRecorder.jsx'

const PAGE_SIZE = 4

function chunk(array, size) {
  const chunks = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}

// Teaching Mode: πλήρης οθόνη, μόνο οι ενεργοί στόχοι, καταχώρηση με ένα tap.
// Ατομικό = ένας μαθητής στο studentIds. Ομαδικό = πολλοί· μία κάρτα ανά μαθητή, swipe μεταξύ τους.
export default function TeachingMode() {
  const { studentIds: studentIdsParam } = useParams()
  const navigate = useNavigate()
  const studentIds = useMemo(() => studentIdsParam.split(',').map(Number), [studentIdsParam])
  const isGroup = studentIds.length > 1

  const [studentPage, setStudentPage] = useState(0)
  const [goalPage, setGoalPage] = useState(0)
  const [absentIds, setAbsentIds] = useState(() => new Set())
  const [measurements, setMeasurements] = useState({})
  const [observationOpen, setObservationOpen] = useState(false)
  const [sessionDate, setSessionDate] = useState(todayLocalISO)
  const [sessionDuration, setSessionDuration] = useState(null)
  const [customDuration, setCustomDuration] = useState('')
  const [savingSession, setSavingSession] = useState(false)
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
    return <div className="page">Φόρτωση…</div>
  }

  const students = rawStudents.filter(Boolean)

  if (students.length === 0) {
    return (
      <div className="page">
        <p className="empty-state">Οι μαθητές αυτής της συνεδρίας δεν υπάρχουν πια.</p>
        <button type="button" className="btn btn-secondary" onClick={() => navigate('/')}>← Αρχική</button>
      </div>
    )
  }

  const goalStudentMap = Object.fromEntries(allGoals.map((g) => [g.id, g.studentId]))

  function goalsFor(studentId) {
    return sortByPriority(allGoals.filter((g) => g.studentId === studentId))
  }

  // clamp: αν διαγράφηκε ο μαθητής που ήταν στην τελευταία σελίδα, η σελίδα μπορεί να μείνει εκτός ορίων.
  const currentStudent = students[Math.min(studentPage, students.length - 1)]
  const currentStudentGoals = currentStudent ? goalsFor(currentStudent.id) : []
  const goalPages = chunk(currentStudentGoals, PAGE_SIZE)
  // ίδιο clamp με το studentPage παραπάνω: αν λιγόστεψαν οι στόχοι ενόσω ο δάσκαλος ήταν σε
  // επόμενη σελίδα (π.χ. αρχειοθέτηση από άλλη καρτέλα), η σελίδα να μη μείνει εκτός ορίων.
  const clampedGoalPage = Math.min(goalPage, Math.max(goalPages.length - 1, 0))
  const currentGoals = goalPages[clampedGoalPage] || []
  const isCurrentAbsent = currentStudent ? absentIds.has(currentStudent.id) : false
  const hasMeasurements = Object.keys(measurements).length > 0

  function changeStudentPage(index) {
    setStudentPage(index)
    setGoalPage(0)
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
      }
      return next
    })
  }

  function updateMeasurement(goalId, value) {
    setMeasurements((prev) => ({ ...prev, [goalId]: value }))
  }

  function handleExit() {
    if (hasMeasurements && !window.confirm('Θα χαθούν οι καταχωρήσεις αυτής της συνεδρίας. Έξοδος χωρίς αποθήκευση;')) {
      return
    }
    navigate('/')
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

  async function handleSaveSession() {
    if (savingSessionRef.current) return // αποτρέπει διπλή αποθήκευση από γρήγορο διπλό tap
    savingSessionRef.current = true
    setSavingSession(true)
    try {
      const sessionId = await db.sessions.add({
        date: sessionDate,
        studentIds,
        status: 'completed',
        absentStudentIds: [...absentIds],
        durationMinutes: sessionDuration,
        activity: '',
        note: ''
      })

      const entries = Object.entries(measurements)
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

      navigate('/')
    } finally {
      savingSessionRef.current = false
      setSavingSession(false)
    }
  }

  return (
    <div className="teaching-mode">
      <div className="teaching-top-bar">
        <button type="button" className="btn btn-link" onClick={handleExit}>✕ Έξοδος</button>
        <h1>{currentStudent ? `${currentStudent.code}${currentStudent.nickname ? ` — ${currentStudent.nickname}` : ''}` : ''}</h1>
        <button type="button" className="btn btn-primary" disabled={!sessionDuration || savingSession} onClick={handleSaveSession}>
          {savingSession ? 'Αποθήκευση…' : 'Τέλος'}
        </button>
      </div>

      {isGroup && (
        <div className="student-tabs">
          {students.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={`student-tab ${i === studentPage ? 'active' : ''} ${absentIds.has(s.id) ? 'absent' : ''}`}
              onClick={() => changeStudentPage(i)}
            >
              {s.code}
            </button>
          ))}
        </div>
      )}

      {isGroup && currentStudent && (
        <button type="button" className="btn btn-secondary absent-toggle" onClick={() => toggleAbsent(currentStudent.id)}>
          {isCurrentAbsent ? '✓ Σήμανση ως παρόντος' : '🚫 Σήμανση ως απόντος'}
        </button>
      )}

      {isCurrentAbsent ? (
        <p className="empty-state">{currentStudent.code} είναι σημειωμένος/η ως απών/απούσα σήμερα.</p>
      ) : (
        <>
          {currentStudentGoals.length === 0 && (
            <p className="empty-state">Δεν υπάρχουν ενεργοί στόχοι για αυτόν τον μαθητή.</p>
          )}

          <div className="goal-cards">
            {currentGoals.map((goal) => (
              <div key={goal.id} className="teaching-goal-card">
                <div className="goal-domain">{domainName(goal.domain)}</div>
                <h2>{goal.title}</h2>
                <GoalRecorder
                  goal={goal}
                  value={measurements[goal.id]}
                  onChange={(value) => updateMeasurement(goal.id, value)}
                />
              </div>
            ))}
          </div>

          {goalPages.length > 1 && (
            <div className="page-dots">
              <button type="button" className="btn btn-secondary" disabled={clampedGoalPage === 0} onClick={() => setGoalPage(clampedGoalPage - 1)}>‹</button>
              {goalPages.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  className={`page-dot ${i === clampedGoalPage ? 'active' : ''}`}
                  onClick={() => setGoalPage(i)}
                  aria-label={`Σελίδα στόχων ${i + 1}`}
                />
              ))}
              <button type="button" className="btn btn-secondary" disabled={clampedGoalPage === goalPages.length - 1} onClick={() => setGoalPage(clampedGoalPage + 1)}>›</button>
            </div>
          )}
        </>
      )}

      {isGroup && (
        <div className="page-dots student-page-dots">
          <button type="button" className="btn btn-secondary" disabled={studentPage === 0} onClick={() => changeStudentPage(studentPage - 1)}>‹ Προηγ. μαθητής</button>
          <button type="button" className="btn btn-secondary" disabled={studentPage === students.length - 1} onClick={() => changeStudentPage(studentPage + 1)}>Επόμ. μαθητής ›</button>
        </div>
      )}

      <div className="section">
        <h2>Στοιχεία συνεδρίας</h2>
        <div className="field">
          <label htmlFor="sessionDate">Ημερομηνία</label>
          <input
            id="sessionDate"
            type="date"
            value={sessionDate}
            onChange={(e) => setSessionDate(e.target.value)}
          />
          <p className="hint">Ξέχασες να την περάσεις χθες; Άλλαξε εδώ την ημερομηνία.</p>
        </div>
        <div className="field">
          <label>Διάρκεια</label>
          <div className="duration-options">
            {DURATION_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                className={`btn ${sessionDuration === d ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => selectDuration(d)}
              >
                {d}′
              </button>
            ))}
          </div>
          <input
            id="customDuration"
            type="number"
            min="1"
            placeholder="Άλλη διάρκεια (λεπτά)"
            value={customDuration}
            onChange={(e) => handleCustomDurationChange(e.target.value)}
          />
        </div>
      </div>

      <button type="button" className="fab-observation" onClick={() => setObservationOpen(true)}>
        ➕ Παρατήρηση
      </button>

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
    <div className="overlay">
      <div className="overlay-panel">
        <h2>➕ Παρατήρηση</h2>
        {students.length > 1 && (
          <div className="field">
            <label htmlFor="observationStudent">Μαθητής</label>
            <select id="observationStudent" value={studentId} onChange={(e) => setStudentId(Number(e.target.value))}>
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.code}{s.nickname ? ` — ${s.nickname}` : ''}</option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <textarea
            autoFocus
            placeholder="Τι παρατήρησες;"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <label className="checkbox-row">
          <input type="checkbox" checked={milestone} onChange={(e) => setMilestone(e.target.checked)} />
          ⭐ Σημαντική στιγμή (milestone)
        </label>
        <div className="actions-row">
          <button type="button" className="btn btn-primary" disabled={!text.trim() || saving} onClick={handleSave}>
            {saving ? 'Αποθήκευση…' : 'Αποθήκευση'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Άκυρο</button>
        </div>
      </div>
    </div>
  )
}
