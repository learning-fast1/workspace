import { createContext, useMemo } from 'react'
import { useObservable } from 'dexie-react-hooks'
import { db, CLOUD_ENABLED } from '../db.js'
import { deriveAuthStatus } from './authStatus.js'
import { signOut } from './signOut.js'

// Το ΠΡΩΤΟ React Context της εφαρμογής — δικαιολογημένο γιατί «ποιος είναι συνδεδεμένος» είναι
// πραγματικά cross-cutting (Technical Plan §Αρχιτεκτονική), σε αντίθεση με το per-page useState
// που αρκεί παντού αλλού στο Workspace.
export const AuthContext = createContext(null)

// Όταν CLOUD_ENABLED === false, το db.cloud δεν υπάρχει ΚΑΝ πάνω στο db instance (το addon ποτέ
// δεν πέρασε στον Dexie constructor — βλ. db.js) — σταθερή τιμή, καμία κλήση σε db.cloud.*.
const DISABLED_VALUE = {
  status: 'disabled',
  email: null,
  userId: null,
  error: null,
  actions: { login: noop, submitEmail: noop, submitOtp: noop, cancel: noop, logout: noop }
}

function noop() {}

export default function AuthProvider({ children }) {
  if (!CLOUD_ENABLED) {
    return <AuthContext.Provider value={DISABLED_VALUE}>{children}</AuthContext.Provider>
  }
  return <EnabledAuthProvider>{children}</EnabledAuthProvider>
}

// Ξεχωριστό component (όχι inline στο AuthProvider) ώστε τα hooks παρακάτω να καλούνται ΜΟΝΟ
// όταν CLOUD_ENABLED είναι true — τα React hooks δεν επιτρέπεται να κληθούν υπό συνθήκη μέσα στο
// ίδιο component σε διαφορετικά renders.
function EnabledAuthProvider({ children }) {
  const currentUser = useObservable(db.cloud.currentUser)
  const userInteraction = useObservable(db.cloud.userInteraction)

  const value = useMemo(() => {
    const derived = deriveAuthStatus({ currentUser, userInteraction })
    return {
      ...derived,
      actions: {
        // Ξεκινά τη ροή — το ίδιο το Dexie Cloud θα ζητήσει email μέσω του userInteraction.
        login: () => db.cloud.login(),
        // Delegation στο ΠΡΑΓΜΑΤΙΚΟ API custom-UI (DXCUserInteraction.onSubmit) — όχι δεύτερο
        // απευθείας login() call με {otp}, που δεν αντιστοιχεί στο πραγματικό contract.
        submitEmail: (email) => userInteraction?.type === 'email' && userInteraction.onSubmit({ email }),
        submitOtp: (otp) => userInteraction?.type === 'otp' && userInteraction.onSubmit({ otp }),
        cancel: () => userInteraction?.onCancel?.(),
        // Sprint 5A Phase 2, Commit 6 — ΟΧΙ πια απευθείας db.cloud.logout(): εκείνο καθαρίζει ΚΑΘΕ
        // πίνακα της βάσης (evidence-based εύρημα, βλ. auth/signOut.js) — το signOut() χρησιμοποιεί
        // το ΙΔΙΟ, μοναδικό API αλλά αναιρεί ΑΜΕΣΩΣ την καταστροφική πλευρική του ενέργεια.
        logout: () => signOut()
      }
    }
  }, [currentUser, userInteraction])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
