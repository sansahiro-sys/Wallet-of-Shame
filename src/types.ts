export type Lang = 'en' | 'fr' | 'ar'

export type Tab = 'home' | 'ledger' | 'budgets' | 'goals' | 'settings'

/** Who is holding the wallet — the roast speaks differently to each of them. */
export type Profile = 'student' | 'employee' | 'freelancer' | 'business' | 'retired'

export type Theme = 'dark' | 'light'

/** An expense. Day precision is enough for a student tracker. */
export interface Txn {
  id?: number
  amount: number
  categoryId: number
  impulse: boolean
  note?: string
  /** ISO date, yyyy-mm-dd */
  date: string
}

export interface Category {
  id?: number
  emoji: string
  names: Record<Lang, string>
  /** Monthly budget in the chosen currency; 0 = no budget set. */
  budget: number
  order: number
}

export interface Goal {
  id?: number
  name: string
  target: number
  /** ISO date */
  createdAt: string
}

export interface Contribution {
  id?: number
  goalId: number
  amount: number
  /** ISO date */
  date: string
}

export interface FixedCost {
  id?: number
  name: string
  amount: number
  active: boolean
}

export interface Settings {
  /** Always 1 — single row. */
  id: number
  lang: Lang
  /** ISO 4217 code of the currency everything is counted in (see lib/currency). */
  currency: string
  theme: Theme
  profile: Profile
  /** Allowance amount per cycle, in the chosen currency. */
  allowance: number
  /** ISO date the current cycle began. */
  cycleStart: string
  /** ISO date the next allowance is expected. */
  nextAllowance: string
  setupDone: boolean
}

export interface Backup {
  version: 1
  exportedAt: string
  settings: Settings
  categories: Category[]
  txns: Txn[]
  goals: Goal[]
  contributions: Contribution[]
  fixedCosts: FixedCost[]
}
