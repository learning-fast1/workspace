import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
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
    <MemoryRouter>
      <AuthProvider>
        <NotificationsProvider>
          <Header onMenuClick={() => {}} />
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

describe('Header — user-menu (Teacher Profile + Settings)', () => {
  it('χωρίς displayName, χωρίς σύνδεση → fallback «Εκπαιδευτικός», link προς /settings', async () => {
    renderHeader()
    const link = await screen.findByRole('link', { name: 'Προφίλ — Εκπαιδευτικός' })
    expect(link).toHaveAttribute('href', '/settings')
    expect(screen.getByText('Εκπαιδευτικός')).toBeInTheDocument()
  })

  it('με αποθηκευμένο displayName πολλαπλών λέξεων → δείχνει ΜΟΝΟ το πρώτο όνομα', async () => {
    await db.userSettings.put({ key: 'displayName', value: 'Όλγα Παπαδοπούλου', updatedAt: '2026-01-01T00:00:00.000Z' })
    renderHeader()

    await screen.findByRole('link', { name: 'Προφίλ — Όλγα' })
    expect(screen.getByText('Όλγα')).toBeInTheDocument()
    expect(screen.queryByText('Παπαδοπούλου')).not.toBeInTheDocument()
  })
})
