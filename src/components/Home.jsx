import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  AlertTriangle,
  CalendarDays,
  CalendarPlus,
  ClipboardList,
  FileText,
  PlayCircle,
  Sparkles,
  Target,
  Upload,
  UserPlus,
  Users
} from 'lucide-react'
import { getLastBackupAt } from '../db.js'
import { activeTable } from '../migration/activeGeneration.js'
import { formatDateEl, todayLocalISO } from '../utils/date.js'
import AppShell from './shell/AppShell.jsx'
import TodayQueue from './TodayQueue.jsx'
import HomeAttentionWidget from './HomeAttentionWidget.jsx'
import './Home.css'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const BACKUP_REMINDER_AFTER_DAYS = 7

// ΑΜΕΤΑΒΛΗΤΗ business logic — ίδιες συναρτήσεις με πριν, μόνο η παρουσίαση αλλάζει παρακάτω.
async function checkBackupReminder() {
  const lastBackupAt = await getLastBackupAt()
  if (!lastBackupAt) return { needed: true, days: null }
  const days = Math.floor((new Date() - new Date(lastBackupAt)) / MS_PER_DAY)
  return { needed: days > BACKUP_REMINDER_AFTER_DAYS, days }
}

// Νέα, καθαρά αναγνωστικά queries (τίποτα δεν γράφεται/αλλάζει) — τροφοδοτούν μόνο τα Stat Cards
// και το Πρόσφατη δραστηριότητα του dashboard. Δεν εισάγουν νέα δεδομένα/σχήμα στη βάση.
async function loadDashboardStats() {
  const [students, goals, sessions] = await Promise.all([
    activeTable('students').toArray(),
    activeTable('goals').where('status').equals('active').toArray(),
    activeTable('sessions').toArray()
  ])
  const activeStudentIds = new Set(students.filter((s) => s.active).map((s) => s.id))
  const today = todayLocalISO()
  // Sprint 6: μια notHeld συνεδρία δεν μετράει σαν πραγματική συνεδρία εδώ — ίδιο σκεπτικό με το
  // loadHeroStats/loadRecentActivity παραπάνω.
  const heldSessions = sessions.filter((s) => s.status !== 'notHeld')
  return {
    activeStudents: activeStudentIds.size,
    sessionsToday: heldSessions.filter((s) => s.date === today).length,
    totalSessions: heldSessions.length,
    activeGoals: goals.filter((g) => activeStudentIds.has(g.studentId)).length
  }
}

async function loadRecentActivity() {
  // Sprint 6: μια συνεδρία που καταγράφηκε απευθείας ως notHeld (δεν πραγματοποιήθηκε) δεν είναι
  // πραγματική δραστηριότητα διδασκαλίας — δεν πρέπει να εμφανίζεται σαν «Συνεδρία με Χ» εδώ, ίδιο
  // σκεπτικό με το loadHeroStats του StudentProfile.jsx. Παίρνουμε λίγο παραπάνω από 5 πριν το
  // φίλτρο, ώστε η λίστα να μην αδειάζει άδικα όταν οι πιο πρόσφατες εγγραφές ήταν notHeld.
  const [recentSessions, students] = await Promise.all([
    activeTable('sessions').orderBy('date').reverse().limit(20).toArray(),
    activeTable('students').toArray()
  ])
  const studentById = Object.fromEntries(students.map((s) => [s.id, s]))
  return recentSessions
    .filter((s) => s.status !== 'notHeld')
    .slice(0, 5)
    .map((s) => ({
      id: s.id,
      date: s.date,
      durationMinutes: s.durationMinutes,
      studentLabel: s.studentIds.map((id) => studentById[id]?.code).filter(Boolean).join(', ') || '—'
    }))
}

function StatCard({ icon: Icon, label, value, emptyHint }) {
  return (
    <div className="dashboard-stat-card">
      <span className="dashboard-stat-icon">
        <Icon size={18} />
      </span>
      <p className="dashboard-stat-value">{value}</p>
      <p className="dashboard-stat-label">{label}</p>
      {emptyHint && <p className="dashboard-stat-hint">{emptyHint}</p>}
    </div>
  )
}

// Αρχική οθόνη — dashboard (βλ. DESIGN_SYSTEM.md). Η φιλοσοφία «η συνεδρία είναι το κέντρο» (SPEC.md)
// παραμένει: Ατομικό/Ομαδικό είναι οι πρώτες, πιο εμφανείς quick actions.
export default function Home() {
  const backupReminder = useLiveQuery(checkBackupReminder, [])
  const stats = useLiveQuery(loadDashboardStats, [])
  const recentActivity = useLiveQuery(loadRecentActivity, [])

  return (
    <AppShell>
      <div className="dashboard-header">
        <h1 className="dashboard-greeting">Καλημέρα, Βικτώρια 👋</h1>
        <p className="dashboard-date">{formatDateEl(todayLocalISO())}</p>
        <p className="dashboard-subtitle">Ορίστε μια γρήγορη εικόνα της ημέρας σου.</p>
      </div>

      {backupReminder?.needed && (
        <div className="dashboard-banner">
          <AlertTriangle size={16} className="dashboard-banner-icon" />
          <span className="dashboard-banner-text">
            {backupReminder.days === null
              ? 'Δεν έχεις κάνει ποτέ αντίγραφο ασφαλείας.'
              : `${backupReminder.days} μέρες από το τελευταίο αντίγραφο ασφαλείας.`}
          </span>
          <Link to="/settings" className="dashboard-banner-link">Λήψη →</Link>
        </div>
      )}

      <TodayQueue />

      {/* Δευτερεύον, ήρεμο widget (Technical Plan Στάδιο 13) — ΚΑΤΩ από «Η μέρα μου», ΔΕΝ
          ανταγωνίζεται το σημερινό πρόγραμμα ή το κύριο CTA. Κρύβεται εντελώς όταν δεν υπάρχει
          τίποτα να δείξει (βλ. HomeAttentionWidget.jsx). Μοναδική πηγή αλήθειας για «Χρειάζονται
          προσοχή» στην Αρχική — το παλιότερο, επικαλυπτόμενο findStaleGoals()/.dashboard-notice
          αφαιρέθηκε (Sprint 7 cleanup) ώστε να μην υπάρχουν δύο ξεχωριστά attention systems εδώ. */}
      <HomeAttentionWidget />

      <h2 className="dashboard-section-title">Επισκόπηση</h2>
      <div className="dashboard-stats">
        <StatCard icon={Users} label="Μαθητές" value={stats ? stats.activeStudents : '—'} />
        <StatCard icon={CalendarDays} label="Συνεδρίες σήμερα" value={stats ? stats.sessionsToday : '—'} />
        <StatCard icon={ClipboardList} label="Συνολικές συνεδρίες" value={stats ? stats.totalSessions : '—'} />
        <StatCard icon={Target} label="Ενεργοί στόχοι" value={stats ? stats.activeGoals : '—'} />
      </div>

      <h2 className="dashboard-section-title">Γρήγορες ενέργειες</h2>
      <div className="dashboard-actions">
        {/* «Νέα συνεδρία» πλέον ίδιου βάρους με τις υπόλοιπες — για έκτακτη/απρόγραμμη συνεδρία
            εκτός «Η μέρα μου», που είναι πλέον ο πρωταγωνιστής της Αρχικής (Sprint 5). ΟΧΙ nav
            item (βλ. shell/navItems.js). */}
        <div className="dashboard-action-card">
          <span className="dashboard-action-link">
            <span className="dashboard-action-icon">
              <CalendarPlus size={20} />
            </span>
            Νέα συνεδρία
          </span>
          <p className="dashboard-action-desc">Ξεκίνα έκτακτη ατομική ή ομαδική συνεδρία τώρα.</p>
          <div className="dashboard-action-subrow">
            <Link to="/teaching/individual" className="dashboard-action-sublink">Ατομικό</Link>
            <Link to="/teaching/group" className="dashboard-action-sublink">Ομαδικό</Link>
          </div>
        </div>

        <div className="dashboard-action-card">
          <Link to="/students/new" className="dashboard-action-link">
            <span className="dashboard-action-icon">
              <UserPlus size={20} />
            </span>
            Νέος μαθητής
          </Link>
          <p className="dashboard-action-desc">Πρόσθεσε νέο μαθητή στο σύστημα.</p>
        </div>

        <div className="dashboard-action-card">
          <Link to="/students" className="dashboard-action-link">
            <span className="dashboard-action-icon">
              <FileText size={20} />
            </span>
            Νέα έκθεση
          </Link>
          <p className="dashboard-action-desc">Επίλεξε μαθητή και δημιούργησε προσχέδιο έκθεσης.</p>
        </div>

        <div className="dashboard-action-card">
          <Link to="/settings" className="dashboard-action-link">
            <span className="dashboard-action-icon">
              <Upload size={20} />
            </span>
            Εισαγωγή backup
          </Link>
          <p className="dashboard-action-desc">Επαναφορά δεδομένων από αρχείο JSON.</p>
        </div>
      </div>

      {/* Mobile-only συντόμευση — ένα tap στο πιο συχνό ξεκίνημα (ατομικό) χωρίς να χρειάζεται
          scroll μέχρι τις γρήγορες ενέργειες. Κρυφό σε tablet/desktop (βλ. Home.css) όπου η κάρτα
          παραπάνω είναι ήδη άμεσα ορατή. Ίδιο οπτικό pattern με το teaching-mode__fab. */}
      <Link to="/teaching/individual" className="dashboard-new-session-fab" aria-label="Νέα συνεδρία">
        <CalendarPlus size={20} aria-hidden="true" />
        Νέα συνεδρία
      </Link>

      <h2 className="dashboard-section-title">Πρόσφατη δραστηριότητα</h2>
      <div className="dashboard-activity">
        {!recentActivity || recentActivity.length === 0 ? (
          <div className="dashboard-empty">
            <Sparkles size={28} />
            <p className="dashboard-empty-title">Δεν υπάρχει ακόμα δραστηριότητα</p>
            <p className="dashboard-empty-description">Ξεκίνα μια συνεδρία για να εμφανιστεί εδώ.</p>
            <Link to="/teaching/individual" className="dashboard-empty-action">
              <PlayCircle size={16} />
              Νέα συνεδρία
            </Link>
          </div>
        ) : (
          recentActivity.map((a) => (
            <div key={a.id} className="dashboard-activity-row">
              <span className="dashboard-activity-icon">
                <CalendarDays size={18} />
              </span>
              <span className="dashboard-activity-text">
                Συνεδρία με {a.studentLabel}
                {a.durationMinutes ? ` — ${a.durationMinutes}′` : ''}
              </span>
              <span className="dashboard-activity-date">{formatDateEl(a.date)}</span>
            </div>
          ))
        )}
      </div>
    </AppShell>
  )
}
