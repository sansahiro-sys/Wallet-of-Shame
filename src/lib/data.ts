import { db, defaultCategories, migrateSettings } from '../db'
import { gather, refreshJournal } from './journal'
import type { Backup, Category, Goal, Settings, Txn } from '../types'
import { addDaysISO, todayISO } from './dates'

function download(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export { download }

export async function exportBackup(): Promise<void> {
  const backup = await gather()
  download(
    `moneta-${todayISO()}.json`,
    new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }),
  )
}

/** Returns false when the file isn't a valid backup. Replaces all data. */
export async function importBackup(file: File): Promise<boolean> {
  let data: Backup
  try {
    data = JSON.parse(await file.text()) as Backup
  } catch {
    return false
  }
  if (data.version !== 1 || !data.settings || !Array.isArray(data.categories)) return false

  await db.transaction(
    'rw',
    [db.settings, db.categories, db.txns, db.goals, db.contributions, db.fixedCosts],
    async () => {
      await db.settings.clear()
      await db.categories.clear()
      await db.txns.clear()
      await db.goals.clear()
      await db.contributions.clear()
      await db.fixedCosts.clear()
      await db.settings.put({ ...data.settings, id: 1 })
      await db.categories.bulkPut(data.categories)
      await db.txns.bulkPut(data.txns ?? [])
      await db.goals.bulkPut(data.goals ?? [])
      await db.contributions.bulkPut(data.contributions ?? [])
      await db.fixedCosts.bulkPut(data.fixedCosts ?? [])
    },
  )
  // Replace the safety copy too, otherwise old rows would be resurrected.
  await refreshJournal()
  // Backups from older builds lack the newer settings fields.
  await migrateSettings()
  return true
}

export async function exportCsv(): Promise<void> {
  const txns = await db.txns.toArray()
  const cats = await db.categories.toArray()
  const catMap = new Map(cats.map((c) => [c.id as number, c]))
  const esc = (v: string) => `"${v.split('"').join('""')}"`
  const lines = ['date,category,type,impulse,amount,note']
  for (const tx of [...txns].sort((a, b) => a.date.localeCompare(b.date))) {
    const c = catMap.get(tx.categoryId)
    lines.push(
      [
        tx.date,
        esc(c ? c.names.en : 'unknown'),
        'expense',
        tx.impulse ? 'yes' : 'no',
        String(tx.amount),
        esc(tx.note ?? ''),
      ].join(','),
    )
  }
  download(
    `moneta-${todayISO()}.csv`,
    new Blob([lines.join('\n')], { type: 'text/csv' }),
  )
}

export async function eraseAll(): Promise<void> {
  await db.transaction(
    'rw',
    [db.settings, db.categories, db.txns, db.goals, db.contributions, db.fixedCosts],
    async () => {
      await db.settings.clear()
      await db.categories.clear()
      await db.txns.clear()
      await db.goals.clear()
      await db.contributions.clear()
      await db.fixedCosts.clear()
    },
  )
  // The safety copy must be emptied as well, or erased rows come back.
  await refreshJournal()
}

/** Replace everything with a self-consistent sample month. */
export async function loadDemo(): Promise<void> {
  const today = todayISO()
  const cycleStart = addDaysISO(today, -12)
  const nextAllowance = addDaysISO(today, 18)
  const current = await db.settings.get(1)

  await db.transaction(
    'rw',
    [db.settings, db.categories, db.txns, db.goals, db.contributions, db.fixedCosts],
    async () => {
      await db.settings.clear()
      await db.categories.clear()
      await db.txns.clear()
      await db.goals.clear()
      await db.contributions.clear()
      await db.fixedCosts.clear()

      const ids: number[] = []
      for (const c of defaultCategories()) {
        ids.push((await db.categories.add(c as Category)) as number)
      }
      const [food, transport, gaming, subs, school] = ids

      const settings: Settings = {
        id: 1,
        lang: current?.lang ?? 'en',
        currency: current?.currency ?? 'MAD',
        theme: current?.theme ?? 'dark',
        profile: current?.profile ?? 'student',
        allowance: 1000,
        cycleStart,
        nextAllowance,
        setupDone: true,
      }
      await db.settings.put(settings)

      await db.fixedCosts.bulkAdd([
        { name: 'Internet', amount: 150, active: true },
        { name: 'Streaming', amount: 40, active: true },
      ])

      const day = (n: number) => addDaysISO(today, n)
      const txns: Omit<Txn, 'id'>[] = [
        { amount: 45, categoryId: food, impulse: false, note: 'Café + sandwich', date: day(-11) },
        { amount: 12, categoryId: transport, impulse: false, note: 'Taxi to school', date: day(-10) },
        { amount: 25, categoryId: school, impulse: false, note: 'Printouts', date: day(-9) },
        { amount: 30, categoryId: gaming, impulse: true, note: 'Steam sale — it was 75% off, I had to', date: day(-8) },
        { amount: 15, categoryId: food, impulse: true, note: 'Energy drink', date: day(-7) },
        { amount: 20, categoryId: food, impulse: false, note: 'Lunch', date: day(-6) },
        { amount: 12, categoryId: transport, impulse: false, note: 'Grand taxi', date: day(-5) },
        { amount: 18, categoryId: food, impulse: false, note: 'Coffee with friends', date: day(-4) },
        { amount: 65, categoryId: gaming, impulse: true, note: 'A skin I will forget about in a week', date: day(-3) },
        { amount: 15, categoryId: food, impulse: true, note: 'Third energy drink this week', date: day(-2) },
        { amount: 45, categoryId: subs, impulse: false, note: 'Streaming + music', date: day(-2) },
        { amount: 18, categoryId: food, impulse: false, note: 'Dinner', date: day(-1) },
        { amount: 14, categoryId: transport, impulse: false, note: 'Bus', date: day(-1) },
      ]
      await db.txns.bulkAdd(txns as Txn[])

      const goalId = (await db.goals.add({
        name: 'Gaming PC',
        target: 8000,
        createdAt: addDaysISO(today, -25),
      })) as number
      await db.contributions.bulkAdd([
        { goalId, amount: 400, date: addDaysISO(today, -22) },
        { goalId, amount: 150, date: addDaysISO(today, -10) },
        { goalId, amount: 100, date: addDaysISO(today, -4) },
      ])
    },
  )
  await refreshJournal()
}

export type { Backup, Goal }
