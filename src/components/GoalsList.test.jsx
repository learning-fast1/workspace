import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import db from '../db.js'
import GoalsList from './GoalsList.jsx'
import { claimLegacyDataOwnership } from '../migration/legacyOwnership.js'
import { runMigration, resetMigrationForTests } from '../migration/migrationEngine.js'
import { activateV2Generation, resetActiveGenerationForTests, activeTable } from '../migration/activeGeneration.js'

// Technical Plan Στάδιο 9α — ελάχιστο integration test που αποδεικνύει ότι το ΠΡΑΓΜΑΤΙΚΟ wiring
// (goal+measurement δεδομένα από τη βάση → registry → GoalCard props) δουλεύει σωστά άκρη-σε-άκρη.
// Η εξαντλητική κάλυψη ανά τύπο ζει ήδη στο measurementTypes.test.js· εδώ μόνο 3 αντιπροσωπευτικά
// σενάρια, ίδια με τα 3 states του GoalCard.test.jsx.

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  cleanup()
  await resetActiveGenerationForTests()
  await resetMigrationForTests()
  await Promise.all(db.tables.map((t) => t.clear()))
  db.close()
})

function renderList(studentId) {
  return render(
    <MemoryRouter>
      <GoalsList studentId={studentId} />
    </MemoryRouter>
  )
}

describe('GoalsList — wiring προς το registry (Technical Plan Στάδιο 9α)', () => {
  it('δομημένο successRatio goal ΜΕ μέτρηση → progress bar με την ΠΡΑΓΜΑΤΙΚΗ επίδοση (4/5=80%, ΟΧΙ σχετική με τον στόχο)', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    const goalId = await db.goals.add({
      studentId, domain: 'reading', title: 'Στόχος Α', description: '', baseline: '',
      measurementType: 'successRatio',
      criterionConfig: { targetSuccesses: 4, targetAttempts: 5 },
      criterion: '4 από 5 προσπάθειες',
      supportLevel: '', priority: 'medium', startDate: '2026-01-01', status: 'active', statusChangedAt: '2026-01-01'
    })
    const sessionId = await db.sessions.add({ date: '2026-07-10', studentIds: [studentId], status: 'held' })
    await db.measurements.add({ studentId, goalId, sessionId, value: { successes: 4, attempts: 5 } })

    renderList(studentId)
    await waitFor(() => expect(screen.queryByText('Φόρτωση…')).not.toBeInTheDocument())

    expect(document.querySelector('.progress-bar')).toBeInTheDocument()
    expect(screen.getByText('80%')).toBeInTheDocument()
  })

  it('legacy promptLevel goal (χωρίς criterionConfig) ΜΕ μέτρηση → «Τελευταία καταγραφή», ΧΩΡΙΣ progress bar', async () => {
    const studentId = await db.students.add({ code: 'Μ2', active: true })
    const goalId = await db.goals.add({
      studentId, domain: 'oral-language', title: 'Στόχος Β', description: '', baseline: '',
      measurementType: 'promptLevel',
      criterion: 'Λεκτική υπόδειξη', // legacy ελεύθερο κείμενο — promptLevel ΠΟΤΕ δεν υποστηρίζει progress
      supportLevel: '', priority: 'medium', startDate: '2026-01-01', status: 'active', statusChangedAt: '2026-01-01'
    })
    const sessionId = await db.sessions.add({ date: '2026-07-10', studentIds: [studentId], status: 'held' })
    await db.measurements.add({ studentId, goalId, sessionId, value: { level: 'verbal' } })

    renderList(studentId)
    await waitFor(() => expect(screen.queryByText('Φόρτωση…')).not.toBeInTheDocument())

    expect(document.querySelector('.progress-bar')).not.toBeInTheDocument()
    expect(screen.getByText('Τελευταία καταγραφή: Λεκτική υπόδειξη')).toBeInTheDocument()
  })

  it('goal ΧΩΡΙΣ καμία μέτρηση → «Καμία μέτρηση ακόμα»', async () => {
    const studentId = await db.students.add({ code: 'Μ3', active: true })
    await db.goals.add({
      studentId, domain: 'reading', title: 'Στόχος Γ', description: '', baseline: '',
      measurementType: 'successRatio',
      criterionConfig: { targetSuccesses: 4, targetAttempts: 5 },
      criterion: '4 από 5 προσπάθειες',
      supportLevel: '', priority: 'medium', startDate: '2026-01-01', status: 'active', statusChangedAt: '2026-01-01'
    })

    renderList(studentId)
    await waitFor(() => expect(screen.queryByText('Φόρτωση…')).not.toBeInTheDocument())

    expect(document.querySelector('.progress-bar')).not.toBeInTheDocument()
    expect(screen.getByText('Καμία μέτρηση ακόμα')).toBeInTheDocument()
    // Minor UX Polish (bug report): πριν το κριτήριο ήταν εντελώς αόρατο όσο δεν υπήρχε μέτρηση.
    expect(screen.getByText('Κριτήριο')).toBeInTheDocument()
    expect(screen.getByText('4 από 5 προσπάθειες')).toBeInTheDocument()
  })
})

// Mobile review (product polish, σημείο 3): πριν υπήρχαν ΔΥΟ κουμπιά «Νέος στόχος» ταυτόχρονα —
// ένα στο SectionHeader ΚΑΙ ένα μέσα στο EmptyState. Κανόνας: όταν υπάρχει ήδη header action για
// την ίδια ενέργεια, το empty state ΔΕΝ φέρει δικό του CTA.
describe('GoalsList — EmptyState χωρίς διπλό CTA (μαθητής χωρίς κανέναν στόχο)', () => {
  it('εμφανίζεται ΑΚΡΙΒΩΣ ΕΝΑ κουμπί «Νέος στόχος» (του SectionHeader), όχι δεύτερο μέσα στο EmptyState', async () => {
    const studentId = await db.students.add({ code: 'Μ4', active: true })

    renderList(studentId)
    await waitFor(() => expect(screen.getByText('Δεν υπάρχουν στόχοι ακόμα')).toBeInTheDocument())

    expect(screen.getAllByRole('button', { name: /Νέος στόχος/ })).toHaveLength(1)
  })
})

// Critical hotfix regression (Technical Fix Plan) — πριν το resolveEntityId, Number(selectedYearId)
// πάνω σε ένα v2 UUID σχολικού έτους έδινε πάντα NaN, άρα y.id === NaN ήταν πάντα false — το
// ιστορικό φίλτρο ΔΕΝ ταίριαζε ΠΟΤΕ σε v2 γενιά, ανεξάρτητα από ποιο έτος επέλεγε ο χρήστης.
describe('GoalsList — ιστορικό φίλτρο σχολικού έτους σε v2 γενιά (κρίσιμο hotfix regression)', () => {
  const ALICE = 'alice@example.com'
  const asAlice = { getAuthenticatedUserId: () => ALICE }

  async function activateV2ForAlice() {
    await claimLegacyDataOwnership(ALICE, asAlice)
    const state = await runMigration(asAlice)
    expect(state.status).toBe('complete')
    await activateV2Generation(ALICE, asAlice)
  }

  it('επιλογή ενός v2 (UUID) σχολικού έτους εμφανίζει το σωστό ιστορικό banner', async () => {
    await activateV2ForAlice()
    const studentId = crypto.randomUUID()
    await activeTable('students').add({ id: studentId, code: 'Μ5', active: true })
    await activeTable('goals').add({
      id: crypto.randomUUID(), studentId, domain: 'reading', title: 'Στόχος', description: '',
      baseline: 'Κάτι', criterion: '8/10', measurementType: 'successRatio', supportLevel: '',
      priority: 'medium', startDate: '2025-09-01', status: 'active', statusChangedAt: '2025-09-01'
    })
    const yearId = crypto.randomUUID()
    await activeTable('schoolYears').add({
      id: yearId, label: '2025-2026', startDate: '2025-09-01', endDate: '2026-06-30', isActive: false
    })

    const user = userEvent.setup()
    renderList(studentId)
    await waitFor(() => expect(screen.queryByText('Φόρτωση…')).not.toBeInTheDocument())

    await user.selectOptions(screen.getByLabelText('Σχολικό έτος'), yearId)

    expect(await screen.findByRole('status')).toHaveTextContent('2025-2026')
  })
})
