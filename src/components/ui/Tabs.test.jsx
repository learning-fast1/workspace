import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Mobile review (product polish, σημείο 6): οι καρτέλες (π.χ. Student Profile: Προφίλ/Ενισχυτές/
// Στόχοι/Συνεδρίες/Έκθεση) ήταν ήδη scrollable σε στενές οθόνες (overflow-x:auto) αλλά χωρίς κανένα
// οπτικό σημάδι ότι υπάρχουν κι άλλες δεξιά — έδειχνε απλώς κομμένο. «Καρφώνουμε» εδώ τις ίδιες τις
// CSS δηλώσεις (jsdom δεν κάνει πραγματικό layout/overflow measurement).
describe('Tabs.css: ήδη scrollable + fade affordance σε mobile πλάτη', () => {
  it('.tabs έχει ήδη overflow-x: auto (προϋπόθεση — δεν έπρεπε να ξαναφτιαχτεί από την αρχή)', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/components/ui/Tabs.css'), 'utf-8')
    const match = css.match(/\.tabs\s*\{([^}]*)\}/)
    expect(match).toBeTruthy()
    expect(match[1]).toMatch(/overflow-x:\s*auto/)
  })

  it('@media (max-width: 767px) προσθέτει mask-image fade στη δεξιά άκρη', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/components/ui/Tabs.css'), 'utf-8')
    const mobileBlockMatch = css.match(/@media \(max-width: 767px\) \{([\s\S]*?)\n\}/)
    expect(mobileBlockMatch, 'δεν βρέθηκε το @media (max-width: 767px) block').toBeTruthy()
    expect(mobileBlockMatch[1]).toMatch(/mask-image:\s*linear-gradient/)
  })
})
