import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages: η εφαρμογή σερβίρεται σε learning-fast.com/workspace
export default defineConfig({
  base: '/workspace/',
  plugins: [
    react(),
    VitePWA({
      // Backlog fix (review χρήστη — «update-available UX» αντί για σιωπηλή ενημέρωση): με
      // 'autoUpdate' το Workbox ενεργοποιεί/reload-άρει τη νέα έκδοση ΧΩΡΙΣ να ρωτήσει — ρίσκο
      // απώλειας ημιτελούς φόρμας αν ο εκπαιδευτικός βρίσκεται μέσα σε Teaching Mode/φόρμα τη
      // στιγμή που ενεργοποιείται. 'prompt' αφήνει την εφαρμογή (main.jsx registerSW onNeedRefresh
      // → components/PwaUpdateBanner.jsx) να δείξει ορατή ειδοποίηση, ο χρήστης αποφασίζει ΠΟΤΕ.
      registerType: 'prompt',
      includeAssets: ['icons/icon.svg'],
      manifest: {
        name: 'Workspace Ειδικού Παιδαγωγού',
        short_name: 'Workspace',
        description: 'Καταγραφή στόχων και προόδου μαθητών',
        start_url: '/workspace/',
        scope: '/workspace/',
        display: 'standalone',
        background_color: '#f3ecdd',
        theme_color: '#c9a876',
        lang: 'el',
        icons: [
          {
            src: 'icons/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg}']
      }
    })
  ],
  test: {
    environment: 'node',
    // Τα *.test.jsx (component tests, Στάδιο 3+) χρειάζονται πραγματικό DOM (React Testing
    // Library) — τα *.test.js (πλειοψηφία, pure-logic/Dexie) παραμένουν στο ελαφρύ 'node' όπως πριν,
    // καμία επιβάρυνση/ρίσκο για την υπάρχουσα σουίτα.
    environmentMatchGlobs: [['**/*.test.jsx', 'jsdom']],
    setupFiles: ['./src/test/setup.js'],
    // Playwright ζει σε δικό του runtime/config (playwright.config.js, testDir: './e2e') — defense-
    // in-depth ώστε το vitest να μην προσπαθήσει ΠΟΤΕ να τρέξει *.spec.js αρχεία εκεί μέσα με λάθος
    // test runner, ανεξάρτητα από το ακριβές default include pattern του vitest.
    exclude: [...configDefaults.exclude, 'e2e/**']
  }
})
