import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CriterionPanelSuccessRatio from './CriterionPanelSuccessRatio.jsx'
import CriterionPanelPromptLevel from './CriterionPanelPromptLevel.jsx'
import CriterionPanelNarrative from './CriterionPanelNarrative.jsx'
import CriterionPanelDuration from './CriterionPanelDuration.jsx'
import CriterionPanelFrequency from './CriterionPanelFrequency.jsx'
import CriterionPanelRatingScale from './CriterionPanelRatingScale.jsx'
import CriterionPanelTaskAnalysis from './CriterionPanelTaskAnalysis.jsx'
import CriterionPanelChecklist from './CriterionPanelChecklist.jsx'

afterEach(() => cleanup())

// Ελαφρύ controlled wrapper — τα panels είναι config-driven (καμία δική τους πηγή αλήθειας), οπότε
// τα tests χρειάζονται ένα πραγματικό React state container γύρω τους για να δουν το αποτέλεσμα
// διαδοχικών αλλαγών (π.χ. προσθήκη βήματος ΜΕΤΑ από προσθήκη βήματος).
function Controlled({ Panel, initial }) {
  const [config, setConfig] = useState(initial)
  return <Panel criterionConfig={config} onChange={setConfig} />
}

describe('CriterionPanelSuccessRatio (Technical Plan Στάδιο 4)', () => {
  it('onChange αντικαθιστά ολόκληρο το criterionConfig μετά από κάθε αλλαγή', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<CriterionPanelSuccessRatio criterionConfig={{ targetSuccesses: null, targetAttempts: null }} onChange={onChange} />)

    await user.type(screen.getByLabelText('Επιτυχίες'), '4')
    expect(onChange).toHaveBeenLastCalledWith({ targetSuccesses: 4, targetAttempts: null })
  })

  it('inline μήνυμα ΚΑΘΩΣ πληκτρολογεί όταν targetSuccesses > targetAttempts — ΔΕΝ εμποδίζει την πληκτρολόγηση', async () => {
    render(<CriterionPanelSuccessRatio criterionConfig={{ targetSuccesses: 9, targetAttempts: 5 }} onChange={() => {}} />)
    expect(screen.getByRole('alert')).toHaveTextContent('δεν μπορεί να είναι μεγαλύτερος')
    expect(screen.getByLabelText('Επιτυχίες')).toHaveValue(9)
  })

  it('έγκυρη τιμή → καμία inline προειδοποίηση, εμφανίζεται προεπισκόπηση κειμένου', () => {
    render(<CriterionPanelSuccessRatio criterionConfig={{ targetSuccesses: 4, targetAttempts: 5 }} onChange={() => {}} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText(/4 από 5 προσπάθειες/)).toBeInTheDocument()
  })

  it('σφάλμα από validateCriterionConfig (submit-level) εμφανίζεται όταν δεν υπάρχει inline σφάλμα', () => {
    render(<CriterionPanelSuccessRatio criterionConfig={{ targetSuccesses: null, targetAttempts: null }} onChange={() => {}} error="Χρειάζεται αριθμό επιτυχιών." />)
    expect(screen.getByRole('alert')).toHaveTextContent('Χρειάζεται αριθμό επιτυχιών.')
  })
})

describe('CriterionPanelPromptLevel (Technical Plan Στάδιο 4)', () => {
  it('radiogroup με τα 3 επίπεδα, καμία προεπιλογή όταν criterionConfig κενό', () => {
    render(<CriterionPanelPromptLevel criterionConfig={{ targetLevel: null }} onChange={() => {}} />)
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(3)
    expect(radios.some((r) => r.checked)).toBe(false)
  })

  it('επιλογή βαθμίδας καλεί onChange με { targetLevel }', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<CriterionPanelPromptLevel criterionConfig={{ targetLevel: null }} onChange={onChange} />)

    await user.click(screen.getByText('Ανεξάρτητα'))
    expect(onChange).toHaveBeenCalledWith({ targetLevel: 'independent' })
  })

  it('δείχνει την ήδη επιλεγμένη βαθμίδα ως checked', () => {
    render(<CriterionPanelPromptLevel criterionConfig={{ targetLevel: 'verbal' }} onChange={() => {}} />)
    expect(screen.getByText('Λεκτική υπόδειξη').closest('label').querySelector('input').checked).toBe(true)
  })
})

describe('CriterionPanelNarrative (Technical Plan Στάδιο 4)', () => {
  it('η ετικέτα εκφράζει κριτήριο ολοκλήρωσης, ΟΧΙ τεχνικό όνομα πεδίου', () => {
    render(<CriterionPanelNarrative criterionConfig={{ successDescription: '' }} onChange={() => {}} />)
    expect(screen.getByText('Πότε θεωρείται ότι ο στόχος έχει επιτευχθεί;')).toBeInTheDocument()
    expect(screen.queryByText(/successDescription/)).not.toBeInTheDocument()
  })

  it('onChange καλείται με { successDescription }', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<CriterionPanelNarrative criterionConfig={{ successDescription: '' }} onChange={onChange} />)

    await user.type(screen.getByLabelText(/Πότε θεωρείται/, { exact: false }), 'Χ')
    expect(onChange).toHaveBeenLastCalledWith({ successDescription: 'Χ' })
  })
})

describe('CriterionPanelDuration / CriterionPanelFrequency (Technical Plan Στάδιο 5, κοινό CriterionPanelDirectional)', () => {
  it('καμία προεπιλεγμένη κατεύθυνση όταν criterionConfig κενό', () => {
    render(<CriterionPanelDuration criterionConfig={{ direction: null, targetMinutes: null, context: '' }} onChange={() => {}} />)
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(2)
    expect(radios.some((r) => r.checked)).toBe(false)
  })

  it('wording: «Πώς θέλεις να αλλάξει;» / «Να αυξηθεί» / «Να μειωθεί»', () => {
    render(<CriterionPanelFrequency criterionConfig={{ direction: null, targetCount: null, context: '' }} onChange={() => {}} />)
    expect(screen.getByText('Πώς θέλεις να αλλάξει;')).toBeInTheDocument()
    expect(screen.getByText('Να αυξηθεί')).toBeInTheDocument()
    expect(screen.getByText('Να μειωθεί')).toBeInTheDocument()
  })

  it('επιλογή κατεύθυνσης καλεί onChange διατηρώντας τα υπόλοιπα πεδία', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<CriterionPanelDuration criterionConfig={{ direction: null, targetMinutes: 15, context: 'ανά συνεδρία' }} onChange={onChange} />)

    await user.click(screen.getByText('Να αυξηθεί'))
    expect(onChange).toHaveBeenLastCalledWith({ direction: 'increase', targetMinutes: 15, context: 'ανά συνεδρία' })
  })

  it('ζωντανή προεπισκόπηση: φυσικό κείμενο ΜΕ context, χωρίς context, ΚΑΙ για τις δύο κατευθύνσεις', () => {
    const { rerender } = render(<CriterionPanelDuration criterionConfig={{ direction: 'increase', targetMinutes: 15, context: 'ανά δραστηριότητα' }} onChange={() => {}} />)
    expect(screen.getByText('Κριτήριο: «Αύξηση σε τουλάχιστον 15′ ανά δραστηριότητα»')).toBeInTheDocument()

    rerender(<CriterionPanelDuration criterionConfig={{ direction: 'decrease', targetMinutes: 5, context: '' }} onChange={() => {}} />)
    expect(screen.getByText('Κριτήριο: «Μείωση σε το πολύ 5′»')).toBeInTheDocument()
  })

  it('προεπισκόπηση ΔΕΝ εμφανίζεται όταν ο συνδυασμός δεν θα περνούσε το validateCriterionConfig (π.χ. αύξηση σε 0)', () => {
    render(<CriterionPanelFrequency criterionConfig={{ direction: 'increase', targetCount: 0, context: '' }} onChange={() => {}} />)
    expect(screen.queryByText(/Κριτήριο:/)).not.toBeInTheDocument()
  })

  it('submit-level σφάλμα (από validateCriterionConfig) εμφανίζεται ως alert', () => {
    render(<CriterionPanelFrequency criterionConfig={{ direction: null, targetCount: null, context: '' }} onChange={() => {}} error="Η «Συχνότητα» χρειάζεται ρητή κατεύθυνση: αύξηση ή μείωση." />)
    expect(screen.getByRole('alert')).toHaveTextContent('χρειάζεται ρητή κατεύθυνση')
  })
})

// Αναθεωρήθηκε μετά το browser smoke test του Σταδίου 6 (Product Design §7 Β2) — ΔΥΟ ξεχωριστές
// ενότητες αντί για ένα ενσωματωμένο radio ανά γραμμή περιγραφής: (1) 5 γραμμές περιγραφής, καμία
// επιλογή· (2) ξεχωριστό radiogroup «Πότε θεωρείται ότι ολοκληρώνεται ο στόχος;» από κάτω.
describe('CriterionPanelRatingScale (Technical Plan Στάδιο 6, αναθεωρημένο)', () => {
  const emptyConfig = { targetLevel: null, levelDescriptions: { 1: '', 2: '', 3: '', 4: '', 5: '' } }

  function placeholderFor(level) {
    return `Τι σημαίνει η βαθμίδα ${level} για αυτόν τον στόχο;`
  }

  it('εμφανίζει 5 πεδία περιγραφής + 5 radio για τη βαθμίδα-στόχο, καμία προεπιλογή', () => {
    render(<CriterionPanelRatingScale criterionConfig={emptyConfig} onChange={() => {}} />)
    for (let level = 1; level <= 5; level++) {
      expect(screen.getByPlaceholderText(placeholderFor(level))).toBeInTheDocument()
    }
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(5)
    expect(radios.some((r) => r.checked)).toBe(false)
  })

  it('η ενότητα περιγραφών ΔΕΝ περιέχει κανένα radio (ξεχωριστό βήμα από την επιλογή στόχου)', () => {
    render(<CriterionPanelRatingScale criterionConfig={emptyConfig} onChange={() => {}} />)
    const rowsContainer = document.querySelector('.criterion-panel-rating-scale__rows')
    expect(rowsContainer.querySelectorAll('input[type="radio"]')).toHaveLength(0)
  })

  it('ξεχωριστή ενότητα «Πότε θεωρείται ότι ολοκληρώνεται ο στόχος;» διευκρινίζει το κριτήριο ολοκλήρωσης, όχι την τρέχουσα επίδοση', () => {
    render(<CriterionPanelRatingScale criterionConfig={emptyConfig} onChange={() => {}} />)
    expect(screen.getByText('Πότε θεωρείται ότι ολοκληρώνεται ο στόχος;')).toBeInTheDocument()
  })

  it('δηλώνει οπτικά ότι 1=χαμηλότερη, 5=υψηλότερη — σταθερή φορά κλίμακας', () => {
    render(<CriterionPanelRatingScale criterionConfig={emptyConfig} onChange={() => {}} />)
    expect(screen.getByText(/Βαθμίδα 1 \(χαμηλότερη\)/)).toBeInTheDocument()
    expect(screen.getByText(/Βαθμίδα 5 \(υψηλότερη\)/)).toBeInTheDocument()
  })

  it('ουδέτερα placeholders — ΟΧΙ domain-specific παράδειγμα συμμετοχής (διόρθωση χρήστη)', () => {
    render(<CriterionPanelRatingScale criterionConfig={emptyConfig} onChange={() => {}} />)
    expect(screen.getByPlaceholderText(placeholderFor(1))).toBeInTheDocument()
    expect(screen.queryByText(/Δεν συμμετέχει/)).not.toBeInTheDocument()
  })

  it('επιλογή βαθμίδας-στόχου (ξεχωριστή ενότητα) καλεί onChange διατηρώντας τις περιγραφές', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const config = { targetLevel: null, levelDescriptions: { 1: 'Α', 2: 'Β', 3: 'Γ', 4: 'Δ', 5: 'Ε' } }
    render(<CriterionPanelRatingScale criterionConfig={config} onChange={onChange} />)

    await user.click(screen.getByRole('radio', { name: 'Βαθμίδα 4' }))
    expect(onChange).toHaveBeenLastCalledWith({ targetLevel: 4, levelDescriptions: { 1: 'Α', 2: 'Β', 3: 'Γ', 4: 'Δ', 5: 'Ε' } })
  })

  it('πληκτρολόγηση περιγραφής καλεί onChange διατηρώντας τη βαθμίδα-στόχο και τις άλλες περιγραφές', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const config = { targetLevel: 3, levelDescriptions: { 1: '', 2: '', 3: '', 4: '', 5: '' } }
    render(<CriterionPanelRatingScale criterionConfig={config} onChange={onChange} />)

    await user.type(screen.getByPlaceholderText(placeholderFor(2)), 'Χ')
    expect(onChange).toHaveBeenLastCalledWith({ targetLevel: 3, levelDescriptions: { 1: '', 2: 'Χ', 3: '', 4: '', 5: '' } })
  })

  it('a11y: πληκτρολόγηση σε πεδίο περιγραφής ΔΕΝ αλλάζει τη βαθμίδα-στόχο (ξεχωριστές ενότητες, όχι ενσωματωμένο radio)', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const config = { targetLevel: 3, levelDescriptions: { 1: '', 2: '', 3: '', 4: '', 5: '' } }
    render(<CriterionPanelRatingScale criterionConfig={config} onChange={onChange} />)

    await user.type(screen.getByPlaceholderText(placeholderFor(1)), 'Νέα περιγραφή')

    for (const call of onChange.mock.calls) {
      expect(call[0].targetLevel).toBe(3) // ΠΟΤΕ δεν άλλαξε σε 1 — μόνο η περιγραφή ενημερώθηκε
    }
  })

  it('προεπισκόπηση ΜΟΝΟ όταν όλες οι 5 περιγραφές είναι συμπληρωμένες ΚΑΙ υπάρχει βαθμίδα-στόχος', () => {
    const incomplete = { targetLevel: 3, levelDescriptions: { 1: 'Α', 2: 'Β', 3: 'Γ', 4: 'Δ', 5: '' } }
    const { rerender } = render(<CriterionPanelRatingScale criterionConfig={incomplete} onChange={() => {}} />)
    expect(screen.queryByText(/Κριτήριο:/)).not.toBeInTheDocument()

    const complete = { targetLevel: 3, levelDescriptions: { 1: 'Α', 2: 'Β', 3: 'Γ', 4: 'Δ', 5: 'Ε' } }
    rerender(<CriterionPanelRatingScale criterionConfig={complete} onChange={() => {}} />)
    expect(screen.getByText('Κριτήριο: «Επίπεδο 3 — «Γ»»')).toBeInTheDocument()
  })

  it('submit-level σφάλμα εμφανίζεται ως alert, ονομάζει τη συγκεκριμένη βαθμίδα', () => {
    render(
      <CriterionPanelRatingScale
        criterionConfig={emptyConfig}
        onChange={() => {}}
        error="Χρειάζεται περιγραφή για τη βαθμίδα 2 (και οι 5 περιγραφές είναι υποχρεωτικές)."
      />
    )
    expect(screen.getByRole('alert')).toHaveTextContent('βαθμίδα 2')
  })
})

describe('CriterionPanelTaskAnalysis / CriterionPanelChecklist (Technical Plan Στάδιο 7, κοινό CriterionPanelListBased)', () => {
  const emptyTaskAnalysis = { steps: [], targetCompletedCount: null }
  const emptyChecklist = { items: [], targetCompletedCount: null }

  it('Βήματα εργασίας: helper text δηλώνει ότι η σειρά έχει σημασία, ΚΑΙ έχει κουμπιά αναδιάταξης', async () => {
    const user = userEvent.setup()
    render(<Controlled Panel={CriterionPanelTaskAnalysis} initial={emptyTaskAnalysis} />)
    expect(screen.getByText('Η σειρά των βημάτων έχει σημασία.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Προσθήκη βήματος' }))
    await user.click(screen.getByRole('button', { name: 'Προσθήκη βήματος' }))
    expect(screen.getByRole('button', { name: 'Μετακίνηση βήματος 2 προς τα πάνω' })).toBeInTheDocument()
  })

  it('Checklist: helper text δηλώνει ότι η σειρά ΔΕΝ έχει σημασία, ΚΑΙ ΔΕΝ έχει κουμπιά αναδιάταξης', async () => {
    const user = userEvent.setup()
    render(<Controlled Panel={CriterionPanelChecklist} initial={emptyChecklist} />)
    expect(screen.getByText('Τα στοιχεία μπορούν να ολοκληρώνονται με οποιαδήποτε σειρά.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Προσθήκη στοιχείου' }))
    await user.click(screen.getByRole('button', { name: 'Προσθήκη στοιχείου' }))
    expect(screen.queryByRole('button', { name: /Μετακίνηση/ })).not.toBeInTheDocument()
  })

  it('auto mode: το targetCompletedCount ακολουθεί το μήκος της λίστας μέχρι ρητή επεξεργασία (διόρθωση χρήστη #1)', async () => {
    const user = userEvent.setup()
    render(<Controlled Panel={CriterionPanelTaskAnalysis} initial={emptyTaskAnalysis} />)

    await user.click(screen.getByRole('button', { name: 'Προσθήκη βήματος' }))
    expect(screen.getByLabelText('Στόχος ολοκληρωμένων βημάτων')).toHaveValue(1)

    await user.click(screen.getByRole('button', { name: 'Προσθήκη βήματος' }))
    expect(screen.getByLabelText('Στόχος ολοκληρωμένων βημάτων')).toHaveValue(2)
  })

  it('manual mode: ρητή επεξεργασία «παγώνει» την τιμή — επόμενη προσθήκη ΔΕΝ την αυξάνει πια', async () => {
    const user = userEvent.setup()
    render(<Controlled Panel={CriterionPanelTaskAnalysis} initial={emptyTaskAnalysis} />)

    await user.click(screen.getByRole('button', { name: 'Προσθήκη βήματος' }))
    await user.click(screen.getByRole('button', { name: 'Προσθήκη βήματος' }))
    // αυτόματα 2 τώρα· ο εκπαιδευτικός το αλλάζει ρητά σε 1.
    const targetInput = screen.getByLabelText('Στόχος ολοκληρωμένων βημάτων')
    await user.clear(targetInput)
    await user.type(targetInput, '1')
    expect(screen.getByLabelText('Στόχος ολοκληρωμένων βημάτων')).toHaveValue(1)

    await user.click(screen.getByRole('button', { name: 'Προσθήκη βήματος' }))
    // 3 βήματα τώρα, αλλά η ρητή επιλογή «1» ΔΕΝ αλλάζει.
    expect(screen.getByLabelText('Στόχος ολοκληρωμένων βημάτων')).toHaveValue(1)
  })

  it('αφαίρεση στοιχείων κάνει ΠΑΝΤΑ clamp προς τα κάτω αν η τιμή υπερβαίνει το νέο μήκος, ακόμα και σε manual mode', async () => {
    const user = userEvent.setup()
    // Ξεκινά ήδη manual (edit mode προσομοίωση, targetCompletedCount ήδη μη-null στο mount).
    const initial = { steps: [{ id: 'a', label: 'Α' }, { id: 'b', label: 'Β' }, { id: 'c', label: 'Γ' }], targetCompletedCount: 3 }
    render(<Controlled Panel={CriterionPanelTaskAnalysis} initial={initial} />)

    await user.click(screen.getByRole('button', { name: 'Αφαίρεση βήματος 3' }))
    expect(screen.getByLabelText('Στόχος ολοκληρωμένων βημάτων')).toHaveValue(2)
  })

  it('edit mode (criterionConfig ήδη έχει τιμή στο mount) ξεκινά manual — προσθήκη ΔΕΝ αλλάζει την ήδη αποθηκευμένη τιμή', async () => {
    const user = userEvent.setup()
    const initial = { steps: [{ id: 'a', label: 'Α' }, { id: 'b', label: 'Β' }], targetCompletedCount: 2 }
    render(<Controlled Panel={CriterionPanelTaskAnalysis} initial={initial} />)

    await user.click(screen.getByRole('button', { name: 'Προσθήκη βήματος' }))
    // 3 βήματα τώρα, αλλά η ΗΔΗ αποθηκευμένη τιμή 2 δεν αλλάζει σιωπηλά.
    expect(screen.getByLabelText('Στόχος ολοκληρωμένων βημάτων')).toHaveValue(2)
  })

  it('προεπισκόπηση εμφανίζεται μόνο όταν το config είναι πλήρες και έγκυρο', async () => {
    const user = userEvent.setup()
    render(<Controlled Panel={CriterionPanelChecklist} initial={emptyChecklist} />)
    expect(screen.queryByText(/Κριτήριο:/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Προσθήκη στοιχείου' }))
    await user.type(screen.getByLabelText('Στοιχείο 1'), 'Πλένει τα χέρια')
    expect(screen.getByText('Κριτήριο: «1 από 1 στοιχεία»')).toBeInTheDocument()
  })

  it('submit-level σφάλμα εμφανίζεται ως alert', () => {
    render(<CriterionPanelTaskAnalysis criterionConfig={emptyTaskAnalysis} onChange={() => {}} error="Τα «Βήματα εργασίας» χρειάζονται τουλάχιστον ένα βήμα." />)
    expect(screen.getByRole('alert')).toHaveTextContent('τουλάχιστον ένα βήμα')
  })
})
