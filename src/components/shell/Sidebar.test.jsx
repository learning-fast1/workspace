import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import db from '../../db.js'
import Sidebar from './Sidebar.jsx'

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  cleanup()
  await Promise.all(db.tables.map((t) => t.clear()))
  db.close()
})

function renderSidebar(initialEntry) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Sidebar open={false} onClose={() => {}} />
    </MemoryRouter>
  )
}

// Sprint 8 (Technical Design, Διόρθωση 4): το SidebarQuickSchedule («Σήμερα») κρύβεται ΜΟΝΟ στην
// πραγματική Αρχική («/») — εκεί το πλήρες «Η μέρα μου» είναι ήδη ορατό στο κύριο περιεχόμενο.
// useMatch('/') αντί για χειροκίνητη σύγκριση pathname, βλ. Sidebar.jsx.
describe('Sidebar — SidebarQuickSchedule κρύβεται μόνο στην Αρχική', () => {
  it('στο route "/" (Αρχική) → ΔΕΝ αποδίδεται το «Σήμερα»', async () => {
    renderSidebar('/')
    await waitFor(() => expect(screen.getByRole('link', { name: 'Ρυθμίσεις' })).toBeInTheDocument())
    expect(screen.queryByText('Σήμερα')).not.toBeInTheDocument()
    expect(screen.queryByText('Πλήρες πρόγραμμα')).not.toBeInTheDocument()
  })

  it('σε άλλο route (π.χ. "/students") → παραμένει ορατό το «Σήμερα»', async () => {
    renderSidebar('/students')
    await waitFor(() => expect(screen.getByText('Σήμερα')).toBeInTheDocument())
    expect(screen.getByText('Πλήρες πρόγραμμα')).toBeInTheDocument()
  })
})
