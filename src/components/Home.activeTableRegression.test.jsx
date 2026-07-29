import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import db from '../db.js'
import AuthProvider from '../auth/AuthProvider.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'
import Home from './Home.jsx'

const ERROR_BOUNDARY_TEXT = 'Κάτι πήγε στραβά. Δοκίμασε να επιστρέψεις στην αρχική.'

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  cleanup()
  await Promise.all(db.tables.map((t) => t.clear()))
  db.close()
})

// Regression for the production crash: findStaleGoals() used raw db.X with no db import.
describe('Home — findStaleGoals() πρέπει να διαβάζει μέσω activeTable(), ΟΧΙ raw db.X (production regression)', () => {
  it('αποδίδεται σε φρέσκια βάση χωρίς κανένα σφάλμα — θα έδειχνε το ErrorBoundary fallback αν findStaleGoals() ξαναχρησιμοποιούσε raw db.X χωρίς import', async () => {
    render(
      <ErrorBoundary>
        <MemoryRouter>
          <AuthProvider>
            <Home />
          </AuthProvider>
        </MemoryRouter>
      </ErrorBoundary>
    )

    await waitFor(() => expect(screen.getByText(/Καλημέρα/)).toBeInTheDocument())
    expect(screen.queryByText(ERROR_BOUNDARY_TEXT)).not.toBeInTheDocument()
  })
})
