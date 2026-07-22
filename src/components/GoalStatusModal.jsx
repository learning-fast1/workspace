import { useRef, useState } from 'react'
import { transitionGoalStatus, getAllowedGoalStatusTransitions } from '../db.js'
import { statusLabel } from '../config/goalOptions.js'
import Modal from './ui/Modal.jsx'
import Button from './ui/Button.jsx'
import FormField from './ui/FormField.jsx'
import Textarea from './ui/Textarea.jsx'
import './GoalStatusModal.css'

// Μοναδικό UI σημείο αλλαγής κατάστασης στόχου (Technical Plan Στάδιο 3) — καλεί ΑΠΟΚΛΕΙΣΤΙΚΑ το
// transitionGoalStatus (db.js). Οι επιλογές προέρχονται ΑΠΟΚΛΕΙΣΤΙΚΑ από
// getAllowedGoalStatusTransitions — κανένα δεύτερο, hardcoded αντίγραφο του state machine εδώ.
//
// goal: { id, title, status, criterion, progressPercent } — progressPercent ήδη υπολογισμένο από
// το GoalsList (0-100 ή null), ΙΔΙΑ τιμή με αυτή που δείχνει η κάρτα — καμία επανάληψη υπολογισμού.
export default function GoalStatusModal({ goal, onClose, onSuccess }) {
  const allowedStatuses = getAllowedGoalStatusTransitions(goal.status)
  const [toStatus, setToStatus] = useState(allowedStatuses[0] || '')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  // Ref εκτός από state (ίδιο μοτίβο με ObservationPanel/StudentForm): το setState δεν εφαρμόζεται
  // συγχρονισμένα — ένα γρήγορο διπλό κλικ στο ίδιο tick θα διάβαζε και τα δύο saving=false.
  const savingRef = useRef(false)

  async function handleConfirm() {
    if (savingRef.current || !toStatus) return
    savingRef.current = true
    setSaving(true)
    setError(null)
    try {
      await transitionGoalStatus(goal.id, toStatus, { note: note.trim(), trigger: 'manual' })
      // Το modal κλείνει ΜΟΝΟ εδώ — αφού η συναλλαγή έχει ήδη ολοκληρωθεί επιτυχώς. Καμία
      // αισιόδοξη (optimistic) εμφάνιση επιτυχίας πριν το await παραπάνω τελειώσει.
      onSuccess()
    } catch (err) {
      setError(err?.message || 'Η αλλαγή κατάστασης απέτυχε. Δοκίμασε ξανά.')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  // Όσο αποθηκεύει, Escape/backdrop-click δεν πρέπει να κλείνουν το modal (θα εγκατέλειπαν μια
  // ενέργεια σε εξέλιξη χωρίς να ξέρει ο χρήστης αν πέτυχε) — «κλείσιμο με Escape όπου είναι ασφαλές».
  function handleClose() {
    if (saving) return
    onClose()
  }

  const showAchievedInfo = toStatus === 'achieved'

  return (
    <Modal
      open
      onClose={handleClose}
      title={`Αλλαγή κατάστασης — ${goal.title}`}
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={saving}>Άκυρο</Button>
          <Button variant="primary" loading={saving} disabled={!toStatus} onClick={handleConfirm}>
            Επιβεβαίωση
          </Button>
        </>
      }
    >
      <p className="goal-status-modal__current">
        Τρέχουσα κατάσταση: <strong>{statusLabel(goal.status)}</strong>
      </p>

      <div className="goal-status-modal__options" role="radiogroup" aria-label="Νέα κατάσταση">
        {allowedStatuses.map((s) => (
          <label key={s} className="goal-status-modal__radio">
            <input
              type="radio"
              name="goalStatusTarget"
              checked={toStatus === s}
              onChange={() => setToStatus(s)}
              disabled={saving}
            />
            {statusLabel(s)}
          </label>
        ))}
      </div>

      {showAchievedInfo && (
        <p className="goal-status-modal__achieved-info">
          {goal.progressPercent !== null && goal.progressPercent !== undefined
            ? `Τρέχουσα πρόοδος: ${Math.round(goal.progressPercent)}% — κριτήριο: «${goal.criterion || '—'}». Η τελική απόφαση παραμένει δική σου.`
            : 'Δεν υπάρχει ακόμα καταγεγραμμένη μέτρηση προόδου για αυτόν τον στόχο.'}
        </p>
      )}

      <FormField htmlFor="goalStatusNote" label="Σημείωση (προαιρετικά)">
        <Textarea
          id="goalStatusNote"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={saving}
          placeholder="π.χ. αναρρωτική άδεια, πέτυχε το κριτήριο σε ελεγχόμενο περιβάλλον…"
        />
      </FormField>

      {error && <p className="goal-status-modal__error" role="alert">{error}</p>}
    </Modal>
  )
}
