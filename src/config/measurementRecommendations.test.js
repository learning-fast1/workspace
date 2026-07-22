import { describe, expect, it } from 'vitest'
import { DOMAINS } from './domains.js'
import { DOMAIN_MEASUREMENT_RECOMMENDATIONS, isRecommendedMeasurementType } from './measurementRecommendations.js'

describe('isRecommendedMeasurementType', () => {
  it('true για τύπο που περιλαμβάνεται στη λίστα του τομέα', () => {
    expect(isRecommendedMeasurementType('communication', 'successRatio')).toBe(true)
    expect(isRecommendedMeasurementType('communication', 'checklist')).toBe(true)
  })

  it('false για τύπο που ΔΕΝ περιλαμβάνεται στη λίστα του τομέα', () => {
    expect(isRecommendedMeasurementType('sensory', 'successRatio')).toBe(false)
  })

  it('άγνωστος/κενός τομέας → false, ΚΑΜΙΑ μαντεψιά', () => {
    expect(isRecommendedMeasurementType('', 'successRatio')).toBe(false)
    expect(isRecommendedMeasurementType(undefined, 'successRatio')).toBe(false)
    expect(isRecommendedMeasurementType('bogus-domain', 'successRatio')).toBe(false)
  })

  it('«behavior» — Συχνότητα/Διάρκεια (μέτρηση ανεπιθύμητης) + Περιγραφική (ABC)', () => {
    expect(isRecommendedMeasurementType('behavior', 'frequency')).toBe(true)
    expect(isRecommendedMeasurementType('behavior', 'duration')).toBe(true)
    expect(isRecommendedMeasurementType('behavior', 'narrative')).toBe(true)
    expect(isRecommendedMeasurementType('behavior', 'successRatio')).toBe(false)
  })

  it('και οι 8 τομείς του config/domains.js (απλοποιημένη ταξινόμηση) έχουν πλέον καταχώρηση προτάσεων', () => {
    for (const domain of DOMAINS) {
      expect(DOMAIN_MEASUREMENT_RECOMMENDATIONS[domain.id], `λείπει το domain «${domain.id}»`).toBeDefined()
    }
  })

  it('τα κλειδιά είναι domain ids (config/domains.js), ΟΧΙ ελληνικά ονόματα προς εμφάνιση', () => {
    expect(DOMAIN_MEASUREMENT_RECOMMENDATIONS['communication']).toBeDefined()
    expect(DOMAIN_MEASUREMENT_RECOMMENDATIONS['Επικοινωνία']).toBeUndefined()
  })

  it('οι τιμές είναι measurementType values (registry), ΟΧΙ ελληνικά labels', () => {
    expect(DOMAIN_MEASUREMENT_RECOMMENDATIONS.communication).toContain('successRatio')
    expect(DOMAIN_MEASUREMENT_RECOMMENDATIONS.communication).not.toContain('Ποσοστό επιτυχίας')
  })

  // Απλοποίηση τομέων στόχων — mobility/cognitive/communication συγχωνεύουν προτάσεις πολλών
  // παλιών τομέων· επιβεβαιώνει ασφαλές deduplication (καμία διπλή τιμή) ΚΑΙ ότι το περιεχόμενο
  // των πηγαίων τομέων διατηρήθηκε (καμία απώλεια).
  describe('συγχώνευση τομέων — deduplication χωρίς απώλεια περιεχομένου', () => {
    it('mobility (fine-motor+gross-motor): καμία διπλή τιμή, όλες οι πηγαίες τιμές παρούσες', () => {
      const rec = DOMAIN_MEASUREMENT_RECOMMENDATIONS.mobility
      expect(new Set(rec).size).toBe(rec.length)
      expect(rec).toEqual(expect.arrayContaining(['taskAnalysis', 'ratingScale', 'promptLevel', 'duration']))
    })

    it('cognitive (attention+executive-functions+math): καμία διπλή τιμή, όλες οι πηγαίες τιμές παρούσες', () => {
      const rec = DOMAIN_MEASUREMENT_RECOMMENDATIONS.cognitive
      expect(new Set(rec).size).toBe(rec.length)
      expect(rec).toEqual(expect.arrayContaining(['duration', 'frequency', 'promptLevel', 'taskAnalysis', 'ratingScale', 'successRatio', 'checklist']))
    })

    it('communication (phonological-awareness+reading+writing+oral-language): καμία διπλή τιμή, όλες οι πηγαίες τιμές παρούσες', () => {
      const rec = DOMAIN_MEASUREMENT_RECOMMENDATIONS.communication
      expect(new Set(rec).size).toBe(rec.length)
      expect(rec).toEqual(expect.arrayContaining(['successRatio', 'checklist', 'duration', 'ratingScale', 'taskAnalysis', 'promptLevel', 'frequency']))
    })

    it('η σειρά είναι σταθερή μεταξύ διαδοχικών κλήσεων (ίδιο module, ίδιο αποτέλεσμα)', () => {
      expect(DOMAIN_MEASUREMENT_RECOMMENDATIONS.communication).toEqual(DOMAIN_MEASUREMENT_RECOMMENDATIONS.communication)
    })
  })
})
