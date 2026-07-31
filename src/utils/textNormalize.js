// Καθαρή συνάρτηση — αφαιρεί τόνους/διαλυτικά (NFD decomposition + αφαίρεση combining marks, βάσει
// code point αντί για regex literal ώστε να αποφεύγεται οποιαδήποτε ασάφεια encoding) και πεζοποιεί,
// ώστε «Γιώργος»/«Γιωργος»/«ΓΙΩΡΓΟΣ» να ταιριάζουν όλα μεταξύ τους. Εφαρμόζεται ΤΟΣΟ στο query ΟΣΟ
// και σε κάθε αναζητούμενο πεδίο, πριν από οποιαδήποτε σύγκριση (global search).
const COMBINING_MARK_START = 0x0300
const COMBINING_MARK_END = 0x036f

export function normalizeForSearch(value) {
  if (!value) return ''
  let result = ''
  for (const ch of value.normalize('NFD')) {
    const code = ch.codePointAt(0)
    if (code >= COMBINING_MARK_START && code <= COMBINING_MARK_END) continue
    result += ch
  }
  return result.toLowerCase()
}
