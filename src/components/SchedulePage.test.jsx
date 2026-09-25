import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import db, { createScheduleSlot } from '../db.js'
import AuthProvider from '../auth/AuthProvider.jsx'
import SchedulePage from './SchedulePage.jsx'

// Characterization tests (review χρήστη, Weekly Grid stage, σημείο 9) — καμία δοκιμή δεν υπήρχε
// πριν για το SchedulePage/τη λίστα, γραμμένα ΠΡΙΝ προστεθεί το Weekly Grid ως δεύτερη όψη, ώστε
// να αποδεικνύουν ότι η υπάρχουσα συμπεριφορά μένει ΑΝΕΠΗΡΕΑΣΤΗ.

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  cleanup()
  await Promise.all(db.tables.map((t) => t.clear()))
  db.close()
})

function renderSchedulePage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <SchedulePage />
      </AuthProvider>
    </MemoryRouter>
  )
}

describe('SchedulePage — λίστα (χαρακτηρισμός υπάρχουσας συμπεριφοράς)', () => {
  it('εμφανίζει τις 5 ημέρες Δε–Πα', async () => {
    renderSchedulePage()
    await waitFor(() => expect(screen.getByText('Δευτέρα')).toBeInTheDocument())
    expect(screen.getByText('Τρίτη')).toBeInTheDocument()
    expect(screen.getByText('Τετάρτη')).toBeInTheDocument()
    expect(screen.getByText('Πέμπτη')).toBeInTheDocument()
    expect(screen.getByText('Παρασκευή')).toBeInTheDocument()
  })

  it('εμφανίζει σωστά ένα υπάρχον slot (μαθητής + ώρα)', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    await createScheduleSlot({ dayOfWeek: 1, startTime: '09:00', durationMinutes: 30, type: 'individual', studentIds: [studentId], label: '' })

    renderSchedulePage()

    await waitFor(() => expect(screen.getByText('Μ1')).toBeInTheDocument())
    expect(screen.getByText('09:00')).toBeInTheDocument()
  })

  it('«Επεξεργασία» ανοίγει το υπάρχον ScheduleSlotForm με τα σωστά δεδομένα', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    await createScheduleSlot({ dayOfWeek: 1, startTime: '09:00', durationMinutes: 30, type: 'individual', studentIds: [studentId], label: '' })

    const user = userEvent.setup()
    renderSchedulePage()

    await screen.findByText('Μ1')
    await user.click(screen.getByRole('button', { name: /Ενέργειες για Μ1/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Επεξεργασία' }))

    expect(await screen.findByText('Επεξεργασία σταθερής συνεδρίας')).toBeInTheDocument()
  })

  it('«Διαγραφή» μέσα στο modal επεξεργασίας ανοίγει το ίδιο confirm και τερματίζει τη σειρά', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    await createScheduleSlot({ dayOfWeek: 1, startTime: '09:00', durationMinutes: 30, type: 'individual', studentIds: [studentId], label: '' })

    const user = userEvent.setup()
    renderSchedulePage()

    await screen.findByText('Μ1')
    await user.click(screen.getByRole('button', { name: /Ενέργειες για Μ1/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Επεξεργασία' }))
    await screen.findByText('Επεξεργασία σταθερής συνεδρίας')
    await user.click(screen.getByRole('button', { name: 'Διαγραφή' }))

    expect(await screen.findByText('Διαγραφή σταθερής συνεδρίας')).toBeInTheDocument()
    expect(screen.queryByText('Επεξεργασία σταθερής συνεδρίας')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Διαγραφή από σήμερα' }))

    await waitFor(() => expect(screen.queryByText('Μ1')).not.toBeInTheDocument())
  })

  it('στη δημιουργία ΔΕΝ υπάρχει κουμπί «Διαγραφή»', async () => {
    const user = userEvent.setup()
    renderSchedulePage()

    const addButtons = await screen.findAllByRole('button', { name: 'Πρόσθεσε' })
    await user.click(addButtons[0])

    await screen.findByText('Νέα σταθερή συνεδρία')
    expect(screen.queryByRole('button', { name: 'Διαγραφή' })).not.toBeInTheDocument()
  })

  it('«Πρόσθεσε» εξακολουθεί να ανοίγει το ScheduleSlotForm σε λειτουργία δημιουργίας', async () => {
    const user = userEvent.setup()
    renderSchedulePage()

    await waitFor(() => expect(screen.getByText('Δευτέρα')).toBeInTheDocument())
    const addButtons = await screen.findAllByRole('button', { name: 'Πρόσθεσε' })
    await user.click(addButtons[0])

    expect(await screen.findByText('Νέα σταθερή συνεδρία')).toBeInTheDocument()
  })
})

// Weekly Grid (Phase 2) — η νέα δεύτερη όψη. Η προεπιλογή ΠΑΡΑΜΕΝΕΙ «Λίστα» (review χρήστη) και
// το πλέγμα διαβάζει το ΙΔΙΟ dataset, καμία νέα query/route.
describe('SchedulePage — εναλλαγή Λίστα/Πλέγμα (Weekly Grid)', () => {
  it('προεπιλογή εκκίνησης είναι «Λίστα» — η λίστα είναι ορατή, το πλέγμα ΟΧΙ', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    await createScheduleSlot({ dayOfWeek: 1, startTime: '09:00', durationMinutes: 30, type: 'individual', studentIds: [studentId], label: '' })

    renderSchedulePage()

    await screen.findByText('Μ1')
    expect(screen.getByRole('tab', { name: 'Λίστα' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Πλέγμα' })).toHaveAttribute('aria-selected', 'false')
    // Στη λίστα, ο κωδικός μαθητή εμφανίζεται μέσα σε ScheduleSlotRow (καμία ώρα στο aria-label ενός button).
    expect(screen.queryByRole('button', { name: /Επεξεργασία: Μ1/ })).not.toBeInTheDocument()
  })

  it('κλικ στο tab «Πλέγμα» δείχνει το ίδιο slot μέσα στο Weekly Grid, χωρίς αλλαγή route', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    await createScheduleSlot({ dayOfWeek: 1, startTime: '09:00', durationMinutes: 30, type: 'individual', studentIds: [studentId], label: '' })

    const user = userEvent.setup()
    renderSchedulePage()

    await screen.findByText('Μ1')
    await user.click(screen.getByRole('tab', { name: 'Πλέγμα' }))

    expect(await screen.findByRole('button', { name: /Επεξεργασία: Μ1, Δευτέρα 09:00, 30′/ })).toBeInTheDocument()
  })

  it('κλικ σε block μέσα στο Πλέγμα ανοίγει το ΙΔΙΟ ScheduleSlotForm edit modal', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    await createScheduleSlot({ dayOfWeek: 1, startTime: '09:00', durationMinutes: 30, type: 'individual', studentIds: [studentId], label: '' })

    const user = userEvent.setup()
    renderSchedulePage()

    await screen.findByText('Μ1')
    await user.click(screen.getByRole('tab', { name: 'Πλέγμα' }))
    await user.click(await screen.findByRole('button', { name: /Επεξεργασία: Μ1/ }))

    expect(await screen.findByText('Επεξεργασία σταθερής συνεδρίας')).toBeInTheDocument()
  })
})
