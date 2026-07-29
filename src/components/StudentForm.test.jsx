import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import db from '../db.js'
import AuthProvider from '../auth/AuthProvider.jsx'
import { claimLegacyDataOwnership } from '../migration/legacyOwnership.js'
import { runMigration, resetMigrationForTests } from '../migration/migrationEngine.js'
import { activateV2Generation, resetActiveGenerationForTests, activeTable } from '../migration/activeGeneration.js'
import { deterministicId } from '../migration/deterministicId.js'
import StudentForm from './StudentForm.jsx'

// Critical hotfix regression (Technical Fix Plan) — πριν το resolveEntityId, activeTable('students')
// .get(Number(id)) σε edit mode είτε κολλούσε μόνιμα σε "Φόρτωση…" (unhandled rejection, .then()
// χωρίς .catch()) είτε γκρέμιζε — ζωντανά αναπαραχθέν και στις δύο μορφές κατά το Real Multi-Device
// Sync Validation.
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

function renderEdit(studentId) {
  return render(
    <MemoryRouter initialEntries={[`/students/${studentId}/edit`]}>
      <AuthProvider>
        <Routes>
          <Route path="/students/:id/edit" element={<StudentForm mode="edit" />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  )
}

function renderCreate() {
  return render(
    <MemoryRouter initialEntries={['/students/new']}>
      <AuthProvider>
        <Routes>
          <Route path="/students/new" element={<StudentForm mode="create" />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  )
}

describe('StudentForm — edit λειτουργεί ανεξάρτητα από τη γενιά/μορφή id', () => {
  it('legacy μαθητής, αριθμητικό id → φορτώνει τη φόρμα με τα σωστά δεδομένα', async () => {
    const id = await db.students.add({ code: 'Μ1', nickname: 'Νικ', grade: 'Α', notes: '', functionalProfile: [], preferences: {}, active: true })
    renderEdit(id)
    expect(await screen.findByDisplayValue('Μ1')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Νικ')).toBeInTheDocument()
  })

  it('v2 μαθητής, νέο UUID id → φορτώνει τη φόρμα κανονικά, ΟΧΙ μόνιμο "Φόρτωση…"', async () => {
    await activateV2ForAlice()
    const uuid = crypto.randomUUID()
    await db.table('students_v2').add({ id: uuid, code: 'Μ2', nickname: '', grade: '', notes: '', functionalProfile: [], preferences: {}, active: true })
    renderEdit(uuid)
    expect(await screen.findByDisplayValue('Μ2')).toBeInTheDocument()
  })

  it('v2 μαθητής, migrated SHA-256 id → φορτώνει τη φόρμα κανονικά', async () => {
    await activateV2ForAlice()
    const shaId = await deterministicId(ALICE, 'students', 3)
    await db.table('students_v2').add({ id: shaId, code: 'Μ3', nickname: '', grade: '', notes: '', functionalProfile: [], preferences: {}, active: true })
    renderEdit(shaId)
    expect(await screen.findByDisplayValue('Μ3')).toBeInTheDocument()
  })

  it('ανύπαρκτο v2 id → «δεν βρέθηκε», ΟΧΙ μόνιμο loading', async () => {
    await activateV2ForAlice()
    renderEdit(crypto.randomUUID())
    expect(await screen.findByText('Ο μαθητής δεν βρέθηκε')).toBeInTheDocument()
  })

  it('αποθήκευση αλλαγής σε v2 μαθητή γράφει στο ΣΩΣΤΟ id, όχι NaN', async () => {
    await activateV2ForAlice()
    const uuid = crypto.randomUUID()
    await db.table('students_v2').add({ id: uuid, code: 'Μ4', nickname: '', grade: '', notes: '', functionalProfile: [], preferences: {}, active: true })
    const user = userEvent.setup()
    renderEdit(uuid)
    await screen.findByDisplayValue('Μ4')
    await user.type(screen.getByLabelText('Μικρό όνομα', { exact: false }), 'Νέο όνομα')
    await user.click(screen.getByRole('button', { name: 'Αποθήκευση' }))

    await waitFor(async () => {
      const row = await activeTable('students').get(uuid)
      expect(row.nickname).toBe('Νέο όνομα')
    })
    expect(await activeTable('students').count()).toBe(1) // καμία ορφανή/επιπλέον γραμμή (π.χ. NaN key)
  })
})

describe('StudentForm — create παραμένει αναλλοίωτο (baseline, ΔΕΝ επηρεάζεται από resolveEntityId)', () => {
  it('v2: νέος μαθητής παίρνει UUID id κανονικά', async () => {
    await activateV2ForAlice()
    const user = userEvent.setup()
    renderCreate()
    await user.type(screen.getByLabelText('Κωδικός μαθητή', { exact: false }), 'Μ5')
    await user.click(screen.getByRole('button', { name: 'Αποθήκευση' }))

    await waitFor(async () => {
      expect(await activeTable('students').count()).toBe(1)
    })
    const row = (await activeTable('students').toArray())[0]
    expect(typeof row.id).toBe('string')
    expect(row.code).toBe('Μ5')
  })
})
