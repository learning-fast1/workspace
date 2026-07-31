import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// Ξεχωριστό αρχείο (ΟΧΙ μέσα στο Header.test.jsx) — τα mocks του vi.mock είναι per-file στο
// Vitest, και το Header.test.jsx ήδη χρησιμοποιεί το ΠΡΑΓΜΑΤΙΚΟ Dexie/AuthProvider για τα δικά του
// tests (κουδούνι/fallback όνομα). Εδώ μοντελοποιούμε ΕΙΔΙΚΑ τη συνθήκη CLOUD_ENABLED &&
// authStatus==='loggedIn' (review χρήστη: «Αποσύνδεση» ΜΟΝΟ όταν υπάρχει πράγματι σύνδεση) — κάτι
// που δεν μπορεί να μεταβληθεί ανά test μέσα στο ίδιο αρχείο, αφού το CLOUD_ENABLED είναι
// build-time flag (.env.test.local), σταθερό για ολόκληρο το run.
const logout = vi.fn()

vi.mock('../../auth/useAuth.js', () => ({
  default: () => ({ status: 'loggedIn', email: 'olga@example.com', userId: 'u1', error: null, actions: { logout } })
}))

vi.mock('../../db.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, CLOUD_ENABLED: true }
})

vi.mock('./NotificationsProvider.jsx', () => ({
  useNotifications: () => ({ status: 'ok', visible: [] })
}))

import db from '../../db.js'
import Header from './Header.jsx'

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  cleanup()
  logout.mockClear()
  await Promise.all(db.tables.map((t) => t.clear()))
  db.close()
})

function renderHeader() {
  return render(
    <MemoryRouter>
      <Header onMenuClick={() => {}} />
    </MemoryRouter>
  )
}

describe('Header — user-menu όταν CLOUD_ENABLED && authStatus==="loggedIn"', () => {
  it('το menu δείχνει «Αποσύνδεση», και το κλικ καλεί actions.logout()', async () => {
    const user = userEvent.setup()
    renderHeader()

    const trigger = await screen.findByRole('button', { name: /Προφίλ —/ })
    await user.click(trigger)

    const logoutItem = screen.getByRole('menuitem', { name: 'Αποσύνδεση' })
    expect(logoutItem).toBeInTheDocument()

    await user.click(logoutItem)
    expect(logout).toHaveBeenCalledTimes(1)
  })
})
