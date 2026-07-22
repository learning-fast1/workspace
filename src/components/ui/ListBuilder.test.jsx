import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ListBuilder from './ListBuilder.jsx'

afterEach(() => cleanup())

const props = {
  addButtonLabel: 'Προσθήκη βήματος',
  itemLabelSingular: 'Βήμα',
  itemLabelGenitive: 'βήματος'
}

describe('ListBuilder (Technical Plan Στάδιο 7) — γενικό, καμία γνώση criterionConfig', () => {
  it('εμφανίζει τα στοιχεία με σωστά aria-labels ανά γραμμή', () => {
    const items = [{ id: 'a', label: 'Πρώτο' }, { id: 'b', label: 'Δεύτερο' }]
    render(<ListBuilder items={items} onChange={() => {}} reorderable {...props} />)

    expect(screen.getByLabelText('Βήμα 1')).toHaveValue('Πρώτο')
    expect(screen.getByLabelText('Βήμα 2')).toHaveValue('Δεύτερο')
  })

  it('«+ Προσθήκη» προσθέτει κενή γραμμή ΣΤΟ ΤΕΛΟΣ και της δίνει focus αυτόματα', async () => {
    const user = userEvent.setup()
    const items = [{ id: 'a', label: 'Πρώτο' }]
    let currentItems = items
    const onChange = vi.fn((next) => { currentItems = next })
    const { rerender } = render(<ListBuilder items={currentItems} onChange={onChange} reorderable {...props} />)

    await user.click(screen.getByRole('button', { name: props.addButtonLabel }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(currentItems).toHaveLength(2)
    expect(currentItems[1].label).toBe('')

    rerender(<ListBuilder items={currentItems} onChange={onChange} reorderable {...props} />)
    expect(screen.getByLabelText('Βήμα 2')).toHaveFocus()
  })

  it('πληκτρολόγηση σε γραμμή καλεί onChange με ενημερωμένο label, διατηρώντας τα υπόλοιπα', async () => {
    const user = userEvent.setup()
    const items = [{ id: 'a', label: '' }, { id: 'b', label: 'Άθικτο' }]
    const onChange = vi.fn()
    render(<ListBuilder items={items} onChange={onChange} reorderable {...props} />)

    await user.type(screen.getByLabelText('Βήμα 1'), 'Χ')
    expect(onChange).toHaveBeenLastCalledWith([{ id: 'a', label: 'Χ' }, { id: 'b', label: 'Άθικτο' }])
  })

  it('αφαίρεση γραμμής μέσω του σωστού κουμπιού (aria-label ονομάζει τη γραμμή)', async () => {
    const user = userEvent.setup()
    const items = [{ id: 'a', label: 'Πρώτο' }, { id: 'b', label: 'Δεύτερο' }]
    const onChange = vi.fn()
    render(<ListBuilder items={items} onChange={onChange} reorderable {...props} />)

    await user.click(screen.getByRole('button', { name: 'Αφαίρεση βήματος 2' }))
    expect(onChange).toHaveBeenCalledWith([{ id: 'a', label: 'Πρώτο' }])
  })

  it('reorderable=true: ▲/▼ πάντα ορατά, disabled στα άκρα, aria-labels ονομάζουν τη γραμμή (μεταξύ mouse ΚΑΙ πληκτρολογίου)', async () => {
    const user = userEvent.setup()
    const items = [{ id: 'a', label: 'Α' }, { id: 'b', label: 'Β' }, { id: 'c', label: 'Γ' }]
    const onChange = vi.fn()
    render(<ListBuilder items={items} onChange={onChange} reorderable {...props} />)

    expect(screen.getByRole('button', { name: 'Μετακίνηση βήματος 1 προς τα πάνω' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Μετακίνηση βήματος 3 προς τα κάτω' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Μετακίνηση βήματος 2 προς τα πάνω' })).not.toBeDisabled()

    // mouse
    await user.click(screen.getByRole('button', { name: 'Μετακίνηση βήματος 2 προς τα πάνω' }))
    expect(onChange).toHaveBeenLastCalledWith([{ id: 'b', label: 'Β' }, { id: 'a', label: 'Α' }, { id: 'c', label: 'Γ' }])

    // πληκτρολόγιο
    const downBtn = screen.getByRole('button', { name: 'Μετακίνηση βήματος 2 προς τα κάτω' })
    downBtn.focus()
    await user.keyboard('{Enter}')
    expect(onChange).toHaveBeenLastCalledWith([{ id: 'a', label: 'Α' }, { id: 'c', label: 'Γ' }, { id: 'b', label: 'Β' }])
  })

  it('reorderable=false: καμία γραμμή δεν έχει κουμπιά ▲/▼', () => {
    const items = [{ id: 'a', label: 'Α' }, { id: 'b', label: 'Β' }]
    render(<ListBuilder items={items} onChange={() => {}} reorderable={false} addButtonLabel="Προσθήκη στοιχείου" itemLabelSingular="Στοιχείο" itemLabelGenitive="στοιχείου" />)

    expect(screen.queryByRole('button', { name: /Μετακίνηση/ })).not.toBeInTheDocument()
  })

  it('εμφανίζει σφάλμα όταν περαστεί', () => {
    render(<ListBuilder items={[]} onChange={() => {}} reorderable {...props} error="Χρειάζεται τουλάχιστον ένα βήμα." />)
    expect(screen.getByRole('alert')).toHaveTextContent('Χρειάζεται τουλάχιστον ένα βήμα.')
  })
})
