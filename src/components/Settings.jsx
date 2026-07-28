import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { getActiveSchoolYear, listSchoolYears } from '../db.js'
import { exportBackupFile, validateBackupPayload, restoreFromBackup } from '../utils/backup.js'
import { schoolYearToDateRange } from '../utils/schoolYearFilter.js'
import { formatDateEl } from '../utils/date.js'
import DisplayNameSection from './DisplayNameSection.jsx'
import StorageSafetySection from './StorageSafetySection.jsx'
import AccountSection from './AccountSection.jsx'
import LegacyDataMigrationSection from './LegacyDataMigrationSection.jsx'
import GenerationSwitchoverSection from './GenerationSwitchoverSection.jsx'
import EnableSyncSection from './EnableSyncSection.jsx'
import SyncDiagnosticsPanel from './SyncDiagnosticsPanel.jsx'

const TABLE_LABELS = {
  students: 'Μαθητές',
  goals: 'Στόχοι',
  domainTemplates: 'Templates τομέων',
  sessions: 'Συνεδρίες',
  measurements: 'Μετρήσεις',
  observations: 'Παρατηρήσεις',
  reports: 'Εκθέσεις',
  dailyQueue: 'Σημερινή σειρά',
  scheduleSlots: 'Πρόγραμμα',
  scheduleExceptions: 'Εξαιρέσεις προγράμματος',
  calendarEvents: 'Γεγονότα ημερολογίου'
}

// Χτίζει το URL προς το Session History με το κοινό date range ενός σχολικού έτους (Technical Plan
// Στάδιο 11, σημείο 1) — ΚΑΜΙΑ δεύτερη μετατροπή, μόνο schoolYearToDateRange + query params. Το
// yearLabel περνάει ΜΟΝΟ για την ορατή ένδειξη «Προβολή ιστορικού έτους: …» στο Session History
// (σημείο 5) — δεν επηρεάζει το ίδιο το φιλτράρισμα.
function sessionsHistoryLinkFor(schoolYear) {
  const { dateFrom, dateTo } = schoolYearToDateRange(schoolYear)
  const params = new URLSearchParams({ dateFrom, dateTo, yearLabel: schoolYear.label })
  return `/sessions?${params.toString()}`
}

export default function Settings() {
  const fileInputRef = useRef(null)
  const fileRequestIdRef = useRef(0) // ακυρώνει πιο αργές, ξεπερασμένες αναγνώσεις αρχείου

  const [exporting, setExporting] = useState(false)
  const [exportStatus, setExportStatus] = useState(null)
  const [exportError, setExportError] = useState(null)

  const [pendingRestore, setPendingRestore] = useState(null) // { payload, counts, filename }
  const [importError, setImportError] = useState(null)
  const [restoring, setRestoring] = useState(false)
  const [restoreError, setRestoreError] = useState(null)
  const [restoreDone, setRestoreDone] = useState(false)

  // Fresh-install prompt (σημείο 3) — απλό, ΜΗ επίμονο local state: κλείνει με «Αργότερα» και ΔΕΝ
  // ξαναεμφανίζεται όσο η σελίδα Ρυθμίσεις παραμένει mounted (καμία ενόχληση σε κάθε render μέσα
  // στην ίδια επίσκεψη) — αλλά ΕΠΑΝΕΜΦΑΝΙΖΕΤΑΙ φυσικά στην επόμενη επίσκεψη στις Ρυθμίσεις ή μετά
  // από reload (το component ξαναμοντάρεται, το state ξαναρχίζει από false) — ΧΩΡΙΣ καμία
  // persisted "dismissed" σημαία στη βάση/localStorage, ίδια αρχή με το «δεν χρειάζεται draft σε
  // database» του Σταδίου 10.
  const [promptDismissed, setPromptDismissed] = useState(false)

  // 4 σαφείς καταστάσεις (σημείο 4): undefined = loading· { status:'error' }· { status:'ok', year:null }
  // = κανένα ενεργό· { status:'ok', year } = ενεργό έτος. Ζωντανό μέσω useLiveQuery — ενημερώνεται
  // αυτόματα (χωρίς reload) μόλις το applySchoolYearTransition (Στάδιο 10) κάνει commit.
  const activeYearResult = useLiveQuery(async () => {
    try {
      const year = await getActiveSchoolYear()
      return { status: 'ok', year }
    } catch (err) {
      return { status: 'error', message: err?.message || 'Σφάλμα ανάγνωσης του ενεργού σχολικού έτους.' }
    }
  }, [])

  const allSchoolYears = useLiveQuery(listSchoolYears, [])
  // Ιστορικά = ΜΟΝΟ πραγματικές εγγραφές schoolYears εκτός του ενεργού (σημείο 2) — καμία
  // αναδρομική ανακατασκευή π.χ. από goals.startDate. Πιο πρόσφατο πρώτο, για ευκολότερη εύρεση.
  const historicalYears = (allSchoolYears || [])
    .filter((y) => !y.isActive)
    .slice()
    .reverse()

  const isFreshInstall = allSchoolYears !== undefined && allSchoolYears.length === 0

  async function handleExport() {
    setExporting(true)
    setExportError(null)
    try {
      const { filename, counts } = await exportBackupFile()
      setExportStatus({ filename, counts })
    } catch (err) {
      setExportError(err?.message || 'Η λήψη απέτυχε. Δοκίμασε ξανά.')
    } finally {
      setExporting(false)
    }
  }

  function handleFileChosen(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // επιτρέπει να ξαναδιαλέξει το ίδιο αρχείο
    if (!file) return

    const requestId = ++fileRequestIdRef.current // κάθε νέα επιλογή ακυρώνει τυχόν προηγούμενη ανάγνωση σε εξέλιξη

    setImportError(null)
    setRestoreError(null)
    setPendingRestore(null)
    setRestoreDone(false)

    const reader = new FileReader()
    reader.onload = () => {
      if (fileRequestIdRef.current !== requestId) return // ξεπερασμένη ανάγνωση — αγνοείται

      let payload
      try {
        payload = JSON.parse(reader.result)
      } catch {
        setImportError('Το αρχείο δεν είναι έγκυρο JSON.')
        return
      }
      const result = validateBackupPayload(payload)
      if (!result.valid) {
        setImportError(result.error)
        return
      }
      setPendingRestore({ payload, counts: result.counts, filename: file.name })
    }
    reader.onerror = () => {
      if (fileRequestIdRef.current !== requestId) return
      setImportError('Δεν ήταν δυνατή η ανάγνωση του αρχείου.')
    }
    reader.readAsText(file)
  }

  async function handleConfirmRestore() {
    if (!pendingRestore) return
    setRestoring(true)
    setRestoreError(null)
    try {
      await restoreFromBackup(pendingRestore.payload)
      setRestoreDone(true)
      setPendingRestore(null)
    } catch (err) {
      setRestoreError(err?.message || 'Η επαναφορά απέτυχε — τα δεδομένα ενδέχεται να είναι μερικώς ενημερωμένα. Δοκίμασε ξανά ή κάνε reload της σελίδας.')
    } finally {
      setRestoring(false)
    }
  }

  return (
    <div className="page">
      <div className="top-bar">
        <Link to="/" className="btn btn-link">← Αρχική</Link>
      </div>

      <h1>Ρυθμίσεις</h1>

      {/* Readiness blockers v1 (review χρήστη) — ΠΡΩΤΗ ενότητα, πριν καν το Λογαριασμό: δεν
          εξαρτάται από cloud/login (βλ. DisplayNameSection.jsx). */}
      <DisplayNameSection />
      {/* Sprint 5A Phase 1 — πάνω από το Σχολικό έτος (Technical Plan §Flows, ροή 1). Δεν αποδίδει
          τίποτα αν CLOUD_ENABLED=false (βλ. AccountSection.jsx). */}
      <AccountSection />
      {/* Sprint 5A Phase 2, Commit 3 — αμέσως μετά το AccountSection: έχει νόημα μόνο ΜΕΤΑ τη
          σύνδεση. Αυτο-gated (βλ. LegacyDataMigrationSection.jsx) — αποδίδει null αν δεν είναι
          συνδεδεμένος ή δεν υπάρχουν καθόλου τοπικά δεδομένα προς προετοιμασία. */}
      <LegacyDataMigrationSection />
      {/* Sprint 5A Phase 2, Commit 4A — αμέσως μετά: έχει νόημα μόνο ΜΕΤΑ από ολοκληρωμένο
          migration. Αυτο-gated (βλ. GenerationSwitchoverSection.jsx). */}
      <GenerationSwitchoverSection />
      {/* Sprint 5A Phase 2, Commit 6 — αμέσως μετά: έχει νόημα μόνο ΜΕΤΑ από ενεργή v2 γενιά.
          Αυτο-gated (βλ. EnableSyncSection.jsx). */}
      <EnableSyncSection />
      {/* Προσωρινό — real-device multi-device sync validation (Sprint 5A Phase 2). Κρυμμένο πίσω
          από ?diag=1 (βλ. SyncDiagnosticsPanel.jsx). Να αφαιρεθεί μετά την ολοκλήρωση. */}
      <SyncDiagnosticsPanel />

      <div className="section">
        <h2>Σχολικό έτος</h2>

        {activeYearResult === undefined && <p className="hint">Φόρτωση…</p>}

        {activeYearResult?.status === 'error' && (
          <p className="hint">⚠️ {activeYearResult.message}</p>
        )}

        {activeYearResult?.status === 'ok' && activeYearResult.year && (
          <p className="hint">
            Ενεργό σχολικό έτος: <strong>{activeYearResult.year.label}</strong>{' '}
            ({formatDateEl(activeYearResult.year.startDate)} – {formatDateEl(activeYearResult.year.endDate)})
          </p>
        )}

        {activeYearResult?.status === 'ok' && !activeYearResult.year && !isFreshInstall && (
          <p className="hint">Κανένα ενεργό σχολικό έτος αυτή τη στιγμή.</p>
        )}

        {/* Fresh-install prompt (σημείο 3) — ήπιο, όχι modal/blocking, με σαφές κουμπί ορισμού ΚΑΙ
            σαφή δυνατότητα κλεισίματος· καμία αυτόματη δημιουργία έτους χωρίς ρητή ενέργεια εδώ. */}
        {isFreshInstall && !promptDismissed && (
          <div className="notice">
            <p><strong>Ποιο είναι το τρέχον σχολικό έτος;</strong></p>
            <p>Ο ορισμός του βοηθά στην οργάνωση μαθητών, στόχων και προγράμματος ανά έτος.</p>
            <div className="actions-row">
              <Link to="/settings/school-year-transition" className="btn btn-primary">Ορισμός τώρα</Link>
              <button type="button" className="btn btn-secondary" onClick={() => setPromptDismissed(true)}>
                Αργότερα
              </button>
            </div>
          </div>
        )}

        <p className="hint">
          Στο τέλος της χρονιάς, μετάβαση στο νέο σχολικό έτος — ποιοι μαθητές συνεχίζουν, ποιοι
          στόχοι ολοκληρώνονται ή συνεχίζονται, και προαιρετική ανανέωση του προγράμματος.
        </p>
        <div className="actions-row">
          <Link to="/settings/school-year-transition" className="btn btn-secondary">
            Μετάβαση σε νέο σχολικό έτος
          </Link>
        </div>

        {historicalYears.length > 0 && (
          <>
            <h2>Ιστορικά σχολικά έτη</h2>
            <p className="hint">
              Παλαιότερα δεδομένα, πριν καταγραφεί το πρώτο σχολικό έτος, παραμένουν προσβάσιμα
              κανονικά μέσω των φίλτρων ημερομηνίας ή της επιλογής «Όλα» στις αντίστοιχες οθόνες.
            </p>
            <ul className="school-year-history-list">
              {historicalYears.map((y) => (
                <li key={y.id} className="school-year-history-list__row">
                  <span>{y.label} ({formatDateEl(y.startDate)} – {formatDateEl(y.endDate)})</span>
                  <Link to={sessionsHistoryLinkFor(y)} className="btn btn-secondary">
                    Δες συνεδρίες αυτού του έτους
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Readiness blockers v1 (review χρήστη) — ΑΜΕΣΩΣ πριν το «Αντίγραφο ασφαλείας»: ρητή οπτική
          σύνδεση storage persistence ↔ ανάγκη τακτικού backup (βλ. StorageSafetySection.jsx). */}
      <StorageSafetySection />

      <div className="section" id="backup-section">
        <h2>Αντίγραφο ασφαλείας</h2>
        <p className="hint">
          Όλα τα δεδομένα μένουν μόνο σε αυτή τη συσκευή. Κατέβασε τακτικά αντίγραφο ασφαλείας —
          αν καθαριστεί η μνήμη του browser ή αλλάξεις συσκευή, χωρίς αντίγραφο τα δεδομένα χάνονται οριστικά.
        </p>
        <div className="actions-row">
          <button type="button" className="btn btn-primary" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Δημιουργία…' : '⬇️ Λήψη αντιγράφου ασφαλείας'}
          </button>
        </div>
        {exportError && <p className="hint">⚠️ {exportError}</p>}
        {exportStatus && !exporting && (
          <p className="hint">
            ✓ Αποθηκεύτηκε ως «{exportStatus.filename}» —{' '}
            {Object.entries(exportStatus.counts).map(([t, c]) => `${TABLE_LABELS[t]}: ${c}`).join(', ')}.
          </p>
        )}
      </div>

      <div className="section">
        <h2>♻️ Επαναφορά από αντίγραφο</h2>
        <p className="hint">
          Διάλεξε ένα αρχείο JSON που κατέβασες προηγουμένως από εδώ.
        </p>
        <div className="actions-row">
          <button type="button" className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
            📂 Επιλογή αρχείου
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleFileChosen}
            className="hidden-file-input"
          />
        </div>

        {importError && <p className="hint">⚠️ {importError}</p>}

        {pendingRestore && (
          <div className="notice">
            <h2>⚠️ Προσοχή — αντικατάσταση δεδομένων</h2>
            <p>
              Το αρχείο «{pendingRestore.filename}» περιέχει:{' '}
              {Object.entries(pendingRestore.counts).map(([t, c]) => `${TABLE_LABELS[t]}: ${c}`).join(', ')}.
            </p>
            <p><strong>Η επαναφορά θα ΔΙΑΓΡΑΨΕΙ όλα τα τρέχοντα δεδομένα της εφαρμογής και θα τα αντικαταστήσει με αυτά του αρχείου. Δεν μπορεί να αναιρεθεί.</strong></p>
            {restoreError && <p>⚠️ {restoreError}</p>}
            <div className="actions-row">
              <button type="button" className="btn btn-danger" onClick={handleConfirmRestore} disabled={restoring}>
                {restoring ? 'Γίνεται επαναφορά…' : 'Ναι, αντικατέστησε τα δεδομένα'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setPendingRestore(null)} disabled={restoring}>
                Άκυρο
              </button>
            </div>
          </div>
        )}

        {restoreDone && <p className="hint">✓ Η επαναφορά ολοκληρώθηκε. Τα δεδομένα ενημερώθηκαν σε όλη την εφαρμογή.</p>}
      </div>
    </div>
  )
}
