import { AlertTriangle } from 'lucide-react'
import './RecoveryFailedScreen.css'

// Sprint 5A Phase 2, Commit 6 (follow-up) — αποδίδεται ΑΝΤΙ ΟΛΟΚΛΗΡΗΣ της εφαρμογής (main.jsx),
// ΠΡΙΝ από AuthProvider/App — ΣΚΟΠΙΜΑ ΧΩΡΙΣ εξάρτηση από .app-shell context (βλ. τα υπόλοιπα *.css
// αυτού του φακέλου, π.χ. GenerationSwitchoverSection.css) — τα root-level tokens του index.css
// (ήδη φορτωμένα από το main.jsx πριν από αυτό) αρκούν από μόνα τους.
//
// Το μήνυμα αποφεύγει ΡΗΤΑ οποιαδήποτε πρόταση καθαρισμού δεδομένων/cache — αυτό θα κατέστρεφε
// ακριβώς το αντίγραφο ασφαλείας που ήδη υπάρχει, ανέγγιχτο, στο workspace-signout-safety
// (auth/signOut.js#recoverFromStoredSnapshot δεν το διαγράφει ΠΟΤΕ σε αποτυχία).
export default function RecoveryFailedScreen({ error, onRetry = () => window.location.reload() }) {
  return (
    <div className="recovery-failed-screen">
      <div className="recovery-failed-screen__card">
        <AlertTriangle size={32} className="recovery-failed-screen__icon" aria-hidden="true" />
        <h1>Δεν ήταν δυνατή η ανάκτηση των τοπικών δεδομένων</h1>
        <p>
          Μια προηγούμενη αποσύνδεση διακόπηκε πριν ολοκληρωθεί. Τα δεδομένα σου <strong>δεν έχουν χαθεί</strong> —
          παραμένουν αποθηκευμένα με ασφάλεια σε αυτή τη συσκευή, αλλά η αυτόματη επαναφορά τους μόλις απέτυχε.
        </p>
        <p>
          Μην κάνεις καθαρισμό δεδομένων ή cache του browser για αυτή τη σελίδα — αυτό θα εμπόδιζε
          μόνιμα την ανάκτηση. Δοκίμασε ξανά· αν το πρόβλημα επιμένει, επικοινώνησε για βοήθεια πριν
          κάνεις οτιδήποτε άλλο σε αυτή τη συσκευή.
        </p>
        {error?.message && <p className="recovery-failed-screen__detail">{error.message}</p>}
        <button type="button" className="recovery-failed-screen__retry" onClick={onRetry}>
          Δοκίμασε ξανά
        </button>
      </div>
    </div>
  )
}
