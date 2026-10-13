export const COLORS = {
  bg: '#150c26',
  felt: '#1c0f3a',
  feltLight: '#2a1658',
  line: '#3a2766',
  fg: '#f4eaff',
  muted: '#a898c8',
  pink: '#ff2e9a',
  cyan: '#27e8ff',
  gold: '#ffd84a',
  green: '#3dff8f',
  red: '#ff4d6d',
};

export interface Surface {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
}

/** Sizes the backing store for the device pixel ratio. Returns null when hidden or unsupported. */
export function setupCanvas(canvas: HTMLCanvasElement): Surface | null {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w <= 0 || h <= 0) return null;
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = canvas.getContext('2d');
  } catch {
    ctx = null;
  }
  if (!ctx) return null;
  const dpr = window.devicePixelRatio || 1;
  const bw = Math.round(w * dpr);
  const bh = Math.round(h * dpr);
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}

export const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
export const easeOut = (x: number): number => 1 - (1 - clamp01(x)) ** 3;

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Cheap deterministic hash for cosmetic choices (card suits etc). */
export function hash(a: number, b: number): number {
  let x = (a * 374761393 + b * 668265263) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
