import './ChoiceGroup.css'

// Γενικό, προσβάσιμο radiogroup για N αμοιβαία αποκλειόμενες επιλογές (καμία υπήρχε ήδη — το
// GoalStatusModal έχει το δικό του hand-built παράδειγμα, εδώ γίνεται επαναχρησιμοποιήσιμο).
// options: [{ value, label, helperText? }]. Ίδιο idiom (role="radiogroup" + native <input
// type="radio">) με το GoalStatusModal.jsx, ώστε keyboard/screen-reader συμπεριφορά να είναι ήδη
// γνωστή/δοκιμασμένη σε αυτή την εφαρμογή.
export default function ChoiceGroup({ name, value, onChange, options, ariaLabel, disabled = false }) {
  return (
    <div className="choice-group" role="radiogroup" aria-label={ariaLabel}>
      {options.map((opt) => (
        <label key={opt.value} className={`choice-group__option ${value === opt.value ? 'choice-group__option--selected' : ''}`}>
          <input
            type="radio"
            name={name}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            disabled={disabled}
          />
          <span className="choice-group__option-text">
            <span className="choice-group__option-label">{opt.label}</span>
            {opt.helperText && <span className="choice-group__option-helper">{opt.helperText}</span>}
          </span>
        </label>
      ))}
    </div>
  )
}
