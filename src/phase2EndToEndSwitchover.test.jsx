import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import {
  db, getActiveSchoolYear, createSchoolYear, setActiveSchoolYear, setStudentActive, ensureDomainTemplatesSeeded
} from './db.js'
import { claimLegacyDataOwnership } from './migration/legacyOwnership.js'
import { runMigration, resetMigrationForTests } from './migration/migrationEngine.js'
import {
  activateV2Generation, initializeActiveGeneration, resetActiveGenerationForTests, getActiveGeneration, activeTable
} from './migration/activeGeneration.js'
import { MIGRATED_TABLE_NAMES, v2TableName } from './migration/migratedTableNames.js'
import { deterministicId } from './migration/deterministicId.js'
import AuthProvider from './auth/AuthProvider.jsx'
import StudentList from './components/StudentList.jsx'

// Sprint 5A Phase 2, Commit 4C — τελική, end-to-end επιβεβαίωση ΟΛΟΚΛΗΡΗΣ της αλυσίδας
// migrate → activate → (προσομοιωμένο) hard reload → routing σε v2, πάνω στο ΠΡΑΓΜΑΤΙΚΟ
// migration engine, activeGeneration state machine και db.js API — ΟΧΙ νέα αρχιτεκτονική, μόνο
// επαλήθευση ότι όσα χτίστηκαν στα Commits 2/3/4A/4B δουλεύουν σωστά ΜΑΖΙ.
const ALICE = 'alice@example.com'
const BOB = 'bob@example.com'
const asAlice = { getAuthenticatedUserId: () => ALICE }
const asBob = { getAuthenticatedUserId: () => BOB }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  cleanup()
  await resetActiveGenerationForTests()
  await resetMigrationForTests()
  await Promise.all(MIGRATED_TABLE_NAMES.map((t) => db.table(t).clear()))
  db.close()
})

describe('Phase 2 Commit 4C — πλήρης end-to-end ροή switchover', () => {
  it('legacy δεδομένα → claim → migrate → activate → προσομοιωμένο reload → v2 routing παντού, legacy ανέγγιχτη', async () => {
    // 1) Πραγματικά legacy δεδομένα σε πολλαπλούς πίνακες.
    const studentId = await db.students.add({ code: 'Μ1', active: true, functionalProfile: [], preferences: {} })
    const yearId = await db.schoolYears.add({ label: '2025-2026', startDate: '2025-09-01', endDate: '2026-06-30', isActive: true })
    const goalId = await db.goals.add({ studentId, domain: 'reading', title: 'Στόχος', status: 'active', priority: 'medium', startDate: '2025-09-01' })
    const sessionId = await db.sessions.add({ date: '2025-10-01', studentIds: [studentId], status: 'completed', absentStudentIds: [] })
    await db.measurements.add({ sessionId, studentId, goalId, value: { successes: 3, attempts: 4 }, context: 'individual', note: '' })
    await db.schoolYearParticipation.add({ studentId, schoolYearId: yearId, status: 'new', reason: '', recordedAt: '2025-09-01T00:00:00.000Z' })

    // Στιγμιότυπο ΠΡΙΝ από οτιδήποτε άλλο — θα συγκριθεί ξανά στο τέλος για να αποδειχθεί ότι η
    // legacy γενιά παραμένει ΑΠΟΛΥΤΑ ανέγγιχτη σε όλη την υπόλοιπη ροή.
    const legacySnapshotBefore = {}
    for (const t of MIGRATED_TABLE_NAMES) legacySnapshotBefore[t] = await db.table(t).toArray()

    // 2) Ο authenticated ιδιοκτήτης διεκδικεί τα legacy δεδομένα.
    await claimLegacyDataOwnership(ALICE, asAlice)

    // 3) Το migration ολοκληρώνεται.
    const migrationState = await runMigration(asAlice)
    expect(migrationState.status).toBe('complete')

    // Τα migrated ids παραμένουν deterministic — spot-check σε student ΚΑΙ goal.
    const studentV2Id = await deterministicId(ALICE, 'students', studentId)
    const goalV2Id = await deterministicId(ALICE, 'goals', goalId)
    const yearV2Id = await deterministicId(ALICE, 'schoolYears', yearId)
    expect(await db.table('students_v2').get(studentV2Id)).toMatchObject({ code: 'Μ1' })
    expect(await db.table('goals_v2').get(goalV2Id)).toMatchObject({ title: 'Στόχος', studentId: studentV2Id })

    // 4) Ο δείκτης ενεργοποίησης v2 γράφεται.
    const marker = await activateV2Generation(ALICE, asAlice)
    expect(marker.generation).toBe('v2')
    expect(await getActiveGeneration(ALICE)).toBe('v2')

    // 5) Προσομοίωση ΠΡΑΓΜΑΤΙΚΟΥ hard reload: το in-memory cache επιστρέφει στην προεπιλογή του
    // (ΑΚΡΙΒΩΣ ό,τι θα συνέβαινε αν χανόταν ολόκληρο το JS heap σε ένα πραγματικό reload) — το
    // persisted appMeta marker ΔΕΝ σβήνεται (ζει στο IndexedDB, επιβιώνει σε reload).
    await resetActiveGenerationForTests({ clearPersisted: false })
    expect(activeTable('students')).toBe(db.table('students')) // cache ακόμα stale/legacy, ΠΡΙΝ το re-init
    await initializeActiveGeneration({ getUserId: () => ALICE }) // ΑΚΡΙΒΩΣ ό,τι κάνει το main.jsx bootstrap
    expect(activeTable('students')).toBe(db.table('students_v2')) // ΤΩΡΑ σωστά v2, μετά το re-init

    // 6) Αντιπροσωπευτική ΑΝΑΓΝΩΣΗ μετά το reload — διαβάζει τη μεταφερμένη γραμμή.
    expect(await getActiveSchoolYear()).toMatchObject({ label: '2025-2026' })

    // 7) Αντιπροσωπευτική ΔΗΜΙΟΥΡΓΙΑ μετά το reload — νέο UUID id, ΟΧΙ deterministic.
    const newYearId = await createSchoolYear({ label: '2026-2027', startDate: '2026-09-01', endDate: '2027-06-30' })
    expect(typeof newYearId).toBe('string')
    expect(newYearId).toMatch(UUID_RE)
    expect(await db.table('schoolYears_v2').get(newYearId)).toMatchObject({ label: '2026-2027' })

    // 8) Αντιπροσωπευτική ΕΝΗΜΕΡΩΣΗ μετά το reload.
    await setActiveSchoolYear(newYearId)
    expect((await db.table('schoolYears_v2').get(newYearId)).isActive).toBe(true)
    expect((await db.table('schoolYears_v2').get(yearV2Id)).isActive).toBe(false) // το παλιό ενεργό απενεργοποιήθηκε

    // 9) Πολυ-πίνακη ΣΥΝΑΛΛΑΓΗ μετά το reload — setStudentActive (students_v2 + schoolYearParticipation_v2).
    await setStudentActive(studentV2Id, false, { reason: 'δοκιμή e2e' })
    expect((await db.table('students_v2').get(studentV2Id)).active).toBe(false)
    const participation = await db.table('schoolYearParticipation_v2').where('studentId').equals(studentV2Id).toArray()
    const newParticipation = participation.find((p) => p.schoolYearId === newYearId)
    expect(newParticipation.status).toBe('departed') // το ΝΕΟ ενεργό έτος (newYearId) δεν είχε ακόμα participation
    expect(newParticipation.id).toMatch(UUID_RE) // νέα γραμμή → UUID, ΟΧΙ deterministic

    // 10) Deterministic seed rows παραμένουν idempotent, ΚΑΙ μέσα σε αυτή την πλήρη ροή.
    await ensureDomainTemplatesSeeded({ getUserId: () => ALICE })
    const seedIdsFirst = (await db.table('domainTemplates_v2').toArray()).map((r) => r.id).sort()
    await ensureDomainTemplatesSeeded({ getUserId: () => ALICE })
    const seedIdsSecond = (await db.table('domainTemplates_v2').toArray()).map((r) => r.id).sort()
    expect(seedIdsSecond).toEqual(seedIdsFirst)

    // 11) Η legacy γενιά παραμένει ΑΠΟΛΥΤΑ ανέγγιχτη σε ΟΛΗ την παραπάνω ροή (migrate+activate+
    // reload+create+update+transaction+reseed) — ΚΑΜΙΑ διαρροή εγγραφής στη λάθος γενιά.
    for (const t of MIGRATED_TABLE_NAMES) {
      expect(await db.table(t).toArray()).toEqual(legacySnapshotBefore[t])
    }
  })

  // Κλείνει ρητά το «καμία stale liveQuery subscription δεν επιβιώνει το reload» με πραγματικό
  // React render: ΕΝΑ mounted instance ΠΡΙΝ την ενεργοποίηση/reload (βλέπει legacy), ΞΕΧΩΡΙΣΤΟ,
  // ΦΡΕΣΚΟ instance ΜΕΤΑ (βλέπει v2) — κανένα ίχνος του παλιού δεν «διαρρέει» στο νέο render, ΑΚΡΙΒΩΣ
  // όπως ένα πραγματικό hard reload καταστρέφει το παλιό React tree και τα Dexie live queries του.
  it('component render ΠΡΙΝ το reload δείχνει legacy· ΦΡΕΣΚΟ render ΜΕΤΑ δείχνει v2 — καμία διαρροή', async () => {
    // «ΜΙΓΜΕΝΟΣ» μαθητής — υπάρχει ΠΡΙΝ το migration, άρα θα ΜΕΤΑΦΕΡΘΕΙ (αντιγραφή, όχι μετακίνηση)
    // στο students_v2· αναμένεται λογικά να ΕΞΑΚΟΛΟΥΘΗΣΕΙ να φαίνεται και μετά το switchover.
    await db.students.add({ code: 'ΜΙΓΜΕΝΟΣ-ΠΡΙΝ', active: true })

    const { unmount } = render(<MemoryRouter><AuthProvider><StudentList /></AuthProvider></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('ΜΙΓΜΕΝΟΣ-ΠΡΙΝ')).toBeInTheDocument())
    unmount()
    cleanup() // πλήρης καταστροφή του παλιού DOM/React root — ό,τι θα έκανε ένα πραγματικό hard reload

    await claimLegacyDataOwnership(ALICE, asAlice)
    await runMigration(asAlice)
    await activateV2Generation(ALICE, asAlice)
    await resetActiveGenerationForTests({ clearPersisted: false })
    await initializeActiveGeneration({ getUserId: () => ALICE })

    // ΜΕΤΑ το switchover: μια ΝΕΑ γραμμή γραμμένη ΑΠΕΥΘΕΙΑΣ στη legacy (π.χ. προσομοιώνει άλλη
    // καρτέλα/διαδικασία που δεν ξέρει για το switchover) ΔΕΝ πρέπει ΠΟΤΕ να εμφανιστεί — αποδεικνύει
    // ότι το φρέσκο render διαβάζει ΑΠΟΚΛΕΙΣΤΙΚΑ v2, όχι κατά λάθος ακόμα τη legacy.
    await db.students.add({ code: 'LEGACY-ΜΕΤΑ-ΤΟ-SWITCH', active: true })
    // Μια ΓΝΗΣΙΑ νέα v2 γραμμή (π.χ. μέσω StudentForm μετά το switchover) — πρέπει να φαίνεται.
    await db.table('students_v2').add({ id: 'stu-fresh', code: 'ΜΟΝΟ-V2', active: true })

    render(<MemoryRouter><AuthProvider><StudentList /></AuthProvider></MemoryRouter>) // ΦΡΕΣΚΟ instance, όπως μετά από πραγματικό reload
    await waitFor(() => expect(screen.getByText('ΜΟΝΟ-V2')).toBeInTheDocument())
    expect(screen.getByText('ΜΙΓΜΕΝΟΣ-ΠΡΙΝ')).toBeInTheDocument() // η μεταφερμένη γραμμή σωστά επιβιώνει
    expect(screen.queryByText('LEGACY-ΜΕΤΑ-ΤΟ-SWITCH')).not.toBeInTheDocument() // legacy-only ΜΕΤΑ το switch → αόρατο
  })
})

describe('Fail-closed: άκυρος/ελλιπής δείκτης γενιάς → πάντα legacy', () => {
  it('marker.generation με άγνωστη τιμή (ΟΧΙ "v2") → legacy', async () => {
    await db.appMeta.put({ key: 'phase2ActiveGeneration', value: { generation: 'bogus', userId: ALICE, setAt: 'now' } })
    expect(await getActiveGeneration(ALICE)).toBe('legacy')
  })

  it('appMeta.value εντελώς malformed (π.χ. απλό string αντί για object) → legacy, ΚΑΝΕΝΑ crash', async () => {
    await db.appMeta.put({ key: 'phase2ActiveGeneration', value: 'εντελώς-λάθος-τιμή' })
    await expect(getActiveGeneration(ALICE)).resolves.toBe('legacy')
  })

  it('καμία εγγραφή marker καθόλου → legacy (ήδη καλυμμένο, επιβεβαιώνεται ξανά εδώ ως μέρος του e2e report)', async () => {
    expect(await getActiveGeneration(ALICE)).toBe('legacy')
  })
})

describe('Ownership mismatch εξακολουθεί να μπλοκάρει την ενεργοποίηση (regression, Commits 2/4A)', () => {
  it('ο BOB δεν μπορεί να ενεργοποιήσει v2 πάνω σε δεδομένα που ήδη ανήκουν στην ALICE', async () => {
    await claimLegacyDataOwnership(ALICE, asAlice)
    const state = await runMigration(asAlice)
    expect(state.status).toBe('complete')
    await activateV2Generation(ALICE, asAlice)

    await expect(activateV2Generation(BOB, asBob)).rejects.toMatchObject({ code: 'LEGACY_OWNER_MISMATCH' })
    expect(await getActiveGeneration(BOB)).toBe('legacy') // fail-closed, καμία επίδραση στον BOB
  })
})

describe('unsyncedTables εξακολουθεί να καλύπτει ΚΑΘΕ πίνακα (δομική εγγύηση, βλ. db.js)', () => {
  it('db.tables.map(t=>t.name) — η ΙΔΙΑ είσοδος που τροφοδοτεί το unsyncedTables sweep — περιλαμβάνει ΚΑΘΕ legacy ΚΑΙ _v2 πίνακα', () => {
    const allTableNames = db.tables.map((t) => t.name)
    for (const legacyName of MIGRATED_TABLE_NAMES) {
      expect(allTableNames).toContain(legacyName)
      expect(allTableNames).toContain(v2TableName(legacyName))
    }
    expect(allTableNames).toContain('appMeta')
  })
})
