import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import db, { dismissNotification } from '../../db.js'
import { todayLocalISO, addDays } from '../../utils/date.js'
import AuthProvider from '../../auth/AuthProvider.jsx'
import { NotificationsProvider } from './NotificationsProvider.jsx'
import Header from './Header.jsx'

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  cleanup()
  await Promise.all(db.tables.map((t) => t.clear()))
  db.close()
})

// Header χρησιμοποιεί πλέον useAuth() για το user-menu (Teacher Profile + Settings, review χρήστη)
// — το πραγματικό AuthProvider αρκεί (CLOUD_ENABLED=false στο test env, βλ. .env.test.local·
// επιστρέφει συγχρονικά το static DISABLED_VALUE, καμία πραγματική κλήση δικτύου/db.cloud).
function renderHeader() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <AuthProvider>
        <NotificationsProvider>
          <Routes>
            <Route path="/" element={<Header onMenuClick={() => {}} />} />
            <Route path="/settings" element={<p>Σελίδα Ρυθμίσεων</p>} />
          </Routes>
        </NotificationsProvider>
      </AuthProvider>
    </MemoryRouter>
  )
}

describe('Header — κουδούνι ειδοποιήσεων (Notifications Inbox)', () => {
  it('χωρίς καμία ειδοποίηση → κουδούνι ορατό, ΧΩΡΙΣ badge', async () => {
    renderHeader()
    const bell = await screen.findByRole('link', { name: 'Ειδοποιήσεις' })
    expect(bell).toHaveAttribute('href', '/notifications')
    await waitFor(() => expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument())
  })

  it('με 2 ορατές ειδοποιήσεις → badge δείχνει «2», ίδιο αριθμό με aria-label', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    await db.goals.add({ studentId, domain: 'communication', title: 'Στόχος Α', status: 'active', priority: 'high', startDate: '2020-01-01' })
    await db.dailyQueue.add({ date: addDays(todayLocalISO(), -3), studentIds: [studentId], order: 0, status: 'pending' })

    renderHeader()

    const bell = await screen.findByRole('link', { name: /Ειδοποιήσεις \(2\)/ })
    expect(bell).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('dismiss μιας εκ των δύο → το badge ενημερώνεται αυτόματα σε «1» (κοινός provider)', async () => {
    const studentId = await db.students.add({ code: 'Μ2', active: true })
    const goalId = await db.goals.add({ studentId, domain: 'communication', title: 'Στόχος Β', status: 'active', priority: 'high', startDate: '2020-01-01' })
    await db.dailyQueue.add({ date: addDays(todayLocalISO(), -3), studentIds: [studentId], order: 0, status: 'pending' })

    renderHeader()
    await screen.findByRole('link', { name: /Ειδοποιήσεις \(2\)/ })

    await dismissNotification(`goalStale:${goalId}:2020-01-01`, { type: 'goalStale', studentId, entityType: 'goal', entityId: goalId })

    await waitFor(async () => {
      expect(await screen.findByRole('link', { name: /Ειδοποιήσεις \(1\)/ })).toBeInTheDocument()
    })
  })
})

// User menu (review χρήστη — «πραγματικό dropdown, όχι απευθείας link»): πλέον OverflowMenu
// (γενικευμένο trigger), ΟΧΙ πια <Link> κατευθείαν στο /settings. «Αποσύνδεση» εμφανίζεται ΜΟΝΟ
// όταν CLOUD_ENABLED && authStatus==='loggedIn' — στο test env CLOUD_ENABLED=false, άρα ΠΟΤΕ
// ορατό εδώ (καλύπτεται ξεχωριστά σε επίπεδο πηγαίου κώδικα, όχι εδώ, αφού απαιτεί CLOUD_ENABLED
// build-time flag που δεν αλλάζει ανά test).
describe('Header — user-menu (πραγματικό dropdown)', () => {
  it('κλειστό αρχικά, ΔΕΝ πλοηγεί απευθείας κατά το render — fallback «Εκπαιδευτικός»', async () => {
    renderHeader()
    const trigger = await screen.findByRole('button', { name: 'Προφίλ — Εκπαιδευτικός' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'true')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Εκπαιδευτικός')).toBeInTheDocument()
    expect(screen.queryByText('Σελίδα Ρυθμίσεων')).not.toBeInTheDocument()
  })

  it('με αποθηκευμένο displayName πολλαπλών λέξεων → δείχνει ΜΟΝΟ το πρώτο όνομα', async () => {
    await db.userSettings.put({ key: 'displayName', value: 'Όλγα Παπαδοπούλου', updatedAt: '2026-01-01T00:00:00.000Z' })
    renderHeader()

    await screen.findByRole('button', { name: 'Προφίλ — Όλγα' })
    expect(screen.getByText('Όλγα')).toBeInTheDocument()
    expect(screen.queryByText('Παπαδοπούλου')).not.toBeInTheDocument()
  })

  it('click ανοίγει το menu με ΜΟΝΟ «Ρυθμίσεις» (χωρίς ξεχωριστό «Το προφίλ μου» — ίδιος προορισμός)', async () => {
    const user = userEvent.setup()
    renderHeader()

    const trigger = await screen.findByRole('button', { name: 'Προφίλ — Εκπαιδευτικός' })
    await user.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menuitem', { name: 'Ρυθμίσεις' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /προφίλ μου/i })).not.toBeInTheDocument()
    // CLOUD_ENABLED=false στο test env → καμία σύνδεση να τερματιστεί, άρα καμία «Αποσύνδεση».
    expect(screen.queryByRole('menuitem', { name: 'Αποσύνδεση' })).not.toBeInTheDocument()
  })

  it('«Ρυθμίσεις» πλοηγεί πραγματικά στο /settings', async () => {
    const user = userEvent.setup()
    renderHeader()

    await user.click(await screen.findByRole('button', { name: 'Προφίλ — Εκπαιδευτικός' }))
    await user.click(screen.getByRole('menuitem', { name: 'Ρυθμίσεις' }))

    expect(await screen.findByText('Σελίδα Ρυθμίσεων')).toBeInTheDocument()
  })

  it('Escape κλείνει το menu, click εκτός κλείνει το menu', async () => {
    const user = userEvent.setup()
    renderHeader()

    const trigger = await screen.findByRole('button', { name: 'Προφίλ — Εκπαιδευτικός' })
    await user.click(trigger)
    expect(screen.getByRole('menu')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})
