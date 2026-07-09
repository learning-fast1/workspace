import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { exportBackupFile, validateBackupPayload, restoreFromBackup } from '../utils/backup.js'

const TABLE_LABELS = {
  students: 'Μαθητές',
  goals: 'Στόχοι',
  domainTemplates: 'Templates τομέων',
  sessions: 'Συνεδρίες',
  measurements: 'Μετρήσεις',
  observations: 'Παρατηρήσεις'
}

export default function Settings() {
  const fileInputRef = useRef(null)
  const [exportStatus, setExportStatus] = useState(null)
  const [pendingRestore, setPendingRestore] = useState(null) // { payload, counts, filename }
  const [importError, setImportError] = useState(null)
  const [restoring, setRestoring] = useState(false)
  const [restoreDone, setRestoreDone] = useState(false)

  async function handleExport() {
    setExportStatus('exporting')
    const { filename, counts } = await exportBackupFile()
    setExportStatus({ filename, counts })
  }

  function handleFileChosen(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // επιτρέπει να ξαναδιαλέξει το ίδιο αρχείο
    if (!file) return

    setImportError(null)
    setPendingRestore(null)
    setRestoreDone(false)

    const reader = new FileReader()
    reader.onload = () => {
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
    reader.onerror = () => setImportError('Δεν ήταν δυνατή η ανάγνωση του αρχείου.')
    reader.readAsText(file)
  }

  async function handleConfirmRestore() {
    if (!pendingRestore) return
    setRestoring(true)
    await restoreFromBackup(pendingRestore.payload)
    setRestoring(false)
    setRestoreDone(true)
    setPendingRestore(null)
  }

  return (
    <div className="page">
      <div className="top-bar">
        <Link to="/" className="btn btn-link">← Αρχική</Link>
      </div>

      <h1>Ρυθμίσεις</h1>

      <div className="section">
        <h2>💾 Αντίγραφο ασφαλείας</h2>
        <p className="hint">
          Όλα τα δεδομένα μένουν μόνο σε αυτή τη συσκευή. Κατέβασε τακτικά αντίγραφο ασφαλείας —
          αν καθαριστεί η μνήμη του browser ή αλλάξεις συσκευή, χωρίς αντίγραφο τα δεδομένα χάνονται οριστικά.
        </p>
        <div className="actions-row">
          <button type="button" className="btn btn-primary" onClick={handleExport} disabled={exportStatus === 'exporting'}>
            {exportStatus === 'exporting' ? 'Δημιουργία…' : '⬇️ Λήψη αντιγράφου ασφαλείας'}
          </button>
        </div>
        {exportStatus && exportStatus !== 'exporting' && (
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
