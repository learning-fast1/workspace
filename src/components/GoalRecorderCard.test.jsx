import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GoalRecorderCard from './GoalRecorderCard.jsx'

afterEach(() => cleanup())

function baseGoal(overrides = {}) {
  return { id: 1, measurementType: 'successRatio', criterion: '', ...overrides }
}

function renderCard(props = {}) {
  return render(
    <GoalRecorderCard
      domainLabel="Ανάγνωση"
      title="Στόχος"
      description=""
      goal={baseGoal()}
      value={undefined}
      onChange={() => {}}
      canUndo={false}
      onUndo={() => {}}
      isRecorded={false}
      expanded={false}
      onToggleExpand={() => {}}
      clinicalAssessment={undefined}
      onClinicalAssessmentChange={() => {}}
      {...props}
    />
  )
}

// Bug report: ένα πολύ μεγάλο, συνεχόμενο κριτήριο (καμία θέση για φυσιολογικό word-wrap σε κενό)
// χαλούσε οπτικά την κάρτα (ξεχείλιζε). Το CSS fix (overflow-wrap: anywhere, βλ. GoalRecorderCard.css)
// επαληθεύεται εδώ ΛΕΙΤΟΥΡΓΙΚΑ: το πλήρες κείμενο πρέπει να παραμένει άθικτο στο DOM (καμία απόκρυψη/
// περικοπή) ΚΑΙ να φέρει τη σωστή κλάση — η ΙΔΙΑ η οπτική συμπεριφορά (πραγματικό wrap) επαληθεύεται
// ξεχωριστά στο criterionTextWrap.test.js, που διαβάζει απευθείας το CSS (jsdom δεν κάνει πραγματικό
// layout/overflow measurement).
const HUGE_UNBROKEN_CRITERION = 'Κ'.repeat(300) + '1234567890'.repeat(30)

describe('GoalRecorderCard — ανθεκτικότητα κριτηρίου σε πολύ μεγάλο συνεχόμενο κείμενο', () => {
  it('συμπτυγμένο: το πλήρες κριτήριο εμφανίζεται άθικτο, με την κλάση που φέρει το overflow-wrap fix', () => {
    renderCard({
      goal: baseGoal({ criterion: HUGE_UNBROKEN_CRITERION }),
      criterionHint: `Κριτήριο: ${HUGE_UNBROKEN_CRITERION}`,
      expanded: false
    })

    const criterionEl = screen.getByText(`Κριτήριο: ${HUGE_UNBROKEN_CRITERION}`)
    expect(criterionEl).toHaveClass('goal-recorder-card__criterion')
  })

  it('ανοιχτό: το πλήρες κριτήριο εμφανίζεται άθικτο πάνω από το recording UI, με την ίδια κλάση', async () => {
    const user = userEvent.setup()
    renderCard({
      goal: baseGoal({ criterion: HUGE_UNBROKEN_CRITERION }),
      criterionHint: `Κριτήριο: ${HUGE_UNBROKEN_CRITERION}`,
      expanded: false
    })

    await user.click(screen.getByRole('button', { name: /Στόχος/ }))

    const criterionEl = screen.getByText(`Κριτήριο: ${HUGE_UNBROKEN_CRITERION}`)
    expect(criterionEl).toHaveClass('goal-recorder-card__criterion')
  })

  it('καμία κλάση CSS δεν κρύβει/περικόπτει το κείμενο — πλήρες μήκος στο DOM', () => {
    renderCard({
      goal: baseGoal({ criterion: HUGE_UNBROKEN_CRITERION }),
      criterionHint: `Κριτήριο: ${HUGE_UNBROKEN_CRITERION}`,
      expanded: false
    })

    expect(screen.getByText(`Κριτήριο: ${HUGE_UNBROKEN_CRITERION}`).textContent.length).toBe(
      `Κριτήριο: ${HUGE_UNBROKEN_CRITERION}`.length
    )
  })
})

// Product polish (feedback χρήστη, Teaching Mode): οι συμπτυγμένες κάρτες έπρεπε να μικρύνουν
// ~10-15% ώστε να χωρούν περισσότεροι στόχοι στην οθόνη χωρίς scroll — μέσω στενότερου padding στο
// header ΚΑΙ tighter line-height στο κείμενο, ΧΩΡΙΣ αλλαγή font-size (ίδια αναγνωσιμότητα). Καρφώνουμε
// τις ίδιες τις CSS δηλώσεις (jsdom δεν κάνει πραγματικό layout/ύψος measurement).
describe('GoalRecorderCard.css: συμπτυγμένη κάρτα — στενότερο padding/line-height, ΟΧΙ αλλαγή font-size', () => {
  it('.goal-recorder-card__header: κάθετο padding var(--space-3), ΟΧΙ πια var(--space-4)', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/components/GoalRecorderCard.css'), 'utf-8')
    const match = css.match(/\.goal-recorder-card__header\s*\{([^}]*)\}/)
    expect(match).toBeTruthy()
    expect(match[1]).toMatch(/padding:\s*var\(--space-3\)\s+var\(--space-5\)/)
    // min-height:44px (ελάχιστο touch target, a11y) ΠΑΡΑΜΕΝΕΙ αναλλοίωτο.
    expect(match[1]).toMatch(/min-height:\s*44px/)
  })

  it('domain/title/description/criterion: line-height 1.25, ΙΔΙΟ font-size με πριν', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/components/GoalRecorderCard.css'), 'utf-8')
    for (const selector of ['__domain', '__title', '__description', '__criterion']) {
      const match = css.match(new RegExp(`\\.goal-recorder-card${selector}\\s*\\{([^}]*)\\}`))
      expect(match, `.goal-recorder-card${selector} δεν βρέθηκε`).toBeTruthy()
      expect(match[1]).toMatch(/line-height:\s*1\.25/)
    }
    expect(css).toMatch(/\.goal-recorder-card__title\s*\{[^}]*font-size:\s*var\(--font-lg\)/)
    expect(css).toMatch(/\.goal-recorder-card__domain\s*\{[^}]*font-size:\s*var\(--font-sm\)/)
  })
})
