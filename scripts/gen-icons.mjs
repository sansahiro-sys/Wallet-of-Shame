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
const BG = [10, 7, 8]
const BG_GLOW = [26, 10, 12]
const CRIMSON = [164, 22, 26]
const CRIMSON_HI = [214, 40, 52]
const BONE = [232, 227, 217]

// --- Shape test: returns a color for a point, or null for background -------
function colorAt(x, y, size, scale) {
  const c = size / 2
  const dx = x - c
  const dy = y - c
  const d = Math.hypot(dx, dy)

  // faint radial glow behind everything
  const glow = 1 - Math.min(1, d / (size * 0.55))
  const bg = [
    Math.round(BG[0] + (BG_GLOW[0] - BG[0]) * glow),
    Math.round(BG[1] + (BG_GLOW[1] - BG[1]) * glow),
    Math.round(BG[2] + (BG_GLOW[2] - BG[2]) * glow),
  ]

  // outer crimson ring
  const ringR = size * 0.36 * scale
  const ringW = size * 0.05 * scale
  if (Math.abs(d - ringR) <= ringW / 2) {
    // slight highlight on the upper-left arc
    const angle = Math.atan2(dy, dx)
    const hi = Math.max(0, Math.cos(angle - Math.PI * 1.25))
    return [
      Math.round(CRIMSON[0] + (CRIMSON_HI[0] - CRIMSON[0]) * hi),
      Math.round(CRIMSON[1] + (CRIMSON_HI[1] - CRIMSON[1]) * hi),
      Math.round(CRIMSON[2] + (CRIMSON_HI[2] - CRIMSON[2]) * hi),
    ]
  }

  // diamond (taxed coin) in the center
  const diamondR = size * 0.17 * scale
  if (Math.abs(dx) + Math.abs(dy) <= diamondR) {
    // inner bone-colored notch
    if (Math.abs(dx) + Math.abs(dy) <= diamondR * 0.45) return BONE
    return CRIMSON
  }

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
