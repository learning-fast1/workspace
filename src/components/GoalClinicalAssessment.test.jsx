import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GoalClinicalAssessment from './GoalClinicalAssessment.jsx'

afterEach(() => cleanup())

// Ίδιο Controlled wrapper idiom με το GoalRecorder.test.jsx.
function Controlled({ goalTitle = 'Στόχος Α', initial = null }) {
  const [value, setValue] = useState(initial)
  return <GoalClinicalAssessment goalTitle={goalTitle} value={value} onChange={setValue} />
}

describe('GoalClinicalAssessment — 4 βαθμίδες + προαιρετική σημείωση', () => {
  it('καμία βαθμίδα επιλεγμένη αρχικά — το note field ΔΕΝ εμφανίζεται', () => {
    render(<Controlled />)
    expect(screen.queryByPlaceholderText('Σύντομη παρατήρηση (προαιρετικό)')).not.toBeInTheDocument()
  })

  it('επιλογή "Βελτιώθηκε" εμφανίζει το note field· κλικ ξανά στο ίδιο chip το αποεπιλέγει', async () => {
    const user = userEvent.setup()
    render(<Controlled />)

    await user.click(screen.getByRole('button', { name: 'Βελτιώθηκε' }))
    expect(screen.getByPlaceholderText('Σύντομη παρατήρηση (προαιρετικό)')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Βελτιώθηκε' }))
    expect(screen.queryByPlaceholderText('Σύντομη παρατήρηση (προαιρετικό)')).not.toBeInTheDocument()
  })

  it('πληκτρολόγηση στο note field ενημερώνει τη σημείωση χωρίς να αλλάζει τη βαθμίδα', async () => {
    const user = userEvent.setup()
    render(<Controlled />)

    await user.click(screen.getByRole('button', { name: 'Χειροτέρεψε' }))
    await user.type(screen.getByPlaceholderText('Σύντομη παρατήρηση (προαιρετικό)'), 'Δύσκολη μέρα')

    expect(screen.getByPlaceholderText('Σύντομη παρατήρηση (προαιρετικό)')).toHaveValue('Δύσκολη μέρα')
    expect(screen.getByRole('button', { name: 'Χειροτέρεψε' })).toHaveClass('btn--primary')
  })

  it('«Κατακτήθηκε»: ανοίγει επιβεβαίωση, ΔΕΝ επιλέγεται πριν την επιβεβαίωση', async () => {
    const user = userEvent.setup()
    render(<Controlled goalTitle="Ανάγνωση προτάσεων" />)

    await user.click(screen.getByRole('button', { name: 'Κατακτήθηκε' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/Ανάγνωση προτάσεων/)).toBeInTheDocument()
    expect(screen.getByText(/δεν θα εμφανίζεται πλέον στους ενεργούς στόχους/)).toBeInTheDocument()
    // Πριν την επιβεβαίωση, το note field (που εμφανίζεται μόνο με επιλεγμένη βαθμίδα) δεν υπάρχει ακόμα.
    expect(screen.queryByPlaceholderText('Σύντομη παρατήρηση (προαιρετικό)')).not.toBeInTheDocument()
  })

  it('«Κατακτήθηκε» + Άκυρο στο dialog → καμία αλλαγή, chip παραμένει μη επιλεγμένο', async () => {
    const user = userEvent.setup()
    render(<Controlled />)

    await user.click(screen.getByRole('button', { name: 'Κατακτήθηκε' }))
    await user.click(screen.getByRole('button', { name: 'Άκυρο' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Κατακτήθηκε' })).not.toHaveClass('btn--primary')
    expect(screen.queryByPlaceholderText('Σύντομη παρατήρηση (προαιρετικό)')).not.toBeInTheDocument()
  })

  it('«Κατακτήθηκε» + Επιβεβαίωση → επιλέγεται, εμφανίζεται το note field', async () => {
    const user = userEvent.setup()
    render(<Controlled />)

    await user.click(screen.getByRole('button', { name: 'Κατακτήθηκε' }))
    await user.click(screen.getByRole('button', { name: 'Επιβεβαίωση' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Κατακτήθηκε' })).toHaveClass('btn--primary')
    expect(screen.getByPlaceholderText('Σύντομη παρατήρηση (προαιρετικό)')).toBeInTheDocument()
  })

  it('εναλλαγή από "Σταθερός" σε "Βελτιώθηκε" διατηρεί τη σημείωση', async () => {
    const user = userEvent.setup()
    render(<Controlled />)

    await user.click(screen.getByRole('button', { name: 'Σταθερός' }))
    await user.type(screen.getByPlaceholderText('Σύντομη παρατήρηση (προαιρετικό)'), 'Ίδια απόδοση')
    await user.click(screen.getByRole('button', { name: 'Βελτιώθηκε' }))

    expect(screen.getByPlaceholderText('Σύντομη παρατήρηση (προαιρετικό)')).toHaveValue('Ίδια απόδοση')
    expect(screen.getByRole('button', { name: 'Σταθερός' })).not.toHaveClass('btn--primary')
    expect(screen.getByRole('button', { name: 'Βελτιώθηκε' })).toHaveClass('btn--primary')
  })
})
