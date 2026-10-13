import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, defaultCategories, updateSettings } from '../db'
import { useI18n } from '../i18n'
import type { Lang, Profile, Theme } from '../types'
import { eraseAll, exportBackup, exportCsv, importBackup, loadDemo } from '../lib/data'
import { CURRENCIES, symbolFor } from '../lib/currency'
import { PROFILES } from '../lib/finance'
import { exportReport, type ReportPeriod } from '../lib/pdf'
import { Icon } from '../components/Icon'
import { Sheet } from '../components/Sheet'
import { AllowanceDialog } from '../components/AllowanceDialog'

interface Props {
  onToast: (msg: string) => void
}

const LANGS: { code: Lang; native: string }[] = [
  { code: 'en', native: 'English' },
  { code: 'fr', native: 'Français' },
  { code: 'ar', native: 'العربية' },
]

export function Settings({ onToast }: Props) {
  const { t, lang, setLang, cur } = useI18n()
  const settings = useLiveQuery(() => db.settings.get(1), [])
  const [allowance, setAllowance] = useState('')
  const [allowanceOpen, setAllowanceOpen] = useState(false)
  const [reportBusy, setReportBusy] = useState<ReportPeriod | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const synced = useRef(false)

  useEffect(() => {
    if (settings && !synced.current) {
      setAllowance(settings.allowance > 0 ? String(settings.allowance) : '')
      synced.current = true
    }
  }, [settings])

  if (!settings) return null

  function commitAllowance() {
    const a = parseFloat(allowance)
    if (a > 0 && a !== settings?.allowance) void updateSettings({ allowance: a })
  }

  async function onImport(file: File | undefined) {
    if (!file) return
    const ok = await importBackup(file)
    onToast(ok ? t('settings.imported') : t('settings.importBad'))
    if (fileRef.current) fileRef.current.value = ''
  }

  async function onErase() {
    if (!window.confirm(t('settings.eraseConfirm'))) return
    await eraseAll()
    await db.categories.bulkAdd(defaultCategories().map((c) => ({ ...c })))
    await updateSettings({ setupDone: false, allowance: 0 })
  }

  async function onDemo() {
    if (!window.confirm(t('settings.demoConfirm'))) return
    await loadDemo()
    synced.current = false
    onToast(t('settings.demo'))
  }

  async function onReport(period: ReportPeriod) {
    if (reportBusy) return
    setReportBusy(period)
    try {
      const ok = await exportReport(period)
      onToast(t(ok ? 'report.done' : 'report.empty'))
    } catch (err) {
      console.error('could not build the report', err)
      onToast(t('storage.saveFailed'))
    } finally {
      setReportBusy(null)
    }
  }

  const btn = 'btn btn-ghost w-full justify-start text-start'
  const chip = (active: boolean) =>
    `rounded-xl border py-2.5 text-sm font-medium transition ${
      active ? 'border-crimson bg-crimson/25 text-bone' : 'border-white/10 bg-white/4 text-ash hover:bg-white/8'
    }`

  return (
    <div className="flex flex-col gap-6">
      {/* Language */}
      <section className="panel p-4">
        <div className="label mb-3">{t('settings.language')}</div>
        <div className="grid grid-cols-3 gap-2">
          {LANGS.map((l) => (
            <button key={l.code} onClick={() => setLang(l.code)} className={chip(lang === l.code)}>
              {l.native}
            </button>
          ))}
        </div>
      </section>

      {/* Appearance */}
      <section className="panel p-4">
        <div className="label mb-3">{t('settings.appearance')}</div>
        <div className="grid grid-cols-2 gap-2">
          {(['dark', 'light'] as Theme[]).map((th) => (
            <button
              key={th}
              onClick={() => void updateSettings({ theme: th })}
              className={`${chip(settings.theme === th)} flex items-center justify-center gap-2 py-3`}
            >
              <Icon name={th === 'dark' ? 'moon' : 'sun'} className="h-4 w-4" />
              {t(th === 'dark' ? 'settings.themeDark' : 'settings.themeLight')}
            </button>
          ))}
        </div>
      </section>

      {/* Currency */}
      <section className="panel p-4">
        <div className="label mb-3">{t('settings.currency')}</div>
        <select
          className="input"
          value={settings.currency}
          onChange={(e) => void updateSettings({ currency: e.target.value })}
          aria-label={t('settings.currency')}
        >
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} · {symbolFor(c, lang)} — {c.names[lang]}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs text-ash">
          {cur.code} · {cur.names[lang]} · {symbolFor(cur, lang)}
        </p>
      </section>

      {/* Profile */}
      <section className="panel p-4">
        <div className="label mb-1">{t('settings.profile')}</div>
        <p className="mb-3 text-xs text-ash">{t('settings.profileSub')}</p>
        <div className="grid grid-cols-3 gap-2">
          {PROFILES.map((p: Profile) => (
            <button
              key={p}
              onClick={() => void updateSettings({ profile: p })}
              className={`${chip(settings.profile === p)} py-3`}
            >
              {t(`profile.${p}`)}
            </button>
          ))}
        </div>
      </section>

      {/* Cycle */}
      <section className="panel p-4">
        <div className="label mb-3">{t('settings.cycle')}</div>
        <div className="grid gap-3">
          <div>
            <div className="label mb-1.5">{t('settings.allowance')}</div>
            <div className="relative">
              <input
                type="number"
                inputMode="decimal"
                className="input pe-16 text-end text-xl font-semibold"
                value={allowance}
                min={1}
                onChange={(e) => setAllowance(e.target.value)}
                onBlur={commitAllowance}
              />
              <span className="absolute inset-y-0 end-3 flex items-center text-sm text-ash">
                {symbolFor(cur, lang)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="label mb-1.5">{t('settings.cycleStart')}</div>
              <input
                type="date"
                className="input"
                value={settings.cycleStart}
                onChange={(e) =>
                  e.target.value && void updateSettings({ cycleStart: e.target.value })
                }
              />
            </div>
            <div>
              <div className="label mb-1.5">{t('settings.nextAllowance')}</div>
              <input
                type="date"
                className="input"
                value={settings.nextAllowance}
                onChange={(e) =>
                  e.target.value && void updateSettings({ nextAllowance: e.target.value })
                }
              />
            </div>
          </div>

          <button className="btn btn-primary w-full" onClick={() => setAllowanceOpen(true)}>
            {t('settings.logNew')}
          </button>
          <p className="-mt-1 text-center text-xs text-ash">{t('settings.logNewSub')}</p>
        </div>
      </section>

      {/* Data */}
      <section className="panel p-4">
        <div className="label mb-3">{t('settings.data')}</div>
        <div className="flex flex-col gap-2">
          <button
            className={btn}
            onClick={async () => {
              await exportBackup()
              onToast(t('settings.exported'))
            }}
          >
            <Icon name="download" className="h-4 w-4" />
            {t('settings.exportJson')}
          </button>
          <button className={btn} onClick={() => fileRef.current?.click()}>
            <Icon name="upload" className="h-4 w-4" />
            {t('settings.importJson')}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => onImport(e.target.files?.[0])}
          />
          <button
            className={btn}
            onClick={async () => {
              await exportCsv()
              onToast(t('settings.csvExported'))
            }}
          >
            <Icon name="file" className="h-4 w-4" />
            {t('settings.exportCsv')}
          </button>
          <button className={btn} onClick={onDemo}>
            <Icon name="sparkle" className="h-4 w-4" />
            {t('settings.demo')}
          </button>
          <button className="btn btn-danger w-full justify-start text-start" onClick={onErase}>
            <Icon name="trash" className="h-4 w-4" />
            {t('settings.erase')}
          </button>
        </div>
      </section>

      {/* Reports */}
      <section className="panel p-4">
        <div className="label mb-1">{t('settings.reports')}</div>
        <p className="mb-3 text-xs text-ash">{t('report.sub')}</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            className="btn btn-ghost flex-col py-3 text-xs"
            disabled={reportBusy != null}
            onClick={() => onReport('week')}
          >
            <Icon name={reportBusy === 'week' ? 'sparkle' : 'file'} className="h-5 w-5" />
            {t('report.week')}
          </button>
          <button
            className="btn btn-ghost flex-col py-3 text-xs"
            disabled={reportBusy != null}
            onClick={() => onReport('month')}
          >
            <Icon name={reportBusy === 'month' ? 'sparkle' : 'file'} className="h-5 w-5" />
            {t('report.month')}
          </button>
        </div>
      </section>

      {/* About */}
      <section className="panel p-4">
        <div className="mb-2 flex items-center gap-2">
          <Icon name="wallet" className="h-4 w-4 text-crimson" />
          <span className="wordmark text-sm text-bone">Moneta</span>
          <span className="text-xs text-ash/70">v1.0</span>
        </div>
        <p className="text-sm text-ash">{t('settings.about')}</p>
      </section>

      {/* New allowance flow */}
      <Sheet
        open={allowanceOpen}
        onClose={() => setAllowanceOpen(false)}
        title={t('allowance.title')}
      >
        <AllowanceDialog
          cycle={{
            allowance: settings.allowance,
            cycleStart: settings.cycleStart,
            nextAllowance: settings.nextAllowance,
          }}
          onClose={() => setAllowanceOpen(false)}
          onToast={onToast}
        />
      </Sheet>
    </div>
  )
}
