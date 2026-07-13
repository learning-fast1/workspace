import './ProgressBar.css'

// Μπάρα προόδου 0-100. Το ποσοστό εμφανίζεται ΠΑΝΤΑ και ως κείμενο (COMPONENT_GUIDE.md —
// δεν βασιζόμαστε μόνο στο χρώμα/μήκος της μπάρας). Ίδιο χρωματικό pattern παντού — καμία
// δυναμική αλλαγή χρώματος ανά τιμή.
export default function ProgressBar({ value, label }) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div className="progress-bar">
      <div className="progress-bar__track">
        <div className="progress-bar__fill" style={{ width: `${clamped}%` }} />
      </div>
      <span className="progress-bar__label">{label ?? `${Math.round(clamped)}%`}</span>
    </div>
  )
}
