import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages: η εφαρμογή σερβίρεται σε learning-fast.com/workspace
export default defineConfig({
  base: '/workspace/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
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
    setupFiles: ['./src/test/setup.js']
  }
})
