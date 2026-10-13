import { useState } from 'react'
import { useI18n } from '../i18n'
import { db, updateSettings } from '../db'
import type { Lang, Profile } from '../types'
import { addDaysISO, todayISO } from '../lib/dates'
import { CURRENCIES, getCurrency, symbolFor } from '../lib/currency'
import { fmtMoney } from '../lib/format'
import { PROFILES } from '../lib/finance'
import { Icon } from './Icon'

interface BillRow {
  name: string
  amount: string
}

const LANGS: { code: Lang; label: string; native: string }[] = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'fr', label: 'French', native: 'Français' },
  { code: 'ar', label: 'Arabic', native: 'العربية' },
]

const TOTAL_STEPS = 6

export function SetupWizard() {
  const { t, lang, setLang, cur } = useI18n()
  const [step, setStep] = useState(0)
  const [currency, setCurrency] = useState(cur.code)
  const [profile, setProfile] = useState<Profile>('student')
  const [allowance, setAllowance] = useState('900')
  const [nextDate, setNextDate] = useState(addDaysISO(todayISO(), 30))
  const [bills, setBills] = useState<BillRow[]>([
    { name: 'Internet', amount: '200' },
    { name: 'Phone plan', amount: '50' },
  ])
  const [goalName, setGoalName] = useState('')
  const [goalTarget, setGoalTarget] = useState('')
  const [error, setError] = useState<string | null>(null)

  const picked = getCurrency(currency)

  function setBill(i: number, patch: Partial<BillRow>) {
    setBills((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  function next() {
    setError(null)
    if (step === 3) {
      const amt = parseFloat(allowance)
      if (!amt || amt <= 0) {
        setError(t('setup.needAllowance'))
        return
      }
    }
    setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1))
  }

  async function finish() {
    setError(null)
    const amt = parseFloat(allowance)
    if (!amt || amt <= 0) {
      setError(t('setup.needAllowance'))
      setStep(3)
      return
    }
    try {
      // One transaction: either the whole setup lands, or nothing does.
      await db.transaction('rw', [db.settings, db.fixedCosts, db.goals], async () => {
        await updateSettings({
          currency,
          profile,
          allowance: amt,
          cycleStart: todayISO(),
          nextAllowance: nextDate,
          setupDone: true,
        })
        for (const b of bills) {
          const a = parseFloat(b.amount)
          if (b.name.trim() && a > 0) {
            await db.fixedCosts.add({ name: b.name.trim(), amount: a, active: true })
          }
        }
        const target = parseFloat(goalTarget)
        if (goalName.trim() && target > 0) {
          await db.goals.add({ name: goalName.trim(), target, createdAt: todayISO() })
        }
      })
    } catch (err) {
      console.error('could not finish the setup', err)
      setError(t('storage.saveFailed'))
    }
  }

  const chip = (active: boolean) =>
    `rounded-xl border px-4 py-3 transition ${
      active
        ? 'border-crimson bg-crimson/15 text-bone'
        : 'border-white/10 bg-white/4 text-ash hover:bg-white/8'
    }`

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink px-4 py-8">
      <div className="mx-auto flex min-h-full max-w-md flex-col justify-center">
        <div className="panel panel-highlight p-6">
          {/* Progress */}
          <div className="mb-6 flex items-center justify-between">
            <div className="flex gap-1.5">
              {Array.from({ length: TOTAL_STEPS }, (_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i <= step ? 'w-6 bg-crimson' : 'w-3 bg-white/15'
                  }`}
                />
              ))}
            </div>
            <span className="label">{t('setup.step', { n: step + 1, t: TOTAL_STEPS })}</span>
          </div>

          {step === 0 && (
            <div className="flex flex-col gap-4">
              <div className="text-center">
                <div className="mb-3 flex justify-center text-crimson">
                  <Icon name="wallet" className="h-10 w-10" />
                </div>
                <h1 className="wordmark text-2xl text-bone">{t('brand.name')}</h1>
                <p className="mt-1.5 text-sm text-ash">{t('brand.tagline')}</p>
                <p className="mt-3 text-sm text-ash">{t('setup.welcomeSub')}</p>
              </div>
              <div>
                <div className="label mb-2">{t('setup.langTitle')}</div>
                <div className="grid gap-2">
                  {LANGS.map((l) => (
                    <button
                      key={l.code}
                      onClick={() => setLang(l.code)}
                      className={`flex items-center justify-between ${chip(lang === l.code)}`}
                    >
                      <span className="font-medium">{l.native}</span>
                      <span className="text-xs uppercase tracking-widest">{l.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-xl font-semibold text-bone">{t('setup.currencyTitle')}</h2>
                <p className="mt-1 text-sm text-ash">{t('setup.currencySub')}</p>
              </div>
              <select
                className="input"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                aria-label={t('setup.currencyTitle')}
                autoFocus
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} · {symbolFor(c, lang)} — {c.names[lang]}
                  </option>
                ))}
              </select>
              <div className="rounded-xl border border-white/10 bg-white/4 px-4 py-3 text-center">
                <div className="text-3xl font-semibold text-bone tabular">
                  {fmtMoney(1234, currency, lang)}
                </div>
                <div className="label mt-1">{picked.code} · {picked.names[lang]}</div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-xl font-semibold text-bone">{t('setup.profileTitle')}</h2>
                <p className="mt-1 text-sm text-ash">{t('setup.profileSub')}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {PROFILES.map((p) => (
                  <button
                    key={p}
                    onClick={() => setProfile(p)}
                    className={`rounded-xl border px-3 py-4 text-sm font-medium transition ${
                      profile === p
                        ? 'border-crimson bg-crimson/15 text-bone'
                        : 'border-white/10 bg-white/4 text-ash hover:bg-white/8'
                    }`}
                  >
                    {t(`profile.${p}`)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-4">
              <h2 className="text-xl font-semibold text-bone">{t('setup.allowanceTitle')}</h2>
              <div>
                <div className="label mb-1.5">{t('setup.allowanceLbl')}</div>
                <div className="relative">
                  <input
                    type="number"
                    inputMode="decimal"
                    className="input pe-16 text-end text-2xl font-semibold"
                    value={allowance}
                    min={1}
                    onChange={(e) => setAllowance(e.target.value)}
                    autoFocus
                  />
                  <span className="absolute inset-y-0 end-3 flex items-center text-sm text-ash">
                    {symbolFor(picked, lang)}
                  </span>
                </div>
              </div>
              <div>
                <div className="label mb-1.5">{t('setup.nextLbl')}</div>
                <input
                  type="date"
                  className="input"
                  value={nextDate}
                  min={todayISO()}
                  onChange={(e) => setNextDate(e.target.value || addDaysISO(todayISO(), 30))}
                />
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-xl font-semibold text-bone">{t('setup.billsTitle')}</h2>
                <p className="mt-1 text-sm text-ash">{t('setup.billsSub')}</p>
              </div>
              <div className="flex flex-col gap-2">
                {bills.map((b, i) => (
                  <div key={i} className="grid grid-cols-[1fr_110px] gap-2">
                    <input
                      className="input"
                      placeholder={t('setup.billPh')}
                      value={b.name}
                      onChange={(e) => setBill(i, { name: e.target.value })}
                    />
                    <input
                      type="number"
                      inputMode="decimal"
                      className="input text-end"
                      placeholder="0"
                      value={b.amount}
                      onChange={(e) => setBill(i, { amount: e.target.value })}
                    />
                  </div>
                ))}
              </div>
              <button
                className="btn btn-ghost"
                onClick={() => setBills((rows) => [...rows, { name: '', amount: '' }])}
              >
                <Icon name="plus" className="h-4 w-4" />
                {t('budgets.addBill')}
              </button>
            </div>
          )}

          {step === 5 && (
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-xl font-semibold text-bone">{t('setup.goalTitle')}</h2>
                <p className="mt-1 text-sm text-ash">{t('setup.goalSub')}</p>
              </div>
              <input
                className="input"
                placeholder={t('setup.goalPh')}
                value={goalName}
                maxLength={50}
                onChange={(e) => setGoalName(e.target.value)}
              />
              <input
                type="number"
                inputMode="decimal"
                className="input"
                placeholder={t('setup.targetPh')}
                value={goalTarget}
                min={1}
                onChange={(e) => setGoalTarget(e.target.value)}
              />
            </div>
          )}

          {error && <div className="mt-4 text-sm text-crimson-hi">{error}</div>}

          {/* Actions */}
          <div className="mt-6 flex items-center gap-3">
            {step > 0 && (
              <button
                className="btn btn-ghost"
                aria-label={t('common.back')}
                onClick={() => setStep((s) => s - 1)}
              >
                <Icon name="back" className="h-4 w-4 rtl:rotate-180" />
              </button>
            )}
            {step < TOTAL_STEPS - 1 ? (
              <button className="btn btn-primary flex-1" onClick={next}>
                →
              </button>
            ) : (
              <>
                <button className="btn btn-ghost flex-1" onClick={finish}>
                  {t('setup.skip')}
                </button>
                <button className="btn btn-primary flex-1" onClick={finish}>
                  {t('setup.finish')}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
