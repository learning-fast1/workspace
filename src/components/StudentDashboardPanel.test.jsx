import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useParams } from 'react-router-dom'
import db from '../db.js'
import StudentDashboardPanel from './StudentDashboardPanel.jsx'

// Regression: τα utility tests (studentDashboard.test.js) αποδεικνύουν ότι η pure λογική
// (computeNextBestAction κ.λπ.) είναι σωστή — ΔΕΝ αποδεικνύουν ότι το ίδιο το component κάνει
// σωστά render/wiring πάνω σε αυτήν (π.χ. λάθος prop, σπασμένο import, λάθος destination route).
// Αυτό εδώ είναι το συμπληρωματικό, component-level επίπεδο απόδειξης.

function GoalWizardStub() {
  const { id } = useParams()
  return <div>GOAL-WIZARD-NEW-{id}</div>
}

function renderPanel(studentId, focusGoalId = null) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<StudentDashboardPanel studentId={studentId} focusGoalId={focusGoalId} />} />
        <Route path="/students/:id/goals/new" element={<GoalWizardStub />} />
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

describe('StudentDashboardPanel — component-level regression', () => {
  it('αποδίδεται χωρίς runtime failure πάνω σε πραγματικά δεδομένα', async () => {
    const studentId = await seedStudent()
    await seedGoal(studentId, { title: 'Ανάγνωση' })

    renderPanel(studentId)

    expect(await screen.findByText('Σήμερα')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('goal με ΜΙΑ πρόσφατη μέτρηση, καμία σημερινή συνεδρία → «Όλα ενημερωμένα», ΧΩΡΙΣ actionable CTA', async () => {
    const studentId = await seedStudent()
    const goalId = await seedGoal(studentId)
    const sessionId = await db.sessions.add({ date: daysAgoISO(2), studentIds: [studentId], status: 'held' })
    await db.measurements.add({ studentId, goalId, sessionId, value: { successes: 3, attempts: 10 } })

    renderPanel(studentId)

    expect(await screen.findByText('Όλα ενημερωμένα — καμία άμεση ενέργεια')).toBeInTheDocument()
    // allCaughtUp δεν είναι actionable (βλ. StudentDashboardPanel.jsx isActionable) — κανένα CTA κουμπί.
    expect(screen.queryByRole('button', { name: 'Όλα ενημερωμένα — καμία άμεση ενέργεια' })).not.toBeInTheDocument()
  })

  it('μηδέν goals → σωστό CTA "Δημιούργησε τον πρώτο στόχο"', async () => {
    const studentId = await seedStudent()

    renderPanel(studentId)

    // Το label εμφανίζεται ΚΑΙ ως κείμενο CTA ΚΑΙ ως το ίδιο το κουμπί (βλ. StudentDashboardPanel.jsx) —
    // scoped queries ώστε να μην είναι διφορούμενο ποιο από τα δύο ελέγχεται.
    expect(await screen.findByRole('button', { name: 'Δημιούργησε τον πρώτο στόχο' })).toBeInTheDocument()
    expect(screen.getAllByText('Δημιούργησε τον πρώτο στόχο')).toHaveLength(2)
  })

  it('κλικ στο CTA "Δημιούργησε τον πρώτο στόχο" → πλοήγηση στο σωστό /students/:id/goals/new', async () => {
    const studentId = await seedStudent()
    const user = userEvent.setup()

    renderPanel(studentId)

    const cta = await screen.findByRole('button', { name: 'Δημιούργησε τον πρώτο στόχο' })
    await user.click(cta)

    expect(await screen.findByText(`GOAL-WIZARD-NEW-${studentId}`)).toBeInTheDocument()
  })
})
