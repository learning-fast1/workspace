import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import db, { CLOUD_ENABLED } from '../db.js'
import useAuth from '../auth/useAuth.js'
import { getCachedGeneration } from '../migration/activeGeneration.js'
import { getLegacyDataOwner } from '../migration/legacyOwnership.js'
import { checkSyncPrerequisites, isSessionSyncActive } from '../migration/syncAuthorization.js'
import { loadStudentsWithStats } from './StudentList.jsx'
import Button from './ui/Button.jsx'
import AlertBanner from './ui/AlertBanner.jsx'
import './SyncDiagnosticsPanel.css'

// ΠΡΟΣΩΡΙΝΟ, ΑΜΙΓΩΣ ΔΙΑΓΝΩΣΤΙΚΟ panel — real-device multi-device sync validation (student created σε
// Device A δεν εμφανίζεται σε Device B). Κρυμμένο πίσω από ?diag=1 στο URL (όχι localStorage/console
// flag — σκόπιμα, ώστε να ενεργοποιείται χωρίς devtools σε συσκευή χωρίς πρόσβαση σε Mac/Web
// Inspector, π.χ. iPad, πληκτρολογώντας απλά στη γραμμή διεύθυνσης). ΑΥΣΤΗΡΑ read-only: ΚΑΘΕ κλήση
// εδώ είναι .value/.count()/.toArray()/.where(...).first() πάνω σε ήδη-ανοιχτές Observable/πίνακες —
// καμία κλήση db.cloud.configure()/sync()/login() ή οποιαδήποτε write. Να αφαιρεθεί ΜΕΤΑ την
// ολοκλήρωση του Sprint 5A Phase 2 real-device validation.
export default function SyncDiagnosticsPanel() {
  const [searchParams] = useSearchParams()
  const enabled = searchParams.get('diag') === '1'
  const { status, email, userId } = useAuth()
  const [testCode, setTestCode] = useState('')
  const [testCodeResult, setTestCodeResult] = useState(null)
  const [snapshot, setSnapshot] = useState(null)
  const [refreshedAt, setRefreshedAt] = useState(null)

  async function runDiagnostics() {
    if (!enabled) return

    const cloudAvailable = CLOUD_ENABLED && !!db.cloud

    const currentUser = cloudAvailable ? db.cloud.currentUser.value : null
    const syncState = cloudAvailable ? db.cloud.syncState.value : null
    const persistedSyncState = cloudAvailable ? db.cloud.persistedSyncState.value : null

    const sessionSyncActive = isSessionSyncActive()
    const prerequisites = status === 'loggedIn' && userId ? await checkSyncPrerequisites(userId) : null

    const owner = await getLegacyDataOwner()
    const ownershipMatch = Boolean(owner && userId && owner.userId === userId)

    let studentsV2Count = null
    let pendingMutationCount = null
    try {
      studentsV2Count = await db.table('students_v2').count()
    } catch (err) {
      studentsV2Count = `σφάλμα: ${serializeError(err)}`
    }
    try {
      pendingMutationCount = await db.table('$students_v2_mutations').count()
    } catch (err) {
      pendingMutationCount = `σφάλμα: ${serializeError(err)}`
    }

    // Καλεί ΤΗΝ ΙΔΙΑ ακριβώς συνάρτηση που χρησιμοποιεί το StudentList.jsx (exported ρητά γι' αυτόν
    // τον σκοπό, καμία αλλαγή συμπεριφοράς) — ώστε να φανεί αν το ίδιο το query της StudentList
    // επιστρέφει 0 εγγραφές, ή αν επιστρέφει περισσότερες και χάνονται αργότερα σε filter/render.
    let studentListResultCount = null
    try {
      studentListResultCount = (await loadStudentsWithStats()).length
    } catch (err) {
      studentListResultCount = `σφάλμα: ${serializeError(err)}`
    }

    setSnapshot({
      cloudAvailable,
      email: status === 'loggedIn' ? email : null,
      userId: status === 'loggedIn' ? userId : null,
      currentUserId: currentUser?.userId || null,
      sessionSyncActive,
      prerequisitesOk: prerequisites?.ok ?? null,
      prerequisitesReason: prerequisites?.reason ?? null,
      activeGeneration: getCachedGeneration(),
      ownerUserId: owner?.userId || null,
      ownershipMatch,
      syncPhase: syncState?.phase ?? null,
      syncStatus: syncState?.status ?? null,
      syncError: serializeError(syncState?.error),
      initiallySynced: persistedSyncState?.initiallySynced ?? null,
      serverRevision: persistedSyncState?.serverRevision ?? null,
      yServerRevision: persistedSyncState?.yServerRevision ?? null,
      realms: persistedSyncState?.realms || [],
      inviteRealms: persistedSyncState?.inviteRealms || [],
      studentsV2Count,
      pendingMutationCount,
      studentListResultCount
    })
    setRefreshedAt(new Date())
  }

  useEffect(() => {
    runDiagnostics()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  async function handleCheckTestCode() {
    const code = testCode.trim()
    if (!code) {
      setTestCodeResult(null)
      return
    }
    try {
      const row = await db.table('students_v2').where('code').equals(code).first()
      setTestCodeResult(row ? { found: true, id: row.id } : { found: false })
    } catch (err) {
      setTestCodeResult({ found: false, error: serializeError(err) })
    }
  }

  if (!enabled) return null

  return (
    <div className="section sync-diagnostics-panel">
      <h2>🛠 Διαγνωστικά συγχρονισμού (προσωρινό)</h2>
      <AlertBanner variant="warning">
        Προσωρινό, αναπτυξιακό panel για επαλήθευση συγχρονισμού μεταξύ συσκευών — θα αφαιρεθεί.
        Δεν εμφανίζει ονόματα μαθητών, σημειώσεις ή δεδομένα αξιολόγησης.
      </AlertBanner>

      <div className="actions-row">
        <Button variant="secondary" icon={RefreshCw} onClick={runDiagnostics}>
          Ανανέωση διαγνωστικών
        </Button>
        {refreshedAt && <span className="hint">Τελευταία ανανέωση: {refreshedAt.toLocaleTimeString('el-GR')}</span>}
      </div>

      {!snapshot ? (
        <p className="hint">Φόρτωση…</p>
      ) : !snapshot.cloudAvailable ? (
        <p className="hint">Το cloud sync δεν είναι ενεργό σε αυτή τη φόρτωση (CLOUD_ENABLED=false).</p>
      ) : (
        <table className="sync-diagnostics-panel__table">
          <tbody>
            <tr><th>Email</th><td>{snapshot.email ?? '—'}</td></tr>
            <tr><th>userId (auth)</th><td>{snapshot.userId ?? '—'}</td></tr>
            <tr><th>userId (db.cloud.currentUser)</th><td>{snapshot.currentUserId ?? '—'}</td></tr>
            <tr><th>Sync ενεργός αυτή τη φόρτωση</th><td>{String(snapshot.sessionSyncActive)}</td></tr>
            <tr><th>Προϋποθέσεις sync ok</th><td>{String(snapshot.prerequisitesOk)} {snapshot.prerequisitesReason ? `(${snapshot.prerequisitesReason})` : ''}</td></tr>
            <tr><th>Ενεργή γενιά (activeTable routing)</th><td>{snapshot.activeGeneration}</td></tr>
            <tr><th>Ιδιοκτήτης legacy δεδομένων (userId)</th><td>{snapshot.ownerUserId ?? '—'}</td></tr>
            <tr><th>Ταίριασμα ιδιοκτησίας</th><td>{String(snapshot.ownershipMatch)}</td></tr>
            <tr><th>syncState.phase</th><td>{snapshot.syncPhase ?? '—'}</td></tr>
            <tr><th>syncState.status</th><td>{snapshot.syncStatus ?? '—'}</td></tr>
            <tr><th>syncState.error</th><td>{snapshot.syncError ?? '—'}</td></tr>
            <tr><th>persistedSyncState.initiallySynced</th><td>{String(snapshot.initiallySynced)}</td></tr>
            <tr><th>persistedSyncState.serverRevision</th><td>{snapshot.serverRevision ?? '—'}</td></tr>
            <tr><th>persistedSyncState.yServerRevision</th><td>{snapshot.yServerRevision ?? '—'}</td></tr>
            <tr><th>realms</th><td>{snapshot.realms.length ? snapshot.realms.join(', ') : '—'}</td></tr>
            <tr><th>inviteRealms</th><td>{snapshot.inviteRealms.length ? snapshot.inviteRealms.join(', ') : '—'}</td></tr>
            <tr><th>students_v2 πλήθος γραμμών (τοπικά)</th><td>{snapshot.studentsV2Count}</td></tr>
            <tr><th>$students_v2_mutations εκκρεμείς</th><td>{snapshot.pendingMutationCount}</td></tr>
            <tr><th>StudentList query result count</th><td>{snapshot.studentListResultCount}</td></tr>
          </tbody>
        </table>
      )}

      {snapshot?.cloudAvailable && (
        <div className="sync-diagnostics-panel__test-code">
          <label htmlFor="diag-test-code">Έλεγχος κωδικού μαθητή (τοπικά, students_v2)</label>
          <div className="actions-row">
            <input
              id="diag-test-code"
              type="text"
              value={testCode}
              onChange={(e) => setTestCode(e.target.value)}
              placeholder="π.χ. Μ1"
            />
            <Button variant="secondary" onClick={handleCheckTestCode}>Έλεγχος</Button>
          </div>
          {testCodeResult && (
            <p className="hint">
              {testCodeResult.error
                ? `Σφάλμα: ${testCodeResult.error}`
                : testCodeResult.found
                  ? `Βρέθηκε τοπικά (id: ${testCodeResult.id}).`
                  : 'Δεν βρέθηκε τοπικά.'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function serializeError(err) {
  if (!err) return null
  if (typeof err === 'string') return err
  if (err instanceof Error) return `${err.name}: ${err.message}`
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}
