import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import db from '../db.js'
import AuthProvider from '../auth/AuthProvider.jsx'
import { claimLegacyDataOwnership } from '../migration/legacyOwnership.js'
import { runMigration, resetMigrationForTests } from '../migration/migrationEngine.js'
import { activateV2Generation, resetActiveGenerationForTests } from '../migration/activeGeneration.js'
import { deterministicId } from '../migration/deterministicId.js'
import GoalDetail from './GoalDetail.jsx'

// Critical hotfix regression (Technical Fix Plan) — Number(goalId)/Number(id) στο GoalDetail.jsx
// έκαναν το ίδιο invalid-key crash με το StudentProfile.jsx, για goal routes.
const ALICE = 'alice@example.com'
const asAlice = { getAuthenticatedUserId: () => ALICE }

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

async function activateV2ForAlice() {
  await claimLegacyDataOwnership(ALICE, asAlice)
  const state = await runMigration(asAlice)
  expect(state.status).toBe('complete')
  await activateV2Generation(ALICE, asAlice)
}

function renderGoal(studentId, goalId) {
  return render(
    <MemoryRouter initialEntries={[`/students/${studentId}/goals/${goalId}`]}>
      <AuthProvider>
        <Routes>
          <Route path="/students/:id/goals/:goalId" element={<GoalDetail />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  )
}

const baseGoal = {
  domain: 'reading',
  title: 'Στόχος ανάγνωσης',
  description: '',
  baseline: 'Κάτι',
  criterion: '8/10',
  measurementType: 'successRatio',
  supportLevel: '',
  priority: 'medium',
  startDate: '2026-01-01',
  status: 'active',
  statusChangedAt: '2026-01-01T00:00:00.000Z'
}

describe('GoalDetail — view λειτουργεί ανεξάρτητα από τη γενιά/μορφή id', () => {
  it('legacy μαθητής+στόχος, αριθμητικά ids → εμφανίζεται κανονικά', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    const goalId = await db.goals.add({ ...baseGoal, studentId })
    renderGoal(studentId, goalId)
    expect(await screen.findByText('Στόχος ανάγνωσης')).toBeInTheDocument()
  })

  it('v2, νέα UUID ids → εμφανίζεται κανονικά, ΟΧΙ ErrorBoundary crash', async () => {
    await activateV2ForAlice()
    const studentId = crypto.randomUUID()
    const goalId = crypto.randomUUID()
    await db.table('students_v2').add({ id: studentId, code: 'Μ2', active: true })
    await db.table('goals_v2').add({ id: goalId, ...baseGoal, studentId })
    renderGoal(studentId, goalId)
    expect(await screen.findByText('Στόχος ανάγνωσης')).toBeInTheDocument()
  })

  it('v2, migrated SHA-256 ids → εμφανίζεται κανονικά', async () => {
    await activateV2ForAlice()
    const studentId = await deterministicId(ALICE, 'students', 1)
    const goalId = await deterministicId(ALICE, 'goals', 1)
    await db.table('students_v2').add({ id: studentId, code: 'Μ3', active: true })
    await db.table('goals_v2').add({ id: goalId, ...baseGoal, studentId })
    renderGoal(studentId, goalId)
    expect(await screen.findByText('Στόχος ανάγνωσης')).toBeInTheDocument()
  })

  it('ανύπαρκτο v2 goalId → «δεν βρέθηκε», ΟΧΙ crash/μόνιμο loading', async () => {
    await activateV2ForAlice()
    const studentId = crypto.randomUUID()
    await db.table('students_v2').add({ id: studentId, code: 'Μ4', active: true })
    renderGoal(studentId, crypto.randomUUID())
    expect(await screen.findByText('Ο στόχος δεν βρέθηκε')).toBeInTheDocument()
  })
})
