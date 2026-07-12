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

Σειρά:
1. Αρχική
2. Μαθητές
3. Ομάδες
4. Συνεδρίες
5. Εκθέσεις
6. Πρότυπα
7. Ρυθμίσεις

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

## 11. Tabs

Η καρτέλα μαθητή χρησιμοποιεί:
- Στόχοι
- Συνεδρίες
- Προφίλ
- Ενισχυτές
- Έκθεση

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

## 17. Session screen

Tablet-first.

Header:
- μαθητής
- έξοδος
- ολοκλήρωση

Περιεχόμενο:
- ημερομηνία
- διάρκεια
- ενεργοί στόχοι
- γρήγορη βαθμολόγηση
- σημειώσεις
- παρατήρηση

Δεν χρησιμοποιούμε τεράστιο σκούρο footer button σε όλο το πλάτος.

## 18. Dashboard

Header:
- Καλημέρα, [όνομα]
- ημερομηνία
- global search

Stats:
- σημερινές συνεδρίες
- εκθέσεις προς ολοκλήρωση
- ενεργοί μαθητές
- αγαπημένα πρότυπα

Quick actions:
- Νέος μαθητής
- Νέα συνεδρία
- Νέα έκθεση
- Νέα ομάδα

Επίσης:
- πρόσφατη δραστηριότητα
- προγραμματισμένες συνεδρίες

Δεν χρησιμοποιούμε πλέον τα δύο τεράστια κουμπιά Ατομικό / Ομαδικό.

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

## 25. Πρώτη φάση υλοποίησης

Η πρώτη φάση αφορά μόνο:
1. Global design tokens
2. App shell
3. Sidebar
4. Dashboard
5. Students list
6. Student profile header και tabs

Δεν αλλάζουμε ακόμη:
- logic στόχων
- logic συνεδριών
- IndexedDB
- reports
- backup/restore
- routing behavior

Στόχος: νέα εμφάνιση χωρίς να σπάσει τίποτα.
