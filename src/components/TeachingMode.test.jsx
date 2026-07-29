import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import db from '../db.js'
import TeachingMode from './TeachingMode.jsx'
import { claimLegacyDataOwnership } from '../migration/legacyOwnership.js'
import { runMigration, resetMigrationForTests } from '../migration/migrationEngine.js'
import { activateV2Generation, resetActiveGenerationForTests, activeTable } from '../migration/activeGeneration.js'

// UX improvement — accordion στόχων στο Teaching Mode: αρχικά όλοι συμπτυγμένοι, κλικ ανοίγει ΕΝΑΝ
// στόχο τη φορά (κλείνει τον προηγούμενο αυτόματα), ξανά κλικ στον ίδιο τον κλείνει. Καμία σελιδοποίηση
// πια — όλοι οι στόχοι μαθητή αποδίδονται ως λίστα.

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  cleanup()
  await resetActiveGenerationForTests()
  await resetMigrationForTests()
  await Promise.all(db.tables.map((t) => t.clear()))
  db.close()
})

function renderTeachingMode(studentIds) {
  const path = `/teaching/session/${studentIds.join(',')}`
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/teaching/session/:studentIds" element={<TeachingMode />} />
      </Routes>
    </MemoryRouter>
  )
}

async function seedGoal(studentId, { title, domain = 'reading', measurementType = 'successRatio', criterion = '4 από 5 προσπάθειες' }) {
  return db.goals.add({
    studentId, domain, title, description: `Περίληψη για ${title}`, baseline: '',
    measurementType,
    criterionConfig: { targetSuccesses: 4, targetAttempts: 5 },
    criterion,
    supportLevel: '', priority: 'medium', startDate: '2026-01-01', status: 'active', statusChangedAt: '2026-01-01'
  })
}

describe('TeachingMode — accordion στόχων (UX improvement)', () => {
  it('όλοι οι στόχοι ξεκινούν συμπτυγμένοι — κανένα recording UI ορατό', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    await seedGoal(studentId, { title: 'Στόχος Α' })
    await seedGoal(studentId, { title: 'Στόχος Β' })

    renderTeachingMode([studentId])
    await waitFor(() => expect(screen.getByText('Στόχος Α')).toBeInTheDocument())

    expect(screen.getByText('Στόχος Α')).toBeInTheDocument()
    expect(screen.getByText('Στόχος Β')).toBeInTheDocument()
    // Το recording UI (π.χ. κουμπιά Επιτυχία/Αποτυχία του successRatio) δεν πρέπει να υπάρχει ακόμα.
    expect(screen.queryByRole('button', { name: /Επιτυχία/ })).not.toBeInTheDocument()
  })

  it('κλικ σε στόχο τον ανοίγει· κλικ σε άλλον στόχο ανοίγει αυτόν και κλείνει τον προηγούμενο', async () => {
    const user = userEvent.setup()
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    await seedGoal(studentId, { title: 'Στόχος Α' })
    await seedGoal(studentId, { title: 'Στόχος Β' })

    renderTeachingMode([studentId])
    await waitFor(() => expect(screen.getByText('Στόχος Α')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /Στόχος Α/ }))
    expect(within(screen.getByRole('button', { name: /Στόχος Α/ }).closest('.goal-recorder-card')).getAllByRole('button', { name: /Επιτυχία/ }).length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: /Στόχος Β/ }))
    const cardA = screen.getByRole('button', { name: /Στόχος Α/ }).closest('.goal-recorder-card')
    const cardB = screen.getByRole('button', { name: /Στόχος Β/ }).closest('.goal-recorder-card')
    expect(within(cardA).queryByRole('button', { name: /Επιτυχία/ })).not.toBeInTheDocument()
    expect(within(cardB).getAllByRole('button', { name: /Επιτυχία/ }).length).toBeGreaterThan(0)
  })

  it('κλικ ξανά στον ήδη ανοιχτό στόχο τον κλείνει (κανένας ανοιχτός)', async () => {
    const user = userEvent.setup()
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    await seedGoal(studentId, { title: 'Στόχος Α' })

    renderTeachingMode([studentId])
    await waitFor(() => expect(screen.getByText('Στόχος Α')).toBeInTheDocument())

    const header = screen.getByRole('button', { name: /Στόχος Α/ })
    await user.click(header)
    expect(screen.getAllByRole('button', { name: /Επιτυχία/ }).length).toBeGreaterThan(0)

    await user.click(header)
    expect(screen.queryByRole('button', { name: /Επιτυχία/ })).not.toBeInTheDocument()
  })

  it('καταγραφή τιμής σε ανοιχτό στόχο παραμένει ανοιχτός ΚΑΙ εμφανίζεται ✓ ένδειξη όταν συμπτυχθεί', async () => {
    const user = userEvent.setup()
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    await seedGoal(studentId, { title: 'Στόχος Α' })

    renderTeachingMode([studentId])
    await waitFor(() => expect(screen.getByText('Στόχος Α')).toBeInTheDocument())

    const header = screen.getByRole('button', { name: /Στόχος Α/ })
    await user.click(header)
    await user.click(screen.getAllByRole('button', { name: /Επιτυχία/ })[0])

    // Παραμένει ανοιχτός — το recording UI είναι ακόμα ορατό μετά την καταγραφή.
    expect(screen.getAllByRole('button', { name: /Επιτυχία/ }).length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: /Στόχος Α/ }))
    expect(screen.queryByRole('button', { name: /Επιτυχία/ })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Καταγράφηκε σε αυτή τη συνεδρία')).toBeInTheDocument()
  })

  it('αλλαγή μαθητή (group session) μηδενίζει τον ανοιχτό στόχο — ξανά όλοι κλειστοί', async () => {
    const user = userEvent.setup()
    const studentA = await db.students.add({ code: 'Μ1', active: true })
    const studentB = await db.students.add({ code: 'Μ2', active: true })
    await seedGoal(studentA, { title: 'Στόχος Α' })
    await seedGoal(studentB, { title: 'Στόχος Γ' })

    renderTeachingMode([studentA, studentB])
    await waitFor(() => expect(screen.getByText('Στόχος Α')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /Στόχος Α/ }))
    expect(screen.getAllByRole('button', { name: /Επιτυχία/ }).length).toBeGreaterThan(0)

    await user.click(screen.getByRole('tab', { name: 'Μ2' }))
    await waitFor(() => expect(screen.getByText('Στόχος Γ')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /Επιτυχία/ })).not.toBeInTheDocument()
  })

  it('πολλοί στόχοι (15+) αποδίδονται ως λίστα, χωρίς σελιδοποίηση', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    for (let i = 1; i <= 16; i++) {
      await seedGoal(studentId, { title: `Στόχος ${i}` })
    }

    renderTeachingMode([studentId])
    await waitFor(() => expect(screen.getByText('Στόχος 1')).toBeInTheDocument())

    expect(screen.getByText('Στόχος 16')).toBeInTheDocument()
    expect(screen.queryByLabelText(/Σελίδα στόχων/)).not.toBeInTheDocument()
  })
})

async function endSession(user, { duration = '30′' } = {}) {
  await user.click(screen.getByRole('button', { name: 'Τέλος' }))
  await user.click(screen.getByRole('button', { name: duration }))
  await user.click(screen.getByRole('button', { name: 'Αποθήκευση' }))
}

describe('TeachingMode — κλινική εκτίμηση στόχου ανά συνεδρία', () => {
  it('«Βελτιώθηκε» + σημείωση → γράφεται sessionGoalAssessments, ΚΑΜΙΑ επίπτωση στην κατάσταση του στόχου', async () => {
    const user = userEvent.setup()
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    const goalId = await seedGoal(studentId, { title: 'Στόχος Α' })

    renderTeachingMode([studentId])
    await waitFor(() => expect(screen.getByText('Στόχος Α')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /Στόχος Α/ }))
    await user.click(screen.getByRole('button', { name: 'Βελτιώθηκε' }))
    await user.type(screen.getByPlaceholderText('Σύντομη παρατήρηση (προαιρετικό)'), 'Καλή συγκέντρωση')

    await endSession(user)

    await waitFor(async () => {
      const rows = await db.sessionGoalAssessments.where('goalId').equals(goalId).toArray()
      expect(rows).toHaveLength(1)
    })
    const [row] = await db.sessionGoalAssessments.where('goalId').equals(goalId).toArray()
    expect(row.rating).toBe('improved')
    expect(row.note).toBe('Καλή συγκέντρωση')

    const goal = await db.goals.get(goalId)
    expect(goal.status).toBe('active')
    const events = await db.goalEvents.where('goalId').equals(goalId).toArray()
    expect(events.some((e) => e.trigger === 'teachingMode')).toBe(false)
  })

  it('goal χωρίς καμία καταχώρηση → ΚΑΜΙΑ εγγραφή sessionGoalAssessments μετά την αποθήκευση (Επιλογή Α)', async () => {
    const user = userEvent.setup()
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    const goalId = await seedGoal(studentId, { title: 'Στόχος Α' })

    renderTeachingMode([studentId])
    await waitFor(() => expect(screen.getByText('Στόχος Α')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Τέλος' }))
    await user.click(screen.getByRole('button', { name: '30′' }))
    await user.click(screen.getByRole('button', { name: 'Αποθήκευση' }))

    await waitFor(async () => {
      const sessions = await db.sessions.toArray()
      expect(sessions).toHaveLength(1)
    })
    const rows = await db.sessionGoalAssessments.where('goalId').equals(goalId).toArray()
    expect(rows).toHaveLength(0)
  })

  it('«Κατακτήθηκε» + επιβεβαίωση + αποθήκευση συνεδρίας → goal γίνεται achieved μέσω transitionGoalStatus, ΟΧΙ πριν', async () => {
    const user = userEvent.setup()
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    const goalId = await seedGoal(studentId, { title: 'Στόχος Α' })

    renderTeachingMode([studentId])
    await waitFor(() => expect(screen.getByText('Στόχος Α')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /Στόχος Α/ }))
    await user.click(screen.getByRole('button', { name: 'Κατακτήθηκε' }))
    await user.click(screen.getByRole('button', { name: 'Επιβεβαίωση' }))

    // Πριν την αποθήκευση της συνεδρίας — καμία επαφή με τη βάση ακόμα (deferred, βλ. execution plan).
    expect((await db.goals.get(goalId)).status).toBe('active')

    await endSession(user)

    await waitFor(async () => {
      const goal = await db.goals.get(goalId)
      expect(goal.status).toBe('achieved')
    })

    const assessments = await db.sessionGoalAssessments.where('goalId').equals(goalId).toArray()
    expect(assessments).toHaveLength(1)
    expect(assessments[0].rating).toBe('mastered')

    const events = await db.goalEvents.where('goalId').equals(goalId).toArray()
    const teachingModeEvent = events.find((e) => e.trigger === 'teachingMode')
    expect(teachingModeEvent).toBeTruthy()
    expect(teachingModeEvent.type).toBe('statusChanged')
    expect(teachingModeEvent.toStatus).toBe('achieved')
  })
})

// Critical hotfix regression (Technical Fix Plan) — πριν το resolveEntityId, το session-save block
// (measurementsTable.bulkAdd/sessionGoalAssessmentsTable.bulkAdd/transitionGoalStatus) έγραφε
// goalId: Number(goalId) — πάντα NaN σε v2 (goalId εδώ είναι object key, άρα πάντα string), ΧΩΡΙΣ
// κανέναν έλεγχο ύπαρξης στο bulkAdd· η μέτρηση γραφόταν σιωπηλά ορφανή, ΧΩΡΙΣ κανένα σφάλμα. Το
// tab-switch (Number(id)) και το Observation dropdown (Number(e.target.value)) είχαν το ίδιο πρόβλημα.
describe('TeachingMode — v2 γενιά (κρίσιμο hotfix regression)', () => {
  const ALICE = 'alice@example.com'
  const asAlice = { getAuthenticatedUserId: () => ALICE }

  async function activateV2ForAlice() {
    await claimLegacyDataOwnership(ALICE, asAlice)
    const state = await runMigration(asAlice)
    expect(state.status).toBe('complete')
    await activateV2Generation(ALICE, asAlice)
  }

  async function seedV2Goal(studentId, { title }) {
    const goalId = crypto.randomUUID()
    await activeTable('goals').add({
      id: goalId, studentId, domain: 'reading', title, description: '', baseline: '',
      measurementType: 'successRatio', criterionConfig: { targetSuccesses: 4, targetAttempts: 5 },
      criterion: '4 από 5 προσπάθειες', supportLevel: '', priority: 'medium', startDate: '2026-01-01',
      status: 'active', statusChangedAt: '2026-01-01'
    })
    return goalId
  }

  it('μέτρηση + αποθήκευση συνεδρίας γράφει το ΣΩΣΤΟ (string) goalId/studentId, ΟΧΙ NaN', async () => {
    await activateV2ForAlice()
    const user = userEvent.setup()
    const studentId = crypto.randomUUID()
    await activeTable('students').add({ id: studentId, code: 'Μ1', active: true })
    const goalId = await seedV2Goal(studentId, { title: 'Στόχος Α' })

    renderTeachingMode([studentId])
    await waitFor(() => expect(screen.getByText('Στόχος Α')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /Στόχος Α/ }))
    await user.click(screen.getAllByRole('button', { name: /Επιτυχία/ })[0])
    await endSession(user)

    await waitFor(async () => {
      expect(await activeTable('sessions').count()).toBe(1)
    })
    const measurements = await activeTable('measurements').where('goalId').equals(goalId).toArray()
    expect(measurements).toHaveLength(1)
    expect(measurements[0].studentId).toBe(studentId)
    expect(measurements[0].goalId).toBe(goalId)
    expect(Number.isNaN(measurements[0].goalId)).toBe(false)
  })

  it('«Κατακτήθηκε» σε v2 goal → transitionGoalStatus πετυχαίνει με το σωστό (string) goalId', async () => {
    await activateV2ForAlice()
    const user = userEvent.setup()
    const studentId = crypto.randomUUID()
    await activeTable('students').add({ id: studentId, code: 'Μ1', active: true })
    const goalId = await seedV2Goal(studentId, { title: 'Στόχος Α' })

    renderTeachingMode([studentId])
    await waitFor(() => expect(screen.getByText('Στόχος Α')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /Στόχος Α/ }))
    await user.click(screen.getByRole('button', { name: 'Κατακτήθηκε' }))
    await user.click(screen.getByRole('button', { name: 'Επιβεβαίωση' }))
    await endSession(user)

    await waitFor(async () => {
      const goal = await activeTable('goals').get(goalId)
      expect(goal.status).toBe('achieved')
    })
    const events = await activeTable('goalEvents').where('goalId').equals(goalId).toArray()
    expect(events.some((e) => e.trigger === 'teachingMode')).toBe(true)
  })

  it('ομαδική συνεδρία v2: εναλλαγή μαθητή μέσω tab δουλεύει (UUID ids)', async () => {
    await activateV2ForAlice()
    const user = userEvent.setup()
    const studentA = crypto.randomUUID()
    const studentB = crypto.randomUUID()
    await activeTable('students').add({ id: studentA, code: 'Μ1', active: true })
    await activeTable('students').add({ id: studentB, code: 'Μ2', active: true })
    await seedV2Goal(studentA, { title: 'Στόχος Α' })
    await seedV2Goal(studentB, { title: 'Στόχος Γ' })

    renderTeachingMode([studentA, studentB])
    await waitFor(() => expect(screen.getByText('Στόχος Α')).toBeInTheDocument())

    await user.click(screen.getByRole('tab', { name: 'Μ2' }))
    await waitFor(() => expect(screen.getByText('Στόχος Γ')).toBeInTheDocument())
  })

  it('Παρατήρηση σε ομαδική v2 συνεδρία: αλλαγή μαθητή στο dropdown γράφει το ΣΩΣΤΟ studentId', async () => {
    await activateV2ForAlice()
    const user = userEvent.setup()
    const studentA = crypto.randomUUID()
    const studentB = crypto.randomUUID()
    await activeTable('students').add({ id: studentA, code: 'Μ1', active: true })
    await activeTable('students').add({ id: studentB, code: 'Μ2', active: true })
    await seedV2Goal(studentA, { title: 'Στόχος Α' })

    renderTeachingMode([studentA, studentB])
    await waitFor(() => expect(screen.getByText('Στόχος Α')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Παρατήρηση' }))
    await user.selectOptions(screen.getByLabelText('Μαθητής'), studentB)
    await user.type(screen.getByLabelText('Τι παρατήρησες;'), 'Καλή μέρα')
    await user.click(screen.getByRole('button', { name: 'Αποθήκευση' }))

    await waitFor(async () => {
      expect(await activeTable('observations').count()).toBe(1)
    })
    const [obs] = await activeTable('observations').toArray()
    expect(obs.studentId).toBe(studentB)
  })
})
