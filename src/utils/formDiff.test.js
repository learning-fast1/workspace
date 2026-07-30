import { describe, expect, it } from 'vitest'
import { diffFields } from './formDiff.js'

// Root Cause Investigation (Scenario E) — αυτό είναι ο κεντρικός helper που κάνει το property-level
// merge του Dexie Cloud πραγματικά εφικτό: Table.update() ήδη υποστηρίζει merge ανά ιδιότητα, αλλά
// μόνο αν το changeSpec περιέχει ΠΡΑΓΜΑΤΙΚΑ μόνο ό,τι άλλαξε — όχι ολόκληρο το τοπικό state.
describe('diffFields — μόνο πραγματικά αλλαγμένα πεδία, ποτέ ολόκληρο το snapshot', () => {
  it('ένα μόνο changed scalar → changeSpec με ακριβώς ένα key', () => {
    const original = { code: 'Μ1', nickname: '', grade: '' }
    const updated = { code: 'Μ1', nickname: 'Νέο όνομα', grade: '' }
    expect(diffFields(original, updated)).toEqual({ nickname: 'Νέο όνομα' })
  })

  it('κανένα πεδίο δεν άλλαξε → άδειο αποτέλεσμα', () => {
    const original = { code: 'Μ1', nickname: 'Ν', grade: 'Α' }
    const updated = { code: 'Μ1', nickname: 'Ν', grade: 'Α' }
    expect(diffFields(original, updated)).toEqual({})
  })

  it('undefined τιμή στο updated ΔΕΝ περνάει ποτέ στο changeSpec', () => {
    const original = { code: 'Μ1', nickname: 'Ν' }
    const updated = { code: 'Μ1', nickname: undefined }
    expect(diffFields(original, updated)).toEqual({})
  })

  it('undefined τιμή ακόμα κι όταν το original ήταν κάτι άλλο → και πάλι αγνοείται', () => {
    const original = { nickname: 'Παλιό' }
    const updated = { nickname: undefined }
    expect(diffFields(original, updated)).toEqual({})
  })

  it('μη αλλαγμένο array/object property (διαφορετική αναφορά, ίδιο περιεχόμενο) → ΔΕΝ στέλνεται', () => {
    const original = { functionalProfile: ['a', 'b'], preferences: { color: 'blue' } }
    const updated = { functionalProfile: ['a', 'b'], preferences: { color: 'blue' } }
    expect(diffFields(original, updated)).toEqual({})
  })

  it('πραγματικά αλλαγμένο array/object property → στέλνεται ΟΛΟΚΛΗΡΟ ως ένα top-level key', () => {
    const original = { functionalProfile: ['a', 'b'], preferences: { color: 'blue' } }
    const updated = { functionalProfile: ['a', 'b', 'c'], preferences: { color: 'blue' } }
    expect(diffFields(original, updated)).toEqual({ functionalProfile: ['a', 'b', 'c'] })
  })

  it('μεικτό: ένα scalar άλλαξε, ένα object παρέμεινε ίδιο, ένα άλλο object άλλαξε', () => {
    const original = { nickname: 'Παλιό', preferences: { a: 1 }, moods: { m1: 'ok' } }
    const updated = { nickname: 'Νέο', preferences: { a: 1 }, moods: { m1: 'better' } }
    expect(diffFields(original, updated)).toEqual({ nickname: 'Νέο', moods: { m1: 'better' } })
  })

  it('επιστρέφει ΜΟΝΟ keys που υπάρχουν ρητά στο updated — ένα key μόνο στο original αγνοείται πλήρως', () => {
    const original = { code: 'Μ1', legacyOnlyField: 'κάτι' }
    const updated = { code: 'Μ1' }
    expect(diffFields(original, updated)).toEqual({})
  })

  it('original === null/undefined (π.χ. δεν φορτώθηκε ποτέ αρχικό snapshot) → όλα τα ορισμένα πεδία θεωρούνται αλλαγμένα', () => {
    expect(diffFields(null, { code: 'Μ1' })).toEqual({ code: 'Μ1' })
    expect(diffFields(undefined, { code: 'Μ1' })).toEqual({ code: 'Μ1' })
  })

  it('ΔΕΝ μεταλλάσσει κανένα από τα δύο ορίσματα', () => {
    const original = { nickname: 'Παλιό', preferences: { a: 1 } }
    const updated = { nickname: 'Νέο', preferences: { a: 1 } }
    const originalSnapshot = JSON.stringify(original)
    const updatedSnapshot = JSON.stringify(updated)
    diffFields(original, updated)
    expect(JSON.stringify(original)).toBe(originalSnapshot)
    expect(JSON.stringify(updated)).toBe(updatedSnapshot)
  })

  it('άδειο updated → άδειο αποτέλεσμα', () => {
    expect(diffFields({ code: 'Μ1' }, {})).toEqual({})
  })

  it('false/0/κενό string θεωρούνται έγκυρες, πραγματικές τιμές — δεν συγχέονται με undefined', () => {
    const original = { active: true, count: 5, note: 'κάτι' }
    const updated = { active: false, count: 0, note: '' }
    expect(diffFields(original, updated)).toEqual({ active: false, count: 0, note: '' })
  })
})

// Isolated proof (όχι εκτεταμένο σουίτ) ότι το ΠΑΛΙΟ idiom (ολόκληρο form ως changeSpec) θα
// αλλοίωνε πραγματικά ένα ανεξάρτητο, ταυτόχρονο partial update — ο λόγος που υπάρχει το diffFields.
describe('old full-object behaviour — isolated regression-guard proof', () => {
  it('ένα ολόκληρο-object changeSpec θα υπέγραφε κάθε άλλο πεδίο πίσω στην τοπική, ενδεχομένως μπαγιάτικη τιμή', () => {
    // Ό,τι θα έστελνε το StudentForm.jsx ΠΡΙΝ τη διόρθωση: ολόκληρο το form, συμπεριλαμβανομένου
    // ενός πεδίου που ο χρήστης ΔΕΝ άγγιξε (grade), με την μπαγιάτικη τοπική τιμή.
    const staleFullFormSpec = { nickname: 'ΑπόΣυσκευήΑ', grade: '' } // grade ΠΟΤΕ δεν άλλαξε εδώ τοπικά
    const remoteAlreadyHasGrade = { nickname: '', grade: 'Ε2' } // η ΑΛΛΗ συσκευή ήδη έγραψε grade
    // Το "merge" ενός full-object write θα ήταν απλή αντικατάσταση — grade χάνεται.
    const wouldBeStored = { ...remoteAlreadyHasGrade, ...staleFullFormSpec }
    expect(wouldBeStored.grade).toBe('') // ΑΠΩΛΕΙΑ — αυτό ακριβώς παρατηρήθηκε στο Scenario E
  })
})
