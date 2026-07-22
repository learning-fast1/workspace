import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import GoalCard from './GoalCard.jsx'

afterEach(() => cleanup())

function baseProps(overrides = {}) {
  return {
    id: 1,
    studentId: 10,
    title: 'Στόχος',
    domainLabel: 'Ανάγνωση',
    description: '',
    priority: 'medium',
    priorityLabel: 'Μέτρια',
    status: 'active',
    statusLabel: 'Ενεργός',
    progressPercent: null,
    progressLabel: null,
    lastMeasuredLabel: null,
    isStale: false,
    onEdit: vi.fn(),
    onOpenStatusModal: vi.fn(),
    onSaveAsTemplate: vi.fn(),
    onCopyToStudent: vi.fn(),
    ...overrides
  }
}

function renderCard(props) {
  return render(
    <MemoryRouter>
      <GoalCard {...props} />
    </MemoryRouter>
  )
}

// Technical Plan Στάδιο 9α — τα τρία states της κάρτας: computable → progress bar, non-computable
// με μέτρηση → μορφοποιημένη «Τελευταία καταγραφή» (ΧΩΡΙΣ bar, ΧΩΡΙΣ οτιδήποτε υπονοεί ποσοστό
// ολοκλήρωσης), καμία μέτρηση → «Καμία μέτρηση ακόμα». Η ίδια η κάρτα δεν αποφασίζει τίποτα από
// αυτά — απλά αποδίδει ό,τι της δώσει το GoalsList.jsx (βλ. GoalsList.test.jsx για το wiring).
describe('GoalCard — τα τρία progress states (Technical Plan Στάδιο 9α)', () => {
  it('computable measurement → progress bar + ποσοστό', () => {
    renderCard(baseProps({ progressPercent: 75, progressLabel: null, lastMeasuredLabel: 'Τελευταία μέτρηση: 10 Ιουλ' }))

    expect(document.querySelector('.progress-bar')).toBeInTheDocument()
    expect(screen.getByText('75%')).toBeInTheDocument()
    expect(screen.queryByText(/Τελευταία καταγραφή:/)).not.toBeInTheDocument()
    expect(screen.getByText('Τελευταία μέτρηση: 10 Ιουλ')).toBeInTheDocument()
  })

  it('non-computable measurement → μορφοποιημένη «Τελευταία καταγραφή», ΧΩΡΙΣ progress bar/ποσοστό', () => {
    renderCard(baseProps({ progressPercent: null, progressLabel: 'Τελευταία καταγραφή: Λεκτική υπόδειξη' }))

    expect(document.querySelector('.progress-bar')).not.toBeInTheDocument()
    expect(screen.getByText('Τελευταία καταγραφή: Λεκτική υπόδειξη')).toBeInTheDocument()
    // Κανένα κείμενο με «%» — δεν πρέπει να μοιάζει με ποσοστό ολοκλήρωσης.
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
  })

  it('καμία μέτρηση → «Καμία μέτρηση ακόμα», ΧΩΡΙΣ progress bar', () => {
    renderCard(baseProps({ progressPercent: null, progressLabel: null }))

    expect(document.querySelector('.progress-bar')).not.toBeInTheDocument()
    expect(screen.getByText('Καμία μέτρηση ακόμα')).toBeInTheDocument()
  })

  it('μεγάλο κείμενο (π.χ. Περιγραφική παρατήρηση) γίνεται line-clamp, όχι κρυφό/κομμένο δεδομένο', () => {
    const longNote = 'Μια πολύ μεγάλη παρατήρηση που θα μπορούσε να πιάσει αρκετές γραμμές κειμένου μέσα στην κάρτα.'
    renderCard(baseProps({ progressLabel: `Τελευταία καταγραφή: ${longNote}` }))

    // Το ΠΛΗΡΕΣ κείμενο υπάρχει στο DOM (το line-clamp είναι καθαρά οπτικό, CSS) — το GoalDetail
    // (Στάδιο 9β) θα το δείχνει ολόκληρο.
    expect(screen.getByText(`Τελευταία καταγραφή: ${longNote}`)).toBeInTheDocument()
  })
})

// Minor UX Polish (bug report): το κριτήριο ήταν εντελώς αόρατο στην κάρτα — ένας δάσκαλος με
// πολλούς ενεργούς στόχους έπρεπε να ανοίξει κάθε Goal Detail για να το δει. Τώρα πάντα ορατό όταν
// υπάρχει, ΑΝΕΞΑΡΤΗΤΑ από το αν υπάρχει ήδη μέτρηση.
describe('GoalCard — κριτήριο πάντα ορατό (Minor UX Polish)', () => {
  it('εμφανίζεται ακόμα και ΧΩΡΙΣ καμία μέτρηση', () => {
    renderCard(baseProps({ criterion: '3 από 3 βήματα ανεξάρτητα', progressPercent: null, progressLabel: null }))

    expect(screen.getByText('Κριτήριο')).toBeInTheDocument()
    expect(screen.getByText('3 από 3 βήματα ανεξάρτητα')).toBeInTheDocument()
    expect(screen.getByText('Καμία μέτρηση ακόμα')).toBeInTheDocument()
  })

  it('εμφανίζεται ΚΑΙ όταν υπάρχει ήδη progress bar', () => {
    renderCard(baseProps({ criterion: '4 από 5 προσπάθειες', progressPercent: 80 }))

    expect(screen.getByText('4 από 5 προσπάθειες')).toBeInTheDocument()
    expect(document.querySelector('.progress-bar')).toBeInTheDocument()
  })

  it('καμία ένδειξη κριτηρίου όταν δεν δόθηκε (π.χ. legacy goal χωρίς κριτήριο)', () => {
    renderCard(baseProps({ criterion: undefined }))
    expect(screen.queryByText('Κριτήριο')).not.toBeInTheDocument()
  })

  it('πολύ μεγάλο συνεχόμενο κριτήριο δεν ξεφεύγει από την κάρτα (ίδιο overflow-wrap fix εξαρχής)', () => {
    const huge = 'κ'.repeat(300)
    renderCard(baseProps({ criterion: huge }))
    expect(screen.getByText(huge)).toHaveClass('goal-card2__criterion-text')
  })
})
