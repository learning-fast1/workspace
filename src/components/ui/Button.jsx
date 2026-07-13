import { Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import './Button.css'

// Γενικό κουμπί — 'primary' | 'secondary' | 'ghost' | 'danger'. Αν δοθεί `to`, γίνεται React Router
// Link (πλοήγηση)· αλλιώς κανονικό <button> με onClick. Το icon (προαιρετικό, Lucide component)
// εμφανίζεται πάντα αριστερά από το κείμενο. `loading`: αντικαθιστά το icon με spinner και
// απενεργοποιεί το κουμπί — ΔΕΝ αλλάζει το κείμενο (children), ώστε το πλάτος να μην πηδάει.
export default function Button({
  variant = 'secondary',
  icon: Icon,
  loading = false,
  to,
  onClick,
  type = 'button',
  disabled = false,
  ariaLabel,
  className: extraClassName = '',
  children
}) {
  const isDisabled = disabled || loading
  const className = `btn btn--${variant} ${extraClassName}`.trim()
  const content = (
    <>
      {loading ? <Loader2 size={18} className="btn__spinner" aria-hidden="true" /> : (Icon && <Icon size={18} aria-hidden="true" />)}
      {children}
    </>
  )

  if (to) {
    return (
      <Link to={to} className={className} aria-label={ariaLabel}>
        {content}
      </Link>
    )
  }

  return (
    <button
      type={type}
      className={className}
      onClick={onClick}
      disabled={isDisabled}
      aria-label={ariaLabel}
      aria-busy={loading || undefined}
    >
      {content}
    </button>
  )
}
