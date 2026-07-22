import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Regression guard (bug report: πολύ μεγάλο/συνεχόμενο κριτήριο χωρίς κενά ξέφευγε από την κάρτα —
// το κανονικό word-wrap σπάει ΜΟΝΟ σε κενά, όχι μέσα σε μία «λέξη»). jsdom δεν κάνει πραγματικό
// layout/overflow measurement, άρα δεν μπορούμε να επαληθεύσουμε οπτικά το wrap εδώ — αντ' αυτού,
// «καρφώνουμε» τις ΙΔΙΕΣ τις CSS δηλώσεις που το διορθώνουν, ώστε μελλοντική αφαίρεσή τους (π.χ. σε
// refactor) να σπάσει αυτό το test αντί να περάσει σιωπηλά. Η λειτουργική πλευρά (το κριτήριο
// αποδίδεται άθικτο με τη σωστή κλάση) επαληθεύεται στο GoalRecorderCard.test.jsx.
function readCss(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf-8')
}

function ruleBodyFor(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))
  return match ? match[1] : null
}

describe('Κριτήριο — overflow-wrap σε κάθε σημείο όπου αποδίδεται ελεύθερο κείμενο κριτηρίου', () => {
  it('GoalDetail.css: .goal-detail__criterion έχει overflow-wrap: anywhere', () => {
    const body = ruleBodyFor(readCss('./GoalDetail.css'), '.goal-detail__criterion')
    expect(body).toBeTruthy()
    expect(body).toMatch(/overflow-wrap:\s*anywhere/)
  })

  it('GoalStatusModal.css: .goal-status-modal__achieved-info έχει overflow-wrap: anywhere', () => {
    const body = ruleBodyFor(readCss('./GoalStatusModal.css'), '.goal-status-modal__achieved-info')
    expect(body).toBeTruthy()
    expect(body).toMatch(/overflow-wrap:\s*anywhere/)
  })
})
