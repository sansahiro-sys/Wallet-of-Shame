// Generates the PWA icons (crimson ring + diamond on near-black) as PNGs,
// with no image dependencies: a minimal PNG encoder using node:zlib.
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'public', 'icons')
mkdirSync(outDir, { recursive: true })

// --- CRC32 -----------------------------------------------------------------
const crcTable = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  crcTable[n] = c >>> 0
}
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

// --- Colors ---------------------------------------------------------------
const BG = [125, 32, 43] // deep burgundy tile
const BG_EDGE = [94, 23, 34] // slightly darker toward the corners
const IVORY = [247, 243, 235] // the wallet mark

// --- Shape test: rounded-rect distance, for both body and clasp -----------
function inRoundedRect(px, py, x0, y0, x1, y1, r) {
  const cx = Math.max(x0 + r, Math.min(px, x1 - r))
  const cy = Math.max(y0 + r, Math.min(py, y1 - r))
  const dx = px - cx
  const dy = py - cy
  return dx * dx + dy * dy <= r * r
}

/** Fills `color` when p sits inside the outer rect but not the inner one. */
function strokeRect(px, py, x0, y0, x1, y1, r, w) {
  return (
    inRoundedRect(px, py, x0, y0, x1, y1, r) &&
    !inRoundedRect(px, py, x0 + w, y0 + w, x1 - w, y1 - w, Math.max(0.5, r - w))
  )
}

/**
 * The Moneta mark: a geometric wallet — a rounded body, a fold line across
 * the top, and a clasp notch on the right edge with a small button.
 * All coordinates are fractions of the icon, multiplied by `scale` (the
 * maskable variant shrinks everything into the safe zone).
 */
function colorAt(x, y, size, scale) {
  const c = size / 2
  // gentle vertical gradient so the flat burgundy reads as a surface
  const g = Math.max(0, Math.min(1, y / size))
  const bg = [
    Math.round(BG[0] + (BG_EDGE[0] - BG[0]) * g),
    Math.round(BG[1] + (BG_EDGE[1] - BG[1]) * g),
    Math.round(BG[2] + (BG_EDGE[2] - BG[2]) * g),
  ]

  // normalized point relative to center, scaled into the safe zone
  const u = ((x - c) / (size / 2)) / scale
  const v = ((y - c) / (size / 2)) / scale

  const px = u * 0.5 + 0.5 // 0..1
  const py = v * 0.5 + 0.5

  const SW = 0.045 // stroke thickness

  // wallet body: rounded rect
  const body = { x0: 0.2, y0: 0.32, x1: 0.8, y1: 0.72, r: 0.075 }
  if (strokeRect(px, py, body.x0, body.y0, body.x1, body.y1, body.r, SW)) return IVORY

  // fold line: a thin band just under the top edge
  if (px > body.x0 + SW * 0.5 && px < body.x1 - SW * 0.5 && py > 0.42 && py < 0.42 + SW) {
    return IVORY
  }

  // clasp: small rounded rect hanging off the right edge, hollowed out
  const clasp = { x0: 0.6, y0: 0.5, x1: 0.86, y1: 0.63, r: 0.05 }
  if (strokeRect(px, py, clasp.x0, clasp.y0, clasp.x1, clasp.y1, clasp.r, SW * 0.85)) {
    return IVORY
  }
  // button dot inside the clasp
  const bdx = px - 0.755
  const bdy = py - 0.565
  if (bdx * bdx + bdy * bdy <= 0.022 * 0.022) return IVORY

  return bg
}

function makePng(size, scale) {
  const stride = 1 + size * 4
  const raw = Buffer.alloc(stride * size)
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0 // filter: none
    for (let x = 0; x < size; x++) {
      // 5x5 supersampling for antialiasing
      let r = 0
      let g = 0
      let b = 0
      for (let sy = 0; sy < 5; sy++) {
        for (let sx = 0; sx < 5; sx++) {
          const px = x + (sx - 2) * 0.2
          const py = y + (sy - 2) * 0.2
          const [cr, cg, cb] = colorAt(px, py, size, scale)
          r += cr
          g += cg
          b += cb
        }
      }
      const o = y * stride + 1 + x * 4
      raw[o] = Math.round(r / 25)
      raw[o + 1] = Math.round(g / 25)
      raw[o + 2] = Math.round(b / 25)
      raw[o + 3] = 255
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

writeFileSync(join(outDir, 'icon-192.png'), makePng(192, 1))
writeFileSync(join(outDir, 'icon-512.png'), makePng(512, 1))
// maskable: content shrunk into the 80% safe zone
writeFileSync(join(outDir, 'maskable-512.png'), makePng(512, 0.68))
console.log('icons written to', outDir)
