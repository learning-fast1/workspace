import { recoverFromStoredSnapshot } from './signOut.js'

// Sprint 5A Phase 2, Commit 6 (follow-up) — κλείνει το τελευταίο κενό που εντοπίστηκε στο πρακτικό
// validation plan: recoverFromStoredSnapshot() υπήρχε ήδη ΚΑΙ ήταν καλυμμένο από tests, αλλά
// ΤΙΠΟΤΑ στο πραγματικό bootstrap (main.jsx) δεν το καλούσε ποτέ αυτόματα — ένα πραγματικό crash
// ανάμεσα σε επιτυχές db.cloud.logout() και το restoreFullDeviceSnapshot() (auth/signOut.js) θα
// άφηνε το στιγμιότυπο εκεί, ανακτήσιμο, αλλά ΚΑΝΕΝΑΣ δεν θα το ήξερε χωρίς να ανοίξει χειροκίνητα
// τα devtools.
//
// ΠΟΤΕ δεν πετάει προς τα έξω — ο καλών (main.jsx) πρέπει να μπορεί να αποφασίσει «συνέχισε
// κανονικά» έναντι «σταμάτα, δείξε μήνυμα ανάκτησης» με ΕΝΑ if, χωρίς try/catch γύρω από όλο το
// bootstrap chain. Idempotent εξ ορισμού — recoverFromStoredSnapshot() το ΙΔΙΟ είναι ήδη
// idempotent (readPendingSnapshot()===null μετά από επιτυχία ή όταν δεν υπήρχε ποτέ τίποτα, βλ.
// migration/deviceSnapshot.js) — κάθε επόμενη κλήση (π.χ. ξανά-φόρτωση μετά από μήνυμα αποτυχίας)
// είτε ξαναπροσπαθεί το ΙΔΙΟ εκκρεμές στιγμιότυπο (ασφαλές, δεν καταναλώνεται παρά μόνο σε
// επιτυχία) είτε δεν βρίσκει τίποτα και είναι πλήρες no-op.
export async function performStartupRecovery({ recover = recoverFromStoredSnapshot } = {}) {
  try {
    const recovered = await recover()
    return { status: recovered ? 'recovered' : 'nothing-pending', error: null }
  } catch (error) {
    // Σκόπιμα ΔΕΝ αγγίζουμε το αποθηκευμένο στιγμιότυπο εδώ — recoverFromStoredSnapshot() το
    // αφήνει ήδη ανέγγιχτο σε αποτυχία (βλ. auth/signOut.js). Ο καλών αποφασίζει τι να δείξει.
    return { status: 'failed', error }
  }
}
