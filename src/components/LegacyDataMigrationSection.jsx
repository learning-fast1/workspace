import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, RotateCcw } from 'lucide-react'
import { db } from '../db.js'
import useAuth from '../auth/useAuth.js'
import { MIGRATED_TABLE_NAMES } from '../migration/migratedTableNames.js'
import { getLegacyDataOwner, claimLegacyDataOwnership } from '../migration/legacyOwnership.js'
import { getMigrationState, runMigration } from '../migration/migrationEngine.js'
import Button from './ui/Button.jsx'
import AlertBanner from './ui/AlertBanner.jsx'
import './LegacyDataMigrationSection.css'

// Sprint 5A Phase 2, Commit 3 — ζει μέσα στο /settings, ΑΜΕΣΩΣ μετά το AccountSection (ίδιο μοτίβο:
// αυτο-gated, αποδίδει null όταν δεν έχει νόημα να εμφανιστεί, όχι ξεχωριστή σελίδα/route). ΔΕΝ
// υλοποιεί activeTable()/switchover, generation-aware backup, ownership reset, ή sync activation —
// αυτά ρητά εκτός scope εδώ (βλ. review). Το ΜΟΝΟ που κάνει: δείχνει στον χρήστη ότι υπάρχουν
// τοπικά δεδομένα, ζητά ΜΙΑ ρητή επιβεβαίωση πριν διεκδικήσει ιδιοκτησία, και μετά ξεκινά/συνεχίζει
// το ήδη υπάρχον, resumable runMigration() — ΠΟΤΕ αυτόματα, ΠΑΝΤΑ με ρητό κλικ.
export default function LegacyDataMigrationSection() {
  const { status, email, userId } = useAuth()
  const [isRunning, setIsRunning] = useState(false)
  const [actionError, setActionError] = useState(null)
  // Προστασία σε επίπεδο handler (όχι μόνο οπτικά μέσω του Button.loading) — ένα ref ελέγχεται ΚΑΙ
  // ορίζεται ΣΥΓΧΡΟΝΑ, πριν από οποιοδήποτε await· δύο γρήγορα, διαδοχικά κλικ πριν προλάβει να
  // ξαναγίνει render με isRunning=true θα διάβαζαν ΚΑΙ τα δύο το ίδιο, μπαγιάτικο state — το ref
  // δεν έχει αυτό το πρόβλημα, είναι ορατό αμέσως στο ίδιο tick.
  const runGuardRef = useRef(false)

  // Fail-closed (review, ασφάλεια 3): ακόμα κι αν status==='loggedIn', ΠΟΤΕ να μη θεωρηθεί
  // δεδομένο ότι υπάρχει userId — το πραγματικό dexie-cloud-addon API το έχει προαιρετικό.
  const hasValidUserId = status === 'loggedIn' && typeof userId === 'string' && userId.trim() !== ''

  // Το ίδιο combined query ΔΕΝ κάνει καμία κλήση owner/migration state όταν δεν υπάρχει έγκυρο
  // userId — μηδενική ανάγνωση, όχι μόνο μηδενική εμφάνιση.
  const data = useLiveQuery(async () => {
    if (!hasValidUserId) return null
    const owner = await getLegacyDataOwner()
    const counts = await Promise.all(MIGRATED_TABLE_NAMES.map((t) => db.table(t).count()))
    const hasLegacyData = counts.some((c) => c > 0)
    const migrationState = owner?.userId === userId ? await getMigrationState(userId) : null
    return { owner, hasLegacyData, migrationState }
  }, [hasValidUserId, userId])

  // Ο ΜΟΝΑΔΙΚΟΣ handler για: πρώτη επιβεβαίωση+έναρξη, συνέχεια μετά από διακοπή, και «δοκίμασε
  // ξανά» μετά από αποτυχία — και οι τρεις περιπτώσεις είναι το ΙΔΙΟ πράγμα (claim, idempotent αν
  // ήδη έγινε από τον ίδιο χρήστη· runMigration, ήδη resumable/idempotent από μόνο του).
  async function handleStartOrResume() {
    if (runGuardRef.current) return
    runGuardRef.current = true
    setIsRunning(true)
    setActionError(null)
    try {
      await claimLegacyDataOwnership(userId)
      await runMigration()
    } catch (err) {
      setActionError(err?.message || 'Κάτι πήγε στραβά. Δοκίμασε ξανά.')
    } finally {
      runGuardRef.current = false
      setIsRunning(false)
    }
  }

  if (status !== 'loggedIn') return null

  if (!hasValidUserId) {
    return (
      <div className="section legacy-data-migration-section">
        <h2>Προετοιμασία τοπικών δεδομένων</h2>
        <AlertBanner variant="warning">
          Δεν ήταν δυνατή η επιβεβαίωση της ταυτότητας του λογαριασμού σου αυτή τη στιγμή. Δοκίμασε να φορτώσεις ξανά τη σελίδα.
        </AlertBanner>
      </div>
    )
  }

  // Review (transient real-device ErrorBoundary crash κατά την ολοκλήρωση OTP, βλ.
  // src/phase2AuthTransitionRace.test.jsx) — ΟΧΙ μόνο data===undefined (το useLiveQuery's «ποτέ
  // δεν έτρεξε ακόμα» sentinel): το ίδιο το query σώμα επιστρέφει ρητά null όταν !hasValidUserId
  // (βλ. πιο πάνω) — άρα ΑΚΡΙΒΩΣ στο render όπου το hasValidUserId μόλις έγινε true (π.χ. το
  // userId μόλις έφτασε από db.cloud.currentUser), το useLiveQuery ΔΕΝ έχει προλάβει ακόμα να
  // ξανατρέξει με τα ΝΕΑ dependencies — ακόμα δείχνει το ΠΑΛΙΟ, ήδη-resolved αποτέλεσμα (null) από
  // το ΠΡΟΗΓΟΥΜΕΝΟ render όπου hasValidUserId ήταν false. Χωρίς αυτό το data===null branch,
  // data.hasLegacyData παρακάτω πετάει TypeError — ζωντανά αναπαραγμένο, όχι θεωρητικό.
  if (data === undefined || data === null) {
    return (
      <div className="section legacy-data-migration-section">
        <h2>Προετοιμασία τοπικών δεδομένων</h2>
        <p className="hint">Φόρτωση…</p>
      </div>
    )
  }

  if (!data.hasLegacyData) return null

  const { owner, migrationState } = data

  if (!owner) {
    return (
      <div className="section legacy-data-migration-section">
        <h2>Προετοιμασία τοπικών δεδομένων</h2>
        <p className="hint">
          Εντοπίστηκαν τοπικά δεδομένα σε αυτή τη συσκευή. Πριν μπορέσουν να προετοιμαστούν για συγχρονισμό,
          χρειάζεται να επιβεβαιώσεις ότι ανήκουν στον λογαριασμό <strong>{email}</strong>.
        </p>
        <p className="hint">
          Η επιβεβαίωση είναι μόνιμη για αυτά τα τοπικά δεδομένα — κανένας άλλος λογαριασμός δεν θα μπορεί να τα
          διεκδικήσει στη συνέχεια. Τα υπάρχοντα τοπικά δεδομένα δεν διαγράφονται, και μπορείς να συνεχίσεις να
          χρησιμοποιείς την εφαρμογή κανονικά, τοπικά, όσο διαρκεί η προετοιμασία.
        </p>
        {actionError && <AlertBanner variant="danger">{actionError}</AlertBanner>}
        <div className="actions-row">
          <Button variant="primary" icon={Check} loading={isRunning} onClick={handleStartOrResume}>
            Επιβεβαιώνω ότι τα τοπικά δεδομένα είναι δικά μου και ξεκινώ τη μεταφορά
          </Button>
        </div>
      </div>
    )
  }

  if (owner.userId !== userId) {
    return (
      <div className="section legacy-data-migration-section">
        <h2>Προετοιμασία τοπικών δεδομένων</h2>
        <AlertBanner variant="danger">
          Αυτή η συσκευή έχει ήδη τοπικά δεδομένα που ανήκουν σε διαφορετικό λογαριασμό από αυτόν με τον οποίο
          είσαι τώρα συνδεδεμένος/η ({email}). Δεν μπορούν να μεταφερθούν σε αυτόν τον λογαριασμό.
        </AlertBanner>
      </div>
    )
  }

  if (migrationState?.status === 'complete') {
    return (
      <div className="section legacy-data-migration-section">
        <h2>Προετοιμασία τοπικών δεδομένων</h2>
        <AlertBanner variant="success">Η προετοιμασία των τοπικών δεδομένων σου ολοκληρώθηκε.</AlertBanner>
      </div>
    )
  }

  const isFailed = migrationState?.status === 'failed'
  const isInterrupted = migrationState?.status === 'in_progress' || migrationState?.status === 'verifying'

  return (
    <div className="section legacy-data-migration-section">
      <h2>Προετοιμασία τοπικών δεδομένων</h2>
      {isFailed && migrationState?.lastError && (
        <AlertBanner variant="danger">{migrationState.lastError.message}</AlertBanner>
      )}
      {!isFailed && (
        <p className="hint">
          {isInterrupted
            ? 'Η προετοιμασία διακόπηκε πριν ολοκληρωθεί.'
            : 'Η προετοιμασία των τοπικών δεδομένων δεν έχει ξεκινήσει ακόμα.'}
        </p>
      )}
      {actionError && <AlertBanner variant="danger">{actionError}</AlertBanner>}
      <div className="actions-row">
        <Button variant="primary" icon={RotateCcw} loading={isRunning} onClick={handleStartOrResume}>
          {isFailed ? 'Δοκίμασε ξανά' : isInterrupted ? 'Συνέχεια μεταφοράς' : 'Έναρξη μεταφοράς'}
        </Button>
      </div>
    </div>
  )
}
