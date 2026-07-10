// Παρέχει IndexedDB μέσα στο Node (Vitest), ώστε τα tests που αγγίζουν db.js/backup.js
// (migrations, export/import) να τρέχουν το πραγματικό Dexie χωρίς browser.
import 'fake-indexeddb/auto'
