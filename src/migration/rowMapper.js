import { deterministicId } from './deterministicId.js'
import { FOREIGN_KEY_MAP } from './foreignKeyMap.js'
import { legacyPrimaryKeyField } from './migratedTableNames.js'

// Καθαρή συνάρτηση (καμία επαφή με τη βάση) — μετατρέπει ΜΙΑ legacy γραμμή στην αντίστοιχη _v2
// γραμμή: νέο deterministic `id` (ΠΟΤΕ διατηρείται το παλιό ++id, βλ. Phase 2 Technical Plan §1) ΚΑΙ
// remap κάθε foreign key πεδίου (βλ. FOREIGN_KEY_MAP) στο δικό του deterministic id, με ΤΟΝ ΙΔΙΟ
// userId. Χρησιμοποιεί ΤΗΝ ΙΔΙΑ deterministicId() και για αυτο-αναφορικά πεδία (scheduleSlots.seriesId)
// — καθαρός υπολογισμός, όχι lookup σε ήδη-migrated δεδομένα, άρα δουλεύει ΑΝΕΞΑΡΤΗΤΑ από τη σειρά
// επεξεργασίας μέσα στον ίδιο πίνακα.
//
// null/undefined τιμές σε FK πεδία ΠΑΡΑΜΕΝΟΥΝ null/undefined (ΠΟΤΕ δεν περνάνε από deterministicId)
// — π.χ. observations.sessionId όταν η συνεδρία διαγράφηκε (βλ. db.js deleteSession). Ένα «ορφανό»
// FK που ΔΕΝ είναι null (δείχνει σε πραγματικά ανύπαρκτη legacy γραμμή) μεταφέρεται επίσης —
// υπολογίζεται το ΙΔΙΟ deterministic id που θα είχε η (ανύπαρκτη) γραμμή-στόχος αν υπήρχε, χωρίς να
// πετάει· η ανίχνευση ορφανών FK γίνεται ΑΛΛΟΥ (verification, βλ. migrationEngine.js), όχι εδώ.
export async function mapRowForMigration(userId, tableName, row) {
  const pkField = legacyPrimaryKeyField(tableName)
  const oldKey = row[pkField]
  const newRow = { ...row, id: await deterministicId(userId, tableName, oldKey) }

  const fkFields = FOREIGN_KEY_MAP[tableName] || {}
  for (const [field, target] of Object.entries(fkFields)) {
    const targetTable = typeof target === 'string' ? target : target.table
    const isArray = typeof target === 'object' && target.array === true
    const oldValue = row[field]

    if (isArray) {
      newRow[field] = Array.isArray(oldValue)
        ? await Promise.all(oldValue.map((v) => deterministicId(userId, targetTable, v)))
        : oldValue
    } else {
      newRow[field] = (oldValue === null || oldValue === undefined)
        ? oldValue
        : await deterministicId(userId, targetTable, oldValue)
    }
  }

  return newRow
}

// Μαζική εκδοχή — σειριακή (ΟΧΙ Promise.all σε όλες τις γραμμές μαζί) σκόπιμα: το crypto.subtle.digest
// είναι ήδη γρήγορο (βλ. deterministicId.js) και η σειριακή εκτέλεση κρατάει σταθερή, προβλέψιμη
// κατανάλωση μνήμης ακόμα και σε πίνακες με πολλές γραμμές — καμία ανάγκη ταυτόχρονης εκτέλεσης
// εκατοντάδων crypto operations.
export async function mapRowsForMigration(userId, tableName, rows) {
  const mapped = []
  for (const row of rows) {
    mapped.push(await mapRowForMigration(userId, tableName, row))
  }
  return mapped
}
