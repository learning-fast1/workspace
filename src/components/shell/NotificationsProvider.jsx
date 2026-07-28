import { createContext, useContext, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { todayLocalISO } from '../../utils/date.js'
import { loadNotificationCategories } from '../../utils/notificationData.js'
import { cleanupOrphanedNotificationState } from '../../db.js'

// Smart Notifications (review χρήστη, Notifications Inbox stage, σημείο 1) — ΕΝΑΣ κοινός
// useLiveQuery εδώ, μέσα στο AppShell (βλ. AppShell.jsx), αντί για ανεξάρτητο useLiveQuery στο
// Header, στο HomeAttentionWidget ΚΑΙ στο μελλοντικό Inbox — και τα τρία διαβάζουν ΤΩΡΑ το ΙΔΙΟ
// ήδη-υπολογισμένο αποτέλεσμα μέσω useNotifications() παρακάτω. ΚΑΝΕΝΑ νέο global persisted
// store — αυτό είναι απλά ένα React Context γύρω από το ΙΔΙΟ utils/notificationData.js loader.
// dismiss/snooze/unsnooze γράφουν στο notificationState table (db.js) — η Dexie live-query
// αναδιαγράφεται αυτόματα, άρα ΟΛΟΙ οι καταναλωτές (Header/widget/Inbox) ενημερώνονται μαζί,
// χωρίς χειροκίνητο refetch/invalidation.
const NotificationsContext = createContext(undefined)

export function NotificationsProvider({ children }) {
  const result = useLiveQuery(async () => {
    try {
      const { visible, snoozed, candidateIds } = await loadNotificationCategories(todayLocalISO())
      return { status: 'ok', visible, snoozed, candidateIds }
    } catch (err) {
      return { status: 'error', message: err?.message || 'Δεν ήταν δυνατή η φόρτωση ειδοποιήσεων.', visible: [], snoozed: [] }
    }
  }, [])

  // Cleanup ΕΚΤΟΣ του read-only useLiveQuery querier (Dexie πετάει ReadOnlyError αλλιώς, ίδιο
  // idiom με ensureDayGenerated στο TodayQueue.jsx) — ΜΙΑ φορά ανά υπολογισμό, εδώ στον κοινό
  // provider, όχι ξεχωριστά σε κάθε καταναλωτή. Καθαρίζει ΜΟΝΟ resolved/orphan state, βλ. db.js.
  useEffect(() => {
    if (result?.status !== 'ok') return
    cleanupOrphanedNotificationState(result.candidateIds).catch(() => {})
  }, [result])

  const value = result || { status: 'loading', visible: [], snoozed: [] }

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  )
}

// Πρέπει να καλείται μέσα σε <NotificationsProvider> (βλ. AppShell.jsx — τυλίγει ήδη Header +
// main + BottomNav, άρα κάθε σελίδα/route το έχει αυτόματα). Ρητό throw αντί για σιωπηλό
// undefined — προτιμότερο ένα σαφές, νωρίς σφάλμα ανάπτυξης από ένα αργότερα confusing crash.
export function useNotifications() {
  const ctx = useContext(NotificationsContext)
  if (ctx === undefined) {
    throw new Error('useNotifications() πρέπει να καλείται μέσα σε <NotificationsProvider> (βλ. AppShell.jsx).')
  }
  return ctx
}
