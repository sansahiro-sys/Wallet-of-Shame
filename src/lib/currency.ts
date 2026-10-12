import type { Lang } from '../types'

/**
 * The 20 currencies the ledger can be kept in, MAD first because that is
 * where this app was born. Numbers are stored plain — only the symbol and
 * the rounding change when you switch.
 */
export interface Currency {
  code: string
  symbol: string
  /** Arabic-script symbol when it differs from the Latin one. */
  symbolAr?: string
  /** Fraction digits shown: 0 for JPY, 3 for TND, 2 for the rest. */
  decimals: number
  names: Record<Lang, string>
}

export const CURRENCIES: Currency[] = [
  {
    code: 'MAD',
    symbol: 'DH',
    symbolAr: 'درهم',
    decimals: 2,
    names: { en: 'Moroccan dirham', fr: 'Dirham marocain', ar: 'درهم مغربي' },
  },
  {
    code: 'USD',
    symbol: '$',
    decimals: 2,
    names: { en: 'US dollar', fr: 'Dollar américain', ar: 'دولار أمريكي' },
  },
  {
    code: 'EUR',
    symbol: '€',
    decimals: 2,
    names: { en: 'Euro', fr: 'Euro', ar: 'يورو' },
  },
  {
    code: 'GBP',
    symbol: '£',
    decimals: 2,
    names: { en: 'Pound sterling', fr: 'Livre sterling', ar: 'جنيه إسترليني' },
  },
  {
    code: 'DZD',
    symbol: 'DA',
    symbolAr: 'دج',
    decimals: 2,
    names: { en: 'Algerian dinar', fr: 'Dinar algérien', ar: 'دينار جزائري' },
  },
  {
    code: 'TND',
    symbol: 'DT',
    symbolAr: 'د.ت',
    decimals: 3,
    names: { en: 'Tunisian dinar', fr: 'Dinar tunisien', ar: 'دينار تونسي' },
  },
  {
    code: 'SAR',
    symbol: 'SR',
    symbolAr: 'ر.س',
    decimals: 2,
    names: { en: 'Saudi riyal', fr: 'Riyal saoudien', ar: 'ريال سعودي' },
  },
  {
    code: 'AED',
    symbol: 'AED',
    symbolAr: 'د.إ',
    decimals: 2,
    names: { en: 'UAE dirham', fr: 'Dirham émirati', ar: 'درهم إماراتي' },
  },
  {
    code: 'EGP',
    symbol: 'E£',
    symbolAr: 'ج.م',
    decimals: 2,
    names: { en: 'Egyptian pound', fr: 'Livre égyptienne', ar: 'جنيه مصري' },
  },
  {
    code: 'TRY',
    symbol: '₺',
    decimals: 2,
    names: { en: 'Turkish lira', fr: 'Livre turque', ar: 'ليرة تركية' },
  },
  {
    code: 'INR',
    symbol: '₹',
    decimals: 2,
    names: { en: 'Indian rupee', fr: 'Roupie indienne', ar: 'روبية هندية' },
  },
  {
    code: 'CNY',
    symbol: 'CN¥',
    decimals: 2,
    names: { en: 'Chinese yuan', fr: 'Yuan chinois', ar: 'يوان صيني' },
  },
  {
    code: 'JPY',
    symbol: 'JP¥',
    decimals: 0,
    names: { en: 'Japanese yen', fr: 'Yen japonais', ar: 'ين ياباني' },
  },
  {
    code: 'CAD',
    symbol: 'C$',
    decimals: 2,
    names: { en: 'Canadian dollar', fr: 'Dollar canadien', ar: 'دولار كندي' },
  },
  {
    code: 'AUD',
    symbol: 'A$',
    decimals: 2,
    names: { en: 'Australian dollar', fr: 'Dollar australien', ar: 'دولار أسترالي' },
  },
  {
    code: 'CHF',
    symbol: 'CHF',
    decimals: 2,
    names: { en: 'Swiss franc', fr: 'Franc suisse', ar: 'فرنك سويسري' },
  },
  {
    code: 'RUB',
    symbol: '₽',
    decimals: 2,
    names: { en: 'Russian rouble', fr: 'Rouble russe', ar: 'روبل روسي' },
  },
  {
    code: 'BRL',
    symbol: 'R$',
    decimals: 2,
    names: { en: 'Brazilian real', fr: 'Real brésilien', ar: 'ريال برازيلي' },
  },
  {
    code: 'MXN',
    symbol: 'MX$',
    decimals: 2,
    names: { en: 'Mexican peso', fr: 'Peso mexicain', ar: 'بيزو مكسيكي' },
  },
  {
    code: 'ZAR',
    symbol: 'R',
    decimals: 2,
    names: { en: 'South African rand', fr: 'Rand sud-africain', ar: 'راند جنوب أفريقي' },
  },
]

const BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]))

/** Unknown or missing code falls back to MAD — the ledger never crashes on a symbol. */
export function getCurrency(code?: string | null): Currency {
  return (code ? BY_CODE.get(code) : undefined) ?? CURRENCIES[0]
}

export const DEFAULT_CURRENCY = 'MAD'

/** The symbol to print: Arabic UI gets the Arabic-script one when it exists. */
export function symbolFor(c: Currency, lang: Lang = 'en'): string {
  return lang === 'ar' && c.symbolAr ? c.symbolAr : c.symbol
}
