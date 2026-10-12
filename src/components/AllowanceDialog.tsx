import { useState } from 'react'
import { useI18n } from '../i18n'
import { updateSettings } from '../db'
import { addDaysISO, daysBetween, todayISO } from '../lib/dates'
import { symbolFor } from '../lib/currency'
import { Icon } from './Icon'

interface Props {
  cycle: { allowance: number; cycleStart: string; nextAllowance: string }
  onClose: () => void
  onToast: (msg: string) => void
}

/**
 * Before a new budget is written, two questions: did the money actually
 * arrive, and is it the same amount as last time? Answering "no" to the
 * first one changes nothing — the current cycle stays untouched.
 */
export function AllowanceDialog({ cycle, onClose, onToast }: Props) {
  const { t, money, cur, lang } = useI18n()
  const [arrived, setArrived] = useState<boolean | null>(null)
  const [same, setSame] = useState<boolean | null>(null)
  const [amount, setAmount] = useState(cycle.allowance > 0 ? String(cycle.allowance) : '')
  const [error, setError] = useState<string | null>(null)

  const back = (
    <button
      className="btn btn-ghost"
      onClick={() => {
        setError(null)
        setSame(null)
      }}
      aria-label={t('common.back')}
    >
      <Icon name="back" className="h-4 w-4 rtl:rotate-180" />
    </button>
  )

  async function start() {
    const next = same ? cycle.allowance : parseFloat(amount)
    if (!next || next <= 0) {
      setError(t('allowance.needAmount'))
      return
    }
    const total = Math.max(1, daysBetween(cycle.cycleStart, cycle.nextAllowance))
    try {
      await updateSettings({
        allowance: next,
        cycleStart: todayISO(),
        nextAllowance: addDaysISO(todayISO(), total),
      })
    } catch (err) {
      console.error('could not start the new cycle', err)
      setError(t('storage.saveFailed'))
      return
    }
    onToast(t('allowance.started'))
    onClose()
  }

  const choice = (active: boolean) =>
    `flex-1 rounded-xl border px-4 py-3.5 text-sm font-semibold transition ${
      active
        ? 'border-crimson bg-crimson/20 text-bone'
        : 'border-white/10 bg-white/4 text-ash hover:bg-white/8'
    }`

  // Not arrived: say so and leave everything as it was.
  if (arrived === false) {
    return (
      <div className="flex flex-col gap-4 text-center">
        <div className="text-3xl">⏳</div>
        <p className="text-sm text-ash">{t('allowance.notYetSub')}</p>
        <div className="flex gap-2">
          <button
            className="btn btn-ghost"
            aria-label={t('common.back')}
            onClick={() => setArrived(null)}
          >
            <Icon name="back" className="h-4 w-4 rtl:rotate-180" />
          </button>
          <button className="btn btn-primary flex-1" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    )
  }

  if (arrived === null) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-center text-sm text-ash">{t('allowance.arrived')}</p>
        <div className="flex gap-2">
          <button className={choice(true)} onClick={() => setArrived(true)}>
            ✓ {t('allowance.yes')}
          </button>
          <button className={choice(false)} onClick={() => setArrived(false)}>
            ✕ {t('allowance.no')}
          </button>
        </div>
      </div>
    )
  }

  if (same === null) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-center text-sm text-ash">{t('allowance.same')}</p>
        <div className="flex gap-2">
          <button className={choice(true)} onClick={() => setSame(true)}>
            = {t('allowance.sameYes')}
          </button>
          <button className={choice(false)} onClick={() => setSame(false)}>
            ⇄ {t('allowance.sameNo')}
          </button>
        </div>
        <button
          className="btn btn-ghost"
          aria-label={t('common.back')}
          onClick={() => setArrived(null)}
        >
          <Icon name="back" className="h-4 w-4 rtl:rotate-180" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {same && (
        <div className="rounded-xl border border-white/10 bg-white/4 px-4 py-3 text-center">
          <div className="label mb-1">{t('settings.allowance')}</div>
          <div className="font-display text-3xl text-bone tabular">{money(cycle.allowance)}</div>
        </div>
      )}

      {!same && (
        <div>
          <div className="label mb-1.5">{t('allowance.amount')}</div>
          <div className="relative">
            <input
              type="number"
              inputMode="decimal"
              className="input pe-16 text-end font-display text-2xl"
              value={amount}
              min={1}
              autoFocus
              onChange={(e) => {
                setAmount(e.target.value)
                setError(null)
              }}
            />
            <span className="absolute inset-y-0 end-3 flex items-center text-sm text-ash">
              {symbolFor(cur, lang)}
            </span>
          </div>
        </div>
      )}

      {error && <div className="text-sm text-crimson-hi">⚠ {error}</div>}

      <div className="flex gap-2">
        {back}
        <button className="btn btn-primary flex-1" onClick={start}>
          <Icon name="check" className="h-4 w-4" />
          {t('allowance.confirm')}
        </button>
      </div>
    </div>
  )
}
