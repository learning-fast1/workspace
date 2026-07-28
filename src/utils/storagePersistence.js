// Readiness blockers v1 (review χρήστη) — Storage Safety. Καθαρός wrapper γύρω από τα browser API
// navigator.storage.persisted()/persist() — καμία αποθήκευση πουθενά στη βάση (η ίδια η κατάσταση
// του browser ΕΙΝΑΙ η πηγή αλήθειας, ξαναδιαβάζεται σε κάθε φόρτωση της σελίδας Ρυθμίσεων).
//
// Πέντε καταστάσεις (review, σημείο 3 — «error» πέρα από τις 4 της αρχικής πρότασης):
// 'unsupported' — το API δεν υπάρχει καθόλου σε αυτόν τον browser.
// 'active'      — ήδη persisted (καμία ενέργεια χρειάζεται).
// 'requestable' — δεν είναι persisted ακόμα, ΔΕΝ έχει ζητηθεί ρητά αυτή τη φόρτωση.
// 'denied'      — ζητήθηκε ρητά (persist()) και ο browser αρνήθηκε.
// 'error'       — το ίδιο το API πέταξε (π.χ. ασυνήθιστο permissions-policy περιβάλλον).
// Feature-detection ΚΑΙ για τα δύο (persisted/persist) με try/catch το καθένα ξεχωριστά — ένα
// browser μπορεί θεωρητικά να δηλώνει τη μέθοδο αλλά να πετάει κατά την κλήση.
function storageApiAvailable() {
  return typeof navigator !== 'undefined' && !!navigator.storage
}

export async function getStorageStatus() {
  if (!storageApiAvailable() || typeof navigator.storage.persisted !== 'function') {
    return 'unsupported'
  }
  try {
    const persisted = await navigator.storage.persisted()
    return persisted ? 'active' : 'requestable'
  } catch {
    return 'error'
  }
}

// Ρητή ενέργεια χρήστη (κουμπί), ΠΟΤΕ αυτόματο κάλεσμα στο mount — σε Firefox αυτό ανοίγει
// πραγματικό browser permission prompt, δεν πρέπει να συμβαίνει αθόρυβα σε κάθε φόρτωση της
// σελίδας Ρυθμίσεων.
export async function requestPersistentStorage() {
  if (!storageApiAvailable() || typeof navigator.storage.persist !== 'function') {
    return 'unsupported'
  }
  try {
    const granted = await navigator.storage.persist()
    return granted ? 'active' : 'denied'
  } catch {
    return 'error'
  }
}
