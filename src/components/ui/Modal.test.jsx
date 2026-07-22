import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Modal from './Modal.jsx'

afterEach(() => cleanup())

// Bug report: πολύ μεγάλο/συνεχόμενο κείμενο (π.χ. narrative μέτρηση χωρίς κενά) μέσα σε modal
// ξέφευγε οριζόντια, αναγκάζοντας οριζόντιο scroll στο ίδιο το modal αντί να τυλίγεται προς τα κάτω
// (βλ. SessionModal.jsx — 3η φορά που εμφανίζεται η ίδια οικογένεια bug, μετά GoalRecorderCard/
// ActivityItem). Το fix μπαίνει ΜΙΑ φορά εδώ, στο κοινό .modal__body — overflow-wrap/word-break
// είναι inherited, άρα προστατεύουν ΚΑΘΕ ελεύθερο κείμενο μέσα σε ΟΠΟΙΟΔΗΠΟΤΕ modal της εφαρμογής.
const HUGE_UNBROKEN_TEXT = 'κ'.repeat(400)

describe('Modal — ανθεκτικότητα σε πολύ μεγάλο συνεχόμενο κείμενο', () => {
  it('το πλήρες κείμενο αποδίδεται άθικτο μέσα στο modal__body', () => {
    render(
      <Modal open onClose={vi.fn()} title="Τίτλος">
        <p>{HUGE_UNBROKEN_TEXT}</p>
      </Modal>
    )
    expect(screen.getByText(HUGE_UNBROKEN_TEXT).textContent.length).toBe(HUGE_UNBROKEN_TEXT.length)
  })

  // «Καρφώνει» την ίδια τη CSS δήλωση (jsdom δεν κάνει πραγματικό layout/overflow measurement) —
  // μελλοντική αφαίρεσή της θα σπάσει αυτό το test αντί να περάσει σιωπηλά.
  it('Modal.css: .modal__body έχει overflow-wrap: anywhere', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/components/ui/Modal.css'), 'utf-8')
    const match = css.match(/\.modal__body\s*\{([^}]*)\}/)
    expect(match).toBeTruthy()
    expect(match[1]).toMatch(/overflow-wrap:\s*anywhere/)
  })
})

// Bug report (Edit Session — «Αφαίρεση μέτρησης από τη συνεδρία»): το κλικ αφαιρούσε από το DOM
// ακριβώς το κουμπί που είχε focus· ο browser μεταφέρει τότε αυτόματα το focus στο document.body,
// και η MutationObserver του Modal (focusFirst) το εξέλαβε ως «κανένα focus μέσα στο panel» —
// πηδώντας στο ΠΡΩΤΟ focusable στοιχείο της φόρμας, δηλαδή τραβώντας οπτικά όλο το modal (και τη
// θέση κύλισης) στην κορυφή. Ο χρήστης όμως είχε ήδη αλληλεπιδράσει μέσα στο panel — δεν έπρεπε να
// ξαναπηδήξει πουθενά.
// onClose={vi.fn()} ΕΠΙΤΗΔΕΣ inline (νέα αναφορά σε κάθε re-render, όχι σταθερή) — έτσι ακριβώς το
// καλούν και οι πραγματικοί callers (GoalDetail.jsx, SessionHistory.jsx: onClose={() => ...}).
// Ένα πρώτο fix (μόνο hasFocusedInsidePanelRef) περνούσε με σταθερό onClose αλλά ΟΧΙ με αυτό εδώ —
// το useEffect του Modal εξαρτιόταν παλιότερα από το onClose, άρα ξανάτρεχε (και μηδένιζε το
// hasFocusedInsidePanelRef) σε ΚΑΘΕ re-render όσο ήταν ανοιχτό. Το πραγματικό fix κρατά το onClose
// σε ref εκτός dependency array.
function RemovableButtonModal() {
  const [visible, setVisible] = useState(true)
  return (
    <Modal open onClose={vi.fn()} title="Τίτλος">
      <button>Πρώτο πεδίο</button>
      {visible && <button onClick={() => setVisible(false)}>Αφαίρεση</button>}
    </Modal>
  )
}

describe('Modal — αφαίρεση focused στοιχείου δεν πρέπει να «τηλεμεταφέρει» το focus στην αρχή', () => {
  it('αφού ο χρήστης έχει ήδη focus μέσα στο panel, η αφαίρεση του focused στοιχείου ΔΕΝ μεταφέρει το focus στο πρώτο πεδίο της φόρμας', async () => {
    const user = userEvent.setup()
    render(<RemovableButtonModal />)

    const removable = screen.getByRole('button', { name: 'Αφαίρεση' })
    removable.focus()
    expect(document.activeElement).toBe(removable)

    await user.click(removable)

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Αφαίρεση' })).not.toBeInTheDocument())
    await waitFor(() => expect(document.activeElement).not.toBe(document.body))

    // ΔΕΝ πήδηξε στο «Πρώτο πεδίο» (θα σήμαινε scroll στην κορυφή) — έμεινε στο ίδιο το panel.
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'Πρώτο πεδίο' }))
    expect(document.activeElement).toBe(screen.getByRole('dialog'))
  })
})

// Bug report (Completion Modal — σε χαμηλά ύψη οθόνης το «Αποθήκευση» χανόταν κάτω από το fold,
// έπρεπε ο χρήστης να κάνει κύλιση ολόκληρου του modal για να το βρει). Fix: .modal γίνεται flex
// column· ΜΟΝΟ το .modal__body κυλάει, τίτλος/footer μένουν καρφωμένα — «καρφώνουμε» εδώ τις ίδιες
// τις CSS δηλώσεις (jsdom δεν κάνει πραγματικό layout/scroll measurement).
describe('Modal.css: sticky footer/title — μόνο το modal__body κυλάει', () => {
  it('.modal είναι flex column με max-height (ΟΧΙ πια το ίδιο το scroll container)', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/components/ui/Modal.css'), 'utf-8')
    const match = css.match(/\.modal\s*\{([^}]*)\}/)
    expect(match).toBeTruthy()
    expect(match[1]).toMatch(/display:\s*flex/)
    expect(match[1]).toMatch(/flex-direction:\s*column/)
    expect(match[1]).not.toMatch(/overflow-y:\s*auto/)
  })

  it('.modal__body είναι flex:1 + min-height:0 + overflow-y:auto (η ΜΟΝΗ κυλιόμενη περιοχή)', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/components/ui/Modal.css'), 'utf-8')
    const match = css.match(/\.modal__body\s*\{([^}]*)\}/)
    expect(match).toBeTruthy()
    expect(match[1]).toMatch(/flex:\s*1/)
    expect(match[1]).toMatch(/min-height:\s*0/)
    expect(match[1]).toMatch(/overflow-y:\s*auto/)
  })

  it('.modal__title και .modal__footer έχουν flex-shrink:0 (πάντα ορατά, ποτέ δεν συρρικνώνονται)', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/components/ui/Modal.css'), 'utf-8')
    const titleMatch = css.match(/\.modal__title\s*\{([^}]*)\}/)
    const footerMatch = css.match(/\.modal__footer\s*\{([^}]*)\}/)
    expect(titleMatch[1]).toMatch(/flex-shrink:\s*0/)
    expect(footerMatch[1]).toMatch(/flex-shrink:\s*0/)
  })
})
