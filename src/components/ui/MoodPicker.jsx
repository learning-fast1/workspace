import { MOOD_OPTIONS } from '../../config/moodOptions.js'
import './MoodPicker.css'

// Τέσσερα μεγάλα κουμπιά-εικονίδια, single-tap επιλογή, προαιρετική — ίδιο βάρος/μέγεθος με τα
// κουμπιά διάρκειας στο ίδιο modal. Χωρίς ορατή λεζάντα (μόνο aria-label) — σκόπιμη επιλογή
// προϊόντος, βλ. COMPONENT_GUIDE.md § MoodPicker. Ξανά-tap στην ήδη επιλεγμένη τιμή την αποεπιλέγει
// (καμία υποχρεωτική επιλογή).
//
// value/onChange: raw mood value string ή null, όχι event object — opinionated component, ίδιο
// μοτίβο με το DateField/ToggleRow.
export default function MoodPicker({ value, onChange, label }) {
  return (
    <div className="mood-picker">
      {label && <p className="mood-picker__label">{label}</p>}
      <div className="mood-picker__options">
        {MOOD_OPTIONS.map((m) => {
          const Icon = m.icon
          const selected = value === m.value
          return (
            <button
              key={m.value}
              type="button"
              className={`mood-picker__option mood-picker__option--${m.variant} ${selected ? 'mood-picker__option--selected' : ''}`}
              aria-label={m.label}
              aria-pressed={selected}
              onClick={() => onChange(selected ? null : m.value)}
            >
              <Icon size={24} aria-hidden="true" />
            </button>
          )
        })}
      </div>
    </div>
  )
}
