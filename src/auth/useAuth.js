import { useContext } from 'react'
import { AuthContext } from './AuthProvider.jsx'

// { status, email, userId, error, actions: { login, submitEmail, submitOtp, cancel, logout } }
// status: 'disabled' | 'loggedOut' | 'emailEntry' | 'otpEntry' | 'loading' | 'loggedIn'
// 'disabled' μόνο όταν CLOUD_ENABLED === false (βλ. AuthProvider.jsx) — AccountSection.jsx δεν
// κάνει mount καθόλου σε αυτή την περίπτωση, αλλά το status εκτίθεται ούτως ή άλλως για ασφάλεια.
// userId: null εκτός από status==='loggedIn' — ΚΑΙ ΕΚΕΙ μπορεί θεωρητικά να είναι null (βλ.
// authStatus.js) — καταναλωτές (π.χ. LegacyDataMigrationSection) πρέπει να το ελέγχουν ρητά.
export default function useAuth() {
  const value = useContext(AuthContext)
  if (!value) {
    throw new Error('useAuth() πρέπει να καλείται μέσα σε <AuthProvider>.')
  }
  return value
}
