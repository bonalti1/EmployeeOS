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
