import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Sparkles, UserRoundPlus, Users } from 'lucide-react'
import { db, ensureDayGenerated, recordSessionNotHeld, restoreDailyQueueEntry, applyScheduleException } from '../db.js'
import { todayLocalISO, weekdayOf, formatDateEl } from '../utils/date.js'
import { matchedSession, unplannedSessionsToday } from '../utils/dailyQueue.js'
import { attentionSignalForStudent } from '../utils/attentionSignal.js'
import { colorForIdentity } from '../utils/scheduleColor.js'
import { timeAwareness } from '../utils/timeAwareness.js'
import Card from './ui/Card.jsx'
import Button from './ui/Button.jsx'
import EmptyState from './ui/EmptyState.jsx'
import Modal from './ui/Modal.jsx'
import DateField from './ui/DateField.jsx'
import TodayQueueItem from './TodayQueueItem.jsx'
import './TodayQueue.css'

// Γενική ημέρα εβδομάδας σε γενική πτώση, μόνο για την πρόταση επανάχρησης παρακάτω.
const WEEKDAY_GENITIVE = ['Κυριακής', 'Δευτέρας', 'Τρίτης', 'Τετάρτης', 'Πέμπτης', 'Παρασκευής', 'Σαββάτου']

// Καθαρά αναγνωστική — ΚΑΜΙΑ εγγραφή εδώ μέσα. Το useLiveQuery απαιτεί αυστηρά read-only querier
// (το Dexie πετάει ReadOnlyError αλλιώς) — η αυτόματη παραγωγή (write) γίνεται ξεχωριστά, σε
// useEffect, ΠΡΙΝ τρέξει αυτό το query (βλ. TodayQueue παρακάτω).
async function loadQueueData(date) {
  const today = todayLocalISO()
  const [entries, sessionsToday, students, goals, measurements, observations] = await Promise.all([
    db.dailyQueue.where('date').equals(date).toArray(),
    db.sessions.where('date').equals(date).toArray(),
    db.students.toArray(),
    db.goals.toArray(),
    db.measurements.toArray(),
    db.observations.toArray()
  ])
  entries.sort((a, b) => a.order - b.order)
  const studentById = Object.fromEntries(students.map((s) => [s.id, s]))

  // Πρόταση επανάχρησης — μόνο για ΣΗΜΕΡΑ, όταν η σειρά είναι ακόμα άδεια (δεν έχει νόημα για
  // οποιαδήποτε άλλη ημερομηνία μέσα από τη λεπτομέρεια ημέρας του ημερολογίου).
  let suggestion = []
  let suggestionWeekday = null
  if (date === today && entries.length === 0) {
    const todayWeekday = weekdayOf(today)
    const past = await db.dailyQueue.where('date').below(today).toArray()
    const pastDatesDesc = [...new Set(past.map((e) => e.date))].sort().reverse()
    for (const d of pastDatesDesc) {
      if (weekdayOf(d) === todayWeekday) {
        suggestion = past.filter((e) => e.date === d).sort((a, b) => a.order - b.order)
        suggestionWeekday = todayWeekday
        break
      }
    }
  }

  return { date, entries, sessionsToday, studentById, goals, measurements, observations, suggestion, suggestionWeekday }
}

// «Η μέρα μου» (Sprint 5) γενικευμένη σε οποιαδήποτε ημερομηνία (Sprint 6, Technical Plan §12 —
// «η λεπτομέρεια ημέρας είναι γενίκευση της Η μέρα μου, όχι νέο ξεχωριστό component»). Χωρίς
// `date` prop συμπεριφέρεται ΑΚΡΙΒΩΣ όπως πριν (Αρχική, date=σήμερα) — μηδενική οπτική/λειτουργική
// αλλαγή σε εκείνη τη χρήση.
export default function TodayQueue({ date: dateProp }) {
  const navigate = useNavigate()
  const date = dateProp || todayLocalISO()
  const today = todayLocalISO()
  const isToday = date === today
  const isFuture = date > today

  const data = useLiveQuery(() => loadQueueData(date), [date])
  const [suggestionDismissed, setSuggestionDismissed] = useState(false)
  const [acceptingSuggestion, setAcceptingSuggestion] = useState(false)
  const [moveTarget, setMoveTarget] = useState(null) // entry να μετακινηθεί
  const [moveDate, setMoveDate] = useState(today)
  const [notHeldTarget, setNotHeldTarget] = useState(null) // entry προς επιβεβαίωση «Δεν πραγματοποιήθηκε»
  const [markingNotHeld, setMarkingNotHeld] = useState(false)
  const [, forceTick] = useState(0)

  // Αυτόματη παραγωγή (Sprint 6) — ΕΚΤΟΣ του useLiveQuery querier (βλ. σχόλιο στο loadQueueData).
  // ΜΟΝΟ για σήμερα/μέλλον — ποτέ αναδρομικά για περασμένη μέρα (θα έδειχνε «φαντάσματα» εμφανίσεων
  // για μια μέρα που ήδη πέρασε χωρίς ποτέ να προγραμματιστεί έτσι στην πράξη). Φυσικά idempotent —
  // ασφαλές να ξανατρέξει σε κάθε άνοιγμα (βλ. db.js). Η ίδια η εγγραφή στο dailyQueue ενεργοποιεί
  // αυτόματα το ξανατρέξιμο του παραπάνω useLiveQuery (παρακολουθεί ό,τι πίνακα διάβασε).
  useEffect(() => {
    if (date >= today) {
      ensureDayGenerated(date)
    }
  }, [date, today])

  // Ανανέωση των «Τώρα/Σε Χ λεπτά/Πέρασε» ενδείξεων περιοδικά (όχι per-δευτερόλεπτο — αρκεί κάθε
  // λίγα λεπτά, καμία ανάγκη για βαρύ real-time countdown σε ένα PWA).
  useEffect(() => {
    if (!isToday) return
    const id = setInterval(() => forceTick((n) => n + 1), 60000)
    return () => clearInterval(id)
  }, [isToday])

  if (!data) {
    return (
      <Card className="today-queue">
        <p>Φόρτωση…</p>
      </Card>
    )
  }

  const { entries, sessionsToday, studentById, goals, measurements, observations, suggestion, suggestionWeekday } = data
  const unplanned = unplannedSessionsToday(entries, sessionsToday)
  const showSuggestion = isToday && entries.length === 0 && suggestion.length > 0 && !suggestionDismissed

  async function handleSkip(id) {
    await db.dailyQueue.update(id, { status: 'skipped' })
  }

  async function handleRestore(entry) {
    await restoreDailyQueueEntry(entry)
  }

  async function handleConfirmNotHeld() {
    if (!notHeldTarget) return
    setMarkingNotHeld(true)
    try {
      if (notHeldTarget.scheduleSeriesId != null) {
        await applyScheduleException({ type: 'cancelled', seriesId: notHeldTarget.scheduleSeriesId, originalDate: notHeldTarget.date })
      } else {
        await recordSessionNotHeld({ date: notHeldTarget.date, studentIds: notHeldTarget.studentIds, note: '' })
      }
      setNotHeldTarget(null)
    } finally {
      setMarkingNotHeld(false)
    }
  }

  async function handleConfirmMove() {
    if (!moveTarget) return
    await applyScheduleException({
      type: 'moved',
      seriesId: moveTarget.scheduleSeriesId,
      originalDate: moveTarget.date,
      newDate: moveDate
    })
    setMoveTarget(null)
  }

  async function handleMove(entry, direction) {
    const index = entries.findIndex((e) => e.id === entry.id)
    const swapWith = entries[index + direction]
    if (!swapWith) return
    await db.dailyQueue.update(entry.id, { order: swapWith.order })
    await db.dailyQueue.update(swapWith.id, { order: entry.order })
  }

  async function acceptSuggestion() {
    setAcceptingSuggestion(true)
    try {
      await db.dailyQueue.bulkAdd(
        suggestion.map((e) => ({ date, studentIds: e.studentIds, order: e.order, status: 'pending' }))
      )
    } finally {
      setAcceptingSuggestion(false)
    }
  }

  function studentsFor(studentIds) {
    return studentIds.map((id) => studentById[id]).filter(Boolean)
  }

  const addIndividualTo = isToday ? '/today/add-individual' : `/today/add-individual?date=${date}`
  const addGroupTo = isToday ? '/today/add-group' : `/today/add-group?date=${date}`

  return (
    <Card className="today-queue">
      <div className="today-queue__header">
        <h2 className="today-queue__title">{isToday ? 'Η μέρα μου' : formatDateEl(date)}</h2>
        <div className="today-queue__add-actions">
          <Button variant="secondary" icon={UserRoundPlus} to={addIndividualTo}>Έκτακτη ατομική</Button>
          <Button variant="secondary" icon={Users} to={addGroupTo}>Έκτακτη ομαδική</Button>
        </div>
      </div>

      {showSuggestion && (
        <div className="today-queue__suggestion">
          <p>Να χρησιμοποιήσω τη σειρά της περασμένης {WEEKDAY_GENITIVE[suggestionWeekday]};</p>
          <div className="today-queue__suggestion-actions">
            <Button variant="primary" loading={acceptingSuggestion} onClick={acceptSuggestion}>Ναι</Button>
            <Button variant="ghost" onClick={() => setSuggestionDismissed(true)}>Όχι, θα τη φτιάξω τώρα</Button>
          </div>
        </div>
      )}

      {!showSuggestion && entries.length === 0 && unplanned.length === 0 && (
        <EmptyState
          icon={Sparkles}
          title={isToday ? 'Δεν υπάρχουν προγραμματισμένες συνεδρίες για σήμερα.' : 'Καμία προγραμματισμένη συνεδρία'}
          description={isToday ? 'Πρόσθεσε το εβδομαδιαίο σου πρόγραμμα ώστε να γεμίζει αυτόματα, ή ξεκίνα μια έκτακτη συνεδρία τώρα.' : 'Καμία εμφάνιση από το πρόγραμμα ή χειροκίνητη προσθήκη για αυτή τη μέρα.'}
          actionLabel={isToday ? 'Πρόγραμμα' : undefined}
          actionTo={isToday ? '/schedule' : undefined}
        />
      )}

      {(entries.length > 0 || unplanned.length > 0) && (
        <div className="today-queue__list">
          {entries.map((entry, index) => {
            const session = matchedSession(entry, sessionsToday)
            const done = session !== null
            const notHeld = session?.status === 'notHeld'
            const isGroup = entry.studentIds.length > 1
            const attention = !done && !isGroup
              ? attentionSignalForStudent(entry.studentIds[0], { goals, sessions: sessionsToday, measurements, observations })
              : null
            const { state: timeState, label: timeLabel } = isToday
              ? timeAwareness(entry.plannedTime, entry.plannedDuration, new Date())
              : { state: null, label: null }

            return (
              <TodayQueueItem
                key={entry.id}
                students={studentsFor(entry.studentIds)}
                isGroup={isGroup}
                done={done}
                notHeld={notHeld}
                mood={done ? session.moods?.[entry.studentIds[0]] : undefined}
                attention={attention}
                skipped={entry.status === 'skipped'}
                plannedTime={entry.plannedTime}
                timeState={done ? null : timeState}
                timeLabel={done ? null : timeLabel}
                color={colorForIdentity(entry.studentIds)}
                readOnly={isFuture}
                canMoveUp={index > 0}
                canMoveDown={index < entries.length - 1}
                onOpen={() => navigate(`/teaching/session/${entry.studentIds.join(',')}`)}
                onSkip={() => handleSkip(entry.id)}
                onRestore={() => handleRestore(entry)}
                onMarkNotHeld={() => setNotHeldTarget(entry)}
                onMove={entry.scheduleSeriesId != null ? () => { setMoveTarget(entry); setMoveDate(date) } : undefined}
                onMoveUp={() => handleMove(entry, -1)}
                onMoveDown={() => handleMove(entry, 1)}
              />
            )
          })}

          {unplanned.map((session) => (
            <TodayQueueItem
              key={`unplanned-${session.id}`}
              students={studentsFor(session.studentIds)}
              isGroup={session.studentIds.length > 1}
              done
              notHeld={session.status === 'notHeld'}
              unplanned
              color={colorForIdentity(session.studentIds)}
              mood={session.moods?.[session.studentIds[0]]}
            />
          ))}
        </div>
      )}

      <Modal
        open={!!moveTarget}
        onClose={() => setMoveTarget(null)}
        title="Μετακίνηση σε άλλη μέρα"
        footer={
          <>
            <Button variant="ghost" onClick={() => setMoveTarget(null)}>Ακύρωση</Button>
            <Button variant="primary" onClick={handleConfirmMove}>Μετακίνηση</Button>
          </>
        }
      >
        <p>Η σημερινή εμφάνιση δεν θα πραγματοποιηθεί σήμερα — θα μετακινηθεί στη νέα ημερομηνία. Το σταθερό πρόγραμμα δεν αλλάζει.</p>
        <DateField id="moveTargetDate" value={moveDate} onChange={setMoveDate} />
      </Modal>

      <Modal
        open={!!notHeldTarget}
        onClose={() => setNotHeldTarget(null)}
        title="Η συνεδρία δεν πραγματοποιήθηκε;"
        footer={
          <>
            <Button variant="ghost" onClick={() => setNotHeldTarget(null)}>Πίσω</Button>
            <Button variant="danger" loading={markingNotHeld} onClick={handleConfirmNotHeld}>Καταγραφή ως μη πραγματοποιηθείσα</Button>
          </>
        }
      >
        <p>Θα καταγραφεί ως μη πραγματοποιηθείσα, χωρίς μετρήσεις ή διάρκεια. Μπορείς να το αναιρέσεις οποιαδήποτε στιγμή με «Επαναφορά στη σειρά».</p>
      </Modal>
    </Card>
  )
}
