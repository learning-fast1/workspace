import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import db from '../db.js'

// Ίδιο μοτίβο με AccountSection.test.jsx/EnableSyncSection.test.jsx — mockάρουμε useAuth() και το
// migration/syncAuthorization.js contract απευθείας, ήδη εξαντλητικά καλυμμένα στα δικά τους test
// αρχεία. CLOUD_ENABLED=false στο test env (.env.test.local) καθιστά αδύνατο ένα πραγματικό
// status:'loggedIn' μέσω του πραγματικού AuthProvider — γι' αυτό η κάρτα διαβάζει το status μόνο
// μέσω useAuth(), ΠΟΤΕ ξεχωριστό CLOUD_ENABLED import (βλ. σχόλιο στο ίδιο το component).
const mockUseAuth = vi.fn()
vi.mock('../auth/useAuth.js', () => ({ default: () => mockUseAuth() }))

const mockIsSessionSyncActive = vi.fn()
vi.mock('../migration/syncAuthorization.js', () => ({
  isSessionSyncActive: (...args) => mockIsSessionSyncActive(...args)
}))

import TeacherProfileCard from './TeacherProfileCard.jsx'

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  cleanup()
  await Promise.all(db.tables.map((t) => t.clear()))
  db.close()
  vi.clearAllMocks()
})

describe('TeacherProfileCard', () => {
  it('CLOUD_ENABLED=false (status "disabled") → μόνο avatar+όνομα, κανένα badge', async () => {
    mockUseAuth.mockReturnValue({ status: 'disabled', email: null })
    render(<TeacherProfileCard />)

    expect(await screen.findByText('Εκπαιδευτικός')).toBeInTheDocument()
    expect(screen.queryByText('Τοπική χρήση')).not.toBeInTheDocument()
    expect(screen.queryByText('Συνδεδεμένη')).not.toBeInTheDocument()
  })

  it('χωρίς αποθηκευμένο displayName → fallback «Εκπαιδευτικός», γενικό εικονίδιο αντί για αρχικό', async () => {
    mockUseAuth.mockReturnValue({ status: 'loggedOut', email: null })
    const { container } = render(<TeacherProfileCard />)

    await screen.findByText('Εκπαιδευτικός')
    expect(container.querySelector('.teacher-profile-card__avatar--empty')).toBeInTheDocument()
  })

  it('cloud ενεργό, μη συνδεδεμένη → badge «Τοπική χρήση», ΚΑΝΕΝΑ email', async () => {
    await db.userSettings.put({ key: 'displayName', value: 'Όλγα', updatedAt: '2026-01-01T00:00:00.000Z' })
    mockUseAuth.mockReturnValue({ status: 'loggedOut', email: null })
    render(<TeacherProfileCard />)

    expect(await screen.findByText('Όλγα')).toBeInTheDocument()
    expect(screen.getByText('Τοπική χρήση')).toBeInTheDocument()
    expect(screen.queryByText(/@/)).not.toBeInTheDocument()
  })

  it('συνδεδεμένη, sync ανενεργό → email ορατό, «Συνδεδεμένη» + «Sync ανενεργό»', async () => {
    await db.userSettings.put({ key: 'displayName', value: 'Όλγα Παπαδοπούλου', updatedAt: '2026-01-01T00:00:00.000Z' })
    mockUseAuth.mockReturnValue({ status: 'loggedIn', email: 'olga@example.gr' })
    mockIsSessionSyncActive.mockReturnValue(false)
    render(<TeacherProfileCard />)

    await screen.findByText('Όλγα Παπαδοπούλου')
    expect(screen.getByText('olga@example.gr')).toBeInTheDocument()
    expect(screen.getByText('Συνδεδεμένη')).toBeInTheDocument()
    expect(screen.getByText('Sync ανενεργό')).toBeInTheDocument()
  })

  it('συνδεδεμένη, sync ενεργό → «Sync ενεργό»', async () => {
    mockUseAuth.mockReturnValue({ status: 'loggedIn', email: 'olga@example.gr' })
    mockIsSessionSyncActive.mockReturnValue(true)
    render(<TeacherProfileCard />)

    expect(await screen.findByText('Sync ενεργό')).toBeInTheDocument()
  })
})
