import { useState } from 'react'
import { CLINICAL_RATINGS } from '../config/clinicalAssessmentRatings.js'
import Button from './ui/Button.jsx'
import Input from './ui/Input.jsx'
import Modal from './ui/Modal.jsx'
import './GoalClinicalAssessment.css'

// Κλινική εκτίμηση στόχου ανά συνεδρία — ΣΥΜΠΛΗΡΩΜΑΤΙΚΗ του measurement (GoalRecorder), ΠΟΤΕ
// υποκατάστατο. Πλήρως προαιρετική: value === null/undefined σημαίνει «καμία εκτίμηση», ΠΟΤΕ
// συνάγεται αυτόματα "Σταθερός" επειδή υπάρχει measurement. Controlled component, ίδιο idiom με
// το GoalRecorder — onChange καλεί ΠΑΝΤΑ με πλήρη νέα τιμή ({ rating, note }) ή null.
//
// «Κατακτήθηκε» ΔΕΝ είναι απλώς μία ακόμη βαθμίδα — σημαίνει επίσημη ολοκλήρωση του στόχου. Το
// onChange ΔΕΝ καλείται πριν επιβεβαιωθεί σε αυτό το modal (καθαρά client-side gate, καμία επαφή
// με db.js εδώ — η πραγματική μετάβαση κατάστασης γίνεται αργότερα, μέσα στο handleSaveSession
// του TeachingMode.jsx, ώστε να μη γραφτεί τίποτα αν ο δάσκαλος βγει χωρίς αποθήκευση συνεδρίας).

// canMarkMastered/masteredDisabledReason: μόνο το SessionModal (Edit Session) τα στέλνει — εκεί
// μπορεί να εμφανιστεί στόχος με κατάσταση που δεν επιτρέπει πλέον μετάβαση σε "achieved" (π.χ.
// archived). Προεπιλογή true ώστε το Teaching Mode (πάντα active goals, πάντα επιτρεπτή μετάβαση)
// να μη χρειάζεται καμία αλλαγή. Το ΗΔΗ επιλεγμένο "mastered" παραμένει πάντα clickable για
// αποεπιλογή (καμία αντίστροφη μετάβαση κατάστασης όταν αφαιρείται) — μπλοκάρεται μόνο η ΝΕΑ επιλογή.
export default function GoalClinicalAssessment({ goalTitle, value, onChange, canMarkMastered = true, masteredDisabledReason }) {
  const [pendingMastery, setPendingMastery] = useState(false)
  const rating = value?.rating || null

  function selectRating(nextRating) {
    if (rating === nextRating) {
      onChange(null)
      return
    }
    if (nextRating === 'mastered') {
      if (!canMarkMastered) return
      setPendingMastery(true)
      return
    }
    onChange({ rating: nextRating, note: value?.note || '' })
  }

  function confirmMastery() {
    onChange({ rating: 'mastered', note: value?.note || '' })
    setPendingMastery(false)
  }

  return (
    <div className="goal-clinical-assessment">
      <p className="goal-clinical-assessment__label">Κλινική εκτίμηση (προαιρετικό)</p>
      <div className="goal-clinical-assessment__row">
        {CLINICAL_RATINGS.map((r) => {
          const isMasteredChip = r.value === 'mastered'
          const alreadySelected = rating === r.value
          const disabled = isMasteredChip && !canMarkMastered && !alreadySelected
          return (
            <Button
              key={r.value}
              variant={alreadySelected ? 'primary' : 'secondary'}
              className="goal-clinical-assessment__chip"
              disabled={disabled}
              onClick={() => selectRating(r.value)}
            >
              {r.label}
            </Button>
          )
        })}
      </div>

      {!canMarkMastered && (
        <p className="goal-clinical-assessment__mastered-disabled-note">
          {masteredDisabledReason || 'Δεν επιτρέπεται μετάβαση σε «Επιτεύχθηκε» από την τρέχουσα κατάσταση του στόχου.'}
        </p>
      )}

      {rating && (
        <Input
          aria-label="Σύντομη παρατήρηση κλινικής εκτίμησης"
          placeholder="Σύντομη παρατήρηση (προαιρετικό)"
          value={value?.note || ''}
          onChange={(e) => onChange({ rating, note: e.target.value })}
        />
      )}

      <Modal
        open={pendingMastery}
        onClose={() => setPendingMastery(false)}
        title="Επιβεβαίωση ολοκλήρωσης στόχου"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingMastery(false)}>Άκυρο</Button>
            <Button variant="primary" onClick={confirmMastery}>Επιβεβαίωση</Button>
          </>
        }
      >
        <p>
          Ο στόχος «{goalTitle}» θα χαρακτηριστεί ως Επιτεύχθηκε. Θα ολοκληρωθεί επίσημα και δεν θα
          εμφανίζεται πλέον στους ενεργούς στόχους — θα παραμείνει διαθέσιμος στο ιστορικό του. Συνέχεια;
        </p>
      </Modal>
    </div>
  )
}
