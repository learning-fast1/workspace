import { useEffect, useRef } from 'react'
import './Modal.css'

// Απλό, προσβάσιμο modal (χωρίς portal — position:fixed αρκεί, ίδιο μοτίβο με το υπάρχον
// .overlay του TeachingMode). Στο άνοιγμα: αποθηκεύει ποιο στοιχείο είχε focus και το εστιάζει
// ξανά στο κλείσιμο (γι' αυτό αρκεί το OverflowMenu να επαναφέρει focus στο trigger του ΠΡΙΝ
// καλέσει το onClick που ανοίγει το modal — βλ. OverflowMenu.jsx). Escape κλείνει, click στο
// backdrop κλείνει, Tab παγιδεύεται μέσα στο modal όσο είναι ανοιχτό.
export default function Modal({ open, onClose, title, children, footer }) {
  const panelRef = useRef(null)
  const previouslyFocusedRef = useRef(null)

  useEffect(() => {
    if (!open) return

    previouslyFocusedRef.current = document.activeElement
    const panel = panelRef.current
    const focusable = panel?.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    focusable?.[0]?.focus()

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key === 'Tab' && focusable && focusable.length > 0) {
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocusedRef.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="modal__title" id="modal-title">{title}</h2>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__footer">{footer}</div>}
      </div>
    </div>
  )
}
