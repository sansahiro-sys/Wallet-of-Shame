import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { useI18n } from '../i18n'
import type { Category, FixedCost } from '../types'
import { budgetSpentByCategory, catName, getCycle, sum } from '../lib/finance'
import { fmtNum } from '../lib/format'
import { symbolFor } from '../lib/currency'
import { Icon } from '../components/Icon'
import { Sheet } from '../components/Sheet'

export function Budgets() {
  const { t, lang, cur } = useI18n()

  const settings = useLiveQuery(() => db.settings.get(1), [])
  const cats = useLiveQuery(() => db.categories.orderBy('order').toArray(), []) ?? []
  const txns = useLiveQuery(() => db.txns.toArray(), []) ?? []
  const fixed = useLiveQuery(() => db.fixedCosts.toArray(), []) ?? []

  const [billName, setBillName] = useState('')
  const [billAmount, setBillAmount] = useState('')
  const [billError, setBillError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Category | null>(null)

  const cyc = settings ? getCycle(settings) : null
  const spentMap = cyc ? budgetSpentByCategory(txns, cyc.start) : {}
  const reserved = sum(fixed.filter((f) => f.active).map((f) => f.amount))

  async function addBill() {
    const a = parseFloat(billAmount)
    if (!billName.trim()) {
      setBillError(t('budgets.billNameRequired'))
      return
    }
    if (!a || a <= 0) {
      setBillError(t('add.needAmount'))
      return
    }
    await db.fixedCosts.add({ name: billName.trim(), amount: a, active: true })
    setBillName('')
    setBillAmount('')
    setBillError(null)
  }

  async function toggleBill(b: FixedCost) {
    if (b.id == null) return
    await db.fixedCosts.put({ ...b, active: !b.active })
  }

  async function removeBill(b: FixedCost) {
    if (b.id == null) return
    await db.fixedCosts.delete(b.id)
  }

  function newCategory() {
    const lastOrder = cats.length > 0 ? (cats[cats.length - 1].order ?? 0) : 0
    setEditing({
      emoji: '✦',
      names: { en: 'New category', fr: 'Nouvelle catégorie', ar: 'فئة جديدة' },
      budget: 0,
      order: lastOrder + 1,
    })
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Fixed bills */}
      <section>
        <div className="mb-2">
          <div className="label">{t('budgets.bills')}</div>
          <p className="mt-1 text-xs text-ash">{t('budgets.billsSub')}</p>
        </div>

        <div className="panel divide-y divide-white/6 overflow-hidden">
          {fixed.length === 0 && (
            <div className="px-4 py-4 text-sm text-ash">{t('budgets.noBills')}</div>
          )}
          {fixed.map((b) => (
            <div key={b.id} className="flex items-center gap-3 px-4 py-3">
              <button
                onClick={() => toggleBill(b)}
                aria-label={b.name}
                className={`flex h-5 w-5 items-center justify-center rounded border transition ${
                  b.active
                    ? 'border-crimson bg-crimson text-on-accent'
                    : 'border-white/25 bg-transparent text-transparent'
                }`}
              >
                <Icon name="check" className="h-3.5 w-3.5" />
              </button>
              <div className="min-w-0 flex-1">
                <div className={`truncate text-sm ${b.active ? 'text-bone' : 'text-ash line-through'}`}>
                  {b.name}
                </div>
              </div>
              <span className="text-sm text-bone/90 tabular">
                {fmtNum(b.amount)} {symbolFor(cur, lang)}
              </span>
              <button
                onClick={() => removeBill(b)}
                aria-label={t('common.delete')}
                className="rounded p-1.5 text-ash transition hover:bg-white/6 hover:text-crimson-hi"
              >
                <Icon name="trash" className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-[1fr_110px_auto] items-center gap-2">
          <input
            className="input"
            placeholder={t('budgets.billName')}
            value={billName}
            maxLength={40}
            onChange={(e) => {
              setBillName(e.target.value)
              setBillError(null)
            }}
          />
          <input
            type="number"
            inputMode="decimal"
            className="input text-end"
            placeholder={t('budgets.amount')}
            value={billAmount}
            onChange={(e) => {
              setBillAmount(e.target.value)
              setBillError(null)
            }}
          />
          <button className="btn btn-ghost px-3" onClick={addBill} aria-label={t('budgets.addBill')}>
            <Icon name="plus" className="h-4 w-4" />
          </button>
        </div>
        {billError && <div className="mt-1.5 text-xs text-crimson-hi">⚠ {billError}</div>}

        {settings && (
          <div className="mt-3 rounded-lg bg-sunk px-3 py-2 text-xs text-ash tabular">
            {t('home.bills')}: {fmtNum(reserved)} / {fmtNum(settings.allowance)} {symbolFor(cur, lang)}
          </div>
        )}
      </section>

      {/* Categories */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <span className="label">{t('budgets.categories')}</span>
          <button
            className="flex items-center gap-1 text-xs text-ash transition hover:text-bone"
            onClick={newCategory}
          >
            <Icon name="plus" className="h-3.5 w-3.5" />
            {t('budgets.addCat')}
          </button>
        </div>

        <div className="flex flex-col gap-2.5">
          {cats.map((c) => {
            const spent = spentMap[c.id as number] ?? 0
            const over = c.budget > 0 && spent > c.budget
            const pct = c.budget > 0 ? Math.min(100, (spent / c.budget) * 100) : 0
            return (
              <button
                key={c.id}
                onClick={() => setEditing(c)}
                className="panel w-full px-4 py-3.5 text-start transition hover:bg-white/4"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm text-bone">
                    <span className="text-lg">{c.emoji}</span>
                    {catName(c, lang)}
                  </span>
                  <span className="text-xs text-ash tabular">
                    {c.budget > 0
                      ? t('budgets.spentOf', { s: fmtNum(spent), b: fmtNum(c.budget) })
                      : t('budgets.noBudget')}
                  </span>
                </div>
                {c.budget > 0 && (
                  <>
                    <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-white/8">
                      <div
                        className={`h-full rounded-full ${
                          over
                            ? 'bg-gradient-to-r from-crimson to-crimson-hi'
                            : 'bg-gradient-to-r from-crimson-dark to-crimson'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    {over && (
                      <div className="mt-1.5 text-[11px] text-crimson-hi">
                        {t('budgets.overBy', { n: fmtNum(spent - c.budget) })}
                      </div>
                    )}
                  </>
                )}
              </button>
            )
          })}
        </div>
      </section>

      {/* Category edit sheet */}
      <Sheet
        open={editing != null}
        onClose={() => setEditing(null)}
        title={editing?.id != null ? t('budgets.editCat') : t('budgets.addCat')}
      >
        {editing && (
          <CategoryForm
            cat={editing}
            allCats={cats}
            onClose={() => setEditing(null)}
          />
        )}
      </Sheet>
    </div>
  )
}

function CategoryForm({
  cat,
  allCats,
  onClose,
}: {
  cat: Category
  allCats: Category[]
  onClose: () => void
}) {
  const { t } = useI18n()
  const [emoji, setEmoji] = useState(cat.emoji)
  const [en, setEn] = useState(cat.names.en)
  const [fr, setFr] = useState(cat.names.fr)
  const [ar, setAr] = useState(cat.names.ar)
  const [budget, setBudget] = useState(cat.budget > 0 ? String(cat.budget) : '')

  async function save() {
    const rec: Category = {
      ...cat,
      emoji: emoji || '✦',
      names: {
        en: en.trim() || '—',
        fr: fr.trim() || '—',
        ar: ar.trim() || '—',
      },
      budget: parseFloat(budget) || 0,
    }
    if (cat.id != null) await db.categories.put(rec)
    else await db.categories.add(rec)
    onClose()
  }

  async function remove() {
    if (cat.id == null) {
      onClose()
      return
    }
    if (!window.confirm(t('budgets.reallyDelete'))) return
    const others = allCats.filter((c) => c.id !== cat.id)
    if (others.length > 0) {
      const target = others.find((c) => c.names.en === 'Other') ?? others[0]
      await db.txns
        .where('categoryId')
        .equals(cat.id)
        .modify({ categoryId: target.id as number })
    }
    await db.categories.delete(cat.id)
    onClose()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[80px_1fr] gap-2">
        <input
          className="input text-center text-2xl"
          value={emoji}
          maxLength={4}
          onChange={(e) => setEmoji(e.target.value)}
          aria-label={t('budgets.emoji')}
        />
        <input
          type="number"
          inputMode="decimal"
          className="input"
          placeholder={t('budgets.budget')}
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
        />
      </div>

      <div className="grid gap-2">
        <input
          className="input"
          placeholder={t('budgets.nameEn')}
          value={en}
          maxLength={40}
          onChange={(e) => setEn(e.target.value)}
        />
        <input
          className="input"
          placeholder={t('budgets.nameFr')}
          value={fr}
          maxLength={40}
          onChange={(e) => setFr(e.target.value)}
        />
        <input
          className="input"
          placeholder={t('budgets.nameAr')}
          value={ar}
          dir="rtl"
          maxLength={40}
          onChange={(e) => setAr(e.target.value)}
        />
      </div>

      <p className="text-xs text-ash">{t('budgets.delWarn')}</p>

      <div className="flex gap-2">
        <button className="btn btn-primary flex-1" onClick={save}>
          <Icon name="check" className="h-4 w-4" />
          {t('common.save')}
        </button>
        {cat.id != null && (
          <button className="btn btn-danger" onClick={remove} aria-label={t('common.delete')}>
            <Icon name="trash" className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}
