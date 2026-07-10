// Επίπεδα υποβοήθησης — χρησιμοποιούνται στην καταγραφή στόχων τύπου promptLevel μέσα στο Teaching Mode.
export const PROMPT_LEVELS = [
  { value: 'independent', label: 'Ανεξάρτητα' },
  { value: 'verbal', label: 'Λεκτική υπόδειξη' },
  { value: 'physical', label: 'Σωματική βοήθεια' }
]

// Αριθμητική διαβάθμιση (1 = χρειάζεται τη μεγαλύτερη στήριξη, 3 = ανεξάρτητα) — για γράφημα προόδου.
export const PROMPT_LEVEL_RANK = { physical: 1, verbal: 2, independent: 3 }

export function promptLevelLabel(value) {
  return PROMPT_LEVELS.find((p) => p.value === value)?.label || value
}
