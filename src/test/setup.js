// Παρέχει IndexedDB μέσα στο Node (Vitest), ώστε τα tests που αγγίζουν db.js/backup.js
// (migrations, export/import) να τρέχουν το πραγματικό Dexie χωρίς browser.
import 'fake-indexeddb/auto'

// React Testing Library matchers (toBeDisabled, toHaveAttribute, κ.λπ.) — μόνο τα *.test.jsx
// (jsdom environment) τα χρησιμοποιούν στην πράξη, αλλά το import είναι αβλαβές και για τα
// υπόλοιπα (απλώς επεκτείνει το expect, δεν αγγίζει DOM).
import '@testing-library/jest-dom/vitest'
