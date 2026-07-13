import { Check, Minus, Plus, X } from 'lucide-react'
import { PROMPT_LEVELS } from '../config/promptLevels.js'
import Button from './ui/Button.jsx'
import './GoalRecorder.css'

// Καταχώρηση με ένα tap, προσαρμοσμένη στον τύπο μέτρησης του στόχου. ΑΜΕΤΑΒΛΗΤΑ props/λογική —
// value: η συσσωρευμένη τιμή αυτής της συνεδρίας (μέχρι να πατηθεί «Τέλος»). Η αναίρεση («Αναίρεση
// τελευταίας καταχώρησης») ζει ΕΚΤΟΣ αυτού του component, στο GoalRecorderCard/TeachingMode — εδώ
// μένει μόνο η καταγραφή προς τα εμπρός.
//
// Χρωματική διόρθωση έναντι της παλιάς υλοποίησης: η «Δυσκολία» ΔΕΝ είναι σφάλμα/κίνδυνος (είναι
// φυσιολογικό παιδαγωγικό δεδομένο) — άρα ουδέτερο (secondary), όχι danger. Η «Επιτυχία» παίρνει
// το νέο variant «success» (DESIGN_SYSTEM.md §3: «Το success για ... θετική πρόοδο»).
export default function GoalRecorder({ goal, value, onChange }) {
  if (goal.measurementType === 'successRatio') {
    const successes = value?.successes || 0
    const attempts = value?.attempts || 0
    return (
      <div className="goal-recorder">
        <div className="goal-recorder__row">
          <Button
            variant="success"
            icon={Check}
            className="goal-recorder__btn"
            onClick={() => onChange({ successes: successes + 1, attempts: attempts + 1 })}
          >
            Επιτυχία
          </Button>
          <Button
            variant="secondary"
            icon={X}
            className="goal-recorder__btn"
            onClick={() => onChange({ successes, attempts: attempts + 1 })}
          >
            Δυσκολία
          </Button>
        </div>
        <p className="goal-recorder__tally" aria-live="polite">{successes} / {attempts}</p>
      </div>
    )
  }

  if (goal.measurementType === 'promptLevel') {
    const level = value?.level
    return (
      <div className="goal-recorder">
        <div className="goal-recorder__row goal-recorder__row--wrap">
          {PROMPT_LEVELS.map((p) => (
            <Button
              key={p.value}
              variant={level === p.value ? 'primary' : 'secondary'}
              className="goal-recorder__btn"
              onClick={() => onChange({ level: p.value })}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <p className="goal-recorder__tally" aria-live="polite">
          {level ? PROMPT_LEVELS.find((p) => p.value === level)?.label : 'Καμία καταχώρηση ακόμα'}
        </p>
      </div>
    )
  }

  if (goal.measurementType === 'duration') {
    const minutes = value?.minutes || 0
    return (
      <div className="goal-recorder">
        <div className="goal-recorder__row">
          <Button variant="secondary" icon={Plus} className="goal-recorder__btn" onClick={() => onChange({ minutes: minutes + 1 })}>
            1 λεπτό
          </Button>
          <Button variant="secondary" icon={Plus} className="goal-recorder__btn" onClick={() => onChange({ minutes: minutes + 5 })}>
            5 λεπτά
          </Button>
        </div>
        <p className="goal-recorder__tally" aria-live="polite">{minutes} λεπτά</p>
      </div>
    )
  }

  if (goal.measurementType === 'taskAnalysis') {
    const stepsCompleted = value?.stepsCompleted || 0
    return (
      <div className="goal-recorder">
        <div className="goal-recorder__row goal-recorder__row--stepper">
          <Button
            variant="secondary"
            icon={Minus}
            ariaLabel="Λιγότερο βήμα"
            disabled={stepsCompleted === 0}
            onClick={() => onChange({ stepsCompleted: Math.max(0, stepsCompleted - 1) })}
          />
          <p className="goal-recorder__tally" aria-live="polite">{stepsCompleted} βήματα</p>
          <Button
            variant="secondary"
            icon={Plus}
            ariaLabel="Ένα βήμα παραπάνω"
            onClick={() => onChange({ stepsCompleted: stepsCompleted + 1 })}
          />
        </div>
      </div>
    )
  }

  return null
}
