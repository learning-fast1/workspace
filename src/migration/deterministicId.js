// Sprint 5A Phase 2 — deterministic id για migrated (legacy → _v2) εγγραφές. Καθαρή, ασύγχρονη
// συνάρτηση: ίδιο (userId, table, oldIdOrKey) πάντα παράγει το ΙΔΙΟ id — αυτό ΕΙΝΑΙ η
// idempotency/mapping εγγύηση του migration (Phase 2 Technical Plan, Τα 7 δεσμευτικά σημεία),
// όχι κάποιος ξεχωριστός πίνακας αντιστοίχισης.
//
// Το userId ΠΡΕΠΕΙ να είναι μέρος της εισόδου — δύο διαφορετικοί χρήστες θα έχουν συχνά το ίδιο
// παλιό αριθμητικό id (π.χ. και οι δύο «μαθητή #1»)· χωρίς το userId, θα παρήγαγαν το ΙΔΙΟ νέο id
// για διαφορετικές εγγραφές (Phase 2 Technical Plan Rev.1 §1 — το κενό που εντοπίστηκε στο review).
// Ζωντανά επιβεβαιωμένο με δύο πραγματικούς χρήστες και το ίδιο domain name (Rev.2 §1).
//
// Web Crypto (crypto.subtle) — διαθέσιμο σε browser ΚΑΙ Node/Vitest, καμία νέα εξάρτηση.
export async function deterministicId(userId, tableName, oldIdOrKey) {
  const input = `${userId}::${tableName}::${String(oldIdOrKey)}`
  const bytes = new TextEncoder().encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
