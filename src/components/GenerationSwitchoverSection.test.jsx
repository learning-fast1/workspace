import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Ίδιο μοτίβο με LegacyDataMigrationSection.test.jsx: mockάρουμε useAuth() ΚΑΙ το
// migration/activeGeneration.js + migrationEngine.js contract απευθείας — το ίδιο activeGeneration
// engine είναι ήδη εξαντλητικά καλυμμένο στο δικό του test αρχείο, εδώ ελέγχεται μόνο η ΣΩΣΤΗ
// καλωδίωση του component πάνω σε αυτό το contract.
const mockUseAuth = vi.fn()
vi.mock('../auth/useAuth.js', () => ({ default: () => mockUseAuth() }))

const mockGetActiveGeneration = vi.fn()
const mockActivateV2Generation = vi.fn()
vi.mock('../migration/activeGeneration.js', () => ({
  getActiveGeneration: (...args) => mockGetActiveGeneration(...args),
  activateV2Generation: (...args) => mockActivateV2Generation(...args)
}))

const mockGetMigrationState = vi.fn()
vi.mock('../migration/migrationEngine.js', () => ({
  getMigrationState: (...args) => mockGetMigrationState(...args)
}))

import GenerationSwitchoverSection from './GenerationSwitchoverSection.jsx'

const USER_ID = 'user-alice-123'

function loggedIn(overrides = {}) {
  return { status: 'loggedIn', email: 'δασκάλα@example.com', userId: USER_ID, ...overrides }
}

beforeEach(() => {
  mockGetActiveGeneration.mockResolvedValue('legacy')
  mockGetMigrationState.mockResolvedValue({ status: 'not_started' })
  vi.stubGlobal('location', { ...window.location, reload: vi.fn() })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('GenerationSwitchoverSection', () => {
  it('δεν είναι συνδεδεμένος → δεν αποδίδει τίποτα, καμία κλήση', async () => {
    mockUseAuth.mockReturnValue({ status: 'loggedOut', email: null, userId: null })
    const { container } = render(<GenerationSwitchoverSection />)
    await new Promise((r) => setTimeout(r, 0))
    expect(container).toBeEmptyDOMElement()
    expect(mockGetActiveGeneration).not.toHaveBeenCalled()
  })

  it('συνδεδεμένος ΧΩΡΙΣ userId → δεν αποδίδει τίποτα, καμία κλήση (ίδιο fail-closed με LegacyDataMigrationSection)', async () => {
    mockUseAuth.mockReturnValue(loggedIn({ userId: null }))
    render(<GenerationSwitchoverSection />)
    await new Promise((r) => setTimeout(r, 0))
    expect(mockGetActiveGeneration).not.toHaveBeenCalled()
  })

  it('migration ΔΕΝ έχει ολοκληρωθεί → δεν αποδίδει τίποτα', async () => {
    mockUseAuth.mockReturnValue(loggedIn())
    mockGetMigrationState.mockResolvedValue({ status: 'in_progress' })
    const { container } = render(<GenerationSwitchoverSection />)
    await waitFor(() => expect(mockGetMigrationState).toHaveBeenCalled())
    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  it('migration complete, generation ακόμα legacy → κουμπί ενεργοποίησης', async () => {
    mockUseAuth.mockReturnValue(loggedIn())
    mockGetMigrationState.mockResolvedValue({ status: 'complete' })
    render(<GenerationSwitchoverSection />)
    expect(await screen.findByRole('button', { name: /Ενεργοποίηση νέας έκδοσης δεδομένων/ })).toBeInTheDocument()
  })

  it('κλικ → καλεί activateV2Generation(userId) ΚΑΙ ΜΕΤΑ reload', async () => {
    mockUseAuth.mockReturnValue(loggedIn())
    mockGetMigrationState.mockResolvedValue({ status: 'complete' })
    mockActivateV2Generation.mockResolvedValue({ generation: 'v2', userId: USER_ID, setAt: 'now' })
    const user = userEvent.setup()
    render(<GenerationSwitchoverSection />)

    const button = await screen.findByRole('button', { name: /Ενεργοποίηση/ })
    await user.click(button)

    await waitFor(() => expect(mockActivateV2Generation).toHaveBeenCalledWith(USER_ID))
    await waitFor(() => expect(window.location.reload).toHaveBeenCalledTimes(1))
  })

  it('διπλό κλικ ΠΡΙΝ ολοκληρωθεί η πρώτη κλήση → activateV2Generation καλείται ΜΙΑ μόνο φορά', async () => {
    mockUseAuth.mockReturnValue(loggedIn())
    mockGetMigrationState.mockResolvedValue({ status: 'complete' })
    let resolveActivate
    mockActivateV2Generation.mockReturnValue(new Promise((r) => { resolveActivate = r }))
    const user = userEvent.setup()
    render(<GenerationSwitchoverSection />)

    const button = await screen.findByRole('button', { name: /Ενεργοποίηση/ })
    await user.click(button)
    await user.click(button)
    resolveActivate({ generation: 'v2', userId: USER_ID, setAt: 'now' })

    await waitFor(() => expect(window.location.reload).toHaveBeenCalledTimes(1))
    expect(mockActivateV2Generation).toHaveBeenCalledTimes(1)
  })

  it('activateV2Generation πετάει (π.χ. race με άλλη συσκευή) → δείχνει το μήνυμα, ΔΕΝ κάνει reload', async () => {
    mockUseAuth.mockReturnValue(loggedIn())
    mockGetMigrationState.mockResolvedValue({ status: 'complete' })
    mockActivateV2Generation.mockRejectedValue(new Error('Κάτι πήγε στραβά.'))
    const user = userEvent.setup()
    render(<GenerationSwitchoverSection />)

    const button = await screen.findByRole('button', { name: /Ενεργοποίηση/ })
    await user.click(button)

    expect(await screen.findByText('Κάτι πήγε στραβά.')).toBeInTheDocument()
    expect(window.location.reload).not.toHaveBeenCalled()
  })

  it('generation ήδη "v2" → μήνυμα επιβεβαίωσης, ΚΑΝΕΝΑ κουμπί, ΚΑΜΙΑ κλήση getMigrationState', async () => {
    mockUseAuth.mockReturnValue(loggedIn())
    mockGetActiveGeneration.mockResolvedValue('v2')
    render(<GenerationSwitchoverSection />)

    expect(await screen.findByText(/είναι ενεργή σε αυτή τη συσκευή/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(mockGetMigrationState).not.toHaveBeenCalled()
  })
})
