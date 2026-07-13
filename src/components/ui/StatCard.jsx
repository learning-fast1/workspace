import './StatCard.css'

// Γενικό stat card (COMPONENT_GUIDE.md § StatCard) — icon badge, μεγάλο metric, label, optional
// hint. Το metric είναι πάντα το κυρίαρχο στοιχείο. Δεν εμφανίζουμε fake/μη διαθέσιμα δεδομένα —
// ο γονέας αποφασίζει τι δείχνει (π.χ. "—" αν δεν υπάρχει ακόμα τιμή), όχι αυτό το component.
export default function StatCard({ icon: Icon, label, value, hint }) {
  return (
    <div className="stat-card">
      <span className="stat-card__icon">
        <Icon size={18} aria-hidden="true" />
      </span>
      <p className="stat-card__value">{value}</p>
      <p className="stat-card__label">{label}</p>
      {hint && <p className="stat-card__hint">{hint}</p>}
    </div>
  )
}
