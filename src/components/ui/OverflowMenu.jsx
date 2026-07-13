import { useEffect, useRef, useState } from 'react'
import { MoreVertical } from 'lucide-react'
import './OverflowMenu.css'

// `items`: [{ label, icon, onClick, variant? = 'default' | 'danger' }]. Το panel ευθυγραμμίζεται
// πάντα δεξιά κάτω από το trigger (βλ. OverflowMenu.css) — αρκεί όσο το trigger βρίσκεται πάντα
// πάνω-δεξιά της κάρτας του (η σημερινή χρήση, στο StudentCard), αφού έτσι το menu ανοίγει πάντα
// ΠΡΟΣ ΤΑ ΜΕΣΑ στην κάρτα, ποτέ έξω από το άκρο της οθόνης.
export default function OverflowMenu({ items, ariaLabel = 'Περισσότερες ενέργειες' }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)
  const triggerRef = useRef(null)

  useEffect(() => {
    if (!open) return

    const panel = containerRef.current?.querySelector('[role="menu"]')
    panel?.querySelector('button')?.focus()

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
        className="overflow-menu__trigger"
        aria-label={ariaLabel}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreVertical size={18} />
      </button>
      {open && (
        <div className="overflow-menu__panel" role="menu">
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
