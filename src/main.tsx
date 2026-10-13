import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
// Cinzel is reserved for the Moneta wordmark only — numbers and labels stay Inter.
import '@fontsource/cinzel/600.css'
import '@fontsource/cinzel/700.css'
import './index.css'
import App from './App'
import { I18nProvider } from './i18n'
import { ensureSeed, migrateSettings, requestPersistentStorage } from './db'
import { initJournal, refreshJournal, restoreFromJournal } from './lib/journal'

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Opens/seeds the database, retrying: phone browsers occasionally fail first. */
async function openDatabase(): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await ensureSeed()
      return
    } catch (err) {
      console.error(`seed failed (attempt ${attempt})`, err)
      if (attempt >= 3) return
      await delay(300 * attempt)
    }
  }
}

async function boot(): Promise<void> {
  await openDatabase()

  initJournal()
  try {
    await restoreFromJournal()
  } catch (err) {
    console.error('could not restore from the safety copy', err)
  }
  // Older rows predate currency/theme/profile: give them defaults once.
  try {
    await migrateSettings()
  } catch (err) {
    console.error('could not migrate the settings row', err)
  }
  // Warm the safety copy even when this device has data but no journal yet.
  void refreshJournal()

  void requestPersistentStorage().then((ok) => {
    if (!ok) console.info('storage is best-effort: the browser may evict it')
  })
}

void boot()
  .catch((err) => console.error('boot failed', err))
  .finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <I18nProvider>
          <App />
        </I18nProvider>
      </StrictMode>,
    )
  })
