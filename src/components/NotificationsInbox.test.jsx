import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useParams } from 'react-router-dom'
import db from '../db.js'
import { todayLocalISO, addDays } from '../utils/date.js'
import { NotificationsProvider } from './shell/NotificationsProvider.jsx'
import NotificationsInbox from './NotificationsInbox.jsx'

function GoalDetailStub() {
  const { id, goalId } = useParams()
  return <div>GOAL-DETAIL-{id}-{goalId}</div>
}

function StudentProfileStub() {
  const { id } = useParams()
  return <div>PROFILE-{id}</div>
}

function renderInbox() {
  return render(
    <MemoryRouter initialEntries={['/notifications']}>
      <NotificationsProvider>
        <Routes>
          <Route path="/notifications" element={<NotificationsInbox />} />
          <Route path="/students/:id/goals/:goalId" element={<GoalDetailStub />} />
          <Route path="/students/:id" element={<StudentProfileStub />} />
        </Routes>
      </NotificationsProvider>
    </MemoryRouter>
  )
}

async function seedStaleGoal(code) {
  const studentId = await db.students.add({ code, active: true })
  const goalId = await db.goals.add({ studentId, domain: 'communication', title: `Στόχος ${code}`, status: 'active', priority: 'high', startDate: '2020-01-01' })
  return { studentId, goalId }
}

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  cleanup()
  await Promise.all(db.tables.map((t) => t.clear()))
  db.close()
})

describe('NotificationsInbox — v1', () => {
  // Regression (review — bug εντοπίστηκε από το Playwright production-smoke suite, βλ.
  // e2e/smoke.spec.js): το useNotifications() καλούνταν ΠΑΛΙΟΤΕΡΑ στο ίδιο component που αποδίδει
  // το <AppShell>, ΕΚΤΟΣ του <NotificationsProvider> που αυτό παρέχει — crash σε ΚΑΘΕ πραγματική
  // φόρτωση του /notifications. Το renderInbox() παραπάνω δεν το έπιανε ΠΟΤΕ γιατί τυλίγει με
  // ΔΙΚΟ ΤΟΥ, επιπλέον provider. Αυτό εδώ αποδίδει το NotificationsInbox ΑΚΡΙΒΩΣ όπως το App.jsx
  // (ΧΩΡΙΣ κανένα εξωτερικό NotificationsProvider) — αν το bug ξαναεμφανιστεί, σκάει εδώ.
  it('αποδίδεται σωστά ΧΩΡΙΣ εξωτερικό NotificationsProvider (ίδιο μοτίβο με App.jsx πραγματικής χρήσης)', async () => {
    render(
      <MemoryRouter initialEntries={['/notifications']}>
        <Routes>
          <Route path="/notifications" element={<NotificationsInbox />} />
        </Routes>
      </MemoryRouter>
    )
    expect(await screen.findByText('Όλα ενημερωμένα!')).toBeInTheDocument()
  })

  it('χωρίς καμία ειδοποίηση → θετικό EmptyState, καμία λίστα/φίλτρα', async () => {
    renderInbox()
    expect(await screen.findByText('Όλα ενημερωμένα!')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Φίλτρα' })).not.toBeInTheDocument()
  })

  it('εμφανίζει ενεργές ειδοποιήσεις στην ενότητα «Ενεργές»', async () => {
    await seedStaleGoal('ΑΑ11')
    renderInbox()
    expect(await screen.findByText(/Ενεργές/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^ΑΑ11/ })).toBeInTheDocument()
  })

  it('κλικ σε ειδοποίηση πλοηγεί στο σωστό entity (openGoal → GoalDetail)', async () => {
    const { studentId, goalId } = await seedStaleGoal('ΒΒ22')
    const user = userEvent.setup()
    renderInbox()

    await user.click(await screen.findByRole('button', { name: /^ΒΒ22/ }))
    expect(await screen.findByText(`GOAL-DETAIL-${studentId}-${goalId}`)).toBeInTheDocument()
  })

  it('«Απόρριψη» αφαιρεί την ειδοποίηση από την λίστα', async () => {
    await seedStaleGoal('ΓΓ33')
    const user = userEvent.setup()
    renderInbox()

    await screen.findByRole('button', { name: /^ΓΓ33/ })
    await user.click(screen.getByRole('button', { name: /Ενέργειες για ειδοποίηση: ΓΓ33/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Απόρριψη' }))

    await waitFor(() => expect(screen.getByText('Όλα ενημερωμένα!')).toBeInTheDocument())
  })

  it('severity filter (accessible segmented buttons, ΟΧΙ Tabs/role=tablist) φιλτράρει σωστά', async () => {
    await seedStaleGoal('ΔΔ44') // warning
    const draftStudent = await db.students.add({ code: 'ΕΕ55', active: true })
    await db.reports.add({ studentId: draftStudent, type: 'progress', dateFrom: '2026-01-01', dateTo: todayLocalISO(), generatedAt: new Date().toISOString(), editedText: '', status: 'draft', exportedAt: null }) // info

    const user = userEvent.setup()
    renderInbox()
    await screen.findByRole('button', { name: /^ΔΔ44/ })

    await user.click(screen.getByRole('button', { name: 'Φίλτρα' }))
    const severityGroup = screen.getByRole('group', { name: 'Φίλτρο σοβαρότητας' })
    expect(severityGroup.querySelector('[role="tablist"]')).toBeNull()

    const warningChip = screen.getByRole('button', { name: 'Χρειάζονται προσοχή' })
    expect(warningChip).toHaveAttribute('aria-pressed', 'false')
    await user.click(warningChip)
    expect(warningChip).toHaveAttribute('aria-pressed', 'true')

    expect(screen.getByRole('button', { name: /^ΔΔ44/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^ΕΕ55/ })).not.toBeInTheDocument()
  })

  it('type filter φιλτράρει σωστά', async () => {
    await seedStaleGoal('ΖΖ66')
    const draftStudent = await db.students.add({ code: 'ΗΗ77', active: true })
    await db.reports.add({ studentId: draftStudent, type: 'progress', dateFrom: '2026-01-01', dateTo: todayLocalISO(), generatedAt: new Date().toISOString(), editedText: '', status: 'draft', exportedAt: null })

    const user = userEvent.setup()
    renderInbox()
    await screen.findByRole('button', { name: /^ΖΖ66/ })
    await user.click(screen.getByRole('button', { name: 'Φίλτρα' }))

    await user.selectOptions(screen.getByLabelText('Τύπος'), 'draftReport')

    expect(screen.queryByRole('button', { name: /^ΖΖ66/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^ΗΗ77/ })).toBeInTheDocument()
  })

  it('student filter φιλτράρει σωστά, οι επιλογές είναι η ΕΝΩΣΗ visible+snoozed', async () => {
    const { goalId: goalId1 } = await seedStaleGoal('ΘΘ88')
    await seedStaleGoal('ΙΙ99')

    const user = userEvent.setup()
    renderInbox()
    await screen.findByRole('button', { name: /^ΘΘ88/ })
    await user.click(screen.getByRole('button', { name: 'Φίλτρα' }))

    const studentSelect = screen.getByLabelText('Μαθητής')
    expect(within(studentSelect).getAllByRole('option').map((o) => o.textContent)).toEqual(expect.arrayContaining(['ΘΘ88', 'ΙΙ99']))

    await user.selectOptions(studentSelect, String((await db.goals.get(goalId1)).studentId))
    expect(screen.getByRole('button', { name: /^ΘΘ88/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^ΙΙ99/ })).not.toBeInTheDocument()
  })

  it('φιλτράρισμα σε μηδέν αποτελέσματα → EmptyState με «Καθαρισμός φίλτρων»', async () => {
    await seedStaleGoal('ΚΚ00')
    const user = userEvent.setup()
    renderInbox()
    await screen.findByRole('button', { name: /^ΚΚ00/ })
    await user.click(screen.getByRole('button', { name: 'Φίλτρα' }))
    await user.click(screen.getByRole('button', { name: 'Ενημερωτικές' }))

    expect(await screen.findByText('Καμία ειδοποίηση με αυτά τα φίλτρα')).toBeInTheDocument()
    // Δύο «Καθαρισμός φίλτρων» ταυτόχρονα σκόπιμα (ένα στο φίλτρο-panel, ένα στο EmptyState CTA) —
    // και τα δύο κάνουν ΤΟ ΙΔΙΟ, αρκεί το πρώτο.
    const clearButtons = screen.getAllByRole('button', { name: 'Καθαρισμός φίλτρων' })
    await user.click(clearButtons[0])
    expect(await screen.findByRole('button', { name: /^ΚΚ00/ })).toBeInTheDocument()
  })

  it('ενότητα «Σε αναβολή» εμφανίζεται ΜΟΝΟ όταν υπάρχει κάτι σε αναβολή, με ημερομηνία λήξης', async () => {
    await seedStaleGoal('ΛΛ11')

    const user = userEvent.setup()
    renderInbox()
    await screen.findByRole('button', { name: /^ΛΛ11/ })
    expect(screen.queryByText(/Σε αναβολή/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Ενέργειες για ειδοποίηση: ΛΛ11/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Αναβολή: Αύριο' }))

    expect(await screen.findByText(/Σε αναβολή/)).toBeInTheDocument()
    expect(screen.getByText(/έως/)).toBeInTheDocument()
  })

  it('«Άρση αναβολής» επαναφέρει την ειδοποίηση στις Ενεργές', async () => {
    await seedStaleGoal('ΜΜ22')
    const user = userEvent.setup()
    renderInbox()
    await screen.findByRole('button', { name: /^ΜΜ22/ })
    await user.click(screen.getByRole('button', { name: /Ενέργειες για ειδοποίηση: ΜΜ22/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Αναβολή: Αύριο' }))
    await screen.findByText(/Σε αναβολή/)

    await user.click(screen.getByRole('button', { name: /Ενέργειες για ειδοποίηση: ΜΜ22/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Άρση αναβολής' }))

    await waitFor(() => expect(screen.queryByText(/Σε αναβολή/)).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: /^ΜΜ22/ })).toBeInTheDocument()
  })
})
