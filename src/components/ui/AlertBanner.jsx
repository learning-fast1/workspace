import { AlertTriangle, CircleCheck, Info } from 'lucide-react'
import './AlertBanner.css'

const DEFAULT_ICONS = { info: Info, success: CircleCheck, warning: AlertTriangle, danger: AlertTriangle }

// Σύντομο μήνυμα κατάστασης σε επίπεδο σελίδας — 'info' | 'success' | 'warning' | 'danger'.
// Καθαρά presentational. Το danger variant παίρνει role="alert" (ανακοινώνεται άμεσα).
export default function AlertBanner({ variant = 'info', icon, className = '', children }) {
  const Icon = icon || DEFAULT_ICONS[variant]
  return (
    <div
      className={`alert-banner alert-banner--${variant} ${className}`.trim()}
      role={variant === 'danger' ? 'alert' : undefined}
    >
      {Icon && <Icon size={18} className="alert-banner__icon" aria-hidden="true" />}
      <span className="alert-banner__text">{children}</span>
    </div>
  )
}
