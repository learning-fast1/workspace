import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { RefreshCw } from 'lucide-react'
import useAuth from '../auth/useAuth.js'
import { checkSyncPrerequisites, activateSyncForCurrentUser, isSessionSyncActive } from '../migration/syncAuthorization.js'
import Button from './ui/Button.jsx'
import AlertBanner from './ui/AlertBanner.jsx'
import './EnableSyncSection.css'

// Sprint 5A Phase 2, Commit 6 — ζει μέσα στο /settings, ΑΜΕΣΩΣ μετά το GenerationSwitchoverSection
// (ίδιο auto-gated μοτίβο, ίδιο idiom). ΞΕΧΩΡΙΣΤΗ ενέργεια από την ενεργοποίηση v2 γενιάς: εδώ
// ενεργοποιείται ο συγχρονισμός, ΜΟΝΟ αφού και οι 4 προϋποθέσεις (ownership, migration complete,
// v2 ενεργή, restore-finalization όχι pending/failed) ήδη ισχύουν. Η ίδια η ενέργεια ΔΕΝ ενεργοποιεί
// τίποτα άμεσα σε αυτή τη σελίδα-φόρτωση (evidence-based εύρημα, βλ. migration/syncAuthorization.js
// — μια δεύτερη db.cloud.configure() μέσα στην ίδια φόρτωση δεν έχει κανένα αποτέλεσμα) — γράφει
// μόνο το (μη έμπιστο) hint και απαιτεί ΥΠΟΧΡΕΩΤΙΚΟ πλήρες reload, ίδιο μοτίβο με
// activateV2Generation/GenerationSwitchoverSection.
export default function EnableSyncSection() {
  const { status, userId } = useAuth()
  const [isRunning, setIsRunning] = useState(false)
  const [actionError, setActionError] = useState(null)
  // Cloud sync gate (review χρήστη) — ΟΧΙ «συγκατάθεση GDPR»: ρητή επιβεβαίωση εξουσιοδότησης
  // σύμφωνα με την πολιτική σχολείου/οργανισμού. Τοπικό state only, ΟΥΔΕΠΟΤΕ αποθηκεύεται πουθενά
  // (ούτε localStorage/appMeta) — ξαναζητείται σε ΚΑΘΕ προσπάθεια ενεργοποίησης, το πιο
  // συντηρητικό default.
  const [confirmed, setConfirmed] = useState(false)
  const runGuardRef = useRef(false)

  const hasValidUserId = status === 'loggedIn' && typeof userId === 'string' && userId.trim() !== ''

  const prerequisites = useLiveQuery(async () => {
    if (!hasValidUserId) return null
    return checkSyncPrerequisites(userId)
  }, [hasValidUserId, userId])

  async function handleActivate() {
    if (runGuardRef.current || !confirmed) return
    runGuardRef.current = true
    setIsRunning(true)
    setActionError(null)
    try {
      await activateSyncForCurrentUser({ getAuthenticatedUserId: () => userId })
      window.location.reload()
    } catch (err) {
      setActionError(err?.message || 'Κάτι πήγε στραβά. Δοκίμασε ξανά.')
      // Review χρήστη: μετά από αποτυχημένη (ή ακυρωμένη) ενεργοποίηση, η επιβεβαίωση επανέρχεται
      // σε μη επιλεγμένη κατάσταση — καμία «κολλημένη» προηγούμενη επιβεβαίωση να επιτρέψει ένα
      // επόμενο, ασυνείδητο ξανά-κλικ χωρίς νέα, ρητή επιβεβαίωση.
      setConfirmed(false)
      runGuardRef.current = false
      setIsRunning(false)
    }
  }

  if (!hasValidUserId) return null
  if (!prerequisites || !prerequisites.ok) return null

  // isSessionSyncActive(): σταθερό για ΟΛΗ τη διάρκεια αυτής της σελίδας-φόρτωσης (βλ.
  // main.jsx#verifySyncAuthorizationOrShutdown, τρέχει ΠΡΙΝ το πρώτο render) — ΔΕΝ χρειάζεται
  // ζωντανή παρακολούθηση, μόνο ένα πλήρες reload το αλλάζει.
  if (isSessionSyncActive()) {
    return (
      <div className="section enable-sync-section">
        <h2>Συγχρονισμός</h2>
        <AlertBanner variant="success">Ο συγχρονισμός είναι ενεργός σε αυτή τη συσκευή.</AlertBanner>
      </div>
    )
  }

  return (
    <div className="section enable-sync-section">
      <h2>Συγχρονισμός</h2>
      <p className="hint">
        Τα δεδομένα σου είναι έτοιμα για συγχρονισμό. Η ενεργοποίηση θα ισχύσει μετά από
        επαναφόρτωση της εφαρμογής.
      </p>
      {/* Cloud sync gate (review χρήστη) — ΟΧΙ «συγκατάθεση GDPR»: ενημέρωση ότι δεδομένα
          μαθητών μεταφέρονται σε cloud υποδομή + ρητή επιβεβαίωση εξουσιοδότησης σύμφωνα με την
          πολιτική σχολείου/οργανισμού. */}
      <AlertBanner variant="info">
        Η ενεργοποίηση συγχρονισμού θα μεταφέρει τα δεδομένα μαθητών από αυτή τη συσκευή σε cloud
        υποδομή (Dexie Cloud). Ενεργοποίησε μόνο αν έχεις την απαραίτητη εξουσιοδότηση σύμφωνα με
        την πολιτική του σχολείου ή του οργανισμού σου.
      </AlertBanner>
      <label className="enable-sync-section__confirm">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        Επιβεβαιώνω ότι έχω την απαραίτητη εξουσιοδότηση.
      </label>
      {actionError && <AlertBanner variant="danger">{actionError}</AlertBanner>}
      <div className="actions-row">
        <Button variant="primary" icon={RefreshCw} loading={isRunning} disabled={!confirmed} onClick={handleActivate}>
          Ενεργοποίηση συγχρονισμού
        </Button>
      </div>
    </div>
  )
}
