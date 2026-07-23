import { describe, expect, it } from 'vitest'
import { deterministicId } from './deterministicId.js'

describe('deterministicId — collision-freedom & idempotency (Phase 2 Technical Plan §1)', () => {
  it('ίδιο (userId, table, oldId) δύο φορές → πανομοιότυπο id (idempotency)', async () => {
    const a = await deterministicId('alice@example.com', 'students', 1)
    const b = await deterministicId('alice@example.com', 'students', 1)
    expect(a).toBe(b)
  })

  it('ίδιο table + oldId, ΔΙΑΦΟΡΕΤΙΚΟΣ χρήστης → διαφορετικό id (το κενό που βρέθηκε στο review)', async () => {
    const alice = await deterministicId('alice@example.com', 'students', 1)
    const bob = await deterministicId('bob@example.com', 'students', 1)
    expect(alice).not.toBe(bob)
  })

  it('ίδιος χρήστης + oldId, ΔΙΑΦΟΡΕΤΙΚΟΣ πίνακας → διαφορετικό id', async () => {
    const asStudent = await deterministicId('alice@example.com', 'students', 1)
    const asGoal = await deterministicId('alice@example.com', 'goals', 1)
    expect(asStudent).not.toBe(asGoal)
  })

  it('domainTemplates: το ίδιο domain name, δύο διαφορετικοί χρήστες → διαφορετικό id (ζωντανά επιβεβαιωμένο στο spike)', async () => {
    const alice = await deterministicId('alice@example.com', 'domainTemplates', 'communication')
    const bob = await deterministicId('bob@example.com', 'domainTemplates', 'communication')
    expect(alice).not.toBe(bob)
  })

  it('επιστρέφει 64-χαρακτήρων πεζό hex string (SHA-256)', async () => {
    const id = await deterministicId('alice@example.com', 'students', 1)
    expect(id).toMatch(/^[0-9a-f]{64}$/)
  })

  it('δέχεται αριθμητικό ΚΑΙ αλφαριθμητικό oldIdOrKey αδιακρίτως (String() coercion)', async () => {
    const fromNumber = await deterministicId('alice@example.com', 'students', 42)
    const fromString = await deterministicId('alice@example.com', 'students', '42')
    expect(fromNumber).toBe(fromString)
  })

  // Phase 2 Commit 1 (reconciled) — οι 5 νέοι πίνακες του Sprint 7/8 (σχήμα v9/v10) έχουν ΟΛΟΙ
  // απλό αυξητικό ++id (όχι ιδιαίτερη ονομασία σαν το domainTemplates), άρα δεν χρειάζονται ξεχωριστή
  // στρατηγική — απλά ΕΝΑ ακόμη table name string στην ήδη γενική συνάρτηση. Εδώ τεκμηριώνεται ρητά
  // ότι λειτουργούν με το ίδιο εγγύηση collision-freedom μεταξύ χρηστών.
  it('λειτουργεί το ίδιο για κάθε νέο πίνακα του Sprint 7/8 (σχήμα v9/v10) — καμία ειδική περίπτωση', async () => {
    for (const table of ['schoolYears', 'schoolYearParticipation', 'goalEvents', 'goalTemplates', 'sessionGoalAssessments']) {
      const alice = await deterministicId('alice@example.com', table, 1)
      const bob = await deterministicId('bob@example.com', table, 1)
      expect(alice, `${table}: αναμένονταν διαφορετικό id ανά χρήστη`).not.toBe(bob)
      expect(alice).toMatch(/^[0-9a-f]{64}$/)
    }
  })
})
