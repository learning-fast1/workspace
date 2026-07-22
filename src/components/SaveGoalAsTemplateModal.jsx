import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { saveGoalAsTemplate, listGoalTemplates } from '../db.js'
import Modal from './ui/Modal.jsx'
import Button from './ui/Button.jsx'
import './SaveGoalAsTemplateModal.css'

// «Αποθήκευσε ως πρότυπο» (GoalCard overflow) — Technical Plan Στάδιο 7, σημείο 4. Ρητή απόφαση
// για επαναλαμβανόμενη αποθήκευση του ΙΔΙΟΥ goal: αν υπάρχει ήδη πρότυπο με ΑΚΡΙΒΩΣ το ίδιο
// περιεχόμενο (τομέας/τίτλος/περιγραφή/κριτήριο/τύπος μέτρησης) στη βιβλιοθήκη, προειδοποιεί
// ρητά πριν προχωρήσει — ΠΟΤΕ σιωπηλή δημιουργία πολλαπλών πανομοιότυπων προτύπων. Ο εκπαιδευτικός
// μπορεί να επιβεβαιώσει τη δημιουργία αντιγράφου έστω κι έτσι (π.χ. σκόπιμη παραλλαγή αργότερα).
export default function SaveGoalAsTemplateModal({ goal, onClose }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)
  const savingRef = useRef(false)

  const existingTemplates = useLiveQuery(() => listGoalTemplates(goal.domain), [goal.domain])
  const duplicate = existingTemplates?.find((t) =>
    t.title === goal.title &&
    (t.description || '') === (goal.description || '') &&
    (t.criterion || '') === (goal.criterion || '') &&
    (t.measurementType || '') === (goal.measurementType || '')
  )

  async function handleConfirm() {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setError(null)
    try {
      await saveGoalAsTemplate(goal.id)
      setDone(true)
    } catch (err) {
      setError(err?.message || 'Η αποθήκευση απέτυχε. Δοκίμασε ξανά.')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  function handleClose() {
    if (saving) return
    onClose()
  }

  if (done) {
    return (
      <Modal
        open
        onClose={onClose}
        title="Αποθηκεύτηκε"
        footer={<Button variant="primary" onClick={onClose}>Κλείσιμο</Button>}
      >
        <p className="save-as-template-modal__success">✓ Ο στόχος αποθηκεύτηκε στη βιβλιοθήκη σου ως πρότυπο.</p>
      </Modal>
    )
  }

  return (
    <Modal
      open
      onClose={handleClose}
      title="Αποθήκευση ως πρότυπο"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={saving}>Ακύρωση</Button>
          <Button variant="primary" loading={saving} onClick={handleConfirm}>
            {duplicate ? 'Δημιουργία αντιγράφου' : 'Αποθήκευση'}
          </Button>
        </>
      }
    >
      {duplicate ? (
        <p>Υπάρχει ήδη πρότυπο με ακριβώς αυτό το περιεχόμενο στη βιβλιοθήκη σου («{duplicate.title}»). Θέλεις να δημιουργηθεί ακόμα ένα αντίγραφο;</p>
      ) : (
        <p>
          Ο στόχος «{goal.title}» θα αποθηκευτεί στην προσωπική σου βιβλιοθήκη — μόνο το επαναχρησιμοποιήσιμο
          περιεχόμενο (τομέας, τίτλος, περιγραφή, κριτήριο, τύπος μέτρησης). Το baseline ΔΕΝ αποθηκεύεται.
        </p>
      )}
      {error && <p role="alert" className="save-as-template-modal__error">{error}</p>}
    </Modal>
  )
}
