import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  db, getActiveSchoolYear, createSchoolYear, setStudentActive, createGoal, ensureDomainTemplatesSeeded
} from './db.js'
import { claimLegacyDataOwnership } from './migration/legacyOwnership.js'
import { runMigration, resetMigrationForTests } from './migration/migrationEngine.js'
import {
  activateV2Generation, initializeActiveGeneration, resetActiveGenerationForTests, withNewRowId
} from './migration/activeGeneration.js'
import { MIGRATED_TABLE_NAMES } from './migration/migratedTableNames.js'
import { deterministicId } from './migration/deterministicId.js'
import { DOMAINS } from './config/domains.js'

// Sprint 5A Phase 2, Commit 4B/4C — αντιπροσωπευτικά tests ΟΤΙ η mechanical routing μέσω
// activeTable() ΚΑΙ η νέα παραγωγή id μέσω withNewRowId() δουλεύουν σωστά και στις δύο γενιές.
const ALICE = 'alice@example.com'
const asAlice = { getAuthenticatedUserId: () => ALICE }

async function activateV2ForAlice() {
  await claimLegacyDataOwnership(ALICE, asAlice)
  const state = await runMigration(asAlice)
  expect(state.status).toBe('complete')
  await activateV2Generation(ALICE, asAlice)
  await initializeActiveGeneration({ getUserId: () => ALICE })
}

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  await resetActiveGenerationForTests()
  await resetMigrationForTests()
  await Promise.all(MIGRATED_TABLE_NAMES.map((t) => db.table(t).clear()))
  db.close()
})

describe('withNewRowId — ο κεντρικός helper παραγωγής id για νέες γραμμές', () => {
  it('legacy: αμετάβλητο πέρασμα, ΚΑΝΕΝΑ πεδίο id — ίδιο ++id auto-increment με σήμερα', () => {
    const fields = { code: 'Μ1', active: true }
    expect(withNewRowId(fields)).toBe(fields) // ίδιο αντικείμενο αναφοράς, όχι απλά ίδιο περιεχόμενο
    expect('id' in withNewRowId(fields)).toBe(false)
  })

  // Review (μετά την πρώτη υλοποίηση) — το caller-supplied fields.id ΠΟΤΕ δεν πρέπει να επιβιώσει
  // σε v2 δημιουργία, ΑΝΕΞΑΡΤΗΤΑ από το τι μορφή είχε (παλιό αριθμητικό legacy id, ήδη υπαρκτό v2
  // uuid, ή καθόλου). Τα 5 σενάρια παρακάτω καλύπτουν ρητά ό,τι ζητήθηκε.
  it('χωρίς id στα fields → v2 παράγει κανονικά ένα νέο uuid', async () => {
    await activateV2ForAlice()
    const withId = withNewRowId({ code: 'Μ1', active: true })
    expect(typeof withId.id).toBe('string')
    expect(withId.id.length).toBeGreaterThan(10)
    expect(withId.code).toBe('Μ1')
  })

  it('fields ΜΕ παλιό αριθμητικό (legacy-style) id → αγνοείται πλήρως, αντικαθίσταται από νέο uuid', async () => {
    await activateV2ForAlice()
    const withId = withNewRowId({ id: 42, code: 'Μ1', active: true })
    expect(withId.id).not.toBe(42)
    expect(typeof withId.id).toBe('string')
    expect(withId.id.length).toBeGreaterThan(10)
  })

  it('fields ΜΕ ήδη υπαρκτό v2 string id (π.χ. κατά λάθος spread από άλλη γραμμή) → αγνοείται, ΝΕΟ uuid', async () => {
    await activateV2ForAlice()
    const existingV2Id = 'already-in-use-v2-id'
    const withId = withNewRowId({ id: existingV2Id, code: 'Μ1', active: true })
    expect(withId.id).not.toBe(existingV2Id)
    expect(typeof withId.id).toBe('string')
  })

  it('αντιγραμμένη (spread) εγγραφή παίρνει ΓΝΗΣΙΑ νέο id, ΟΧΙ το id του πρωτότυπου', async () => {
    await activateV2ForAlice()
    const original = { id: 'original-row-id', code: 'Μ1', active: true, nickname: 'Πρωτότυπο' }
    const copy = withNewRowId({ ...original }) // ίδιο idiom με «αντιγραφή/duplicate» call sites
    expect(copy.id).not.toBe(original.id)
    expect(typeof copy.id).toBe('string')
    expect(copy.code).toBe('Μ1') // τα υπόλοιπα πεδία αντιγράφονται κανονικά
    expect(copy.nickname).toBe('Πρωτότυπο')
  })

  it('legacy: fields ΜΕ id (π.χ. ξεχασμένο spread) περνάει ΑΜΕΤΑΒΛΗΤΟ — δεν αφαιρείται, δεν αγγίζεται (η ίδια η Dexie ++id θα το αγνοήσει/αποφασίσει)', () => {
    const fields = { id: 42, code: 'Μ1' }
    expect(withNewRowId(fields)).toBe(fields)
  })

  it('v2: κάθε κλήση παράγει ΔΙΑΦΟΡΕΤΙΚΟ id — καμία σύγκρουση σε bulk δημιουργία', async () => {
    await activateV2ForAlice()
    const ids = new Set([withNewRowId({}).id, withNewRowId({}).id, withNewRowId({}).id])
    expect(ids.size).toBe(3)
  })
})

describe('activeTable() routing — απλή ανάγνωση (getActiveSchoolYear)', () => {
  it('legacy εξ ορισμού, v2 μετά την ενεργοποίηση — ΠΟΤΕ ανάμειξη', async () => {
    await db.schoolYears.add({ label: 'Legacy', startDate: '2025-09-01', endDate: '2026-06-30', isActive: true })
    expect((await getActiveSchoolYear())?.label).toBe('Legacy')
    await db.schoolYears.clear()

    await activateV2ForAlice()
    expect(await getActiveSchoolYear()).toBe(null)

    await db.table('schoolYears_v2').add({ id: 'yr-v2', label: 'V2', startDate: '2026-09-01', endDate: '2027-06-30', isActive: true })
    await db.schoolYears.add({ label: 'ΝέοLegacy', startDate: '2027-09-01', endDate: '2028-06-30', isActive: true })

    expect((await getActiveSchoolYear())?.label).toBe('V2')
  })
})

describe('activeTable() routing — απλή εγγραφή/δημιουργία (createSchoolYear, τώρα ΚΑΙ create-path)', () => {
  it('legacy: αυτόματο ++id αριθμητικό, όπως πάντα', async () => {
    const legacyId = await createSchoolYear({ label: 'Legacy', startDate: '2025-09-01', endDate: '2026-06-30' })
    expect(typeof legacyId).toBe('number')
    expect(await db.schoolYears.get(legacyId)).toBeTruthy()
  })

  it('v2: string UUID id, γράφεται ΜΟΝΟ στο schoolYears_v2 — η legacy γενιά ΔΕΝ αγγίζεται', async () => {
    await activateV2ForAlice()
    const v2Id = await createSchoolYear({ label: 'V2', startDate: '2026-09-01', endDate: '2027-06-30' })
    expect(typeof v2Id).toBe('string')
    const row = await db.table('schoolYears_v2').get(v2Id)
    expect(row).toMatchObject({ label: 'V2' })
    expect(await db.schoolYears.count()).toBe(0)
  })
})

describe('activeTable() routing — δημιουργία με FK αλυσίδα (createGoal → goal + goalEvent)', () => {
  it('v2: goal ΚΑΙ το αρχικό goalEvent παίρνουν ΞΕΧΩΡΙΣΤΑ, έγκυρα ids· το goalEvent.goalId δείχνει σωστά στο νέο goal', async () => {
    await activateV2ForAlice()
    const goalId = await createGoal({
      studentId: 'stu-1', domain: 'reading', title: 'Στόχος', priority: 'medium', startDate: '2026-01-01'
    })
    expect(typeof goalId).toBe('string')

    const goal = await db.table('goals_v2').get(goalId)
    expect(goal.status).toBe('active')

    const events = await db.table('goalEvents_v2').where('goalId').equals(goalId).toArray()
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('created')
    expect(events[0].id).not.toBe(goalId) // ξεχωριστό id από το ίδιο το goal
  })
})

describe('activeTable() routing — πολυ-πίνακη συναλλαγή (setStudentActive: students + schoolYearParticipation)', () => {
  it('ΚΑΙ οι δύο πίνακες γράφονται στην ΙΔΙΑ (ενεργή) γενιά μέσα στην ίδια συναλλαγή — καμία ανάμειξη γενιών', async () => {
    await activateV2ForAlice()
    const v2Students = db.table('students_v2')
    const v2Years = db.table('schoolYears_v2')
    const v2Participation = db.table('schoolYearParticipation_v2')

    await v2Students.add({ id: 'stu-1', code: 'Μ1', active: true })
    await v2Years.add({ id: 'yr-1', label: 'Έτος', startDate: '2026-09-01', endDate: '2027-06-30', isActive: true })

    await setStudentActive('stu-1', false, { reason: 'δοκιμή' })

    const updatedStudent = await v2Students.get('stu-1')
    expect(updatedStudent.active).toBe(false)
    const participation = await v2Participation.where('studentId').equals('stu-1').toArray()
    expect(participation).toHaveLength(1)
    expect(participation[0].status).toBe('departed')
    expect(typeof participation[0].id).toBe('string') // δημιουργήθηκε μέσω withNewRowId, ΟΧΙ auto-increment

    expect(await db.students.count()).toBe(0)
    expect(await db.schoolYearParticipation.count()).toBe(0)
  })
})

describe('ensureDomainTemplatesSeeded — deterministic seed ids (Commit 4C)', () => {
  it('legacy: ΑΜΕΤΑΒΛΗΤΗ συμπεριφορά — domain παραμένει primary key, όπως πριν το Commit 4B/4C', async () => {
    await ensureDomainTemplatesSeeded()
    const rows = await db.domainTemplates.toArray()
    expect(rows).toHaveLength(DOMAINS.length)
    expect(rows.every((r) => typeof r.domain === 'string')).toBe(true)
    expect(rows.every((r) => !('id' in r))).toBe(true)
  })

  it('v2: κάθε γραμμή παίρνει id = deterministicId(userId, "domainTemplates", domain) — ΟΧΙ τυχαίο', async () => {
    await activateV2ForAlice()
    await ensureDomainTemplatesSeeded({ getUserId: () => ALICE })

    const rows = await db.table('domainTemplates_v2').toArray()
    expect(rows).toHaveLength(DOMAINS.length)
    for (const row of rows) {
      expect(row.id).toBe(await deterministicId(ALICE, 'domainTemplates', row.domain))
    }
    expect(await db.domainTemplates.count()).toBe(0) // η legacy δεν αγγίζεται
  })

  it('v2: idempotent σε rerun — ΙΔΙΑ ids, ΚΑΝΕΝΑ διπλότυπο (bulkPut overwrite, όχι δεύτερη γραμμή)', async () => {
    await activateV2ForAlice()
    await ensureDomainTemplatesSeeded({ getUserId: () => ALICE })
    const firstIds = (await db.table('domainTemplates_v2').toArray()).map((r) => r.id).sort()

    await ensureDomainTemplatesSeeded({ getUserId: () => ALICE }) // rerun — π.χ. σαν να προστέθηκε νέος τομέας στο config

    const rowsAfter = await db.table('domainTemplates_v2').toArray()
    expect(rowsAfter).toHaveLength(DOMAINS.length) // ΟΧΙ διπλάσιες γραμμές
    expect(rowsAfter.map((r) => r.id).sort()).toEqual(firstIds)
  })

  // Review (Commit 4C, τρίτο σημείο) — fail-closed: αν η γενιά είναι v2 αλλά δεν υπάρχει έγκυρο
  // userId, η συνάρτηση ΔΕΝ πρέπει ποτέ να υπολογίσει deterministicId(null/'', ...) και να γράψει
  // ένα «ορφανό» seed row χωρίς πραγματικό νόημα ιδιοκτησίας — πρέπει να πετάξει ΠΡΙΝ από ΚΑΘΕ
  // εγγραφή.
  describe('fail-closed όταν v2 ΧΩΡΙΣ έγκυρο userId', () => {
    it('userId=null → πετάει, ΜΗΔΕΝΙΚΗ εγγραφή, ΚΑΜΙΑ δημιουργία deterministic id', async () => {
      await activateV2ForAlice()
      await expect(ensureDomainTemplatesSeeded({ getUserId: () => null })).rejects.toThrow(/userId/)
      expect(await db.table('domainTemplates_v2').count()).toBe(0)
    })

    it('userId="" (κενό string) → ίδιο fail-closed αποτέλεσμα', async () => {
      await activateV2ForAlice()
      await expect(ensureDomainTemplatesSeeded({ getUserId: () => '' })).rejects.toThrow(/userId/)
      expect(await db.table('domainTemplates_v2').count()).toBe(0)
    })

    it('userId="   " (μόνο κενά) → ίδιο fail-closed αποτέλεσμα', async () => {
      await activateV2ForAlice()
      await expect(ensureDomainTemplatesSeeded({ getUserId: () => '   ' })).rejects.toThrow(/userId/)
      expect(await db.table('domainTemplates_v2').count()).toBe(0)
    })
  })
})
