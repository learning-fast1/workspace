import { useState } from 'react'
import { LogIn, LogOut } from 'lucide-react'
import useAuth from '../auth/useAuth.js'
import FormField from './ui/FormField.jsx'
import Input from './ui/Input.jsx'
import Button from './ui/Button.jsx'
import AlertBanner from './ui/AlertBanner.jsx'
import './AccountSection.css'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Ζει μέσα στο /settings (Technical Plan §Flows) — ΟΧΙ ξεχωριστή σελίδα/route. Χτισμένο με τα
// νεότερα ui/* components (Button/Input/FormField) αντί για το legacy CSS του υπόλοιπου
// Settings.jsx — συνειδητή επιλογή: αυτό είναι γνήσια νέα λειτουργικότητα, όχι επεξεργασία
// υπάρχοντος κώδικα, άρα ακολουθεί το τρέχον design system (ίδια αρχή με ΟΛΑ τα νέα components
// αυτής της σεζόν) — αφήνει σκόπιμα μια μικρή, ορατή ραφή με το υπόλοιπο Settings.jsx, ίδια
// λογική με το ChipListEditor/TemplateSuggestions migration.
export default function AccountSection() {
  const { status, email: loggedInEmail, error, actions } = useAuth()
  const [emailDraft, setEmailDraft] = useState('')
  const [otpDraft, setOtpDraft] = useState('')
  const [localError, setLocalError] = useState(null)
  const [logoutError, setLogoutError] = useState(null)

  // CLOUD_ENABLED=false (βλ. AuthProvider.jsx) — καμία εμφάνιση, καμία κλήση db.cloud.* έγινε ήδη.
  if (status === 'disabled') return null

  function handleSubmitEmail(e) {
    e.preventDefault()
    const value = emailDraft.trim()
    if (!EMAIL_PATTERN.test(value)) {
      setLocalError('Δώσε μια έγκυρη διεύθυνση email.')
      return
    }
    setLocalError(null)
    actions.submitEmail(value)
  }

  function handleSubmitOtp(e) {
    e.preventDefault()
    const value = otpDraft.trim()
    if (!value) {
      setLocalError('Δώσε τον κωδικό που έλαβες.')
      return
    }
    setLocalError(null)
    actions.submitOtp(value)
  }

  function handleCancel() {
    setLocalError(null)
    setEmailDraft('')
    setOtpDraft('')
    actions.cancel()
  }

  // Sprint 5A Phase 2, Commit 6 — actions.logout (πλέον signOut(), βλ. AuthProvider.jsx) μπορεί
  // πραγματικά να πετάξει (π.χ. localStorage μη διαθέσιμο, ή αποτυχία αναίρεσης της
  // db.cloud.logout() πλευρικής ενέργειας) — σε αντίθεση με το παλιό db.cloud.logout() που δεν
  // είχε ΚΑΝΕΝΑ error handling εδώ. Ο χρήστης πρέπει να το δει, όχι να χαθεί αθόρυβα.
  async function handleLogout() {
    setLogoutError(null)
    try {
      await actions.logout()
    } catch (err) {
      setLogoutError(err?.message || 'Η αποσύνδεση απέτυχε. Δοκίμασε ξανά.')
    }
  }

  const displayError = localError || error?.message || null

  return (
    <div className="section account-section">
      <h2>Λογαριασμός</h2>

      {status === 'loggedOut' && (
        <>
          <p className="hint">Δεν είσαι συνδεδεμένος. Η σύνδεση δεν αλλάζει πώς λειτουργεί σήμερα το Workspace — τα δεδομένα σου παραμένουν στη συσκευή.</p>
          <div className="actions-row">
            <Button variant="primary" icon={LogIn} onClick={actions.login}>Σύνδεση</Button>
          </div>
        </>
      )}

      {status === 'loading' && <p className="hint">Φόρτωση…</p>}

      {status === 'emailEntry' && (
        <form onSubmit={handleSubmitEmail} className="account-section__form" noValidate>
          <FormField htmlFor="account-email" label="Email" error={displayError}>
            <Input
              id="account-email"
              type="email"
              autoComplete="email"
              value={emailDraft}
              onChange={(e) => setEmailDraft(e.target.value)}
              placeholder="ο.δασκαλα@παράδειγμα.gr"
              autoFocus
            />
          </FormField>
          <div className="actions-row">
            <Button type="submit" variant="primary">Αποστολή κωδικού</Button>
            <Button type="button" variant="ghost" onClick={handleCancel}>Άκυρο</Button>
          </div>
        </form>
      )}

      {status === 'otpEntry' && (
        <form onSubmit={handleSubmitOtp} className="account-section__form" noValidate>
          <p className="hint">Στείλαμε έναν κωδικό στο email σου.</p>
          <FormField htmlFor="account-otp" label="Κωδικός" error={displayError}>
            <Input
              id="account-otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={otpDraft}
              onChange={(e) => setOtpDraft(e.target.value)}
              placeholder="Κωδικός από το email"
              autoFocus
            />
          </FormField>
          <div className="actions-row">
            <Button type="submit" variant="primary">Επιβεβαίωση</Button>
            <Button type="button" variant="ghost" onClick={handleCancel}>Άκυρο</Button>
          </div>
        </form>
      )}

      {status === 'loggedIn' && (
        <>
          <p className="hint">Συνδέθηκες ως <strong>{loggedInEmail}</strong>.</p>
          {logoutError && <AlertBanner variant="danger">{logoutError}</AlertBanner>}
          <div className="actions-row">
            <Button variant="danger" icon={LogOut} onClick={handleLogout}>Αποσύνδεση</Button>
          </div>
        </>
      )}
    </div>
  )
}
