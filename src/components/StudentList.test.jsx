import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, cleanup, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import db from '../db.js'
import StudentList from './StudentList.jsx'

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  cleanup()
  await Promise.all(db.tables.map((t) => t.clear()))
  db.close()
})

function renderStudentList() {
  return render(
    <MemoryRouter>
      <StudentList />
    </MemoryRouter>
  )
}

// Mobile review (product polish, σημείο 3): πριν υπήρχαν ΔΥΟ κουμπιά για την ίδια ενέργεια —
// «Νέος μαθητής» στο PageHeader (primaryAction) ΚΑΙ «Πρόσθεσε τον πρώτο μαθητή» μέσα στο EmptyState.
// Κανόνας: όταν υπάρχει ήδη header action, το empty state ΔΕΝ φέρει δικό του CTA.
describe('StudentList — EmptyState χωρίς διπλό CTA (κανένας μαθητής ακόμα)', () => {
  it('εμφανίζεται ΑΚΡΙΒΩΣ ΕΝΑ link προς /students/new (του PageHeader), όχι δεύτερο μέσα στο EmptyState', async () => {
    renderStudentList()
    await waitFor(() => expect(screen.getByText('Δεν υπάρχουν μαθητές ακόμα')).toBeInTheDocument())

    expect(screen.getAllByRole('link', { name: /Νέος μαθητής/ })).toHaveLength(1)
    expect(screen.queryByText('Πρόσθεσε τον πρώτο μαθητή')).not.toBeInTheDocument()
  })

  it('το EmptyState της αναζήτησης χωρίς αποτελέσματα ΔΕΝ επηρεάζεται (δεν είναι διπλότυπο, μοναδική ενέργεια)', async () => {
    await db.students.add({ code: 'Μ1', active: true })
    const user = userEvent.setup()
    renderStudentList()
    await waitFor(() => expect(screen.getByText('Μ1')).toBeInTheDocument())

    await user.type(screen.getByPlaceholderText('Αναζήτηση με κωδικό, όνομα ή τάξη…'), 'ΔΕΝ_ΥΠΑΡΧΕΙ')

    await waitFor(() => expect(screen.getByText('Δεν βρέθηκαν μαθητές')).toBeInTheDocument())
    // Ίδιο aria-label με το ενσωματωμένο X του SearchBar (utility, όχι primary action) — σκόπιμα
    // εκτός του "διπλό CTA" κανόνα, γι' αυτό ελέγχουμε μόνο ΜΕΣΑ στο ίδιο το EmptyState.
    const emptyState = screen.getByText('Δεν βρέθηκαν μαθητές').closest('.empty-state')
    expect(within(emptyState).getByRole('button', { name: 'Καθαρισμός αναζήτησης' })).toBeInTheDocument()
  })
})
