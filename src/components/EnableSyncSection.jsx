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
  const runGuardRef = useRef(false)

  const hasValidUserId = status === 'loggedIn' && typeof userId === 'string' && userId.trim() !== ''

  const prerequisites = useLiveQuery(async () => {
    if (!hasValidUserId) return null
    return checkSyncPrerequisites(userId)
  }, [hasValidUserId, userId])

  async function handleActivate() {
    if (runGuardRef.current) return
    runGuardRef.current = true
    setIsRunning(true)
    setActionError(null)
    try {
      await activateSyncForCurrentUser({ getAuthenticatedUserId: () => userId })
      window.location.reload()
    } catch (err) {
      setActionError(err?.message || 'Κάτι πήγε στραβά. Δοκίμασε ξανά.')
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
      {actionError && <AlertBanner variant="danger">{actionError}</AlertBanner>}
      <div className="actions-row">
        <Button variant="primary" icon={RefreshCw} loading={isRunning} onClick={handleActivate}>
          Ενεργοποίηση συγχρονισμού
        </Button>
      </div>
    </div>
  )
}
