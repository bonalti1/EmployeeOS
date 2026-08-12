/**
 * RJP monogram — Rolando Joan Pena's personal wordmark, an elegant serif
 * "RJP" on a fully transparent background so it sits directly on the dark
 * sidebar (and any dark surface) with no baked-in tile. Sized by height;
 * the aspect ratio is preserved automatically.
 */
export function Logo({ height = 56, title = 'RJP' }: { height?: number; title?: string }) {
  return (
    <img
      src="/logos/rjp.png"
      alt={title}
      draggable={false}
      style={{ height, width: 'auto', display: 'block', userSelect: 'none' }}
    />
  )
}

/**
 * BONALTI wordmark — the company mark used across the Assistant OS (Carlos's
 * shell) and the shared sign-in. White on transparent, wide aspect (~5.3:1),
 * so it's sized by height and capped to its container's width.
 */
export function BonaltiLogo({ height = 34, title = 'BONALTI' }: { height?: number; title?: string }) {
  return (
    <img
      src="/logos/bonalti.png"
      alt={title}
      draggable={false}
      style={{ height, width: 'auto', maxWidth: '100%', objectFit: 'contain', display: 'block', userSelect: 'none' }}
    />
  )
}
