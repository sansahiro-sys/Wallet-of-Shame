import Dexie, { type Table } from 'dexie'
import type {
  Category,
  Contribution,
  FixedCost,
  Goal,
  Settings,
  Txn,
} from './types'
import { addDaysISO, todayISO } from './lib/dates'
import { DEFAULT_CURRENCY } from './lib/currency'

export class WalletDB extends Dexie {
  txns!: Table<Txn, number>
  categories!: Table<Category, number>
  goals!: Table<Goal, number>
  contributions!: Table<Contribution, number>
  fixedCosts!: Table<FixedCost, number>
  settings!: Table<Settings, number>

  constructor() {
    // 'strict' fsyncs on commit: a transaction that resolved is on disk, even
    // if the phone kills the PWA a millisecond later.
    super('wallet-of-shame', { chromeTransactionDurability: 'strict' })
    this.version(1).stores({
      txns: '++id, date, categoryId',
      categories: '++id, order',
      goals: '++id, createdAt',
      contributions: '++id, goalId, date',
      fixedCosts: '++id, active',
      settings: 'id',
    })
  }
}

export const db = new WalletDB()

const DEFAULT_CATEGORIES: Omit<Category, 'id'>[] = [
  {
    emoji: '🍔',
    names: { en: 'Food & Drinks', fr: 'Nourriture & boissons', ar: 'طعام ومشروبات' },
    budget: 300,
    order: 1,
  },
  {
    emoji: '🚕',
    names: { en: 'Transport', fr: 'Transport', ar: 'التنقل' },
    budget: 100,
    order: 2,
  },
  {
    emoji: '🎮',
    names: { en: 'Gaming', fr: 'Jeux vidéo', ar: 'ألعاب' },
    budget: 100,
    order: 3,
  },
  {
    emoji: '📺',
    names: { en: 'Subscriptions', fr: 'Abonnements', ar: 'اشتراكات' },
    budget: 60,
    order: 4,
  },
  {
    emoji: '📚',
    names: { en: 'School', fr: 'École', ar: 'المدرسة' },
    budget: 80,
    order: 5,
  },
  {
    emoji: '🛍️',
    names: { en: 'Other', fr: 'Autre', ar: 'أخرى' },
    budget: 100,
    order: 6,
  },
]

export function defaultCategories(): Omit<Category, 'id'>[] {
  return DEFAULT_CATEGORIES.map((c) => ({ ...c, names: { ...c.names } }))
}

function baseSettings(): Settings {
  return {
    id: 1,
    lang: 'en',
    currency: DEFAULT_CURRENCY,
    theme: 'dark',
    profile: 'student',
    allowance: 0,
    cycleStart: todayISO(),
    nextAllowance: addDaysISO(todayISO(), 30),
    setupDone: false,
  }
}

/**
 * Fill in fields added by newer versions. Rows written before currency, theme
 * and profile existed come back from IndexedDB without them, so every read of
 * the settings row goes through this once, at boot.
 */
export async function migrateSettings(): Promise<void> {
  const cur = await db.settings.get(1)
  if (!cur) return
  const stale =
    cur.currency == null || cur.theme == null || cur.profile == null || cur.setupDone == null
  if (!stale) return
  await db.settings.put({ ...baseSettings(), ...cur, id: 1 })
}

/** Create tables/row on first run. Safe to call on every boot. */
export async function ensureSeed(): Promise<void> {
  const existing = await db.settings.get(1)
  if (existing) return
  await db.transaction('rw', db.settings, db.categories, async () => {
    const count = await db.categories.count()
    if (count === 0) await db.categories.bulkAdd(defaultCategories() as Category[])
    await db.settings.put(baseSettings())
  })
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const cur = await db.settings.get(1)
  await db.settings.put({ ...baseSettings(), ...cur, ...patch, id: 1 })
}

/**
 * Ask the browser not to evict this origin's storage. Best effort: the browser
 * can still decline (and iOS ignores the API), but on Android it is what keeps
 * an installed PWA's IndexedDB alive.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    const storage = navigator.storage
    if (!storage?.persist) return false
    if (await storage.persisted()) return true
    return await storage.persist()
  } catch {
    return false
  }
}
