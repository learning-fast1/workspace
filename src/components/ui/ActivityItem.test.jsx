import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Target } from 'lucide-react'
import ActivityItem from './ActivityItem.jsx'

afterEach(() => cleanup())

// `onClick` (GoalDetail.jsx — άνοιγμα SessionModal) και `kind` (καθαρά οπτική διαφοροποίηση
// οικογένειας γραμμής, βλ. utils/goalHistory.js) προστέθηκαν χωρίς να αλλάξει η υπάρχουσα
// συμπεριφορά `to` (StudentTimeline.jsx — πλοήγηση).
describe('ActivityItem — to (Link) / onClick (button) / plain, kind', () => {
  it('χωρίς to/onClick: αποδίδεται ως μη-διαδραστικό div', () => {
    render(<ActivityItem icon={Target} text="Κείμενο" dateLabel="1 Ιαν" />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText('Κείμενο')).toBeInTheDocument()
  })

  it('με to: αποδίδεται ως Link', () => {
    render(
      <MemoryRouter>
        <ActivityItem icon={Target} text="Κείμενο" dateLabel="1 Ιαν" to="/students/1" />
      </MemoryRouter>
    )
    expect(screen.getByRole('link')).toHaveAttribute('href', '/students/1')
  })

  it('με onClick: αποδίδεται ως button, καλεί το onClick στο κλικ', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<ActivityItem icon={Target} text="Κείμενο" dateLabel="1 Ιαν" onClick={onClick} />)

    const button = screen.getByRole('button')
    await user.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('kind προσθέτει την αντίστοιχη κλάση για οπτική διαφοροποίηση', () => {
    render(<ActivityItem icon={Target} text="Κείμενο" dateLabel="1 Ιαν" kind="measurement" />)
    expect(screen.getByText('Κείμενο').closest('.activity-item')).toHaveClass('activity-item--measurement')
  })
})

// Bug report: πολύ μεγάλο/συνεχόμενο κείμενο (π.χ. narrative μέτρηση χωρίς κενά) στο ενοποιημένο
// Ιστορικό (GoalDetail.jsx) ξέφευγε από την κάρτα, σπρώχνοντας το date εκτός πλαισίου. Ίδιο fix idiom
// με το criterionTextWrap.test.js — jsdom δεν κάνει πραγματικό layout, οπότε επαληθεύουμε λειτουργικά
// (πλήρες κείμενο στο DOM, σωστή κλάση) εδώ, και «καρφώνουμε» το ίδιο το CSS declaration ξεχωριστά.
const HUGE_UNBROKEN_TEXT = 'κ'.repeat(400)

describe('ActivityItem — ανθεκτικότητα σε πολύ μεγάλο συνεχόμενο κείμενο', () => {
  it('το πλήρες κείμενο αποδίδεται άθικτο, με την κλάση που φέρει το overflow-wrap fix', () => {
    render(<ActivityItem icon={Target} text={HUGE_UNBROKEN_TEXT} dateLabel="18 Ιουλ 2026" />)

    const textEl = screen.getByText(HUGE_UNBROKEN_TEXT)
    expect(textEl).toHaveClass('activity-item__text')
    expect(textEl.textContent.length).toBe(HUGE_UNBROKEN_TEXT.length)
    // Το date παραμένει ξεχωριστό στοιχείο στο DOM (δεν «καταπίνεται»/αντικαθίσταται από το μεγάλο κείμενο).
    expect(screen.getByText('18 Ιουλ 2026')).toBeInTheDocument()
  })

  // «Καρφώνει» την ίδια τη CSS δήλωση (jsdom δεν κάνει πραγματικό layout/overflow measurement) —
  // μελλοντική αφαίρεσή της θα σπάσει αυτό το test αντί να περάσει σιωπηλά.
  it('ActivityItem.css: .activity-item__text έχει overflow-wrap: anywhere', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/components/ui/ActivityItem.css'), 'utf-8')
    const match = css.match(/\.activity-item__text\s*\{([^}]*)\}/)
    expect(match).toBeTruthy()
    expect(match[1]).toMatch(/overflow-wrap:\s*anywhere/)
  })
})
