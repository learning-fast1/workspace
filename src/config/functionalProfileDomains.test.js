import { describe, expect, it } from 'vitest'
import { DOMAINS } from './domains.js'
import { FUNCTIONAL_PROFILE_DOMAINS, FUNCTIONAL_PROFILE_DOMAIN_IDS, functionalProfileDomainName } from './functionalProfileDomains.js'

// Απόφαση χρήστη: το Λειτουργικό Προφίλ παραμένει προσωρινά στους 14 αναλυτικούς τομείς, πλήρως
// ανεξάρτητο από την απλοποίηση των τομέων στόχων (config/domains.js, τώρα 8). Αυτό το test file
// επιβεβαιώνει τη ρητή αποσύνδεση.
describe('FUNCTIONAL_PROFILE_DOMAINS — παγωμένοι 14 αναλυτικοί τομείς, ανεξάρτητοι από τους τομείς στόχων', () => {
  it('ακριβώς 14 τομείς, ίδιοι με πριν την απλοποίηση', () => {
    expect(FUNCTIONAL_PROFILE_DOMAIN_IDS).toHaveLength(14)
    expect(FUNCTIONAL_PROFILE_DOMAIN_IDS).toEqual([
      'fine-motor', 'gross-motor', 'attention', 'executive-functions', 'sensory',
      'phonological-awareness', 'reading', 'writing', 'math', 'oral-language',
      'social-skills', 'emotional-development', 'self-care', 'behavior'
    ])
  })

  it('functionalProfileDomainName() επιστρέφει τις παλιές, αναλυτικές ονομασίες', () => {
    expect(functionalProfileDomainName('reading')).toBe('Ανάγνωση')
    expect(functionalProfileDomainName('fine-motor')).toBe('Λεπτή κινητικότητα')
    expect(functionalProfileDomainName('oral-language')).toBe('Προφορικός λόγος')
  })

  it('πλήρως ανεξάρτητο από το config/domains.js — καμία επικάλυψη ids με τους 8 νέους τομείς στόχων εκτός από τους 5 που σκόπιμα παρέμειναν ίδιοι', () => {
    const goalDomainIds = new Set(DOMAINS.map((d) => d.id))
    const unchangedSharedIds = new Set(['sensory', 'social-skills', 'emotional-development', 'self-care', 'behavior'])
    for (const id of FUNCTIONAL_PROFILE_DOMAIN_IDS) {
      if (unchangedSharedIds.has(id)) {
        expect(goalDomainIds.has(id), `το «${id}» θα έπρεπε να υπάρχει ΚΑΙ στους δύο (σκόπιμα αμετάβλητο)`).toBe(true)
      } else {
        expect(goalDomainIds.has(id), `το «${id}» δεν θα έπρεπε να υπάρχει στους τομείς στόχων πια`).toBe(false)
      }
    }
  })

  it('FUNCTIONAL_PROFILE_DOMAINS δεν είναι η ίδια αναφορά με το DOMAINS (πραγματικά ξεχωριστό module state)', () => {
    expect(FUNCTIONAL_PROFILE_DOMAINS).not.toBe(DOMAINS)
  })
})
