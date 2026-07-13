import Button from './Button.jsx'
import './EmptyState.css'

// Γενικό κενό state — icon + τίτλος + περιγραφή + προαιρετική ενέργεια (Link μέσω `actionTo` ή
// onClick μέσω `onAction`). Ξαναχρησιμοποιεί το Button αντί να φτιάχνει δικό του κουμπί.
export default function EmptyState({ icon: Icon, title, description, actionLabel, actionIcon, onAction, actionTo }) {
  return (
    <div className="empty-state">
      {Icon && <Icon size={32} className="empty-state__icon" aria-hidden="true" />}
      <p className="empty-state__title">{title}</p>
      {description && <p className="empty-state__description">{description}</p>}
      {(onAction || actionTo) && (
        <Button variant="primary" icon={actionIcon} to={actionTo} onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  )
}
