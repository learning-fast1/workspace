# Changelog

Ξεκινά από αυτό το σημείο (2026-07-30) — δεν καλύπτει αναδρομικά ολόκληρο το ιστορικό του project.
Για το πλήρες, παγωμένο ιστορικό μέχρι εδώ βλ. `docs/history.md`. Για την τρέχουσα κατάσταση του
προϊόντος βλ. `docs/release-1.0-report.html`, για τους κανόνες/όρια του προϊόντος βλ. `SPEC.md`.

## 2026-07-30

### Fixed

- **Generation-aware entity IDs** (commit `213ba5b`) — αρκετά components μετέτρεπαν route/entity ids
  με `Number(id)`, παραδοχή που ίσχυε μόνο για legacy αριθμητικά ids. Σε v2 (cloud) γενιά, όπου τα
  πραγματικά ids είναι UUID ή deterministic SHA-256 strings, αυτό γινόταν σιωπηλά `NaN` —
  προκαλώντας ErrorBoundary crashes και μόνιμο "Φόρτωση…" σε προβολή/επεξεργασία μαθητή και στόχου,
  και ένα silent invalid-foreign-key write path στο Teaching Mode. Διορθώθηκε με έναν κεντρικό,
  γενιά-aware helper (`resolveEntityId()`), εφαρμοσμένο σε όλα τα affected read/write σημεία.
  Βρέθηκε ζωντανά κατά το Real Multi-Device Sync Validation.

- **Partial updates / field-level merge** (commit `0921ca2`) — πέντε edit-mode φόρμες
  (StudentForm, GoalWizardForm, CalendarEventForm, SessionModal, GoalLibraryPicker) έστελναν
  ολόκληρο το τοπικό form/object snapshot σε κάθε `Table.update()`, ανεξάρτητα από το ποιο πεδίο
  άλλαξε πραγματικά — ακυρώνοντας σιωπηλά το property-level merge που ήδη υποστηρίζει το Dexie
  Cloud. Αποτέλεσμα: δύο συσκευές που άλλαζαν διαφορετικά πεδία της ίδιας εγγραφής offline έχαναν
  σιωπηλά τη μία αλλαγή στο reconnect. Διορθώθηκε με έναν κοινό helper (`diffFields()`) που στέλνει
  μόνο τα πεδία που πραγματικά άλλαξαν, πάνω στο τελικό, ήδη-normalized payload.

### Validated

- **Real Multi-Device Sync Validation** — 12 σενάρια (baseline sync, concurrent edits, offline
  queueing/reconnect, same-field και different-field conflicts, delete-vs-edit, cross-tab
  reactivity, logout, bulk sync, interrupted-sync recovery) εκτελεσμένα σε δύο πραγματικές συσκευές
  έναντι του πραγματικού production Dexie Cloud backend. Μετά τα δύο παραπάνω fixes, το conflict
  σενάριο (διαφορετικά πεδία, ίδια εγγραφή, και οι δύο συσκευές offline) επαναλήφθηκε ρητά σε
  πραγματικές συνθήκες παραγωγής και πέρασε: και οι δύο αλλαγές επιβίωσαν, και οι δύο συσκευές
  συνέκλιναν στην ίδια τελική κατάσταση.

  **Συμπέρασμα production-readiness (v1 scope):** κατάλληλο για έναν εκπαιδευτικό, έναν προσωπικό
  λογαριασμό, μία κύρια συσκευή με περιστασιακή χρήση δεύτερης συσκευής — όχι για σκόπιμη,
  ταυτόχρονη, πολύ-συσκευή/πολύ-χρηστική επεξεργασία της ίδιας εγγραφής.

### Known non-blocking follow-ups

Κανένα από τα παρακάτω δεν εμποδίζει το v1 scope. Πλήρης λεπτομέρεια:
`docs/release-1.0-report.html` §technical debt.

- **Delete-versus-offline-edit transient resurrection** — μια εγγραφή που διαγράφεται σε μία
  συσκευή ενώ μια άλλη έχει εκκρεμές offline update για την ίδια εγγραφή μπορεί να επανεμφανιστεί
  προσωρινά (~60-90+ δευτερόλεπτα) πριν η διαγραφή τελικά επικρατήσει. Καμία μόνιμη αλλοίωση σε
  καμία δοκιμή. Δεν τεκμηριώνεται επίσημα από το Dexie Cloud προς καμία κατεύθυνση.
- **Περιστασιακή καθυστέρηση συγχρονισμού 90+ δευτερολέπτων** — παρατηρήθηκε 2-3 φορές, πάντα
  αυτοδιορθώθηκε, ποτέ `syncState.error`. Το test account είναι free/evaluation tier — πιθανός,
  όχι επιβεβαιωμένος παράγοντας.
- **`deleteStudent` δεν καθαρίζει `schoolYearParticipation`** — επιβεβαιωμένο, πραγματικό κενό στο
  delete cascade (όχι σκόπιμη πολιτική διατήρησης ιστορικού) — αφορά κανονική χρήση, όχι μόνο
  QA data. Ταξινομημένο ως backlog item, εκκρεμεί διόρθωση.
