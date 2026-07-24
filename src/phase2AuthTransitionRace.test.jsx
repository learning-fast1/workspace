import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, act } from '@testing-library/react'

afterEach(() => cleanup())

// Ίδιο fake BehaviorSubject idiom με auth/AuthProvider.test.jsx — subscribe(onNext) + getValue(),
// ό,τι περιμένει το useObservable (dexie-react-hooks).
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

const ERROR_BOUNDARY_TEXT = 'Κάτι πήγε στραβά. Δοκίμασε να επιστρέψεις στην αρχική.'

// Sprint 5A Phase 2, Commit 6 (follow-up) — ρεαλιστικό OTP prompt shape, ίδιο με
// auth/AuthProvider.test.jsx#makeFakeDb.
function otpPrompt(overrides = {}) {
  return {
    type: 'otp',
    alerts: [],
    fields: { otp: { type: 'text', label: 'Κωδικός' } },
    submitLabel: 'Επιβεβαίωση',
    cancelLabel: 'Άκυρο',
    onSubmit: () => {},
    onCancel: () => {},
    ...overrides
  }
}

// Ζητήθηκε ρητά (review, μετά από αναφερόμενο μεταβατικό ErrorBoundary event σε πραγματική
// συσκευή, κατά την υποβολή OTP) — ΞΕΧΩΡΙΣΤΟ από auth/AuthProvider.test.jsx.
//
// ΒΡΕΘΗΚΕ ΚΑΙ ΕΠΙΒΕΒΑΙΩΘΗΚΕ η ΑΚΡΙΒΗΣ ρίζα του προβλήματος (ζωντανά αναπαραγμένη, όχι θεωρητική):
// ΔΕΝ είναι σχήμα (partial currentUser) — είναι ΑΠΛΟ staleness race ανάμεσα σε δύο ανεξάρτητα
// reactive πηγές:
//   1) hasValidUserId (LegacyDataMigrationSection/GenerationSwitchoverSection) υπολογίζεται
//      ΣΥΓΧΡΟΝΑ, στο ΙΔΙΟ render, από useAuth() (status/userId).
//   2) data υπολογίζεται ΑΣΥΓΧΡΟΝΑ από useLiveQuery(fn, [hasValidUserId, userId]) — όταν το
//      dependency array αλλάζει, το useLiveQuery ΞΑΝΑτρέχει το fn, αλλά ΔΕΝ ενημερώνει το
//      επιστρεφόμενο data ΣΥΓΧΡΟΝΑ μέσα στο ΙΔΙΟ render· το ΠΑΛΙΟ, ήδη-resolved αποτέλεσμα
//      παραμένει μέχρι να ολοκληρωθεί το νέο fn().
// Και τα δύο components έχουν ΤΟ ΙΔΙΟ σχήμα σφάλματος: το ίδιο το query σώμα επιστρέφει ρητά
// `null` όταν `!hasValidUserId` («return null» στην αρχή του useLiveQuery callback) — αλλά ο
// render-guard παρακάτω ελέγχει ΜΟΝΟ `data === undefined` (το «useLiveQuery ποτέ δεν έτρεξε
// ακόμα» sentinel), ΟΧΙ `data === null` (το «έτρεξε ήδη, με hasValidUserId=false, και επέστρεψε
// null» sentinel). Άρα ΑΚΡΙΒΩΣ στο ΠΡΩΤΟ render όπου hasValidUserId μόλις έγινε true (π.χ. το
// userId μόλις έφτασε), το data ΕΞΑΚΟΛΟΥΘΕΙ να είναι το ΠΑΛΙΟ null — και data.hasLegacyData/
// data.generation πετάει TypeError. Αναπαράγεται σε ΚΑΘΕ loggedOut/otpEntry→loggedIn μετάβαση
// (ΟΧΙ ειδικό σε partial user shape) — αφού τα δύο components ΗΔΗ έχουν τρέξει τουλάχιστον μία
// φορά με hasValidUserId=false πριν τη σύνδεση, το data είναι ΣΧΕΔΟΝ ΠΑΝΤΑ null (όχι undefined)
// τη στιγμή που η σύνδεση ολοκληρώνεται.
//
// ΔΙΟΡΘΩΘΗΚΕ (LegacyDataMigrationSection.jsx, GenerationSwitchoverSection.jsx): ο guard έγινε
// `data === undefined || data === null` — και τα δύο tests παρακάτω πλέον ΠΕΡΝΑΝΕ, αποδεικνύοντας
// τη διόρθωση πάνω στην ΙΔΙΑ αναπαραγωγή που πρώτα κατέγραψε το σφάλμα.
//
// Αποδίδονται ΜΑΖΙ όλα τα components που διαβάζουν useAuth() στο /settings (AccountSection,
// LegacyDataMigrationSection, GenerationSwitchoverSection, EnableSyncSection) — ΑΚΡΙΒΩΣ ό,τι ήταν
// στην οθόνη κατά το αναφερόμενο event — τυλιγμένα σε ErrorBoundary, ίδιο με το πραγματικό App.jsx.
async function mockAuthAwareDb() {
  const actual = await vi.importActual('./db.js')
  const currentUser = new FakeSubject({ isLoggedIn: false })
  const userInteraction = new FakeSubject(otpPrompt())
  const login = vi.fn()
  const logout = vi.fn()
  actual.db.cloud = { currentUser, userInteraction, login, logout }
  return { ...actual, CLOUD_ENABLED: true, __currentUser: currentUser, __userInteraction: userInteraction }
}

describe('Μεταβατική κατάσταση κατά την ολοκλήρωση OTP — race ανάμεσα σε currentUser/userInteraction', () => {
  it('otpEntry → (partial: isLoggedIn χωρίς email/userId) → (userInteraction clears) → σταθερό loggedIn: ΚΑΝΕΝΑ crash σε κανένα ενδιάμεσο βήμα', async () => {
    vi.resetModules()
    let mocked
    vi.doMock('./db.js', async () => {
      mocked = await mockAuthAwareDb()
      return mocked
    })
    // Χρειάζεται τουλάχιστον ΜΙΑ φορά να «αγγίξει» κάποιος import ώστε το vi.doMock factory να
    // τρέξει και να γεμίσει το `mocked` πριν χρησιμοποιηθεί παρακάτω.
    await import('./db.js')

    const { default: AuthProvider } = await import('./auth/AuthProvider.jsx')
    const { default: ErrorBoundary } = await import('./components/ErrorBoundary.jsx')
    const { default: AccountSection } = await import('./components/AccountSection.jsx')
    const { default: LegacyDataMigrationSection } = await import('./components/LegacyDataMigrationSection.jsx')
    const { default: GenerationSwitchoverSection } = await import('./components/GenerationSwitchoverSection.jsx')
    const { default: EnableSyncSection } = await import('./components/EnableSyncSection.jsx')
    const { db } = await import('./db.js')
    await db.open()

    render(
      <ErrorBoundary>
        <AuthProvider>
          <AccountSection />
          <LegacyDataMigrationSection />
          <GenerationSwitchoverSection />
          <EnableSyncSection />
        </AuthProvider>
      </ErrorBoundary>
    )

    // 0) Αρχική κατάσταση: otpEntry — sanity check, όχι ακόμα crash.
    expect(screen.queryByText(ERROR_BOUNDARY_TEXT)).not.toBeInTheDocument()

    // 1) *** Η ΜΕΤΑΒΑΤΙΚΗ ΚΑΤΑΣΤΑΣΗ *** — currentUser.isLoggedIn γίνεται true, ΧΩΡΙΣ email/userId
    // ακόμα (θεωρητικά δυνατό, βλ. authStatus.js σχόλιο) ΚΑΙ ΧΩΡΙΣ να έχει καθαρίσει ακόμα το
    // userInteraction (ακόμα δείχνει το παλιό OTP prompt) — ΑΚΡΙΒΩΣ το σενάριο που ζητήθηκε.
    await act(async () => {
      mocked.__currentUser.next({ isLoggedIn: true })
    })
    expect(screen.queryByText(ERROR_BOUNDARY_TEXT)).not.toBeInTheDocument()

    // 2) userId φτάνει, email ακόμα όχι.
    await act(async () => {
      mocked.__currentUser.next({ isLoggedIn: true, userId: 'partial-user-id-before-email' })
    })
    expect(screen.queryByText(ERROR_BOUNDARY_TEXT)).not.toBeInTheDocument()

    // 3) Το userInteraction καθαρίζει (το OTP prompt κλείνει) — ξεχωριστό, μεταγενέστερο emission.
    await act(async () => {
      mocked.__userInteraction.next(undefined)
    })
    expect(screen.queryByText(ERROR_BOUNDARY_TEXT)).not.toBeInTheDocument()

    // 4) Τελική, σταθερή κατάσταση — πλήρες email+userId.
    await act(async () => {
      mocked.__currentUser.next({ isLoggedIn: true, email: 'victoriacharalam@gmail.com', userId: 'real-user-id' })
    })
    await waitFor(() => expect(screen.getByText(/Συνδέθηκες ως/)).toBeInTheDocument())
    expect(screen.queryByText(ERROR_BOUNDARY_TEXT)).not.toBeInTheDocument()
    expect(screen.getByText('victoriacharalam@gmail.com')).toBeInTheDocument()

    db.close()
    vi.doUnmock('./db.js')
  })

  // Η ΑΠΛΟΥΣΤΕΡΗ, πιο ρεαλιστική αναπαραγωγή — ΧΩΡΙΣ κανένα τεχνητό ενδιάμεσο partial-shape βήμα:
  // ΜΙΑ ΜΟΝΟ emission, otpEntry→loggedIn απευθείας με πλήρες email+userId (ό,τι θα έκανε ένα
  // πραγματικό, ατομικό onSubmit({otp}) handler). Αποδεικνύει ότι το bug/fix ΔΕΝ εξαρτάται από
  // partial user shape — εξαρτάται ΜΟΝΟ από το ότι τα δύο components ΗΔΗ έτρεξαν το useLiveQuery
  // τους με hasValidUserId=false (κατά το αρχικό, pre-login render) πριν καν αγγίξουμε το OTP.
  it('otpEntry → loggedIn σε ΜΙΑ κίνηση (χωρίς ενδιάμεσα partial βήματα): ΚΑΝΕΝΑ crash', async () => {
    vi.resetModules()
    let mocked
    vi.doMock('./db.js', async () => {
      mocked = await mockAuthAwareDb()
      return mocked
    })
    await import('./db.js')

    const { default: AuthProvider } = await import('./auth/AuthProvider.jsx')
    const { default: ErrorBoundary } = await import('./components/ErrorBoundary.jsx')
    const { default: AccountSection } = await import('./components/AccountSection.jsx')
    const { default: LegacyDataMigrationSection } = await import('./components/LegacyDataMigrationSection.jsx')
    const { default: GenerationSwitchoverSection } = await import('./components/GenerationSwitchoverSection.jsx')
    const { default: EnableSyncSection } = await import('./components/EnableSyncSection.jsx')
    const { db } = await import('./db.js')
    await db.open()

    render(
      <ErrorBoundary>
        <AuthProvider>
          <AccountSection />
          <LegacyDataMigrationSection />
          <GenerationSwitchoverSection />
          <EnableSyncSection />
        </AuthProvider>
      </ErrorBoundary>
    )
    expect(screen.queryByText(ERROR_BOUNDARY_TEXT)).not.toBeInTheDocument()

    // Δίνει στο ΑΡΧΙΚΟ useLiveQuery run (hasValidUserId=false, πριν τη σύνδεση) χρόνο να
    // πράγματι ολοκληρωθεί/cache-αριστεί σε data=null — ΑΚΡΙΒΩΣ η προϋπόθεση που κάνει το bug
    // αναπαράξιμο (χωρίς αυτό το await, θα μπορούσε συμπτωματικά να μην έχει προλάβει ποτέ να
    // τρέξει, κρύβοντας το πρόβλημα).
    await waitFor(() => expect(screen.getByRole('button', { name: /Στείλε κωδικό|Επιβεβαίωση/ })).toBeInTheDocument())

    await act(async () => {
      mocked.__currentUser.next({ isLoggedIn: true, email: 'victoriacharalam@gmail.com', userId: 'real-user-id' })
      mocked.__userInteraction.next(undefined)
    })

    await waitFor(() => expect(screen.getByText(/Συνδέθηκες ως/)).toBeInTheDocument())
    expect(screen.queryByText(ERROR_BOUNDARY_TEXT)).not.toBeInTheDocument()

    db.close()
    vi.doUnmock('./db.js')
  })
})
