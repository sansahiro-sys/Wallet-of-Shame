import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { useI18n, type Dict } from './i18n'
import { recoveredCount } from './lib/journal'
import type { Tab, Txn } from './types'
import { Home } from './pages/Home'
import { Ledger } from './pages/Ledger'
import { Budgets } from './pages/Budgets'
import { Goals } from './pages/Goals'
import { Settings } from './pages/Settings'
import { QuickAdd } from './components/QuickAdd'
import { Sheet } from './components/Sheet'
import { SetupWizard } from './components/SetupWizard'
import { Icon, type IconName } from './components/Icon'

const NAV: { key: Tab; icon: IconName; label: keyof Dict }[] = [
  { key: 'home', icon: 'home', label: 'nav.home' },
  { key: 'ledger', icon: 'ledger', label: 'nav.ledger' },
  { key: 'budgets', icon: 'budgets', label: 'nav.budgets' },
  { key: 'goals', icon: 'goals', label: 'nav.goals' },
]

const SUBTITLE: Record<Tab, keyof Dict> = {
  home: 'nav.home',
  ledger: 'nav.ledger',
  budgets: 'nav.budgets',
  goals: 'nav.goals',
  settings: 'nav.settings',
}

type SheetState = { kind: 'add' } | { kind: 'edit'; txn: Txn } | null

export default function App() {
  const { t } = useI18n()

  const settings = useLiveQuery(() => db.settings.get(1), [])
  const [tab, setTab] = useState<Tab>('home')
  const prevTab = useRef<Tab>('home')
  const [sheet, setSheet] = useState<SheetState>(null)
  const [toast, setToast] = useState<{ id: number; msg: string } | null>(null)

  function go(next: Tab) {
    if (next !== 'settings') prevTab.current = next
    setTab(next)
  }

  function showToast(msg: string) {
    setToast({ id: Date.now() + Math.random(), msg })
  }

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 4200)
    return () => window.clearTimeout(id)
  }, [toast])

  // Entries that IndexedDB had lost were put back at boot — say so.
  useEffect(() => {
    const n = recoveredCount()
    if (n > 0) showToast(t('storage.recovered', { n }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Light/dark theme lives on <html> so the boot screen matches too.
  const theme = settings?.theme ?? 'dark'
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'light' ? '#f4f1ea' : '#0a0708')
  }, [theme])

  // Boot screen while the DB opens
  if (!settings) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <div
          className="h-10 w-10 rotate-45 border-2 border-crimson bg-crimson/30"
          style={{ animation: 'ember-pulse 1.6s ease-in-out infinite' }}
        />
        <div className="label">{t('boot.loading')}</div>
      </div>
    )
  }

  if (!settings.setupDone) return <SetupWizard />

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-white/6 bg-ink/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-md items-center gap-3 px-4 py-3">
          {tab === 'settings' ? (
            <button
              onClick={() => setTab(prevTab.current)}
              aria-label={t('common.close')}
              className="rounded-lg p-1.5 text-ash transition hover:bg-white/6 hover:text-bone"
            >
              <Icon name="back" className="h-5 w-5 rtl:rotate-180" />
            </button>
          ) : (
            <span className="flex h-8 w-8 items-center justify-center">
              <span className="h-3.5 w-3.5 rotate-45 border-2 border-crimson bg-crimson/40" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[13px] uppercase tracking-[0.3em] text-bone">
              Wallet of Shame
            </h1>
            <div className="text-[10px] uppercase tracking-[0.2em] text-ash">
              {t(SUBTITLE[tab])}
            </div>
          </div>
          {tab !== 'settings' && (
            <button
              onClick={() => setTab('settings')}
              aria-label={t('nav.settings')}
              className="rounded-lg p-2 text-ash transition hover:bg-white/6 hover:text-bone"
            >
              <Icon name="settings" className="h-5 w-5" />
            </button>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto w-full max-w-md px-4 pb-32 pt-4">
        {tab === 'home' && <Home onNavigate={go} onAdd={() => setSheet({ kind: 'add' })} />}
        {tab === 'ledger' && <Ledger onEdit={(txn) => setSheet({ kind: 'edit', txn })} />}
        {tab === 'budgets' && <Budgets />}
        {tab === 'goals' && <Goals onToast={showToast} />}
        {tab === 'settings' && <Settings onToast={showToast} />}
      </main>

      {/* FAB */}
      {tab !== 'settings' && (
        <button
          onClick={() => setSheet({ kind: 'add' })}
          aria-label={t('add.title')}
          style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom))' }}
          className="fixed left-1/2 z-40 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full border border-white/25 bg-gradient-to-b from-crimson-hi to-crimson-dark text-on-accent shadow-[0_12px_32px_rgba(164,22,26,0.55)] transition hover:brightness-110 active:scale-95"
        >
          <Icon name="plus" className="h-7 w-7" />
        </button>
      )}

      {/* Bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/8 bg-ink/92 backdrop-blur">
        <div className="mx-auto grid w-full max-w-md grid-cols-4">
          {NAV.map(({ key, icon, label }) => {
            const active = tab === key
            return (
              <button
                key={key}
                onClick={() => go(key)}
                className={`flex flex-col items-center gap-1 py-2.5 transition ${
                  active ? 'text-crimson-hi' : 'text-ash hover:text-bone'
                }`}
              >
                <Icon name={icon} className="h-5 w-5" />
                <span className={`text-[10px] tracking-wide ${active ? 'font-semibold' : ''}`}>
                  {t(label)}
                </span>
              </button>
            )
          })}
        </div>
        <div style={{ height: 'env(safe-area-inset-bottom)' }} />
      </nav>

      {/* Quick add / edit sheet */}
      <Sheet
        open={sheet != null}
        onClose={() => setSheet(null)}
        title={sheet?.kind === 'edit' ? t('add.editTitle') : t('add.title')}
      >
        {sheet && (
          <QuickAdd
            initial={sheet.kind === 'edit' ? sheet.txn : null}
            onClose={() => setSheet(null)}
            onToast={showToast}
          />
        )}
      </Sheet>

      {/* Toast */}
      {toast && (
        <div
          key={toast.id}
          className="anim-toast fixed left-1/2 z-50 w-[92%] max-w-md -translate-x-1/2"
          style={{ bottom: 'calc(9.5rem + env(safe-area-inset-bottom))' }}
        >
          <div className="panel panel-highlight px-4 py-3 text-center text-sm text-bone">
            {toast.msg}
          </div>
        </div>
      )}
    </div>
  )
}
