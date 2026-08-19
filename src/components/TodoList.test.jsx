import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import db from '../db.js'
import TodoList from './TodoList.jsx'

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  cleanup()
  await Promise.all(db.tables.map((t) => t.clear()))
  db.close()
})

describe('TodoList — άδεια λίστα', () => {
  it('δείχνει empty state, καμία ένδειξη πλήθους', async () => {
    render(<TodoList />)
    await waitFor(() => expect(screen.getByText(/Καμία εργασία ακόμα/)).toBeInTheDocument())
    expect(screen.queryByText(/εκκρεμείς|Όλα ολοκληρωμένα/)).not.toBeInTheDocument()
  })
})

describe('TodoList — προσθήκη/ολοκλήρωση/διαγραφή', () => {
  it('προσθήκη νέας εργασίας μέσω του input εμφανίζεται στη λίστα, το πεδίο αδειάζει', async () => {
    const user = userEvent.setup()
    render(<TodoList />)

    const input = await screen.findByRole('textbox', { name: 'Νέα εργασία' })
    await user.type(input, 'Τηλέφωνο σε γονέα')
    await user.click(screen.getByRole('button', { name: 'Προσθήκη εργασίας' }))

    await waitFor(() => expect(screen.getByText('Τηλέφωνο σε γονέα')).toBeInTheDocument())
    expect(input).toHaveValue('')
    expect(screen.getByText('1 εκκρεμείς')).toBeInTheDocument()
  })

  it('κενό κείμενο (μόνο κενά) δεν προσθέτει τίποτα', async () => {
    const user = userEvent.setup()
    render(<TodoList />)

    const input = await screen.findByRole('textbox', { name: 'Νέα εργασία' })
    await user.type(input, '   ')
    const addButton = screen.getByRole('button', { name: 'Προσθήκη εργασίας' })
    expect(addButton).toBeDisabled()
  })

  it('check σε μια εργασία τη σημειώνει ολοκληρωμένη (διαγράμμιση), ενημερώνει το count', async () => {
    const user = userEvent.setup()
    await db.todos.add({ id: 1, text: 'Καθαρισμός υλικού', done: false, createdAt: '2026-01-01T00:00:00.000Z' })
    render(<TodoList />)

    const checkbox = await screen.findByRole('checkbox', { name: /Καθαρισμός υλικού/ })
    expect(checkbox).not.toBeChecked()

    await user.click(checkbox)

    await waitFor(() => expect(checkbox).toBeChecked())
    expect(screen.getByText('Καθαρισμός υλικού')).toHaveClass('todo-list__item-text--done')
    expect(screen.getByText('Όλα ολοκληρωμένα')).toBeInTheDocument()
  })

  it('διαγραφή αφαιρεί την εργασία από τη λίστα', async () => {
    const user = userEvent.setup()
    await db.todos.add({ id: 1, text: 'Παραγγελία υλικών', done: false, createdAt: '2026-01-01T00:00:00.000Z' })
    render(<TodoList />)

    await screen.findByText('Παραγγελία υλικών')
    await user.click(screen.getByRole('button', { name: /Διαγραφή εργασίας/ }))

    await waitFor(() => expect(screen.queryByText('Παραγγελία υλικών')).not.toBeInTheDocument())
    expect(screen.getByText(/Καμία εργασία ακόμα/)).toBeInTheDocument()
  })

  it('ολοκληρωμένες εργασίες ΔΕΝ μετακινούνται — παραμένουν στη χρονολογική τους θέση', async () => {
    await db.todos.bulkAdd([
      { id: 1, text: 'Πρώτη', done: false, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 2, text: 'Δεύτερη', done: false, createdAt: '2026-01-02T00:00:00.000Z' }
    ])
    const user = userEvent.setup()
    render(<TodoList />)

    const firstCheckbox = await screen.findByRole('checkbox', { name: /^Πρώτη/ })
    await user.click(firstCheckbox)
    await waitFor(() => expect(firstCheckbox).toBeChecked())

    const items = screen.getAllByRole('checkbox').map((cb) => cb.closest('li').textContent)
    expect(items[0]).toContain('Πρώτη')
    expect(items[1]).toContain('Δεύτερη')
  })
})
