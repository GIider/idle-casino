import { profile } from '../quality';

/** Offscreen sprites for things scenes redraw every frame (glyphs, cards, the roulette wheel). */
const cache = new Map<string, HTMLCanvasElement>();
const MAX_ENTRIES = 400;

function scale(): number {
  return Math.min(window.devicePixelRatio || 1, profile.dprCap);
}

/**
 * Returns a canvas holding `draw` rendered once for logical size (w × h) plus `pad` on every side, at the current
 * device scale. `draw` paints in logical units with the origin at the top-left of the unpadded area.
 * Returns null when no 2D context is available (callers fall back to drawing directly).
 */
export function sprite(key: string, w: number, h: number, pad: number, draw: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement | null {
  const s = scale();
  const k = `${s}|${key}`;
  let c = cache.get(k);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil((w + pad * 2) * s));
  c.height = Math.max(1, Math.ceil((h + pad * 2) * s));
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = c.getContext('2d');
  } catch {
    ctx = null;
  }
  if (!ctx) return null;
  ctx.setTransform(s, 0, 0, s, pad * s, pad * s);
  draw(ctx);
  if (cache.size >= MAX_ENTRIES) cache.clear();
  cache.set(k, c);
  return c;
}

/** Draws a sprite made by `sprite` so its unpadded area lands at (x, y) with size (w × h). */
export function blit(ctx: CanvasRenderingContext2D, c: HTMLCanvasElement, x: number, y: number, w: number, h: number, pad: number): void {
  ctx.drawImage(c, x - pad, y - pad, w + pad * 2, h + pad * 2);
}

let measureCtx: CanvasRenderingContext2D | null | undefined;
export function measure(font: string, s: string): number {
  if (measureCtx === undefined) {
    try {
      measureCtx = document.createElement('canvas').getContext('2d');
    } catch {
      measureCtx = null;
    }
  }
  if (!measureCtx) return s.length * 8;
  measureCtx.font = font;
  return measureCtx.measureText(s).width;
}
