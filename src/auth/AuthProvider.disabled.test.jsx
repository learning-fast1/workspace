import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import AuthProvider from './AuthProvider.jsx'
import useAuth from './useAuth.js'

// ΚΑΜΙΑ μεταβλητή VITE_DEXIE_CLOUD_URL είναι ορισμένη στο test environment από προεπιλογή
// (ίδιο με ΟΛΑ τα υπόλοιπα *.test.jsx — βλ. vite.config.js) — άρα CLOUD_ENABLED είναι ήδη false
// εδώ, με το ΠΡΑΓΜΑΤΙΚΟ db.js, καμία ανάγκη για mock. Αυτό είναι ακριβώς το σενάριο «flag off»
// του Technical Plan.
function Probe() {
  const { status } = useAuth()
  return <p>status: {status}</p>
}

describe('AuthProvider — CLOUD_ENABLED=false (flag off, προεπιλογή test env)', () => {
  it('useAuth() επιστρέφει status "disabled", ΚΑΜΙΑ προσπάθεια πρόσβασης σε db.cloud', () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    )
    expect(screen.getByText('status: disabled')).toBeInTheDocument()
  })
})
