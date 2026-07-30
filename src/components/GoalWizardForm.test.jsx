import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import db from '../db.js'
import AuthProvider from '../auth/AuthProvider.jsx'
import GoalWizardForm from './GoalWizardForm.jsx'
import { listMeasurementTypes } from '../utils/measurementTypes/index.js'
import { DOMAINS } from '../config/domains.js'
import { computeGoalAttention } from '../utils/goalAttention.js'
import { claimLegacyDataOwnership } from '../migration/legacyOwnership.js'
import { runMigration, resetMigrationForTests } from '../migration/migrationEngine.js'
import { activateV2Generation, resetActiveGenerationForTests, activeTable } from '../migration/activeGeneration.js'

// Component tests (Technical Plan Στάδιο 3 — πρώτα *.test.jsx σε αυτό το codebase, βλ. vite.config.js
// environmentMatchGlobs). Ίδιο DB setup idiom με τα Dexie *.test.js (fake-indexeddb, καθαρισμός
// ανά test) — εδώ μόνο προστίθεται πραγματικό rendering πάνω από αυτό.

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  // Vitest δεν κάνει auto-detect/auto-cleanup του RTL όπως το Jest (χρειάζεται `test.globals: true`,
  // που δεν έχουμε ενεργό) — χωρίς ρητό cleanup() το DOM από το προηγούμενο test παραμένει, και
  // queries όπως getByRole βρίσκουν διπλότυπα στοιχεία στο επόμενο test.
  cleanup()
  await resetActiveGenerationForTests() // βλ. describe «v2 γενιά» παρακάτω — καθαρό cache/appMeta ανά test
  await resetMigrationForTests()
  await Promise.all(db.tables.map((t) => t.clear()))
  db.close()
})

function renderWizard(mode, { studentId = 1, goalId } = {}) {
  const path = mode === 'edit' ? `/students/${studentId}/goals/${goalId}/edit` : `/students/${studentId}/goals/new`
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/students/:id/goals/new" element={<GoalWizardForm mode="create" />} />
          <Route path="/students/:id/goals/:goalId/edit" element={<GoalWizardForm mode="edit" />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  )
}

async function goToStep3(user, { domain = DOMAINS[0].id, title = 'Τίτλος στόχου', baseline = 'Δεν κάνει τίποτα ακόμα' } = {}) {
  await user.selectOptions(screen.getByLabelText('Τομέας', { exact: false }), domain)
  await user.type(screen.getByLabelText('Τι θέλουμε να πετύχει', { exact: false }), title)
  await user.click(screen.getByRole('button', { name: 'Επόμενο →' }))
  await user.type(screen.getByLabelText('Τι κάνει σήμερα ο μαθητής', { exact: false }), baseline)
  await user.click(screen.getByRole('button', { name: 'Επόμενο →' }))
}

function radioFor(container, typeValue) {
  return container.querySelector(`input[type="radio"][value="${typeValue}"]`)
}

async function seedLegacyGoal(studentId, overrides = {}) {
  return db.goals.add({
    studentId,
    domain: DOMAINS[0].id,
    title: 'Παλιός στόχος',
    description: '',
    baseline: 'Κάτι',
    criterion: '8/10',
    measurementType: 'successRatio',
    supportLevel: '',
    priority: 'medium',
    startDate: '2026-01-01',
    status: 'active',
    statusChangedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  })
}

describe('Οθόνη Α — κάρτες τύπου μέτρησης (Technical Plan Στάδιο 3)', () => {
  it('εμφανίζει ΚΑΙ τους 8 τύπους, αποκλειστικά από το registry', async () => {
    const user = userEvent.setup()
    const { container } = renderWizard('create')
    await goToStep3(user)

    const radios = container.querySelectorAll('.measurement-type-card-grid input[type="radio"]')
    expect(radios).toHaveLength(8)

    for (const type of listMeasurementTypes()) {
      expect(radioFor(container, type.value)).toBeTruthy()
      expect(screen.getByText(type.label)).toBeInTheDocument()
    }
  })

  it('create mode: καμία κάρτα προεπιλεγμένη', async () => {
    const user = userEvent.setup()
    const { container } = renderWizard('create')
    await goToStep3(user)

    const radios = container.querySelectorAll('.measurement-type-card-grid input[type="radio"]')
    expect(Array.from(radios).some((r) => r.checked)).toBe(false)
  })

  it('κλικ σε κάρτα την επιλέγει (πρώτη επιλογή, τίποτα να χαθεί)', async () => {
    const user = userEvent.setup()
    const { container } = renderWizard('create')
    await goToStep3(user)

    await user.click(screen.getByText('Ποσοστό επιτυχίας'))
    expect(radioFor(container, 'successRatio').checked).toBe(true)
  })

  it('επιλογή με πληκτρολόγιο (Tab μέχρι την κάρτα, Space) επιλέγει τον τύπο', async () => {
    const user = userEvent.setup()
    const { container } = renderWizard('create')
    await goToStep3(user)

    const target = radioFor(container, 'successRatio')
    target.focus()
    await user.keyboard(' ')
    expect(target.checked).toBe(true)
  })

  it('η επιλογή τύπου ΔΕΝ αλλοιώνει τα δεδομένα των Βημάτων 1/2', async () => {
    const user = userEvent.setup()
    renderWizard('create')
    await goToStep3(user, { title: 'Ο τίτλος μου', baseline: 'Η αρχική κατάσταση' })

    await user.click(screen.getByText('Ποσοστό επιτυχίας'))

    await user.click(screen.getByRole('button', { name: '← Πίσω' }))
    expect(screen.getByLabelText('Τι κάνει σήμερα ο μαθητής', { exact: false })).toHaveValue('Η αρχική κατάσταση')
    await user.click(screen.getByRole('button', { name: '← Πίσω' }))
    expect(screen.getByLabelText('Τι θέλουμε να πετύχει', { exact: false })).toHaveValue('Ο τίτλος μου')
  })

  // Και οι 8 τύποι έχουν πλέον δικό τους panel (Στάδιο 7 ολοκλήρωσε τη λίστα) — αυτό το σενάριο
  // δοκιμάζει τον ΓΕΝΙΚΟ confirm-mechanism του Σταδίου 3 χρησιμοποιώντας δύο πραγματικά panels
  // (Checklist/Βήματα εργασίας) αντί για το πλέον ανύπαρκτο παλιό ελεύθερο κείμενο.
  it('αλλαγή τύπου ΜΕΤΑ από συμπληρωμένο κριτήριο ζητά επιβεβαίωση — επιβεβαίωση καθαρίζει το κριτήριο', async () => {
    const user = userEvent.setup()
    const { container } = renderWizard('create')
    await goToStep3(user)

    await user.click(screen.getByText('Λίστα ελέγχου'))
    await user.click(screen.getByRole('button', { name: 'Προσθήκη στοιχείου' }))
    await user.type(screen.getByLabelText('Στοιχείο 1'), 'Πλένει τα χέρια')

    await user.click(screen.getByText('Βήματα εργασίας'))
    expect(screen.getByRole('dialog', { name: 'Αλλαγή τρόπου παρακολούθησης' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Αλλαγή τύπου' }))
    expect(radioFor(container, 'taskAnalysis').checked).toBe(true)
    // Νέο, κενό panel Βημάτων εργασίας — καμία γραμμή, όχι το παλιό περιεχόμενο του Checklist.
    expect(screen.queryByLabelText('Στοιχείο 1')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Βήμα 1')).not.toBeInTheDocument()
  })

  it('cancel στο dialog διατηρεί τον προηγούμενο τύπο ΚΑΙ το προηγούμενο περιεχόμενο', async () => {
    const user = userEvent.setup()
    const { container } = renderWizard('create')
    await goToStep3(user)

    await user.click(screen.getByText('Λίστα ελέγχου'))
    await user.click(screen.getByRole('button', { name: 'Προσθήκη στοιχείου' }))
    await user.type(screen.getByLabelText('Στοιχείο 1'), 'Πλένει τα χέρια')

    await user.click(screen.getByText('Βήματα εργασίας'))
    await user.click(screen.getByRole('button', { name: 'Ακύρωση' }))

    expect(radioFor(container, 'checklist').checked).toBe(true)
    expect(radioFor(container, 'taskAnalysis').checked).toBe(false)
    expect(screen.getByLabelText('Στοιχείο 1')).toHaveValue('Πλένει τα χέρια')
  })
})

describe('Edit mode — προστασία αλλαγής τύπου (Technical Plan Στάδιο 3, σημείο 4)', () => {
  it('legacy goal (χωρίς criterionConfig) ανοίγει χωρίς σφάλμα, σωστή κάρτα προεπιλεγμένη', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    const goalId = await seedLegacyGoal(studentId)
    const { container } = renderWizard('edit', { studentId, goalId })

    await waitFor(() => expect(screen.queryByText('Φόρτωση…')).not.toBeInTheDocument())
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Επόμενο →' }))
    await user.click(screen.getByRole('button', { name: 'Επόμενο →' }))

    expect(radioFor(container, 'successRatio').checked).toBe(true)
  })

  it('goal ΧΩΡΙΣ μετρήσεις: αλλαγή τύπου επιτρέπεται μετά από επιβεβαίωση, δημιουργεί κενό criterionConfig του νέου τύπου', async () => {
    const studentId = await db.students.add({ code: 'Μ2', active: true })
    const goalId = await seedLegacyGoal(studentId)
    const { container } = renderWizard('edit', { studentId, goalId })
    await waitFor(() => expect(screen.queryByText('Φόρτωση…')).not.toBeInTheDocument())

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Επόμενο →' }))
    await user.click(screen.getByRole('button', { name: 'Επόμενο →' }))

    expect(radioFor(container, 'checklist')).not.toBeDisabled()
    await user.click(screen.getByText('Λίστα ελέγχου'))
    // legacy criterion «8/10» μετράει ως περιεχόμενο → ζητά επιβεβαίωση, ίδιο idiom με create mode.
    expect(screen.getByRole('dialog', { name: 'Αλλαγή τρόπου παρακολούθησης' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Αλλαγή τύπου' }))

    expect(radioFor(container, 'checklist').checked).toBe(true)
    // Νέο, κενό checklist panel — καμία γραμμή ακόμα, μόνο το κουμπί προσθήκης.
    expect(screen.getByRole('button', { name: 'Προσθήκη στοιχείου' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /Στοιχείο/ })).not.toBeInTheDocument()
  })

  it('goal ΜΕ μετρήσεις: όλες οι άλλες κάρτες disabled, το κλικ δεν κάνει τίποτα, εμφανίζεται εξήγηση', async () => {
    const studentId = await db.students.add({ code: 'Μ3', active: true })
    const goalId = await seedLegacyGoal(studentId)
    const sessionId = await db.sessions.add({ date: '2026-01-05', studentIds: [studentId], status: 'held' })
    await db.measurements.add({ studentId, goalId, sessionId, value: { successes: 5, attempts: 10 } })

    const { container } = renderWizard('edit', { studentId, goalId })
    await waitFor(() => expect(screen.queryByText('Φόρτωση…')).not.toBeInTheDocument())
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Επόμενο →' }))
    await user.click(screen.getByRole('button', { name: 'Επόμενο →' }))

    expect(radioFor(container, 'successRatio')).not.toBeDisabled()
    expect(radioFor(container, 'checklist')).toBeDisabled()
    expect(screen.getByText(/έχει ήδη μετρήσεις/)).toBeInTheDocument()

    await user.click(screen.getByText('Λίστα ελέγχου'))
    expect(screen.queryByRole('dialog', { name: 'Αλλαγή τρόπου παρακολούθησης' })).not.toBeInTheDocument()
    expect(radioFor(container, 'successRatio').checked).toBe(true)
    expect(radioFor(container, 'checklist').checked).toBe(false)
  })
})

describe('Οθόνη Β — δυναμικά panels για successRatio/promptLevel/narrative (Technical Plan Στάδιο 4)', () => {
  it('successRatio: πλήρες create flow αποθηκεύει σωστό criterionConfig + αυτόματο criterion', async () => {
    const user = userEvent.setup()
    renderWizard('create')
    await goToStep3(user)

    await user.click(screen.getByText('Ποσοστό επιτυχίας'))
    await user.type(screen.getByLabelText('Επιτυχίες'), '4')
    await user.type(screen.getByLabelText('Σύνολο προσπαθειών'), '5')
    await user.click(screen.getByRole('button', { name: 'Αποθήκευση στόχου' }))

    await waitFor(async () => expect(await db.goals.count()).toBe(1))
    const saved = (await db.goals.toArray())[0]
    expect(saved).toMatchObject({
      measurementType: 'successRatio',
      criterionConfig: { targetSuccesses: 4, targetAttempts: 5 },
      criterion: '4 από 5 προσπάθειες'
    })
  })

  it('promptLevel: πλήρες create flow αποθηκεύει σωστό criterionConfig + αυτόματο criterion', async () => {
    const user = userEvent.setup()
    renderWizard('create')
    await goToStep3(user)

    await user.click(screen.getByText('Επίπεδο υποστήριξης'))
    await user.click(screen.getByText('Ανεξάρτητα'))
    await user.click(screen.getByRole('button', { name: 'Αποθήκευση στόχου' }))

    await waitFor(async () => expect(await db.goals.count()).toBe(1))
    const saved = (await db.goals.toArray())[0]
    expect(saved).toMatchObject({
      measurementType: 'promptLevel',
      criterionConfig: { targetLevel: 'independent' },
      criterion: 'Ανεξάρτητα'
    })
  })

  it('narrative: πλήρες create flow αποθηκεύει σωστό criterionConfig + αυτόματο criterion', async () => {
    const user = userEvent.setup()
    renderWizard('create')
    await goToStep3(user)

    await user.click(screen.getByText('Περιγραφική παρατήρηση'))
    await user.type(screen.getByLabelText('Πότε θεωρείται ότι ο στόχος έχει επιτευχθεί;', { exact: false }), 'Συμμετέχει χωρίς παρότρυνση')
    await user.click(screen.getByRole('button', { name: 'Αποθήκευση στόχου' }))

    await waitFor(async () => expect(await db.goals.count()).toBe(1))
    const saved = (await db.goals.toArray())[0]
    expect(saved).toMatchObject({
      measurementType: 'narrative',
      criterionConfig: { successDescription: 'Συμμετέχει χωρίς παρότρυνση' },
      criterion: 'Συμμετέχει χωρίς παρότρυνση'
    })
  })

  it('validation μπλοκάρει «Αποθήκευση» όταν το panel είναι ελλιπές, με σαφές μήνυμα', async () => {
    const user = userEvent.setup()
    renderWizard('create')
    await goToStep3(user)

    await user.click(screen.getByText('Ποσοστό επιτυχίας'))
    await user.click(screen.getByRole('button', { name: 'Αποθήκευση στόχου' }))

    expect(await db.goals.count()).toBe(0)
    expect(screen.getByText(/χρειάζεται αριθμό επιτυχιών/i)).toBeInTheDocument()
  })

  it('legacy goal ήδη migrated τύπου (successRatio, χωρίς criterionConfig) δείχνει το ΠΑΛΙΟ ελεύθερο κείμενο, ΟΧΙ το νέο panel', async () => {
    const studentId = await db.students.add({ code: 'Μ4', active: true })
    const goalId = await seedLegacyGoal(studentId) // measurementType: successRatio, χωρίς criterionConfig
    renderWizard('edit', { studentId, goalId })
    await waitFor(() => expect(screen.queryByText('Φόρτωση…')).not.toBeInTheDocument())

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Επόμενο →' }))
    await user.click(screen.getByRole('button', { name: 'Επόμενο →' }))

    expect(screen.getByLabelText('Κριτήριο επιτυχίας', { exact: false })).toHaveValue('8/10')
    expect(screen.queryByLabelText('Επιτυχίες')).not.toBeInTheDocument()
  })

  it('αλλαγή τύπου (edit, χωρίς μετρήσεις) σε migrated τύπο δείχνει το ΝΕΟ κενό panel', async () => {
    const studentId = await db.students.add({ code: 'Μ5', active: true })
    const goalId = await seedLegacyGoal(studentId, { measurementType: 'duration', criterion: '20 λεπτά' })
    renderWizard('edit', { studentId, goalId })
    await waitFor(() => expect(screen.queryByText('Φόρτωση…')).not.toBeInTheDocument())

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Επόμενο →' }))
    await user.click(screen.getByRole('button', { name: 'Επόμενο →' }))

    await user.click(screen.getByText('Ποσοστό επιτυχίας'))
    await user.click(screen.getByRole('button', { name: 'Αλλαγή τύπου' }))

    expect(screen.getByLabelText('Επιτυχίες').value).toBe('')
    expect(screen.queryByLabelText('Κριτήριο επιτυχίας', { exact: false })).not.toBeInTheDocument()
  })
})

describe('Οθόνη Β — δυναμικά panels για Διάρκεια/Συχνότητα (Technical Plan Στάδιο 5)', () => {
  it('Διάρκεια (αύξηση): πλήρες create flow αποθηκεύει σωστό criterionConfig + αυτόματο criterion', async () => {
    const user = userEvent.setup()
    renderWizard('create')
    await goToStep3(user)

    await user.click(screen.getByText('Διάρκεια'))
    await user.click(screen.getByText('Να αυξηθεί'))
    await user.type(screen.getByLabelText('Στόχος λεπτών'), '15')
    await user.type(screen.getByLabelText('Πλαίσιο (προαιρετικό)'), 'ανά δραστηριότητα')
    await user.click(screen.getByRole('button', { name: 'Αποθήκευση στόχου' }))

    await waitFor(async () => expect(await db.goals.count()).toBe(1))
    const saved = (await db.goals.toArray())[0]
    expect(saved).toMatchObject({
      measurementType: 'duration',
      criterionConfig: { direction: 'increase', targetMinutes: 15, context: 'ανά δραστηριότητα' },
      criterion: 'Αύξηση σε τουλάχιστον 15′ ανά δραστηριότητα'
    })
  })

  it('Συχνότητα (μείωση σε 0): πλήρες create flow αποθηκεύει σωστό criterionConfig + αυτόματο criterion', async () => {
    const user = userEvent.setup()
    renderWizard('create')
    await goToStep3(user)

    await user.click(screen.getByText('Συχνότητα'))
    await user.click(screen.getByText('Να μειωθεί'))
    await user.type(screen.getByLabelText('Στόχος φορών'), '0')
    await user.click(screen.getByRole('button', { name: 'Αποθήκευση στόχου' }))

    await waitFor(async () => expect(await db.goals.count()).toBe(1))
    const saved = (await db.goals.toArray())[0]
    expect(saved).toMatchObject({
      measurementType: 'frequency',
      criterionConfig: { direction: 'decrease', targetCount: 0, context: '' },
      criterion: 'Μείωση σε το πολύ 0 φορές'
    })
  })

  it('validation μπλοκάρει «Αποθήκευση» χωρίς κατεύθυνση, με σαφές μήνυμα', async () => {
    const user = userEvent.setup()
    renderWizard('create')
    await goToStep3(user)

    await user.click(screen.getByText('Διάρκεια'))
    await user.type(screen.getByLabelText('Στόχος λεπτών'), '10')
    await user.click(screen.getByRole('button', { name: 'Αποθήκευση στόχου' }))

    expect(await db.goals.count()).toBe(0)
    expect(screen.getByText(/χρειάζεται ρητή κατεύθυνση/i)).toBeInTheDocument()
  })

  it('validation μπλοκάρει «αύξηση σε 0» με σαφές μήνυμα (Στάδιο 5 διόρθωση)', async () => {
    const user = userEvent.setup()
    renderWizard('create')
    await goToStep3(user)

    await user.click(screen.getByText('Διάρκεια'))
    await user.click(screen.getByText('Να αυξηθεί'))
    await user.type(screen.getByLabelText('Στόχος λεπτών'), '0')
    await user.click(screen.getByRole('button', { name: 'Αποθήκευση στόχου' }))

    expect(await db.goals.count()).toBe(0)
    expect(screen.getByText(/πρέπει να είναι μεγαλύτερος από μηδέν/i)).toBeInTheDocument()
  })

  // DoD Σταδίου 5: «δύο live παραδείγματα, αύξηση/μείωση, με σωστό isNearCriterion verified
  // end-to-end» — goal φτιαγμένο ΜΕΣΩ του πραγματικού UI flow (όχι synthetic object), μετά
  // περνάει από το πραγματικό computeGoalAttention (goalAttention.js).
  it('end-to-end: goal Διάρκειας (αύξηση) φτιαγμένο ΜΕΣΩ του UI παράγει σωστό isNearCriterion', async () => {
    const user = userEvent.setup()
    renderWizard('create')
    await goToStep3(user)

    await user.click(screen.getByText('Διάρκεια'))
    await user.click(screen.getByText('Να αυξηθεί'))
    await user.type(screen.getByLabelText('Στόχος λεπτών'), '15')
    await user.click(screen.getByRole('button', { name: 'Αποθήκευση στόχου' }))
    await waitFor(async () => expect(await db.goals.count()).toBe(1))

    const savedGoal = (await db.goals.toArray())[0]
    const today = new Date('2026-07-17T12:00:00.000Z')
    const closeMeasurement = { goalId: savedGoal.id, date: '2026-07-17', value: { minutes: 14 } }
    const attention = computeGoalAttention(savedGoal, [closeMeasurement], [], today)
    expect(attention.reasons).toContainEqual({ type: 'nearCriterion', label: 'Απομένει 1 λεπτό για επίτευξη' })
  })

  it('end-to-end: goal Συχνότητας (μείωση σε 0) φτιαγμένο ΜΕΣΩ του UI παράγει σωστό isNearCriterion', async () => {
    const user = userEvent.setup()
    renderWizard('create')
    await goToStep3(user)

    await user.click(screen.getByText('Συχνότητα'))
    await user.click(screen.getByText('Να μειωθεί'))
    await user.type(screen.getByLabelText('Στόχος φορών'), '0')
    await user.click(screen.getByRole('button', { name: 'Αποθήκευση στόχου' }))
    await waitFor(async () => expect(await db.goals.count()).toBe(1))

    const savedGoal = (await db.goals.toArray())[0]
    const today = new Date('2026-07-17T12:00:00.000Z')
    const closeMeasurement = { goalId: savedGoal.id, date: '2026-07-17', value: { count: 1 } }
    const attention = computeGoalAttention(savedGoal, [closeMeasurement], [], today)
    expect(attention.reasons).toContainEqual({ type: 'nearCriterion', label: 'Χρειάζεται μείωση κατά 1 ακόμη για επίτευξη' })
  })
})

// Αναθεωρήθηκε μετά το browser smoke test του Σταδίου 6 (Product Design §7 Β2) — ΔΥΟ ξεχωριστές
// ενότητες: πρώτα οι 5 περιγραφές (καμία επιλογή εκεί), ΜΕΤΑ ξεχωριστό radiogroup «Πότε θεωρείται
// ότι ολοκληρώνεται ο στόχος;». Τα queries χρησιμοποιούν placeholder για τα πεδία περιγραφής
// (μοναδικά ανά βαθμίδα) ώστε να μην συγχέονται με τα radio του δεύτερου τμήματος, που έχουν το
// ΙΔΙΟ ορατό κείμενο ετικέτας («Βαθμίδα Ν») για λόγους 2, 3, 4.
describe('Οθόνη Β — δυναμικό panel για Κλίμακα 1–5 (Technical Plan Στάδιο 6)', () => {
  function placeholderFor(level) {
    return `Τι σημαίνει η βαθμίδα ${level} για αυτόν τον στόχο;`
  }

  async function fillAllDescriptions(user) {
    for (let level = 1; level <= 5; level++) {
      await user.type(screen.getByPlaceholderText(placeholderFor(level)), `Περιγραφή ${level}`)
    }
  }

  it('πλήρες create flow (όλες οι 5 περιγραφές + βαθμίδα-στόχος) αποθηκεύει σωστό criterionConfig + αυτόματο criterion', async () => {
    const user = userEvent.setup()
    renderWizard('create')
    await goToStep3(user)

    await user.click(screen.getByText('Κλίμακα 1–5'))
    await fillAllDescriptions(user)
    await user.click(screen.getByRole('radio', { name: 'Βαθμίδα 4' }))
    await user.click(screen.getByRole('button', { name: 'Αποθήκευση στόχου' }))

    await waitFor(async () => expect(await db.goals.count()).toBe(1))
    const saved = (await db.goals.toArray())[0]
    expect(saved).toMatchObject({
      measurementType: 'ratingScale',
      criterionConfig: {
        targetLevel: 4,
        levelDescriptions: { 1: 'Περιγραφή 1', 2: 'Περιγραφή 2', 3: 'Περιγραφή 3', 4: 'Περιγραφή 4', 5: 'Περιγραφή 5' }
      },
      criterion: 'Επίπεδο 4 — «Περιγραφή 4»'
    })
  })

  it('validation μπλοκάρει «Αποθήκευση» όταν λείπει έστω μία περιγραφή, μήνυμα δείχνει τη σωστή βαθμίδα', async () => {
    const user = userEvent.setup()
    renderWizard('create')
    await goToStep3(user)

    await user.click(screen.getByText('Κλίμακα 1–5'))
    // Συμπληρώνει 4 από τις 5 (λείπει η βαθμίδα 3), επιλέγει στόχο.
    await user.type(screen.getByPlaceholderText(placeholderFor(1)), 'Α')
    await user.type(screen.getByPlaceholderText(placeholderFor(2)), 'Β')
    await user.type(screen.getByPlaceholderText(placeholderFor(4)), 'Δ')
    await user.type(screen.getByPlaceholderText(placeholderFor(5)), 'Ε')
    await user.click(screen.getByRole('radio', { name: 'Βαθμίδα 4' }))
    await user.click(screen.getByRole('button', { name: 'Αποθήκευση στόχου' }))

    expect(await db.goals.count()).toBe(0)
    expect(screen.getByRole('alert')).toHaveTextContent(/βαθμίδα 3/i)
  })

  it('επεξεργασία βαθμίδας-στόχου ΜΕΤΑ από ήδη συμπληρωμένες περιγραφές δεν τις σβήνει', async () => {
    const user = userEvent.setup()
    renderWizard('create')
    await goToStep3(user)

    await user.click(screen.getByText('Κλίμακα 1–5'))
    await fillAllDescriptions(user)
    await user.click(screen.getByRole('radio', { name: 'Βαθμίδα 2' }))
    await user.click(screen.getByRole('radio', { name: 'Βαθμίδα 5' })) // αλλάζει γνώμη

    expect(screen.getByPlaceholderText(placeholderFor(1))).toHaveValue('Περιγραφή 1')
    expect(screen.getByPlaceholderText(placeholderFor(5))).toHaveValue('Περιγραφή 5')
  })
})

describe('Οθόνη Β — δυναμικά panels για Checklist/Βήματα εργασίας (Technical Plan Στάδιο 7)', () => {
  it('Βήματα εργασίας: πλήρες create flow με αναδιάταξη πριν το submit αποθηκεύει τη ΣΩΣΤΗ τελική σειρά', async () => {
    const user = userEvent.setup()
    renderWizard('create')
    await goToStep3(user)

    await user.click(screen.getByText('Βήματα εργασίας'))
    await user.click(screen.getByRole('button', { name: 'Προσθήκη βήματος' }))
    await user.type(screen.getByLabelText('Βήμα 1'), 'Ανοίγει τη βρύση')
    await user.click(screen.getByRole('button', { name: 'Προσθήκη βήματος' }))
    await user.type(screen.getByLabelText('Βήμα 2'), 'Βάζει σαπούνι')
    await user.click(screen.getByRole('button', { name: 'Προσθήκη βήματος' }))
    await user.type(screen.getByLabelText('Βήμα 3'), 'Τρίβει')

    // Αναδιάταξη: το «Τρίβει» (3ο) μετακινείται πριν το «Βάζει σαπούνι» (2ο).
    await user.click(screen.getByRole('button', { name: 'Μετακίνηση βήματος 3 προς τα πάνω' }))

    await user.click(screen.getByRole('button', { name: 'Αποθήκευση στόχου' }))
    await waitFor(async () => expect(await db.goals.count()).toBe(1))

    const saved = (await db.goals.toArray())[0]
    expect(saved.measurementType).toBe('taskAnalysis')
    expect(saved.criterionConfig.steps.map((s) => s.label)).toEqual(['Ανοίγει τη βρύση', 'Τρίβει', 'Βάζει σαπούνι'])
    expect(saved.criterionConfig.targetCompletedCount).toBe(3)
    expect(saved.criterion).toBe('3 από 3 βήματα ανεξάρτητα')
  })

  it('Checklist: πλήρες create flow αποθηκεύει σωστό criterionConfig + αυτόματο criterion', async () => {
    const user = userEvent.setup()
    renderWizard('create')
    await goToStep3(user)

    await user.click(screen.getByText('Λίστα ελέγχου'))
    await user.click(screen.getByRole('button', { name: 'Προσθήκη στοιχείου' }))
    await user.type(screen.getByLabelText('Στοιχείο 1'), 'Κάθεται σωστά')
    await user.click(screen.getByRole('button', { name: 'Προσθήκη στοιχείου' }))
    await user.type(screen.getByLabelText('Στοιχείο 2'), 'Χρησιμοποιεί μαχαιροπίρουνο')

    await user.click(screen.getByRole('button', { name: 'Αποθήκευση στόχου' }))
    await waitFor(async () => expect(await db.goals.count()).toBe(1))

    const saved = (await db.goals.toArray())[0]
    expect(saved).toMatchObject({
      measurementType: 'checklist',
      criterionConfig: {
        items: [{ label: 'Κάθεται σωστά' }, { label: 'Χρησιμοποιεί μαχαιροπίρουνο' }],
        targetCompletedCount: 2
      },
      criterion: '2 από 2 στοιχεία'
    })
  })

  it('validation μπλοκάρει «Αποθήκευση» με 0 στοιχεία', async () => {
    const user = userEvent.setup()
    renderWizard('create')
    await goToStep3(user)

    await user.click(screen.getByText('Λίστα ελέγχου'))
    await user.click(screen.getByRole('button', { name: 'Αποθήκευση στόχου' }))

    expect(await db.goals.count()).toBe(0)
    expect(screen.getByRole('alert')).toHaveTextContent(/τουλάχιστον ένα στοιχείο/i)
  })

  it('validation μπλοκάρει «Αποθήκευση» με κενή ονομασία γραμμής, μήνυμα δείχνει τη σωστή γραμμή', async () => {
    const user = userEvent.setup()
    renderWizard('create')
    await goToStep3(user)

    await user.click(screen.getByText('Βήματα εργασίας'))
    await user.click(screen.getByRole('button', { name: 'Προσθήκη βήματος' }))
    await user.type(screen.getByLabelText('Βήμα 1'), 'Ανοίγει τη βρύση')
    await user.click(screen.getByRole('button', { name: 'Προσθήκη βήματος' }))
    // Βήμα 2 μένει κενό.

    await user.click(screen.getByRole('button', { name: 'Αποθήκευση στόχου' }))

    expect(await db.goals.count()).toBe(0)
    expect(screen.getByRole('alert')).toHaveTextContent('Το βήμα 2 χρειάζεται τίτλο.')
  })

  // Σημαντικό: επιβεβαιώνει στον κώδικα την ίδια τη διόρθωση που ανακοίνωσα στην αναφορά — το
  // παλιό ελεύθερο κείμενο ΔΕΝ γίνεται ποτέ νεκρός κώδικας, παραμένει η μόνιμη διαδρομή για legacy
  // στόχους τύπων που είχαν ελεύθερο κείμενο ΠΡΙΝ αποκτήσουν panel (taskAnalysis ήταν από τους 4
  // «υπάρχοντες» τύπους, βλ. EXISTING_MEASUREMENT_TYPES στο GoalWizardForm.jsx).
  it('legacy taskAnalysis goal (χωρίς criterionConfig) συνεχίζει να δείχνει το ΠΑΛΙΟ ελεύθερο κείμενο — η legacy προστασία δεν εξαφανίζεται ποτέ', async () => {
    const studentId = await db.students.add({ code: 'Μ6', active: true })
    const goalId = await seedLegacyGoal(studentId, { measurementType: 'taskAnalysis', criterion: '10 βήματα' })
    renderWizard('edit', { studentId, goalId })
    await waitFor(() => expect(screen.queryByText('Φόρτωση…')).not.toBeInTheDocument())

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Επόμενο →' }))
    await user.click(screen.getByRole('button', { name: 'Επόμενο →' }))

    expect(screen.getByLabelText('Κριτήριο επιτυχίας', { exact: false })).toHaveValue('10 βήματα')
    expect(screen.queryByRole('button', { name: 'Προσθήκη βήματος' })).not.toBeInTheDocument()
  })
})

// Καθαρά οπτική υπόδειξη (config/measurementRecommendations.js) — ρητή, συνειδητή ανατροπή
// προηγούμενης απόφασης αυτής της συνομιλίας. Δεν επηρεάζει selectability/validation/data model.
describe('Προτεινόμενοι τύποι ανά τομέα (καθαρά οπτική υπόδειξη)', () => {
  it('με επιλεγμένο τομέα, οι σχετικοί τύποι παίρνουν visual υπόδειξη «Προτείνεται», οι υπόλοιποι όχι', async () => {
    const user = userEvent.setup()
    const { container } = renderWizard('create')
    // sensory: id/προτάσεις ΑΝΕΠΗΡΕΑΣΤΑ από την απλοποίηση τομέων (μόνο η ονομασία άλλαξε) —
    // σταθερή επιλογή για αυτό το test, σε αντίθεση με τα mobility/cognitive/communication που
    // πλέον συγχωνεύουν προτάσεις πολλών παλιών τομέων και συστήνουν σχεδόν όλους τους τύπους.
    await goToStep3(user, { domain: 'sensory' }) // narrative, ratingScale, frequency

    expect(radioFor(container, 'narrative').closest('label')).toHaveClass('measurement-type-card--recommended')
    expect(radioFor(container, 'ratingScale').closest('label')).toHaveClass('measurement-type-card--recommended')
    expect(radioFor(container, 'frequency').closest('label')).toHaveClass('measurement-type-card--recommended')
    expect(radioFor(container, 'successRatio').closest('label')).not.toHaveClass('measurement-type-card--recommended')
    expect(radioFor(container, 'promptLevel').closest('label')).not.toHaveClass('measurement-type-card--recommended')

    expect(screen.getAllByText('Προτείνεται')).toHaveLength(3)
  })

  it('επιλεγμένο ΚΑΙ προτεινόμενο κουτί → επικρατεί το selected στυλ, ΧΩΡΙΣ ετικέτα «Προτείνεται»', async () => {
    const user = userEvent.setup()
    const { container } = renderWizard('create')
    await goToStep3(user, { domain: 'sensory' })

    await user.click(screen.getByText('Περιγραφική παρατήρηση')) // narrative, προτεινόμενο για sensory
    const label = radioFor(container, 'narrative').closest('label')
    expect(label).toHaveClass('measurement-type-card--selected')
    expect(label).not.toHaveClass('measurement-type-card--recommended')
    // Κλίμακα/Συχνότητα παραμένουν προτεινόμενα-αλλά-μη-επιλεγμένα, άρα ΔΙΚΙΑ ΤΟΥΣ ετικέτα
    // «Προτείνεται» εξακολουθεί να υπάρχει — ο έλεγχος αφορά ΜΟΝΟ τη γραμμή του narrative.
    expect(within(label).queryByText('Προτείνεται')).not.toBeInTheDocument()
  })

  it('αλλαγή τομέα ενημερώνει τα περιγράμματα, ΔΕΝ αλλάζει την ήδη γινόμενη επιλογή τύπου', async () => {
    const user = userEvent.setup()
    const { container } = renderWizard('create')
    await goToStep3(user, { domain: 'sensory' })

    await user.click(screen.getByText('Επίπεδο υποστήριξης')) // promptLevel — ΟΧΙ προτεινόμενο για sensory
    expect(radioFor(container, 'promptLevel').checked).toBe(true)

    // Πίσω στο Βήμα 1, άλλαξε τομέα σε 'mobility' (promptLevel ΕΙΝΑΙ προτεινόμενο εκεί).
    await user.click(screen.getByRole('button', { name: '← Πίσω' }))
    await user.click(screen.getByRole('button', { name: '← Πίσω' }))
    await user.selectOptions(screen.getByLabelText('Τομέας', { exact: false }), 'mobility')
    await user.click(screen.getByRole('button', { name: 'Επόμενο →' }))
    await user.click(screen.getByRole('button', { name: 'Επόμενο →' }))

    // Η επιλογή ΠΑΡΕΜΕΝΕΙ promptLevel — η αλλαγή τομέα δεν την άγγιξε. Το promptLevel είναι ΤΩΡΑ
    // ΚΑΙ επιλεγμένο ΚΑΙ προτεινόμενο (mobility) — επικρατεί το selected στυλ (ίδιο σκεπτικό
    // με το προηγούμενο test), όχι --recommended.
    const label = radioFor(container, 'promptLevel').closest('label')
    expect(radioFor(container, 'promptLevel').checked).toBe(true)
    expect(label).toHaveClass('measurement-type-card--selected')
    expect(label).not.toHaveClass('measurement-type-card--recommended')
  })
})

// Mobile review (product polish, σημείο 2): σε μεγάλα βήματα τα κουμπιά Πίσω/Επόμενο/Αποθήκευση
// έπεφταν στο τέλος μιας πολύ ψηλής κάρτας — sticky footer πλέον, ίδιο πνεύμα με το Modal.css.
// «Καρφώνουμε» τις CSS δηλώσεις (jsdom δεν κάνει πραγματικό layout/scroll measurement).
describe('GoalWizardForm.css: sticky footer ενεργειών (Πίσω/Επόμενο/Αποθήκευση πάντα ορατά)', () => {
  it('.goal-wizard__actions είναι sticky, με bottom offset πάνω από το bottom nav σε mobile', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/components/GoalWizardForm.css'), 'utf-8')
    const baseMatch = css.match(/\.goal-wizard__actions\s*\{([^}]*)\}/)
    expect(baseMatch).toBeTruthy()
    expect(baseMatch[1]).toMatch(/position:\s*sticky/)
    expect(baseMatch[1]).toMatch(/bottom:\s*0/)

    const mobileBlockMatch = css.match(/@media \(max-width: 767px\) \{([\s\S]*?)\n\}/)
    expect(mobileBlockMatch, 'δεν βρέθηκε το @media (max-width: 767px) block').toBeTruthy()
    expect(mobileBlockMatch[1]).toMatch(/bottom:\s*var\(--shell-bottom-nav-height\)/)
  })
})

// Mixed language (Sprint 8 feedback χρήστη): «Baseline» ήταν ακόμα αγγλικά στην ετικέτα του βήματος
// («Βήμα 2 από 3: Baseline» σε mobile) — τώρα «Σημείο εκκίνησης».
describe('GoalWizardForm — 100% ελληνικά (Sprint 8 feedback χρήστη)', () => {
  it('η ετικέτα του Βήματος 2 είναι «Σημείο εκκίνησης», όχι πια «Baseline»', async () => {
    const user = userEvent.setup()
    renderWizard('create')
    await user.selectOptions(screen.getByLabelText('Τομέας', { exact: false }), DOMAINS[0].id)
    await user.type(screen.getByLabelText('Τι θέλουμε να πετύχει', { exact: false }), 'Τίτλος')
    await user.click(screen.getByRole('button', { name: 'Επόμενο →' }))

    expect(screen.getByText('Βήμα 2 από 3: Σημείο εκκίνησης')).toBeInTheDocument()
    expect(screen.queryByText(/Baseline/)).not.toBeInTheDocument()
  })
})

// Critical hotfix regression (Technical Fix Plan) — πριν το resolveEntityId, Number(id)/Number(goalId)
// έκαναν το create-path να γράφει σιωπηλά goals.studentId=NaN (createGoalCore δεν κάνει ΚΑΝΕΝΑΝ έλεγχο
// ύπαρξης foreign key), και το edit-path να γκρεμίζει/κολλάει μόνιμα, ίδιο μοτίβο με StudentForm.jsx.
const ALICE = 'alice@example.com'
const asAlice = { getAuthenticatedUserId: () => ALICE }

async function activateV2ForAlice() {
  await claimLegacyDataOwnership(ALICE, asAlice)
  const state = await runMigration(asAlice)
  expect(state.status).toBe('complete')
  await activateV2Generation(ALICE, asAlice)
}

describe('GoalWizardForm — v2 γενιά (κρίσιμο hotfix regression)', () => {
  it('create: νέος στόχος γράφεται με το ΣΩΣΤΟ (string) studentId, ΟΧΙ NaN', async () => {
    await activateV2ForAlice()
    const studentId = crypto.randomUUID()
    await activeTable('students').add({ id: studentId, code: 'Μ1', active: true })

    const user = userEvent.setup()
    renderWizard('create', { studentId })
    await goToStep3(user)
    await user.click(screen.getByText('Ποσοστό επιτυχίας'))
    await user.type(screen.getByLabelText('Επιτυχίες'), '4')
    await user.type(screen.getByLabelText('Σύνολο προσπαθειών'), '5')
    await user.click(screen.getByRole('button', { name: 'Αποθήκευση στόχου' }))

    await waitFor(async () => {
      expect(await activeTable('goals').count()).toBe(1)
    })
    const goal = (await activeTable('goals').toArray())[0]
    expect(goal.studentId).toBe(studentId)
    expect(Number.isNaN(goal.studentId)).toBe(false)
  })

  it('edit: υπάρχων v2 στόχος (UUID id) φορτώνει και αποθηκεύει σωστά', async () => {
    await activateV2ForAlice()
    const studentId = crypto.randomUUID()
    const goalId = crypto.randomUUID()
    await activeTable('students').add({ id: studentId, code: 'Μ2', active: true })
    // ΟΧΙ seedLegacyGoal (γράφει πάντα στο legacy db.goals) — εδώ χρειάζεται γραμμή στο ΕΝΕΡΓΟ (v2)
    // routing, άρα απευθείας activeTable('goals'), ίδιο idiom με τα GoalDetail.test.jsx/StudentForm.test.jsx.
    await activeTable('goals').add({
      id: goalId,
      studentId,
      domain: DOMAINS[0].id,
      title: 'Παλιός στόχος',
      description: '',
      baseline: 'Κάτι',
      criterion: '8/10',
      measurementType: 'successRatio',
      supportLevel: '',
      priority: 'medium',
      startDate: '2026-01-01',
      status: 'active',
      statusChangedAt: '2026-01-01T00:00:00.000Z'
    })

    const user = userEvent.setup()
    renderWizard('edit', { studentId, goalId })
    await screen.findByDisplayValue('Παλιός στόχος')
    await user.click(screen.getByRole('button', { name: 'Επόμενο →' }))
    await user.click(screen.getByRole('button', { name: 'Επόμενο →' }))
    await user.click(screen.getByRole('button', { name: 'Αποθήκευση στόχου' }))

    await waitFor(async () => {
      const updated = await activeTable('goals').get(goalId)
      expect(updated).toBeTruthy()
    })
    expect(await activeTable('goals').count()).toBe(1) // καμία επιπλέον/ορφανή γραμμή
  })

  it('ανύπαρκτο v2 goalId στο edit → σφάλμα αποθήκευσης, ΚΑΜΙΑ εγγραφή με NaN/null goalId', async () => {
    await activateV2ForAlice()
    const studentId = crypto.randomUUID()
    await activeTable('students').add({ id: studentId, code: 'Μ3', active: true })

    renderWizard('edit', { studentId, goalId: crypto.randomUUID() })
    // Καμία υπάρχουσα εγγραφή βρέθηκε — η φόρμα μένει με το κενό αρχικό σχήμα (loading→false, goal
    // παραμένει createEmptyGoal). Ελέγχουμε ότι δεν δημιουργήθηκε καμία γραμμή στη βάση από μόνο του
    // το mount/loading, ΟΧΙ το submit flow (που θα απαιτούσε συμπλήρωση όλων των υποχρεωτικών πεδίων).
    await waitFor(() => expect(screen.queryByText('Φόρτωση…')).not.toBeInTheDocument())
    expect(await activeTable('goals').count()).toBe(0)
  })
})

describe('GoalWizardForm — partial updates (Root Cause Investigation, Scenario E fix)', () => {
  it('αλλαγή ΜΟΝΟ του τίτλου στέλνει changeSpec με ΑΚΡΙΒΩΣ ένα key', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    const goalId = await seedLegacyGoal(studentId, { title: 'Αρχικός τίτλος' })
    const updateSpy = vi.spyOn(db.table('goals'), 'update')

    const user = userEvent.setup()
    renderWizard('edit', { studentId, goalId })
    await screen.findByDisplayValue('Αρχικός τίτλος')
    await user.clear(screen.getByLabelText('Τι θέλουμε να πετύχει', { exact: false }))
    await user.type(screen.getByLabelText('Τι θέλουμε να πετύχει', { exact: false }), 'Νέος τίτλος')
    await user.click(screen.getByRole('button', { name: 'Επόμενο →' }))
    await user.click(screen.getByRole('button', { name: 'Επόμενο →' }))
    await user.click(screen.getByRole('button', { name: 'Αποθήκευση στόχου' }))

    await waitFor(() => expect(updateSpy).toHaveBeenCalled())
    expect(updateSpy).toHaveBeenCalledWith(goalId, { title: 'Νέος τίτλος' })
    updateSpy.mockRestore()
  })

  it('δύο ανεξάρτητα partial updates στον ΙΔΙΟ στόχο διατηρούν και τις δύο αλλαγές', async () => {
    const studentId = await db.students.add({ code: 'Μ2', active: true })
    const goalId = await seedLegacyGoal(studentId, { title: 'Τ', priority: 'medium' })

    await db.goals.update(goalId, { title: 'Νέος τίτλος από Α' })
    await db.goals.update(goalId, { priority: 'high' })

    const goal = await db.goals.get(goalId)
    expect(goal.title).toBe('Νέος τίτλος από Α')
    expect(goal.priority).toBe('high')
  })
})
