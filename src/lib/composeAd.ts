/**
 * Brand finishing pass for a generated creative.
 *
 * Image models cannot draw a real logo — they approximate a wordmark and
 * mangle the letterforms, and they only ever get "close" to a brand colour.
 * So the brand layer is composited here instead, on a canvas: the actual logo
 * PNG from the brand kit and the exact hex colours are drawn over the finished
 * render. The result carries the true mark, pixel for pixel.
 */

export type Placement = 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right' | 'bottom-center'

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Mean brightness (0–1) of a region — decides whether a mark needs a card
 * behind it. A navy logo on a navy footer is invisible without one. */
const regionLuma = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): number => {
  try {
    const { data } = ctx.getImageData(Math.max(0, x), Math.max(0, y), Math.max(1, w), Math.max(1, h))
    let sum = 0
    let n = 0
    for (let i = 0; i < data.length; i += 16) {           // every 4th pixel is plenty
      sum += (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255
      n++
    }
    return n ? sum / n : 1
  } catch {
    return 0.5   // cross-origin render: assume it might be dark and card it
  }
}

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })

/** Draw the logo (and an optional brand-colour accent bar) onto the creative. */
export async function composeAd(opts: {
  imageUrl: string
  logoUrl?: string
  placement?: Placement
  logoScale?: number        // logo width as a share of the creative width
  accentColor?: string      // draws a colour bar along the bottom edge
  scrim?: boolean           // dark gradient behind the logo for legibility
  autoCard?: boolean        // white card behind the mark when it lands on a dark area
}): Promise<string> {
  const base = await loadImage(opts.imageUrl)
  const canvas = document.createElement('canvas')
  canvas.width = base.naturalWidth
  canvas.height = base.naturalHeight
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(base, 0, 0)

  const W = canvas.width
  const H = canvas.height
  const pad = Math.round(W * 0.045)

  if (opts.accentColor) {
    const barH = Math.max(6, Math.round(H * 0.012))
    ctx.fillStyle = opts.accentColor
    ctx.fillRect(0, H - barH, W, barH)
  }

  if (opts.logoUrl) {
    const placement = opts.placement || 'bottom-left'
    const logo = await loadImage(opts.logoUrl)
    const lw = Math.round(W * (opts.logoScale ?? 0.28))
    const lh = Math.round((logo.naturalHeight / logo.naturalWidth) * lw)
    const bottom = placement.startsWith('bottom')
    const x = placement.endsWith('center') ? Math.round((W - lw) / 2)
      : placement.endsWith('right') ? W - lw - pad
        : pad
    const y = bottom ? H - lh - pad - (opts.accentColor ? Math.round(H * 0.012) : 0) : pad

    // A logo carries its own colours, so on a dark panel it simply vanishes.
    // Measure what it is about to land on and, if it is dark, set it on a
    // white card — the way a real brand guideline handles reversed backgrounds.
    if (opts.autoCard && regionLuma(ctx, x, y, lw, lh) < 0.55) {
      const cp = Math.round(lw * 0.09)
      ctx.save()
      ctx.shadowColor = 'rgba(0,0,0,0.25)'
      ctx.shadowBlur = Math.round(lw * 0.06)
      ctx.shadowOffsetY = Math.round(lw * 0.015)
      ctx.fillStyle = '#ffffff'
      roundRect(ctx, x - cp, y - cp, lw + cp * 2, lh + cp * 2, Math.round(lw * 0.05))
      ctx.fill()
      ctx.restore()
    }

    // A soft scrim keeps a white mark readable over a bright sky or wall.
    if (opts.scrim !== false) {
      const gradH = Math.round(lh + pad * 2.2)
      const g = bottom
        ? ctx.createLinearGradient(0, H - gradH, 0, H)
        : ctx.createLinearGradient(0, gradH, 0, 0)
      g.addColorStop(0, 'rgba(0,0,0,0)')
      g.addColorStop(1, 'rgba(0,0,0,0.55)')
      ctx.fillStyle = g
      ctx.fillRect(0, bottom ? H - gradH : 0, W, gradH)
    }

    ctx.drawImage(logo, x, y, lw, lh)
  }

  return canvas.toDataURL('image/png')
}
