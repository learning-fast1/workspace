import './Card.css'

// Γενική επιφάνεια — 'default' | 'interactive' | 'soft' | 'alert'. `as` επιτρέπει να αποδοθεί ως
// άλλο στοιχείο (π.χ. 'section') όταν χρειάζεται πιο σωστή σημασιολογία.
export default function Card({ variant = 'default', as: As = 'div', className = '', children, ...rest }) {
  return (
    <As className={`card card--${variant} ${className}`.trim()} {...rest}>
      {children}
    </As>
  )
}
