/**
 * Smoke test for the hand-rolled PDF writer: assemble a two-page file from
 * a real JPEG and dump it to /tmp/opencode/report.pdf for pdfinfo/gs to chew on.
 *
 *   python3 -c "from PIL import Image; Image.new('RGB',(1190,1684),(247,244,238)).save('/tmp/opencode/page.jpg',quality=85)"
 *   node scripts/pdf-smoke.ts
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { assemblePdf } from '../src/lib/pdfbytes.ts'

const jpeg = Uint8Array.from(readFileSync('/tmp/opencode/page.jpg'))

const blob = assemblePdf([
  { bytes: jpeg, w: 1190, h: 1684 },
  { bytes: jpeg, w: 1190, h: 1684 },
])

const out = '/tmp/opencode/report.pdf'
writeFileSync(out, Buffer.from(await blob.arrayBuffer()))
console.log(`wrote ${out} (${blob.size} bytes)`)
