import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { ensureDomainTemplatesSeeded, migrateDomainNamesToIds, migrateGoalDomainsToBroaderDomains } from './db.js'
import { initializeActiveGeneration } from './migration/activeGeneration.js'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import AuthProvider from './auth/AuthProvider.jsx'
import './index.css'

registerSW({ immediate: true })

// Σειρά σκόπιμη: πρώτα τα πανάρχαια ελεύθερα-κείμενο ονόματα → ids (μπορεί να παράγει ΚΑΙ από τα
// 9 legacy ids που η επόμενη migration θα μεταφέρει), ΜΕΤΑ η απλοποίηση των 14 αναλυτικών τομέων
// στόχων → 8 βασικούς. Ένα πανάρχαιο goal με ελεύθερο κείμενο περνάει και τα δύο βήματα σωστά.
migrateDomainNamesToIds().then(migrateGoalDomainsToBroaderDomains).then(({ goalsMigrated, templatesMigrated }) => {
  // Μία, ήσυχη, πληροφοριακή γραμμή — ΜΟΝΟ όταν πράγματι μετέφερε κάτι (πρώτη φόρτωση μετά την
  // απλοποίηση τομέων στόχων) — ώστε να υπάρχει ορατή επιβεβαίωση του τι ακριβώς μεταφέρθηκε.
  if (goalsMigrated > 0 || templatesMigrated > 0) {
    console.info(`[Απλοποίηση τομέων στόχων] Μεταφέρθηκαν ${goalsMigrated} στόχοι και ${templatesMigrated} πρότυπα στη νέα ταξινόμηση.`)
  }
})
  // Sprint 5A Phase 2, Commit 4A/4C — ΠΡΕΠΕΙ να ολοκληρωθεί ΕΔΩ, ΠΡΙΝ το ensureDomainTemplatesSeeded
  // παρακάτω ΚΑΙ πριν το πρώτο render, ώστε το activeTable() (migration/activeGeneration.js) να
  // είναι ήδη σωστό ΚΑΙ για τα δύο — καμία «αναλαμπή» legacy→v2, ΚΑΙ το seeding να γράφει στη
  // ΣΩΣΤΗ γενιά αντί να διαβάζει πάντα το προεπιλεγμένο cache='legacy' (bug βρέθηκε στο Commit 4C
  // review: με την παλιά σειρά, το ensureDomainTemplatesSeeded έτρεχε ΠΡΙΝ αρχικοποιηθεί το cache).
  // Χωρίς όρισμα: το ίδιο διαβάζει τον authenticated χρήστη (αν υπάρχει) εσωτερικά, ΠΟΤΕ δεν πετάει.
  .then(initializeActiveGeneration).then(ensureDomainTemplatesSeeded).finally(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <ErrorBoundary>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ErrorBoundary>
    </React.StrictMode>
  )
})
