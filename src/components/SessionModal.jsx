import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Pencil, Star } from 'lucide-react'
import { db } from '../db.js'
import { formatDateEl } from '../utils/date.js'
import { domainName } from '../config/domains.js'
import { DURATION_OPTIONS, SESSION_STATUSES, sessionStatusLabel, SESSION_STATUS_BADGE_VARIANT } from '../config/sessionOptions.js'
import { formatMeasurementValue } from '../utils/measurementValue.js'
import Modal from './ui/Modal.jsx'
import Badge from './ui/Badge.jsx'
import Button from './ui/Button.jsx'
import FormField from './ui/FormField.jsx'
import Input from './ui/Input.jsx'
import DateField from './ui/DateField.jsx'
import Select from './ui/Select.jsx'
import Textarea from './ui/Textarea.jsx'
import './SessionModal.css'

// Αυτόνομο query με βάση μόνο το sessionId — επαναχρησιμοποιήσιμο από οπουδήποτε (Session History,
// GoalDetail όταν ένα σημείο του γραφήματος ανοίγει τη συνεδρία στην οποία μετρήθηκε).
async function loadSessionDetail(sessionId) {
  const session = await db.sessions.get(sessionId)
  if (!session) return null

  const [students, measurements, allObservations] = await Promise.all([
    db.students.bulkGet(session.studentIds),
    db.measurements.where('sessionId').equals(sessionId).toArray(),
    db.observations.toArray()
  ])
  // sessionId δεν είναι indexed πεδίο στο observations (μόνο studentId/date) — φιλτράρισμα στη μνήμη.
  const observations = allObservations.filter((o) => o.sessionId === sessionId)

  const goalIds = [...new Set(measurements.map((m) => m.goalId))]
  const goals = await db.goals.bulkGet(goalIds)
  const goalById = Object.fromEntries(goals.filter(Boolean).map((g) => [g.id, g]))
  const studentById = Object.fromEntries(students.filter(Boolean).map((s) => [s.id, s]))

  const measurementsByStudent = {}
  for (const m of measurements) {
    if (!measurementsByStudent[m.studentId]) measurementsByStudent[m.studentId] = []
    measurementsByStudent[m.studentId].push(m)
  }

  return { session, studentById, measurementsByStudent, goalById, observations }
}

// Ένα modal, δύο εσωτερικές όψεις (view/edit) — ίδιο pattern με το preview/edit toggle του ReportTab,
// αντί για δύο ξεχωριστά modals με μετάβαση κλείσιμο→άνοιγμα (βλ. Sprint 4 UX review). Η επεξεργασία
// είναι πλέον πλήρως εσωτερική στο component (όχι πια προαιρετικό onEdit prop από τον γονέα) — κάθε
// χρήση (Session History, GoalDetail) παίρνει view+edit έτοιμα, χωρίς έξτρα καλωδίωση.
// sessionId: number. initialMode: 'view' | 'edit' (default 'view'). onClose: () => void.
export default function SessionModal({ sessionId, initialMode = 'view', onClose }) {
  const [mode, setMode] = useState(initialMode)
  const [formReady, setFormReady] = useState(false)

  const [date, setDate] = useState('')
  const [status, setStatus] = useState('completed')
  const [duration, setDuration] = useState(null)
  const [customDuration, setCustomDuration] = useState('')
  const [activity, setActivity] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const detail = useLiveQuery(() => loadSessionDetail(sessionId), [sessionId])
  const session = detail?.session

  // Γέμισμα της φόρμας μία φορά, όταν φτάσουν τα δεδομένα (καλύπτει initialMode="edit" απευθείας) —
  // επόμενες είσοδοι σε edit mode γίνονται μέσω handleEditClick, που ξανασυγχρονίζει επίτηδες.
  useEffect(() => {
    if (session && !formReady) {
      syncForm(session)
      setFormReady(true)
    }
  }, [session, formReady])

  function syncForm(s) {
    setDate(s.date)
    setStatus(s.status)
    setDuration(s.durationMinutes)
    setCustomDuration('')
    setActivity(s.activity || '')
    setNote(s.note || '')
  }

  function handleEditClick() {
    syncForm(session)
    setMode('edit')
  }

  function handleCancelEdit() {
    syncForm(session) // απορρίπτει τυχόν αλλαγές που δεν αποθηκεύτηκαν
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
    try {
      await db.sessions.update(sessionId, { date, status, durationMinutes: duration, activity, note })
      setMode('view')
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

  const { studentById, measurementsByStudent, goalById, observations } = detail
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
            const studentObservations = observations.filter((o) => o.studentId === studentId)

            return (
              <div key={studentId} className="session-detail__student">
                <h3 className="session-detail__student-name">
                  {student?.code || '—'}
                  {isAbsent && <Badge variant="neutral">Απών</Badge>}
                </h3>

                {!isAbsent && studentMeasurements.length === 0 && studentObservations.length === 0 && (
                  <p className="session-detail__empty">Καμία καταχώρηση για αυτόν τον μαθητή σε αυτή τη συνεδρία.</p>
                )}

                {studentMeasurements.map((m) => {
                  const goal = goalById[m.goalId]
                  if (!goal) return null
                  return (
                    <p key={m.id} className="session-detail__measurement">
                      <span className="session-detail__measurement-domain">{domainName(goal.domain)}</span>
                      {' — '}{goal.title}: <strong>{formatMeasurementValue(goal.measurementType, m.value)}</strong>
                    </p>
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
