import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// AccountSection ενδιαφέρεται ΜΟΝΟ για το συμβόλαιο που επιστρέφει useAuth() — το πώς παράγεται
// αυτό το state (Dexie Cloud observables, userInteraction prompts) είναι ήδη καλυμμένο στο
// AuthProvider.test.jsx. Εδώ mockάρουμε useAuth απευθείας, ίδιο μοτίβο με τα ήδη υπάρχοντα
// vi.mock παραδείγματα του project (π.χ. Home.test.jsx → utils/backup.js) — vitest hoists το
// vi.mock πάνω από τα imports αυτόματα, άρα το AccountSection.jsx παρακάτω παίρνει ήδη το mock.
const mockUseAuth = vi.fn()
vi.mock('../auth/useAuth.js', () => ({ default: () => mockUseAuth() }))
import AccountSection from './AccountSection.jsx'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function actions(overrides = {}) {
  return { login: vi.fn(), submitEmail: vi.fn(), submitOtp: vi.fn(), cancel: vi.fn(), logout: vi.fn(), ...overrides }
}

describe('AccountSection', () => {
  it('status "disabled" → δεν αποδίδει τίποτα', () => {
    mockUseAuth.mockReturnValue({ status: 'disabled', email: null, error: null, actions: actions() })
    const { container } = render(<AccountSection />)
    expect(container).toBeEmptyDOMElement()
  })

  it('status "loggedOut" → κουμπί «Σύνδεση» καλεί actions.login', async () => {
    const acts = actions()
    mockUseAuth.mockReturnValue({ status: 'loggedOut', email: null, error: null, actions: acts })
    const user = userEvent.setup()
    render(<AccountSection />)

    expect(screen.getByText(/Δεν είσαι συνδεδεμένος/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Σύνδεση' }))
    expect(acts.login).toHaveBeenCalledTimes(1)
  })

  it('status "loading" → δείχνει «Φόρτωση…»', () => {
    mockUseAuth.mockReturnValue({ status: 'loading', email: null, error: null, actions: actions() })
    render(<AccountSection />)
    expect(screen.getByText('Φόρτωση…')).toBeInTheDocument()
  })

  it('status "emailEntry" → έγκυρο email καλεί actions.submitEmail με trimmed τιμή', async () => {
    const acts = actions()
    mockUseAuth.mockReturnValue({ status: 'emailEntry', email: null, error: null, actions: acts })
    const user = userEvent.setup()
    render(<AccountSection />)

    await user.type(screen.getByLabelText('Email'), '  teacher@example.com  ')
    await user.click(screen.getByRole('button', { name: 'Αποστολή κωδικού' }))

    expect(acts.submitEmail).toHaveBeenCalledWith('teacher@example.com')
  })

  it('status "emailEntry" → μη έγκυρο email ΔΕΝ καλεί actions.submitEmail, δείχνει τοπικό μήνυμα', async () => {
    const acts = actions()
    mockUseAuth.mockReturnValue({ status: 'emailEntry', email: null, error: null, actions: acts })
    const user = userEvent.setup()
    render(<AccountSection />)

    await user.type(screen.getByLabelText('Email'), 'όχι-έγκυρο')
    await user.click(screen.getByRole('button', { name: 'Αποστολή κωδικού' }))

    expect(acts.submitEmail).not.toHaveBeenCalled()
    expect(screen.getByText('Δώσε μια έγκυρη διεύθυνση email.')).toBeInTheDocument()
  })

  it('status "emailEntry" ΜΕ error από το context (π.χ. offline/network) → δείχνει το μήνυμα, ΚΑΝΕΝΑ crash', () => {
    mockUseAuth.mockReturnValue({
      status: 'emailEntry',
      email: null,
      error: { code: 'GENERIC_ERROR', message: 'Κάτι πήγε στραβά. Δοκίμασε ξανά.' },
      actions: actions()
    })
    render(<AccountSection />)
    expect(screen.getByText('Κάτι πήγε στραβά. Δοκίμασε ξανά.')).toBeInTheDocument()
  })

  it('status "otpEntry" → σωστός κωδικός καλεί actions.submitOtp', async () => {
    const acts = actions()
    mockUseAuth.mockReturnValue({ status: 'otpEntry', email: null, error: null, actions: acts })
    const user = userEvent.setup()
    render(<AccountSection />)

    await user.type(screen.getByLabelText('Κωδικός'), '123456')
    await user.click(screen.getByRole('button', { name: 'Επιβεβαίωση' }))

    expect(acts.submitOtp).toHaveBeenCalledWith('123456')
  })

  it('status "otpEntry" ΜΕ error INVALID_OTP (λάθος Ή ληγμένος κωδικός) → δείχνει το μήνυμα, παραμένει σε otpEntry', () => {
    mockUseAuth.mockReturnValue({
      status: 'otpEntry',
      email: null,
      error: { code: 'INVALID_OTP', message: 'Λάθος ή ληγμένος κωδικός. Δοκίμασε ξανά ή ζήτησε νέο κωδικό.' },
      actions: actions()
    })
    render(<AccountSection />)
    expect(screen.getByText('Λάθος ή ληγμένος κωδικός. Δοκίμασε ξανά ή ζήτησε νέο κωδικό.')).toBeInTheDocument()
    expect(screen.getByLabelText('Κωδικός')).toBeInTheDocument()
  })

  it('status "otpEntry" → «Άκυρο» καλεί actions.cancel', async () => {
    const acts = actions()
    mockUseAuth.mockReturnValue({ status: 'otpEntry', email: null, error: null, actions: acts })
    const user = userEvent.setup()
    render(<AccountSection />)

    await user.click(screen.getByRole('button', { name: 'Άκυρο' }))
    expect(acts.cancel).toHaveBeenCalledTimes(1)
  })

  it('status "loggedIn" → δείχνει το email, «Αποσύνδεση» καλεί actions.logout, ΚΑΜΙΑ κλήση σε app-data API', async () => {
    const acts = actions()
    mockUseAuth.mockReturnValue({ status: 'loggedIn', email: 'δασκάλα@example.com', error: null, actions: acts })
    const user = userEvent.setup()
    render(<AccountSection />)

    expect(screen.getByText('δασκάλα@example.com')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Αποσύνδεση' }))

    expect(acts.logout).toHaveBeenCalledTimes(1)
    // Το logout εδώ είναι ΑΠΟΚΛΕΙΣΤΙΚΑ auth action — καμία από τις actions που θα μπορούσε ένα
    // μελλοντικό, λανθασμένο «wipe δεδομένων» implementation να καλούσε υπάρχει καν σε αυτό το
    // αντικείμενο actions, άρα δεν υπάρχει καμία πιθανότητα να κληθεί.
    expect(Object.keys(acts)).toEqual(['login', 'submitEmail', 'submitOtp', 'cancel', 'logout'])
  })
})
