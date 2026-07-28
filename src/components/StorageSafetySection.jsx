import { useEffect, useState } from 'react'
import { ShieldCheck, ShieldAlert, ShieldQuestion } from 'lucide-react'
import { getStorageStatus, requestPersistentStorage } from '../utils/storagePersistence.js'
import Button from './ui/Button.jsx'
import AlertBanner from './ui/AlertBanner.jsx'
import './StorageSafetySection.css'

// Readiness blockers v1 (review χρήστη) — Storage Safety. Ζωντανή κατάσταση του browser (ΟΧΙ
// αποθηκευμένη πουθενά), δίπλα στο υπάρχον «Αντίγραφο ασφαλείας» (ρητή οπτική σύνδεση, review).
// ΚΑΝΕΝΑ αίτημα persist() αυτόματα στο mount — μόνο μέσω ρητού κλικ (βλ. storagePersistence.js).
// ΚΑΜΙΑ ψευδής υπόσχεση: το προειδοποιητικό κείμενο για το τακτικό backup εμφανίζεται σε ΚΑΘΕ
// κατάσταση εκτός από 'checking' — ΑΚΟΜΑ ΚΑΙ 'active'.
const BACKUP_REMINDER_TEXT = 'Ακόμα και με ενεργή μόνιμη αποθήκευση, τα δεδομένα υπάρχουν μόνο σε αυτή τη συσκευή. Το τακτικό αντίγραφο ασφαλείας παραμένει απαραίτητο.'

const STATUS_META = {
  active: { variant: 'success', icon: ShieldCheck, title: 'Η μόνιμη αποθήκευση είναι ενεργή σε αυτή τη συσκευή.' },
  requestable: { variant: 'info', icon: ShieldQuestion, title: 'Η μόνιμη αποθήκευση δεν είναι ακόμα ενεργή.' },
  denied: { variant: 'warning', icon: ShieldAlert, title: 'Ο browser αρνήθηκε το αίτημα μόνιμης αποθήκευσης.' },
  unsupported: { variant: 'warning', icon: ShieldAlert, title: 'Αυτός ο browser δεν υποστηρίζει μόνιμη αποθήκευση.' },
  error: { variant: 'warning', icon: ShieldAlert, title: 'Δεν ήταν δυνατός ο έλεγχος μόνιμης αποθήκευσης.' }
}

export default function StorageSafetySection() {
  const [status, setStatus] = useState(undefined) // undefined = «checking», ίδιο idiom με useLiveQuery
  const [requesting, setRequesting] = useState(false)

  useEffect(() => {
    let cancelled = false
    getStorageStatus().then((s) => { if (!cancelled) setStatus(s) })
    return () => { cancelled = true }
  }, [])

  async function handleRequest() {
    setRequesting(true)
    try {
      const result = await requestPersistentStorage()
      setStatus(result)
    } finally {
      setRequesting(false)
    }
  }

  // Καθαρό DOM scroll (ΟΧΙ react-router Link/hash) — το HashRouter της εφαρμογής (βλ. App.jsx)
  // καταναλώνει ΟΛΟΚΛΗΡΟ το URL hash ως route· ένα #backup fragment θα σπούσε την πλοήγηση
  // (θα ερμηνευόταν σαν άγνωστο route /backup). Η ενότητα backup ζει ήδη στην ΙΔΙΑ σελίδα
  // (Settings.jsx), αμέσως παρακάτω — απλό scrollIntoView αρκεί, καμία πλοήγηση χρειάζεται.
  function scrollToBackupSection() {
    document.getElementById('backup-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (status === undefined) {
    return (
      <div className="section storage-safety-section">
        <h2>Ασφάλεια αποθήκευσης</h2>
        <p className="hint" aria-busy="true">Έλεγχος…</p>
      </div>
    )
  }

  const meta = STATUS_META[status]
  const Icon = meta.icon
  // CTA προς backup (review, σημείο 3): σε ΚΑΘΕ κατάσταση εκτός από 'active' — 'unsupported',
  // 'denied' ΚΑΙ 'error' εξίσου, όχι μόνο οι δύο ρητά αναφερόμενες.
  const showBackupCta = status !== 'active'

  return (
    <div className="section storage-safety-section">
      <h2>Ασφάλεια αποθήκευσης</h2>
      <AlertBanner variant={meta.variant} icon={Icon}>{meta.title}</AlertBanner>
      <p className="hint">{BACKUP_REMINDER_TEXT}</p>

      {status === 'requestable' && (
        <div className="actions-row">
          <Button variant="primary" loading={requesting} onClick={handleRequest}>
            Ζήτησε μόνιμη αποθήκευση
          </Button>
        </div>
      )}

      {showBackupCta && (
        <div className="actions-row">
          <Button variant="secondary" onClick={scrollToBackupSection}>Πήγαινε στο αντίγραφο ασφαλείας</Button>
        </div>
      )}
    </div>
  )
}
