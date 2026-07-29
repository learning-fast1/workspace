import { Wifi, Smartphone } from 'lucide-react'
import { version } from '../../package.json'
import './ApplicationSection.css'

// Teacher Profile + Settings (UI Design v3, εγκεκριμένο) — tab «Εφαρμογή». Καθαρά πληροφοριακό,
// καμία ενέργεια/query εδώ. Το version διαβάζεται απευθείας από το package.json (Vite υποστηρίζει
// JSON imports εγγενώς) — ΜΙΑ πηγή αλήθειας, όχι διπλό αντίγραφο του αριθμού έκδοσης.
//
// Σκόπιμα ΕΚΤΟΣ (review χρήστη): «Τι νέο υπάρχει» / release notes — θα απαιτούσε ξεχωριστό,
// συνεχές content-authoring για κάθε έκδοση, ξεχωριστή μελλοντική απόφαση.
export default function ApplicationSection() {
  return (
    <div className="section application-section">
      <h2>Workspace</h2>
      <p className="hint">Έκδοση {version}</p>

      <h3>Λειτουργία χωρίς σύνδεση</h3>
      <p className="application-section__row"><Wifi size={16} aria-hidden="true" /> Λειτουργεί πλήρως offline — τα δεδομένα σου δεν χρειάζονται σύνδεση στο διαδίκτυο.</p>
      <p className="application-section__row"><Smartphone size={16} aria-hidden="true" /> Μπορείς να το εγκαταστήσεις στη συσκευή σου σαν εφαρμογή.</p>

      <h3>Απόρρητο</h3>
      <p className="hint">
        Τα δεδομένα σου μένουν σε αυτή τη συσκευή. Αν ενεργοποιήσεις προαιρετικό συγχρονισμό,
        χρειάζεται πρώτα να επιβεβαιώσεις ότι έχεις την απαραίτητη εξουσιοδότηση από το σχολείο ή
        τον οργανισμό σου.
      </p>
    </div>
  )
}
