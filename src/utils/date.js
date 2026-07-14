// Ημερομηνία σε τοπική ώρα, μορφή YYYY-MM-DD.
// ΟΧΙ new Date().toISOString().slice(0,10) — αυτό δίνει την ημερομηνία σε UTC, που γύρω στα
// μεσάνυχτα ώρας Ελλάδας (UTC+2/+3) μπορεί να δείξει ακόμα «χθες».
export function toLocalISO(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function todayLocalISO() {
  return toLocalISO(new Date())
}

// Χθεσινή ημερομηνία σε τοπική ώρα — για το quick-pick «Χθες» στο DateField (το πιο συχνό σενάριο
// καταχώρησης μιας συνεδρίας που έγινε άλλη μέρα, βλ. helper text του Teaching Mode).
export function yesterdayLocalISO() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return toLocalISO(d)
}

// Ελληνική, ανθρώπινα αναγνώσιμη μορφή μιας ημερομηνίας YYYY-MM-DD (π.χ. «9 Ιουλ 2026»).
export function formatDateEl(dateStr) {
  return new Date(dateStr).toLocaleDateString('el-GR', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Σύντομη μορφή χωρίς έτος (π.χ. «9 Ιουλ») — μόνο για πολύ στενά πλαίσια εμφάνισης (π.χ. συμπαγές
// stat card στο Hero του προφίλ μαθητή), όπου η πλήρης μορφή με έτος κόβεται με ellipsis.
export function formatDateElShort(dateStr) {
  return new Date(dateStr).toLocaleDateString('el-GR', { day: 'numeric', month: 'short' })
}
