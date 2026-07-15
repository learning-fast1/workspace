# Learning Fast — Design System v1

## 1. Σκοπός
Το παρόν αρχείο είναι η μοναδική πηγή αλήθειας για την αισθητική και το UI της εφαρμογής.

Η εφαρμογή απευθύνεται σε ειδικούς παιδαγωγούς και πρέπει να αποπνέει:
- ηρεμία
- επαγγελματισμό
- καθαρότητα
- οργάνωση
- φροντίδα
- ταχύτητα χρήσης

Δεν σχεδιάζουμε παιδική εφαρμογή.
Δεν σχεδιάζουμε γενικό CRM.
Σχεδιάζουμε ένα σύγχρονο επαγγελματικό εργαλείο ειδικής εκπαίδευσης.

## 2. Βασική αισθητική
Έμπνευση:
- Notion
- Linear
- Apple Health
- Things 3
- σύγχρονα SaaS dashboards

Χαρακτηριστικά:
- φωτεινό περιβάλλον
- πολύς λευκός χώρος
- ήπια pastel accents
- καθαρή οπτική ιεραρχία
- στρογγυλεμένες κάρτες
- διακριτικά borders
- πολύ ήπιες σκιές
- συνεπή icons
- μεγάλες περιοχές αφής για tablet

Αποφεύγουμε:
- μπεζ background σε όλη την εφαρμογή
- βαριές σκιές
- έντονα gradients
- τεράστια κουμπιά
- πολλά διαφορετικά χρώματα
- emoji ως βασικά UI icons
- ατελείωτες σελίδες χωρίς tabs
- παλιά “φόρμα” αισθητική

## 3. Χρώματα

```css
--color-bg: #F7F9FC;
--color-surface: #FFFFFF;
--color-surface-soft: #F1F5F9;

--color-primary: #4F6EF7;
--color-primary-hover: #405DE6;
--color-primary-soft: #EEF2FF;

--color-success: #2FA66A;
--color-success-soft: #EAF8F0;

--color-warning: #D99A2B;
--color-warning-soft: #FFF6DF;

--color-danger: #D9534F;
--color-danger-soft: #FDEEEE;

--color-text: #1E293B;
--color-text-secondary: #64748B;
--color-text-muted: #94A3B8;

--color-border: #E2E8F0;
--color-border-strong: #CBD5E1;
```

Κανόνες:
- Το primary χρησιμοποιείται για την κύρια ενέργεια κάθε οθόνης.
- Το success για ενεργό, ολοκληρωμένο ή θετική πρόοδο.
- Το warning για εκκρεμότητες ή ανάγκη προσοχής.
- Το danger μόνο για διαγραφή, αρχειοθέτηση ή σοβαρή προειδοποίηση.
- Κάθε οθόνη έχει μία εμφανή primary action.

## 4. Typography

```css
font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

Κλίμακα:
```css
--font-xs: 12px;
--font-sm: 14px;
--font-md: 16px;
--font-lg: 18px;
--font-xl: 24px;
--font-2xl: 32px;
```

Χρήση:
- Page title: 28–32px, 700
- Section title: 20–24px, 600–700
- Card title: 16–18px, 600
- Body: 15–16px, 400
- Labels: 14px, 500–600
- Helper text: 13–14px, secondary color

## 5. Spacing

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--space-10: 40px;
--space-12: 48px;
```

Κανόνες:
- Card padding: 20–24px
- Απόσταση cards: 16–24px
- Απόσταση sections: 32–40px
- Label από input: 8px
- Fields μεταξύ τους: 20px

## 6. Layout

Desktop:
- σταθερό sidebar 240px
- main content max-width 1280px
- page padding 32px

Tablet:
- collapsible sidebar
- tap target τουλάχιστον 44×44px
- padding 20–24px
- 1 ή 2 στήλες

Mobile:
- bottom navigation
- μία στήλη
- χωρίς οριζόντιο scroll

## 7. Sidebar

Σειρά (ενημερώθηκε στο Sprint 4):
1. Αρχική
2. Συνεδρίες
3. Μαθητές
4. Ρυθμίσεις

Σκεπτικό (Sprint 4): teacher-centric πλοήγηση, όχι feature-centric. Ο εκπαιδευτικός σκέφτεται
«ποιον μαθητή θα δω / ποια συνεδρία θα κάνω / τι έκανα σήμερα», όχι «θέλω να ανοίξω την Πρόοδο» ή
«θέλω να ανοίξω τις Εκθέσεις». Για αυτό:
- Το «Συνεδρίες» είναι πρωτεύον — ο εκπαιδευτικός επιστρέφει σε προηγούμενες συνεδρίες πολύ πιο
  συχνά απ' ό,τι σε εκθέσεις.
- Η **Πρόοδος** και οι **Εκθέσεις** ΔΕΝ έχουν δικό τους sidebar item — παραμένουν αποκλειστικά
  λειτουργίες μέσα στην καρτέλα μαθητή (tabs «Στόχοι»/«Έκθεση», §11). Ανήκουν στον μαθητή, δεν
  είναι ανεξάρτητες περιοχές της εφαρμογής.
- Η «Νέα συνεδρία» ΔΕΝ είναι sidebar item — είναι ενέργεια, όχι προορισμός. Παραμένει προσβάσιμη
  ως πρωτεύον (οπτικά πιο έντονο) Quick Action στην Αρχική, και ως mobile-only FAB (§18).
- «Ομάδες» και «Πρότυπα» δεν υπάρχουν ακόμα ως πραγματικές λειτουργίες — δεν αναφέρονται στο
  sidebar μέχρι να υπάρχουν πραγματικά routes (βλ. SPEC.md).

Active state:
```css
background: var(--color-primary-soft);
color: var(--color-primary);
border-radius: 12px;
```

Χρησιμοποιούμε Lucide Icons. Όχι emoji.

## 8. Cards

```css
.card {
  background: #FFFFFF;
  border: 1px solid #E2E8F0;
  border-radius: 18px;
  padding: 24px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.04);
}
```

## 9. Buttons

Primary:
```css
height: 44px;
padding: 0 18px;
border-radius: 12px;
background: #4F6EF7;
color: #FFFFFF;
font-weight: 600;
```

Κανόνες:
- icon αριστερά
- transition 160–200ms
- όχι πάνω από δύο έντονα κουμπιά στην ίδια περιοχή
- η Ακύρωση είναι secondary ή ghost

## 10. Inputs και Forms

```css
height: 46px;
border: 1px solid #CBD5E1;
border-radius: 12px;
background: #FFFFFF;
padding: 0 14px;
```

Focus:
```css
border-color: #4F6EF7;
box-shadow: 0 0 0 3px rgba(79, 110, 247, 0.12);
```

Κανόνες:
- κάθε input έχει label
- placeholder μόνο ως παράδειγμα
- error text κάτω από το input
- μεγάλες φόρμες χωρίζονται σε sections
- 2-column grid στο desktop όπου ταιριάζει

Ημερομηνία (Sprint 4): όπου η ταχύτητα καταχώρησης έχει σημασία (ολοκλήρωση συνεδρίας,
επεξεργασία συνεδρίας) χρησιμοποιείται το DateField (COMPONENT_GUIDE.md) αντί για γυμνό date
input — native date picker + κουμπιά «Σήμερα»/«Χθες» + ξεχωριστό, πάντα εύκολο-στο-κλικ πεδίο
«Έτος» δίπλα του.

## 11. Tabs

Η καρτέλα μαθητή χρησιμοποιεί:
- Στόχοι
- Συνεδρίες (§17β — πραγματικό Session History του μαθητή)
- Προφίλ
- Ενισχυτές
- Έκθεση (§11β)

## 11β. Report tab (Έκθεση) — persisted workflow (Sprint 4)

Ροή: επιλογή περιόδου (Από/Έως) → «Δημιουργία προσχεδίου» → επεξεργάσιμο κείμενο (auto-save,
persisted — επιβιώνει σε refresh) → κουμπί εναλλαγής Προεπισκόπηση/Επεξεργασία μέσα στην ΙΔΙΑ
κάρτα (όχι ξεχωριστό modal/route) → Λήψη .docx / Αντιγραφή / Οριστικοποίηση.

Συμπτυγμένη ενότητα «Παλαιότερες εκθέσεις» πάνω από τη φόρμα (disclosure, §17β) — διαθέσιμο
ιστορικό αλλά όχι κυρίαρχο οπτικά. Καμία global «Εκθέσεις» ενότητα (§7) — μόνο εδώ, μέσα στον μαθητή.

## 12. Student cards

Κάθε card περιλαμβάνει:
- avatar illustration ή αρχικό
- μικρό όνομα
- κωδικό
- τάξη
- ενεργούς στόχους
- τελευταία συνεδρία
- status

Δεν χρησιμοποιούμε πραγματικές φωτογραφίες παιδιών ως default.

## 13. Student profile header

Περιλαμβάνει:
- avatar
- μικρό όνομα
- κωδικό
- τάξη
- status
- Επεξεργασία
- Νέα συνεδρία
- menu δευτερευουσών ενεργειών

Stats:
- ενεργοί στόχοι
- συνεδρίες
- μέση πρόοδος
- τελευταία συνεδρία

## 14. Goals

Κάθε στόχος δείχνει:
- τίτλο
- τομέα
- σύντομη περιγραφή
- progress bar
- ποσοστό
- λήξη
- status
- overflow menu

## 14β. Goal Progress — ανά στόχο (Sprint 4 redesign)

PageHeader (τίτλος στόχου) + Card με badges (προτεραιότητα/status) + baseline/κριτήριο/περιγραφή +
Card με το γράφημα (recharts LineChart, γραμμή κριτηρίου, baseline).

Κάθε σημείο του γραφήματος αντιστοιχεί σε μία μέτρηση/συνεδρία — click/tap σε σημείο ανοίγει το
Session modal (§17β) της συνεδρίας στην οποία μετρήθηκε. Χωρίς επιπλέον charts/στατιστικά πέρα από
αυτό το ένα γράφημα — δεν προσθέτουμε δεύτερο επίπεδο analytics.

## 15. Functional profile

Δεν είναι μία ατελείωτη σελίδα.

Desktop:
- αριστερά λίστα τομέων
- δεξιά επιλογές ενεργού τομέα

Εναλλακτικά accordion με μία ενότητα ανοικτή κάθε φορά.

## 16. Reinforcer profile

Οι ενισχυτές εμφανίζονται ως tags/chips:
```text
[ Παζλ × ] [ Μουσική × ] [ Αυτοκινητάκια × ]
```

## 17. Teaching Mode (καταγραφή live συνεδρίας)

Tablet-first. Full-screen, εξαιρείται από το AppShell (βλ. COMPONENT_GUIDE.md).

Header:
- μαθητής
- έξοδος
- ολοκλήρωση

Περιεχόμενο:
- ενεργοί στόχοι (γρήγορη καταχώρηση με ένα tap, undo τελευταίας καταχώρησης)
- ➕ Παρατήρηση (πάντα προσβάσιμο, FAB κάτω-δεξιά)

Στο τέλος (κουμπί «Τέλος»): ημερομηνία (DateField, §10) + διάρκεια — ΟΧΙ status/activity/note
εδώ· αυτά προστίθενται/διορθώνονται εκ των υστέρων από το Session History (§17β), όχι στη ροή
καταγραφής (SPEC.md: το status είναι πάντα `completed` τη στιγμή της συνεδρίας).

Δεν χρησιμοποιούμε τεράστιο σκούρο footer button σε όλο το πλάτος — το FAB Παρατήρηση είναι
συμπαγές, κάτω-δεξιά.

## 17β. Session History (Sprint 4 — νέο)

Δύο σημεία εμφάνισης, ίδιο component: global (`/sessions`, sidebar «Συνεδρίες») και φιλτραρισμένο
μέσα στην καρτέλα μαθητή (tab «Συνεδρίες»).

Δομή:
- Discreet toolbar: SearchBar πάντα ορατό· φίλτρα (status/τύπος/περίοδος) πίσω από toggle
  «Φίλτρα», όχι ανοιχτά από προεπιλογή.
- Λίστα καρτών (SessionCard, βλ. COMPONENT_GUIDE.md), grouped: «Σήμερα» πρώτα, μετά ανά μήνα.
- Tap/click σε κάρτα → λεπτομέρειες σε modal με εσωτερικό view/edit toggle (COMPONENT_GUIDE.md
  § Modal) — όχι ξεχωριστά modals για προβολή και επεξεργασία.
- Status badge εμφανίζεται ΜΟΝΟ όταν η συνεδρία δεν είναι «Ολοκληρώθηκε» (COMPONENT_GUIDE.md
  § Badge) — όχι σε κάθε γραμμή.
- Secondary actions (Επεξεργασία, προαιρετικά «Νέα συνεδρία με ίδιους μαθητές», Διαγραφή) σε
  overflow menu, ποτέ inline.

Το «Ιστορικό δραστηριότητας» (η παλιότερη αφηγηματική χρονολόγηση goals/παρατηρήσεων) παραμένει
δευτερεύον, μέσα στο ίδιο tab, ως collapsed disclosure (COMPONENT_GUIDE.md § Disclosure) — όχι
ξεχωριστό tab.

## 18. Dashboard (Αρχική)

Header:
- Καλημέρα, [όνομα]
- ημερομηνία

Ειδοποιήσεις (όταν υπάρχουν): υπενθύμιση backup, στόχοι χωρίς μέτρηση > 14 μέρες.

Stats (τρέχουσα υλοποίηση):
- ενεργοί μαθητές
- συνεδρίες σήμερα
- συνολικές συνεδρίες
- ενεργοί στόχοι

Quick actions — σειρά και βάρος (ενημερώθηκε στο Sprint 4):
1. **Νέα συνεδρία** — πρώτη, οπτικά πιο έντονη (`--primary` background/border) από τις υπόλοιπες·
   sub-links Ατομικό/Ομαδικό. Η πιο συχνή ενέργεια της ημέρας (SPEC.md: «η συνεδρία είναι το κέντρο»).
2. Νέος μαθητής
3. Νέα έκθεση
4. Εισαγωγή backup

Mobile-only FAB: συντόμευση «Νέα συνεδρία» (→ Ατομικό απευθείας), κάτω-δεξιά, πάνω από το bottom
nav — μόνο σε mobile πλάτη (< 768px)· σε tablet/desktop η πρώτη quick-action card είναι ήδη άμεσα
ορατή χωρίς scroll (βλ. COMPONENT_GUIDE.md baseline — στενό εύρος χρήσης του FAB pattern).

Επίσης: πρόσφατη δραστηριότητα (τελευταίες συνεδρίες).

Δεν χρησιμοποιούμε πλέον τα δύο τεράστια κουμπιά Ατομικό / Ομαδικό όπως στην αρχική MVP σχεδίαση.

## 19. Empty states

Κάθε empty state έχει:
- icon
- τίτλο
- σύντομο κείμενο
- action

## 20. Icons

Χρησιμοποιούμε Lucide Icons:
Home, Users, UserRound, CalendarDays, FileText, Target, Settings, Search, Plus, Pencil, Archive, MoreHorizontal, ChevronRight, CircleCheck.

## 21. Motion

- hover: 160–200ms
- modal: 180–220ms
- dropdown: 120–160ms
- page fade: έως 180ms

Όχι bouncing ή μεγάλα zoom effects.

## 22. Accessibility

- WCAG AA contrast
- labels σε όλα τα fields
- keyboard navigation
- visible focus
- tap target 44×44px
- status όχι μόνο με χρώμα

## 23. Τεχνικές οδηγίες

Προτιμώμενα:
- Lucide React
- CSS variables
- reusable components
- responsive CSS
- semantic HTML
- καμία αλλαγή στο business logic χωρίς ρητή οδηγία

Components:
- AppShell
- Sidebar
- PageHeader
- Button
- Card
- StatCard
- StudentCard
- EmptyState
- Tabs
- Badge
- FormField
- Modal
- ProgressBar

## 24. Κανόνες για τον AI developer

Πριν αλλάξεις UI:
1. Διάβασε ολόκληρο το SPEC.md.
2. Διάβασε ολόκληρο το DESIGN_SYSTEM.md.
3. Μην αλλάξεις business logic ή αποθήκευση δεδομένων.
4. Μην αφαιρέσεις λειτουργίες.
5. Δημιούργησε πρώτα κοινά components και design tokens.
6. Εφάρμοσε το design ανά οθόνη.
7. Έλεγξε desktop και tablet.
8. Μην χρησιμοποιήσεις emoji ως UI icons.
9. Μην εισαγάγεις άλλη αισθητική.
10. Σε αμφιβολία, προτίμησε απλότητα και λευκό χώρο.

## 25. Φάσεις υλοποίησης του redesign

**Πρώτη φάση (Sprint 2) — ολοκληρώθηκε:**
1. Global design tokens
2. App shell
3. Sidebar
4. Dashboard
5. Students list
6. Student profile header και tabs

Δεν άλλαξε: logic στόχων, logic συνεδριών, IndexedDB, reports, backup/restore, routing behavior.
Στόχος: νέα εμφάνιση χωρίς να σπάσει τίποτα.

**Επόμενες φάσεις — ολοκληρώθηκαν:**
- **Sprint 3**: redesign Teaching Mode (§17) — καθαρά παρουσίαση/UX (undo, νέο end-of-session/exit
  flow), καμία αλλαγή στο data model.
- **Sprint 4**: εδώ ΥΠΗΡΞΑΝ πραγματικές νέες δυνατότητες πέρα από re-styling — Session History
  (§17β, νέα οθόνη + δυνατότητα διόρθωσης status εκ των υστέρων), persisted Report entity (§11β,
  νέο table, προσθετικό migration), σύνδεση γραφήματος↔συνεδρίας (§14β). Καταγράφονται ρητά εδώ
  ΚΑΙ στο SPEC.md, ώστε να μη θεωρηθούν λανθασμένα «απλή αλλαγή εμφάνισης».
