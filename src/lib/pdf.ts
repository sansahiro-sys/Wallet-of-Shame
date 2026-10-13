import type { Category, Lang, Settings } from '../types'
import { db } from '../db'
import { download } from './data'
import { addDaysISO, daysBetween, todayISO } from './dates'
import { activeReserved, catName, getCycle, getRoast, sum } from './finance'
import { fmtDate, fmtMoney } from './format'
import { getCurrency, symbolFor } from './currency'
import { assemblePdf, type PageImage } from './pdfbytes'
import { en } from '../i18n/en'
import { fr } from '../i18n/fr'
import { ar } from '../i18n/ar'

/**
 * Spending report as a real PDF, without a PDF library:
 *
 *   1. the report is painted onto an A4-sized canvas — so Arabic, emoji and
 *      every other script shape correctly, the browser does the shaping,
 *   2. each page is turned into a JPEG,
 *   3. a minimal PDF is assembled by hand, one image XObject per page.
 *
 * The file opens in any reader and prints exactly as it looks on screen.
 */

export type ReportPeriod = 'week' | 'month'

type Dict = typeof en
const dicts: Record<Lang, Dict> = { en, fr, ar }

// A4 at 2× — 595.28 × 841.89 pt becomes 1190 × 1684 px.
const PAGE_W = 1190
const PAGE_H = 1684
const M = 88
const CW = PAGE_W - 2 * M

const PAPER = '#f7f3eb'
const INK = '#1f1d1a'
const MUTED = '#6f6a64'
const LINE = '#e4ddd0'
const CRIMSON = '#7d202b'
const CARD = '#ffffff'
const CHIP = '#efe9df'

const SANS =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Noto Naskh Arabic", sans-serif'
const DISPLAY = '"Cinzel", Georgia, "Times New Roman", serif'

// ---------------------------------------------------------------------------
// Painting
// ---------------------------------------------------------------------------

interface Box {
  x: number
  y: number
  w: number
  h: number
}

interface Ink {
  size?: number
  weight?: number
  display?: boolean
  color?: string
  align?: 'left' | 'right' | 'center'
}

interface TextOpts extends Ink {
  maxW?: number
}

function roundPath(ctx: CanvasRenderingContext2D, b: Box, radius: number): void {
  const r = Math.max(0, Math.min(radius, b.w / 2, b.h / 2))
  ctx.beginPath()
  ctx.moveTo(b.x + r, b.y)
  ctx.arcTo(b.x + b.w, b.y, b.x + b.w, b.y + b.h, r)
  ctx.arcTo(b.x + b.w, b.y + b.h, b.x, b.y + b.h, r)
  ctx.arcTo(b.x, b.y + b.h, b.x, b.y, r)
  ctx.arcTo(b.x, b.y, b.x + b.w, b.y, r)
  ctx.closePath()
}

/**
 * Cursor-based painter over a stack of A4 canvases. Every drawing call goes
 * through `this.ctx`, never a captured reference — `need()` swaps the context
 * out from under you the moment a page fills up.
 */
class Painter {
  readonly pages: HTMLCanvasElement[] = []
  readonly lang: Lang
  private ctx: CanvasRenderingContext2D
  y = M

  constructor(lang: Lang) {
    this.lang = lang
    this.ctx = this.newPage()
  }

  private newPage(): CanvasRenderingContext2D {
    const canvas = document.createElement('canvas')
    canvas.width = PAGE_W
    canvas.height = PAGE_H
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas is unavailable')
    ctx.fillStyle = PAPER
    ctx.fillRect(0, 0, PAGE_W, PAGE_H)
    ctx.textBaseline = 'top'
    if ('direction' in ctx) ctx.direction = this.lang === 'ar' ? 'rtl' : 'ltr'
    this.pages.push(canvas)
    return ctx
  }

  /** Starts a new page when the next block would cross the bottom margin. */
  need(h: number): void {
    if (this.y + h > PAGE_H - M) {
      this.ctx = this.newPage()
      this.y = M
    }
  }

  space(h: number): void {
    this.y += h
  }

  font(size: number, weight = 400, display = false): void {
    const family = display && this.lang !== 'ar' ? DISPLAY : SANS
    this.ctx.font = `${weight} ${size}px ${family}`
  }

  measure(str: string, size: number, weight = 400, display = false): number {
    this.font(size, weight, display)
    return this.ctx.measureText(str).width
  }

  /** Largest size ≤ `size` whose text still fits `maxW`. */
  fit(str: string, size: number, maxW: number, weight = 700, min = 13, display = false): number {
    let px = size
    this.font(px, weight, display)
    while (px > min && this.ctx.measureText(str).width > maxW) {
      px -= 1
      this.font(px, weight, display)
    }
    return px
  }

  /** Text at an absolute position. `align: right` means "ends at x". */
  fillText(str: string, x: number, y: number, opts: Ink = {}): void {
    const { size = 18, weight = 400, display = false, color = INK, align = 'left' } = opts
    const ctx = this.ctx
    this.font(size, weight, display)
    ctx.fillStyle = color
    ctx.textAlign = align
    ctx.fillText(str, x, y)
  }

  fillRect(x: number, y: number, w: number, h: number, color: string): void {
    const ctx = this.ctx
    ctx.fillStyle = color
    ctx.fillRect(x, y, w, h)
  }

  line(x1: number, y1: number, x2: number, y2: number, color = LINE, width = 1): void {
    const ctx = this.ctx
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }

  box(b: Box, fill: string, stroke?: string, radius = 14): void {
    const ctx = this.ctx
    roundPath(ctx, b, radius)
    ctx.fillStyle = fill
    ctx.fill()
    if (stroke) {
      ctx.strokeStyle = stroke
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
  }

  /** The burgundy wallet mark that opens every page. */
  logo(x: number, y: number): void {
    const ctx = this.ctx
    ctx.save()
    ctx.translate(x, y)
    ctx.strokeStyle = CRIMSON
    ctx.lineWidth = 4
    ctx.lineJoin = 'round'
    // wallet body
    roundPath(ctx, { x: -22, y: -14, w: 44, h: 30 }, 6)
    ctx.stroke()
    // card slot on the right edge
    ctx.beginPath()
    ctx.moveTo(22, 0)
    ctx.lineTo(9, 0)
    ctx.arcTo(4, 0, 4, 6, 5)
    ctx.lineTo(4, 6)
    ctx.lineTo(22, 6)
    ctx.stroke()
    ctx.restore()
  }

  /** One line of text at the cursor, shrinking to fit `maxW`. Returns its height. */
  text(str: string, size: number, opts: TextOpts = {}): number {
    const { maxW, align = 'left', color = INK, weight = 400, display = false } = opts
    let px = size
    if (maxW) px = this.fit(str, size, maxW, weight, 11, display)
    this.fillText(str, this.anchorX(align), this.y, { size: px, weight, display, color, align })
    const lh = Math.round(size * 1.45)
    this.y += lh
    return lh
  }

  /** Word-wrapped paragraph; breaks pages between lines, never inside a word. */
  para(str: string, size: number, opts: TextOpts = {}): void {
    const { weight = 400, display = false, maxW = CW, color, align } = opts
    for (const line of this.wrap(str, size, maxW, weight, display)) {
      this.need(size * 1.5)
      this.fillText(line, this.anchorX(align ?? 'left'), this.y, {
        size,
        weight,
        display,
        color,
        align,
      })
      this.y += Math.round(size * 1.45)
    }
  }

  wrap(str: string, size: number, maxW: number, weight = 400, display = false): string[] {
    const out: string[] = []
    let line = ''
    for (const word of str.split(/\s+/).filter(Boolean)) {
      const probe = line ? `${line} ${word}` : word
      if (line && this.measure(probe, size, weight, display) > maxW) {
        out.push(line)
        line = word
      } else {
        line = probe
      }
    }
    if (line) out.push(line)
    return out.length > 0 ? out : ['']
  }

  ellipsize(str: string, maxW: number, size: number, weight = 400): string {
    if (this.measure(str, size, weight) <= maxW) return str
    let s = str
    while (s.length > 1 && this.measure(`${s}…`, size, weight) > maxW) s = s.slice(0, -1)
    return `${s}…`
  }

  rule(gap = 18): void {
    this.need(gap + 6)
    this.fillRect(M, this.y, CW, 1.5, LINE)
    this.y += gap
  }

  private anchorX(align: 'left' | 'right' | 'center' = 'left'): number {
    if (align === 'right') return PAGE_W - M
    if (align === 'center') return PAGE_W / 2
    return M
  }
}

// ---------------------------------------------------------------------------
// Page images
// ---------------------------------------------------------------------------

function b64bytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** JPEG straight off the canvas — DCTDecode takes it as-is, no re-encoding. */
function pageImages(pages: HTMLCanvasElement[]): PageImage[] {
  return pages.map((c) => {
    const url = c.toDataURL('image/jpeg', 0.85)
    return { bytes: b64bytes(url.slice(url.indexOf(',') + 1)), w: c.width, h: c.height }
  })
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

/**
 * Builds and downloads the report for the last 7 days (or this month).
 * Returns false when nothing was logged in the period.
 */
export async function exportReport(period: ReportPeriod): Promise<boolean> {
  const settings = (await db.settings.get(1)) as Settings | undefined
  if (!settings) return false
  const txns = await db.txns.toArray()
  const contribs = await db.contributions.toArray()
  const cats = await db.categories.orderBy('order').toArray()
  const fixed = await db.fixedCosts.toArray()

  // Headings use Cinzel: make sure it is loaded before painting.
  try {
    await document.fonts?.ready
  } catch {
    /* no font loading API — the fallback stack is fine */
  }

  const lang: Lang = settings.lang ?? 'en'
  const d: Dict = dicts[lang] ?? en
  const cur = getCurrency(settings.currency)
  const profile = settings.profile ?? 'student'
  const money = (n: number) => fmtMoney(n, cur.code, lang)

  const today = todayISO()
  const from = period === 'week' ? addDaysISO(today, -6) : `${today.slice(0, 7)}-01`

  const inPeriod = txns.filter((x) => x.date >= from && x.date <= today)
  const savedInPeriod = contribs.filter((x) => x.date >= from && x.date <= today)
  if (inPeriod.length === 0 && savedInPeriod.length === 0) return false

  const cycle = getCycle(settings, today)
  const reserved = activeReserved(fixed)
  const periodDays = Math.max(1, daysBetween(from, today) + 1)
  const budget = Math.max(0, (settings.allowance - reserved) * (periodDays / cycle.total))

  const spent = sum(inPeriod.map((x) => x.amount))
  const impulse = sum(inPeriod.filter((x) => x.impulse).map((x) => x.amount))
  const saved = sum(savedInPeriod.map((x) => x.amount))

  const byCat = new Map<number, number>()
  for (const t of inPeriod) byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) + t.amount)
  const breakdown = cats
    .map((c) => ({ cat: c, amount: byCat.get(c.id as number) ?? 0 }))
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount)

  const roast = getRoast(settings, cycle, txns, contribs, fixed, today)
  const p = new Painter(lang)

  // --- Header ------------------------------------------------------------
  const logoY = p.y + 14
  p.logo(M + 24, logoY + 20)
  p.fillText('Moneta', M + 62, logoY, { size: 32, weight: 700, display: true })
  const periodLabel = d[period === 'week' ? 'report.periodWeek' : 'report.periodMonth']
  p.fillText(`${d['report.title']} · ${periodLabel}`, M + 62, logoY + 44, {
    size: 17,
    color: MUTED,
  })

  const now = new Date()
  const headRight = [
    `${d['report.generated']}: ${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`,
    `${d['settings.currency']}: ${cur.code} (${symbolFor(cur, lang)})`,
    `${d['settings.profile']}: ${d[`profile.${profile}`]}`,
  ]
  headRight.forEach((line, i) =>
    p.fillText(line, PAGE_W - M, logoY + i * 25, {
      size: 16,
      color: MUTED,
      align: 'right',
    }),
  )

  p.y += 96
  p.rule()
  p.text(`${fmtDate(from, lang)} → ${fmtDate(today, lang)}`, 18, { color: MUTED, weight: 600 })
  p.space(8)

  // --- Summary cards -----------------------------------------------------
  const cards: [string, string][] = [
    [d['home.spent'], money(spent)],
    [d['add.impulse'], money(impulse)],
    [d['home.saved'], money(saved)],
    [d['report.budgetLbl'], money(budget)],
  ]
  const gap = 14
  const cardW = (CW - gap * 3) / 4
  p.need(116)
  cards.forEach(([label, value], i) => {
    const box: Box = { x: M + i * (cardW + gap), y: p.y, w: cardW, h: 116 }
    p.box(box, CARD, LINE, 14)
    p.fillText(label.toUpperCase(), box.x + 16, box.y + 18, { size: 13, weight: 600, color: MUTED })
    const size = p.fit(value, 30, cardW - 32, 700, 13)
    p.fillText(value, box.x + 16, box.y + 54, {
      size,
      weight: 700,
      color: i === 0 ? CRIMSON : INK,
    })
  })
  p.y += 116
  p.space(20)

  // --- Roast, in the voice chosen for this person ------------------------
  const roastTitle = d[`roast.${roast.status}.t`]
  const roastLines = p.wrap(d[roast.key], 19, CW - 60)
  const roastH = 54 + roastLines.length * 28
  p.need(roastH)
  const roastBox: Box = { x: M, y: p.y, w: CW, h: roastH }
  p.box(roastBox, 'rgba(164, 22, 26, 0.06)', undefined, 14)
  p.fillRect(roastBox.x, roastBox.y + 12, 5, roastBox.h - 24, CRIMSON)
  p.fillText(roastTitle, roastBox.x + 28, roastBox.y + 16, {
    size: 21,
    weight: 700,
  })
  roastLines.forEach((l, i) =>
    p.fillText(l, roastBox.x + 28, roastBox.y + 52 + i * 28, { size: 19, color: MUTED }),
  )
  p.y += roastH
  p.space(24)

  // --- Where it went -----------------------------------------------------
  if (breakdown.length > 0) {
    p.text(d['report.byCategory'], 22, { weight: 700 })
    p.space(4)
    for (const { cat, amount } of breakdown) {
      p.need(58)
      p.fillText(catName(cat, lang), M, p.y, { size: 19, weight: 600 })
      const pct = spent > 0 ? Math.round((amount / spent) * 100) : 0
      p.fillText(`${money(amount)} · ${pct}%`, PAGE_W - M, p.y, {
        size: 19,
        weight: 700,
        color: CRIMSON,
        align: 'right',
      })
      const barY = p.y + 32
      p.box({ x: M, y: barY, w: CW, h: 10 }, CHIP, undefined, 5)
      p.box(
        { x: M, y: barY, w: Math.max(8, CW * (spent > 0 ? amount / spent : 0)), h: 10 },
        CRIMSON,
        undefined,
        5,
      )
      p.y += 58
    }
    p.space(12)
  }

  // --- Entries, day by day ----------------------------------------------
  p.text(d['report.entries'], 22, { weight: 700 })
  p.space(4)

  const sorted = [...inPeriod].sort(
    (a, b) => b.date.localeCompare(a.date) || (b.id ?? 0) - (a.id ?? 0),
  )
  let currentDate = ''
  for (const tx of sorted) {
    if (tx.date !== currentDate) {
      currentDate = tx.date
      const dayTotal = sum(sorted.filter((x) => x.date === tx.date).map((x) => x.amount))
      p.need(80)
      p.space(8)
      p.box({ x: M, y: p.y, w: CW, h: 40 }, CHIP, undefined, 10)
      p.fillText(fmtDate(tx.date, lang), M + 16, p.y + 11, { size: 17, weight: 600 })
      p.fillText(`−${money(dayTotal)}`, PAGE_W - M - 16, p.y + 11, {
        size: 17,
        weight: 700,
        color: CRIMSON,
        align: 'right',
      })
      p.y += 50
    }

    const cat: Category | undefined = cats.find((k) => k.id === tx.categoryId)
    const label = cat ? catName(cat, lang) : '—'
    const line = `${tx.impulse ? '• ' : ''}${label}${tx.note ? ` — ${tx.note}` : ''}`
    p.need(44)
    p.fillText(p.ellipsize(line, CW - 230, 18), M, p.y, {
      size: 18,
      color: tx.impulse ? CRIMSON : INK,
    })
    p.fillText(`−${money(tx.amount)}`, PAGE_W - M, p.y, {
      size: 18,
      weight: 600,
      align: 'right',
    })
    p.y += 34
    p.line(M, p.y, PAGE_W - M, p.y)
    p.y += 10
  }

  if (savedInPeriod.length > 0) {
    p.space(12)
    p.text(`${d['home.saved']}: ${money(saved)}`, 18, { color: MUTED, weight: 600 })
  }

  // --- Footers -----------------------------------------------------------
  const pages = p.pages
  pages.forEach((canvas, i) => {
    const c = canvas.getContext('2d')
    if (!c) return
    c.textBaseline = 'top'
    if ('direction' in c) c.direction = lang === 'ar' ? 'rtl' : 'ltr'
    c.fillStyle = LINE
    c.fillRect(M, PAGE_H - M - 16, CW, 1.5)
    c.fillStyle = MUTED
    c.font = `400 14px ${SANS}`
    c.textAlign = 'left'
    c.fillText(`Moneta · ${d['report.footer']}`, M, PAGE_H - M + 4)
    c.textAlign = 'right'
    c.fillText(`${i + 1} / ${pages.length}`, PAGE_W - M, PAGE_H - M + 4)
  })

  download(`moneta-${period}-report-${today}.pdf`, assemblePdf(pageImages(pages)))
  return true
}
