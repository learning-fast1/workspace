import { test, expect } from '@playwright/test'

// Production smoke suite (review χρήστη) — μικρό, μόνιμο, ΜΟΝΟ read-only πλοήγηση. Καμία
// destructive ενέργεια (backup/restore/delete) εδώ σκόπιμα — αυτό παραμένει κάλυψη του vitest
// suite. Κάθε Playwright run ξεκινά από καθαρό, ephemeral browser context (καμία persisted
// IndexedDB) — δεν αγγίζει ΠΟΤΕ πραγματικά δεδομένα εκπαιδευτικού, ούτε στο post-deploy πέρασμα
// πάνω στο πραγματικό live URL.
//
// ΠΑΝΤΑ σχετικά goto('') / goto('#/...') — ΠΟΤΕ goto('/...') (θα αντικαθιστούσε το /workspace/
// base path αντί να παραμείνει κάτω από αυτό, βλ. playwright.config.js).

test.describe('production smoke', () => {
  test('η Αρχική φορτώνει καθαρά — τίτλος, greeting, μηδέν console/page errors', async ({ page }) => {
    const consoleErrors = []
    const pageErrors = []
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })
    page.on('pageerror', (err) => pageErrors.push(err.message))

    await page.goto('')
    await expect(page).toHaveTitle(/Workspace/)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Καλημέρα')

    expect(consoleErrors).toEqual([])
    expect(pageErrors).toEqual([])
  })

  test('το shell (Header/Sidebar/BottomNav) αποδίδεται — βασική πλοήγηση παρούσα', async ({ page }) => {
    await page.goto('')
    // Το κουδούνι ειδοποιήσεων ζει ΜΟΝΟ στο Header, μία φορά ανεξάρτητα από πλάτος οθόνης.
    await expect(page.getByRole('link', { name: 'Ειδοποιήσεις' })).toBeVisible()
    // Sidebar ΚΑΙ BottomNav αποδίδουν ΤΑ ΙΔΙΑ nav items ταυτόχρονα στο DOM (CSS εναλλάσσει
    // ορατότητα ανά πλάτος οθόνης, βλ. AppShell.css) — ελέγχουμε παρουσία, ΟΧΙ ορατότητα, ώστε
    // το test να μην εξαρτάται από το ποιο από τα δύο τυχαίνει να είναι ορατό σε αυτό το viewport.
    await expect(page.getByRole('link', { name: 'Μαθητές' }).first()).toBeAttached()
  })

  test('πλοήγηση σε /students φορτώνει χωρίς σφάλμα', async ({ page }) => {
    const pageErrors = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    await page.goto('#/students')
    await expect(page.getByRole('heading', { name: 'Μαθητές' })).toBeVisible()
    expect(pageErrors).toEqual([])
  })

  test('πλοήγηση σε /notifications φορτώνει χωρίς σφάλμα (πιο πρόσφατο route)', async ({ page }) => {
    const pageErrors = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    await page.goto('#/notifications')
    await expect(page.getByRole('heading', { name: 'Ειδοποιήσεις' })).toBeVisible()
    expect(pageErrors).toEqual([])
  })

  test('το base path /workspace/ είναι σωστό — URL, manifest ΚΑΙ service worker κάτω από αυτό', async ({ page, baseURL }) => {
    await page.goto('')
    expect(page.url()).toContain('/workspace/')

    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href')
    const manifestUrl = new URL(manifestHref, page.url())
    expect(manifestUrl.pathname).toMatch(/^\/workspace\//)

    const manifestResponse = await page.request.get(manifestUrl.href)
    expect(manifestResponse.ok()).toBeTruthy()

    const swUrl = new URL('sw.js', baseURL)
    const swResponse = await page.request.get(swUrl.href)
    expect(swResponse.ok()).toBeTruthy()
  })
})
