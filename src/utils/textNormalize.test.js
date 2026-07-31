import { describe, expect, it } from 'vitest'
import { normalizeForSearch } from './textNormalize.js'

describe('normalizeForSearch', () => {
  it('αφαιρεί τόνο σε μονοσύλλαβες/πολυσύλλαβες λέξεις', () => {
    expect(normalizeForSearch('Γιώργος')).toBe(normalizeForSearch('Γιωργος'))
    expect(normalizeForSearch('φωνολογική')).toBe(normalizeForSearch('φωνολογικη'))
    expect(normalizeForSearch('Άρθρωση')).toBe(normalizeForSearch('αρθρωση'))
  })

  it('είναι case-insensitive', () => {
    expect(normalizeForSearch('ΓΙΩΡΓΟΣ')).toBe(normalizeForSearch('γιωργος'))
  })

  it('αφαιρεί διαλυτικά (π.χ. Νεφέλη/ϊ)', () => {
    expect(normalizeForSearch('παϊδάκι')).toBe(normalizeForSearch('παιδακι'))
  })

  it('δεν αλλάζει βασικά λατινικά/αριθμούς', () => {
    expect(normalizeForSearch('Mary123')).toBe('mary123')
  })

  it('χειρίζεται κενό/undefined χωρίς σφάλμα', () => {
    expect(normalizeForSearch('')).toBe('')
    expect(normalizeForSearch(undefined)).toBe('')
    expect(normalizeForSearch(null)).toBe('')
  })

  it('πραγματικό αποτέλεσμα ελέγχεται (όχι μόνο ισότητα μεταξύ τους) — καμία εναπομένουσα διακριτική ένδειξη', () => {
    const result = normalizeForSearch('Άρθρωση')
    expect(result).toBe('αρθρωση')
    expect(result).not.toMatch(/[̀-ͯ]/)
  })
})
