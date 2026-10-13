import type {
  Category,
  Contribution,
  FixedCost,
  Goal,
  Profile,
  Settings,
  Txn,
} from '../types'
import { addDaysISO, clamp, daysBetween, todayISO } from './dates'

export function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0)
}

// ---------------------------------------------------------------------------
// Cycle
// ---------------------------------------------------------------------------

export interface Cycle {
  start: string
  end: string
  total: number
  left: number
  elapsed: number
  elapsedPct: number
  overdue: boolean
}

export function getCycle(s: Settings, today: string = todayISO()): Cycle {
  const total = Math.max(1, daysBetween(s.cycleStart, s.nextAllowance))
  const leftRaw = daysBetween(today, s.nextAllowance)
  const elapsed = clamp(daysBetween(s.cycleStart, today), 0, total)
  return {
    start: s.cycleStart,
    end: s.nextAllowance,
    total,
    left: Math.max(leftRaw, 0),
    elapsed,
    elapsedPct: Math.round((elapsed / total) * 100),
    overdue: leftRaw <= 0,
  }
}

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

export interface Totals {
  spent: number
  saved: number
  impulse: number
  count: number
}

export function cycleTotals(txns: Txn[], contribs: Contribution[], since: string): Totals {
  const t = txns.filter((x) => x.date >= since)
  const c = contribs.filter((x) => x.date >= since)
  return {
    spent: sum(t.map((x) => x.amount)),
    impulse: sum(t.filter((x) => x.impulse).map((x) => x.amount)),
    saved: sum(c.map((x) => x.amount)),
    count: t.length,
  }
}

export function activeReserved(fixed: FixedCost[]): number {
  return sum(fixed.filter((f) => f.active).map((f) => f.amount))
}

// ---------------------------------------------------------------------------
// Forecast
// ---------------------------------------------------------------------------

export interface Forecast {
  reserved: number
  spent: number
  saved: number
  available: number
  safePerDay: number
  usedPct: number
  overBy: number
}

export function getForecast(
  s: Settings,
  cyc: Cycle,
  tot: Totals,
  fixed: FixedCost[],
): Forecast {
  const reserved = activeReserved(fixed)
  const available = s.allowance - reserved - tot.spent - tot.saved
  const safePerDay =
    cyc.overdue || cyc.left === 0 ? 0 : Math.max(0, available) / cyc.left
  const used = reserved + tot.spent + tot.saved
  const usedPct = s.allowance > 0 ? Math.round((used / s.allowance) * 100) : 0
  return {
    reserved,
    spent: tot.spent,
    saved: tot.saved,
    available,
    safePerDay,
    usedPct: clamp(usedPct, 0, 999),
    overBy: Math.max(0, -available),
  }
}

/** Days closer to (or further from) a goal a purchase of `amount` puts you. */
export function daysFurther(amount: number, safePerDay: number): number {
  return safePerDay > 0 ? amount / safePerDay : 0
}

// ---------------------------------------------------------------------------
// Weekly roast
// ---------------------------------------------------------------------------

export type RoastStatus = 'clean' | 'greed' | 'fire' | 'died'

export interface Roast {
  status: RoastStatus
  /** Dict key of the line written for this person: `roast.<profile>.<status>`. */
  key: `roast.${Profile}.${RoastStatus}`
  weekBudget: number
  spent: number
  impulse: number
  saved: number
}

/**
 * Each kind of wallet-holder is judged by slightly different rules, not just
 * different words: a freelancer's income is lumpy, a retired person's pension
 * leaves no room for heroics.
 */
export const PROFILE_RULES: Record<Profile, { impulseTolerance: number; saveRatio: number }> = {
  student: { impulseTolerance: 0.35, saveRatio: 0.1 },
  employee: { impulseTolerance: 0.3, saveRatio: 0.12 },
  freelancer: { impulseTolerance: 0.3, saveRatio: 0.15 },
  business: { impulseTolerance: 0.4, saveRatio: 0.15 },
  retired: { impulseTolerance: 0.25, saveRatio: 0.1 },
}

export const PROFILES: Profile[] = ['student', 'employee', 'freelancer', 'business', 'retired']

export function getRoast(
  s: Settings,
  cyc: Cycle,
  txns: Txn[],
  contribs: Contribution[],
  fixed: FixedCost[],
  today: string = todayISO(),
): Roast {
  const profile: Profile = s.profile ?? 'student'
  const rules = PROFILE_RULES[profile]
  const since = addDaysISO(today, -6)
  const t = txns.filter((x) => x.date >= since)
  const c = contribs.filter((x) => x.date >= since)
  const reserved = activeReserved(fixed)
  const weekBudget = Math.max(0, (s.allowance - reserved) * (7 / cyc.total))
  const spent = sum(t.map((x) => x.amount))
  const impulse = sum(t.filter((x) => x.impulse).map((x) => x.amount))
  const saved = sum(c.map((x) => x.amount))

  let status: RoastStatus
  if (weekBudget <= 0) {
    status = 'clean'
  } else if (impulse > weekBudget * rules.impulseTolerance) {
    status = 'died'
  } else if (spent > weekBudget) {
    status = 'fire'
  } else if (saved >= Math.max(20, weekBudget * rules.saveRatio)) {
    status = 'greed'
  } else {
    status = 'clean'
  }

  return { status, key: `roast.${profile}.${status}`, weekBudget, spent, impulse, saved }
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

export interface GoalStats {
  saved: number
  remaining: number
  pct: number
  eta: string | null
  dailyPace: number
}

export function getGoalStats(
  g: Goal,
  contribs: Contribution[],
  today: string = todayISO(),
): GoalStats {
  const saved = sum(contribs.filter((c) => c.goalId === g.id).map((c) => c.amount))
  const remaining = Math.max(0, g.target - saved)
  const pct = g.target > 0 ? Math.min(100, Math.round((saved / g.target) * 100)) : 0
  const days = Math.max(0, daysBetween(g.createdAt, today))
  const dailyPace = days >= 3 && saved > 0 ? saved / days : 0
  let eta: string | null = null
  if (remaining === 0) eta = today
  else if (dailyPace > 0) eta = addDaysISO(today, Math.ceil(remaining / dailyPace))
  return { saved, remaining, pct, eta, dailyPace }
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

export function catName(c: Category, lang: keyof Category['names']): string {
  return c.names[lang] || c.names.en || '—'
}

export function budgetSpentByCategory(txns: Txn[], since: string): Record<number, number> {
  const out: Record<number, number> = {}
  for (const t of txns) {
    if (t.date < since) continue
    out[t.categoryId] = (out[t.categoryId] || 0) + t.amount
  }
  return out
}
