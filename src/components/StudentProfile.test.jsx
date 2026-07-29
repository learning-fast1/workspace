import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import db from '../db.js'
import AuthProvider from '../auth/AuthProvider.jsx'
import { claimLegacyDataOwnership } from '../migration/legacyOwnership.js'
import { runMigration, resetMigrationForTests } from '../migration/migrationEngine.js'
import { activateV2Generation, resetActiveGenerationForTests } from '../migration/activeGeneration.js'
import { deterministicId } from '../migration/deterministicId.js'
import StudentProfile from './StudentProfile.jsx'

// Critical hotfix regression (Technical Fix Plan) — πριν το resolveEntityId, Number(id) πάνω σε ένα
// v2 UUID/SHA route id γινόταν NaN, και useLiveQuery(() => activeTable('students').get(NaN)) πετούσε
// (invalid IndexedDB key) αντί να επιστρέψει undefined — το σφάλμα ανέβαινε ως uncaught, φτάνοντας
// στο ErrorBoundary, ζωντανά αναπαραχθέν κατά το Real Multi-Device Sync Validation.
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

function renderProfile(studentId) {
  return render(
    <MemoryRouter initialEntries={[`/students/${studentId}`]}>
      <AuthProvider>
        <Routes>
          <Route path="/students/:id" element={<StudentProfile />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  )
}

describe('StudentProfile — view λειτουργεί ανεξάρτητα από τη γενιά/μορφή id', () => {
  it('legacy μαθητής, αριθμητικό id → εμφανίζεται κανονικά', async () => {
    const id = await db.students.add({ code: 'Μ1', nickname: '', grade: '', notes: '', functionalProfile: [], preferences: {}, active: true })
    renderProfile(id)
    expect(await screen.findByText('Μ1')).toBeInTheDocument()
  })

  it('v2 μαθητής, νέο UUID id (crypto.randomUUID) → εμφανίζεται κανονικά, ΟΧΙ ErrorBoundary crash', async () => {
    await activateV2ForAlice()
    const uuid = crypto.randomUUID()
    await db.table('students_v2').add({ id: uuid, code: 'Μ2', nickname: '', grade: '', notes: '', functionalProfile: [], preferences: {}, active: true })
    renderProfile(uuid)
    expect(await screen.findByText('Μ2')).toBeInTheDocument()
  })

  it('v2 μαθητής, migrated SHA-256 deterministic id → εμφανίζεται κανονικά', async () => {
    await activateV2ForAlice()
    const shaId = await deterministicId(ALICE, 'students', 7) // ίδιο idiom με ένα πραγματικό migrated legacy id=7
    await db.table('students_v2').add({ id: shaId, code: 'Μ3', nickname: '', grade: '', notes: '', functionalProfile: [], preferences: {}, active: true })
    renderProfile(shaId)
    expect(await screen.findByText('Μ3')).toBeInTheDocument()
  })

  it('ανύπαρκτο v2 id → «δεν βρέθηκε», ΟΧΙ ErrorBoundary/μόνιμο loading', async () => {
    await activateV2ForAlice()
    renderProfile(crypto.randomUUID())
    expect(await screen.findByText('Ο μαθητής δεν βρέθηκε')).toBeInTheDocument()
  })

  it('κατεστραμμένο id σε legacy γενιά (π.χ. παλιό garbage URL) → «δεν βρέθηκε», ΟΧΙ crash', async () => {
    renderProfile('not-a-real-id')
    expect(await screen.findByText('Ο μαθητής δεν βρέθηκε')).toBeInTheDocument()
  })
})
