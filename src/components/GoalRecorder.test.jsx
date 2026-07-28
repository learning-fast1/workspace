import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GoalRecorder from './GoalRecorder.jsx'

afterEach(() => cleanup())

// Το GoalRecorder είναι config-driven (καμία δική του πηγή αλήθειας) — ίδιο Controlled wrapper
// idiom με το CriterionPanels.test.jsx, ώστε τα tests να βλέπουν το αποτέλεσμα διαδοχικών onChange.
function Controlled({ goal, initial = undefined }) {
  const [value, setValue] = useState(initial)
  return <GoalRecorder goal={goal} value={value} onChange={setValue} />
}

function baseGoal(overrides = {}) {
  return { id: 1, measurementType: 'successRatio', criterion: '', ...overrides }
}

describe('GoalRecorder — successRatio/promptLevel/duration (αμετάβλητα, smoke test)', () => {
  it('successRatio: Επιτυχία αυξάνει και τα δύο, Δυσκολία μόνο τις προσπάθειες', async () => {
    const user = userEvent.setup()
    render(<Controlled goal={baseGoal({ measurementType: 'successRatio' })} />)
    await user.click(screen.getByRole('button', { name: 'Επιτυχία' }))
    await user.click(screen.getByRole('button', { name: 'Δυσκολία' }))
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
  })

  it('successRatio: «−1 Επιτυχία» μειώνει ΚΑΙ τα δύο μαζί (ακριβής αντιστροφή του +1) — bug fix', async () => {
    const user = userEvent.setup()
    render(<Controlled goal={baseGoal({ measurementType: 'successRatio' })} />)
    await user.click(screen.getByRole('button', { name: 'Επιτυχία' }))
    await user.click(screen.getByRole('button', { name: 'Επιτυχία' }))
    expect(screen.getByText('2 / 2')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Αναίρεση μίας επιτυχίας' }))
    expect(screen.getByText('1 / 1')).toBeInTheDocument()
  })

  it('successRatio: «−1 Δυσκολία» μειώνει ΜΟΝΟ τις προσπάθειες — bug fix', async () => {
    const user = userEvent.setup()
    render(<Controlled goal={baseGoal({ measurementType: 'successRatio' })} />)
    await user.click(screen.getByRole('button', { name: 'Επιτυχία' }))
    await user.click(screen.getByRole('button', { name: 'Δυσκολία' }))
    await user.click(screen.getByRole('button', { name: 'Δυσκολία' }))
    expect(screen.getByText('1 / 3')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Αναίρεση μίας δυσκολίας' }))
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
  })

  it('successRatio: τα κουμπιά «−1» είναι disabled στα φυσικά όρια (καμία αρνητική τιμή, καμία successes > attempts)', async () => {
    const user = userEvent.setup()
    render(<Controlled goal={baseGoal({ measurementType: 'successRatio' })} />)

    // Αρχικά 0/0 — τίποτα να αναιρεθεί ακόμα.
    expect(screen.getByRole('button', { name: 'Αναίρεση μίας επιτυχίας' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Αναίρεση μίας δυσκολίας' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Επιτυχία' }))
    // 1/1 — υπάρχει επιτυχία να αναιρεθεί, αλλά ΚΑΜΙΑ «δυσκολία» (attempts === successes).
    expect(screen.getByRole('button', { name: 'Αναίρεση μίας επιτυχίας' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Αναίρεση μίας δυσκολίας' })).toBeDisabled()
  })

  it('promptLevel: επιλογή επιπέδου δείχνει το σωστό label', async () => {
    const user = userEvent.setup()
    render(<Controlled goal={baseGoal({ measurementType: 'promptLevel' })} />)
    await user.click(screen.getByRole('button', { name: 'Λεκτική υπόδειξη' }))
    expect(document.querySelector('.goal-recorder__tally')).toHaveTextContent('Λεκτική υπόδειξη')
  })

  it('duration: +1/+5 λεπτά αθροίζονται', async () => {
    const user = userEvent.setup()
    render(<Controlled goal={baseGoal({ measurementType: 'duration' })} />)
    await user.click(screen.getByRole('button', { name: '1 λεπτό' }))
    await user.click(screen.getByRole('button', { name: '5 λεπτά' }))
    expect(screen.getByText('6 λεπτά')).toBeInTheDocument()
  })
})

describe('GoalRecorder — frequency (νέο, Στάδιο 8)', () => {
  it('+1 αυξάνει, −1 μειώνει, −1 disabled στο 0', async () => {
    const user = userEvent.setup()
    render(<Controlled goal={baseGoal({ measurementType: 'frequency' })} />)

    expect(screen.getByRole('button', { name: 'Αφαίρεση μίας φοράς' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Προσθήκη μίας φοράς' }))
    await user.click(screen.getByRole('button', { name: 'Προσθήκη μίας φοράς' }))
    expect(screen.getByText('2 φορές')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Αφαίρεση μίας φοράς' })).not.toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Αφαίρεση μίας φοράς' }))
    // Ελληνικός ενικός (bug report) — «1 φορά», ΟΧΙ «1 φορές».
    expect(screen.getByText('1 φορά')).toBeInTheDocument()
  })

  it('γενικό undo παραμένει χρήσιμο, αλλά το −1 λειτουργεί ανεξάρτητα (δεν είναι ο μοναδικός τρόπος διόρθωσης)', async () => {
    const user = userEvent.setup()
    render(<Controlled goal={baseGoal({ measurementType: 'frequency' })} />)
    await user.click(screen.getByRole('button', { name: 'Προσθήκη μίας φοράς' }))
    await user.click(screen.getByRole('button', { name: 'Προσθήκη μίας φοράς' }))
    await user.click(screen.getByRole('button', { name: 'Προσθήκη μίας φοράς' }))
    await user.click(screen.getByRole('button', { name: 'Αφαίρεση μίας φοράς' }))
    expect(screen.getByText('2 φορές')).toBeInTheDocument()
  })
})

describe('GoalRecorder — taskAnalysis (legacy vs δομημένο, Στάδιο 8)', () => {
  it('legacy (χωρίς criterionConfig): ΑΚΡΙΒΩΣ η ίδια stepper UI με σήμερα, καμία αλλαγή', async () => {
    const user = userEvent.setup()
    const goal = baseGoal({ measurementType: 'taskAnalysis' }) // χωρίς criterionConfig
    render(<Controlled goal={goal} />)

    expect(screen.getByRole('button', { name: 'Λιγότερο βήμα' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Ένα βήμα παραπάνω' }))
    expect(screen.getByText('1 βήματα')).toBeInTheDocument()
    // Καμία λίστα με ονομαστικά βήματα — δεν υπάρχει καθόλου σε legacy goals.
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('δομημένο: tap-λίστα με αριθμημένα βήματα, tally λαμβάνει υπόψη το targetCompletedCount', async () => {
    const user = userEvent.setup()
    const goal = baseGoal({
      measurementType: 'taskAnalysis',
      criterionConfig: {
        steps: [{ id: 's1', label: 'Ανοίγει τη βρύση' }, { id: 's2', label: 'Βάζει σαπούνι' }, { id: 's3', label: 'Τρίβει' }],
        targetCompletedCount: 2
      }
    })
    render(<Controlled goal={goal} />)

    expect(screen.getByText('1.')).toBeInTheDocument()
    expect(screen.getByText('3.')).toBeInTheDocument()
    expect(screen.getByText('0 από 3 βήματα (στόχος: 2)')).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: /Ανοίγει τη βρύση/ }))
    expect(screen.getByText('1 από 3 βήματα (στόχος: 2)')).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: /Βάζει σαπούνι/ }))
    expect(screen.getByText('2 από 3 βήματα — στόχος επιτεύχθηκε ✓')).toBeInTheDocument()
  })

  it('a11y/data: τα toggled ids αντιστοιχούν στο ΣΩΣΤΟ βήμα ανεξάρτητα από τη σειρά κλικ (ΠΟΤΕ index)', async () => {
    const user = userEvent.setup()
    let latestValue
    const goal = baseGoal({
      measurementType: 'taskAnalysis',
      criterionConfig: {
        steps: [{ id: 's1', label: 'Πρώτο' }, { id: 's2', label: 'Δεύτερο' }, { id: 's3', label: 'Τρίτο' }],
        targetCompletedCount: 3
      }
    })
    function Capture() {
      const [value, setValue] = useState(undefined)
      latestValue = value
      return <GoalRecorder goal={goal} value={value} onChange={(v) => { setValue(v); latestValue = v }} />
    }
    render(<Capture />)

    // Κλικ ΕΚΤΟΣ σειράς: τρίτο πρώτα, μετά πρώτο.
    await user.click(screen.getByRole('checkbox', { name: /Τρίτο/ }))
    await user.click(screen.getByRole('checkbox', { name: /Πρώτο/ }))

    expect(latestValue.completedStepIds).toEqual(['s3', 's1'])
  })
})

describe('GoalRecorder — checklist (νέο, Στάδιο 8)', () => {
  const checklistGoal = baseGoal({
    measurementType: 'checklist',
    criterionConfig: {
      items: [{ id: 'i1', label: 'Κάθεται σωστά' }, { id: 'i2', label: 'Χρησιμοποιεί μαχαιροπίρουνο' }],
      targetCompletedCount: 2
    }
  })

  it('κάθε νέα συνεδρία ξεκινά ΧΩΡΙΣ κανένα προεπιλεγμένο checked στοιχείο', () => {
    render(<Controlled goal={checklistGoal} />)
    for (const checkbox of screen.getAllByRole('checkbox')) {
      expect(checkbox).not.toBeChecked()
    }
  })

  it('ΚΑΜΙΑ αρίθμηση (η σειρά δεν έχει σημασία στο Checklist)', () => {
    render(<Controlled goal={checklistGoal} />)
    expect(screen.queryByText('1.')).not.toBeInTheDocument()
  })

  it('toggle αποθηκεύει σταθερό item.id, tally λαμβάνει υπόψη το targetCompletedCount', async () => {
    const user = userEvent.setup()
    render(<Controlled goal={checklistGoal} />)

    await user.click(screen.getByRole('checkbox', { name: /Κάθεται σωστά/ }))
    expect(screen.getByText('1 από 2 στοιχεία (στόχος: 2)')).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: /Χρησιμοποιεί μαχαιροπίρουνο/ }))
    expect(screen.getByText('2 από 2 στοιχεία — στόχος επιτεύχθηκε ✓')).toBeInTheDocument()
  })
})

describe('GoalRecorder — ratingScale (νέο, Στάδιο 8)', () => {
  it('κάθετη λίστα 5 επιλογών με αριθμό+περιγραφή, επιλογή δείχνει το σωστό επίπεδο', async () => {
    const user = userEvent.setup()
    const goal = baseGoal({
      measurementType: 'ratingScale',
      criterionConfig: {
        targetLevel: 5,
        levelDescriptions: { 1: 'Καθόλου', 2: 'Λίγο', 3: 'Μέτρια', 4: 'Πολύ', 5: 'Ανεξάρτητα' }
      }
    })
    render(<Controlled goal={goal} />)

    expect(screen.getByRole('button', { name: '3 — Μέτρια' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '4 — Πολύ' }))
    expect(screen.getByText('Επίπεδο 4')).toBeInTheDocument()
  })
})

describe('GoalRecorder — narrative (νέο, Στάδιο 8)', () => {
  it('μόνο textarea, ΚΑΜΙΑ αριθμητική ένδειξη/tally/πρόοδος', () => {
    const goal = baseGoal({ measurementType: 'narrative', criterionConfig: { successDescription: 'Χ' } })
    render(<Controlled goal={goal} />)

    expect(screen.getByRole('textbox', { name: 'Παρατήρηση αυτής της συνεδρίας' })).toBeInTheDocument()
    expect(document.querySelector('.goal-recorder__tally')).not.toBeInTheDocument()
  })

  it('typing ενημερώνει το note', async () => {
    const user = userEvent.setup()
    const goal = baseGoal({ measurementType: 'narrative', criterionConfig: { successDescription: 'Χ' } })
    render(<Controlled goal={goal} />)

    await user.type(screen.getByRole('textbox', { name: 'Παρατήρηση αυτής της συνεδρίας' }), 'Συμμετείχε ενεργά')
    expect(screen.getByRole('textbox', { name: 'Παρατήρηση αυτής της συνεδρίας' })).toHaveValue('Συμμετείχε ενεργά')
  })
})
