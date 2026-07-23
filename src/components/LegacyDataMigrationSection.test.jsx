import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../db.js'

// Ίδιο μοτίβο με AccountSection.test.jsx: mockάρουμε το useAuth() contract απευθείας. Επιπλέον
// mockάρουμε ΜΟΝΟ claimLegacyDataOwnership/runMigration (οι δύο ενέργειες που πραγματικά καλεί το
// component) — ΟΧΙ getLegacyDataOwner/getMigrationState, ώστε το useLiveQuery να δουλεύει πάνω σε
// σχήμα ελεγχόμενο απευθείας από το test, χωρίς να χρειάζεται να περάσει από πραγματικό db.cloud
// (ανύπαρκτο σε αυτό το test environment, CLOUD_ENABLED=false) για claim/migrate. Το ΙΔΙΟ
// migrationEngine/legacyOwnership contract είναι ήδη εξαντλητικά καλυμμένο στα δικά τους test
// αρχεία — εδώ ελέγχεται μόνο η ΣΩΣΤΗ ΚΑΛΩΔΙΩΣΗ του component πάνω σε αυτό το contract.
const mockUseAuth = vi.fn()
vi.mock('../auth/useAuth.js', () => ({ default: () => mockUseAuth() }))

const mockGetLegacyDataOwner = vi.fn()
const mockClaimLegacyDataOwnership = vi.fn()
vi.mock('../migration/legacyOwnership.js', () => ({
  getLegacyDataOwner: (...args) => mockGetLegacyDataOwner(...args),
  claimLegacyDataOwnership: (...args) => mockClaimLegacyDataOwnership(...args)
}))

const mockGetMigrationState = vi.fn()
const mockRunMigration = vi.fn()
vi.mock('../migration/migrationEngine.js', () => ({
  getMigrationState: (...args) => mockGetMigrationState(...args),
  runMigration: (...args) => mockRunMigration(...args)
}))

import LegacyDataMigrationSection from './LegacyDataMigrationSection.jsx'

const USER_ID = 'user-alice-123'
const EMAIL = 'δασκάλα@example.com'

function loggedIn(overrides = {}) {
  return { status: 'loggedIn', email: EMAIL, userId: USER_ID, ...overrides }
}

async function addLegacyRow() {
  await db.students.add({ code: 'Μ1', active: true })
}

beforeEach(async () => {
  await db.open()
  mockGetLegacyDataOwner.mockResolvedValue(null)
  mockGetMigrationState.mockResolvedValue(null)
})

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  db.close()
  cleanup()
  vi.clearAllMocks()
})

describe('LegacyDataMigrationSection', () => {
  it('status "loggedOut" → δεν αποδίδει τίποτα, ΚΑΜΙΑ κλήση σε getLegacyDataOwner', async () => {
    mockUseAuth.mockReturnValue({ status: 'loggedOut', email: null, userId: null })
    const { container } = render(<LegacyDataMigrationSection />)
    await new Promise((r) => setTimeout(r, 0))
    expect(container).toBeEmptyDOMElement()
    expect(mockGetLegacyDataOwner).not.toHaveBeenCalled()
  })

  it('loggedIn ΧΩΡΙΣ userId (null) → safe error state, ΚΑΜΙΑ κλήση owner/migration, ΚΑΝΕΝΑ κουμπί επιβεβαίωσης', async () => {
    mockUseAuth.mockReturnValue(loggedIn({ userId: null }))
    await addLegacyRow()
    render(<LegacyDataMigrationSection />)

    expect(await screen.findByText(/Δεν ήταν δυνατή η επιβεβαίωση/)).toBeInTheDocument()
    expect(mockGetLegacyDataOwner).not.toHaveBeenCalled()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('loggedIn ΜΕ userId κενό string → ίδιο fail-closed safe state με null', async () => {
    mockUseAuth.mockReturnValue(loggedIn({ userId: '   ' }))
    render(<LegacyDataMigrationSection />)
    expect(await screen.findByText(/Δεν ήταν δυνατή η επιβεβαίωση/)).toBeInTheDocument()
    expect(mockGetLegacyDataOwner).not.toHaveBeenCalled()
  })

  it('έγκυρο userId, ΚΑΝΕΝΑ τοπικό δεδομένο σε κανέναν από τους 16 πίνακες → δεν αποδίδει τίποτα', async () => {
    mockUseAuth.mockReturnValue(loggedIn())
    const { container } = render(<LegacyDataMigrationSection />)
    await waitFor(() => expect(mockGetLegacyDataOwner).toHaveBeenCalled())
    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  it('υπάρχουν τοπικά δεδομένα, owner===null → prompt με το email, ρητή διατύπωση, τα 4 σαφή σημεία', async () => {
    mockUseAuth.mockReturnValue(loggedIn())
    await addLegacyRow()
    render(<LegacyDataMigrationSection />)

    expect(await screen.findByText(new RegExp(EMAIL))).toBeInTheDocument()
    expect(screen.getByRole('button', {
      name: /Επιβεβαιώνω ότι τα τοπικά δεδομένα είναι δικά μου και ξεκινώ τη μεταφορά/
    })).toBeInTheDocument()
    expect(screen.getByText(/μόνιμη για αυτά τα τοπικά δεδομένα/)).toBeInTheDocument()
    expect(screen.getByText(/κανένας άλλος λογαριασμός δεν θα μπορεί να τα\s*διεκδικήσει/)).toBeInTheDocument()
    expect(screen.getByText(/δεν διαγράφονται/)).toBeInTheDocument()
    expect(screen.getByText(/συνεχίσεις να\s*χρησιμοποιείς την εφαρμογή κανονικά, τοπικά/)).toBeInTheDocument()
  })

  it('κλικ στο κουμπί επιβεβαίωσης → καλεί claimLegacyDataOwnership(userId) ΚΑΙ ΜΕΤΑ runMigration()', async () => {
    mockUseAuth.mockReturnValue(loggedIn())
    await addLegacyRow()
    mockClaimLegacyDataOwnership.mockResolvedValue({ userId: USER_ID, claimedAt: 'now' })
    mockRunMigration.mockResolvedValue({ status: 'in_progress' })
    const user = userEvent.setup()
    render(<LegacyDataMigrationSection />)

    const button = await screen.findByRole('button', { name: /Επιβεβαιώνω ότι/ })
    await user.click(button)

    await waitFor(() => expect(mockRunMigration).toHaveBeenCalledTimes(1))
    expect(mockClaimLegacyDataOwnership).toHaveBeenCalledWith(USER_ID)
    const claimOrder = mockClaimLegacyDataOwnership.mock.invocationCallOrder[0]
    const migrateOrder = mockRunMigration.mock.invocationCallOrder[0]
    expect(claimOrder).toBeLessThan(migrateOrder)
  })

  it('διπλό/γρήγορο κλικ ΠΡΙΝ ολοκληρωθεί η πρώτη κλήση → claim/runMigration καλούνται ΜΙΑ μόνο φορά το καθένα', async () => {
    mockUseAuth.mockReturnValue(loggedIn())
    await addLegacyRow()
    let resolveClaim
    mockClaimLegacyDataOwnership.mockReturnValue(new Promise((r) => { resolveClaim = r }))
    mockRunMigration.mockResolvedValue({ status: 'in_progress' })
    const user = userEvent.setup()
    render(<LegacyDataMigrationSection />)

    const button = await screen.findByRole('button', { name: /Επιβεβαιώνω ότι/ })
    // Δύο γρήγορα κλικ πριν προλάβει να λυθεί η πρώτη claim promise — το δεύτερο ΠΡΕΠΕΙ να
    // μπλοκαριστεί από τον runGuardRef, ΟΧΙ μόνο από το οπτικό Button.loading (βλ. review).
    await user.click(button)
    await user.click(button)
    resolveClaim({ userId: USER_ID, claimedAt: 'now' })

    await waitFor(() => expect(mockRunMigration).toHaveBeenCalledTimes(1))
    expect(mockClaimLegacyDataOwnership).toHaveBeenCalledTimes(1)
  })

  it('owner ανήκει σε ΔΙΑΦΟΡΕΤΙΚΟ χρήστη → μπλοκάρει, ΚΑΜΙΑ ενέργεια, ΚΑΝΕΝΑ κουμπί', async () => {
    mockUseAuth.mockReturnValue(loggedIn())
    await addLegacyRow()
    mockGetLegacyDataOwner.mockResolvedValue({ userId: 'someone-else', claimedAt: 'πριν' })
    render(<LegacyDataMigrationSection />)

    expect(await screen.findByText(/διαφορετικό λογαριασμό/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('owner === τρέχων χρήστης, migrationState=null (not_started) → κουμπί «Έναρξη μεταφοράς»', async () => {
    mockUseAuth.mockReturnValue(loggedIn())
    await addLegacyRow()
    mockGetLegacyDataOwner.mockResolvedValue({ userId: USER_ID, claimedAt: 'πριν' })
    render(<LegacyDataMigrationSection />)

    expect(await screen.findByRole('button', { name: /Έναρξη μεταφοράς/ })).toBeInTheDocument()
  })

  it('migrationState.status="in_progress" (διακοπή/resume) → κουμπί «Συνέχεια μεταφοράς»', async () => {
    mockUseAuth.mockReturnValue(loggedIn())
    await addLegacyRow()
    mockGetLegacyDataOwner.mockResolvedValue({ userId: USER_ID, claimedAt: 'πριν' })
    mockGetMigrationState.mockResolvedValue({ status: 'in_progress' })
    render(<LegacyDataMigrationSection />)

    expect(await screen.findByRole('button', { name: /Συνέχεια μεταφοράς/ })).toBeInTheDocument()
    expect(screen.getByText(/διακόπηκε πριν ολοκληρωθεί/)).toBeInTheDocument()
  })

  it('migrationState.status="failed" ΜΕ lastError → δείχνει το μήνυμα, κουμπί «Δοκίμασε ξανά»', async () => {
    mockUseAuth.mockReturnValue(loggedIn())
    await addLegacyRow()
    mockGetLegacyDataOwner.mockResolvedValue({ userId: USER_ID, claimedAt: 'πριν' })
    mockGetMigrationState.mockResolvedValue({
      status: 'failed',
      lastError: { table: null, message: 'Verification απέτυχε (1 πρόβλημα/τα).', at: 'now' }
    })
    render(<LegacyDataMigrationSection />)

    expect(await screen.findByText('Verification απέτυχε (1 πρόβλημα/τα).')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Δοκίμασε ξανά/ })).toBeInTheDocument()
  })

  it('migrationState.status="complete" → μήνυμα επιτυχίας, ΚΑΝΕΝΑ κουμπί', async () => {
    mockUseAuth.mockReturnValue(loggedIn())
    await addLegacyRow()
    mockGetLegacyDataOwner.mockResolvedValue({ userId: USER_ID, claimedAt: 'πριν' })
    mockGetMigrationState.mockResolvedValue({ status: 'complete' })
    render(<LegacyDataMigrationSection />)

    expect(await screen.findByText(/ολοκληρώθηκε/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
