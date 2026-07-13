import './Badge.css'

// Μικρή ετικέτα κατάστασης — 'neutral' | 'primary' | 'success' | 'warning' | 'danger'.
export default function Badge({ variant = 'neutral', children }) {
  return <span className={`badge badge--${variant}`}>{children}</span>
}
