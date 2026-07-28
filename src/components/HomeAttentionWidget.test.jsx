import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useParams } from 'react-router-dom'
import db from '../db.js'
import { NotificationsProvider } from './shell/NotificationsProvider.jsx'
import HomeAttentionWidget from './HomeAttentionWidget.jsx'

// Regression: τα utility tests (notificationEngine.test.js/notificationData.test.js) αποδεικνύουν
// ότι ο υπολογισμός είναι σωστός — ΔΕΝ αποδεικνύουν ότι το ίδιο το component κάνει σωστά
// render/wiring πάνω σε αυτόν τον υπολογισμό (π.χ. λάθος prop name, σπασμένο import, λάθος
// navigate() route, σπασμένο dismiss/snooze wiring). Αυτό εδώ είναι το συμπληρωματικό,
// component-level επίπεδο απόδειξης.

function GoalDetailStub() {
  const { id, goalId } = useParams()
  return <div>GOAL-DETAIL-{id}-{goalId}</div>
}

function StudentProfileStub() {
  const { id } = useParams()
  return <div>PROFILE-{id}</div>
}

// Το widget πλέον καταναλώνει useNotifications() (βλ. shell/NotificationsProvider.jsx) — δεν
// φορτώνει πια δικά του δεδομένα. Σε πραγματική χρήση το AppShell το τυλίγει ήδη (βλ. AppShell.jsx)·
// εδώ το κάνουμε ρητά ώστε το test να μη χρειάζεται ολόκληρο το AppShell.
function renderWidget() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <NotificationsProvider>
        <Routes>
          <Route path="/" element={<HomeAttentionWidget />} />
          <Route path="/students/:id/goals/:goalId" element={<GoalDetailStub />} />
          <Route path="/students/:id" element={<StudentProfileStub />} />
        </Routes>
      </NotificationsProvider>
    </MemoryRouter>
  )
}

async function seedStudent(overrides = {}) {
  return db.students.add({ code: 'Μ' + Math.random().toString(36).slice(2, 6), active: true, ...overrides })
}

async function seedStaleGoal(studentId, overrides = {}) {
  return db.goals.add({
    studentId, domain: 'reading', title: 'Στόχος', status: 'active', priority: 'medium',
    startDate: '2000-01-01', ...overrides
  })
}

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  cleanup()
  await Promise.all(db.tables.map((t) => t.clear()))
  db.close()
})

describe('HomeAttentionWidget — component-level regression (Smart Notifications)', () => {
  it('χωρίς καμία ειδοποίηση → αποδίδει ΤΙΠΟΤΑ (self-hide), όχι κενό banner', async () => {
    const { container } = renderWidget()
    await waitFor(() => expect(screen.queryByLabelText(/Φόρτωση: Χρειάζονται προσοχή/)).not.toBeInTheDocument())
    expect(container).toBeEmptyDOMElement()
  })

  it('goal stale αποδίδει γραμμή με κωδικό μαθητή, ετικέτα, ΚΑΙ ενέργειες αναβολής/απόρριψης', async () => {
    const studentId = await seedStudent({ code: 'ΑΒ12' })
    await seedStaleGoal(studentId, { title: 'Ανάγνωση προτάσεων' })

    renderWidget()

    const openButton = await screen.findByRole('button', { name: /^ΑΒ12.*Ανάγνωση προτάσεων/ })
    expect(openButton).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Ενέργειες για ειδοποίηση: ΑΒ12/ })).toBeInTheDocument()
  })

  it('κλικ στο άνοιγμα ενός goalStale item → πλοήγηση ΑΠΕΥΘΕΙΑΣ στο GoalDetail (primaryAction: openGoal)', async () => {
    const studentId = await seedStudent({ code: 'ΓΔ34' })
    const goalId = await seedStaleGoal(studentId, { title: 'Στόχος προς έλεγχο' })

    const user = userEvent.setup()
    renderWidget()

    const openButton = await screen.findByRole('button', { name: /^ΓΔ34.*Στόχος προς έλεγχο/ })
    await user.click(openButton)

    expect(await screen.findByText(`GOAL-DETAIL-${studentId}-${goalId}`)).toBeInTheDocument()
  })

  it('«Απόρριψη» από το OverflowMenu κρύβει αμέσως την ειδοποίηση (persisted dismiss)', async () => {
    const studentId = await seedStudent({ code: 'ΕΖ56' })
    await seedStaleGoal(studentId, { title: 'Στόχος Ε' })

    const user = userEvent.setup()
    renderWidget()

    await screen.findByRole('button', { name: /^ΕΖ56/ })
    await user.click(screen.getByRole('button', { name: /Ενέργειες για ειδοποίηση: ΕΖ56/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Απόρριψη' }))

    await waitFor(() => expect(screen.queryByRole('button', { name: /^ΕΖ56/ })).not.toBeInTheDocument())
    expect(await db.notificationState.count()).toBe(1)
  })

  it('«Αναβολή: Αύριο» από το OverflowMenu κρύβει την ειδοποίηση μέχρι να λήξει η αναβολή', async () => {
    const studentId = await seedStudent({ code: 'ΗΘ78' })
    await seedStaleGoal(studentId, { title: 'Στόχος Η' })

    const user = userEvent.setup()
    renderWidget()

    await screen.findByRole('button', { name: /^ΗΘ78/ })
    await user.click(screen.getByRole('button', { name: /Ενέργειες για ειδοποίηση: ΗΘ78/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Αναβολή: Αύριο' }))

    await waitFor(() => expect(screen.queryByRole('button', { name: /^ΗΘ78/ })).not.toBeInTheDocument())
    const stateRows = await db.notificationState.toArray()
    expect(stateRows).toHaveLength(1)
    expect(stateRows[0].snoozedUntil).toBeTruthy()
    expect(stateRows[0].dismissedAt).toBeNull()
  })
})
