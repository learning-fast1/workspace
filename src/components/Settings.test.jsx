import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import db from '../db.js'
import AuthProvider from '../auth/AuthProvider.jsx'
import Settings from './Settings.jsx'

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  cleanup()
  await Promise.all(db.tables.map((t) => t.clear()))
  db.close()
})

function renderSettings(initialEntries = [{ pathname: '/settings' }]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider>
        <Routes>
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  )
}

// Teacher Profile + Settings (UI Design v3, εγκεκριμένο) — smoke-level: AppShell/Header/BottomNav
// παρόντα (η σελίδα πλέον χρησιμοποιεί το κοινό κέλυφος, ΟΧΙ πια ξεχωριστό className="page"),
// Profile Card ορατή, tabs εναλλάσσονται, «Λογαριασμός & Sync» απόν όταν CLOUD_ENABLED=false (ίδιο
// σε αυτό το test env, βλ. .env.test.local).
describe('Settings — AppShell + tabs', () => {
  it('αποδίδεται μέσα στο κοινό AppShell (Header/BottomNav ορατά), ΟΧΙ πια ξεχωριστό top-bar', async () => {
    renderSettings()
    expect(await screen.findByRole('link', { name: /Ειδοποιήσεις/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Ρυθμίσεις' })).toBeInTheDocument()
  })

  it('δείχνει την Profile Card πάνω από τα tabs', async () => {
    const { container } = renderSettings()
    // «Εκπαιδευτικός» εμφανίζεται ΚΑΙ στο Header user-menu δίπλα — στοχεύουμε ρητά την κάρτα.
    await waitFor(() => expect(container.querySelector('.teacher-profile-card')).toHaveTextContent('Εκπαιδευτικός'))
  })

  it('προεπιλεγμένο tab είναι «Προφίλ εκπαιδευτικού»', async () => {
    renderSettings()
    expect(await screen.findByLabelText('Όνομα εμφάνισης')).toBeInTheDocument()
  })

  it('«Λογαριασμός & Sync» tab ΔΕΝ υπάρχει όταν CLOUD_ENABLED=false', async () => {
    renderSettings()
    await screen.findByLabelText('Όνομα εμφάνισης')
    expect(screen.queryByRole('tab', { name: 'Λογαριασμός & Sync' })).not.toBeInTheDocument()
  })

  it('κλικ στο tab «Backup & Αποθήκευση» δείχνει την ενότητα backup/restore', async () => {
    const user = userEvent.setup()
    renderSettings()

    await user.click(await screen.findByRole('tab', { name: 'Backup & Αποθήκευση' }))
    expect(await screen.findByText('Αντίγραφο ασφαλείας')).toBeInTheDocument()
    expect(screen.getByText('Ασφάλεια αποθήκευσης')).toBeInTheDocument()
  })

  it('κλικ στο tab «Σχολικό έτος» δείχνει το υπάρχον περιεχόμενο σχολικού έτους', async () => {
    const user = userEvent.setup()
    renderSettings()

    await user.click(await screen.findByRole('tab', { name: 'Σχολικό έτος' }))
    await waitFor(() => expect(screen.getByRole('tabpanel', { name: 'Σχολικό έτος' })).not.toHaveAttribute('hidden'))
  })

  it('κλικ στο tab «Εφαρμογή» δείχνει την πραγματική έκδοση', async () => {
    const user = userEvent.setup()
    renderSettings()

    await user.click(await screen.findByRole('tab', { name: 'Εφαρμογή' }))
    expect(await screen.findByText(/Έκδοση/)).toBeInTheDocument()
  })

  it('deep-link μέσω location.state.activeTab προσγειώνει κατευθείαν στο σωστό tab (π.χ. backup reminder banner)', async () => {
    renderSettings([{ pathname: '/settings', state: { activeTab: 'backup' } }])
    expect(await screen.findByText('Αντίγραφο ασφαλείας')).toBeInTheDocument()
  })
})
