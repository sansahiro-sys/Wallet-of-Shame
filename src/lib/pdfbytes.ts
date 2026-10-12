/**
 * The byte-level half of the report: turn a list of page images into a PDF.
 *
 * Deliberately dependency-free and free of DOM/canvas calls so it can be
 * exercised on its own. Everything written here is ASCII — the pictures are
 * binary — which is what makes `string.length` a valid byte offset.
 *
 * Object layout: 1 = catalog, 2 = page tree, then per page
 * page, content stream, image XObject (3 + 3i, 4 + 3i, 5 + 3i).
 */

export interface PageImage {
  bytes: Uint8Array<ArrayBuffer>
  w: number
  h: number
}

const PT_W = 595.28
const PT_H = 841.89

export function assemblePdf(images: PageImage[]): Blob {
  const parts: BlobPart[] = []
  const offsets: number[] = []
  let offset = 0
  const put = (p: string | Uint8Array<ArrayBuffer>): void => {
    parts.push(p)
    offset += p.length
  }
  const obj = (n: number): void => {
    offsets[n] = offset
    put(`${n} 0 obj\n`)
  }

  put('%PDF-1.4\n')
  obj(1)
  put('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')

  const kids = images.map((_, i) => 3 + i * 3)
  obj(2)
  put(
    `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>\nendobj\n`,
  )

  images.forEach((img, i) => {
    const pageId = 3 + i * 3
    const contentId = pageId + 1
    const imgId = pageId + 2

    obj(pageId)
    put(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PT_W} ${PT_H}] ` +
        `/Resources << /XObject << /Im0 ${imgId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`,
    )

    const content = `q ${PT_W} 0 0 ${PT_H} 0 0 cm /Im0 Do Q`
    obj(contentId)
    put(`<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`)

    obj(imgId)
    put(
      `<< /Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length} >>\nstream\n`,
    )
    put(img.bytes)
    put('\nendstream\nendobj\n')
  })

  const total = 2 + images.length * 3
  const startxref = offset
  put(`xref\n0 ${total + 1}\n`)
  // Each xref line is exactly 20 bytes: 10-digit offset, space, 5-digit
  // generation, space, marker, 2-byte EOL (CR LF).
  put('0000000000 65535 f\r\n')
  for (let n = 1; n <= total; n++) {
    put(`${String(offsets[n]).padStart(10, '0')} 00000 n\r\n`)
  }
  put(`trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`)

  return new Blob(parts, { type: 'application/pdf' })
}
