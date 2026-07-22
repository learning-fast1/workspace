import { ChevronDown, ChevronUp, CircleCheck, Undo2 } from 'lucide-react'
import Card from './ui/Card.jsx'
import GoalRecorder from './GoalRecorder.jsx'
import GoalClinicalAssessment from './GoalClinicalAssessment.jsx'
import './GoalRecorderCard.css'

// Accordion item — καθαρά presentational, καμία query, καμία business logic. Το ποιος στόχος είναι
// ανοιχτός (expandedGoalId) και η αναίρεση (canUndo/onUndo) είναι state που κρατάει το TeachingMode.
// Συμπτυγμένο: τίτλος + περίληψη (line-clamp 2) + κριτήριο — ΚΑΝΕΝΑ recording UI (GoalRecorder) δεν
// αποδίδεται όσο είναι κλειστό, ώστε η λίστα να μένει ελαφριά ακόμη και με 15-20 στόχους.
export default function GoalRecorderCard({
  domainLabel, title, description, criterionHint, goal, value, onChange, canUndo, onUndo,
  isRecorded, expanded, onToggleExpand, clinicalAssessment, onClinicalAssessmentChange,
  canMarkMastered, masteredDisabledReason, onRemoveMeasurement
}) {
  return (
    <Card className={`goal-recorder-card ${expanded ? 'goal-recorder-card--expanded' : ''}`}>
      <button
        type="button"
        className="goal-recorder-card__header"
        onClick={onToggleExpand}
        aria-expanded={expanded}
      >
        <div className="goal-recorder-card__header-text">
          <p className="goal-recorder-card__domain">{domainLabel}</p>
          <h2 className="goal-recorder-card__title">
            {title}
            {isRecorded && (
              <CircleCheck
                size={16}
                className="goal-recorder-card__recorded-badge"
                aria-label="Καταγράφηκε σε αυτή τη συνεδρία"
              />
            )}
          </h2>
          {!expanded && description && (
            <p className="goal-recorder-card__description">{description}</p>
          )}
          {!expanded && criterionHint && <p className="goal-recorder-card__criterion">{criterionHint}</p>}
        </div>
        {expanded
          ? <ChevronUp size={20} className="goal-recorder-card__chevron" aria-hidden="true" />
          : <ChevronDown size={20} className="goal-recorder-card__chevron" aria-hidden="true" />}
      </button>

      {expanded && (
        <div className="goal-recorder-card__body">
          {criterionHint && <p className="goal-recorder-card__criterion">{criterionHint}</p>}

          <GoalRecorder goal={goal} value={value} onChange={onChange} />

          <GoalClinicalAssessment
            goalTitle={title}
            value={clinicalAssessment}
            onChange={onClinicalAssessmentChange}
            canMarkMastered={canMarkMastered}
            masteredDisabledReason={masteredDisabledReason}
          />

          {canUndo && (
            <button type="button" className="goal-recorder-card__undo" onClick={onUndo}>
              <Undo2 size={14} aria-hidden="true" />
              Αναίρεση τελευταίας καταχώρησης
            </button>
          )}

          {onRemoveMeasurement && isRecorded && (
            <button type="button" className="goal-recorder-card__undo" onClick={onRemoveMeasurement}>
              <Undo2 size={14} aria-hidden="true" />
              Αφαίρεση μέτρησης από τη συνεδρία
            </button>
          )}
        </div>
      )}
    </Card>
  )
}
