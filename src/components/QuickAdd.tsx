import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { useI18n } from '../i18n'
import type { Txn } from '../types'
import {
  catName,
  cycleTotals,
  daysFurther,
  getCycle,
  getForecast,
} from '../lib/finance'
import { fmtNum } from '../lib/format'
import { todayISO } from '../lib/dates'
import { symbolFor } from '../lib/currency'
import type { ToastAction } from '../types'
import { Icon } from './Icon'

interface Props {
  initial?: Txn | null
  onClose: () => void
  onToast: (msg: string, action?: ToastAction) => void
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫']

export function QuickAdd({ initial, onClose, onToast }: Props) {
  const { t, lang, cur } = useI18n()

  const cats = useLiveQuery(() => db.categories.orderBy('order').toArray(), []) ?? []
  const settings = useLiveQuery(() => db.settings.get(1), [])
  const goals = useLiveQuery(() => db.goals.toArray(), []) ?? []
  const txns = useLiveQuery(() => db.txns.toArray(), []) ?? []
  const contribs = useLiveQuery(() => db.contributions.toArray(), []) ?? []
  const fixed = useLiveQuery(() => db.fixedCosts.toArray(), []) ?? []

  const [amount, setAmount] = useState(initial ? String(initial.amount) : '')
  const [categoryId, setCategoryId] = useState<number | null>(initial?.categoryId ?? null)
  const [impulse, setImpulse] = useState(initial?.impulse ?? false)
  const [note, setNote] = useState(initial?.note ?? '')
  const [date, setDate] = useState(initial?.date ?? todayISO())
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Pre-save forecast, used for the trade-off toast.
  const tradeoff = useMemo(() => {
    if (!settings) return null
    const cyc = getCycle(settings)
    const tot = cycleTotals(txns, contribs, cyc.start)
    const fc = getForecast(settings, cyc, tot, fixed)
    return { safe: fc.safePerDay, goal: goals[0] }
  }, [settings, txns, contribs, fixed, goals])

  function press(key: string) {
    setError(null)
    if (key === '⌫') {
      setAmount((a) => a.slice(0, -1))
      return
    }
    if (key === '.' && amount.includes('.')) return
    if (amount.replace('.', '').length >= 8) return
    setAmount((a) => (a === '0' && key !== '.' ? key : a + key))
  }

  async function save() {
    if (saving) return
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) {
      setError(t('add.needAmount'))
      return
    }
    if (categoryId == null) {
      setError(t('add.needCategory'))
      return
    }
    const rec = { amount: amt, categoryId, impulse, note: note.trim() || undefined, date }
    setSaving(true)
    let savedId: number
    try {
      if (initial?.id != null) savedId = await db.txns.put({ ...initial, ...rec })
      else savedId = await db.txns.add(rec)
    } catch (err) {
      // Never fail silently: if the write did not land, say so and keep the
      // sheet open so nothing typed is lost.
      console.error('could not save the transaction', err)
      setSaving(false)
      setError(t('storage.saveFailed'))
      return
    }
    setSaving(false)
    // A fresh entry can be taken back with one tap — "saved by mistake" is
    // a normal thing to do, not a trip to the ledger.
    const undo: ToastAction | undefined =
      initial?.id == null
        ? {
            label: t('common.undo'),
            run: async () => {
              try {
                await db.txns.delete(savedId)
                onToast(t('add.undone'))
              } catch (err) {
                console.error('could not undo the transaction', err)
                onToast(t('storage.saveFailed'))
              }
            },
          }
        : undefined
    const goal = tradeoff?.goal
    if (goal && tradeoff.safe > 0) {
      onToast(
        impulse
          ? t('add.toastImpulse', {
              n: fmtNum(amt),
              d: daysFurther(amt, tradeoff.safe).toFixed(1),
              goal: goal.name,
            })
          : t('add.toastPlain', { n: fmtNum(amt) }),
        undo,
      )
    } else {
      onToast(t('add.toastPlain', { n: fmtNum(amt) }), undo)
    }
    onClose()
  }

  async function remove() {
    if (initial?.id == null) return
    if (!window.confirm(t('add.deleteConfirm'))) return
    try {
      await db.txns.delete(initial.id)
    } catch (err) {
      console.error('could not delete the transaction', err)
      setError(t('storage.saveFailed'))
      return
    }
    onClose()
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Amount + numpad */}
      <div className="panel panel-highlight px-4 py-3">
        <div className="label mb-1">{t('add.amount')}</div>
        <div className="flex items-baseline justify-end gap-2" dir="ltr">
          <span className="text-5xl font-semibold text-bone tabular">{amount || '0'}</span>
          <span className="text-xl text-ash">{symbolFor(cur, lang)}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((k) => (
          <button
            key={k}
            onClick={() => press(k)}
            className="rounded-xl border border-white/8 bg-white/5 py-3 text-xl font-medium text-bone transition hover:bg-white/8 active:bg-crimson/40"
          >
            {k}
          </button>
        ))}
      </div>

      {/* Categories */}
      <div>
        <div className="label mb-2">{t('add.category')}</div>
        <div className="flex flex-wrap gap-2">
          {cats.map((c) => {
            const selected = categoryId === c.id
            return (
              <button
                key={c.id}
                onClick={() => {
                  setCategoryId(c.id as number)
                  setError(null)
                }}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition ${
                  selected
                    ? 'border-crimson bg-crimson text-on-accent'
                    : 'border-white/12 bg-white/5 text-bone hover:bg-white/10'
                }`}
              >
                <span>{c.emoji}</span>
                <span>{catName(c, lang)}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Necessity / impulse */}
      <div>
        <div className="label mb-2">{t('add.type')}</div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setImpulse(false)}
            className={`rounded-xl border py-2.5 text-sm font-semibold transition ${
              !impulse
                ? 'border-white/25 bg-white/12 text-bone'
                : 'border-white/10 bg-white/4 text-ash hover:bg-white/8'
            }`}
          >
            {t('add.necessity')}
          </button>
          <button
            onClick={() => setImpulse(true)}
            className={`rounded-xl border py-2.5 text-sm font-semibold transition ${
              impulse
                ? 'border-crimson bg-crimson text-on-accent'
                : 'border-white/10 bg-white/4 text-ash hover:bg-white/8'
            }`}
          >
            {t('add.impulse')}
          </button>
        </div>
      </div>

      {/* Note + date */}
      <div className="grid gap-3">
        <input
          className="input"
          placeholder={t('add.notePlaceholder')}
          value={note}
          maxLength={80}
          onChange={(e) => setNote(e.target.value)}
        />
        <div>
          <div className="label mb-1.5">{t('add.date')}</div>
          <input
            type="date"
            className="input"
            value={date}
            max={todayISO()}
            onChange={(e) => setDate(e.target.value || todayISO())}
          />
        </div>
      </div>

      {error && <div className="text-sm text-crimson-hi">{error}</div>}

      <div className="flex gap-2">
        <button
          className="btn btn-primary flex-1 disabled:opacity-60"
          onClick={save}
          disabled={saving}
        >
          <Icon name="check" className="h-4 w-4" />
          {t('common.save')}
        </button>
        {initial?.id != null && (
          <button className="btn btn-danger" onClick={remove} aria-label={t('common.delete')}>
            <Icon name="trash" className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}
