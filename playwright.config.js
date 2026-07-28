import { defineConfig, devices } from '@playwright/test'

// Readiness blockers v1 (review χρήστη) — μικρό, μόνιμο production-smoke suite. ΔΥΟ χρήσεις της
// ΙΔΙΑΣ σουίτας (βλ. .github/workflows/deploy.yml):
//   1) pre-deploy: ΧΩΡΙΣ PLAYWRIGHT_BASE_URL → τρέχει πάνω σε ΤΟΠΙΚΟ `npm run preview` (πραγματικό
//      production build, ΟΧΙ dev server) — αποτυχία ΜΠΛΟΚΑΡΕΙ το deploy.
//   2) post-deploy: ΜΕ PLAYWRIGHT_BASE_URL=<πραγματικό GitHub Pages URL> → χτυπάει απευθείας το ήδη
//      δημοσιευμένο URL, ΚΑΜΙΑ τοπική webServer εκκίνηση.
//
// baseURL ΠΡΕΠΕΙ να τελειώνει σε '/workspace/' (το ίδιο base path με vite.config.js) — τα tests
// χρησιμοποιούν ΠΑΝΤΑ σχετικά goto('') / goto('#/...') (ΠΟΤΕ goto('/...')) ώστε να παραμένουν ΚΑΤΩ
// από αυτό το base path αντί να το αντικαθιστούν (γνωστή παγίδα URL resolution του Playwright).
const explicitBaseURL = process.env.PLAYWRIGHT_BASE_URL
// Εγγύηση trailing slash — π.χ. το page_url output του actions/deploy-pages ΔΕΝ εγγυάται κατάληξη
// σε '/'· χωρίς αυτήν, ΚΑΘΕ new URL('sw.js', baseURL)-style σχετική διεύθυνση (βλ. e2e/smoke.spec.js)
// θα έχανε σιωπηλά το τελευταίο τμήμα του path (URL resolution rules), χτυπώντας λάθος endpoint.
const normalizedExplicitBaseURL = explicitBaseURL && !explicitBaseURL.endsWith('/')
  ? `${explicitBaseURL}/`
  : explicitBaseURL
const baseURL = normalizedExplicitBaseURL || 'http://localhost:4173/workspace/'
const isLocalPreview = !explicitBaseURL

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ],
  // ΜΟΝΟ στην τοπική/pre-deploy χρήση (καμία PLAYWRIGHT_BASE_URL) — το production build σερβίρεται
  // με `npm run preview` (ΟΧΙ `npm run dev`, review χρήστη: πρέπει να είναι το πραγματικό build,
  // ίδιο minify/base-path/service-worker συμπεριφορά με το πραγματικό deploy).
  webServer: isLocalPreview ? {
    command: 'npm run preview',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60000
  } : undefined
})
