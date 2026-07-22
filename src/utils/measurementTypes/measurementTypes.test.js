import { describe, expect, it } from 'vitest'
import * as successRatio from './successRatio.js'
import * as taskAnalysis from './taskAnalysis.js'
import * as promptLevel from './promptLevel.js'
import * as ratingScale from './ratingScale.js'
import * as checklist from './checklist.js'
import * as duration from './duration.js'
import * as frequency from './frequency.js'
import * as narrative from './narrative.js'
import {
  getMeasurementType, listMeasurementTypes, validateCriterionConfig, generateCriterionText,
  computeProgressPercent, isNearCriterion, meetsCriterion, isEmptyRecordedValue, describeNearCriterion
} from './index.js'

describe('successRatio', () => {
  it('createEmptyCriterionConfig → null πεδία', () => {
    expect(successRatio.createEmptyCriterionConfig()).toEqual({ targetSuccesses: null, targetAttempts: null })
  })
  it('validate: έγκυρο config δεν πετάει', () => {
    expect(() => successRatio.validateCriterionConfig({ targetSuccesses: 4, targetAttempts: 5 })).not.toThrow()
  })
  it('validate: λείπουν πεδία → throw', () => {
    expect(() => successRatio.validateCriterionConfig({})).toThrow()
    expect(() => successRatio.validateCriterionConfig(null)).toThrow()
  })
  it('validate: targetSuccesses > targetAttempts → throw', () => {
    expect(() => successRatio.validateCriterionConfig({ targetSuccesses: 6, targetAttempts: 5 })).toThrow()
  })
  it('validate: targetAttempts <= 0 → throw', () => {
    expect(() => successRatio.validateCriterionConfig({ targetSuccesses: 0, targetAttempts: 0 })).toThrow()
  })
  it('validate: αρνητικό targetSuccesses → throw', () => {
    expect(() => successRatio.validateCriterionConfig({ targetSuccesses: -1, targetAttempts: 5 })).toThrow()
  })
  it('generateCriterionText', () => {
    expect(successRatio.generateCriterionText({ targetSuccesses: 4, targetAttempts: 5 })).toBe('4 από 5 προσπάθειες')
  })
})

describe('taskAnalysis', () => {
  it('validate: έγκυρο config δεν πετάει', () => {
    expect(() => taskAnalysis.validateCriterionConfig({
      steps: [{ id: 1, label: 'Ανοίγει τη βρύση' }, { id: 2, label: 'Βάζει σαπούνι' }],
      targetCompletedCount: 2
    })).not.toThrow()
  })
  it('validate: κενή λίστα βημάτων → throw', () => {
    expect(() => taskAnalysis.validateCriterionConfig({ steps: [], targetCompletedCount: 1 })).toThrow()
  })
  it('validate: βήμα χωρίς τίτλο → throw', () => {
    expect(() => taskAnalysis.validateCriterionConfig({ steps: [{ id: 1, label: '  ' }], targetCompletedCount: 1 })).toThrow()
  })
  it('validate: μήνυμα ονομάζει ΤΗ ΣΥΓΚΕΚΡΙΜΕΝΗ γραμμή που λείπει (Στάδιο 7, διόρθωση χρήστη #2)', () => {
    expect(() => taskAnalysis.validateCriterionConfig({
      steps: [{ id: 1, label: 'Ανοίγει τη βρύση' }, { id: 2, label: '   ' }, { id: 3, label: 'Σκουπίζει' }],
      targetCompletedCount: 2
    })).toThrow('Το βήμα 2 χρειάζεται τίτλο.')
  })
  it('validate: targetCompletedCount εκτός εύρους → throw', () => {
    expect(() => taskAnalysis.validateCriterionConfig({ steps: [{ id: 1, label: 'Α' }], targetCompletedCount: 2 })).toThrow()
    expect(() => taskAnalysis.validateCriterionConfig({ steps: [{ id: 1, label: 'Α' }], targetCompletedCount: 0 })).toThrow()
  })
  it('generateCriterionText', () => {
    expect(taskAnalysis.generateCriterionText({ steps: [{ id: 1, label: 'Α' }, { id: 2, label: 'Β' }], targetCompletedCount: 2 }))
      .toBe('2 από 2 βήματα ανεξάρτητα')
  })
})

describe('promptLevel', () => {
  it('validate: έγκυρο επίπεδο δεν πετάει', () => {
    expect(() => promptLevel.validateCriterionConfig({ targetLevel: 'independent' })).not.toThrow()
  })
  it('validate: άγνωστο επίπεδο → throw', () => {
    expect(() => promptLevel.validateCriterionConfig({ targetLevel: 'telepathic' })).toThrow()
    expect(() => promptLevel.validateCriterionConfig({})).toThrow()
  })
  it('generateCriterionText', () => {
    expect(promptLevel.generateCriterionText({ targetLevel: 'verbal' })).toBe('Λεκτική υπόδειξη')
  })
})

describe('ratingScale', () => {
  const fullDescriptions = { 1: 'Α', 2: 'Β', 3: 'Γ', 4: 'Δ', 5: 'Ε' }
  it('validate: πλήρες config (και οι 5 περιγραφές) δεν πετάει', () => {
    expect(() => ratingScale.validateCriterionConfig({ targetLevel: 4, levelDescriptions: fullDescriptions })).not.toThrow()
  })
  it('validate: targetLevel εκτός 1-5 → throw', () => {
    expect(() => ratingScale.validateCriterionConfig({ targetLevel: 6, levelDescriptions: fullDescriptions })).toThrow()
    expect(() => ratingScale.validateCriterionConfig({ targetLevel: 0, levelDescriptions: fullDescriptions })).toThrow()
  })
  it('validate: λείπει έστω ΜΙΑ περιγραφή → throw (καμία εξαίρεση)', () => {
    const missing = { 1: 'Α', 2: 'Β', 3: 'Γ', 4: 'Δ', 5: '' }
    expect(() => ratingScale.validateCriterionConfig({ targetLevel: 4, levelDescriptions: missing })).toThrow()
  })
  it('generateCriterionText', () => {
    expect(ratingScale.generateCriterionText({ targetLevel: 3, levelDescriptions: fullDescriptions })).toBe('Επίπεδο 3 — «Γ»')
  })
})

describe('checklist', () => {
  it('validate: έγκυρο config δεν πετάει', () => {
    expect(() => checklist.validateCriterionConfig({ items: [{ id: 1, label: 'Α' }], targetCompletedCount: 1 })).not.toThrow()
  })
  it('validate: κενή λίστα στοιχείων → throw', () => {
    expect(() => checklist.validateCriterionConfig({ items: [], targetCompletedCount: 1 })).toThrow()
  })
  it('validate: στοιχείο χωρίς τίτλο → throw', () => {
    expect(() => checklist.validateCriterionConfig({ items: [{ id: 1, label: '' }], targetCompletedCount: 1 })).toThrow()
  })
  it('validate: μήνυμα ονομάζει ΤΗ ΣΥΓΚΕΚΡΙΜΕΝΗ γραμμή που λείπει (Στάδιο 7, διόρθωση χρήστη #2)', () => {
    expect(() => checklist.validateCriterionConfig({
      items: [{ id: 1, label: 'Α' }, { id: 2, label: 'Β' }, { id: 3, label: '' }],
      targetCompletedCount: 2
    })).toThrow('Το στοιχείο 3 χρειάζεται τίτλο.')
  })
  it('generateCriterionText', () => {
    expect(checklist.generateCriterionText({ items: [{ id: 1, label: 'Α' }, { id: 2, label: 'Β' }], targetCompletedCount: 1 }))
      .toBe('1 από 2 στοιχεία')
  })
})

describe('duration', () => {
  it('validate: έγκυρο config (χωρίς context) δεν πετάει', () => {
    expect(() => duration.validateCriterionConfig({ direction: 'increase', targetMinutes: 10 })).not.toThrow()
  })
  it('validate: χωρίς direction → throw', () => {
    expect(() => duration.validateCriterionConfig({ targetMinutes: 10 })).toThrow()
  })
  it('validate: targetMinutes αρνητικό → throw', () => {
    expect(() => duration.validateCriterionConfig({ direction: 'decrease', targetMinutes: -1 })).toThrow()
  })
  it('validate: targetMinutes === 0 ΕΠΙΤΡΕΠΕΤΑΙ όταν η κατεύθυνση είναι μείωση (πραγματικός στόχος)', () => {
    expect(() => duration.validateCriterionConfig({ direction: 'decrease', targetMinutes: 0 })).not.toThrow()
  })
  it('validate: targetMinutes === 0 ΑΠΟΡΡΙΠΤΕΤΑΙ όταν η κατεύθυνση είναι αύξηση — «αύξηση σε 0» δεν έχει νόημα (Στάδιο 5)', () => {
    expect(() => duration.validateCriterionConfig({ direction: 'increase', targetMinutes: 0 })).toThrow()
  })
  it('validate: targetMinutes αρνητικό ΑΠΟΡΡΙΠΤΕΤΑΙ και για τις δύο κατευθύνσεις', () => {
    expect(() => duration.validateCriterionConfig({ direction: 'increase', targetMinutes: -1 })).toThrow()
    expect(() => duration.validateCriterionConfig({ direction: 'decrease', targetMinutes: -1 })).toThrow()
  })
  it('generateCriterionText: increase/decrease + προαιρετικό context', () => {
    expect(duration.generateCriterionText({ direction: 'increase', targetMinutes: 10 })).toBe('Αύξηση σε τουλάχιστον 10′')
    expect(duration.generateCriterionText({ direction: 'decrease', targetMinutes: 5, context: 'ανά συνεδρία' }))
      .toBe('Μείωση σε το πολύ 5′ ανά συνεδρία')
  })
})

describe('frequency', () => {
  it('validate: έγκυρο config δεν πετάει', () => {
    expect(() => frequency.validateCriterionConfig({ direction: 'decrease', targetCount: 3 })).not.toThrow()
  })
  it('validate: άκυρη κατεύθυνση → throw', () => {
    expect(() => frequency.validateCriterionConfig({ direction: 'sideways', targetCount: 3 })).toThrow()
  })
  it('validate: targetCount αρνητικό ή μη ακέραιο → throw', () => {
    expect(() => frequency.validateCriterionConfig({ direction: 'decrease', targetCount: -1 })).toThrow()
    expect(() => frequency.validateCriterionConfig({ direction: 'decrease', targetCount: 1.5 })).toThrow()
  })
  it('validate: targetCount === 0 ΕΠΙΤΡΕΠΕΤΑΙ όταν η κατεύθυνση είναι μείωση (πραγματικός στόχος)', () => {
    expect(() => frequency.validateCriterionConfig({ direction: 'decrease', targetCount: 0 })).not.toThrow()
  })
  it('validate: targetCount === 0 ΑΠΟΡΡΙΠΤΕΤΑΙ όταν η κατεύθυνση είναι αύξηση — «αύξηση σε 0» δεν έχει νόημα (Στάδιο 5)', () => {
    expect(() => frequency.validateCriterionConfig({ direction: 'increase', targetCount: 0 })).toThrow()
  })
  it('validate: targetCount αρνητικό ΑΠΟΡΡΙΠΤΕΤΑΙ και για τις δύο κατευθύνσεις', () => {
    expect(() => frequency.validateCriterionConfig({ direction: 'increase', targetCount: -1 })).toThrow()
    expect(() => frequency.validateCriterionConfig({ direction: 'decrease', targetCount: -1 })).toThrow()
  })
  it('generateCriterionText', () => {
    expect(frequency.generateCriterionText({ direction: 'increase', targetCount: 3, context: 'ανά ημέρα' }))
      .toBe('Αύξηση σε τουλάχιστον 3 φορές ανά ημέρα')
  })

  // Bug report: «1 φορές» είναι λάθος ελληνικά — πρέπει «1 φορά» (ενικός), ΟΧΙ «φορές» (πληθυντικός).
  // Ισχύει και στο generateCriterionText (κριτήριο) ΚΑΙ στο formatRecordedValue (καταγεγραμμένη τιμή).
  it('generateCriterionText: ενικός για targetCount === 1, πληθυντικός αλλού (και για το 0)', () => {
    expect(frequency.generateCriterionText({ direction: 'increase', targetCount: 1, context: '' })).toBe('Αύξηση σε τουλάχιστον 1 φορά')
    expect(frequency.generateCriterionText({ direction: 'decrease', targetCount: 0, context: '' })).toBe('Μείωση σε το πολύ 0 φορές')
    expect(frequency.generateCriterionText({ direction: 'decrease', targetCount: 2, context: '' })).toBe('Μείωση σε το πολύ 2 φορές')
  })

  it('formatRecordedValue: ενικός για count === 1, πληθυντικός αλλού (και για το 0)', () => {
    expect(frequency.formatRecordedValue({ count: 1 })).toBe('1 φορά')
    expect(frequency.formatRecordedValue({ count: 0 })).toBe('0 φορές')
    expect(frequency.formatRecordedValue({ count: 4 })).toBe('4 φορές')
    expect(frequency.formatRecordedValue(null)).toBe('—')
  })
})

describe('narrative', () => {
  it('validate: μη κενή περιγραφή δεν πετάει', () => {
    expect(() => narrative.validateCriterionConfig({ successDescription: 'Συμμετέχει χωρίς παρότρυνση' })).not.toThrow()
  })
  it('validate: κενή/λευκή περιγραφή → throw', () => {
    expect(() => narrative.validateCriterionConfig({ successDescription: '   ' })).toThrow()
    expect(() => narrative.validateCriterionConfig({})).toThrow()
  })
  it('generateCriterionText: trim', () => {
    expect(narrative.generateCriterionText({ successDescription: '  Συμμετέχει  ' })).toBe('Συμμετέχει')
  })
  it('isEmptyRecordedValue: κενό/λευκό/άθικτο textarea → true, πραγματικό κείμενο → false (Στάδιο 8)', () => {
    expect(narrative.isEmptyRecordedValue(undefined)).toBe(true)
    expect(narrative.isEmptyRecordedValue({})).toBe(true)
    expect(narrative.isEmptyRecordedValue({ note: '' })).toBe(true)
    expect(narrative.isEmptyRecordedValue({ note: '   ' })).toBe(true)
    expect(narrative.isEmptyRecordedValue({ note: 'Συμμετείχε ενεργά' })).toBe(false)
  })
})

describe('registry (index.js)', () => {
  it('getMeasurementType επιστρέφει το σωστό module', () => {
    expect(getMeasurementType('duration').value).toBe('duration')
  })
  it('getMeasurementType άγνωστου τύπου → throw', () => {
    expect(() => getMeasurementType('telepathy')).toThrow()
  })
  it('listMeasurementTypes επιστρέφει και τους 8 τύπους, χωρίς διπλότυπα', () => {
    const types = listMeasurementTypes()
    expect(types).toHaveLength(8)
    expect(new Set(types.map((t) => t.value)).size).toBe(8)
  })
  it('validateCriterionConfig/generateCriterionText δρομολογούν στο σωστό module', () => {
    expect(() => validateCriterionConfig('successRatio', { targetSuccesses: 1, targetAttempts: 2 })).not.toThrow()
    expect(generateCriterionText('successRatio', { targetSuccesses: 1, targetAttempts: 2 })).toBe('1 από 2 προσπάθειες')
  })
  it('criterionConfig λάθος σχήματος (π.χ. duration πάνω σε ratingScale) απορρίπτεται φυσικά', () => {
    expect(() => validateCriterionConfig('ratingScale', { direction: 'increase', targetMinutes: 10 })).toThrow()
  })

  describe('isEmptyRecordedValue (Στάδιο 8)', () => {
    it('narrative: δρομολογεί στο δικό της module', () => {
      expect(isEmptyRecordedValue('narrative', { note: '' })).toBe(true)
      expect(isEmptyRecordedValue('narrative', { note: 'Κάτι' })).toBe(false)
    })
    it('τύποι ΧΩΡΙΣ δική τους isEmptyRecordedValue → πάντα false (π.χ. μετρητής στο 0 ΕΙΝΑΙ πραγματική καταγραφή)', () => {
      expect(isEmptyRecordedValue('successRatio', { successes: 0, attempts: 0 })).toBe(false)
      expect(isEmptyRecordedValue('frequency', { count: 0 })).toBe(false)
      expect(isEmptyRecordedValue('checklist', { completedItemIds: [] })).toBe(false)
    })
  })
})

// =================================================================================================
// Technical Plan Στάδιο 2 — computeProgressPercent / isNearCriterion / meetsCriterion ανά τύπο.
// Σύμβαση αποτελέσματος ΙΔΙΑ παντού: { computable: boolean, value: T | null } (εγκεκριμένο).
// =================================================================================================

describe('κοινή σύμβαση αποτελέσματος — { computable, value } ακριβώς, σε κάθε branch', () => {
  const cases = [
    ['successRatio', { successes: 8, attempts: 10 }, { criterionConfig: { targetSuccesses: 8, targetAttempts: 10 } }],
    ['successRatio', {}, {}], // not computable branch
    ['taskAnalysis', { completedStepIds: [1, 2] }, { criterionConfig: { steps: [{ id: 1, label: 'Α' }, { id: 2, label: 'Β' }], targetCompletedCount: 2 } }],
    ['promptLevel', { level: 'verbal' }, { criterionConfig: { targetLevel: 'independent' } }],
    ['ratingScale', { level: 3 }, { criterionConfig: { targetLevel: 4, levelDescriptions: { 1: 'Α', 2: 'Β', 3: 'Γ', 4: 'Δ', 5: 'Ε' } } }],
    ['checklist', { completedItemIds: [1] }, { criterionConfig: { items: [{ id: 1, label: 'Α' }, { id: 2, label: 'Β' }], targetCompletedCount: 2 } }],
    ['duration', { minutes: 10 }, { criterionConfig: { direction: 'increase', targetMinutes: 15 } }],
    ['frequency', { count: 2 }, { criterionConfig: { direction: 'decrease', targetCount: 3 } }],
    ['narrative', { note: 'κάτι' }, {}]
  ]

  for (const [type, value, context] of cases) {
    it(`${type}: computeProgressPercent/isNearCriterion/meetsCriterion επιστρέφουν ακριβώς { computable, value }`, () => {
      for (const result of [computeProgressPercent(type, value, context), isNearCriterion(type, value, context), meetsCriterion(type, value, context)]) {
        expect(Object.keys(result).sort()).toEqual(['computable', 'value'])
        expect(typeof result.computable).toBe('boolean')
        if (!result.computable) expect(result.value).toBe(null)
      }
    })
  }
})

describe('καθαρότητα — καμία μετάλλαξη του recorded value ή του context (criterionConfig/criterionText)', () => {
  it('successRatio', () => {
    const value = { successes: 8, attempts: 10 }
    const context = { criterionConfig: { targetSuccesses: 8, targetAttempts: 10 }, criterionText: null }
    const valueSnapshot = JSON.stringify(value)
    const contextSnapshot = JSON.stringify(context)
    computeProgressPercent('successRatio', value, context)
    isNearCriterion('successRatio', value, context)
    meetsCriterion('successRatio', value, context)
    expect(JSON.stringify(value)).toBe(valueSnapshot)
    expect(JSON.stringify(context)).toBe(contextSnapshot)
  })

  it('taskAnalysis (structured, array-shaped value)', () => {
    const value = { completedStepIds: [1, 2, 3] }
    const context = { criterionConfig: { steps: [{ id: 1, label: 'Α' }, { id: 2, label: 'Β' }, { id: 3, label: 'Γ' }, { id: 4, label: 'Δ' }], targetCompletedCount: 4 } }
    const valueSnapshot = JSON.stringify(value)
    const contextSnapshot = JSON.stringify(context)
    isNearCriterion('taskAnalysis', value, context)
    expect(JSON.stringify(value)).toBe(valueSnapshot)
    expect(JSON.stringify(context)).toBe(contextSnapshot)
  })
})

describe('successRatio — meetsCriterion/isNearCriterion (structured)', () => {
  const context = (targetSuccesses, targetAttempts) => ({ criterionConfig: { targetSuccesses, targetAttempts } })

  it('ακριβώς στο criterion (80%) → meets, ΟΧΙ near', () => {
    expect(meetsCriterion('successRatio', { successes: 8, attempts: 10 }, context(4, 5))).toEqual({ computable: true, value: true })
    expect(isNearCriterion('successRatio', { successes: 8, attempts: 10 }, context(4, 5))).toEqual({ computable: true, value: false })
  })

  it('πάνω από το criterion (90%) → meets, ΟΧΙ near', () => {
    expect(meetsCriterion('successRatio', { successes: 9, attempts: 10 }, context(4, 5))).toEqual({ computable: true, value: true })
    expect(isNearCriterion('successRatio', { successes: 9, attempts: 10 }, context(4, 5))).toEqual({ computable: true, value: false })
  })

  it('λίγο κάτω (75%, ≥90% του στόχου 80%) → near, ΟΧΙ meets', () => {
    expect(meetsCriterion('successRatio', { successes: 75, attempts: 100 }, context(4, 5))).toEqual({ computable: true, value: false })
    expect(isNearCriterion('successRatio', { successes: 75, attempts: 100 }, context(4, 5))).toEqual({ computable: true, value: true })
  })

  it('πολύ κάτω (70%, <72% κατώφλι) → ΟΥΤΕ meets ΟΥΤΕ near', () => {
    expect(meetsCriterion('successRatio', { successes: 70, attempts: 100 }, context(4, 5))).toEqual({ computable: true, value: false })
    expect(isNearCriterion('successRatio', { successes: 70, attempts: 100 }, context(4, 5))).toEqual({ computable: true, value: false })
  })

  it('άκυρη/ελλιπής τιμή (attempts:0, ή λείπει) → not computable', () => {
    expect(meetsCriterion('successRatio', { successes: 0, attempts: 0 }, context(4, 5))).toEqual({ computable: false, value: null })
    expect(isNearCriterion('successRatio', null, context(4, 5))).toEqual({ computable: false, value: null })
  })
})

describe('successRatio — legacy fallback (χωρίς criterionConfig, criterion 4/5 = 80% target)', () => {
  const legacyContext = { criterionText: '4/5' }

  it('70% → ΟΥΤΕ meets ΟΥΤΕ near (κάτω από το κατώφλι 72%)', () => {
    expect(meetsCriterion('successRatio', { successes: 70, attempts: 100 }, legacyContext)).toEqual({ computable: true, value: false })
    expect(isNearCriterion('successRatio', { successes: 70, attempts: 100 }, legacyContext)).toEqual({ computable: true, value: false })
  })

  it('72% → near (ακριβώς στο κατώφλι 80×0.9)', () => {
    expect(isNearCriterion('successRatio', { successes: 72, attempts: 100 }, legacyContext)).toEqual({ computable: true, value: true })
  })

  it('75% → near (το ρητό παράδειγμα του χρήστη — 75% είναι κοντά στο 80%, ΟΧΙ flat 90%)', () => {
    expect(meetsCriterion('successRatio', { successes: 75, attempts: 100 }, legacyContext)).toEqual({ computable: true, value: false })
    expect(isNearCriterion('successRatio', { successes: 75, attempts: 100 }, legacyContext)).toEqual({ computable: true, value: true })
  })

  it('80% → meets, ΟΧΙ near (έφτασε ακριβώς τον στόχο)', () => {
    expect(meetsCriterion('successRatio', { successes: 80, attempts: 100 }, legacyContext)).toEqual({ computable: true, value: true })
    expect(isNearCriterion('successRatio', { successes: 80, attempts: 100 }, legacyContext)).toEqual({ computable: true, value: false })
  })

  it('ασαφές legacy criterion (δεν parse-άρεται) → not computable, ΚΑΜΙΑ μαντεψιά', () => {
    const ambiguous = { criterionText: 'κάτι ασαφές χωρίς αριθμό' }
    expect(meetsCriterion('successRatio', { successes: 90, attempts: 100 }, ambiguous)).toEqual({ computable: false, value: null })
    expect(isNearCriterion('successRatio', { successes: 90, attempts: 100 }, ambiguous)).toEqual({ computable: false, value: null })
  })

  it('computeProgressPercent επιστρέφει την ΠΡΑΓΜΑΤΙΚΗ επίδοση, ΟΧΙ σχετική με τον στόχο', () => {
    expect(computeProgressPercent('successRatio', { successes: 60, attempts: 100 }, legacyContext)).toEqual({ computable: true, value: 60 })
  })
})

describe('taskAnalysis — meetsCriterion/isNearCriterion/computeProgressPercent (structured, targetCompletedCount < totalSteps)', () => {
  const config = { steps: [{ id: 1, label: 'Α' }, { id: 2, label: 'Β' }, { id: 3, label: 'Γ' }, { id: 4, label: 'Δ' }, { id: 5, label: 'Ε' }, { id: 6, label: 'Ζ' }], targetCompletedCount: 4 }
  const context = { criterionConfig: config }
  const completed = (n) => ({ completedStepIds: Array.from({ length: n }, (_, i) => i + 1) })

  it('λείπει ακριβώς 1 βήμα (3/4) → near, ΟΧΙ meets', () => {
    expect(meetsCriterion('taskAnalysis', completed(3), context)).toEqual({ computable: true, value: false })
    expect(isNearCriterion('taskAnalysis', completed(3), context)).toEqual({ computable: true, value: true })
  })

  it('λείπουν 2 βήματα (2/4) → ΟΥΤΕ meets ΟΥΤΕ near', () => {
    expect(meetsCriterion('taskAnalysis', completed(2), context)).toEqual({ computable: true, value: false })
    expect(isNearCriterion('taskAnalysis', completed(2), context)).toEqual({ computable: true, value: false })
  })

  it('ακριβώς στο criterion (4/4) → meets, ΟΧΙ near', () => {
    expect(meetsCriterion('taskAnalysis', completed(4), context)).toEqual({ computable: true, value: true })
    expect(isNearCriterion('taskAnalysis', completed(4), context)).toEqual({ computable: true, value: false })
  })

  it('πάνω από το criterion (6/6, όλα τα βήματα) → meets', () => {
    expect(meetsCriterion('taskAnalysis', completed(6), context)).toEqual({ computable: true, value: true })
  })

  it('progress προς το criterion (4), ΟΧΙ προς το σύνολο (6) — 2/4=50%, ΟΧΙ 2/6=33%', () => {
    expect(computeProgressPercent('taskAnalysis', completed(2), context)).toEqual({ computable: true, value: 50 })
  })

  it('progress στο criterion φτάνει 100%, κι ας μένουν βήματα εκτός criterion', () => {
    expect(computeProgressPercent('taskAnalysis', completed(4), context)).toEqual({ computable: true, value: 100 })
  })
})

describe('taskAnalysis — legacy fallback (criterion "10 βήματα", ίδιος κανόνας "λείπει ακριβώς 1")', () => {
  const legacyContext = { criterionText: '10 βήματα' }

  it('9/10 → near', () => {
    expect(isNearCriterion('taskAnalysis', { stepsCompleted: 9 }, legacyContext)).toEqual({ computable: true, value: true })
  })

  it('8/10 → ΟΥΤΕ near ΟΥΤΕ meets', () => {
    expect(isNearCriterion('taskAnalysis', { stepsCompleted: 8 }, legacyContext)).toEqual({ computable: true, value: false })
    expect(meetsCriterion('taskAnalysis', { stepsCompleted: 8 }, legacyContext)).toEqual({ computable: true, value: false })
  })

  it('ασαφές legacy criterion → not computable', () => {
    const ambiguous = { criterionText: 'κάτι ασαφές' }
    expect(isNearCriterion('taskAnalysis', { stepsCompleted: 9 }, ambiguous)).toEqual({ computable: false, value: null })
  })
})

describe('promptLevel — meetsCriterion/isNearCriterion (structured), computeProgressPercent πάντα not computable', () => {
  const context = { criterionConfig: { targetLevel: 'independent' } }

  it('μία βαθμίδα πριν (verbal έναντι στόχου independent) → near, ΟΧΙ meets', () => {
    expect(meetsCriterion('promptLevel', { level: 'verbal' }, context)).toEqual({ computable: true, value: false })
    expect(isNearCriterion('promptLevel', { level: 'verbal' }, context)).toEqual({ computable: true, value: true })
  })

  it('δύο βαθμίδες πριν (physical έναντι στόχου independent) → ΟΥΤΕ near ΟΥΤΕ meets', () => {
    expect(isNearCriterion('promptLevel', { level: 'physical' }, context)).toEqual({ computable: true, value: false })
  })

  it('ήδη στον στόχο (independent) → meets, ΟΧΙ near', () => {
    expect(meetsCriterion('promptLevel', { level: 'independent' }, context)).toEqual({ computable: true, value: true })
    expect(isNearCriterion('promptLevel', { level: 'independent' }, context)).toEqual({ computable: true, value: false })
  })

  it('computeProgressPercent πάντα not computable — καμία αναλογία (διαβάθμιση, όχι ποσοστό)', () => {
    expect(computeProgressPercent('promptLevel', { level: 'independent' }, context)).toEqual({ computable: false, value: null })
  })

  it('legacy: criterion "Ανεξάρτητα" → ίδιος κανόνας μέσω parseCriterionTarget', () => {
    const legacyContext = { criterionText: 'Ανεξάρτητα' }
    expect(isNearCriterion('promptLevel', { level: 'verbal' }, legacyContext)).toEqual({ computable: true, value: true })
    expect(meetsCriterion('promptLevel', { level: 'independent' }, legacyContext)).toEqual({ computable: true, value: true })
    expect(isNearCriterion('promptLevel', { level: 'independent' }, legacyContext)).toEqual({ computable: true, value: false }) // πριν: λανθασμένα "near" μέσω ψευδο-ποσοστού 100%
  })
})

describe('ratingScale — meetsCriterion/isNearCriterion, computeProgressPercent πάντα not computable', () => {
  const context = { criterionConfig: { targetLevel: 5, levelDescriptions: { 1: 'Α', 2: 'Β', 3: 'Γ', 4: 'Δ', 5: 'Ε' } } }

  it('«4» όταν ο στόχος είναι «5» → near, ΟΧΙ meets (το ρητό παράδειγμα του Product Design)', () => {
    expect(meetsCriterion('ratingScale', { level: 4 }, context)).toEqual({ computable: true, value: false })
    expect(isNearCriterion('ratingScale', { level: 4 }, context)).toEqual({ computable: true, value: true })
  })

  it('«3» όταν ο στόχος είναι «5» → ΟΥΤΕ near ΟΥΤΕ meets (απέχει 2 βαθμίδες)', () => {
    expect(isNearCriterion('ratingScale', { level: 3 }, context)).toEqual({ computable: true, value: false })
  })

  it('«5» → meets, ΟΧΙ near', () => {
    expect(meetsCriterion('ratingScale', { level: 5 }, context)).toEqual({ computable: true, value: true })
    expect(isNearCriterion('ratingScale', { level: 5 }, context)).toEqual({ computable: true, value: false })
  })

  it('άκυρη τιμή (εκτός 1-5) → not computable', () => {
    expect(meetsCriterion('ratingScale', { level: 0 }, context)).toEqual({ computable: false, value: null })
    expect(meetsCriterion('ratingScale', { level: 6 }, context)).toEqual({ computable: false, value: null })
  })

  it('computeProgressPercent πάντα not computable', () => {
    expect(computeProgressPercent('ratingScale', { level: 5 }, context)).toEqual({ computable: false, value: null })
  })
})

describe('checklist — targetCompletedCount < totalItems', () => {
  const config = { items: [{ id: 1, label: 'Α' }, { id: 2, label: 'Β' }, { id: 3, label: 'Γ' }, { id: 4, label: 'Δ' }, { id: 5, label: 'Ε' }, { id: 6, label: 'Ζ' }], targetCompletedCount: 5 }
  const context = { criterionConfig: config }
  const completed = (n) => ({ completedItemIds: Array.from({ length: n }, (_, i) => i + 1) })

  it('λείπει ακριβώς 1 στοιχείο (4/5) → near', () => {
    expect(isNearCriterion('checklist', completed(4), context)).toEqual({ computable: true, value: true })
  })

  it('ακριβώς στο criterion (5/5, ενώ σύνολο 6) → meets, progress 100%', () => {
    expect(meetsCriterion('checklist', completed(5), context)).toEqual({ computable: true, value: true })
    expect(computeProgressPercent('checklist', completed(5), context)).toEqual({ computable: true, value: 100 })
  })

  it('3/5 → progress 60%, ΟΥΤΕ meets ΟΥΤΕ near', () => {
    expect(computeProgressPercent('checklist', completed(3), context)).toEqual({ computable: true, value: 60 })
    expect(isNearCriterion('checklist', completed(3), context)).toEqual({ computable: true, value: false })
  })

  it('όλα τα στοιχεία (6/6) → meets', () => {
    expect(meetsCriterion('checklist', completed(6), context)).toEqual({ computable: true, value: true })
  })
})

describe('duration — margin = max(1, targetMinutes×10%), στόχος 15 (αύξηση)', () => {
  const context = { criterionConfig: { direction: 'increase', targetMinutes: 15 } }

  it('ακριβώς στο criterion (15) → meets, ΟΧΙ near', () => {
    expect(meetsCriterion('duration', { minutes: 15 }, context)).toEqual({ computable: true, value: true })
    expect(isNearCriterion('duration', { minutes: 15 }, context)).toEqual({ computable: true, value: false })
  })

  it('λίγο κάτω, εντός περιθωρίου (14, tolerance 1.5) → near', () => {
    expect(meetsCriterion('duration', { minutes: 14 }, context)).toEqual({ computable: true, value: false })
    expect(isNearCriterion('duration', { minutes: 14 }, context)).toEqual({ computable: true, value: true })
  })

  it('πολύ κάτω, εκτός περιθωρίου (10) → ΟΥΤΕ meets ΟΥΤΕ near', () => {
    expect(isNearCriterion('duration', { minutes: 10 }, context)).toEqual({ computable: true, value: false })
  })

  it('πάνω από το criterion, κατεύθυνση αύξησης (20) → meets, ΟΧΙ near', () => {
    expect(meetsCriterion('duration', { minutes: 20 }, context)).toEqual({ computable: true, value: true })
    expect(isNearCriterion('duration', { minutes: 20 }, context)).toEqual({ computable: true, value: false })
  })
})

describe('duration — margin = max(1, targetMinutes×10%), στόχος 10 (μείωση)', () => {
  const context = { criterionConfig: { direction: 'decrease', targetMinutes: 10 } }

  it('ακριβώς στο criterion (10) → meets', () => {
    expect(meetsCriterion('duration', { minutes: 10 }, context)).toEqual({ computable: true, value: true })
  })

  it('λίγο πάνω, εντός περιθωρίου (11) → near', () => {
    expect(isNearCriterion('duration', { minutes: 11 }, context)).toEqual({ computable: true, value: true })
  })

  it('πολύ πάνω, εκτός περιθωρίου (15) → ΟΥΤΕ meets ΟΥΤΕ near', () => {
    expect(isNearCriterion('duration', { minutes: 15 }, context)).toEqual({ computable: true, value: false })
  })

  it('κάτω από το criterion, κατεύθυνση μείωσης (5) → meets (καλύτερα από το απαιτούμενο)', () => {
    expect(meetsCriterion('duration', { minutes: 5 }, context)).toEqual({ computable: true, value: true })
  })
})

describe('duration — μικρός στόχος (5 λεπτά, ελάχιστο πρακτικό περιθώριο 1 λεπτό)', () => {
  const context = { criterionConfig: { direction: 'increase', targetMinutes: 5 } }

  it('4 (10% του 5 θα ήταν 0.5, αλλά το ελάχιστο 1 λεπτό ισχύει) → near', () => {
    expect(isNearCriterion('duration', { minutes: 4 }, context)).toEqual({ computable: true, value: true })
  })

  it('3 (εκτός του πρακτικού περιθωρίου 1 λεπτού) → ΟΧΙ near', () => {
    expect(isNearCriterion('duration', { minutes: 3 }, context)).toEqual({ computable: true, value: false })
  })
})

describe('duration — στόχος 0 (μείωση σε 0 λεπτά)', () => {
  const context = { criterionConfig: { direction: 'decrease', targetMinutes: 0 } }

  it('0 → meets', () => {
    expect(meetsCriterion('duration', { minutes: 0 }, context)).toEqual({ computable: true, value: true })
  })

  it('1 (εντός του ελάχιστου περιθωρίου 1) → near', () => {
    expect(isNearCriterion('duration', { minutes: 1 }, context)).toEqual({ computable: true, value: true })
  })

  it('3 → ΟΧΙ near', () => {
    expect(isNearCriterion('duration', { minutes: 3 }, context)).toEqual({ computable: true, value: false })
  })
})

describe('duration — legacy πάντα not computable (καμία κατεύθυνση σε ελεύθερο κείμενο)', () => {
  it('meetsCriterion/isNearCriterion/computeProgressPercent', () => {
    const legacyContext = { criterionText: '20 λεπτά' }
    expect(meetsCriterion('duration', { minutes: 20 }, legacyContext)).toEqual({ computable: false, value: null })
    expect(isNearCriterion('duration', { minutes: 20 }, legacyContext)).toEqual({ computable: false, value: null })
    expect(computeProgressPercent('duration', { minutes: 20 }, legacyContext)).toEqual({ computable: false, value: null })
  })
})

describe('frequency — near = ακριβώς 1 καταμέτρηση, ΟΧΙ ποσοστιαίο περιθώριο', () => {
  it('στόχος αύξησης 5: count=4 → near, count=3 → ΟΧΙ near, count=6 → meets', () => {
    const context = { criterionConfig: { direction: 'increase', targetCount: 5 } }
    expect(isNearCriterion('frequency', { count: 4 }, context)).toEqual({ computable: true, value: true })
    expect(isNearCriterion('frequency', { count: 3 }, context)).toEqual({ computable: true, value: false })
    expect(meetsCriterion('frequency', { count: 6 }, context)).toEqual({ computable: true, value: true })
  })

  it('στόχος μείωσης σε 0 (πραγματικός στόχος): count=1 → near, count=0 → meets, count=2 → ΟΧΙ near', () => {
    const context = { criterionConfig: { direction: 'decrease', targetCount: 0 } }
    expect(meetsCriterion('frequency', { count: 0 }, context)).toEqual({ computable: true, value: true })
    expect(isNearCriterion('frequency', { count: 1 }, context)).toEqual({ computable: true, value: true })
    expect(isNearCriterion('frequency', { count: 2 }, context)).toEqual({ computable: true, value: false })
  })

  it('στόχος μείωσης σε 1: count=0 → meets (καλύτερα), count=2 → near, count=1 → meets', () => {
    const context = { criterionConfig: { direction: 'decrease', targetCount: 1 } }
    expect(meetsCriterion('frequency', { count: 0 }, context)).toEqual({ computable: true, value: true })
    expect(meetsCriterion('frequency', { count: 1 }, context)).toEqual({ computable: true, value: true })
    expect(isNearCriterion('frequency', { count: 2 }, context)).toEqual({ computable: true, value: true })
  })

  it('χωρίς criterionConfig (καμία legacy υπόσταση για frequency) → not computable', () => {
    expect(meetsCriterion('frequency', { count: 1 }, {})).toEqual({ computable: false, value: null })
  })

  it('computeProgressPercent πάντα not computable', () => {
    expect(computeProgressPercent('frequency', { count: 3 }, { criterionConfig: { direction: 'increase', targetCount: 5 } })).toEqual({ computable: false, value: null })
  })
})

describe('narrative — πάντα not computable, ό,τι κι αν περαστεί (④ ρητή απόφαση χρήστη)', () => {
  it('computeProgressPercent/isNearCriterion/meetsCriterion', () => {
    const context = { criterionConfig: { successDescription: 'Κάτι' } }
    expect(computeProgressPercent('narrative', { note: 'καλά' }, context)).toEqual({ computable: false, value: null })
    expect(isNearCriterion('narrative', { note: 'καλά' }, context)).toEqual({ computable: false, value: null })
    expect(meetsCriterion('narrative', { note: 'καλά' }, context)).toEqual({ computable: false, value: null })
  })
})

// Sprint 7 feedback χρήστη (widget «Χρειάζονται προσοχή») — αντί για τη γενική ετικέτα «Κοντά στο
// κριτήριο», κάθε τύπος περιγράφει ΤΗΝ ΑΚΡΙΒΗ απόσταση από τον στόχο. Κάθε test παρακάτω
// χρησιμοποιεί ΤΙΣ ΙΔΙΕΣ τιμές/contexts με τα αντίστοιχα isNearCriterion:true tests παραπάνω —
// describeNearCriterion καλείται ΜΟΝΟ όταν είναι ήδη γνωστό ότι είναι near, ποτέ ανεξάρτητα.
describe('describeNearCriterion — τυπο-ειδικές, actionable περιγραφές', () => {
  it('successRatio: ποσοστό επιτυχίας (structured ΚΑΙ legacy)', () => {
    expect(describeNearCriterion('successRatio', { successes: 75, attempts: 100 }, { criterionConfig: { targetSuccesses: 4, targetAttempts: 5 } })).toBe('75% επιτυχία')
    expect(describeNearCriterion('successRatio', { successes: 72, attempts: 100 }, { criterionText: '4/5' })).toBe('72% επιτυχία')
  })

  it('taskAnalysis: «Απομένει 1 βήμα για επίτευξη» (near σημαίνει πάντα ακριβώς 1)', () => {
    const config = { steps: [{ id: 1, label: 'Α' }, { id: 2, label: 'Β' }, { id: 3, label: 'Γ' }, { id: 4, label: 'Δ' }], targetCompletedCount: 4 }
    const completed3 = { completedStepIds: [1, 2, 3] }
    expect(describeNearCriterion('taskAnalysis', completed3, { criterionConfig: config })).toBe('Απομένει 1 βήμα για επίτευξη')
  })

  it('checklist: «Απομένει 1 στοιχείο για επίτευξη»', () => {
    const config = { items: [{ id: 1, label: 'Α' }, { id: 2, label: 'Β' }, { id: 3, label: 'Γ' }, { id: 4, label: 'Δ' }, { id: 5, label: 'Ε' }, { id: 6, label: 'Ζ' }], targetCompletedCount: 5 }
    const completed4 = { completedItemIds: [1, 2, 3, 4] }
    expect(describeNearCriterion('checklist', completed4, { criterionConfig: config })).toBe('Απομένει 1 στοιχείο για επίτευξη')
  })

  it('ratingScale: «Απομένει 1 βαθμίδα για επίτευξη»', () => {
    const context = { criterionConfig: { targetLevel: 5, levelDescriptions: { 1: 'Α', 2: 'Β', 3: 'Γ', 4: 'Δ', 5: 'Ε' } } }
    expect(describeNearCriterion('ratingScale', { level: 4 }, context)).toBe('Απομένει 1 βαθμίδα για επίτευξη')
  })

  it('promptLevel: «Απομένει 1 βαθμίδα υποστήριξης για επίτευξη»', () => {
    const context = { criterionConfig: { targetLevel: 'independent' } }
    expect(describeNearCriterion('promptLevel', { level: 'verbal' }, context)).toBe('Απομένει 1 βαθμίδα υποστήριξης για επίτευξη')
  })

  it('frequency: κατεύθυνση-ευαίσθητο κείμενο (αύξηση: λείπει καταγραφή· μείωση: μία παραπάνω)', () => {
    expect(describeNearCriterion('frequency', { count: 4 }, { criterionConfig: { direction: 'increase', targetCount: 5 } })).toBe('Απομένει 1 καταγραφή για επίτευξη')
    expect(describeNearCriterion('frequency', { count: 1 }, { criterionConfig: { direction: 'decrease', targetCount: 0 } })).toBe('Χρειάζεται μείωση κατά 1 ακόμη για επίτευξη')
  })

  it('duration: πραγματικά λεπτά που απομένουν/περισσεύουν (ΟΧΙ πάντα ακριβώς 1, tolerance-based)', () => {
    // Ενικός (ακριβώς 1 λεπτό).
    expect(describeNearCriterion('duration', { minutes: 14 }, { criterionConfig: { direction: 'increase', targetMinutes: 15 } })).toBe('Απομένει 1 λεπτό για επίτευξη')
    expect(describeNearCriterion('duration', { minutes: 11 }, { criterionConfig: { direction: 'decrease', targetMinutes: 10 } })).toBe('1 λεπτό πάνω από τον στόχο')
    // Πληθυντικός (μεγαλύτερος στόχος → μεγαλύτερο tolerance περιθώριο, βλ. toleranceFor).
    expect(describeNearCriterion('duration', { minutes: 91 }, { criterionConfig: { direction: 'increase', targetMinutes: 100 } })).toBe('Απομένουν 9 λεπτά για επίτευξη')
    expect(describeNearCriterion('duration', { minutes: 109 }, { criterionConfig: { direction: 'decrease', targetMinutes: 100 } })).toBe('9 λεπτά πάνω από τον στόχο')
  })

  it('narrative: δεν υποστηρίζει near-criterion καθόλου → πάντα null (registry: προαιρετική ικανότητα)', () => {
    expect(describeNearCriterion('narrative', { note: 'καλά' }, { criterionConfig: { successDescription: 'Κάτι' } })).toBe(null)
  })
})
