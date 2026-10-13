import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { useI18n } from '../i18n'
import type { Tab, Txn } from '../types'
import { catName, getCycle } from '../lib/finance'
import { fmtDate } from '../lib/format'
import { todayISO } from '../lib/dates'
import { Icon } from '../components/Icon'

interface Props {
  onEdit: (txn: Txn) => void
}

export function Ledger({ onEdit }: Props) {
  const { t, lang, money } = useI18n()
  const [scope, setScope] = useState<'cycle' | 'all'>('cycle')

  const settings = useLiveQuery(() => db.settings.get(1), [])
  const txns = useLiveQuery(() => db.txns.toArray(), []) ?? []
  const cats = useLiveQuery(() => db.categories.toArray(), []) ?? []

  const groups = useMemo(() => {
    let list = txns
    if (scope === 'cycle' && settings) {
      const cyc = getCycle(settings)
      list = list.filter((x) => x.date >= cyc.start)
    }
    list = [...list].sort((a, b) => b.date.localeCompare(a.date) || (b.id ?? 0) - (a.id ?? 0))
    const out: { date: string; items: Txn[]; total: number }[] = []
    for (const tx of list) {
      const last = out[out.length - 1]
      if (last && last.date === tx.date) {
        last.items.push(tx)
        last.total += tx.amount
      } else {
        out.push({ date: tx.date, items: [tx], total: tx.amount })
      }
    }
    return out
  }, [txns, scope, settings])

  const catMap = new Map(cats.map((c) => [c.id as number, c]))
  const today = todayISO()
  const yesterday = (() => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()

  const totalCount = groups.reduce((n, g) => n + g.items.length, 0)

  const segBtn = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
      active ? 'bg-crimson/85 text-on-accent' : 'text-ash hover:bg-white/8'
    }`

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex rounded-xl border border-white/10 bg-sunk p-1">
          <button className={segBtn(scope === 'cycle')} onClick={() => setScope('cycle')}>
            {t('ledger.cycle')}
          </button>
          <button className={segBtn(scope === 'all')} onClick={() => setScope('all')}>
            {t('ledger.all')}
          </button>
        </div>
        <span className="text-xs text-ash">{t('ledger.count', { n: totalCount })}</span>
      </div>

      {groups.length === 0 ? (
        <div className="panel flex flex-col items-center gap-2 px-5 py-10 text-center">
          <Icon name="ledger" className="h-8 w-8 text-ash" />
          <div className="text-lg font-semibold text-bone">{t('ledger.empty')}</div>
          <p className="text-sm text-ash">{t('ledger.emptySub')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((g) => (
            <div key={g.date}>
              <div className="mb-1.5 flex items-baseline justify-between px-1">
                <span className="label">
                  {g.date === today
                    ? t('common.today')
                    : g.date === yesterday
                      ? t('common.yesterday')
                      : fmtDate(g.date, lang)}
                </span>
                <span className="text-xs text-ash tabular">−{money(g.total)}</span>
              </div>
              <div className="panel divide-y divide-white/6 overflow-hidden">
                {g.items.map((tx) => {
                  const c = catMap.get(tx.categoryId)
                  return (
                    <button
                      key={tx.id}
                      onClick={() => onEdit(tx)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-start transition hover:bg-white/4"
                    >
                      <span className="text-xl">{c?.emoji ?? '·'}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-bone">
                          {c ? catName(c, lang) : '—'}
                          {tx.impulse && (
                            <span className="ms-1.5 text-[10px] text-crimson-hi">
                              {t('add.impulse')}
                            </span>
                          )}
                        </div>
                        {tx.note && <div className="truncate text-xs text-ash">{tx.note}</div>}
                      </div>
                      <span className="text-sm text-bone/90 tabular">−{money(tx.amount)}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
