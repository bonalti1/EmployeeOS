/**
 * Flyer composer — designs the ad AROUND the real photo instead of letting an
 * image model repaint it. The photo stays pixel-for-pixel real (the whole
 * point: a home they actually built), the brand colours are drawn with their
 * exact hex, the real logo is stamped where the user chooses, and the only AI
 * involved is the words. Composing is instant and costs no tokens.
 */

export type FlyerTemplate = 'overlay' | 'banner' | 'frame'
export type LogoPos = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'bottom-center'

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })

/**
 * Many "logos" arrive as a mark on a white card (JPG, or PNG flattened white).
 * Stamping that onto a photo produces the dreaded white box. If the corners
 * say the background is white, key it out — full alpha for near-white,
 * feathered for the anti-aliased edge.
 */
export async function logoWithAlpha(src: string): Promise<HTMLCanvasElement> {
  const img = await loadImage(src)
  const c = document.createElement('canvas')
  c.width = img.naturalWidth
  c.height = img.naturalHeight
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0)
  const d = ctx.getImageData(0, 0, c.width, c.height)
  const px = d.data

  const corner = (x: number, y: number) => {
    const i = (y * c.width + x) * 4
    return { r: px[i], g: px[i + 1], b: px[i + 2], a: px[i + 3] }
  }
  const corners = [corner(0, 0), corner(c.width - 1, 0), corner(0, c.height - 1), corner(c.width - 1, c.height - 1)]
  const whiteBg = corners.filter((k) => k.a > 200 && k.r > 235 && k.g > 235 && k.b > 235).length >= 3
  if (!whiteBg) return c // already transparent — leave it alone

  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2]
    const min = Math.min(r, g, b)
    if (min > 242) px[i + 3] = 0
    else if (min > 215) px[i + 3] = Math.round(px[i + 3] * (1 - (min - 215) / 27))
  }
  ctx.putImageData(d, 0, 0)
  return c
}

const drawCover = (ctx: CanvasRenderingContext2D, img: CanvasImageSource, iw: number, ih: number, x: number, y: number, w: number, h: number) => {
  const s = Math.max(w / iw, h / ih)
  const dw = iw * s, dh = ih * s
  ctx.save()
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip()
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
  ctx.restore()
}

/** Wrap + auto-size: largest px that fits maxWidth in ≤ maxLines. */
const fitText = (ctx: CanvasRenderingContext2D, text: string, font: (px: number) => string, maxW: number, maxLines: number, startPx: number, minPx: number) => {
  for (let p = startPx; p >= minPx; p -= 4) {
    ctx.font = font(p)
    const words = text.split(/\s+/)
    const lines: string[] = []
    let line = ''
    for (const w of words) {
      const t = line ? `${line} ${w}` : w
      if (ctx.measureText(t).width <= maxW) line = t
      else { if (line) lines.push(line); line = w }
    }
    if (line) lines.push(line)
    if (lines.length <= maxLines && lines.every((l) => ctx.measureText(l).width <= maxW)) return { lines, px: p }
  }
  ctx.font = font(minPx)
  return { lines: [text], px: minPx }
}

const logoRect = (pos: LogoPos, W: number, H: number, lw: number, lh: number, pad: number) => ({
  x: pos.endsWith('center') ? (W - lw) / 2 : pos.endsWith('right') ? W - lw - pad : pad,
  y: pos.startsWith('bottom') ? H - lh - pad : pad,
})

export async function composeFlyer(o: {
  photoUrl: string
  headline: string
  subhead?: string
  template?: FlyerTemplate
  aspect?: 'portrait' | 'square' | 'story'
  primary?: string          // exact brand hex — drawn, never approximated
  accent?: string
  logoUrl?: string
  logoPos?: LogoPos
  headingFont?: string
}): Promise<string> {
  const W = 1080
  const H = o.aspect === 'square' ? 1080 : o.aspect === 'story' ? 1920 : 1620
  const primary = o.primary || '#122251'
  const accent = o.accent || '#ff5a4e'
  const tpl = o.template || 'banner'
  const pad = Math.round(W * 0.055)

  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')!

  const photo = await loadImage(o.photoUrl)
  const serif = (px: number) => `700 ${px}px ${o.headingFont ? `'${o.headingFont}', ` : ''}Georgia, 'Times New Roman', serif`
  const sans = (px: number) => `600 ${px}px -apple-system, 'Segoe UI', Roboto, sans-serif`
  const logo = o.logoUrl ? await logoWithAlpha(o.logoUrl) : null
  const logoPos: LogoPos = o.logoPos || 'bottom-right'

  const stampLogo = (region?: { yMin: number; yMax: number; onLight?: boolean }) => {
    if (!logo) return
    const lw = Math.round(W * 0.26)
    const lh = Math.round((logo.height / logo.width) * lw)
    let { x, y } = logoRect(logoPos, W, H, lw, lh, pad)
    if (region) y = Math.min(Math.max(y, region.yMin + pad * 0.6), region.yMax - lh - pad * 0.6)
    if (!region?.onLight) {
      // soft scrim so a light mark reads over the photo
      const g = ctx.createRadialGradient(x + lw / 2, y + lh / 2, lh * 0.2, x + lw / 2, y + lh / 2, Math.max(lw, lh))
      g.addColorStop(0, 'rgba(0,0,0,0.38)'); g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.fillRect(x - pad, y - pad, lw + pad * 2, lh + pad * 2)
    }
    ctx.drawImage(logo, x, y, lw, lh)
  }

  if (tpl === 'banner') {
    // Solid brand band up top carrying the words; the untouched photo below.
    const bandH = Math.round(H * (o.subhead ? 0.30 : 0.24))
    ctx.fillStyle = primary
    ctx.fillRect(0, 0, W, bandH)
    drawCover(ctx, photo, photo.naturalWidth, photo.naturalHeight, 0, bandH, W, H - bandH)

    ctx.textAlign = 'center'
    const head = fitText(ctx, o.headline, serif, W - pad * 2, 2, 118, 56)
    ctx.font = serif(head.px)
    ctx.fillStyle = '#ffffff'
    const lineH = head.px * 1.12
    const blockH = head.lines.length * lineH + (o.subhead ? head.px * 0.72 : 0)
    let y = (bandH - blockH) / 2 + head.px * 0.9
    for (const l of head.lines) { ctx.fillText(l, W / 2, y); y += lineH }
    if (o.subhead) {
      const sub = fitText(ctx, o.subhead, sans, W - pad * 2, 1, 46, 28)
      ctx.font = sans(sub.px)
      ctx.fillStyle = accent
      ctx.fillText(sub.lines[0], W / 2, y + sub.px * 0.1)
    }
    ctx.fillStyle = accent
    ctx.fillRect(0, bandH - 8, W, 8)
    stampLogo({ yMin: bandH, yMax: H })
  }

  if (tpl === 'overlay') {
    // Full-bleed photo; words over a gradient; nothing about the house changes.
    drawCover(ctx, photo, photo.naturalWidth, photo.naturalHeight, 0, 0, W, H)
    const gH = Math.round(H * 0.42)
    const g = ctx.createLinearGradient(0, 0, 0, gH)
    g.addColorStop(0, 'rgba(8,12,28,0.82)'); g.addColorStop(1, 'rgba(8,12,28,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, gH)

    ctx.textAlign = 'left'
    const head = fitText(ctx, o.headline, serif, W - pad * 2, 3, 104, 52)
    ctx.font = serif(head.px)
    ctx.fillStyle = '#ffffff'
    const lineH = head.px * 1.1
    let y = pad + head.px * 0.9
    for (const l of head.lines) { ctx.fillText(l, pad, y); y += lineH }
    if (o.subhead) {
      const sub = fitText(ctx, o.subhead, sans, W - pad * 2, 2, 42, 26)
      ctx.font = sans(sub.px)
      ctx.fillStyle = accent
      let sy = y + sub.px * 0.3
      for (const l of sub.lines) { ctx.fillText(l, pad, sy); sy += sub.px * 1.25 }
    }
    ctx.fillStyle = accent
    ctx.fillRect(0, H - 10, W, 10)
    stampLogo({ yMin: Math.round(H * 0.5), yMax: H })
  }

  if (tpl === 'frame') {
    // Brand-colour frame, photo as the hero, words on a clean card beneath —
    // the print-flyer look, and a white-background logo needs no keying help.
    const frame = Math.round(W * 0.03)
    ctx.fillStyle = primary
    ctx.fillRect(0, 0, W, H)
    const innerX = frame, innerW = W - frame * 2
    const cardH = Math.round(H * (o.subhead ? 0.24 : 0.19))
    const photoH = H - frame * 2 - cardH
    drawCover(ctx, photo, photo.naturalWidth, photo.naturalHeight, innerX, frame, innerW, photoH)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(innerX, frame + photoH, innerW, cardH)

    ctx.textAlign = 'left'
    const textW = innerW - pad * 2 - (logo ? W * 0.24 : 0)
    const head = fitText(ctx, o.headline, serif, textW, 2, 84, 44)
    ctx.font = serif(head.px)
    ctx.fillStyle = primary
    const lineH = head.px * 1.1
    const baseY = frame + photoH + pad * 0.9 + head.px * 0.8
    let y = baseY
    for (const l of head.lines) { ctx.fillText(l, innerX + pad, y); y += lineH }
    if (o.subhead) {
      const sub = fitText(ctx, o.subhead, sans, textW, 2, 38, 24)
      ctx.font = sans(sub.px)
      ctx.fillStyle = accent
      ctx.fillText(sub.lines[0], innerX + pad, y + sub.px * 0.2)
    }
    if (logo) {
      const lw = Math.round(W * 0.2)
      const lh = Math.round((logo.height / logo.width) * lw)
      ctx.drawImage(logo, innerX + innerW - lw - pad, frame + photoH + (cardH - lh) / 2, lw, lh)
    }
    ctx.fillStyle = accent
    ctx.fillRect(innerX, frame + photoH, innerW, 8)
  }

  return canvas.toDataURL('image/jpeg', 0.92)
}
