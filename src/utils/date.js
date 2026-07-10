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

// Ελληνική, ανθρώπινα αναγνώσιμη μορφή μιας ημερομηνίας YYYY-MM-DD (π.χ. «9 Ιουλ 2026»).
export function formatDateEl(dateStr) {
  return new Date(dateStr).toLocaleDateString('el-GR', { day: 'numeric', month: 'short', year: 'numeric' })
}
