import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChipListEditor from './ChipListEditor.jsx'

afterEach(() => cleanup())

// Mobile review (product polish): πλήρης μετάβαση από το παλιό, pre-redesign CSS (index.css) σε
// δικές του κλάσεις πάνω στο νέο design system — αυτά τα tests καλύπτουν τη ΣΥΜΠΕΡΙΦΟΡΑ (καμία
// υπήρχε πριν, καθαρά presentational component χωρίς δικά του tests) ΚΑΙ τη βασική δομή κλάσεων
// που χρησιμοποιούν πλέον GoalWizardForm.css/ChipListEditor.css/PreferencesEditor δεν χρειάζεται.
describe('ChipListEditor — απλά chips (χωρίς onApply, π.χ. Ενισχυτές)', () => {
  it('εμφανίζει τα items, χωρίς κουμπί apply (μόνο κείμενο + αφαίρεση)', () => {
    render(<ChipListEditor items={['Μουσική', 'Παιχνίδια με νερό']} onAdd={vi.fn()} onRemove={vi.fn()} />)

    expect(screen.getByText('Μουσική')).toBeInTheDocument()
    expect(screen.getByText('Παιχνίδια με νερό')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Μουσική' })).not.toBeInTheDocument()
    expect(document.querySelector('.chip-list-editor__chip--suggestion')).not.toBeInTheDocument()
  })

  it('«Προσθήκη» καλεί onAdd με το κείμενο και καθαρίζει το πεδίο', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    render(<ChipListEditor items={[]} onAdd={onAdd} onRemove={vi.fn()} placeholder="Προσθήκη νέου…" />)

    const input = screen.getByPlaceholderText('Προσθήκη νέου…')
    await user.type(input, 'Μουσική')
    await user.click(screen.getByRole('button', { name: 'Προσθήκη' }))

    expect(onAdd).toHaveBeenCalledWith('Μουσική')
    expect(input).toHaveValue('')
  })

  it('Enter στο πεδίο προσθέτει, ΧΩΡΙΣ να χρειάζεται κλικ στο κουμπί', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    render(<ChipListEditor items={[]} onAdd={onAdd} onRemove={vi.fn()} />)

    await user.type(screen.getByRole('textbox'), 'Κάτι νέο{Enter}')

    expect(onAdd).toHaveBeenCalledWith('Κάτι νέο')
  })

  it('κενό/μόνο κενά κείμενο ΔΕΝ καλεί onAdd', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    render(<ChipListEditor items={[]} onAdd={onAdd} onRemove={vi.fn()} />)

    await user.type(screen.getByRole('textbox'), '   ')
    await user.click(screen.getByRole('button', { name: 'Προσθήκη' }))

    expect(onAdd).not.toHaveBeenCalled()
  })

  it('αφαίρεση καλεί onRemove με το σωστό index', async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn()
    render(<ChipListEditor items={['Α', 'Β']} onAdd={vi.fn()} onRemove={onRemove} />)

    await user.click(screen.getByRole('button', { name: 'Αφαίρεση Β' }))

    expect(onRemove).toHaveBeenCalledWith(1)
  })
})

// onApply παρόν (TemplateSuggestions, Goal Wizard) → εμφάνιση «suggestion» (card-στυλ, βλ. product
// feedback σημείο 7: «λιγότερο σαν μεγάλα text blocks, περισσότερο σαν επιλογές»).
describe('ChipListEditor — προτάσεις (με onApply, π.χ. TemplateSuggestions)', () => {
  it('κάθε item είναι clickable κουμπί (name = το ίδιο το κείμενο) ΚΑΙ φέρει την κλάση --suggestion', () => {
    render(<ChipListEditor items={['Ο μαθητής θα βελτιώσει...']} onAdd={vi.fn()} onRemove={vi.fn()} onApply={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Ο μαθητής θα βελτιώσει...' })).toBeInTheDocument()
    expect(document.querySelector('.chip-list-editor__chip--suggestion')).toBeInTheDocument()
  })

  it('κλικ σε πρόταση καλεί onApply με το πλήρες κείμενο', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    render(<ChipListEditor items={['Πρόταση Α']} onAdd={vi.fn()} onRemove={vi.fn()} onApply={onApply} />)

    await user.click(screen.getByRole('button', { name: 'Πρόταση Α' }))

    expect(onApply).toHaveBeenCalledWith('Πρόταση Α')
  })

  it('η αφαίρεση παραμένει ξεχωριστή ενέργεια από το apply (δικό της κουμπί)', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    const onRemove = vi.fn()
    render(<ChipListEditor items={['Πρόταση Α']} onAdd={vi.fn()} onRemove={onRemove} onApply={onApply} />)

    await user.click(screen.getByRole('button', { name: 'Αφαίρεση Πρόταση Α' }))

    expect(onRemove).toHaveBeenCalledWith(0)
    expect(onApply).not.toHaveBeenCalled()
  })
})
