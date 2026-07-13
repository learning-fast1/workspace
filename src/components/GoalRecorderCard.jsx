import { Undo2 } from 'lucide-react'
import Card from './ui/Card.jsx'
import GoalRecorder from './GoalRecorder.jsx'
import './GoalRecorderCard.css'

// Καθαρά presentational — καμία query, καμία business logic. Η αναίρεση (canUndo/onUndo) είναι
// state που κρατάει το TeachingMode (single-level, ανά στόχο) — αυτό το component απλά δείχνει το
// κουμπί όταν υπάρχει κάτι να αναιρεθεί.
export default function GoalRecorderCard({ domainLabel, title, criterionHint, goal, value, onChange, canUndo, onUndo }) {
  return (
    <Card className="goal-recorder-card">
      <p className="goal-recorder-card__domain">{domainLabel}</p>
      <h2 className="goal-recorder-card__title">{title}</h2>
      {criterionHint && <p className="goal-recorder-card__criterion">{criterionHint}</p>}

      <GoalRecorder goal={goal} value={value} onChange={onChange} />

      {canUndo && (
        <button type="button" className="goal-recorder-card__undo" onClick={onUndo}>
          <Undo2 size={14} aria-hidden="true" />
          Αναίρεση τελευταίας καταχώρησης
        </button>
      )}
    </Card>
  )
}
