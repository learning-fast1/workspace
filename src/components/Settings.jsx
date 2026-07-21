import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { exportBackupFile, validateBackupPayload, restoreFromBackup } from '../utils/backup.js'
import AccountSection from './AccountSection.jsx'

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

      {/* Sprint 5A Phase 1 — πρώτη ενότητα, πάνω από το Σχολικό έτος (Technical Plan §Flows,
          ροή 1). Δεν αποδίδει τίποτα αν CLOUD_ENABLED=false (βλ. AccountSection.jsx). */}
      <AccountSection />

      <div className="section">
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
