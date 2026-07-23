// Καθαρή συνάρτηση παραγωγής κατάστασης — καμία εξάρτηση σε React/Dexie/δίκτυο, γι' αυτό είναι
// πλήρως unit-testable (Technical Plan §Testing, «unit»). Παίρνει την τρέχουσα τιμή των δύο
// observables του db.cloud (currentUser, userInteraction) και τη μεταφράζει σε ένα απλό σχήμα
// για το UI.
//
// ΣΗΜΑΝΤΙΚΗ ΑΠΟΚΛΙΣΗ από το αρχικό Technical Plan, βρέθηκε κατά την υλοποίηση: το πραγματικό API
// για custom login UI (dexie-cloud-addon DXCUserInteraction) ΔΕΝ έχει ξεχωριστό, πλήρες «error»
// screen — τα σφάλματα (π.χ. λάθος OTP) έρχονται ως `alerts` ΠΑΝΩ στο ίδιο prompt (email/otp) που
// ήδη δείχνει ο χρήστης, όχι σε ξεχωριστή οθόνη. Το status παραμένει ένα από τα 5
// (loggedOut/emailEntry/otpEntry/loading/loggedIn)· ένα ξεχωριστό πεδίο `error` κουβαλάει το
// μήνυμα όταν υπάρχει, πάνω στο ήδη τρέχον status — πιστή αναπαράσταση του πραγματικού API αντί
// για τεχνητό 6ο state που δεν αντιστοιχεί σε τίποτα πραγματικό.
//
// Άλλη πραγματικότητα του API (DXCErrorAlert['messageCode']): δεν υπάρχει ξεχωριστός κωδικός για
// «έληξε ο κωδικός» — λάθος ΚΑΙ ληγμένο OTP καταλήγουν και τα δύο σε 'INVALID_OTP'. Το μήνυμα προς
// τον χρήστη είναι σκόπιμα διατυπωμένο ώστε να καλύπτει και τις δύο περιπτώσεις.
const ERROR_MESSAGES = {
  INVALID_OTP: 'Λάθος ή ληγμένος κωδικός. Δοκίμασε ξανά ή ζήτησε νέο κωδικό.',
  INVALID_EMAIL: 'Μη έγκυρη διεύθυνση email.',
  LICENSE_LIMIT_REACHED: 'Ο λογαριασμός έχει φτάσει το όριο χρηστών.',
  USER_NOT_REGISTERED: 'Δεν βρέθηκε λογαριασμός με αυτό το email.',
  USER_NOT_ACCEPTED: 'Αυτός ο λογαριασμός δεν έχει πρόσβαση.',
  NO_SEATS_AVAILABLE: 'Δεν υπάρχουν διαθέσιμες θέσεις στον λογαριασμό.',
  USER_DEACTIVATED: 'Αυτός ο λογαριασμός έχει απενεργοποιηθεί.',
  GENERIC_ERROR: 'Κάτι πήγε στραβά. Δοκίμασε ξανά.',
  WEBHOOK_ERROR: 'Κάτι πήγε στραβά. Δοκίμασε ξανά.'
}

function extractError(userInteraction) {
  const errorAlert = userInteraction?.alerts?.find((a) => a.type === 'error')
  if (!errorAlert) return null
  return {
    code: errorAlert.messageCode,
    message: ERROR_MESSAGES[errorAlert.messageCode] || errorAlert.message || ERROR_MESSAGES.GENERIC_ERROR
  }
}

// currentUser/userInteraction: οι ΤΡΕΧΟΥΣΕΣ τιμές (όχι τα ίδια τα observables) των db.cloud.currentUser
// / db.cloud.userInteraction — ό,τι επιστρέφει useObservable(...) σε κάθε render.
//
// Sprint 5A Phase 2, Commit 3 — προστέθηκε το πεδίο `userId` (μέχρι τώρα εκτίθετο μόνο το email).
// Το migration UI χρειάζεται το ΠΡΑΓΜΑΤΙΚΟ userId (όχι το email) για να καλέσει
// claimLegacyDataOwnership/runMigration — κεντρικοποιημένο εδώ, ίδιο idiom με το email, αντί το
// νέο component να διαβάζει απευθείας db.cloud.currentUser.value (θα παρέκαμπτε το ήδη υπάρχον
// σημείο συγκέντρωσης όλων των observable-reads του db.cloud). null σε ΚΑΘΕ άλλο status, ΚΑΙ
// ρητά null όταν status==='loggedIn' αλλά το ίδιο το dexie-cloud-addon δεν έδωσε userId ακόμα
// (θεωρητικά δυνατό — UserLogin.userId είναι προαιρετικό πεδίο στο πραγματικό API) — το UI
// (LegacyDataMigrationSection) πρέπει να το χειριστεί ρητά ως fail-closed, ΟΧΙ να υποθέσει ότι
// loggedIn συνεπάγεται πάντα userId.
export function deriveAuthStatus({ currentUser, userInteraction }) {
  if (currentUser?.isLoggedIn) {
    return { status: 'loggedIn', email: currentUser.email || null, userId: currentUser.userId || null, error: null }
  }
  if (userInteraction?.type === 'email') {
    return { status: 'emailEntry', email: null, userId: null, error: extractError(userInteraction) }
  }
  if (userInteraction?.type === 'otp') {
    return { status: 'otpEntry', email: null, userId: null, error: extractError(userInteraction) }
  }
  if (currentUser?.isLoading) {
    return { status: 'loading', email: null, userId: null, error: null }
  }
  return { status: 'loggedOut', email: null, userId: null, error: null }
}
