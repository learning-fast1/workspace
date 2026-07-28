import { describe, expect, it } from 'vitest'
import {
  GRID_FALLBACK_START_HOUR,
  GRID_FALLBACK_END_HOUR,
  GRID_BOUNDS_PADDING_MINUTES,
  GRID_MIN_BLOCK_MINUTES,
  computeWeeklyBounds,
  hourMarks,
  computeDayBlocks,
  computeWeekGridLayout
} from './scheduleGridLayout.js'

function slot({ id, seriesId, dayOfWeek = 1, startTime, durationMinutes }) {
  return { id, seriesId: seriesId ?? id, dayOfWeek, startTime, durationMinutes }
}

describe('computeWeeklyBounds', () => {
  it('fallback range όταν δεν υπάρχει κανένα slot', () => {
    const bounds = computeWeeklyBounds([])
    expect(bounds.startMinutes).toBe(GRID_FALLBACK_START_HOUR * 60)
    expect(bounds.endMinutes).toBe(GRID_FALLBACK_END_HOUR * 60)
  })

  it('στρογγυλοποιεί σε ολόκληρη ώρα ΚΑΙ προσθέτει το σταθερό padding', () => {
    const slots = [slot({ id: 1, startTime: '08:10', durationMinutes: 30 })]
    const bounds = computeWeeklyBounds(slots)
    // earliest start 08:10 → round down → 08:00 → -padding
    expect(bounds.startMinutes).toBe(8 * 60 - GRID_BOUNDS_PADDING_MINUTES)
    // end 08:40 → round up → 09:00 → +padding
    expect(bounds.endMinutes).toBe(9 * 60 + GRID_BOUNDS_PADDING_MINUTES)
  })

  it('χρησιμοποιεί το νωρίτερο start ΚΑΙ το αργότερο end ανάμεσα σε ΟΛΕΣ τις ημέρες (κοινός άξονας)', () => {
    const slots = [
      slot({ id: 1, dayOfWeek: 1, startTime: '10:00', durationMinutes: 30 }),
      slot({ id: 2, dayOfWeek: 3, startTime: '07:30', durationMinutes: 30 }),
      slot({ id: 3, dayOfWeek: 5, startTime: '15:00', durationMinutes: 90 })
    ]
    const bounds = computeWeeklyBounds(slots)
    expect(bounds.startMinutes).toBe(7 * 60 - GRID_BOUNDS_PADDING_MINUTES)
    expect(bounds.endMinutes).toBe(17 * 60 + GRID_BOUNDS_PADDING_MINUTES) // 15:00+90'=16:30 → round up 17:00
  })

  it('δεν ξεπερνάει ποτέ τα όρια της ημέρας (clamped στο [0, 1440])', () => {
    const slots = [slot({ id: 1, startTime: '00:00', durationMinutes: 30 }), slot({ id: 2, startTime: '23:50', durationMinutes: 30 })]
    const bounds = computeWeeklyBounds(slots)
    expect(bounds.startMinutes).toBeGreaterThanOrEqual(0)
    expect(bounds.endMinutes).toBeLessThanOrEqual(24 * 60)
  })
})

describe('hourMarks', () => {
  it('παράγει ετικέτες ΜΟΝΟ σε ολόκληρες ώρες μέσα στο εύρος', () => {
    const marks = hourMarks({ startMinutes: 7 * 60 + 30, endMinutes: 10 * 60 + 30 })
    expect(marks.map((m) => m.label)).toEqual(['08:00', '09:00', '10:00'])
  })
})

describe('computeDayBlocks', () => {
  const bounds = { startMinutes: 8 * 60, endMinutes: 16 * 60 }

  it('ένα μοναχικό slot παίρνει όλο το πλάτος (columnCount 1)', () => {
    const blocks = computeDayBlocks([slot({ id: 1, startTime: '09:00', durationMinutes: 30 })], bounds)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].columnCount).toBe(1)
    expect(blocks[0].columnIndex).toBe(0)
    expect(blocks[0].topMinutes).toBe(60) // 09:00 - 08:00
    expect(blocks[0].heightMinutes).toBe(30)
  })

  it('πολύ σύντομο slot παίρνει ΕΛΑΧΙΣΤΟ οπτικό ύψος, ΧΩΡΙΣ να αλλάζει το πραγματικό durationMinutes', () => {
    const blocks = computeDayBlocks([slot({ id: 1, startTime: '09:00', durationMinutes: 5 })], bounds)
    expect(blocks[0].heightMinutes).toBe(GRID_MIN_BLOCK_MINUTES)
    expect(blocks[0].slot.durationMinutes).toBe(5) // το πραγματικό πεδίο ΑΝΑΛΛΟΙΩΤΟ, για το aria-label
  })

  it('δύο διαδοχικά slots που απλά ακουμπούν (end === next start) ΔΕΝ θεωρούνται επικαλυπτόμενα', () => {
    const blocks = computeDayBlocks(
      [slot({ id: 1, startTime: '09:00', durationMinutes: 30 }), slot({ id: 2, startTime: '09:30', durationMinutes: 30 })],
      bounds
    )
    expect(blocks.every((b) => b.columnCount === 1)).toBe(true)
  })

  it('δύο επικαλυπτόμενα slots μοιράζονται το πλάτος 50/50, καμία εμφάνιση πλήρους κάλυψης', () => {
    const blocks = computeDayBlocks(
      [slot({ id: 1, startTime: '09:00', durationMinutes: 30 }), slot({ id: 2, startTime: '09:15', durationMinutes: 30 })],
      bounds
    )
    expect(blocks.every((b) => b.columnCount === 2)).toBe(true)
    expect(new Set(blocks.map((b) => b.columnIndex))).toEqual(new Set([0, 1]))
  })

  it('τρία αμοιβαία επικαλυπτόμενα slots μοιράζονται σε ΤΡΕΙΣ ίσες στήλες', () => {
    const blocks = computeDayBlocks(
      [
        slot({ id: 1, startTime: '09:00', durationMinutes: 60 }),
        slot({ id: 2, startTime: '09:10', durationMinutes: 60 }),
        slot({ id: 3, startTime: '09:20', durationMinutes: 60 })
      ],
      bounds
    )
    expect(blocks.every((b) => b.columnCount === 3)).toBe(true)
  })

  it('μεταβατικό (transitive) cluster — Α-Β επικαλύπτονται, Β-Γ επικαλύπτονται, Α-Γ ΔΕΝ επικαλύπτονται απευθείας, αλλά μπαίνουν ΣΤΟ ΙΔΙΟ cluster', () => {
    const blocks = computeDayBlocks(
      [
        slot({ id: 1, startTime: '09:00', durationMinutes: 30 }), // 09:00-09:30
        slot({ id: 2, startTime: '09:15', durationMinutes: 30 }), // 09:15-09:45, επικαλύπτει Α και Γ
        slot({ id: 3, startTime: '09:40', durationMinutes: 30 })  // 09:40-10:10, ΔΕΝ επικαλύπτει Α απευθείας
      ],
      bounds
    )
    expect(blocks.every((b) => b.columnCount === 3)).toBe(true)
  })

  it('deterministic tie-breaker (seriesId) όταν δύο slots ξεκινούν ΑΚΡΙΒΩΣ την ίδια ώρα', () => {
    const blocks = computeDayBlocks(
      [slot({ id: 1, seriesId: 20, startTime: '09:00', durationMinutes: 30 }), slot({ id: 2, seriesId: 10, startTime: '09:00', durationMinutes: 30 })],
      bounds
    )
    const bySeriesId = [...blocks].sort((a, b) => a.slot.seriesId - b.slot.seriesId)
    expect(blocks[0].slot.seriesId).toBe(bySeriesId[0].slot.seriesId)
    expect(blocks[0].columnIndex).toBe(0)
    expect(blocks[1].columnIndex).toBe(1)
  })

  it('κενή ημέρα → κενό array, καμία εξαίρεση', () => {
    expect(computeDayBlocks([], bounds)).toEqual([])
  })
})

describe('computeWeekGridLayout', () => {
  it('υπολογίζει bounds ΚΑΙ blocks ανά ημέρα σε ΜΙΑ κλήση, ίδια bounds για όλες τις ημέρες', () => {
    const slots = [
      slot({ id: 1, dayOfWeek: 1, startTime: '09:00', durationMinutes: 30 }),
      slot({ id: 2, dayOfWeek: 2, startTime: '09:00', durationMinutes: 30 })
    ]
    const layout = computeWeekGridLayout(slots, [1, 2, 3])
    expect(layout.blocksByDay[1]).toHaveLength(1)
    expect(layout.blocksByDay[2]).toHaveLength(1)
    expect(layout.blocksByDay[3]).toEqual([])
    expect(layout.bounds).toBeDefined()
  })
})
