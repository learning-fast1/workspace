import { useLiveQuery } from 'dexie-react-hooks'
import { User } from 'lucide-react'
import { getDisplayName } from '../db.js'
import useAuth from '../auth/useAuth.js'
import { isSessionSyncActive } from '../migration/syncAuthorization.js'
import Card from './ui/Card.jsx'
import Badge from './ui/Badge.jsx'
import './TeacherProfileCard.css'

// Teacher Profile + Settings (UI Design, εγκεκριμένο mockup v3) — σύντομη, read-only περίληψη
// λογαριασμού πάνω από τα tabs του /settings. ΚΑΜΙΑ ενέργεια μέσα στην κάρτα η ίδια (login, sync
// activation, αλλαγή ονόματος ζουν στα αντίστοιχα tabs) — μόνο σύνοψη, ίδιο σκεπτικό με το γιατί
// το StudentProfileHero έχει actions αλλά αυτή η κάρτα σκόπιμα όχι.
//
// status==='disabled' ήδη κωδικοποιεί «CLOUD_ENABLED=false» (βλ. AuthProvider.jsx) — καμία
// ξεχωριστή εισαγωγή του ίδιου του CLOUD_ENABLED flag χρειάζεται εδώ.
export default function TeacherProfileCard() {
  const displayName = useLiveQuery(getDisplayName, [])
  const { status, email } = useAuth()

  const name = displayName || 'Εκπαιδευτικός'
  const initial = displayName ? displayName.trim().charAt(0).toUpperCase() : null

  return (
    <Card variant="soft" className="teacher-profile-card">
      <span className={`teacher-profile-card__avatar ${!initial ? 'teacher-profile-card__avatar--empty' : ''}`} aria-hidden="true">
        {initial || <User size={18} />}
      </span>
      <div className="teacher-profile-card__text">
        <div className="teacher-profile-card__name-row">
          <p className="teacher-profile-card__name">{name}</p>
          {status !== 'disabled' && status !== 'loggedIn' && (
            <Badge variant="neutral">Τοπική χρήση</Badge>
          )}
          {status === 'loggedIn' && (
            <>
              <Badge variant="success">Συνδεδεμένη</Badge>
              <Badge variant={isSessionSyncActive() ? 'success' : 'neutral'}>
                {isSessionSyncActive() ? 'Sync ενεργό' : 'Sync ανενεργό'}
              </Badge>
            </>
          )}
        </div>
        {status === 'loggedIn' && email && <p className="teacher-profile-card__email">{email}</p>}
      </div>
    </Card>
  )
}
