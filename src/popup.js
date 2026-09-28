/* Where a drop-down panel goes: under its anchor, or above it when the room underneath is too small for it. */

/**
 * rect: the anchor's box in the window; viewport: { width, height }; panel: { width, height } at its largest.
 * Returns fixed-position styles: `left` plus either `top` (opens downwards) or `bottom` (opens upwards).
 */
export function placePanel(rect, viewport, panel, gap = 4) {
  const left = Math.max(8, Math.min(rect.left, viewport.width - panel.width - 16));
  const below = viewport.height - rect.bottom - gap;
  const above = rect.top - gap;
  if (below >= panel.height || below >= above) return { left, top: rect.bottom + gap };
  return { left, bottom: viewport.height - rect.top + gap };
}
