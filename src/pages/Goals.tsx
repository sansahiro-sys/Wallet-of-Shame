import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { useI18n } from '../i18n'
import type { Goal } from '../types'
import {
  cycleTotals,
  daysFurther,
  getCycle,
  getForecast,
  getGoalStats,
} from '../lib/finance'
import { fmtDate, fmtNum } from '../lib/format'
import { todayISO } from '../lib/dates'
import { Icon } from '../components/Icon'
import { Sheet } from '../components/Sheet'

interface Props {
  onToast: (msg: string) => void
}

export function Goals({ onToast }: Props) {
  const { t, lang, money } = useI18n()

  const settings = useLiveQuery(() => db.settings.get(1), [])
  const goals = useLiveQuery(() => db.goals.toArray(), []) ?? []
  const contribs = useLiveQuery(() => db.contributions.toArray(), []) ?? []
  const txns = useLiveQuery(() => db.txns.toArray(), []) ?? []
  const fixed = useLiveQuery(() => db.fixedCosts.toArray(), []) ?? []

  const [amounts, setAmounts] = useState<Record<number, string>>({})
  const [addOpen, setAddOpen] = useState(false)
  const [gName, setGName] = useState('')
  const [gTarget, setGTarget] = useState('')
  const [gError, setGError] = useState<string | null>(null)

  const safe =
    settings != null
      ? getForecast(
          settings,
          getCycle(settings),
          cycleTotals(txns, contribs, getCycle(settings).start),
          fixed,
        ).safePerDay
      : 0

  async function contribute(goal: Goal) {
    if (goal.id == null) return
    const a = parseFloat(amounts[goal.id] ?? '')
    if (!a || a <= 0) {
      onToast(t('goals.needAmount'))
      return
    }
    try {
      await db.contributions.add({ goalId: goal.id, amount: a, date: todayISO() })
    } catch (err) {
      console.error('could not save the contribution', err)
      onToast(t('storage.saveFailed'))
      return
    }
    setAmounts((m) => ({ ...m, [goal.id as number]: '' }))
    onToast(t('add.toastSaved', { n: fmtNum(a) }))
  }

  async function removeGoal(goal: Goal) {
    if (goal.id == null) return
    if (!window.confirm(t('goals.delConfirm'))) return
    try {
      await db.contributions.where('goalId').equals(goal.id).delete()
      await db.goals.delete(goal.id)
    } catch (err) {
      console.error('could not delete the goal', err)
      onToast(t('storage.saveFailed'))
    }
  }

  async function addGoal() {
    const target = parseFloat(gTarget)
    if (!gName.trim()) {
      setGError(t('goals.needName'))
      return
    }
    if (!target || target <= 0) {
      setGError(t('goals.needAmount'))
      return
    }
    try {
      await db.goals.add({ name: gName.trim(), target, createdAt: todayISO() })
    } catch (err) {
      console.error('could not save the goal', err)
      setGError(t('storage.saveFailed'))
      return
    }
    setGName('')
    setGTarget('')
    setGError(null)
    setAddOpen(false)
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="label">{t('goals.title')}</span>
        <button
          className="flex items-center gap-1 text-xs text-ash transition hover:text-bone"
          onClick={() => setAddOpen(true)}
        >
          <Icon name="plus" className="h-3.5 w-3.5" />
          {t('goals.add')}
        </button>
      </div>

      {goals.length === 0 ? (
        <div className="panel flex flex-col items-center gap-3 px-5 py-10 text-center">
          <div className="text-4xl">🎯</div>
          <p className="text-sm text-ash">{t('goals.empty')}</p>
          <button className="btn btn-primary" onClick={() => setAddOpen(true)}>
            <Icon name="plus" className="h-4 w-4" />
            {t('goals.add')}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {goals.map((g) => {
            const stats = getGoalStats(g, contribs)
            const done = stats.remaining === 0
            return (
              <section key={g.id} className="panel p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-display text-lg text-bone">{g.name}</h3>
                    <div className="text-xs text-ash tabular">
                      {money(stats.saved)} / {money(g.target)} · {t('goals.setAside')}
                    </div>
                  </div>
                  <button
                    onClick={() => removeGoal(g)}
                    aria-label={t('common.delete')}
                    className="rounded p-1.5 text-ash transition hover:bg-white/6 hover:text-crimson-hi"
                  >
                    <Icon name="trash" className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/8">
                  <div
                    className={`h-full rounded-full ${
                      done
                        ? 'bg-gradient-to-r from-bone/70 to-bone'
                        : 'bg-gradient-to-r from-crimson-dark to-crimson-hi'
                    }`}
                    style={{ width: `${stats.pct}%` }}
                  />
                </div>
                <div className="mt-1.5 flex justify-between text-[11px] text-ash tabular">
                  <span>{stats.pct}%</span>
                  <span className={done ? 'text-bone' : ''}>
                    {done ? t('goals.complete') : t('goals.toGo', { n: fmtNum(stats.remaining) })}
                  </span>
                </div>

                {!done && (
                  <div className="mt-2 space-y-1">
                    <div className="text-xs text-ash">
                      {stats.eta
                        ? t('goals.eta', { d: fmtDate(stats.eta, lang) })
                        : t('goals.etaUnknown')}
                    </div>
                    {safe > 0 && (
                      <div className="text-xs text-crimson-hi/90">
                        {t('goals.tradeoff', { n: Math.ceil(daysFurther(stats.remaining, safe)) })}
                      </div>
                    )}
                  </div>
                )}

                {!done && (
                  <div className="mt-3 flex gap-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      className="input flex-1"
                      placeholder={t('goals.contribute')}
                      value={amounts[g.id as number] ?? ''}
                      onChange={(e) =>
                        setAmounts((m) => ({ ...m, [g.id as number]: e.target.value }))
                      }
                    />
                    <button className="btn btn-primary px-4" onClick={() => contribute(g)}>
                      {t('common.add')}
                    </button>
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}

      {/* Add goal sheet */}
      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title={t('goals.add')}>
        <div className="flex flex-col gap-3">
          <input
            className="input"
            placeholder={t('goals.name')}
            value={gName}
            maxLength={50}
            onChange={(e) => {
              setGName(e.target.value)
              setGError(null)
            }}
          />
          <input
            type="number"
            inputMode="decimal"
            className="input"
            placeholder={t('goals.target')}
            value={gTarget}
            min={1}
            onChange={(e) => {
              setGTarget(e.target.value)
              setGError(null)
            }}
          />
          {gError && <div className="text-sm text-crimson-hi">⚠ {gError}</div>}
          <button className="btn btn-primary" onClick={addGoal}>
            {t('common.save')}
          </button>
        </div>
      </Sheet>
    </div>
  )
}
