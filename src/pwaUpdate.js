// Μικρό external store (useSyncExternalStore, βλ. components/PwaUpdateBanner.jsx) για το «νέα
// έκδοση διαθέσιμη» σήμα του service worker. ΟΧΙ Context/Provider — useSyncExternalStore είναι το
// σωστό εργαλείο React για κατάσταση που ζει ΕΚΤΟΣ React (ίδιο idiom με οποιοδήποτε browser API),
// και αποφεύγει να τυλίξουμε ολόκληρο το App σε ένα ακόμη Provider για ένα μοναδικό boolean.
//
// Γεμίζεται από το registerSW({ onNeedRefresh }) στο main.jsx — ΠΡΕΠΕΙ να τρέχει πολύ νωρίς, πριν
// καν αποδοθεί το React tree (βλ. σχόλιο main.jsx), άρα δεν μπορεί να είναι το ίδιο ένα React hook.
let needRefresh = false
let applyUpdateFn = null
const listeners = new Set()

export function setUpdateAvailable(updateSW) {
  needRefresh = true
  applyUpdateFn = updateSW
  listeners.forEach((listener) => listener())
}

export function getNeedRefresh() {
  return needRefresh
}

export function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// reloadPage:true — βλ. vite-plugin-pwa updateSW(reloadPage): ενεργοποιεί τον νέο service worker
// ΚΑΙ ξαναφορτώνει τη σελίδα, ίδιο τελικό αποτέλεσμα με το παλιό 'autoUpdate' αλλά τώρα με ρητή
// συναίνεση του χρήστη αντί για σιωπηλό, απρόβλεπτο reload.
export function applyUpdate() {
  applyUpdateFn?.(true)
}
