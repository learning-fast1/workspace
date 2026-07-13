# Learning Fast — Component Guide v1

## Σκοπός

Το `DESIGN_SYSTEM.md` ορίζει πώς μοιάζει η εφαρμογή.
Το `COMPONENT_GUIDE.md` ορίζει πότε και πώς χρησιμοποιείται κάθε component.

Στόχοι:
- συνέπεια σε όλες τις οθόνες
- λιγότερο επαναλαμβανόμενο CSS
- σαφής οπτική ιεραρχία
- ασφαλής επαναχρησιμοποίηση
- εύκολη συντήρηση

## Γενικοί κανόνες

1. Κάθε οθόνη έχει μία κύρια ενέργεια.
2. Τα UI components δεν περιέχουν business logic ή queries.
3. Δεδομένα και callbacks δίνονται μέσω props.
4. Όλα λειτουργούν σε desktop, tablet και mobile.
5. Χρησιμοποιείται Lucide React, όχι emoji ως UI icons.
6. Κάθε interactive στοιχείο έχει keyboard focus state.
7. Minimum tap target: 44×44px.
8. Δεν δημιουργούμε νέο component όταν υπάρχει ήδη κατάλληλο reusable component.
9. Δεν χρησιμοποιούμε διαφορετικό styling για το ίδιο pattern σε διαφορετικές σελίδες.

## AppShell

Βασικό layout της εφαρμογής:
- responsive sidebar
- mobile bottom navigation
- top header
- search area
- user area
- main content

Χρησιμοποιείται στις βασικές σελίδες της εφαρμογής.
Δεν είναι υποχρεωτικό σε full-screen Teaching Mode, print views ή export views.

## PageHeader

Περιλαμβάνει:
- page title
- optional subtitle
- optional back action
- μία primary action
- έως δύο secondary actions

Κανόνας: destructive action δεν γίνεται primary.

## SectionHeader

Χρησιμοποιείται για να χωρίζει ενότητες της ίδιας σελίδας.

Περιλαμβάνει:
- section title
- optional description
- optional secondary action

Δεν αντικαθιστά το PageHeader.

## Button

Variants:
- `primary`: κύρια ενέργεια
- `secondary`: σημαντική δευτερεύουσα ενέργεια
- `ghost`: διακριτική ενέργεια ή ακύρωση
- `danger`: διαγραφή ή άλλη destructive ενέργεια
- `success`: θετική/επιτυχημένη καταχώρηση (π.χ. «Επιτυχία» στο Teaching Mode) — ΔΕΝ είναι η κύρια ενέργεια της οθόνης (αυτό παραμένει `primary`) ούτε σφάλμα (αυτό παραμένει `danger`)

Κανόνες:
- Δεν χρησιμοποιούμε δύο primary buttons δίπλα-δίπλα.
- Η “Ακύρωση” είναι ghost ή secondary.
- Icon αριστερά από το label.
- Icon-only buttons έχουν `aria-label`.
- Loading state χωρίς αλλαγή πλάτους.

## Card

Variants:
- default
- interactive
- soft
- alert

Κανόνες:
- Όχι nested cards χωρίς σοβαρό λόγο.
- Clickable card έχει hover και focus state.
- Κάθε card έχει συγκεκριμένο πληροφοριακό σκοπό.
- Δεν χρησιμοποιείται card μόνο για λευκό background.

## StatCard

Περιλαμβάνει:
- μικρό icon badge
- μεγάλο metric
- label
- optional helper text
- optional status

Κανόνες:
- Το metric είναι το κυρίαρχο στοιχείο.
- Δεν εμφανίζουμε fake ή μη διαθέσιμα δεδομένα.
- Δεν γράφουμε “Δεν παρακολουθείται ακόμη” ως metric.
- Μέχρι τέσσερα stat cards ανά βασική σειρά.

## QuickActionCard

Περιλαμβάνει:
- icon
- title
- μικρή description
- click action

Κανόνες:
- Μέχρι τέσσερις βασικές quick actions.
- Κάθε action οδηγεί σε υπαρκτή λειτουργία.
- Δεν χρησιμοποιείται για απλή πληροφορία.

## Badge

Variants:
- neutral
- primary
- success
- warning
- danger

Χρησιμοποιείται για status, όχι ως button.
Το κείμενο είναι πάντα ορατό· δεν βασιζόμαστε μόνο στο χρώμα.

## EmptyState

Περιλαμβάνει:
- icon ή διακριτική illustration
- title
- description
- optional action

Κανόνες:
- Δεν αφήνουμε κενό χώρο χωρίς εξήγηση.
- Το action εμφανίζεται μόνο όταν υπάρχει σαφές επόμενο βήμα.
- Χρησιμοποιούμε απλή, ανθρώπινη γλώσσα.

## FormField

Περιλαμβάνει:
- label
- required indicator
- field
- helper text
- error message

Κανόνες:
- Placeholder δεν αντικαθιστά το label.
- Error message κάτω από το field.
- Helper text σύντομο.
- Required fields σημειώνονται με συνέπεια.

## Input

States:
- default
- hover
- focus
- disabled
- error
- readonly

Δεν χρησιμοποιείται για γνωστές επιλογές· εκεί χρησιμοποιείται Select.
Δεν πρέπει να προκαλεί horizontal overflow σε mobile.

## Textarea

Για:
- σημειώσεις
- παρατηρήσεις
- περιγραφές
- qualitative feedback

Ελάχιστο ύψος 120px.
Δεν χρησιμοποιείται για σύντομες τιμές μίας γραμμής.

## Select

Για λίστες σταθερών επιλογών.

Κανόνες:
- Ορατό label.
- Δεν χρησιμοποιείται για binary επιλογή.
- Μεγάλες λίστες χρειάζονται searchable combobox.

## SearchBar

Global Search:
- στο top header

Local Search:
- μέσα σε συγκεκριμένη σελίδα, π.χ. λίστα μαθητών

Κανόνες:
- Το placeholder εξηγεί τι αναζητείται.
- Στο mobile μπορεί να ανοίγει overlay/search view.
- Δεν εμφανίζεται ως λειτουργικό αν δεν κάνει ακόμη αναζήτηση.

## Tabs

Στην καρτέλα μαθητή:
- Στόχοι
- Συνεδρίες
- Προφίλ
- Ενισχυτές
- Έκθεση

Κανόνες:
- Για ενότητες του ίδιου αντικειμένου, όχι διαφορετικές βασικές routes.
- Active state σαφές.
- Στο mobile επιτρέπεται horizontal scroll μόνο μέσα στο tab bar.
- Όχι πάνω από 6 tabs χωρίς regrouping.

## ProgressBar

Για πρόοδο στόχου ή ποσοστό επίδοσης.

Κανόνες:
- Value 0–100.
- Το ποσοστό εμφανίζεται και ως κείμενο.
- Δεν βασιζόμαστε μόνο στο χρώμα.
- Ίδιο χρωματικό pattern παντού.

## Modal

Κατάλληλο για:
- επιβεβαίωση διαγραφής
- μικρή επεξεργασία
- σύντομη προσθήκη
- επιλογή template

Όχι για:
- μεγάλες φόρμες
- λειτουργικό προφίλ
- πλήρη έκθεση
- σύνθετη συνεδρία

Κανόνες:
- focus trap
- Escape κλείνει όταν είναι ασφαλές
- primary action σαφές
- danger modal με ξεκάθαρο destructive label

## AlertBanner

Variants:
- info
- warning
- danger
- success

Για:
- backup reminder
- stale goals
- system state
- αποτέλεσμα ενέργειας

Κανόνες:
- Σύντομο μήνυμα.
- Action μόνο όταν υπάρχει σαφές επόμενο βήμα.
- Λεπτό banner για απλή ειδοποίηση.
- Expanded alert card μόνο όταν πρέπει να εμφανιστεί λίστα.

## StudentCard

Περιλαμβάνει:
- avatar ή αρχικό
- μικρό όνομα
- κωδικό
- τάξη
- ενεργούς στόχους
- τελευταία συνεδρία
- status badge

Κανόνες:
- Όλη η card μπορεί να είναι clickable.
- Secondary actions σε overflow menu.
- Δεν εμφανίζουμε πραγματικές φωτογραφίες ως default.
- Δεν φορτώνουμε την card με πολλές πληροφορίες.

## ActivityItem

Περιλαμβάνει:
- icon
- title
- description
- timestamp
- optional link

Κανόνες:
- Τα πιο πρόσφατα πρώτα.
- Φιλική μορφή ημερομηνίας.
- Όχι raw database values.
- Grouping ανά ημερομηνία σε μεγάλες λίστες.

## Responsive κανόνες

Desktop:
- 4 stat cards ανά σειρά όταν χωρούν
- σταθερό sidebar
- quick actions σε grid

Tablet:
- 2 stat cards ανά σειρά
- sidebar drawer
- forms σε 1–2 στήλες

Mobile:
- 2 stat cards ανά σειρά μόνο αν παραμένουν ευανάγνωστα
- διαφορετικά 1 ανά σειρά
- bottom navigation
- quick actions 1 ανά σειρά
- κανένα horizontal overflow

## Naming conventions

Components:
`PascalCase`

CSS classes:
`component-name__element--modifier`

Props:
`camelCase`

Events:
`onClick`, `onChange`, `onSubmit`, `onClose`

## Κανόνες για τον AI developer

Πριν δημιουργήσεις νέο component:

1. Έλεγξε αν υπάρχει ήδη reusable component.
2. Διάβασε `DESIGN_SYSTEM.md`.
3. Διάβασε `COMPONENT_GUIDE.md`.
4. Μην ενσωματώσεις database queries σε presentational component.
5. Μην αντιγράψεις CSS από άλλη σελίδα χωρίς abstraction.
6. Μην αλλάξεις visual pattern χωρίς ενημέρωση του guide.
7. Πρόσθεσε accessibility props.
8. Έλεγξε desktop, tablet και mobile.
9. Μην κάνεις commit, push ή deploy χωρίς ρητή οδηγία.
10. Όταν δημιουργηθεί νέο reusable pattern, ενημέρωσε αυτό το αρχείο.

## Τρέχον εγκεκριμένο baseline

Εγκεκριμένα patterns:
- AppShell
- Desktop Sidebar
- Tablet Drawer
- Mobile Bottom Navigation
- Top Header
- Dashboard Stat Cards
- Dashboard Quick Actions
- Alert Banner
- Dashboard Empty State
- Recent Activity List
- Full-screen Teaching Mode (κλάση "app-shell" απευθείας στο root, χωρίς το `<AppShell>` component — tokens χωρίς sidebar/header/bottom-nav)
- Select (ui/Select.jsx)
- Button variant `success`

Αυτά αποτελούν το baseline για τις επόμενες οθόνες.
