// Phase 2 — Weekly Grid (δεύτερη όψη μέσα στο SchedulePage). Καθαρές συναρτήσεις πάνω σε ήδη
// φορτωμένα scheduleSlots — ΚΑΜΙΑ Dexie query εδώ (ίδιο idiom με utils/scheduleResolution.js).
// Το Grid δείχνει το ΤΡΕΧΟΝ template (SchedulePage's currentSlots) — ΔΕΝ διαβάζει ποτέ
// scheduleExceptions και ΔΕΝ περνάει από τον occurrence resolver, οπότε date-specific εξαιρέσεις
// δεν μπορούν καν να επηρεάσουν αυτό που υπολογίζεται εδώ.

// Fallback εύρος όταν η εβδομάδα δεν έχει ΚΑΝΕΝΑ slot (κενό πρόγραμμα) — λογικό σχολικό ωράριο.
export const GRID_FALLBACK_START_HOUR = 8
export const GRID_FALLBACK_END_HOUR = 16

// Μικρό, σταθερό «αναπνοή» πριν/μετά το στρογγυλοποιημένο εύρος ωρών — ώστε το πρώτο/τελευταίο
// slot να μην κολλάει στην άκρη του πλέγματος.
export const GRID_BOUNDS_PADDING_MINUTES = 30

// Layout measurement — πόσα pixels αντιστοιχούν σε ένα λεπτό (72px/ώρα). Μοναδική πηγή αλήθειας
// για τη μετατροπή λεπτών→pixels, ώστε το component να μην κουβαλάει δικό του magic number.
export const GRID_PIXELS_PER_MINUTE = 1.2

// Ελάχιστο ΟΠΤΙΚΟ ύψος (σε λεπτά-ισοδύναμο) για πολύ σύντομα slots — ΜΟΝΟ για το ύψος του block,
// ΠΟΤΕ για το πραγματικό durationMinutes (που παραμένει ακέραιο για το aria-label, βλ.
// computeDayBlocks παρακάτω).
export const GRID_MIN_BLOCK_MINUTES = 20

const MINUTES_PER_HOUR = 60
const MINUTES_PER_DAY = 24 * 60

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * MINUTES_PER_HOUR + m
}

function roundDownToHour(minutes) {
  return Math.floor(minutes / MINUTES_PER_HOUR) * MINUTES_PER_HOUR
}

function roundUpToHour(minutes) {
  return Math.ceil(minutes / MINUTES_PER_HOUR) * MINUTES_PER_HOUR
}

// Δυναμικό εβδομαδιαίο εύρος (review χρήστη, σημείο 6): νωρίτερο start / αργότερο end ΟΛΩΝ των
// slots (ανεξάρτητα ημέρας — ΚΟΙΝΟΣ άξονας σε όλες τις στήλες desktop), στρογγυλοποιημένο σε
// ολόκληρη ώρα, μετά padding. Άδεια εβδομάδα → σαφές fallback.
export function computeWeeklyBounds(slots) {
  if (slots.length === 0) {
    return { startMinutes: GRID_FALLBACK_START_HOUR * MINUTES_PER_HOUR, endMinutes: GRID_FALLBACK_END_HOUR * MINUTES_PER_HOUR }
  }
  const starts = slots.map((s) => toMinutes(s.startTime))
  const ends = slots.map((s) => toMinutes(s.startTime) + s.durationMinutes)
  const startMinutes = Math.max(0, roundDownToHour(Math.min(...starts)) - GRID_BOUNDS_PADDING_MINUTES)
  const endMinutes = Math.min(MINUTES_PER_DAY, roundUpToHour(Math.max(...ends)) + GRID_BOUNDS_PADDING_MINUTES)
  return { startMinutes, endMinutes }
}

// Ετικέτες πλήρων ωρών μέσα στο εύρος (π.χ. «08:00», «09:00», …) — για τον οριζόντιο άξονα χρόνου.
// Ξεχωριστό από τα padded bounds παραπάνω: οι γραμμές πλέγματος μένουν σε ολόκληρες ώρες ακόμα κι
// αν το ίδιο το container έχει λίγο επιπλέον χώρο γύρω τους.
export function hourMarks({ startMinutes, endMinutes }) {
  const marks = []
  const firstHour = roundUpToHour(startMinutes)
  for (let m = firstHour; m <= endMinutes; m += MINUTES_PER_HOUR) {
    marks.push({ minutes: m, label: `${String(Math.floor(m / MINUTES_PER_HOUR)).padStart(2, '0')}:00` })
  }
  return marks
}

// Ομαδοποιεί ΜΕΤΑΒΑΤΙΚΑ (transitively) επικαλυπτόμενα slots μιας ημέρας σε clusters — sweep πάνω
// σε ήδη ταξινομημένα κατά startTime (deterministic tie-break: seriesId αύξουσα, βλ. sortDaySlots).
// Δύο slots που απλά «ακουμπούν» (end === next start) ΔΕΝ θεωρούνται επικαλυπτόμενα.
function buildOverlapClusters(sortedSlots) {
  const clusters = []
  let current = []
  let currentEnd = -Infinity
  for (const slot of sortedSlots) {
    const start = toMinutes(slot.startTime)
    const end = start + slot.durationMinutes
    if (current.length > 0 && start < currentEnd) {
      current.push(slot)
      currentEnd = Math.max(currentEnd, end)
    } else {
      if (current.length > 0) clusters.push(current)
      current = [slot]
      currentEnd = end
    }
  }
  if (current.length > 0) clusters.push(current)
  return clusters
}

function sortDaySlots(daySlots) {
  return [...daySlots].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime) || a.seriesId - b.seriesId)
}

// Υπολογίζει τα block descriptors ΜΙΑΣ ημέρας: θέση/ύψος (σε λεπτά, ΟΧΙ pixels — η μετατροπή σε
// px είναι ευθύνη του component μέσω GRID_PIXELS_PER_MINUTE) και στήλη overlap (columnIndex/
// columnCount, ίσα πλάτη — σκόπιμα ΑΠΛΟ v1, όχι βέλτιστο calendar packing, βλ. σχόλιο module).
export function computeDayBlocks(daySlots, bounds) {
  const sorted = sortDaySlots(daySlots)
  const clusters = buildOverlapClusters(sorted)

  const blocks = []
  for (const cluster of clusters) {
    const columnCount = cluster.length
    cluster.forEach((slot, columnIndex) => {
      const startMinutes = toMinutes(slot.startTime)
      blocks.push({
        slot,
        topMinutes: startMinutes - bounds.startMinutes,
        heightMinutes: Math.max(slot.durationMinutes, GRID_MIN_BLOCK_MINUTES),
        columnIndex,
        columnCount
      })
    })
  }
  return blocks
}

// Υπολογίζει το πλήρες grid layout (bounds + blocks ανά ημέρα) για ΟΛΕΣ τις δοσμένες ημέρες σε ΜΙΑ
// κλήση — καλείται ΜΙΑ φορά από το WeeklyScheduleGrid, όχι ανά στήλη/render.
export function computeWeekGridLayout(slots, dayValues) {
  const bounds = computeWeeklyBounds(slots)
  const blocksByDay = {}
  for (const day of dayValues) {
    blocksByDay[day] = computeDayBlocks(slots.filter((s) => s.dayOfWeek === day), bounds)
  }
  return { bounds, blocksByDay }
}
