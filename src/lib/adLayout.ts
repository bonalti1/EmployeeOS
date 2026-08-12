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

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export async function composeFlyer(o: {
  photoUrl: string
  headline: string
  subhead?: string
  cta?: string              // the ask — an ad without one is a donation
  eyebrow?: string          // small uppercase kicker (usually the brand name)
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
    const lw = Math.round(W * 0.24)
    const lh = Math.round((logo.height / logo.width) * lw)
    let { x, y } = logoRect(logoPos, W, H, lw, lh, pad)
    if (region) y = Math.min(Math.max(y, region.yMin + pad * 0.6), region.yMax - lh - pad * 0.6)
    if (!region?.onLight) {
      // A clean white chip keeps any mark crisp over the photo — a navy/red
      // logo washed out against concrete is a logo wasted.
      const cp = Math.round(pad * 0.45)
      ctx.save()
      ctx.shadowColor = 'rgba(0,0,0,0.28)'
      ctx.shadowBlur = 18
      ctx.shadowOffsetY = 4
      ctx.fillStyle = 'rgba(255,255,255,0.96)'
      roundRect(ctx, x - cp, y - cp, lw + cp * 2, lh + cp * 2, Math.round(cp * 0.9))
      ctx.fill()
      ctx.restore()
    }
    ctx.drawImage(logo, x, y, lw, lh)
  }

  /** The ask, as an accent pill nobody can miss. Skips the logo's corner. */
  const stampCta = (yBottom: number) => {
    if (!o.cta) return
    const px = 34
    ctx.font = sans(px)
    const tw = ctx.measureText(o.cta).width
    const ph = Math.round(px * 2.1)
    const pw = Math.round(tw + px * 2.2)
    const cx = logoPos === 'bottom-center' ? pad + pw / 2 : W / 2
    const x = Math.round(Math.min(Math.max(cx - pw / 2, pad), W - pw - pad))
    const y = yBottom - ph - pad
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.3)'
    ctx.shadowBlur = 16
    ctx.shadowOffsetY = 4
    ctx.fillStyle = accent
    roundRect(ctx, x, y, pw, ph, ph / 2)
    ctx.fill()
    ctx.restore()
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.fillText(o.cta, x + pw / 2, y + ph / 2 + px * 0.36)
    ctx.textAlign = 'left'
  }

  // ---- Design-system helpers (the difference between template and agency) ---
  const hexRgb = (hex: string) => {
    const v = hex.replace('#', '')
    const n = parseInt(v.length === 3 ? v.split('').map((c) => c + c).join('') : v, 16)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
  }
  /** Unify the photo with the palette: a whisper of brand tint + a soft base
   * vignette for depth. Subtle on purpose — the house must stay honest. */
  const gradePhoto = (x: number, y: number, w: number, h: number) => {
    const { r, g, b } = hexRgb(primary)
    ctx.fillStyle = `rgba(${r},${g},${b},0.07)`
    ctx.fillRect(x, y, w, h)
    const v = ctx.createLinearGradient(0, y + h * 0.55, 0, y + h)
    v.addColorStop(0, 'rgba(6,10,22,0)')
    v.addColorStop(1, 'rgba(6,10,22,0.34)')
    ctx.fillStyle = v
    ctx.fillRect(x, y + h * 0.55, w, h * 0.45)
  }
  const setTracking = (px: string) => { (ctx as unknown as { letterSpacing?: string }).letterSpacing = px }
  /** Small uppercase kicker + short accent rule — instant editorial structure. */
  const drawEyebrow = (x: number, y: number, color: string): number => {
    const text = (o.eyebrow || '').toUpperCase().trim()
    if (!text) return y - pad * 0.55
    setTracking('5px')
    ctx.font = sans(23)
    ctx.fillStyle = color
    ctx.fillText(text, x, y)
    setTracking('0px')
    ctx.fillStyle = accent
    ctx.fillRect(x + 2, y + 16, 62, 5)
    return y + 21
  }

  if (tpl === 'banner') {
    // Editorial band: eyebrow + left-aligned headline on the brand field, the
    // untouched (lightly graded) photo below. Asymmetric, not centred.
    const bandH = Math.round(H * (o.subhead ? 0.33 : 0.27))
    ctx.fillStyle = primary
    ctx.fillRect(0, 0, W, bandH)
    drawCover(ctx, photo, photo.naturalWidth, photo.naturalHeight, 0, bandH, W, H - bandH)
    gradePhoto(0, bandH, W, H - bandH)

    ctx.textAlign = 'left'
    let y = drawEyebrow(pad, pad + 10, 'rgba(255,255,255,0.72)') + pad * 0.72
    const head = fitText(ctx, o.headline, serif, W - pad * 2, 2, 108, 54)
    ctx.font = serif(head.px)
    ctx.fillStyle = '#ffffff'
    const lineH = head.px * 1.06
    y += head.px * 0.82
    for (const l of head.lines) { ctx.fillText(l, pad, y); y += lineH }
    if (o.subhead) {
      const sub = fitText(ctx, o.subhead, sans, W - pad * 2, 1, 36, 24)
      ctx.font = sans(sub.px)
      ctx.fillStyle = 'rgba(255,255,255,0.85)'   // never saturated colour as body text
      ctx.fillText(sub.lines[0], pad, y - lineH + head.px * 1.02 + sub.px * 0.5)
    }
    ctx.fillStyle = accent
    ctx.fillRect(0, bandH - 4, W, 4)
    stampCta(H)
    stampLogo({ yMin: bandH, yMax: H - (o.cta ? Math.round(pad * 2.6) : 0) })
  }

  if (tpl === 'overlay') {
    // Full-bleed photo; words over a brand-tinted gradient, left-aligned.
    drawCover(ctx, photo, photo.naturalWidth, photo.naturalHeight, 0, 0, W, H)
    gradePhoto(0, 0, W, H)
    const { r, g, b } = hexRgb(primary)
    const gH = Math.round(H * 0.46)
    const g1 = ctx.createLinearGradient(0, 0, 0, gH)
    g1.addColorStop(0, `rgba(${Math.round(r * 0.35)},${Math.round(g * 0.35)},${Math.round(b * 0.45)},0.88)`)
    g1.addColorStop(1, 'rgba(8,12,28,0)')
    ctx.fillStyle = g1
    ctx.fillRect(0, 0, W, gH)

    ctx.textAlign = 'left'
    let y = drawEyebrow(pad, pad + 10, 'rgba(255,255,255,0.72)') + pad * 0.72
    const head = fitText(ctx, o.headline, serif, W - pad * 2, 3, 100, 50)
    ctx.font = serif(head.px)
    ctx.fillStyle = '#ffffff'
    const lineH = head.px * 1.06
    y += head.px * 0.82
    for (const l of head.lines) { ctx.fillText(l, pad, y); y += lineH }
    if (o.subhead) {
      const sub = fitText(ctx, o.subhead, sans, W - pad * 2.4, 2, 36, 24)
      ctx.font = sans(sub.px)
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      let sy = y - lineH + head.px * 1.05 + sub.px * 0.5
      for (const l of sub.lines) { ctx.fillText(l, pad, sy); sy += sub.px * 1.3 }
    }
    ctx.fillStyle = accent
    ctx.fillRect(0, H - 6, W, 6)
    stampCta(H - 6)
    stampLogo({ yMin: Math.round(H * 0.5), yMax: H - (o.cta ? Math.round(pad * 2.6) : 0) })
  }

  if (tpl === 'frame') {
    // Gallery frame: thin brand border, graded photo, editorial card beneath.
    const frame = Math.round(W * 0.028)
    ctx.fillStyle = primary
    ctx.fillRect(0, 0, W, H)
    const innerX = frame, innerW = W - frame * 2
    const cardH = Math.round(H * (o.subhead ? 0.25 : 0.20))
    const photoH = H - frame * 2 - cardH
    drawCover(ctx, photo, photo.naturalWidth, photo.naturalHeight, innerX, frame, innerW, photoH)
    gradePhoto(innerX, frame, innerW, photoH)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(innerX, frame + photoH, innerW, cardH)

    ctx.textAlign = 'left'
    const textW = innerW - pad * 2 - (logo ? W * 0.24 : 0)
    let y = frame + photoH + pad * 0.85
    y = drawEyebrow(innerX + pad, y, '#8a93a6') + pad * 0.6
    const head = fitText(ctx, o.headline, serif, textW, 2, 78, 40)
    ctx.font = serif(head.px)
    ctx.fillStyle = primary
    const lineH = head.px * 1.08
    y += head.px * 0.8
    for (const l of head.lines) { ctx.fillText(l, innerX + pad, y); y += lineH }
    if (o.subhead) {
      const sub = fitText(ctx, o.subhead, sans, textW, 2, 32, 22)
      ctx.font = sans(sub.px)
      ctx.fillStyle = '#5b6472'                  // quiet grey, not shouting red
      ctx.fillText(sub.lines[0], innerX + pad, y - lineH + head.px * 1.02 + sub.px * 0.5)
    }
    if (logo) {
      const lw = Math.round(W * 0.19)
      const lh = Math.round((logo.height / logo.width) * lw)
      ctx.drawImage(logo, innerX + innerW - lw - pad, frame + photoH + (cardH - lh) / 2, lw, lh)
    }
    ctx.fillStyle = accent
    ctx.fillRect(innerX, frame + photoH, innerW, 6)
    stampCta(frame + photoH)
  }

  return canvas.toDataURL('image/jpeg', 0.92)
}
