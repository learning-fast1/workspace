import { Check } from 'lucide-react'
import Badge from './Badge.jsx'
import './MeasurementTypeCard.css'

// Μία κάρτα επιλογής τύπου μέτρησης (Technical Plan Στάδιο 3) — καθαρά presentational. Το
// role="radiogroup"/name/keyboard ζει στο GoalWizardForm.jsx Step 3 (Οθόνη Α). Native
// <input type="radio"> μέσα σε <label> — ίδιο θεμέλιο με το ui/ChoiceGroup.jsx, ώστε keyboard
// navigation/Enter-Space selection/disabled-skipping να έρχονται δωρεάν από τον browser, όχι
// custom JS. Selected state δείχνεται ΚΑΙ με περίγραμμα ΚΑΙ με check-εικονίδιο, όχι μόνο χρώμα.
//
// recommended: καθαρά οπτική υπόδειξη βάσει τομέα (config/measurementRecommendations.js) — ΠΟΤΕ
// προεπιλογή, ΠΟΤΕ επηρεάζει disabled/selectable. Όταν το κουτί είναι ΚΑΙ recommended ΚΑΙ selected,
// επικρατεί το selected στυλ — γι' αυτό το recommended border/label εμφανίζονται ΜΟΝΟ όταν !selected.
export default function MeasurementTypeCard({ type, name, selected, disabled, isNew, recommended, onSelect, describedById }) {
  const showRecommended = recommended && !selected
  return (
    <label
      className={[
        'measurement-type-card',
        selected && 'measurement-type-card--selected',
        showRecommended && 'measurement-type-card--recommended',
        disabled && 'measurement-type-card--disabled'
      ].filter(Boolean).join(' ')}
    >
      <input
        type="radio"
        name={name}
        value={type.value}
        checked={selected}
        disabled={disabled}
        onChange={() => onSelect(type.value)}
        aria-describedby={disabled ? describedById : undefined}
      />
      {isNew && <Badge variant="primary">ΝΕΟ</Badge>}
      <span className="measurement-type-card__label">
        {type.label}
        {selected && <Check className="measurement-type-card__check" size={15} aria-hidden="true" />}
      </span>
      {showRecommended && <span className="measurement-type-card__recommended-tag">Προτείνεται</span>}
    </label>
  )
}
