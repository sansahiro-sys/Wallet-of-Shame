/**
 * End-to-end smoke test for the PDF report: seeds the database with the demo
 * data, runs the real exportReport() in English and in Arabic, and writes the
 * produced files to /tmp/opencode/ so they can be opened and eyeballed.
 *
 *   node --import ./scripts/ts-hooks.mjs scripts/report-smoke.ts
 */
import 'fake-indexeddb/auto'
import { writeFileSync } from 'node:fs'
import { createCanvas, GlobalFonts } from '@napi-rs/canvas'

// Node has no fonts: alias the system ones onto the families the app asks for.
const F = '/usr/share/fonts/truetype/'
for (const [family, file] of [
  ['ui-sans-serif', 'dejavu/DejaVuSans.ttf'],
  ['ui-sans-serif', 'dejavu/DejaVuSans-Bold.ttf'],
  ['system-ui', 'dejavu/DejaVuSans.ttf'],
  ['system-ui', 'dejavu/DejaVuSans-Bold.ttf'],
  ['sans-serif', 'dejavu/DejaVuSans.ttf'],
  ['Cinzel', 'dejavu/DejaVuSerif.ttf'],
  ['Cinzel', 'dejavu/DejaVuSerif-Bold.ttf'],
  ['Georgia', 'dejavu/DejaVuSerif.ttf'],
  ['Noto Naskh Arabic', 'noto/NotoNaskhArabic-Regular.ttf'],
  ['Noto Naskh Arabic', 'noto/NotoNaskhArabic-Bold.ttf'],
] as const) {
  GlobalFonts.registerFromPath(F + file, family)
}

const blobs: Record<string, Blob> = {}

const g = globalThis as unknown as {
  document: unknown
  URL: { createObjectURL: (b: Blob) => string; revokeObjectURL: (u: string) => void }
}

g.document = {
  createElement(tag: string) {
    if (tag === 'canvas') return createCanvas(1, 1)
    return { href: '', download: '', click() {} }
  },
}
let pending: Blob | null = null
g.URL.createObjectURL = (blob: Blob) => {
  pending = blob
  return 'blob:smoke'
}
g.URL.revokeObjectURL = () => {}

const { loadDemo } = await import('../src/lib/data.ts')
const { exportReport } = await import('../src/lib/pdf.ts')
const { db, updateSettings } = await import('../src/db.ts')

await loadDemo()

async function run(name: string, period: 'week' | 'month'): Promise<void> {
  pending = null
  const ok = await exportReport(period)
  console.log(`${name}: exportReport(${period}) → ${ok}, ${pending?.size ?? 0} bytes`)
  if (pending) blobs[name] = pending
}

await run('report-en', 'week')
await updateSettings({ lang: 'ar' })
await run('report-ar', 'month')

for (const [name, blob] of Object.entries(blobs)) {
  const out = `/tmp/opencode/${name}.pdf`
  writeFileSync(out, Buffer.from(await blob.arrayBuffer()))
  console.log('wrote', out)
}

console.log('db still usable:', (await db.txns.count()) as number, 'transactions')
