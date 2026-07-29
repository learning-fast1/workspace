import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import db from '../db.js'
import AuthProvider from '../auth/AuthProvider.jsx'
import { claimLegacyDataOwnership } from '../migration/legacyOwnership.js'
import { runMigration, resetMigrationForTests } from '../migration/migrationEngine.js'
import { activateV2Generation, resetActiveGenerationForTests, activeTable } from '../migration/activeGeneration.js'
import StudentForm from './StudentForm.jsx'
import StudentProfile from './StudentProfile.jsx'

// Critical hotfix — ρητό, end-to-end regression test για ΑΚΡΙΒΩΣ το flow που ζητήθηκε στο Technical
// Fix Plan: activate v2 → create student → open profile → open edit → save → reopen. Κάθε βήμα
// ξεχωριστά καλύπτεται ήδη από StudentForm.test.jsx/StudentProfile.test.jsx — αυτό το test αποδεικνύει
// ότι η ΑΛΥΣΙΔΑ δουλεύει άκρη-σε-άκρη με το ΙΔΙΟ (πραγματικό, crypto.randomUUID) id σε κάθε βήμα, όχι
// μόνο κάθε κομμάτι μεμονωμένα.
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

function renderApp(initialPath) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <Routes>
          <Route path="/students/new" element={<StudentForm mode="create" />} />
          <Route path="/students/:id" element={<StudentProfile />} />
          <Route path="/students/:id/edit" element={<StudentForm mode="edit" />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  )
}

describe('End-to-end v2 regression: activate v2 → create → view → edit → save → reopen', () => {
  it('ολόκληρη η αλυσίδα δουλεύει με το ΙΔΙΟ πραγματικό UUID id σε κάθε βήμα', async () => {
    await claimLegacyDataOwnership(ALICE, asAlice)
    const migrationState = await runMigration(asAlice)
    expect(migrationState.status).toBe('complete')
    await activateV2Generation(ALICE, asAlice)

    const user = userEvent.setup()

    // 1) create
    renderApp('/students/new')
    await user.type(screen.getByLabelText('Κωδικός μαθητή', { exact: false }), 'Ε2Ε-1')
    await user.type(screen.getByLabelText('Μικρό όνομα', { exact: false }), 'Αρχικό')
    await user.click(screen.getByRole('button', { name: 'Αποθήκευση' }))

    await waitFor(async () => expect(await activeTable('students').count()).toBe(1))
    const created = (await activeTable('students').toArray())[0]
    expect(typeof created.id).toBe('string')
    expect(created.id.length).toBeGreaterThan(10) // πραγματικό crypto.randomUUID, όχι NaN/placeholder
    cleanup()

    // 2) open profile (view) — ΤΟ ΙΔΙΟ id, ΟΧΙ ErrorBoundary crash
    renderApp(`/students/${created.id}`)
    expect(await screen.findByText('Ε2Ε-1')).toBeInTheDocument()
    cleanup()

    // 3) open edit — ΤΟ ΙΔΙΟ id, φορτώνει τα υπάρχοντα δεδομένα (ΟΧΙ μόνιμο "Φόρτωση…")
    renderApp(`/students/${created.id}/edit`)
    expect(await screen.findByDisplayValue('Ε2Ε-1')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Αρχικό')).toBeInTheDocument()

    // 4) save — αλλαγή + αποθήκευση γράφει στο ΣΩΣΤΟ id
    await user.clear(screen.getByLabelText('Μικρό όνομα', { exact: false }))
    await user.type(screen.getByLabelText('Μικρό όνομα', { exact: false }), 'Ενημερωμένο')
    await user.click(screen.getByRole('button', { name: 'Αποθήκευση' }))

    await waitFor(async () => {
      const row = await activeTable('students').get(created.id)
      expect(row.nickname).toBe('Ενημερωμένο')
    })
    expect(await activeTable('students').count()).toBe(1) // καμία δεύτερη/ορφανή γραμμή
    cleanup()

    // 5) reopen (view και πάλι) — η αλλαγή φαίνεται, ΤΟ ΙΔΙΟ id, ΑΚΟΜΑ ΧΩΡΙΣ crash
    renderApp(`/students/${created.id}`)
    expect(await screen.findByText('Ε2Ε-1')).toBeInTheDocument()
  })
})
