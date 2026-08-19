import { useSyncExternalStore } from 'react'
import { RefreshCw } from 'lucide-react'
import { getNeedRefresh, subscribe, applyUpdate } from '../pwaUpdate.js'
import './PwaUpdateBanner.css'

// Backlog fix (review χρήστη — «update-available UX», βρέθηκε κατά το hotfix production QA: ένα
// παλιό tab σέρβιρε stale bundle παρά το επιτυχές deploy). Ορατή, ρητή ειδοποίηση αντί για σιωπηλό
// αυτόματο reload (βλ. vite.config.js registerType:'prompt') — ο εκπαιδευτικός αποφασίζει ΠΟΤΕ,
// όχι το Workbox μέσα σε μια φόρμα. Fixed-position, πάνω από όλο το περιεχόμενο κάθε σελίδας — το
// .app-shell root δεν έχει δικό του stacking context (position/z-index), άρα δεν χρειάζεται portal
// (σε αντίθεση με το HeaderSearch mobile overlay, βλ. εκείνο το σχόλιο).
export default function PwaUpdateBanner() {
  const needRefresh = useSyncExternalStore(subscribe, getNeedRefresh)
  if (!needRefresh) return null

  return (
    <div className="pwa-update-banner" role="status">
      <span className="pwa-update-banner__text">Νέα έκδοση της εφαρμογής είναι διαθέσιμη.</span>
      <button type="button" className="pwa-update-banner__action" onClick={applyUpdate}>
        <RefreshCw size={16} aria-hidden="true" />
        Ανανέωση
      </button>
    </div>
  )
}
