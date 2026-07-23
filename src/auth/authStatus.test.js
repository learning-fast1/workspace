import { describe, expect, it } from 'vitest'
import { deriveAuthStatus } from './authStatus.js'

describe('deriveAuthStatus — καθαρή συνάρτηση, χωρίς Dexie/React/δίκτυο', () => {
  it('χωρίς currentUser και χωρίς userInteraction → loggedOut', () => {
    expect(deriveAuthStatus({ currentUser: undefined, userInteraction: undefined }))
      .toEqual({ status: 'loggedOut', email: null, userId: null, error: null })
  })

  it('currentUser.isLoggedIn=true → loggedIn, με το email ΚΑΙ το userId', () => {
    expect(deriveAuthStatus({
      currentUser: { isLoggedIn: true, email: 'δασκάλα@example.com', userId: 'user-abc' },
      userInteraction: undefined
    })).toEqual({ status: 'loggedIn', email: 'δασκάλα@example.com', userId: 'user-abc', error: null })
  })

  it('currentUser.isLoggedIn=true ΧΩΡΙΣ userId (θεωρητικά δυνατό στο πραγματικό API) → userId:null, ΟΧΙ crash', () => {
    expect(deriveAuthStatus({
      currentUser: { isLoggedIn: true, email: 'δασκάλα@example.com' },
      userInteraction: undefined
    })).toEqual({ status: 'loggedIn', email: 'δασκάλα@example.com', userId: null, error: null })
  })

  it('userInteraction.type=email → emailEntry', () => {
    expect(deriveAuthStatus({
      currentUser: undefined,
      userInteraction: { type: 'email', alerts: [] }
    })).toEqual({ status: 'emailEntry', email: null, userId: null, error: null })
  })

  it('userInteraction.type=otp → otpEntry', () => {
    expect(deriveAuthStatus({
      currentUser: undefined,
      userInteraction: { type: 'otp', alerts: [] }
    })).toEqual({ status: 'otpEntry', email: null, userId: null, error: null })
  })

  it('currentUser.isLoading=true, χωρίς userInteraction → loading', () => {
    expect(deriveAuthStatus({
      currentUser: { isLoading: true },
      userInteraction: undefined
    })).toEqual({ status: 'loading', email: null, userId: null, error: null })
  })

  it('λάθος/ληγμένο OTP (alert INVALID_OTP πάνω στο otp prompt) → παραμένει otpEntry, ΜΕ error', () => {
    const result = deriveAuthStatus({
      currentUser: undefined,
      userInteraction: {
        type: 'otp',
        alerts: [{ type: 'error', messageCode: 'INVALID_OTP', message: 'invalid otp', messageParams: {} }]
      }
    })
    expect(result.status).toBe('otpEntry')
    expect(result.error).toEqual({ code: 'INVALID_OTP', message: 'Λάθος ή ληγμένος κωδικός. Δοκίμασε ξανά ή ζήτησε νέο κωδικό.' })
  })

  it('μη έγκυρο email (alert INVALID_EMAIL πάνω στο email prompt) → παραμένει emailEntry, ΜΕ error', () => {
    const result = deriveAuthStatus({
      currentUser: undefined,
      userInteraction: {
        type: 'email',
        alerts: [{ type: 'error', messageCode: 'INVALID_EMAIL', message: 'invalid email', messageParams: {} }]
      }
    })
    expect(result.status).toBe('emailEntry')
    expect(result.error.code).toBe('INVALID_EMAIL')
  })

  it('info alert (π.χ. OTP_SENT) ΔΕΝ παράγει error', () => {
    const result = deriveAuthStatus({
      currentUser: undefined,
      userInteraction: {
        type: 'otp',
        alerts: [{ type: 'info', messageCode: 'OTP_SENT', message: 'OTP sent', messageParams: {} }]
      }
    })
    expect(result.error).toBeNull()
  })

  it('άγνωστος messageCode → γενικό μήνυμα σφάλματος, ΟΧΙ undefined/crash', () => {
    const result = deriveAuthStatus({
      currentUser: undefined,
      userInteraction: {
        type: 'otp',
        alerts: [{ type: 'error', messageCode: 'SOME_FUTURE_CODE', message: 'κάτι νέο', messageParams: {} }]
      }
    })
    expect(result.error.message).toBe('κάτι νέο')
  })

  it('currentUser.isLoggedIn=false ΚΑΙ ενεργό otp userInteraction → προτεραιότητα στο userInteraction (otpEntry)', () => {
    // Στην πράξη: μέχρι να ολοκληρωθεί το login, isLoggedIn παραμένει false/undefined ενώ το
    // userInteraction ήδη ζητά OTP — το prompt έχει προτεραιότητα, όχι το ακόμα-όχι-loggedIn.
    const result = deriveAuthStatus({
      currentUser: { isLoggedIn: false },
      userInteraction: { type: 'otp', alerts: [] }
    })
    expect(result.status).toBe('otpEntry')
  })
})
