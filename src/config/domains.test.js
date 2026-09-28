import { describe, expect, it } from 'vitest'
import { DOMAINS, DOMAIN_IDS, SELECTABLE_DOMAINS, domainName, selectableDomainsIncluding } from './domains.js'

// Απλοποίηση τομέων στόχων — τελική, εγκεκριμένη λίστα (8 τομείς, από 14 αναλυτικούς πριν).
// «Communication»/«Cognitive»/«Mobility» είναι οι μόνοι πραγματικά ΝΕΟΙ ids (συγχώνευση πολλών
// παλιών) — οι υπόλοιποι 5 κράτησαν το ίδιο id, άλλαξε μόνο η ονομασία εμφάνισης.
describe('DOMAINS (τομείς στόχων) — τελική ταξινόμηση 8 τομέων', () => {
  it('ακριβώς η εγκεκριμένη λίστα, με αυτή τη σειρά', () => {
    expect(DOMAINS).toEqual([
      { id: 'mobility', name: 'Κινητική' },
      { id: 'sensory', name: 'Αισθητηριακή' },
      { id: 'cognitive', name: 'Γνωσιοαντιληπτική' },
      { id: 'emotional-development', name: 'Συναισθηματική' },
      { id: 'social-skills', name: 'Κοινωνική' },
      { id: 'self-care', name: 'Αυτομέριμνα' },
      { id: 'communication', name: 'Επικοινωνία', retired: true },
      { id: 'behavior', name: 'Συμπεριφορά', retired: true }
    ])
  })

  it('DOMAIN_IDS αντλείται από τη λίστα, 8 ids', () => {
    expect(DOMAIN_IDS).toHaveLength(8)
    expect(DOMAIN_IDS).toEqual(DOMAINS.map((d) => d.id))
  })

  it('domainName() επιστρέφει τη σωστή ελληνική ονομασία', () => {
    expect(domainName('communication')).toBe('Επικοινωνία')
    expect(domainName('cognitive')).toBe('Γνωσιοαντιληπτική')
    expect(domainName('behavior')).toBe('Συμπεριφορά')
  })

  it('domainName() σε παλιό, πλέον ανύπαρκτο id επιστρέφει το ίδιο το id ως fallback (ΟΧΙ crash)', () => {
    expect(domainName('reading')).toBe('reading')
    expect(domainName('fine-motor')).toBe('fine-motor')
  })
})

// Αίτημα χρήστη (2026-09): Επικοινωνία/Συμπεριφορά αποσύρονται από τις επιλογές, αλλά υπάρχοντες
// στόχοι σε αυτούς τους τομείς κρατούν ονομασία και τιμή στο dropdown επεξεργασίας.
describe('αποσυρμένοι τομείς', () => {
  it('SELECTABLE_DOMAINS: 6 τομείς, χωρίς Επικοινωνία/Συμπεριφορά', () => {
    expect(SELECTABLE_DOMAINS.map((d) => d.id)).toEqual([
      'mobility', 'sensory', 'cognitive', 'emotional-development', 'social-skills', 'self-care'
    ])
  })

  it('selectableDomainsIncluding: προσθέτει τον τρέχοντα αποσυρμένο τομέα, αλλιώς μόνο τους επιλέξιμους', () => {
    expect(selectableDomainsIncluding('behavior').map((d) => d.id)).toContain('behavior')
    expect(selectableDomainsIncluding('behavior').map((d) => d.id)).not.toContain('communication')
    expect(selectableDomainsIncluding('mobility')).toBe(SELECTABLE_DOMAINS)
    expect(selectableDomainsIncluding('')).toBe(SELECTABLE_DOMAINS)
  })
})
