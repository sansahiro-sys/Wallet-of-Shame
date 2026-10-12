import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { useI18n } from '../i18n'
import type { Tab } from '../types'
import type { RoastStatus } from '../lib/finance'
import {
  catName,
  cycleTotals,
  getCycle,
  getForecast,
  getRoast,
} from '../lib/finance'
import { fmtDate, fmtNum } from '../lib/format'
import { todayISO } from '../lib/dates'
import { symbolFor } from '../lib/currency'
import { Icon } from '../components/Icon'

interface Props {
  onNavigate: (tab: Tab) => void
  onAdd: () => void
}

const ROAST_STYLE: Record<RoastStatus, string> = {
  died: 'border-s-crimson-hi/70 bg-crimson/12',
  fire: 'border-s-crimson/70 bg-crimson/8',
  greed: 'border-s-bone/50 bg-white/6',
  clean: 'border-s-white/20 bg-white/4',
}

export function Home({ onNavigate, onAdd }: Props) {
  const { t, lang, money, cur } = useI18n()

  const settings = useLiveQuery(() => db.settings.get(1), [])
  const txns = useLiveQuery(() => db.txns.toArray(), []) ?? []
  const contribs = useLiveQuery(() => db.contributions.toArray(), []) ?? []
  const fixed = useLiveQuery(() => db.fixedCosts.toArray(), []) ?? []
  const cats = useLiveQuery(() => db.categories.toArray(), []) ?? []

  if (!settings) return null

  const today = todayISO()
  const cyc = getCycle(settings, today)
  const tot = cycleTotals(txns, contribs, cyc.start)
  const fc = getForecast(settings, cyc, tot, fixed)
  const roast = getRoast(settings, cyc, txns, contribs, fixed, today)

  const recent = [...txns]
    .sort((a, b) => b.date.localeCompare(a.date) || (b.id ?? 0) - (a.id ?? 0))
    .slice(0, 5)
  const catMap = new Map(cats.map((c) => [c.id as number, c]))

  const headLine = cyc.overdue
    ? t('home.overdueMsg')
    : cyc.left === 0
      ? t('home.allowanceDue')
      : t('home.daysLeft', { n: cyc.left })

  return (
    <div className="flex flex-col gap-4">
      {/* Hero: safe to spend */}
      <section className="panel panel-highlight relative overflow-hidden p-5">
        <div className="pointer-events-none absolute -top-20 left-1/2 h-44 w-72 -translate-x-1/2 rounded-full bg-crimson/25 blur-3xl" />
        <div className="relative">
          <div className="flex items-center justify-between gap-2">
            <span className="label">{headLine}</span>
            <span className="text-xs text-ash tabular">{fmtDate(cyc.end, lang)}</span>
          </div>

          {cyc.overdue ? (
            <button onClick={() => onNavigate('settings')} className="mt-3 block w-full text-start">
              <div className="font-display text-4xl text-bone glow-crimson tabular">
                {money(fc.available)}
              </div>
              <div className="label mt-1.5">→ {t('home.openSettings')}</div>
            </button>
          ) : fc.available <= 0 ? (
            <div className="mt-3">
              <div className="font-display text-5xl leading-none text-crimson-hi glow-crimson tabular">
                {money(0)}
              </div>
              <div className="label mt-2 text-crimson-hi">
                {fc.overBy > 0 ? t('home.overBudget', { n: fmtNum(fc.overBy) }) : t('home.nothingLeft')}
              </div>
            </div>
          ) : (
            <div className="mt-3">
              <div className="flex items-end gap-2" dir="ltr">
                <span className="font-display text-6xl leading-none text-bone glow-crimson tabular">
                  {fmtNum(fc.safePerDay)}
                </span>
                <span className="mb-1.5 font-display text-2xl text-ash">{symbolFor(cur, lang)}</span>
              </div>
              <div className="label mt-2">{t('home.safeToSpend')}</div>
            </div>
          )}

          {/* Depletion bar with time marker */}
          <div className="mt-4">
            <div className="relative h-2.5 overflow-visible rounded-full bg-white/8">
              <div
                className="h-full rounded-full bg-gradient-to-r from-crimson-dark to-crimson-hi"
                style={{ width: `${Math.min(100, Math.max(0, fc.usedPct))}%` }}
              />
              <div
                className="absolute -top-1 h-4.5 w-px bg-bone/80"
                style={{ insetInlineStart: `${Math.min(100, Math.max(0, cyc.elapsedPct))}%` }}
                title={t('home.timeGone', { n: cyc.elapsedPct })}
              />
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-ash tabular">
              <span>{t('home.moneyUsed', { n: fc.usedPct })}</span>
              <span>{t('home.timeGone', { n: cyc.elapsedPct })}</span>
            </div>
          </div>

          {/* Stat chips */}
          <div className="mt-4 grid grid-cols-4 gap-2 text-center">
            {(
              [
                [t('home.available'), fmtNum(fc.available)],
                [t('home.allowanceLbl'), fmtNum(settings.allowance)],
                [t('home.spent'), fmtNum(fc.spent)],
                [t('home.saved'), fmtNum(fc.saved)],
              ] as [string, string][]
            ).map(([label, value]) => (
              <div key={label} className="rounded-lg bg-sunk py-2">
                <div className="font-display text-sm text-bone tabular">{value}</div>
                <div className="mt-0.5 text-[9px] uppercase tracking-widest text-ash">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Weekly roast */}
      <section className={`panel border-s-4 p-4 ${ROAST_STYLE[roast.status]}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="label">{t('home.roastTitle')}</span>
          <span className="text-lg">{roast.status === 'died' ? '💀' : roast.status === 'fire' ? '🔥' : roast.status === 'greed' ? '🏆' : '✨'}</span>
        </div>
        <h3 className="mt-1 font-display text-lg text-bone">
          {t(`roast.${roast.status}.t` as 'roast.clean.t')}
        </h3>
        <p className="mt-1 text-sm text-ash">{t(roast.key)}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
          <span className="rounded-full bg-sunk px-2.5 py-1 text-bone/85 tabular">
            {t('home.weekSpent', { a: fmtNum(roast.spent), b: fmtNum(roast.weekBudget) })}
          </span>
          <span className="rounded-full bg-sunk px-2.5 py-1 text-crimson-hi/90 tabular">
            {t('home.weekImpulse', { n: fmtNum(roast.impulse) })}
          </span>
          <span className="rounded-full bg-sunk px-2.5 py-1 text-bone/85 tabular">
            {t('home.weekSaved', { n: fmtNum(roast.saved) })}
          </span>
        </div>
      </section>

      {/* Recent activity */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <span className="label">{t('home.recent')}</span>
          <button
            onClick={() => onNavigate('ledger')}
            className="flex items-center gap-1 text-xs text-ash transition hover:text-bone"
          >
            {t('home.seeAll')}
            <Icon name="back" className="h-3.5 w-3.5 rtl:rotate-180" />
          </button>
        </div>

        {recent.length === 0 ? (
          <div className="panel flex flex-col items-center gap-3 px-5 py-8 text-center">
            <div className="text-4xl">💀</div>
            <div>
              <div className="font-display text-lg text-bone">{t('home.emptyTitle')}</div>
              <p className="mt-1 text-sm text-ash">{t('home.emptySub')}</p>
            </div>
            <button className="btn btn-primary" onClick={onAdd}>
              <Icon name="plus" className="h-4 w-4" />
              {t('home.addExpense')}
            </button>
          </div>
        ) : (
          <div className="panel divide-y divide-white/6 overflow-hidden">
            {recent.map((tx) => {
              const c = catMap.get(tx.categoryId)
              return (
                <div key={tx.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="text-xl">{c?.emoji ?? '❓'}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-bone">
                      {c ? catName(c, lang) : '—'}
                      {tx.impulse && <span className="ms-1.5 text-crimson-hi">⚡</span>}
                    </div>
                    {tx.note && <div className="truncate text-xs text-ash">{tx.note}</div>}
                  </div>
                  <span className="text-sm text-bone/90 tabular">−{money(tx.amount)}</span>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
