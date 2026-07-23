import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { RefreshCw } from 'lucide-react'
import useAuth from '../auth/useAuth.js'
import { getMigrationState } from '../migration/migrationEngine.js'
import { getActiveGeneration, activateV2Generation } from '../migration/activeGeneration.js'
import Button from './ui/Button.jsx'
import AlertBanner from './ui/AlertBanner.jsx'
import './GenerationSwitchoverSection.css'

// Sprint 5A Phase 2, Commit 4A — ζει μέσα στο /settings, ΑΜΕΣΩΣ μετά το LegacyDataMigrationSection
// (ίδιο auto-gated μοτίβο). Σε ΑΥΤΟ το commit η ίδια η ενεργοποίηση είναι ΑΔΡΑΝΗΣ σε ό,τι αφορά
// την υπόλοιπη εφαρμογή — κανένα άλλο call site δεν χρησιμοποιεί ακόμα το activeTable() (βλ.
// Commit 4B) — αλλά η ροή είναι ήδη πλήρης, ελεγμένη, και ασφαλής να εκτεθεί: γράφει το appMeta
// marker μέσω του ΜΟΝΑΔΙΚΟΥ activateV2Generation, μετά ΥΠΟΧΡΕΩΤΙΚΟ πλήρες reload — ΠΟΤΕ in-place
// αντιδραστική εναλλαγή (review).
export default function GenerationSwitchoverSection() {
  const { status, userId } = useAuth()
  const [isRunning, setIsRunning] = useState(false)
  const [actionError, setActionError] = useState(null)
  const runGuardRef = useRef(false)

  const hasValidUserId = status === 'loggedIn' && typeof userId === 'string' && userId.trim() !== ''

  const data = useLiveQuery(async () => {
    if (!hasValidUserId) return null
    const generation = await getActiveGeneration(userId)
    if (generation === 'v2') return { generation: 'v2' }
    const migrationState = await getMigrationState(userId)
    return { generation: 'legacy', migrationComplete: migrationState.status === 'complete' }
  }, [hasValidUserId, userId])

  async function handleActivate() {
    if (runGuardRef.current) return
    runGuardRef.current = true
    setIsRunning(true)
    setActionError(null)
    try {
      await activateV2Generation(userId)
      window.location.reload()
    } catch (err) {
      setActionError(err?.message || 'Κάτι πήγε στραβά. Δοκίμασε ξανά.')
      runGuardRef.current = false
      setIsRunning(false)
    }
  }

  if (!hasValidUserId) return null
  if (data === undefined) return null
  if (data.generation !== 'v2' && !data.migrationComplete) return null

  if (data.generation === 'v2') {
    return (
      <div className="section generation-switchover-section">
        <h2>Νέα έκδοση δεδομένων</h2>
        <AlertBanner variant="success">Η νέα έκδοση δεδομένων είναι ενεργή σε αυτή τη συσκευή.</AlertBanner>
      </div>
    )
  }

  return (
    <div className="section generation-switchover-section">
      <h2>Νέα έκδοση δεδομένων</h2>
      <p className="hint">
        Η προετοιμασία των δεδομένων σου ολοκληρώθηκε. Μπορείς τώρα να ενεργοποιήσεις τη νέα,
        συγχρονιζόμενη έκδοση σε αυτή τη συσκευή. Η εφαρμογή θα επαναφορτωθεί αμέσως μετά — τα
        παλιά τοπικά δεδομένα δεν διαγράφονται.
      </p>
      {actionError && <AlertBanner variant="danger">{actionError}</AlertBanner>}
      <div className="actions-row">
        <Button variant="primary" icon={RefreshCw} loading={isRunning} onClick={handleActivate}>
          Ενεργοποίηση νέας έκδοσης δεδομένων
        </Button>
      </div>
    </div>
  )
}
