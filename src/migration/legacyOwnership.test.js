import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db.js'
import * as legacyOwnership from './legacyOwnership.js'
import {
  getLegacyDataOwner, claimLegacyDataOwnership, assertLegacyDataOwnership, resetLegacyOwnershipForTests
} from './legacyOwnership.js'

const ALICE = 'alice@example.com'
const BOB = 'bob@example.com'
const asAlice = { getAuthenticatedUserId: () => ALICE }
const asBob = { getAuthenticatedUserId: () => BOB }

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  await resetLegacyOwnershipForTests()
  db.close()
})

describe('getLegacyDataOwner', () => {
  it('null όταν κανείς δεν έχει διεκδικήσει ακόμα (νέα εγκατάσταση, ή ΗΔΗ υπάρχουσα pre-Phase-2 εγκατάσταση με δεδομένα)', async () => {
    expect(await getLegacyDataOwner()).toBe(null)
  })
})

describe('claimLegacyDataOwnership — η ΜΟΝΑΔΙΚΗ ρητή πράξη διεκδίκησης', () => {
  it('πρώτη διεκδίκηση: αποθηκεύει τον χρήστη ως ιδιοκτήτη', async () => {
    const owner = await claimLegacyDataOwnership(ALICE, asAlice)
    expect(owner.userId).toBe(ALICE)
    expect(owner.claimedAt).toBeTruthy()
    expect(await getLegacyDataOwner()).toMatchObject({ userId: ALICE })
  })

  it('ΙΔΙΟΣ χρήστης ξαναδιεκδικεί: idempotent no-op, ΔΕΝ αλλάζει το claimedAt', async () => {
    const first = await claimLegacyDataOwnership(ALICE, asAlice)
    const second = await claimLegacyDataOwnership(ALICE, asAlice)
    expect(second.claimedAt).toBe(first.claimedAt)
  })

  it('ΔΙΑΦΟΡΕΤΙΚΟΣ χρήστης προσπαθεί να διεκδικήσει ήδη-διεκδικημένα δεδομένα → πετάει, ΔΕΝ αλλάζει τον ιδιοκτήτη', async () => {
    await claimLegacyDataOwnership(ALICE, asAlice)
    await expect(claimLegacyDataOwnership(BOB, asBob)).rejects.toThrow(/άλλο λογαριασμό/)
    expect(await getLegacyDataOwner()).toMatchObject({ userId: ALICE })
  })

  it('το userId του ορίσματος πρέπει να ταιριάζει με τον ΠΡΑΓΜΑΤΙΚΑ συνδεδεμένο χρήστη — προστασία από spoofing', async () => {
    await expect(claimLegacyDataOwnership(BOB, asAlice)).rejects.toThrow(/ταιριάζει/)
    expect(await getLegacyDataOwner()).toBe(null)
  })

  it('χωρίς authentication override, σε αμιγώς τοπικό test env (CLOUD_ENABLED=false) → πετάει', async () => {
    await expect(claimLegacyDataOwnership(ALICE)).rejects.toThrow(/cloud sync/)
  })
})

describe('assertLegacyDataOwnership — η πύλη ασφαλείας πριν από ΚΑΘΕ migration', () => {
  it('καμία διεκδίκηση ακόμα → πετάει με code LEGACY_OWNER_UNCLAIMED, σαφές μήνυμα', async () => {
    await expect(assertLegacyDataOwnership(ALICE)).rejects.toMatchObject({ code: 'LEGACY_OWNER_UNCLAIMED' })
  })

  it('διεκδικημένο από τον ΙΔΙΟ χρήστη → περνάει, επιστρέφει τον owner', async () => {
    await claimLegacyDataOwnership(ALICE, asAlice)
    const owner = await assertLegacyDataOwnership(ALICE)
    expect(owner.userId).toBe(ALICE)
  })

  it('διεκδικημένο από ΔΙΑΦΟΡΕΤΙΚΟ χρήστη → πετάει με code LEGACY_OWNER_MISMATCH', async () => {
    await claimLegacyDataOwnership(ALICE, asAlice)
    await expect(assertLegacyDataOwnership(BOB)).rejects.toMatchObject({ code: 'LEGACY_OWNER_MISMATCH' })
  })
})

// Blocker follow-up (review): αφαίρεση ΟΠΟΙΑΣΔΗΠΟΤΕ δημόσιας «clear ownership» λειτουργίας από αυτό
// το commit — το να αφαιρεθεί ΜΟΝΟ η διεκδίκηση, αφήνοντας άθικτα legacy/_v2 εκπαιδευτικά δεδομένα,
// θα ξανάνοιγε τον κίνδυνο λανθασμένης απόδοσης. Ρητό regression guard: αν κάποιος ποτέ προσθέσει
// ξανά ένα τέτοιο exported API χωρίς να περάσει από την ξεχωριστή αξιολόγηση που περιγράφεται στο
// legacyOwnership.js, αυτό το test θα σπάσει αμέσως.
describe('καμία δημόσια λειτουργία εκκαθάρισης ιδιοκτησίας σε αυτό το commit', () => {
  it('δεν εξάγεται clearLegacyDataOwnership (ή οποιοδήποτε ισοδύναμο public API)', () => {
    expect(legacyOwnership.clearLegacyDataOwnership).toBeUndefined()
  })
})

// resetLegacyOwnershipForTests ΔΕΝ είναι production API (βλ. σχόλιο στο legacyOwnership.js) — μόνο
// τα ίδια τα tests αυτού του module τη χρησιμοποιούν (afterEach παραπάνω). Εδώ επιβεβαιώνεται ρητά
// η μία ιδιότητα ασφαλείας που πρέπει να διατηρήσει ΚΑΙ μια μελλοντική πραγματική υλοποίηση: ΠΟΤΕ
// να μην αγγίζει τα ίδια τα εκπαιδευτικά δεδομένα, μόνο τη διεκδίκηση.
describe('resetLegacyOwnershipForTests (test-only utility)', () => {
  it('αφαιρεί τη διεκδίκηση — επόμενος χρήστης μπορεί πλέον να διεκδικήσει', async () => {
    await claimLegacyDataOwnership(ALICE, asAlice)
    await resetLegacyOwnershipForTests()
    expect(await getLegacyDataOwner()).toBe(null)

    const newOwner = await claimLegacyDataOwnership(BOB, asBob)
    expect(newOwner.userId).toBe(BOB)
  })

  it('ΔΕΝ αγγίζει καθόλου τα ίδια τα legacy δεδομένα — μόνο τη διεκδίκηση', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    await claimLegacyDataOwnership(ALICE, asAlice)
    await resetLegacyOwnershipForTests()
    expect(await db.students.get(studentId)).toBeTruthy()
    await db.students.delete(studentId)
  })
})
