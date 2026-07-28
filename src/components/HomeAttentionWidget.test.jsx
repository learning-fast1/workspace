import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useParams, useLocation } from 'react-router-dom'
import db from '../db.js'
import HomeAttentionWidget from './HomeAttentionWidget.jsx'

// Regression: τα utility tests (homeAttentionData.test.js) αποδεικνύουν ότι ο υπολογισμός είναι
// σωστός — ΔΕΝ αποδεικνύουν ότι το ίδιο το component κάνει σωστά render/wiring πάνω σε αυτόν τον
// υπολογισμό (π.χ. λάθος prop name, σπασμένο import, λάθος navigate() route/state shape). Αυτό εδώ
// είναι το συμπληρωματικό, component-level επίπεδο απόδειξης.

function StudentProfileStub() {
  const { id } = useParams()
  const location = useLocation()
  return <div>PROFILE-{id}-focusGoal-{String(location.state?.focusGoalId)}</div>
}

function renderWidget() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<HomeAttentionWidget />} />
        <Route path="/students/:id" element={<StudentProfileStub />} />
      </Routes>
    </MemoryRouter>
  )
}

function daysAgoISO(days) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

async function seedStudent(overrides = {}) {
  return db.students.add({ code: 'Μ' + Math.random().toString(36).slice(2, 6), active: true, ...overrides })
}

async function seedGoal(studentId, overrides = {}) {
  return db.goals.add({
    studentId, domain: 'reading', title: 'Στόχος', status: 'active', priority: 'medium',
    startDate: '2000-01-01', criterion: '8/10', measurementType: 'successRatio', ...overrides
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

describe('HomeAttentionWidget — component-level regression', () => {
  it('χωρίς κανένα attention item → αποδίδει ΤΙΠΟΤΑ (self-hide), όχι κενό banner', async () => {
    const { container } = renderWidget()
    await waitFor(() => expect(screen.queryByLabelText(/Φόρτωση: Χρειάζονται προσοχή/)).not.toBeInTheDocument())
    expect(container).toBeEmptyDOMElement()
  })

  it('goal με πολλαπλούς λόγους (nearCriterion + stale) αποδίδει ΚΑΙ τους δύο λόγους στην ΙΔΙΑ γραμμή', async () => {
    const studentId = await seedStudent({ code: 'ΑΒ12' })
    const goalId = await seedGoal(studentId, { title: 'Ανάγνωση προτάσεων', startDate: '2000-01-01' })
    const sessionId = await db.sessions.add({ date: daysAgoISO(30), studentIds: [studentId], status: 'held' })
    // Κοντά στο criterion (nearCriterion) αλλά παλιά ημερομηνία (>14 μέρες, stale) — ίδιο σενάριο
    // με το πρώτο test του homeAttentionData.test.js, εδώ ελέγχεται το ΙΔΙΟ render.
    await db.measurements.add({ studentId, goalId, sessionId, value: { successes: 75, attempts: 100 } })

    renderWidget()

    await screen.findByText('Ανάγνωση προτάσεων')
    const row = screen.getByRole('button', { name: /ΑΒ12.*Ανάγνωση προτάσεων/ })
    expect(row).toHaveTextContent(/.+/) // sanity: κάτι αποδόθηκε
    // Δύο ξεχωριστά reason chips (nearCriterion + stale) μέσα στην ΙΔΙΑ γραμμή.
    const reasonChips = row.querySelectorAll('.home-attention-widget__reason')
    expect(reasonChips.length).toBe(2)
    const reasonTypes = [...reasonChips].map((el) => el.className.match(/home-attention-widget__reason--(\w+)/)[1])
    expect(reasonTypes.sort()).toEqual(['nearCriterion', 'stale'])
  })

  it('κλικ σε γραμμή → πλοήγηση στο ΣΩΣΤΟ student profile ΜΕ το σωστό focusGoalId', async () => {
    const studentId = await seedStudent({ code: 'ΓΔ34' })
    const goalId = await seedGoal(studentId, { title: 'Στόχος προς έλεγχο', startDate: '2000-01-01' })

    const user = userEvent.setup()
    renderWidget()

    const row = await screen.findByRole('button', { name: /ΓΔ34.*Στόχος προς έλεγχο/ })
    await user.click(row)

    expect(await screen.findByText(`PROFILE-${studentId}-focusGoal-${goalId}`)).toBeInTheDocument()
  })
})
