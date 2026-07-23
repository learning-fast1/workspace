import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

afterEach(() => cleanup())

// Ελάχιστο fake BehaviorSubject — υλοποιεί ακριβώς το InteropableObservable interface που
// περιμένει το useObservable (dexie-react-hooks): subscribe(onNext) + getValue(). Επιτρέπει στο
// test να "σπρώχνει" τιμές (π.χ. νέο userInteraction prompt) και το component να αντιδράει.
class FakeSubject {
  constructor(initialValue) {
    this.value = initialValue
    this.subscribers = new Set()
  }
  getValue() {
    return this.value
  }
  subscribe(onNext) {
    this.subscribers.add(onNext)
    onNext(this.value)
    return { unsubscribe: () => this.subscribers.delete(onNext) }
  }
  next(value) {
    this.value = value
    for (const fn of this.subscribers) fn(value)
  }
}

function makeFakeDb({ initialUser, initialInteraction } = {}) {
  const currentUser = new FakeSubject(initialUser ?? {})
  const userInteraction = new FakeSubject(initialInteraction)
  const login = vi.fn(() => {
    userInteraction.next({
      type: 'email',
      alerts: [],
      fields: { email: { type: 'text', placeholder: 'Email' } },
      submitLabel: 'Συνέχεια',
      cancelLabel: 'Άκυρο',
      onSubmit: ({ email }) => {
        userInteraction.next({
          type: 'otp',
          alerts: [{ type: 'info', messageCode: 'OTP_SENT', message: 'sent', messageParams: { email } }],
          fields: { otp: { type: 'text', label: 'Κωδικός' } },
          submitLabel: 'Επιβεβαίωση',
          cancelLabel: 'Άκυρο',
          onSubmit: ({ otp }) => {
            if (otp === '123456') {
              currentUser.next({ isLoggedIn: true, email })
              userInteraction.next(undefined)
            } else {
              // Ίδιο prompt, ΤΩΡΑ με error alert — ακριβώς το πραγματικό μοτίβο (§authStatus.js).
              // onSubmit εδώ είναι no-op για τους σκοπούς του test (κανένα test ξαναστέλνει OTP
              // μετά το πρώτο λάθος) — σε πραγματική χρήση θα ήταν η ίδια onSubmit λογική.
              userInteraction.next({
                type: 'otp',
                alerts: [{ type: 'error', messageCode: 'INVALID_OTP', message: 'invalid', messageParams: {} }],
                fields: { otp: { type: 'text', label: 'Κωδικός' } },
                submitLabel: 'Επιβεβαίωση',
                cancelLabel: 'Άκυρο',
                onSubmit: () => {},
                onCancel: () => userInteraction.next(undefined)
              })
            }
          },
          onCancel: () => userInteraction.next(undefined)
        })
      },
      onCancel: () => userInteraction.next(undefined)
    })
  })
  const logout = vi.fn(() => {
    currentUser.next({ isLoggedIn: false })
  })
  return { db: { cloud: { currentUser, userInteraction, login, logout } }, CLOUD_ENABLED: true }
}

describe('AuthProvider — CLOUD_ENABLED=true (mocked db.cloud, καμία πραγματική σύνδεση)', () => {
  it('refresh: currentUser ήδη isLoggedIn=true ΠΡΙΝ το πρώτο render → status "loggedIn" αμέσως, ΚΑΝΕΝΑ αναβόσβημα σε loggedOut', async () => {
    vi.resetModules()
    vi.doMock('../db.js', () => makeFakeDb({ initialUser: { isLoggedIn: true, email: 'ήδη@example.com' } }))
    const { default: AuthProvider } = await import('./AuthProvider.jsx')
    const { default: useAuth } = await import('./useAuth.js')

    function Probe() {
      const { status, email } = useAuth()
      return <p>status: {status} / email: {email}</p>
    }

    render(<AuthProvider><Probe /></AuthProvider>)
    // Ελέγχουμε το ΠΡΩΤΟ committed render — όχι μετά από κάποιο μεταγενέστερο effect.
    expect(screen.getByText('status: loggedIn / email: ήδη@example.com')).toBeInTheDocument()
    vi.doUnmock('../db.js')
  })

  it('πλήρης ροή: login → emailEntry → submitEmail → otpEntry → submitOtp (σωστό) → loggedIn', async () => {
    vi.resetModules()
    vi.doMock('../db.js', () => makeFakeDb({ initialUser: { isLoggedIn: false } }))
    const { default: AuthProvider } = await import('./AuthProvider.jsx')
    const { default: useAuth } = await import('./useAuth.js')
    const user = userEvent.setup()

    function Probe() {
      const { status, actions } = useAuth()
      return (
        <div>
          <p>status: {status}</p>
          <button onClick={actions.login}>Σύνδεση</button>
          {status === 'emailEntry' && <button onClick={() => actions.submitEmail('teacher@example.com')}>Στείλε email</button>}
          {status === 'otpEntry' && <button onClick={() => actions.submitOtp('123456')}>Στείλε otp</button>}
        </div>
      )
    }

    render(<AuthProvider><Probe /></AuthProvider>)
    expect(screen.getByText('status: loggedOut')).toBeInTheDocument()

    await user.click(screen.getByText('Σύνδεση'))
    await waitFor(() => expect(screen.getByText('status: emailEntry')).toBeInTheDocument())

    await user.click(screen.getByText('Στείλε email'))
    await waitFor(() => expect(screen.getByText('status: otpEntry')).toBeInTheDocument())

    await user.click(screen.getByText('Στείλε otp'))
    await waitFor(() => expect(screen.getByText('status: loggedIn')).toBeInTheDocument())

    vi.doUnmock('../db.js')
  })

  it('λάθος OTP → παραμένει otpEntry, ΔΕΝ γίνεται loggedIn', async () => {
    vi.resetModules()
    vi.doMock('../db.js', () => makeFakeDb({ initialUser: { isLoggedIn: false } }))
    const { default: AuthProvider } = await import('./AuthProvider.jsx')
    const { default: useAuth } = await import('./useAuth.js')
    const user = userEvent.setup()

    function Probe() {
      const { status, error, actions } = useAuth()
      return (
        <div>
          <p>status: {status}</p>
          {error && <p>error: {error.code}</p>}
          <button onClick={actions.login}>Σύνδεση</button>
          {status === 'emailEntry' && <button onClick={() => actions.submitEmail('teacher@example.com')}>email</button>}
          {status === 'otpEntry' && <button onClick={() => actions.submitOtp('000000')}>wrong-otp</button>}
        </div>
      )
    }

    render(<AuthProvider><Probe /></AuthProvider>)
    await user.click(screen.getByText('Σύνδεση'))
    await waitFor(() => screen.getByText('email'))
    await user.click(screen.getByText('email'))
    await waitFor(() => screen.getByText('wrong-otp'))
    await user.click(screen.getByText('wrong-otp'))

    await waitFor(() => expect(screen.getByText('error: INVALID_OTP')).toBeInTheDocument())
    expect(screen.getByText('status: otpEntry')).toBeInTheDocument()

    vi.doUnmock('../db.js')
  })

  // Sprint 5A Phase 2, Commit 6 — actions.logout ΠΛΕΟΝ καλεί auth/signOut.js, ΟΧΙ απευθείας
  // db.cloud.logout() (evidence-based εύρημα: το πραγματικό addon's logout() καθαρίζει ΚΑΘΕ πίνακα
  // της βάσης, βλ. signOut.js). Το test ΤΩΡΑ χρησιμοποιεί το ΠΡΑΓΜΑΤΙΚΟ db.js module (μέσω
  // importActual — ΟΧΙ πλήρες fake, αφού captureFullDeviceSnapshot/restoreFullDeviceSnapshot
  // χρειάζονται ΠΡΑΓΜΑΤΙΚΟΥΣ Dexie πίνακες) με ΜΟΝΟ το db.cloud μερικώς fake (η ίδια η
  // dexie-cloud-addon σύνδεση δεν υπάρχει σε CLOUD_ENABLED=false περιβάλλον test) — το fake logout()
  // προσομοιώνει ΑΚΡΙΒΩΣ την πραγματική, τεκμηριωμένη καταστροφική συμπεριφορά (καθαρίζει ΚΑΘΕ
  // πίνακα) ώστε το test να αποδεικνύει ότι το signOut() πράγματι την αναιρεί.
  it('logout: αναιρεί την καταστροφική πλευρική ενέργεια του db.cloud.logout() — τα δεδομένα επιβιώνουν', async () => {
    vi.resetModules()
    vi.doMock('../db.js', async () => {
      const actual = await vi.importActual('../db.js')
      const currentUser = new FakeSubject({ isLoggedIn: true, email: 'x@example.com' })
      const userInteraction = new FakeSubject(undefined)
      const login = vi.fn()
      const logout = vi.fn(async () => {
        await actual.db.transaction('rw', actual.db.tables, async () => {
          for (const table of actual.db.tables) await table.clear()
        })
        currentUser.next({ isLoggedIn: false })
      })
      actual.db.cloud = { currentUser, userInteraction, login, logout }
      return { ...actual, CLOUD_ENABLED: true }
    })

    const { db } = await import('../db.js')
    await db.open()
    await db.students.add({ id: 1, code: 'Μ1', active: true, functionalProfile: [], preferences: {} })

    const { default: AuthProvider } = await import('./AuthProvider.jsx')
    const { default: useAuth } = await import('./useAuth.js')
    const user = userEvent.setup()

    function Probe() {
      const { status, actions } = useAuth()
      return (
        <div>
          <p>status: {status}</p>
          <button onClick={actions.logout}>Αποσύνδεση</button>
        </div>
      )
    }

    render(<AuthProvider><Probe /></AuthProvider>)
    expect(screen.getByText('status: loggedIn')).toBeInTheDocument()

    await user.click(screen.getByText('Αποσύνδεση'))
    await waitFor(() => expect(screen.getByText('status: loggedOut')).toBeInTheDocument())
    expect(db.cloud.logout).toHaveBeenCalledTimes(1)

    await waitFor(async () => {
      expect(await db.students.get(1)).toMatchObject({ code: 'Μ1' })
    })

    db.close()
    vi.doUnmock('../db.js')
  })
})
