import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import db from '../db.js'
import { performStartupRecovery } from './startupRecovery.js'
import { captureFullDeviceSnapshot, persistPendingSnapshot, readPendingSnapshot } from '../migration/deviceSnapshot.js'
import { MIGRATED_TABLE_NAMES } from '../migration/migratedTableNames.js'

// Ίδιο idiom με auth/signOut.test.js — προσομοιώνει ΑΚΡΙΒΩΣ την πραγματική, τεκμηριωμένη
// καταστροφική συμπεριφορά του db.cloud.logout() (dexie-cloud-addon _logout(): καθαρίζει ΚΑΘΕ
// πίνακα της βάσης), ώστε το «crash» σενάριο να είναι ρεαλιστικό, όχι τεχνητό.
async function realisticCloudLogout() {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear()
  })
}

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  await Promise.all(MIGRATED_TABLE_NAMES.map((t) => db.table(t).clear()))
  db.close()
})

describe('performStartupRecovery — κλείνει το κενό: main.jsx bootstrap ΤΩΡΑ το καλεί αυτόματα', () => {
  it('κανονική εκκίνηση (κανένα εκκρεμές στιγμιότυπο) → "nothing-pending", καμία αλλαγή στα δεδομένα', async () => {
    await db.students.add({ id: 1, code: 'Μ1', active: true, functionalProfile: [], preferences: {} })

    const result = await performStartupRecovery()

    expect(result).toEqual({ status: 'nothing-pending', error: null })
    expect(await db.students.get(1)).toMatchObject({ code: 'Μ1' }) // ανέγγιχτο
  })

  it('αυτόματη ανάκτηση μετά από προσομοιωμένο crash: logout ολοκληρώθηκε, restore ΔΕΝ πρόλαβε καν να ξεκινήσει', async () => {
    await db.students.add({ id: 1, code: 'Μ1', active: true, functionalProfile: [], preferences: {} })
    await db.table('goals_v2').add({ id: 'g-1', studentId: 'stu-1', domain: 'reading', title: 'Στόχος', status: 'active', priority: 'medium' })

    // --- Παλιά «συνεδρία»: μόνο τα βήματα ΠΡΙΝ το restore, ίδιο μοτίβο με
    // auth/signOut.test.js#«Ανάκαμψη μετά από πραγματικό crash».
    const snapshot = await captureFullDeviceSnapshot()
    await persistPendingSnapshot(snapshot)
    await realisticCloudLogout()
    expect(await db.students.count()).toBe(0) // το logout ήδη ολοκληρώθηκε πλήρως
    // *** CRASH *** — καμία κλήση restore σε αυτή τη «συνεδρία».

    // --- Νέα «συνεδρία»: ΑΚΡΙΒΩΣ ό,τι θα έκανε το main.jsx bootstrap ΤΩΡΑ, ως το ΠΡΩΤΟ βήμα.
    const result = await performStartupRecovery()

    expect(result).toEqual({ status: 'recovered', error: null })
    expect(await db.students.get(1)).toMatchObject({ code: 'Μ1' })
    expect(await db.table('goals_v2').get('g-1')).toMatchObject({ title: 'Στόχος' })
    expect(await readPendingSnapshot()).toBeNull() // καταναλώθηκε ΜΟΝΟ μετά την επιτυχία
  })

  it('αποτυχημένη ανάκτηση ΑΚΟΛΟΥΘΟΥΜΕΝΗ από επιτυχημένη επανάληψη — idempotent retry', async () => {
    await db.students.add({ id: 1, code: 'Μ1', active: true, functionalProfile: [], preferences: {} })
    const snapshot = await captureFullDeviceSnapshot()
    await persistPendingSnapshot(snapshot)
    await realisticCloudLogout()
    expect(await db.students.count()).toBe(0)

    // Η ΠΡΩΤΗ «εκκίνηση εφαρμογής» μετά το crash αποτυγχάνει η ίδια (π.χ. παροδικό σφάλμα
    // transaction κατά το restore).
    const txSpy = vi.spyOn(db, 'transaction').mockImplementationOnce(() => Promise.reject(new Error('παροδικό σφάλμα ανάκτησης')))
    const firstAttempt = await performStartupRecovery()
    txSpy.mockRestore()

    expect(firstAttempt.status).toBe('failed')
    expect(firstAttempt.error).toBeInstanceOf(Error)
    expect(firstAttempt.error.message).toBe('παροδικό σφάλμα ανάκτησης')
    // Το στιγμιότυπο ΠΑΡΑΜΕΝΕΙ ανέγγιχτο — δεν καταναλώθηκε από την αποτυχημένη προσπάθεια.
    expect(await readPendingSnapshot()).not.toBeNull()
    expect(await db.students.count()).toBe(0) // ακόμα κενό, καμία μερική εγγραφή

    // Η ΕΠΟΜΕΝΗ «εκκίνηση εφαρμογής» (π.χ. ο χρήστης πάτησε «Δοκίμασε ξανά» → νέα φόρτωση σελίδας
    // → bootstrap() ξανατρέχει ΤΟ ΙΔΙΟ performStartupRecovery() από την αρχή) πετυχαίνει κανονικά,
    // ΧΩΡΙΣ να χρειάζεται καμία ειδική χειροκίνητη παρέμβαση.
    const secondAttempt = await performStartupRecovery()
    expect(secondAttempt).toEqual({ status: 'recovered', error: null })
    expect(await db.students.get(1)).toMatchObject({ code: 'Μ1' })
  })

  it('επιτυχημένη ανάκτηση αφαιρεί το εκκρεμές στιγμιότυπο — επόμενη κλήση είναι πλήρες no-op', async () => {
    await db.students.add({ id: 1, code: 'Μ1', active: true, functionalProfile: [], preferences: {} })
    const snapshot = await captureFullDeviceSnapshot()
    await persistPendingSnapshot(snapshot)
    await realisticCloudLogout()

    const first = await performStartupRecovery()
    expect(first.status).toBe('recovered')
    expect(await readPendingSnapshot()).toBeNull()

    // Idempotent: μια ΔΕΥΤΕΡΗ κλήση (π.χ. διπλή εκκίνηση, ή React.StrictMode double-invoke σε dev)
    // δεν βρίσκει τίποτα εκκρεμές και δεν κάνει καμία αλλαγή.
    const second = await performStartupRecovery()
    expect(second).toEqual({ status: 'nothing-pending', error: null })
    expect(await db.students.get(1)).toMatchObject({ code: 'Μ1' }) // αμετάβλητο
  })

  it('injected recover() override λειτουργεί (ίδιο DI idiom με το υπόλοιπο Phase 2)', async () => {
    const recover = vi.fn().mockResolvedValue(true)
    const result = await performStartupRecovery({ recover })
    expect(result).toEqual({ status: 'recovered', error: null })
    expect(recover).toHaveBeenCalledTimes(1)
  })
})
