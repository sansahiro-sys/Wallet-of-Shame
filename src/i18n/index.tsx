import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, updateSettings } from '../db'
import type { Lang } from '../types'
import { getCurrency, symbolFor, type Currency } from '../lib/currency'
import { fmtMoney } from '../lib/format'
import { en } from './en'
import { fr } from './fr'
import { ar } from './ar'

export type Dict = typeof en

const dicts: Record<Lang, Dict> = { en, fr, ar }

export type TFn = (key: keyof Dict, vars?: Record<string, string | number>) => string

interface I18nValue {
  lang: Lang
  setLang: (l: Lang) => void
  t: TFn
  /** The currency the ledger is kept in. */
  cur: Currency
  /** Format any amount in that currency. */
  money: (n: number) => string
}

const I18nContext = createContext<I18nValue>({
  lang: 'en',
  setLang: () => {},
  t: (k) => String(k),
  cur: getCurrency(null),
  money: (n) => fmtMoney(n),
})

export function I18nProvider({ children }: { children: ReactNode }) {
  const settings = useLiveQuery(() => db.settings.get(1), [])
  const lang: Lang = settings?.lang ?? 'en'
  const cur = getCurrency(settings?.currency)

  useEffect(() => {
    const el = document.documentElement
    el.lang = lang
    el.dir = lang === 'ar' ? 'rtl' : 'ltr'
  }, [lang])

  const setLang = (l: Lang) => {
    void updateSettings({ lang: l })
  }

  /**
   * `{c}` is always the current currency symbol, so translated strings can
   * carry money without every call site having to pass it in.
   */
  const t: TFn = (key, vars) => {
    let str = dicts[lang][key] ?? en[key] ?? String(key)
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.split(`{${k}}`).join(String(v))
      }
    }
    if (!vars || vars.c === undefined) str = str.split('{c}').join(symbolFor(cur, lang))
    return str
  }

  const money = (n: number) => fmtMoney(n, cur.code, lang)

  return (
    <I18nContext.Provider value={{ lang, setLang, t, cur, money }}>{children}</I18nContext.Provider>
  )
}

export function useI18n(): I18nValue {
  return useContext(I18nContext)
}
