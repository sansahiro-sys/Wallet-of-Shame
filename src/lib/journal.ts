import Dexie, { type Table } from 'dexie'
import { db } from '../db'
import type { Backup, Settings } from '../types'

/**
 * Local safety copy of the whole database.
 *
 * This app is local-first: IndexedDB is the only place the data lives. Phone
 * PWAs do lose IndexedDB data in practice — the OS can evict the origin's
 * storage, and a write that has not been flushed yet is gone if the app is
 * killed right after. To survive that we:
 *
 *   1. mirror a snapshot into localStorage after every mutation (cheap: the
 *      whole database is a few KB),
 *   2. flush the last snapshot synchronously when the page is hidden/closed,
 *   3. on boot, put back any record IndexedDB has lost.
 */
const KEY = 'wos:journal:v1'
const DEBOUNCE_MS = 250

let cache: Backup | null = null
let timer: ReturnType<typeof setTimeout> | null = null
let recovered = 0

const ALL_TABLES = (): Table<any, any>[] => [
  db.settings,
  db.categories,
  db.txns,
  db.goals,
  db.contributions,
  db.fixedCosts,
]

/** Consistent snapshot of every table (one read transaction). */
export async function gather(): Promise<Backup> {
  return db.transaction(
    'r',
    [db.settings, db.categories, db.txns, db.goals, db.contributions, db.fixedCosts],
    async (): Promise<Backup> => ({
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: (await db.settings.get(1)) as Settings,
      categories: await db.categories.toArray(),
      txns: await db.txns.toArray(),
      goals: await db.goals.toArray(),
      contributions: await db.contributions.toArray(),
      fixedCosts: await db.fixedCosts.toArray(),
    }),
  )
}

function write(snap: Backup): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(snap))
    cache = snap
  } catch (err) {
    console.warn('journal: could not write safety copy', err)
  }
}

/** Re-read the database and refresh the safety copy. */
export async function refreshJournal(): Promise<void> {
  try {
    write(await gather())
  } catch (err) {
    console.warn('journal: could not refresh safety copy', err)
  }
}

/** Synchronously re-write the last known snapshot (safe to call on pagehide). */
export function flushJournal(): void {
  if (!cache) return
  // Another tab may have mirrored something more recent than our snapshot —
  // never clobber it with an older copy.
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const stored = JSON.parse(raw) as Backup
      if (stored?.exportedAt && cache.exportedAt && stored.exportedAt > cache.exportedAt) return
    }
  } catch {
    // Unreadable copy: overwrite it with ours.
  }
  write(cache)
}

function scheduleRefresh(): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    void Dexie.ignoreTransaction(() => refreshJournal())
  }, DEBOUNCE_MS)
}

function readJournal(): Backup | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Backup
    if (!parsed || parsed.version !== 1) return null
    if (!Array.isArray(parsed.categories) || !Array.isArray(parsed.txns)) return null
    return parsed
  } catch {
    return null
  }
}

function missing<T extends { id?: number }>(rows: T[] | undefined, have: Set<number>): T[] {
  return (rows ?? []).filter((r) => r.id != null && !have.has(r.id))
}

function ids(rows: { id?: number }[]): Set<number> {
  return new Set(rows.map((r) => r.id as number))
}

/**
 * Restore records the safety copy has but IndexedDB does not.
 * Returns how many records were put back.
 */
export async function restoreFromJournal(): Promise<number> {
  const j = readJournal()
  if (!j) return 0

  const dbSettings = await db.settings.get(1)
  const dbCats = await db.categories.toArray()
  const dbTxns = await db.txns.toArray()
  const dbGoals = await db.goals.toArray()
  const dbContribs = await db.contributions.toArray()
  const dbFixed = await db.fixedCosts.toArray()

  const lostCats = missing(j.categories, ids(dbCats))
  const lostTxns = missing(j.txns, ids(dbTxns))
  const lostGoals = missing(j.goals, ids(dbGoals))
  const lostContribs = missing(j.contributions, ids(dbContribs))
  const lostFixed = missing(j.fixedCosts, ids(dbFixed))
  // A re-seeded (or wiped) settings row means setup would run again: trust the
  // copy that knows the setup was already completed.
  const restoreSettings =
    j.settings != null && (dbSettings == null || (!dbSettings.setupDone && j.settings.setupDone))

  const total =
    lostCats.length +
    lostTxns.length +
    lostGoals.length +
    lostContribs.length +
    lostFixed.length +
    (restoreSettings ? 1 : 0)
  if (total === 0) {
    await refreshJournal()
    return 0
  }

  await db.transaction(
    'rw',
    [db.settings, db.categories, db.txns, db.goals, db.contributions, db.fixedCosts],
    async () => {
      if (restoreSettings && j.settings) await db.settings.put({ ...j.settings, id: 1 })
      if (lostCats.length) await db.categories.bulkPut(lostCats)
      if (lostTxns.length) await db.txns.bulkPut(lostTxns)
      if (lostGoals.length) await db.goals.bulkPut(lostGoals)
      if (lostContribs.length) await db.contributions.bulkPut(lostContribs)
      if (lostFixed.length) await db.fixedCosts.bulkPut(lostFixed)
    },
  )

  recovered = lostTxns.length + lostContribs.length
  console.info(
    `journal: restored ${lostTxns.length} txns, ${lostContribs.length} savings, ` +
      `${lostCats.length} categories, ${lostGoals.length} goals, ${lostFixed.length} bills`,
  )
  await refreshJournal()
  return total
}

/** Entries recovered from the safety copy during this session. */
export function recoveredCount(): number {
  return recovered
}

/** Mirror every mutation, and flush when the app is backgrounded or closed. */
export function initJournal(): void {
  const schedule = () => {
    scheduleRefresh()
  }
  for (const table of ALL_TABLES()) {
    table.hook('creating', schedule)
    table.hook('updating', schedule)
    table.hook('deleting', schedule)
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    void refreshJournal()
  })
  window.addEventListener('pagehide', flushJournal)
}
