import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { ensureDomainTemplatesSeeded, migrateDomainNamesToIds, migrateGoalDomainsToBroaderDomains } from './db.js'
import { initializeActiveGeneration } from './migration/activeGeneration.js'
import { verifySyncAuthorizationOrShutdown } from './migration/syncAuthorization.js'
import { performStartupRecovery } from './auth/startupRecovery.js'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import AuthProvider from './auth/AuthProvider.jsx'
import RecoveryFailedScreen from './components/RecoveryFailedScreen.jsx'
import './index.css'

registerSW({ immediate: true })

function renderApp() {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <ErrorBoundary>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ErrorBoundary>
    </React.StrictMode>
  )
}

function renderRecoveryFailed(error) {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <RecoveryFailedScreen error={error} />
    </React.StrictMode>
  )
}

// Sprint 5A Phase 2, Commit 6 (follow-up) — ΠΡΩΤΟ πράγμα, ΠΡΙΝ από ΟΤΙΔΗΠΟΤΕ άλλο στο bootstrap
// (πριν καν το migrateDomainNamesToIds παρακάτω): εντοπίζει ΚΑΙ ανακτά αυτόματα ένα εκκρεμές
// στιγμιότυπο ασφαλείας (auth/signOut.js) — υπολειπόμενο από ένα crash ανάμεσα σε επιτυχές
// db.cloud.logout() και την αναίρεσή του. Χωρίς αυτό, το στιγμιότυπο θα έμενε εκεί επ' αόριστον,
// ανακτήσιμο μόνο χειροκίνητα (βλ. πρακτικό validation plan, εύρημα §Logout/crash).
//
// Επιτυχία (ή απλά «τίποτα εκκρεμές») → συνεχίζει το ΥΠΑΡΧΟΝ bootstrap ΑΚΡΙΒΩΣ όπως πριν.
// Αποτυχία → ΣΤΑΜΑΤΑΕΙ εδώ, αποδίδει μήνυμα ανάκτησης ΑΝΤΙ της εφαρμογής — ΔΕΝ συνεχίζει σε
// migrateDomainNamesToIds/ensureDomainTemplatesSeeded κ.λπ. πάνω σε ενδεχομένως ασυνεπή δεδομένα.
// Idempotent εξ ορισμού (performStartupRecovery/recoverFromStoredSnapshot, βλ. εκεί) — ένα «Δοκίμασε
// ξανά» εδώ είναι απλώς μια νέα φόρτωση σελίδας, άρα ασφαλές να ξανατρέξει όσες φορές χρειαστεί.
async function bootstrap() {
  const recovery = await performStartupRecovery()
  if (recovery.status === 'failed') {
    renderRecoveryFailed(recovery.error)
    return
  }

  // Από εδώ και κάτω: ΑΚΡΙΒΩΣ η ίδια σειρά/λογική με πριν, τυλιγμένη σε try/finally ώστε να
  // διατηρηθεί η ΠΡΟΫΠΑΡΧΟΥΣΑ εγγύηση — το .finally() του παλιότερου promise-chain σχήματος: η
  // εφαρμογή αποδίδεται ΠΑΝΤΑ, ΑΚΟΜΑ κι αν κάποιο από αυτά τα βήματα πετάξει (π.χ.
  // ensureDomainTemplatesSeeded ΜΠΟΡΕΙ να πετάξει σε fail-closed περίπτωση, βλ. db.js) — σε
  // αντίθεση με το βήμα ανάκτησης παραπάνω, όπου μια αποτυχία ΣΚΟΠΙΜΑ ΔΕΝ αποδίδει την εφαρμογή.
  try {
    // Σειρά σκόπιμη: πρώτα τα πανάρχαια ελεύθερα-κείμενο ονόματα → ids (μπορεί να παράγει ΚΑΙ από
    // τα 9 legacy ids που η επόμενη migration θα μεταφέρει), ΜΕΤΑ η απλοποίηση των 14 αναλυτικών
    // τομέων στόχων → 8 βασικούς. Ένα πανάρχαιο goal με ελεύθερο κείμενο περνάει και τα δύο βήματα
    // σωστά.
    const { goalsMigrated, templatesMigrated } = await migrateDomainNamesToIds().then(migrateGoalDomainsToBroaderDomains)
    // Μία, ήσυχη, πληροφοριακή γραμμή — ΜΟΝΟ όταν πράγματι μετέφερε κάτι (πρώτη φόρτωση μετά την
    // απλοποίηση τομέων στόχων) — ώστε να υπάρχει ορατή επιβεβαίωση του τι ακριβώς μεταφέρθηκε.
    if (goalsMigrated > 0 || templatesMigrated > 0) {
      console.info(`[Απλοποίηση τομέων στόχων] Μεταφέρθηκαν ${goalsMigrated} στόχοι και ${templatesMigrated} πρότυπα στη νέα ταξινόμηση.`)
    }

    // Sprint 5A Phase 2, Commit 4A/4C — ΠΡΕΠΕΙ να ολοκληρωθεί ΕΔΩ, ΠΡΙΝ το ensureDomainTemplatesSeeded
    // παρακάτω ΚΑΙ πριν το πρώτο render, ώστε το activeTable() (migration/activeGeneration.js) να
    // είναι ήδη σωστό ΚΑΙ για τα δύο — καμία «αναλαμπή» legacy→v2, ΚΑΙ το seeding να γράφει στη
    // ΣΩΣΤΗ γενιά αντί να διαβάζει πάντα το προεπιλεγμένο cache='legacy' (bug βρέθηκε στο Commit 4C
    // review: με την παλιά σειρά, το ensureDomainTemplatesSeeded έτρεχε ΠΡΙΝ αρχικοποιηθεί το cache).
    // Χωρίς όρισμα: το ίδιο διαβάζει τον authenticated χρήστη (αν υπάρχει) εσωτερικά, ΠΟΤΕ δεν πετάει.
    await initializeActiveGeneration()

    // Sprint 5A Phase 2, Commit 6 — verifySyncAuthorizationOrShutdown ΑΜΕΣΩΣ μετά, ΠΡΙΝ το πρώτο
    // render: η ΜΟΝΗ στιγμή που db.cloud.currentUser/appMeta είναι ΚΑΙ τα δύο αξιόπιστα διαθέσιμα
    // (βλ. db.js — το db.open() που ήδη τριγκάρισε το migrateDomainNamesToIds() παραπάνω έχει
    // ολοκληρωθεί μέχρι εδώ). Ξανα-επιβεβαιώνει το (μη έμπιστο) localStorage hint πάνω στα πραγματικά
    // δεδομένα ΚΑΙ αναιρεί αμέσως αν δεν ταιριάζει — ΠΡΙΝ αποδοθεί οτιδήποτε άλλο.
    await verifySyncAuthorizationOrShutdown()

    await ensureDomainTemplatesSeeded()
  } finally {
    renderApp()
  }
}

bootstrap()
