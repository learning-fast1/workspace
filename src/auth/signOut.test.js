import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import db from '../db.js'
import { signOut, recoverFromStoredSnapshot } from './signOut.js'
import { captureFullDeviceSnapshot, persistPendingSnapshot, readPendingSnapshot } from '../migration/deviceSnapshot.js'
import { writeSyncAuthorizationHint, readSyncAuthorizationHint } from '../migration/syncAuthorizationHint.js'
import { claimLegacyDataOwnership, getLegacyDataOwner } from '../migration/legacyOwnership.js'
import { resetActiveGenerationForTests } from '../migration/activeGeneration.js'
import { resetMigrationForTests } from '../migration/migrationEngine.js'
import { MIGRATED_TABLE_NAMES } from '../migration/migratedTableNames.js'

// Ίδιο idiom με σε τα άλλα Commit 6 test αρχεία — μόνο για το (ξεχωριστό, μικροσκοπικό)
// sync-authorization hint, ΟΧΙ πια για το ίδιο το στιγμιότυπο (βλ. review, 2η αναθεώρηση:
// μετρημένο χειρότερο μέγεθος ~36MB, το στιγμιότυπο γράφεται πλέον σε ξεχωριστή IndexedDB βάση —
// migration/deviceSnapshot.js#persistPendingSnapshot — ΟΧΙ localStorage).
class FakeLocalStorage {
  constructor() { this.store = new Map() }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null }
  setItem(key, value) { this.store.set(key, String(value)) }
  removeItem(key) { this.store.delete(key) }
}

const ALICE = 'alice@example.com'
const BOB = 'bob@example.com'
const asAlice = { getAuthenticatedUserId: () => ALICE }

// Προσομοιώνει ΑΚΡΙΒΩΣ την πραγματική, τεκμηριωμένη καταστροφική συμπεριφορά του
// db.cloud.logout() (dexie-cloud-addon _logout(): καθαρίζει ΚΑΘΕ πίνακα της βάσης).
async function realisticCloudLogout() {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear()
  })
}

beforeEach(async () => {
  globalThis.localStorage = new FakeLocalStorage()
  await db.open()
})

afterEach(async () => {
  await resetActiveGenerationForTests()
  await resetMigrationForTests()
  await Promise.all(MIGRATED_TABLE_NAMES.map((t) => db.table(t).clear()))
  db.close()
  delete globalThis.localStorage
})

describe('signOut', () => {
  it('αναιρεί πλήρως την καταστροφική πλευρική ενέργεια — legacy, _v2 ΚΑΙ appMeta επιβιώνουν', async () => {
    await db.students.add({ id: 1, code: 'Μ1', active: true, functionalProfile: [], preferences: {} })
    await db.table('goals_v2').add({ id: 'g-1', studentId: 'stu-1', domain: 'reading', title: 'Στόχος', status: 'active', priority: 'medium' })
    await claimLegacyDataOwnership(ALICE, asAlice)
    writeSyncAuthorizationHint(ALICE)

    await signOut({ cloudLogout: realisticCloudLogout })

    expect(await db.students.get(1)).toMatchObject({ code: 'Μ1' })
    expect(await db.table('goals_v2').get('g-1')).toMatchObject({ title: 'Στόχος' })
    expect(await getLegacyDataOwner()).toMatchObject({ userId: ALICE })
  })

  it('καθαρίζει το sync-authorization hint ΚΑΙ το προσωρινό στιγμιότυπο μετά από επιτυχία', async () => {
    await db.students.add({ id: 1, code: 'Μ1', active: true, functionalProfile: [], preferences: {} })
    writeSyncAuthorizationHint(ALICE)

    await signOut({ cloudLogout: realisticCloudLogout })

    expect(readSyncAuthorizationHint()).toBeNull()
    expect(await readPendingSnapshot()).toBeNull()
  })

  it('ένας διαφορετικός λογαριασμός δεν μπορεί να διεκδικήσει τη συσκευή μετά — η ιδιοκτησία διατηρείται ΑΚΡΙΒΩΣ όπως πριν', async () => {
    await claimLegacyDataOwnership(ALICE, asAlice)
    writeSyncAuthorizationHint(ALICE)

    await signOut({ cloudLogout: realisticCloudLogout })

    await expect(claimLegacyDataOwnership(BOB, { getAuthenticatedUserId: () => BOB }))
      .rejects.toThrow(/ανήκουν ήδη σε άλλο λογαριασμό/)
  })

  it('αν το cloudLogout πετάξει, ΔΕΝ επιχειρείται restore — το προσωρινό στιγμιότυπο παραμένει για ανάκτηση', async () => {
    await db.students.add({ id: 1, code: 'Μ1', active: true, functionalProfile: [], preferences: {} })
    const cloudLogout = vi.fn(() => { throw new Error('δίκτυο κάτω') })

    await expect(signOut({ cloudLogout })).rejects.toThrow('δίκτυο κάτω')

    // Η transaction του cloudLogout ΔΕΝ έτρεξε καθόλου εδώ (πέταξε πριν προλάβει) — τα δεδομένα
    // παραμένουν ΑΝΕΓΓΙΧΤΑ, όχι απλά "restored".
    expect(await db.students.get(1)).toMatchObject({ code: 'Μ1' })
    expect(await readPendingSnapshot()).not.toBeNull()
  })

  it('αν η αναίρεση αποτύχει ΜΕΤΑ από επιτυχές cloudLogout, το στιγμιότυπο παραμένει ανακτήσιμο μέσω recoverFromStoredSnapshot', async () => {
    await db.students.add({ id: 1, code: 'Μ1', active: true, functionalProfile: [], preferences: {} })

    let callCount = 0
    // db.transaction throws → simulates a genuine restore failure ΜΕΤΑ την επιτυχή αναγνώριση logout.
    const originalTransaction = db.transaction.bind(db)
    const cloudLogout = async () => {
      await realisticCloudLogout()
    }
    const txSpy = vi.spyOn(db, 'transaction').mockImplementation((...args) => {
      callCount += 1
      // Η ΠΡΩΤΗ transaction είναι του realisticCloudLogout (πρέπει να περάσει κανονικά) — η
      // ΔΕΥΤΕΡΗ είναι του restoreFullDeviceSnapshot (αυτή αποτυγχάνει).
      if (callCount === 2) return Promise.reject(new Error('αποτυχία restore transaction'))
      return originalTransaction(...args)
    })

    await expect(signOut({ cloudLogout })).rejects.toThrow('αποτυχία restore transaction')
    expect(await db.students.count()).toBe(0) // το logout ΗΔΗ καθάρισε, το restore απέτυχε

    txSpy.mockRestore()

    const recovered = await recoverFromStoredSnapshot()
    expect(recovered).toBe(true)
    expect(await db.students.get(1)).toMatchObject({ code: 'Μ1' })
    expect(await readPendingSnapshot()).toBeNull()
  })
})

describe('recoverFromStoredSnapshot', () => {
  it('τίποτα αποθηκευμένο → false, καμία αλλαγή', async () => {
    expect(await recoverFromStoredSnapshot()).toBe(false)
  })
})

// Ζητήθηκε ρητά (review, μετά την 3η αναθεώρηση) — το ΤΕΛΕΥΤΑΙΟ σενάριο αποτυχίας που χρειάζεται
// αυτόματο test: όχι μια ΑΠΟΤΥΧΙΑ μέσα στο ίδιο signOut() (ήδη καλυμμένο παραπάνω), αλλά ένα
// ΠΡΑΓΜΑΤΙΚΟ crash — η διεργασία απλά σταματάει, ΚΑΜΙΑ προσπάθεια restore δεν προλαβαίνει καν να
// ξεκινήσει — ακολουθούμενο από μια ΕΝΤΕΛΩΣ ΝΕΑ εκκίνηση εφαρμογής που πρέπει να το εντοπίσει και
// να ανακάμψει ΜΟΝΗ της, χωρίς να χρειάζεται να ξέρει τίποτα για το ΠΩΣ διακόπηκε η προηγούμενη.
describe('Ανάκαμψη μετά από πραγματικό crash (ξεχωριστό από αποτυχία μέσα στο ίδιο signOut())', () => {
  it('crash ΜΕΤΑ το επιτυχές logout, ΠΡΙΝ προλάβει να ξεκινήσει το restore — η επόμενη εκκίνηση εντοπίζει το εκκρεμές στιγμιότυπο και ανακάμπτει', async () => {
    await db.students.add({ id: 1, code: 'Μ1', active: true, functionalProfile: [], preferences: {} })
    await db.table('goals_v2').add({ id: 'g-1', studentId: 'stu-1', domain: 'reading', title: 'Στόχος', status: 'active', priority: 'medium' })
    await claimLegacyDataOwnership(ALICE, asAlice)

    // --- Παλιά «συνεδρία» (πριν το crash): ΜΟΝΟ τα βήματα ΠΡΙΝ το restore, ΧΕΙΡΟΚΙΝΗΤΑ (ΟΧΙ μέσω
    // signOut(), ώστε να μοντελοποιηθεί ρητά ΤΙ ΑΚΡΙΒΩΣ έχει ήδη συμβεί όταν χτυπάει το crash).
    // 1) Persist το εκκρεμές στιγμιότυπο.
    const snapshot = await captureFullDeviceSnapshot()
    await persistPendingSnapshot(snapshot)
    // 2) Επιτυχές, πραγματικό db.cloud.logout() που καθαρίζει την κύρια βάση.
    await realisticCloudLogout()
    expect(await db.students.count()).toBe(0) // το logout ΗΔΗ ολοκληρώθηκε πλήρως
    // 3) *** CRASH *** — η διεργασία σταματάει ΕΔΩ. Το restoreFullDeviceSnapshot() ΔΕΝ καλείται
    // ΠΟΤΕ σε αυτή τη «συνεδρία» — καμία εξαίρεση, καμία προσπάθεια, απλά τίποτα δεν ξανατρέχει.

    // --- Νέα «συνεδρία» (μετά το crash): ολόκληρη η γνώση της προηγούμενης συνεδρίας έχει χαθεί —
    // η ανάκαμψη ΠΡΕΠΕΙ να στηρίζεται ΑΠΟΚΛΕΙΣΤΙΚΑ σε ό,τι είναι durably αποθηκευμένο.
    // 4) (Προσομοιωμένη φρέσκια εκκίνηση εφαρμογής — καμία κατάσταση από τα παραπάνω δεν
    // ξαναχρησιμοποιείται ρητά πέρα από το ίδιο το db instance, όπως θα συνέβαινε σε ένα πραγματικό
    // reload.)
    // 5) Εντοπισμός του εκκρεμούς στιγμιότυπου.
    const pending = await readPendingSnapshot()
    expect(pending).not.toBeNull()

    // 6) Ανάκαμψη από το αποθηκευμένο στιγμιότυπο.
    const recovered = await recoverFromStoredSnapshot()
    expect(recovered).toBe(true)

    // Τα δεδομένα επέστρεψαν ΑΚΡΙΒΩΣ όπως ήταν πριν το logout.
    expect(await db.students.get(1)).toMatchObject({ code: 'Μ1' })
    expect(await db.table('goals_v2').get('g-1')).toMatchObject({ title: 'Στόχος' })
    expect(await getLegacyDataOwner()).toMatchObject({ userId: ALICE })

    // 7) Το στιγμιότυπο διαγράφεται ΜΟΝΟ ΜΕΤΑ από επιτυχή ανάκαμψη.
    expect(await readPendingSnapshot()).toBeNull()
  })

  it('8) μια ΑΠΟΤΥΧΗΜΕΝΗ προσπάθεια ανάκτησης ΔΕΝ καταναλώνει το στιγμιότυπο — παραμένει διαθέσιμο για μια επόμενη προσπάθεια, η οποία πετυχαίνει', async () => {
    await db.students.add({ id: 1, code: 'Μ1', active: true, functionalProfile: [], preferences: {} })

    const snapshot = await captureFullDeviceSnapshot()
    await persistPendingSnapshot(snapshot)
    await realisticCloudLogout()
    expect(await db.students.count()).toBe(0)

    // Η ΠΡΩΤΗ προσπάθεια ανάκτησης αποτυγχάνει η ίδια (π.χ. παροδικό σφάλμα IndexedDB/transaction
    // κατά το ίδιο το restore — ΟΧΙ κάτι που έγινε πριν, αλλά αποτυχία ΜΕΣΑ στην ανάκτηση).
    const txSpy = vi.spyOn(db, 'transaction').mockImplementationOnce(() => Promise.reject(new Error('παροδικό σφάλμα ανάκτησης')))
    await expect(recoverFromStoredSnapshot()).rejects.toThrow('παροδικό σφάλμα ανάκτησης')
    txSpy.mockRestore()

    // Το στιγμιότυπο ΠΑΡΑΜΕΝΕΙ διαθέσιμο — η αποτυχημένη προσπάθεια δεν το κατανάλωσε.
    expect(await readPendingSnapshot()).not.toBeNull()
    expect(await db.students.count()).toBe(0) // ακόμα κενό, η αποτυχημένη προσπάθεια δεν έγραψε τίποτα

    // Η ΔΕΥΤΕΡΗ προσπάθεια (χωρίς το παροδικό πρόβλημα) πετυχαίνει κανονικά.
    const recovered = await recoverFromStoredSnapshot()
    expect(recovered).toBe(true)
    expect(await db.students.get(1)).toMatchObject({ code: 'Μ1' })
    expect(await readPendingSnapshot()).toBeNull()
  })
})
