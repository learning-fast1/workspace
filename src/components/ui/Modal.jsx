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
  // Οι πραγματικοί callers (GoalDetail.jsx, SessionHistory.jsx) στέλνουν onClose ως inline arrow
  // function — νέα αναφορά σε ΚΑΘΕ re-render του γονέα. Αν το παρακάτω useEffect εξαρτιόταν από το
  // onClose, θα ξανάτρεχε (καθαρισμός + setup) σε κάθε τέτοιο re-render ΟΣΟ το modal παραμένει
  // ανοιχτό — μηδενίζοντας το hasFocusedInsidePanelRef παρακάτω ΚΑΙ το previouslyFocusedRef στην
  // τρέχουσα (όχι στην αρχική) εστίαση. Το ref κρατά πάντα την τελευταία έκδοση χωρίς να είναι
  // dependency, ώστε το effect να τρέχει ΜΟΝΟ σε πραγματική μετάβαση open false→true.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })
  // UX bug (Edit Session — «Αφαίρεση μέτρησης»): όταν ο χρήστης είχε ήδη focus μέσα στο panel και
  // ένα κλικ αφαιρεί ΑΠΟ ΤΟ DOM ακριβώς το focused στοιχείο (π.χ. ένα κουμπί που εξαφανίζεται μετά
  // την ενέργειά του), ο browser μεταφέρει αυτόματα το focus στο document.body — η MutationObserver
  // παρακάτω το έβλεπε ως «κανένα focus μέσα στο panel» και πηδούσε στο ΠΡΩΤΟ focusable στοιχείο
  // της φόρμας, τραβώντας οπτικά ολόκληρο το modal στην κορυφή (χαμένη θέση κύλισης σε φόρμες με
  // πολλούς στόχους). Αυτό το ref θυμάται αν ο χρήστης έχει ΗΔΗ εστιάσει κάτι μέσα στο panel· από
  // εκεί και πέρα, μια απώλεια focus λόγω αφαίρεσης στοιχείου ΔΕΝ ξαναπηδάει στην αρχή.
  const hasFocusedInsidePanelRef = useRef(false)

  useEffect(() => {
    if (!open) return

    previouslyFocusedRef.current = document.activeElement
    hasFocusedInsidePanelRef.current = false

    // Ξεχωριστή συνάρτηση (όχι μία φορά σε τοπική μεταβλητή) — το περιεχόμενο ενός modal μπορεί
    // να φορτώνει ασύγχρονα (π.χ. useLiveQuery: πρώτο render «Φόρτωση…» με μηδέν focusable
    // στοιχεία, δεύτερο render με την πραγματική λίστα) — ένα ΜΙΑ ΦΟΡΑ query στο mount θα έβρισκε
    // μηδέν στοιχεία και δεν θα ξαναδοκίμαζε ποτέ (επιβεβαιώθηκε live, Sprint 7 Στάδιο 7:
    // CopyGoalToStudentModal/GoalLibraryPicker). Δεν κλέβει focus αν ο χρήστης έχει ήδη
    // αλληλεπιδράσει μέσα στο panel.
    function focusFirst() {
      const panel = panelRef.current
      if (!panel) return
      if (panel.contains(document.activeElement) && document.activeElement !== panel) {
        hasFocusedInsidePanelRef.current = true
        return
      }
      if (hasFocusedInsidePanelRef.current) {
        // Το focus δεν «χάθηκε» ποτέ πραγματικά — απλώς αφαιρέθηκε από το DOM το στοιχείο που το
        // είχε. Κρατάμε το focus στο ίδιο το panel, ΧΩΡΙΣ scroll, αντί να πηδήξουμε στην αρχή.
        panel.focus({ preventScroll: true })
        return
      }
      const focusable = panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
      if (focusable.length > 0) {
        focusable[0].focus()
        hasFocusedInsidePanelRef.current = true
      } else {
        panel.focus()
      }
    }

    focusFirst()

    const observer = new MutationObserver(focusFirst)
    if (panelRef.current) observer.observe(panelRef.current, { childList: true, subtree: true })

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (e.key === 'Tab') {
        // Ζωντανό query σε κάθε Tab (όχι stale closure από το mount) — ίδιος λόγος με το
        // focusFirst παραπάνω: το περιεχόμενο μπορεί να έχει αλλάξει από τότε που άνοιξε το modal.
        const focusable = panelRef.current?.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
        if (!focusable || focusable.length === 0) return
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
      observer.disconnect()
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocusedRef.current?.focus?.()
    }
  }, [open])

  if (!open) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        ref={panelRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="modal__title" id="modal-title">{title}</h2>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__footer">{footer}</div>}
      </div>
    </div>
  )
}
