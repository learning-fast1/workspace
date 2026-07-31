import { useEffect, useRef, useState } from 'react'
import { MoreVertical } from 'lucide-react'
import './OverflowMenu.css'

// `items`: [{ label, icon, onClick, variant? = 'default' | 'danger' }]. Το panel ευθυγραμμίζεται
// πάντα δεξιά κάτω από το trigger (βλ. OverflowMenu.css) — αρκεί όσο το trigger βρίσκεται πάντα
// πάνω-δεξιά της κάρτας του (η σημερινή χρήση, στο StudentCard), αφού έτσι το menu ανοίγει πάντα
// ΠΡΟΣ ΤΑ ΜΕΣΑ στην κάρτα, ποτέ έξω από το άκρο της οθόνης.
//
// `renderTrigger`/`triggerClassName` (Header user-menu, review χρήστη): προαιρετική γενίκευση ώστε
// το ΙΔΙΟ, ήδη αποδεδειγμένο interaction pattern (open/close, click-outside, Escape, focus
// management — όλο το useEffect παρακάτω, ΑΝΕΓΓΙΧΤΟ) να ξαναχρησιμοποιείται με διαφορετικό trigger
// markup (π.χ. avatar+όνομα+chevron) αντί για πάντα το ίδιο MoreVertical εικονίδιο. Προεπιλογές =
// ακριβώς η προηγούμενη συμπεριφορά — καμία από τις 9 ήδη υπάρχουσες χρήσεις (GoalCard,
// StudentCard, HomeAttentionWidget, ...) αλλάζει.
export default function OverflowMenu({ items, ariaLabel = 'Περισσότερες ενέργειες', renderTrigger, triggerClassName = '' }) {
  const [open, setOpen] = useState(false)
  // Αν το panel (προεπιλογή: ανοίγει προς τα κάτω) θα ξεπερνούσε το κάτω άκρο του viewport —
  // π.χ. σε mobile, με αρκετά items, πίσω/κάτω από το fixed bottom nav — ανοίγει προς τα ΠΑΝΩ
  // αντί να μείνει εν μέρει εκτός οθόνης και άπιαστο με το δάχτυλο (επιβεβαιώθηκε live κατά το
  // Sprint 7 Στάδιο 7: 4 items σε GoalCard κοντά στο κάτω άκρο άφηναν το τελευταίο item off-screen
  // ανεξάρτητα από z-index). Δεν αφορά μόνο το Sprint 7 — οποιοδήποτε menu με αρκετά items κοντά
  // στο κάτω άκρο οποιασδήποτε σελίδας έχει το ίδιο ρίσκο.
  const [flipUp, setFlipUp] = useState(false)
  const containerRef = useRef(null)
  const triggerRef = useRef(null)

  useEffect(() => {
    if (!open) return

    const panel = containerRef.current?.querySelector('[role="menu"]')
    panel?.querySelector('button')?.focus()

    if (panel && triggerRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect()
      const panelHeight = panel.getBoundingClientRect().height
      setFlipUp(triggerRect.bottom + 4 + panelHeight > window.innerHeight)
    }

    function handlePointerDown(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false)
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  function handleItemClick(item) {
    setOpen(false)
    // Επαναφορά focus στο trigger ΠΡΙΝ την ενέργεια — αν η ενέργεια ανοίξει κάτι άλλο (π.χ. Modal
    // διαγραφής), το document.activeElement θα είναι ήδη σωστά το trigger (βλ. Modal.jsx).
    triggerRef.current?.focus()
    item.onClick()
  }

  return (
    <div className="overflow-menu" ref={containerRef}>
      <button
        type="button"
        ref={triggerRef}
        className={`overflow-menu__trigger ${triggerClassName}`.trim()}
        aria-label={ariaLabel}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {renderTrigger ? renderTrigger({ open }) : <MoreVertical size={18} />}
      </button>
      {open && (
        <div className={`overflow-menu__panel ${flipUp ? 'overflow-menu__panel--flip-up' : ''}`} role="menu">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={`overflow-menu__item ${item.variant === 'danger' ? 'overflow-menu__item--danger' : ''}`}
              onClick={() => handleItemClick(item)}
            >
              {item.icon && <item.icon size={16} aria-hidden="true" />}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
