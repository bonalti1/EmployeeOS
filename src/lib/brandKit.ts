/**
 * Per-brand kits — logo, colour palette, fonts and a link to the full brand
 * package. Stored as JSON in `ws_settings` (key `brandkit_<brand>`), so they
 * sync to everyone in the workspace and feed the AI's brand context.
 *
 * Colours are pulled straight out of the uploaded logo: the image is drawn to a
 * small canvas, near-transparent and near-white/near-black pixels are dropped,
 * the rest are bucketed and ranked, then near-duplicates are merged. Fonts
 * can't be read from a picture — those are typed in (or come with the package).
 */

export type BrandKey = 'STB' | 'ALTO' | 'BONALTI'

export type BrandKit = {
  logo?: string          // data URL, downscaled
  colors?: string[]      // hex, most prominent first
  headingFont?: string
  bodyFont?: string
  packageUrl?: string    // link to the full brand package / font files
  notes?: string
}

export const BRAND_KEYS: BrandKey[] = ['STB', 'ALTO', 'BONALTI']
export const BRAND_LABEL: Record<BrandKey, string> = {
  STB: 'South Texas Builders',
  ALTO: 'Alto-Pro',
  BONALTI: 'Bonalti',
}
export const kitKey = (b: BrandKey) => `brandkit_${b.toLowerCase()}`

export function parseKit(raw?: string): BrandKit {
  if (!raw) return {}
  try { return JSON.parse(raw) as BrandKit } catch { return {} }
}

/** Shrink an uploaded logo so it stores and loads fast, keeping transparency. */
export async function toLogoDataUrl(file: Blob, max = 320): Promise<string> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const w = Math.max(1, Math.round(bmp.width * scale))
  const h = Math.max(1, Math.round(bmp.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close?.()
  return canvas.toDataURL('image/png')
}

const hex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')

/** Rough perceptual distance, enough to merge shades of the same colour. */
const dist = (a: number[], b: number[]) =>
  Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)

/** The palette of an image: up to `count` distinct, meaningful colours. */
export async function extractPalette(src: Blob | string, count = 6): Promise<string[]> {
  const blob = typeof src === 'string' ? await (await fetch(src)).blob() : src
  const bmp = await createImageBitmap(blob)
  const size = 120
  const scale = Math.min(1, size / Math.max(bmp.width, bmp.height))
  const w = Math.max(1, Math.round(bmp.width * scale))
  const h = Math.max(1, Math.round(bmp.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close?.()

  const { data } = ctx.getImageData(0, 0, w, h)
  const buckets = new Map<string, { sum: number[]; n: number }>()
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]]
    if (a < 180) continue                                    // transparent edges
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    if (max > 244 && min > 244) continue                     // paper white
    if (max < 18) continue                                   // pure black
    const key = `${r >> 4}-${g >> 4}-${b >> 4}`              // 16-level buckets
    const cur = buckets.get(key)
    if (cur) { cur.sum[0] += r; cur.sum[1] += g; cur.sum[2] += b; cur.n++ }
    else buckets.set(key, { sum: [r, g, b], n: 1 })
  }

  const ranked = [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .map(({ sum, n }) => [sum[0] / n, sum[1] / n, sum[2] / n])

  const picked: number[][] = []
  for (const c of ranked) {
    if (picked.length >= count) break
    if (picked.every((p) => dist(p, c) > 46)) picked.push(c)   // skip near-dupes
  }
  return picked.map(([r, g, b]) => hex(r, g, b))
}

/** One-line summary of a kit for the AI's brand context. */
export function kitSummary(kit: BrandKit): string {
  const bits: string[] = []
  if (kit.colors?.length) bits.push(`Brand colours: ${kit.colors.join(', ')}`)
  if (kit.headingFont) bits.push(`Heading font: ${kit.headingFont}`)
  if (kit.bodyFont) bits.push(`Body font: ${kit.bodyFont}`)
  if (kit.notes) bits.push(kit.notes)
  return bits.join('\n')
}
