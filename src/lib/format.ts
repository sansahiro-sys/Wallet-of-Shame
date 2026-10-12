import type { Lang } from '../types'
import { getCurrency, symbolFor } from './currency'
import { parseISO } from './dates'

const MONTHS: Record<Lang, string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  fr: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
  ar: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
}

const WEEKDAYS: Record<Lang, string[]> = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  fr: ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'],
  ar: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
}

/** Latin digits everywhere — consistent in all three languages. */
export function fmtNum(n: number): string {
  const rounded = Math.round(n * 100) / 100
  return rounded.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

/** Any amount in the currency the ledger is kept in: "900 DH", "900 €", "900 درهم". */
export function fmtMoney(n: number, code: string = 'MAD', lang: Lang = 'en'): string {
  const c = getCurrency(code)
  const sym = symbolFor(c, lang)
  if (c.decimals === 0) return `${Math.round(n).toLocaleString('en-US')} ${sym}`
  return `${fmtNum(n)} ${sym}`
}

export function fmtPct(n: number): string {
  return `${Math.round(n)}%`
}

/** "Fri, 10 Oct" */
export function fmtDate(iso: string, lang: Lang): string {
  const d = parseISO(iso)
  const wd = WEEKDAYS[lang][d.getDay()]
  const day = d.getDate()
  const mo = MONTHS[lang][d.getMonth()]
  return `${wd}, ${day} ${mo}`
}

/** "10 Oct" */
export function fmtDateShort(iso: string, lang: Lang): string {
  const d = parseISO(iso)
  return `${d.getDate()} ${MONTHS[lang][d.getMonth()]}`
}
