import { describe, expect, it } from 'vitest'
import { hasCriterionContent, decideMeasurementTypeChange, applyMeasurementTypeChange } from './measurementTypeChange.js'

describe('hasCriterionContent', () => {
  it('κενό goal (νέος στόχος πριν επιλεγεί κάτι) → false', () => {
    expect(hasCriterionContent({ criterion: '', criterionConfig: null })).toBe(false)
    expect(hasCriterionContent({ criterion: '', criterionConfig: undefined })).toBe(false)
  })

  it('μη κενό ελεύθερο criterion → true', () => {
    expect(hasCriterionContent({ criterion: '4/5', criterionConfig: null })).toBe(true)
  })

  it('criterion μόνο κενά κενά → false (trim)', () => {
    expect(hasCriterionContent({ criterion: '   ', criterionConfig: null })).toBe(false)
  })

  it('άδειο criterionConfig (π.χ. createEmptyCriterionConfig του successRatio) → false', () => {
    expect(hasCriterionContent({ criterion: '', criterionConfig: { targetSuccesses: null, targetAttempts: null } })).toBe(false)
  })

  it('criterionConfig με έστω ένα συμπληρωμένο πεδίο → true', () => {
    expect(hasCriterionContent({ criterion: '', criterionConfig: { targetSuccesses: 4, targetAttempts: null } })).toBe(true)
  })

  it('criterionConfig με μη κενό array (π.χ. steps) → true', () => {
    expect(hasCriterionContent({ criterion: '', criterionConfig: { steps: [{ id: 1, label: 'Α' }], targetCompletedCount: null } })).toBe(true)
  })
})

describe('decideMeasurementTypeChange', () => {
  const emptyGoal = { measurementType: '', criterion: '', criterionConfig: null }

  it('πρώτη επιλογή σε νέο στόχο (κανένας τύπος ακόμα) → apply', () => {
    expect(decideMeasurementTypeChange(emptyGoal, 'successRatio', false)).toBe('apply')
  })

  it('ξαναπάτημα του ήδη επιλεγμένου τύπου → noop', () => {
    const goal = { measurementType: 'successRatio', criterion: '4/5', criterionConfig: null }
    expect(decideMeasurementTypeChange(goal, 'successRatio', false)).toBe('noop')
  })

  it('αλλαγή τύπου με ήδη συμπληρωμένο criterion, χωρίς μετρήσεις → confirm', () => {
    const goal = { measurementType: 'successRatio', criterion: '4/5', criterionConfig: null }
    expect(decideMeasurementTypeChange(goal, 'duration', false)).toBe('confirm')
  })

  it('αλλαγή τύπου χωρίς κανένα περιεχόμενο ακόμα, χωρίς μετρήσεις → apply', () => {
    const goal = { measurementType: 'successRatio', criterion: '', criterionConfig: null }
    expect(decideMeasurementTypeChange(goal, 'duration', false)).toBe('apply')
  })

  it('goal ΜΕ μετρήσεις → πάντα blocked, ό,τι κι αν περιέχει το criterion', () => {
    const goalWithContent = { measurementType: 'successRatio', criterion: '4/5', criterionConfig: null }
    const goalEmpty = { measurementType: 'successRatio', criterion: '', criterionConfig: null }
    expect(decideMeasurementTypeChange(goalWithContent, 'duration', true)).toBe('blocked')
    expect(decideMeasurementTypeChange(goalEmpty, 'duration', true)).toBe('blocked')
  })

  it('blocked υπερισχύει του confirm (μετρήσεις + περιεχόμενο ταυτόχρονα) → blocked, ΟΧΙ confirm', () => {
    const goal = { measurementType: 'successRatio', criterion: '4/5', criterionConfig: null }
    expect(decideMeasurementTypeChange(goal, 'duration', true)).toBe('blocked')
  })

  it('goal ΜΕ μετρήσεις, ξαναπάτημα ήδη επιλεγμένου τύπου → noop, ΟΧΙ blocked (καμία πραγματική αλλαγή ζητήθηκε)', () => {
    const goal = { measurementType: 'successRatio', criterion: '4/5', criterionConfig: null }
    expect(decideMeasurementTypeChange(goal, 'successRatio', true)).toBe('noop')
  })
})

describe('applyMeasurementTypeChange', () => {
  it('επιστρέφει καθαρό patch: νέο measurementType, κενό criterion, criterionConfig ΑΠΟΚΛΕΙΣΤΙΚΑ από createEmptyCriterionConfig() του νέου module', () => {
    expect(applyMeasurementTypeChange('successRatio')).toEqual({
      measurementType: 'successRatio',
      criterion: '',
      criterionConfig: { targetSuccesses: null, targetAttempts: null }
    })
  })

  it('διαφορετικό σχήμα ανά τύπο (π.χ. duration)', () => {
    expect(applyMeasurementTypeChange('duration')).toEqual({
      measurementType: 'duration',
      criterion: '',
      criterionConfig: { direction: null, targetMinutes: null, context: '' }
    })
  })

  it('άγνωστος τύπος → throw (ίδιο idiom με getMeasurementType)', () => {
    expect(() => applyMeasurementTypeChange('telepathy')).toThrow()
  })
})
