import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import db from '../db.js'
import SessionModal from './SessionModal.jsx'

function seedSuccessRatioGoal(studentId, overrides = {}) {
  return db.goals.add({
    studentId, domain: 'communication', title: 'Πρώτο φώνημα', description: '', baseline: '',
    measurementType: 'successRatio', criterionConfig: { targetSuccesses: 4, targetAttempts: 5 },
    criterion: '4 από 5', supportLevel: '', priority: 'medium',
    startDate: '2026-01-01', status: 'active', statusChangedAt: '2026-01-01',
    ...overrides
  })
}

// Bug found during Goal History review: το SessionModal μορφοποιούσε τις μετρήσεις μέσω του
// παλιού formatMeasurementValue (utils/measurementValue.js), που καλύπτει μόνο 4 από τους 8 τύπους
// μέτρησης — narrative/checklist/ratingScale/frequency έδειχναν «—» αντί για την πραγματική τιμή.
// Εδώ επαληθεύεται η διόρθωση (formatRecordedValue, registry) ΚΑΙ η νέα προβολή sessionGoalAssessments
// (μέχρι πρότινος εντελώς αόρατα μετά την αποθήκευση).

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  cleanup()
  await Promise.all(db.tables.map((t) => t.clear()))
  db.close()
})

describe('SessionModal — view mode', () => {
  it('narrative measurement: δείχνει την ΠΡΑΓΜΑΤΙΚΗ σημείωση, ΟΧΙ «—» (bug fix)', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    const goalId = await db.goals.add({
      studentId, domain: 'reading', title: 'Στόχος Αφήγησης', description: '', baseline: '',
      measurementType: 'narrative', criterion: '', supportLevel: '', priority: 'medium',
      startDate: '2026-01-01', status: 'active', statusChangedAt: '2026-01-01'
    })
    const sessionId = await db.sessions.add({
      date: '2026-02-01', studentIds: [studentId], status: 'completed', absentStudentIds: [],
      durationMinutes: 30, activity: '', note: '', moods: {}
    })
    await db.measurements.add({
      studentId, goalId, sessionId, value: { note: 'Πολύ καλή συνεδρία, μεγάλη πρόοδος' }, context: 'individual', note: ''
    })

    render(<SessionModal sessionId={sessionId} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(/Πολύ καλή συνεδρία, μεγάλη πρόοδος/)).toBeInTheDocument())

    expect(screen.queryByText('—')).not.toBeInTheDocument()
  })

  it('κλινική εκτίμηση: εμφανίζεται η βαθμίδα + το note (μέχρι πρότινος εντελώς αόρατη)', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    const goalId = await db.goals.add({
      studentId, domain: 'reading', title: 'Στόχος Α', description: '', baseline: '',
      measurementType: 'successRatio', criterionConfig: { targetSuccesses: 4, targetAttempts: 5 },
      criterion: '4 από 5', supportLevel: '', priority: 'medium',
      startDate: '2026-01-01', status: 'active', statusChangedAt: '2026-01-01'
    })
    const sessionId = await db.sessions.add({
      date: '2026-02-01', studentIds: [studentId], status: 'completed', absentStudentIds: [],
      durationMinutes: 30, activity: '', note: '', moods: {}
    })
    await db.sessionGoalAssessments.add({
      sessionId, studentId, goalId, rating: 'improved', note: 'Καλύτερη συγκέντρωση σήμερα'
    })

    render(<SessionModal sessionId={sessionId} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(/Βελτιώθηκε/)).toBeInTheDocument())

    expect(screen.getByText(/Καλύτερη συγκέντρωση σήμερα/)).toBeInTheDocument()
  })

  it('narrative measurement με πολύ μεγάλο συνεχόμενο κείμενο δεν ξεφεύγει από το modal (bug fix)', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    const goalId = await db.goals.add({
      studentId, domain: 'oral-language', title: 'Στόχος Αφήγησης', description: '', baseline: '',
      measurementType: 'narrative', criterion: '', supportLevel: '', priority: 'medium',
      startDate: '2026-01-01', status: 'active', statusChangedAt: '2026-01-01'
    })
    const sessionId = await db.sessions.add({
      date: '2026-02-01', studentIds: [studentId], status: 'completed', absentStudentIds: [],
      durationMinutes: 30, activity: '', note: '', moods: {}
    })
    const hugeUnbrokenNote = 'κ'.repeat(400)
    await db.measurements.add({
      studentId, goalId, sessionId, value: { note: hugeUnbrokenNote }, context: 'individual', note: ''
    })

    render(<SessionModal sessionId={sessionId} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(new RegExp(hugeUnbrokenNote))).toBeInTheDocument())

    // Το πλήρες κείμενο παραμένει άθικτο στο DOM — το ίδιο το wrap (οπτικό, CSS) επαληθεύεται
    // ξεχωριστά στο Modal.test.jsx (κοινό .modal__body, όπου ζει πλέον η διόρθωση).
    expect(screen.getByText(new RegExp(hugeUnbrokenNote)).textContent).toContain(hugeUnbrokenNote)
  })

  // Bug report (screenshot): με πολύ μεγάλη/συνεχόμενη τιμή, η ΓΡΑΜΜΗ .session-detail__measurement/
  // __assessment (icon + ετικέτα «Μέτρηση:»/«Κλινική εκτίμηση:» + τιμή, όλα σε flex row) ζόριζε ΟΛΑ
  // τα παιδιά να σμικρύνουν μαζί για να χωρέσουν σε ΜΙΑ γραμμή — χωρίς flex-wrap, ακόμα και η ίδια η
  // λέξη «Μέτρηση:» έσπαγε γράμμα-γράμμα (το DOM δεν αλλάζει σε αυτό το bug, μόνο η CSS rendering —
  // jsdom δεν κάνει πραγματικό layout, οπότε «καρφώνουμε» εδώ τις ίδιες τις CSS δηλώσεις της διόρθωσης).
  it('SessionModal.css: .session-detail__measurement/__assessment έχουν flex-wrap ΚΑΙ flex-shrink:0 στην ετικέτα (bug fix)', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/components/SessionModal.css'), 'utf-8')

    const rowMatch = css.match(/\.session-detail__measurement,\s*\n\.session-detail__assessment\s*\{([^}]*)\}/)
    expect(rowMatch).toBeTruthy()
    expect(rowMatch[1]).toMatch(/flex-wrap:\s*wrap/)

    const labelMatch = css.match(/\.session-detail__row-label\s*\{([^}]*)\}/)
    expect(labelMatch).toBeTruthy()
    expect(labelMatch[1]).toMatch(/flex-shrink:\s*0/)

    const iconMatch = css.match(/\.session-detail__row-icon\s*\{([^}]*)\}/)
    expect(iconMatch).toBeTruthy()
    expect(iconMatch[1]).toMatch(/flex-shrink:\s*0/)
  })

  it('Minor UX Polish: μέτρηση + κλινική εκτίμηση του ΙΔΙΟΥ στόχου ομαδοποιούνται μαζί, οπτικά διαφοροποιημένες', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    const goalId = await db.goals.add({
      studentId, domain: 'communication', title: 'Πρώτο φώνημα', description: '', baseline: '',
      measurementType: 'successRatio', criterionConfig: { targetSuccesses: 4, targetAttempts: 5 },
      criterion: '4 από 5', supportLevel: '', priority: 'medium',
      startDate: '2026-01-01', status: 'active', statusChangedAt: '2026-01-01'
    })
    const sessionId = await db.sessions.add({
      date: '2026-02-01', studentIds: [studentId], status: 'completed', absentStudentIds: [],
      durationMinutes: 30, activity: '', note: '', moods: {}
    })
    await db.measurements.add({ studentId, goalId, sessionId, value: { successes: 1, attempts: 1 }, context: 'individual', note: '' })
    await db.sessionGoalAssessments.add({ sessionId, studentId, goalId, rating: 'improved', note: '' })

    render(<SessionModal sessionId={sessionId} onClose={vi.fn()} />)
    // Exact match (function matcher — το κείμενο σπάει σε span domain + απλό text node για τον
    // τίτλο, βλ. session-detail__goal-entry-title) ώστε να μην ταιριάξει σκέτο ούτε ο τομέας ούτε ο τίτλος ξεχωριστά.
    const fullTitleMatch = (content, el) => el?.className === 'session-detail__goal-entry-title' && el.textContent === 'Επικοινωνία — Πρώτο φώνημα'
    await waitFor(() => expect(screen.getByText(fullTitleMatch)).toBeInTheDocument())

    // Ο τίτλος στόχου εμφανίζεται ΜΙΑ φορά (ομαδοποίηση), όχι δύο (μία ανά measurement/assessment).
    expect(screen.getAllByText(fullTitleMatch)).toHaveLength(1)

    const measurementRow = document.querySelector('.session-detail__measurement')
    const assessmentRow = document.querySelector('.session-detail__assessment')
    expect(measurementRow).toBeInTheDocument()
    expect(assessmentRow).toBeInTheDocument()
    expect(measurementRow.textContent).toContain('Μέτρηση:')
    expect(assessmentRow.textContent).toContain('Κλινική εκτίμηση:')
    // Οπτικά διαφοροποιημένες κλάσεις — ΔΕΝ μοιάζουν με την ίδια κατηγορία πληροφορίας.
    expect(measurementRow.className).not.toBe(assessmentRow.className)
  })

  it('μαθητής χωρίς καμία καταχώρηση (ούτε measurement, ούτε assessment, ούτε observation) → μήνυμα κενού', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    const sessionId = await db.sessions.add({
      date: '2026-02-01', studentIds: [studentId], status: 'completed', absentStudentIds: [],
      durationMinutes: 30, activity: '', note: '', moods: {}
    })

    render(<SessionModal sessionId={sessionId} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Καμία καταχώρηση για αυτόν τον μαθητή σε αυτή τη συνεδρία.')).toBeInTheDocument())
  })
})

// Λειτουργικό κενό: το Edit Session επέτρεπε ΜΟΝΟ αλλαγή metadata — καμία διόρθωση measurement/
// Clinical Assessment χωρίς διαγραφή ΟΛΗΣ της συνεδρίας. Εδώ επαληθεύεται η επαναχρησιμοποίηση του
// GoalRecorderCard/GoalRecorder/GoalClinicalAssessment με update/insert/delete reconciliation, η
// ατομικότητα (καμία nested transaction — η transitionGoalStatus συμμετέχει στην ΙΔΙΑ transaction,
// ίδιο precedent με το TeachingMode.jsx) και το ρητό μπλοκάρισμα νέου «Κατακτήθηκε» σε στόχο που
// δεν επιτρέπει πλέον τη μετάβαση (π.χ. archived).
describe('SessionModal — Edit Session: επεξεργασία measurements/κλινικών εκτιμήσεων', () => {
  async function openEdit(user, sessionId) {
    render(<SessionModal sessionId={sessionId} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Επεξεργασία' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Επεξεργασία' }))
  }

  it('UPDATE: αλλαγή τιμής υπάρχουσας μέτρησης ενημερώνει την ΙΔΙΑ εγγραφή, όχι νέα', async () => {
    const user = userEvent.setup()
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    const goalId = await seedSuccessRatioGoal(studentId)
    const sessionId = await db.sessions.add({
      date: '2026-02-01', studentIds: [studentId], status: 'completed', absentStudentIds: [],
      durationMinutes: 30, activity: '', note: '', moods: {}
    })
    const measurementId = await db.measurements.add({
      studentId, goalId, sessionId, value: { successes: 1, attempts: 1 }, context: 'individual', note: ''
    })

    await openEdit(user, sessionId)
    await user.click(screen.getByRole('button', { name: /Πρώτο φώνημα/ }))
    await user.click(screen.getByRole('button', { name: 'Επιτυχία' }))
    await user.click(screen.getByRole('button', { name: 'Αποθήκευση' }))

    await waitFor(async () => {
      expect(await db.measurements.count()).toBe(1)
    })
    const updated = await db.measurements.get(measurementId)
    expect(updated.value).toEqual({ successes: 2, attempts: 2 })
  })

  it('INSERT: καταγραφή σε στόχο ΧΩΡΙΣ προηγούμενη μέτρηση σε αυτή τη συνεδρία δημιουργεί νέα εγγραφή', async () => {
    const user = userEvent.setup()
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    await seedSuccessRatioGoal(studentId)
    const sessionId = await db.sessions.add({
      date: '2026-02-01', studentIds: [studentId], status: 'completed', absentStudentIds: [],
      durationMinutes: 30, activity: '', note: '', moods: {}
    })

    await openEdit(user, sessionId)
    await user.click(screen.getByRole('button', { name: /Πρώτο φώνημα/ }))
    await user.click(screen.getByRole('button', { name: 'Επιτυχία' }))
    await user.click(screen.getByRole('button', { name: 'Αποθήκευση' }))

    await waitFor(async () => expect(await db.measurements.count()).toBe(1))
    const measurement = (await db.measurements.toArray())[0]
    expect(measurement.sessionId).toBe(sessionId)
    expect(measurement.studentId).toBe(studentId)
    expect(measurement.value).toEqual({ successes: 1, attempts: 1 })
  })

  it('DELETE: «Αφαίρεση μέτρησης από τη συνεδρία» διαγράφει την υπάρχουσα εγγραφή', async () => {
    const user = userEvent.setup()
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    const goalId = await seedSuccessRatioGoal(studentId)
    const sessionId = await db.sessions.add({
      date: '2026-02-01', studentIds: [studentId], status: 'completed', absentStudentIds: [],
      durationMinutes: 30, activity: '', note: '', moods: {}
    })
    await db.measurements.add({ studentId, goalId, sessionId, value: { successes: 1, attempts: 1 }, context: 'individual', note: '' })

    await openEdit(user, sessionId)
    await user.click(screen.getByRole('button', { name: /Πρώτο φώνημα/ }))
    await user.click(screen.getByRole('button', { name: 'Αφαίρεση μέτρησης από τη συνεδρία' }))
    await user.click(screen.getByRole('button', { name: 'Αποθήκευση' }))

    await waitFor(async () => expect(await db.measurements.count()).toBe(0))
  })

  // UX bug (browser smoke test): μετά το «Αφαίρεση μέτρησης», το SessionModal πηδούσε στην αρχή της
  // φόρμας (χαμένη θέση κύλισης) — root cause: η MutationObserver του Modal.jsx (βλ. Modal.test.jsx)
  // εξέλαβε λάθος την αφαίρεση του (τότε-focused) κουμπιού ως «κανένα focus μέσα στο panel». Η
  // πραγματική θέση κύλισης δεν είναι αξιόπιστα ελέγξιμη σε jsdom — εδώ επαληθεύεται το testable
  // proxy: η ΙΔΙΑ GoalRecorderCard παραμένει expanded (aria-expanded) μετά την αφαίρεση, δεν κλείνει
  // ούτε ανοίγει άλλη.
  it('«Αφαίρεση μέτρησης»: η κάρτα του στόχου παραμένει expanded μετά την ενέργεια (καμία collapse/άλλαγή θέσης)', async () => {
    const user = userEvent.setup()
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    const goalId = await seedSuccessRatioGoal(studentId)
    const sessionId = await db.sessions.add({
      date: '2026-02-01', studentIds: [studentId], status: 'completed', absentStudentIds: [],
      durationMinutes: 30, activity: '', note: '', moods: {}
    })
    await db.measurements.add({ studentId, goalId, sessionId, value: { successes: 1, attempts: 1 }, context: 'individual', note: '' })

    await openEdit(user, sessionId)
    const cardHeader = screen.getByRole('button', { name: /Πρώτο φώνημα/ })
    await user.click(cardHeader)
    expect(cardHeader).toHaveAttribute('aria-expanded', 'true')

    await user.click(screen.getByRole('button', { name: 'Αφαίρεση μέτρησης από τη συνεδρία' }))

    expect(cardHeader).toHaveAttribute('aria-expanded', 'true')
    // Το GoalRecorder (μετρητές Επιτυχία/Δυσκολία) παραμένει ορατό — η κάρτα δεν έκλεισε.
    expect(screen.getByRole('button', { name: 'Επιτυχία' })).toBeInTheDocument()
  })

  it('Clinical Assessment: update/insert/delete ανά στόχο ακολουθεί την ίδια reconciliation λογική', async () => {
    const user = userEvent.setup()
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    const goalWithAssessment = await seedSuccessRatioGoal(studentId, { title: 'Στόχος Α' })
    const goalWithoutAssessment = await seedSuccessRatioGoal(studentId, { title: 'Στόχος Β' })
    const sessionId = await db.sessions.add({
      date: '2026-02-01', studentIds: [studentId], status: 'completed', absentStudentIds: [],
      durationMinutes: 30, activity: '', note: '', moods: {}
    })
    const assessmentId = await db.sessionGoalAssessments.add({ sessionId, studentId, goalId: goalWithAssessment, rating: 'improved', note: '' })

    await openEdit(user, sessionId)

    // UPDATE: Στόχος Α, 'improved' -> 'stable'.
    await user.click(screen.getByRole('button', { name: /Στόχος Α/ }))
    await user.click(screen.getByRole('button', { name: 'Σταθερός' }))

    // INSERT: Στόχος Β, καμία -> 'improved'.
    await user.click(screen.getByRole('button', { name: /Στόχος Β/ }))
    await user.click(screen.getByRole('button', { name: 'Βελτιώθηκε' }))

    await user.click(screen.getByRole('button', { name: 'Αποθήκευση' }))

    await waitFor(async () => expect(await db.sessionGoalAssessments.count()).toBe(2))
    expect((await db.sessionGoalAssessments.get(assessmentId)).rating).toBe('stable')
    const inserted = await db.sessionGoalAssessments.where({ sessionId, goalId: goalWithoutAssessment }).first()
    expect(inserted.rating).toBe('improved')
  })

  it('«Κατακτήθηκε» ΝΕΟ σε ενεργό στόχο → transitionGoalStatus σε achieved, trigger «sessionEdit», μέσα στην ΙΔΙΑ transaction', async () => {
    const user = userEvent.setup()
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    const goalId = await seedSuccessRatioGoal(studentId)
    const sessionId = await db.sessions.add({
      date: '2026-02-01', studentIds: [studentId], status: 'completed', absentStudentIds: [],
      durationMinutes: 30, activity: '', note: '', moods: {}
    })
    await db.measurements.add({ studentId, goalId, sessionId, value: { successes: 1, attempts: 1 }, context: 'individual', note: '' })

    await openEdit(user, sessionId)
    await user.click(screen.getByRole('button', { name: /Πρώτο φώνημα/ }))
    await user.click(screen.getByRole('button', { name: 'Κατακτήθηκε' }))
    await user.click(screen.getByRole('button', { name: 'Επιβεβαίωση' }))
    await user.click(screen.getByRole('button', { name: 'Αποθήκευση' }))

    await waitFor(async () => expect((await db.goals.get(goalId)).status).toBe('achieved'))

    const assessment = await db.sessionGoalAssessments.where({ sessionId, goalId }).first()
    expect(assessment.rating).toBe('mastered')

    const events = await db.goalEvents.where('goalId').equals(goalId).toArray()
    const editEvent = events.find((e) => e.trigger === 'sessionEdit')
    expect(editEvent).toBeTruthy()
    expect(editEvent.toStatus).toBe('achieved')
    expect(editEvent.sessionId).toBe(sessionId)
  })

  it('Επιλογή Α: αφαίρεση ΗΔΗ αποθηκευμένου «Κατακτήθηκε» ΔΕΝ αλλάζει την κατάσταση του στόχου (goal lifecycle ≠ session data)', async () => {
    const user = userEvent.setup()
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    const goalId = await seedSuccessRatioGoal(studentId, { status: 'achieved', statusChangedAt: '2026-02-01' })
    const sessionId = await db.sessions.add({
      date: '2026-02-01', studentIds: [studentId], status: 'completed', absentStudentIds: [],
      durationMinutes: 30, activity: '', note: '', moods: {}
    })
    await db.sessionGoalAssessments.add({ sessionId, studentId, goalId, rating: 'mastered', note: '' })

    await openEdit(user, sessionId)
    await user.click(screen.getByRole('button', { name: /Πρώτο φώνημα/ }))
    // Ξανακλικ στο ΗΔΗ επιλεγμένο «Κατακτήθηκε» -> αποεπιλογή (καμία μετάβαση, ίδιο idiom με το
    // GoalClinicalAssessment.jsx).
    await user.click(screen.getByRole('button', { name: 'Κατακτήθηκε' }))
    await user.click(screen.getByRole('button', { name: 'Αποθήκευση' }))

    await waitFor(async () => expect(await db.sessionGoalAssessments.where({ sessionId, goalId }).count()).toBe(0))
    // ΑΜΕΤΑΒΛΗΤΟ — καμία αυτόματη αντιστροφή κατάστασης.
    expect((await db.goals.get(goalId)).status).toBe('achieved')
  })

  it('Νέο «Κατακτήθηκε» σε ιστορικό ΑΛΛΑ πλέον archived στόχο: μπλοκάρεται ΚΑΘΑΡΑ στο UI, καμία σιωπηλή αποθήκευση mismatched assessment', async () => {
    const user = userEvent.setup()
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    const goalId = await seedSuccessRatioGoal(studentId, { status: 'archived', statusChangedAt: '2026-02-01' })
    const sessionId = await db.sessions.add({
      date: '2026-02-01', studentIds: [studentId], status: 'completed', absentStudentIds: [],
      durationMinutes: 30, activity: '', note: '', moods: {}
    })
    // Ο στόχος εμφανίζεται στο Edit Session επειδή είχε ΗΔΗ μέτρηση σε αυτή τη συνεδρία, παρότι
    // έκτοτε έγινε archived (ίδιο σενάριο με αυτό που περιέγραψε ο χρήστης).
    await db.measurements.add({ studentId, goalId, sessionId, value: { successes: 1, attempts: 1 }, context: 'individual', note: '' })

    await openEdit(user, sessionId)
    await user.click(screen.getByRole('button', { name: /Πρώτο φώνημα/ }))

    const masteredChip = screen.getByRole('button', { name: 'Κατακτήθηκε' })
    expect(masteredChip).toBeDisabled()
    expect(screen.getByText(/δεν μπορεί να ολοκληρωθεί απευθείας από εδώ/)).toBeInTheDocument()

    await user.click(masteredChip)
    // Disabled button -> κανένα confirmation modal, καμία επιλογή.
    expect(screen.queryByRole('button', { name: 'Επιβεβαίωση' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Αποθήκευση' }))

    await waitFor(async () => expect(await db.sessionGoalAssessments.count()).toBe(0))
    expect((await db.goals.get(goalId)).status).toBe('archived')
  })

  it('Ατομικότητα: αν η transitionGoalStatus αποτύχει, ΤΙΠΟΤΑ δεν αποθηκεύεται — ούτε metadata, ούτε measurements/assessments (καμία nested/ανεξάρτητη transaction)', async () => {
    const user = userEvent.setup()
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    const goalId = await seedSuccessRatioGoal(studentId)
    const sessionId = await db.sessions.add({
      date: '2026-02-01', studentIds: [studentId], status: 'completed', absentStudentIds: [],
      durationMinutes: 30, activity: 'Αρχική δραστηριότητα', note: '', moods: {}
    })

    const spy = vi.spyOn(db.goalEvents, 'add').mockImplementationOnce(() => {
      throw new Error('Εσκεμμένο σφάλμα δοκιμής — προσομοιώνει διακοπή στη μέση')
    })

    try {
      await openEdit(user, sessionId)
      await user.clear(screen.getByLabelText('Δραστηριότητα'))
      await user.type(screen.getByLabelText('Δραστηριότητα'), 'Νέα δραστηριότητα')
      await user.click(screen.getByRole('button', { name: /Πρώτο φώνημα/ }))
      await user.click(screen.getByRole('button', { name: 'Επιτυχία' }))
      await user.click(screen.getByRole('button', { name: 'Κατακτήθηκε' }))
      await user.click(screen.getByRole('button', { name: 'Επιβεβαίωση' }))
      await user.click(screen.getByRole('button', { name: 'Αποθήκευση' }))

      await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    } finally {
      spy.mockRestore()
    }

    const session = await db.sessions.get(sessionId)
    expect(session.activity).toBe('Αρχική δραστηριότητα') // ΟΧΙ 'Νέα δραστηριότητα'
    expect(await db.measurements.count()).toBe(0)
    expect(await db.sessionGoalAssessments.count()).toBe(0)
    expect((await db.goals.get(goalId)).status).toBe('active')
    expect(await db.goalEvents.count()).toBe(0)
  })

  it('Ακύρωση: απορρίπτει ΟΛΕΣ τις αλλαγές (measurements/assessments) που δεν αποθηκεύτηκαν', async () => {
    const user = userEvent.setup()
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    const goalId = await seedSuccessRatioGoal(studentId)
    const sessionId = await db.sessions.add({
      date: '2026-02-01', studentIds: [studentId], status: 'completed', absentStudentIds: [],
      durationMinutes: 30, activity: '', note: '', moods: {}
    })
    await db.measurements.add({ studentId, goalId, sessionId, value: { successes: 1, attempts: 1 }, context: 'individual', note: '' })

    await openEdit(user, sessionId)
    await user.click(screen.getByRole('button', { name: /Πρώτο φώνημα/ }))
    await user.click(screen.getByRole('button', { name: 'Αφαίρεση μέτρησης από τη συνεδρία' }))
    await user.click(screen.getByRole('button', { name: 'Ακύρωση' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Επεξεργασία' })).toBeInTheDocument())
    expect(await db.measurements.count()).toBe(1)
  })
})
