import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Ίδιο μοτίβο με GenerationSwitchoverSection.test.jsx: mockάρουμε useAuth() ΚΑΙ το
// migration/syncAuthorization.js contract απευθείας — το ίδιο contract είναι ήδη εξαντλητικά
// καλυμμένο στο δικό του test αρχείο, εδώ ελέγχεται μόνο η ΣΩΣΤΗ καλωδίωση του component πάνω του.
const mockUseAuth = vi.fn()
vi.mock('../auth/useAuth.js', () => ({ default: () => mockUseAuth() }))

const mockCheckSyncPrerequisites = vi.fn()
const mockActivateSyncForCurrentUser = vi.fn()
const mockIsSessionSyncActive = vi.fn()
vi.mock('../migration/syncAuthorization.js', () => ({
  checkSyncPrerequisites: (...args) => mockCheckSyncPrerequisites(...args),
  activateSyncForCurrentUser: (...args) => mockActivateSyncForCurrentUser(...args),
  isSessionSyncActive: (...args) => mockIsSessionSyncActive(...args)
}))

import EnableSyncSection from './EnableSyncSection.jsx'

const USER_ID = 'user-alice-123'

function loggedIn(overrides = {}) {
  return { status: 'loggedIn', email: 'δασκάλα@example.com', userId: USER_ID, ...overrides }
}

beforeEach(() => {
  mockCheckSyncPrerequisites.mockResolvedValue({ ok: false, reason: 'GENERATION_NOT_V2' })
  mockIsSessionSyncActive.mockReturnValue(false)
  vi.stubGlobal('location', { ...window.location, reload: vi.fn() })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('EnableSyncSection', () => {
  it('δεν είναι συνδεδεμένος → δεν αποδίδει τίποτα, καμία κλήση', async () => {
    mockUseAuth.mockReturnValue({ status: 'loggedOut', email: null, userId: null })
    const { container } = render(<EnableSyncSection />)
    await new Promise((r) => setTimeout(r, 0))
    expect(container).toBeEmptyDOMElement()
    expect(mockCheckSyncPrerequisites).not.toHaveBeenCalled()
  })

  it('συνδεδεμένος ΧΩΡΙΣ userId → δεν αποδίδει τίποτα, καμία κλήση', async () => {
    mockUseAuth.mockReturnValue(loggedIn({ userId: null }))
    render(<EnableSyncSection />)
    await new Promise((r) => setTimeout(r, 0))
    expect(mockCheckSyncPrerequisites).not.toHaveBeenCalled()
  })

  it('οι προϋποθέσεις δεν ισχύουν → δεν αποδίδει τίποτα', async () => {
    mockUseAuth.mockReturnValue(loggedIn())
    mockCheckSyncPrerequisites.mockResolvedValue({ ok: false, reason: 'MIGRATION_INCOMPLETE' })
    const { container } = render(<EnableSyncSection />)
    await waitFor(() => expect(mockCheckSyncPrerequisites).toHaveBeenCalledWith(USER_ID))
    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  it('προϋποθέσεις ok, session συγχρονισμού ανενεργό → κουμπί ενεργοποίησης, ενημέρωση cloud ΚΑΙ checkbox εξουσιοδότησης', async () => {
    mockUseAuth.mockReturnValue(loggedIn())
    mockCheckSyncPrerequisites.mockResolvedValue({ ok: true, reason: null })
    render(<EnableSyncSection />)
    expect(await screen.findByRole('button', { name: /Ενεργοποίηση συγχρονισμού/ })).toBeInTheDocument()
    expect(screen.getByText(/θα μεταφέρει τα δεδομένα μαθητών/)).toBeInTheDocument()
    expect(screen.getByText(/πολιτική του σχολείου ή του οργανισμού/)).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Επιβεβαιώνω ότι έχω την απαραίτητη εξουσιοδότηση/ })).toBeInTheDocument()
  })

  it('cloud sync gate: το κουμπί είναι disabled μέχρι να επιλεγεί το checkbox εξουσιοδότησης', async () => {
    mockUseAuth.mockReturnValue(loggedIn())
    mockCheckSyncPrerequisites.mockResolvedValue({ ok: true, reason: null })
    const user = userEvent.setup()
    render(<EnableSyncSection />)

    const button = await screen.findByRole('button', { name: /Ενεργοποίηση συγχρονισμού/ })
    const checkbox = screen.getByRole('checkbox', { name: /Επιβεβαιώνω/ })
    expect(button).toBeDisabled()

    await user.click(checkbox)
    expect(button).not.toBeDisabled()
  })

  it('cloud sync gate: κλικ στο (disabled) κουμπί χωρίς checkbox ΔΕΝ καλεί το activation API', async () => {
    mockUseAuth.mockReturnValue(loggedIn())
    mockCheckSyncPrerequisites.mockResolvedValue({ ok: true, reason: null })
    const user = userEvent.setup()
    render(<EnableSyncSection />)

    const button = await screen.findByRole('button', { name: /Ενεργοποίηση συγχρονισμού/ })
    await user.click(button)

    expect(mockActivateSyncForCurrentUser).not.toHaveBeenCalled()
  })

  it('προϋποθέσεις ok, session συγχρονισμού ΗΔΗ ενεργό → μήνυμα επιβεβαίωσης, ΚΑΝΕΝΑ κουμπί', async () => {
    mockUseAuth.mockReturnValue(loggedIn())
    mockCheckSyncPrerequisites.mockResolvedValue({ ok: true, reason: null })
    mockIsSessionSyncActive.mockReturnValue(true)
    render(<EnableSyncSection />)
    expect(await screen.findByText(/Ο συγχρονισμός είναι ενεργός/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('κλικ (μετά από επιβεβαίωση) → καλεί activateSyncForCurrentUser ΚΑΙ ΜΕΤΑ reload', async () => {
    mockUseAuth.mockReturnValue(loggedIn())
    mockCheckSyncPrerequisites.mockResolvedValue({ ok: true, reason: null })
    mockActivateSyncForCurrentUser.mockResolvedValue({ userId: USER_ID })
    const user = userEvent.setup()
    render(<EnableSyncSection />)

    const button = await screen.findByRole('button', { name: /Ενεργοποίηση/ })
    await user.click(screen.getByRole('checkbox', { name: /Επιβεβαιώνω/ }))
    await user.click(button)

    await waitFor(() => expect(mockActivateSyncForCurrentUser).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(window.location.reload).toHaveBeenCalledTimes(1))
  })

  it('διπλό κλικ ΠΡΙΝ ολοκληρωθεί η πρώτη κλήση → activateSyncForCurrentUser καλείται ΜΙΑ μόνο φορά', async () => {
    mockUseAuth.mockReturnValue(loggedIn())
    mockCheckSyncPrerequisites.mockResolvedValue({ ok: true, reason: null })
    let resolveActivate
    mockActivateSyncForCurrentUser.mockReturnValue(new Promise((r) => { resolveActivate = r }))
    const user = userEvent.setup()
    render(<EnableSyncSection />)

    const button = await screen.findByRole('button', { name: /Ενεργοποίηση/ })
    await user.click(screen.getByRole('checkbox', { name: /Επιβεβαιώνω/ }))
    await user.click(button)
    await user.click(button)
    resolveActivate({ userId: USER_ID })

    await waitFor(() => expect(window.location.reload).toHaveBeenCalledTimes(1))
    expect(mockActivateSyncForCurrentUser).toHaveBeenCalledTimes(1)
  })

  it('activateSyncForCurrentUser πετάει → δείχνει το μήνυμα, ΔΕΝ κάνει reload, ΚΑΙ το checkbox επιβεβαίωσης επανέρχεται σε μη επιλεγμένη κατάσταση', async () => {
    mockUseAuth.mockReturnValue(loggedIn())
    mockCheckSyncPrerequisites.mockResolvedValue({ ok: true, reason: null })
    mockActivateSyncForCurrentUser.mockRejectedValue(new Error('Δεν πληρούνται οι προϋποθέσεις συγχρονισμού.'))
    const user = userEvent.setup()
    render(<EnableSyncSection />)

    const button = await screen.findByRole('button', { name: /Ενεργοποίηση/ })
    const checkbox = screen.getByRole('checkbox', { name: /Επιβεβαιώνω/ })
    await user.click(checkbox)
    await user.click(button)

    expect(await screen.findByText('Δεν πληρούνται οι προϋποθέσεις συγχρονισμού.')).toBeInTheDocument()
    expect(window.location.reload).not.toHaveBeenCalled()
    expect(checkbox).not.toBeChecked()
    expect(button).toBeDisabled()
  })
})
