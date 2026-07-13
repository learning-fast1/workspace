import { ArrowLeft } from 'lucide-react'
import Button from './Button.jsx'
import './PageHeader.css'

// Επικεφαλίδα σελίδας — τίτλος (+ προαιρετικός δυναμικός υπότιτλος), προαιρετικό back action,
// και μέχρι μία primary ενέργεια + δευτερεύουσες. Καθαρά presentational· ο γονέας αποφασίζει τι
// λέει το subtitle και τι κάνει το back (π.χ. dirty-check πριν navigate — δεν είναι απλό Link
// επίτηδες, ώστε ο καλών να μπορεί να παρεμβάλει δικό του έλεγχο πριν την πλοήγηση).
// back: { label, onClick, disabled? }
export default function PageHeader({ title, subtitle, back, primaryAction, secondaryActions = [] }) {
  return (
    <div className="page-header">
      <div className="page-header__text">
        {back && (
          <button
            type="button"
            className="page-header__back"
            onClick={back.onClick}
            disabled={back.disabled}
          >
            <ArrowLeft size={16} aria-hidden="true" />
            {back.label}
          </button>
        )}
        <h1 className="page-header__title">{title}</h1>
        {subtitle && <p className="page-header__subtitle">{subtitle}</p>}
      </div>
      {(primaryAction || secondaryActions.length > 0) && (
        <div className="page-header__actions">
          {secondaryActions.map((action) => (
            <Button key={action.label} variant="secondary" icon={action.icon} to={action.to} onClick={action.onClick}>
              {action.label}
            </Button>
          ))}
          {primaryAction && (
            <Button variant="primary" icon={primaryAction.icon} to={primaryAction.to} onClick={primaryAction.onClick}>
              {primaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
