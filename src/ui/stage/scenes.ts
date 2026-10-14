import type { PlayView } from '../../core/types';
import { SYMBOLS } from '../../tables/slots';
import { betHits, colorOf } from '../../tables/roulette';
import { COLORS, clamp01, easeOut, hash, roundRect } from './canvas';
import { fmtSigned } from '../format';
import { profile } from '../quality';
import { blit, measure, sprite } from './sprites';

/** What the round paid; scenes draw this into the animation once they settle. */
export interface ResultInfo {
  bet: number;
  net: number;
  detail: string;
  capped: boolean;
  rerolled: boolean;
  bonusPlay?: boolean;
}

export interface SceneCtx {
  result: ResultInfo;
  levels: Record<string, number>;
  /** Positive when the round was won, negative when lost. */
  net: number;
  /** Cosmetic seed, so repeated redraws of the same round look identical. */
  seed: number;
  speed: number;
}

export interface Scene {
  /** Seconds until the scene settles on its final frame. */
  duration: number;
  draw(ctx: CanvasRenderingContext2D, t: number, w: number, h: number): void;
}

const FONT_FAMILY = "system-ui, -apple-system, 'Segoe UI', sans-serif";

function text(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  size: number,
  color: string,
  weight = 700,
  maxWidth?: number,
): void {
  // Glyph runs (emoji especially) are expensive to rasterise; draw each (string, size, colour) once into a sprite.
  const q = Math.max(1, Math.round(size));
  const font = `${weight} ${q}px ${FONT_FAMILY}`;
  const natural = measure(font, s);
  const k = size / q;
  // Anything wider than its budget is squeezed by fillText(maxWidth); keep that on the direct path.
  if (maxWidth === undefined || natural * k <= maxWidth) {
    const w = Math.ceil(natural) + 2;
    const h = Math.ceil(q * 1.5);
    const spr = sprite(`t|${weight}|${q}|${color}|${s}`, w, h, 2, (c) => {
      c.font = font;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = color;
      c.fillText(s, w / 2, h / 2);
    });
    if (spr) {
      blit(ctx, spr, x - (w / 2) * k, y - (h / 2) * k, w * k, h * k, 2 * k);
      return;
    }
  }
  ctx.font = `${weight} ${size}px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  if (maxWidth !== undefined) ctx.fillText(s, x, y, maxWidth);
  else ctx.fillText(s, x, y);
}

const netColor = (net: number) => (net > 0 ? COLORS.green : net < 0 ? COLORS.red : COLORS.muted);

/** Net line plus an optional small caption, bottom-centred in a w×h area (the round's result, in the scene). */
function drawResult(
  ctx: CanvasRenderingContext2D,
  r: ResultInfo,
  w: number,
  h: number,
  caption = '',
  x = w / 2,
  y = h - 18,
): void {
  const big = Math.max(13, Math.min(22, w * 0.07));
  const net = `${fmtSigned(r.net)}${r.capped ? ' · MAX' : ''}`;
  text(ctx, net, x, y, big, netColor(r.net), 800, w - 8);
  if (caption) text(ctx, caption, x, y - big - 4, 12, COLORS.muted, 600, w - 8);
}

function coinScene(view: Extract<PlayView, { kind: 'coin' }>, c: SceneCtx): Scene {
  const duration = 1.2 * c.speed;
  const edgeLevel = Math.min(c.levels.edge ?? 0, 8);
  const special = view.special;
  // Full half-turns before landing: even lands heads, odd lands tails; an edge landing stops mid-turn.
  const turns = (view.heads ? 6 : 7) + (special === 'edge' ? 0.5 : 0);
  const AIR = 0.78;

  /** One coin: extruded rim, bevelled face, milled edge ticks and the crown/star emblem. */
  const drawCoin = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, angle: number, alpha: number): void => {
    const cos = Math.cos(angle);
    const sy = Math.max(0.09, Math.abs(cos));
    const heads = cos >= 0;
    const thick = r * 0.12 + edgeLevel * 0.6;
    const gold = special === 'gold' && heads;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.scale(1, sy);
    // Rim: stacked discs give the coin visible thickness while it turns.
    ctx.fillStyle = heads ? '#8a5a00' : '#6a6a8a';
    for (let d = thick; d >= 0; d -= 1.5) {
      ctx.beginPath();
      ctx.arc(0, d / sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    const g = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r);
    if (heads) {
      g.addColorStop(0, gold ? '#ffffff' : '#fff6bf');
      g.addColorStop(0.5, gold ? '#ffe36a' : COLORS.gold);
      g.addColorStop(1, '#b87400');
    } else {
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.5, '#cfd2ea');
      g.addColorStop(1, '#7c80a8');
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    // Milled edge ticks and the inner ring.
    ctx.strokeStyle = heads ? 'rgba(122,74,0,0.55)' : 'rgba(70,72,110,0.55)';
    ctx.lineWidth = Math.max(1, r * 0.03);
    if (sy > 0.3) {
      for (let k = 0; k < 28; k++) {
        const a = (k / 28) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9);
        ctx.lineTo(Math.cos(a) * r * 0.97, Math.sin(a) * r * 0.97);
        ctx.stroke();
      }
    }
    ctx.lineWidth = Math.max(1.5, r * 0.05);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2);
    ctx.stroke();
    // Emblem.
    if (heads) {
      text(ctx, '♛', 0, r * 0.02, r * 1.0, '#7a4a00', 800);
    } else {
      ctx.fillStyle = '#5a5e90';
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const rr = k % 2 === 0 ? r * 0.5 : r * 0.14;
        const a = (k / 8) * Math.PI * 2 - Math.PI / 2;
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  };

  return {
    duration,
    draw(ctx, t, w, h) {
      const p = clamp01(t / duration);
      const air = clamp01(p / AIR);
      const r = Math.max(14, Math.min(h * 0.24, w * 0.32, 84));
      const cx = w / 2;
      const floor = h * 0.7;
      const restY = floor - r * 0.55;
      const lift = Math.sin(air * Math.PI) * h * 0.3;
      let bounce = 0;
      if (p > AIR) {
        const b = (p - AIR) / (1 - AIR);
        bounce = Math.abs(Math.sin(b * Math.PI * 2)) * (1 - b) * h * 0.06;
      }
      const cy = restY - lift - bounce;
      const angleAt = (u: number): number => easeOut(clamp01(u)) * turns * Math.PI;
      const angle = angleAt(air);
      const flying = p < AIR;

      // Pool of light on the floor, shrinking and fading as the coin rises.
      const rise = flying ? Math.sin(air * Math.PI) : 0;
      const pool = ctx.createRadialGradient(cx, floor, 2, cx, floor, r * 1.5);
      pool.addColorStop(0, `rgba(10,20,60,${0.55 - rise * 0.25})`);
      pool.addColorStop(1, 'rgba(10,20,60,0)');
      ctx.fillStyle = pool;
      ctx.beginPath();
      ctx.ellipse(cx, floor, r * (1.4 - rise * 0.4), r * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();

      // Halo: always faint for a gold coin; after settling, green for a win and red for a loss.
      const settled = t >= duration;
      const halo = settled ? (c.net > 0 ? COLORS.green : c.net < 0 ? COLORS.red : '') : special === 'gold' ? COLORS.gold : '';
      if (halo) {
        const hg = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 1.9);
        hg.addColorStop(0, halo + '66');
        hg.addColorStop(1, halo + '00');
        ctx.fillStyle = hg;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 1.9, 0, Math.PI * 2);
        ctx.fill();
      }

      // Motion trail while it is spinning up in the air.
      if (flying && air > 0.04) {
        for (let k = 3; k >= 1; k--) {
          const u = air - k * 0.035;
          if (u <= 0) continue;
          const ty = restY - Math.sin(u * Math.PI) * h * 0.3;
          drawCoin(ctx, cx, ty, r, angleAt(u), 0.14);
        }
      }
      drawCoin(ctx, cx, cy, r, angle, 1);

      if (settled) {
        // Settled: what it landed on (or the special payout), a free-try tag, and the net.
        const call = special === 'gold' ? 'GOLD COIN' : special === 'edge' ? 'EDGE!' : special === 'ride' ? 'RIDDEN' : view.heads ? 'HEADS' : 'TAILS';
        const caption = c.result.bonusPlay ? `${call} · FREE TRY` : call;
        drawResult(ctx, c.result, w, h, caption);
      }
    },
  };
}

function slotsScene(view: Extract<PlayView, { kind: 'slots' }>, c: SceneCtx): Scene {
  const stops = [0.7, 1.05, 1.4].map((s) => s * c.speed);
  const duration = stops[2] + 0.45;
  const n = SYMBOLS.length;
  // Cherry Picker visibly loads the strip: extra cherries pass by while spinning.
  const loaded = Math.min(c.levels.loaded ?? 0, 10);
  /** Symbol on reel `i` at strip position `k`; the landing position always holds the real result. */
  const strip = (i: number, k: number, land: number): number => {
    if (k === land) return view.reels[i];
    if (loaded > 0 && hash(k, i + 7) < loaded * 0.05) return 0;
    return Math.floor(hash(k * 3 + i, 11 + i) * n) % n;
  };
  const lands = stops.map((st, i) => Math.round(st * 9 / c.speed) + 8 + i * 3);
  // A pair on the first two reels makes the third reel "hang" before it stops.
  const tease = view.reels[0] === view.reels[1];
  // Which reels took part in a pair/triple (and the scatter sevens), so exactly those light up when the round settles.
  const counts = new Array<number>(n).fill(0);
  for (const r of view.reels) counts[r]++;
  const lit = view.reels.map((r) => counts[r] >= 2 || (view.scatter === true && r === 4));
  const tier = Math.max(...counts) >= 3 ? 2 : lit.some(Boolean) ? 1 : 0;
  return {
    duration,
    draw(ctx, t, w, h) {
      const cell = Math.min(w * 0.22, h * 0.36, 130);
      const gap = cell * 0.14;
      const winH = cell * 1.55;
      const total = cell * 3 + gap * 2;
      const x0 = w / 2 - total / 2;
      const cy = h * 0.48;
      const done = t >= stops[2];
      const win = done && tier > 0;
      const hitColor = tier === 2 ? COLORS.gold : COLORS.cyan;

      // Cabinet frame behind the reels.
      const padX = cell * 0.22;
      const padY = cell * 0.22;
      const fx = x0 - padX;
      const fy = cy - winH / 2 - padY;
      const fw = total + padX * 2;
      const fh = winH + padY * 2;
      roundRect(ctx, fx, fy, fw, fh, 18);
      const body = ctx.createLinearGradient(0, fy, 0, fy + fh);
      body.addColorStop(0, '#2a1a05');
      body.addColorStop(1, '#120a02');
      ctx.fillStyle = body;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = win ? hitColor : '#b8770a';
      ctx.stroke();

      // Marquee bulbs chase around the frame; the whole ring flashes on a win.
      const bulbs = Math.max(8, Math.floor(fw / 22));
      for (let k = 0; k < bulbs; k++) {
        const bx = fx + 12 + (k / (bulbs - 1)) * (fw - 24);
        const on = win ? (tier === 2 ? Math.floor(t * 8) % 2 === 0 : k % 2 === 0) : (k + Math.floor(t * 10)) % 3 === 0;
        ctx.fillStyle = on ? hitColor : '#5a3a08';
        ctx.beginPath();
        ctx.arc(bx, fy - 7, 3, 0, Math.PI * 2);
        ctx.arc(bx, fy + fh + 7, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      for (let i = 0; i < 3; i++) {
        const x = x0 + i * (cell + gap);
        const cx = x + cell / 2;
        const hit = done && lit[i];
        ctx.save();
        roundRect(ctx, x, cy - winH / 2, cell, winH, 12);
        ctx.clip();
        const glass = ctx.createLinearGradient(0, cy - winH / 2, 0, cy + winH / 2);
        glass.addColorStop(0, '#0a0f24');
        glass.addColorStop(0.5, '#1b2650');
        glass.addColorStop(1, '#0a0f24');
        ctx.fillStyle = glass;
        ctx.fillRect(x, cy - winH / 2, cell, winH);

        const fs = cell * 0.62;
        const p = clamp01(t / stops[i]);
        const ease = 1 - (1 - p) ** 3;
        let pos = lands[i] * ease;
        if (p >= 1) {
          // Little overshoot-and-settle once the reel locks.
          const s = clamp01((t - stops[i]) / 0.22);
          pos = lands[i] + Math.sin(s * Math.PI) * 0.12 * (1 - s) * 2;
        }
        const speedNow = p >= 1 ? 0 : (1 - p) ** 2;
        const blur = speedNow * cell * 0.22;
        const k0 = Math.floor(pos);
        for (let k = k0 - 2; k <= k0 + 3; k++) {
          const y = cy + (pos - k) * cell;
          const dist = Math.abs(y - cy) / (winH / 2);
          // Once settled, symbols that are not part of a pair/triple dim so the hit stands out.
          const settled = p >= 1 && win && !hit ? 0.4 : p >= 1 && !win ? 0.55 : 1;
          const alpha = Math.max(0.15, 1 - dist * 0.7) * (k === lands[i] && p >= 1 ? 1 : settled);
          const sym = SYMBOLS[strip(i, k, lands[i])];
          ctx.globalAlpha = alpha * (blur > 1 ? 0.7 : 1);
          let size = fs;
          if (hit && k === lands[i]) size = fs * (1.1 + 0.07 * Math.sin(t * 9));
          if (blur > 1) {
            ctx.globalAlpha = alpha * 0.25;
            text(ctx, sym, cx, y - blur, size, COLORS.fg);
            text(ctx, sym, cx, y + blur, size, COLORS.fg);
            ctx.globalAlpha = alpha * 0.7;
          }
          text(ctx, sym, cx, y, size, COLORS.fg);
        }
        ctx.globalAlpha = 1;

        // Shade top and bottom so the strip reads as rolling on a drum.
        const shade = ctx.createLinearGradient(0, cy - winH / 2, 0, cy + winH / 2);
        shade.addColorStop(0, 'rgba(0,0,0,0.65)');
        shade.addColorStop(0.28, 'rgba(0,0,0,0)');
        shade.addColorStop(0.72, 'rgba(0,0,0,0)');
        shade.addColorStop(1, 'rgba(0,0,0,0.65)');
        ctx.fillStyle = shade;
        ctx.fillRect(x, cy - winH / 2, cell, winH);
        if (hit) {
          ctx.globalAlpha = 0.18 + 0.1 * Math.sin(t * 9);
          ctx.fillStyle = hitColor;
          ctx.fillRect(x, cy - winH / 2, cell, winH);
          ctx.globalAlpha = 1;
        }
        ctx.restore();

        // Window outline; the third reel pulses while it hangs on a pair.
        const hanging = tease && i === 2 && t >= stops[1] && t < stops[2];
        roundRect(ctx, x, cy - winH / 2, cell, winH, 12);
        ctx.lineWidth = hit || hanging ? 3 : 2;
        ctx.strokeStyle = hit ? hitColor : hanging ? (Math.floor(t * 12) % 2 ? COLORS.cyan : COLORS.gold) : '#3a4f8f';
        ctx.stroke();
      }

      // Payline across the middle.
      ctx.strokeStyle = win ? hitColor : 'rgba(255,84,112,0.55)';
      ctx.lineWidth = win ? 3 : 1.5;
      ctx.beginPath();
      ctx.moveTo(fx + 4, cy);
      ctx.lineTo(fx + fw - 4, cy);
      ctx.stroke();

      if (done) {
        const notes = /\(([^)]*)\)\s*$/.exec(c.result.detail)?.[1] ?? '';
        drawResult(ctx, c.result, w, h, notes);
      }
    },
  };
}

// European single-zero wheel order.
const WHEEL = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7,
  28, 12, 35, 3, 26,
];

function rouletteScene(view: Extract<PlayView, { kind: 'roulette' }>, c: SceneCtx): Scene {
  const duration = 3 * c.speed;
  const slice = (Math.PI * 2) / WHEEL.length;
  const target = WHEEL.indexOf(view.pocket);
  const magnet = view.bets.includes('number') ? (c.levels.magnet ?? 0) : 0;
  const hits = betHits(view.pocket, view.bets, c.levels);
  const col = colorOf(view.pocket);
  const tint = col === 'red' ? COLORS.red : col === 'green' ? COLORS.green : COLORS.fg;
  const BET_LABEL: Record<string, string> = { color: 'Red', dozen: '1st dozen', number: 'Lucky 17' };
    const drawWheel = (ctx: CanvasRenderingContext2D, R: number, hotPocket: number): void => {
      const rIn = R * 0.62;
      const rOut = R * 0.93;
      for (let i = 0; i < WHEEL.length; i++) {
        const n = WHEEL[i];
        const a0 = i * slice - Math.PI / 2 - slice / 2;
        const colr = colorOf(n);
        const hot = hotPocket === n;
        ctx.beginPath();
        ctx.arc(0, 0, rOut, a0, a0 + slice);
        ctx.arc(0, 0, rIn, a0 + slice, a0, true);
        ctx.closePath();
        ctx.fillStyle = hot ? '#fff3b8' : colr === 'green' ? '#12924a' : colr === 'red' ? '#c4203f' : '#14101f';
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#e8c35a';
        ctx.stroke();
        if (magnet > 0 && Math.abs(n - 17) <= magnet) {
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = COLORS.cyan;
          ctx.beginPath();
          ctx.arc(0, 0, rOut - 2, a0 + 0.02, a0 + slice - 0.02);
          ctx.stroke();
        }
        if (R > 55) {
          ctx.save();
          ctx.rotate(a0 + slice / 2 + Math.PI / 2);
          text(ctx, String(n), 0, -R * 0.82, Math.max(8, R * 0.09), hot ? '#2a1700' : COLORS.fg, 700);
          ctx.restore();
        }
      }
      // Hub: dark cone with four spokes and a gold cap.
      ctx.beginPath();
      ctx.arc(0, 0, rIn, 0, Math.PI * 2);
      ctx.fillStyle = '#120a24';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = COLORS.gold;
      ctx.stroke();
      ctx.lineWidth = Math.max(2, R * 0.04);
      ctx.strokeStyle = '#b8770a';
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2 + Math.PI / 4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * R * 0.12, Math.sin(a) * R * 0.12);
        ctx.lineTo(Math.cos(a) * rIn * 0.92, Math.sin(a) * rIn * 0.92);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.12, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.gold;
      ctx.fill();
    };
  return {
    duration,
    draw(ctx, t, w, h) {
      const p = clamp01(t / duration);
      const R = Math.max(30, Math.min(h * 0.36, w * 0.42));
      const cx = w / 2;
      const cy = h * 0.43;
      const rot = easeOut(p) * 2.6;
      const settled = p >= 1;
      const won = settled && c.net > 0;

      // Outer rim and ball track.
      const rim = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.1);
      rim.addColorStop(0, '#2b1a05');
      rim.addColorStop(0.5, '#ffd35c');
      rim.addColorStop(1, '#7a4a00');
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.1, 0, Math.PI * 2);
      ctx.fillStyle = rim;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.0, 0, Math.PI * 2);
      ctx.fillStyle = '#0a0f24';
      ctx.fill();

      // The wheel is static apart from its rotation, so render it once per size/result and rotate the sprite.
      const q = Math.max(1, Math.round(R));
      const k = R / q;
      const hotPocket = settled ? view.pocket : -1;
      const span = q * 2 * 0.95;
      const spr = sprite(`wheel|${q}|${hotPocket}|${magnet}`, span, span, 2, (c) => {
        c.translate(span / 2, span / 2);
        drawWheel(c, q, hotPocket);
      });
      if (spr) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rot);
        blit(ctx, spr, -(span / 2) * k, -(span / 2) * k, span * k, span * k, 2 * k);
        ctx.restore();
      } else {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rot);
        drawWheel(ctx, R, hotPocket);
        ctx.restore();
      }

      // Ball: orbits the track against the wheel, slows, then drops into the pocket with a couple of bounces.
      const ease = easeOut(p);
      const world = rot + target * slice - Math.PI / 2;
      const a = world + (1 - ease) * -Math.PI * 2 * 6;
      const s = clamp01((p - 0.62) / 0.3);
      const bounce = Math.abs(Math.sin(s * Math.PI * 3)) * (1 - s) * R * 0.05;
      const rad = R * (0.965 - 0.115 * easeOut(s)) - bounce;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, Math.max(3, R * 0.045), 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      if (profile.canvasShadows) {
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 8;
      }
      ctx.fill();
      ctx.shadowBlur = 0;

      if (!settled) return;

      // Result: pocket number in the hub, bet chips that lit up, then the net.
      text(ctx, String(view.pocket), cx, cy, R * 0.4, tint, 800);
      if (won) {
        ctx.beginPath();
        ctx.arc(cx, cy, R * 1.12, 0, Math.PI * 2);
        ctx.lineWidth = 3;
        ctx.strokeStyle = COLORS.gold;
        ctx.globalAlpha = 0.5 + 0.4 * Math.sin(t * 8);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      const chipY = cy + R * 1.1 + 20;
      const size = Math.max(10, Math.min(13, w * 0.04));
      ctx.font = `700 ${size}px system-ui, sans-serif`;
      const labels = view.bets.map((b) => BET_LABEL[b] ?? b);
      const widths = labels.map((l) => ctx.measureText(l).width + 16);
      const gap = 6;
      let x = cx - (widths.reduce((sum, v) => sum + v, 0) + gap * (labels.length - 1)) / 2;
      labels.forEach((l, i) => {
        roundRect(ctx, x, chipY - size, widths[i], size * 2, size);
        ctx.fillStyle = hits[i] ? 'rgba(255,207,74,0.25)' : 'rgba(8,16,42,0.8)';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = hits[i] ? COLORS.gold : '#2c3f7a';
        ctx.stroke();
        text(ctx, l, x + widths[i] / 2, chipY, size, hits[i] ? COLORS.gold : COLORS.muted, 700);
        x += widths[i] + gap;
      });
      drawResult(ctx, c.result, w, h, `${view.pocket} ${col}`, cx, h - 16);
    },
  };
}

const RANK_LABEL = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
const FACES = ['10', 'J', 'Q', 'K'];
const SUITS = ['♠', '♥', '♦', '♣'];

function handTotal(cards: number[]): number {
  let t = 0;
  let aces = 0;
  for (const c of cards) {
    t += c === 1 ? 11 : c;
    if (c === 1) aces++;
  }
  while (t > 21 && aces > 0) {
    t -= 10;
    aces--;
  }
  return t;
}

/** Playing card face: corner indices, big centre suit. (x, y) is the top-left of the card. */
function drawCardFace(ctx: CanvasRenderingContext2D, x: number, y: number, cw: number, ch: number, rank: string, suit: string, color: string): void {
  roundRect(ctx, x, y, cw, ch, Math.max(4, cw * 0.1));
  const g = ctx.createLinearGradient(x, y, x, y + ch);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#e9e4f5');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.stroke();
  const small = cw * (rank.length > 1 ? 0.27 : 0.32);
  text(ctx, rank, x + cw * 0.22, y + ch * 0.15, small, color, 800);
  text(ctx, suit, x + cw * 0.22, y + ch * 0.15 + small * 0.95, small * 0.8, color, 700);
  text(ctx, suit, x + cw / 2 + cw * 0.04, y + ch * 0.58, cw * 0.62, color, 700);
}

function drawCardBack(ctx: CanvasRenderingContext2D, x: number, y: number, cw: number, ch: number): void {
  roundRect(ctx, x, y, cw, ch, Math.max(4, cw * 0.1));
  const g = ctx.createLinearGradient(x, y, x + cw, y + ch);
  g.addColorStop(0, '#1d4fb8');
  g.addColorStop(1, '#0a1f5c');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,207,74,0.45)';
  ctx.lineWidth = 1;
  const step = Math.max(8, cw * 0.22);
  for (let d = -ch; d < cw + ch; d += step) {
    ctx.beginPath();
    ctx.moveTo(x + d, y);
    ctx.lineTo(x + d + ch, y + ch);
    ctx.moveTo(x + d + ch, y);
    ctx.lineTo(x + d, y + ch);
    ctx.stroke();
  }
  ctx.restore();
  roundRect(ctx, x + 3, y + 3, cw - 6, ch - 6, Math.max(3, cw * 0.08));
  ctx.strokeStyle = COLORS.gold;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function blackjackScene(view: Extract<PlayView, { kind: 'blackjack' }>, c: SceneCtx): Scene {
  const step = 0.22 * c.speed;
  const FLIP = 0.2 * c.speed;
  type Who = 'p' | 's' | 'd'; // player hand, split hand, dealer
  const hands: Record<Who, number[]> = { p: view.player, s: view.split ?? [], d: view.dealer };
  // Deal order: player, dealer, player, dealer, then remaining player hits, split hand, dealer hits.
  const order: { who: Who; i: number }[] = [
    { who: 'p', i: 0 },
    { who: 'd', i: 0 },
    { who: 'p', i: 1 },
    { who: 'd', i: 1 },
  ];
  for (let i = 2; i < view.player.length; i++) order.push({ who: 'p', i });
  for (let i = 0; i < hands.s.length; i++) order.push({ who: 's', i });
  for (let i = 2; i < view.dealer.length; i++) order.push({ who: 'd', i });
  const holeHidden = view.outcome === 'bust' && view.dealer.length === 2;
  // The dealer's hole card lies face down until the player's hands are done, then flips.
  const firstHit = order.findIndex((o) => o.who === 'd' && o.i >= 2);
  const revealAt = (firstHit === -1 ? order.length : firstHit) * step;
  const duration = order.length * step + FLIP + 0.6 * c.speed;
  const label = {
    natural: ['BLACKJACK!', COLORS.gold],
    win: ['YOU WIN', COLORS.green],
    push: ['PUSH', COLORS.muted],
    lose: ['DEALER WINS', COLORS.red],
    bust: [view.insured ? 'BUST · INSURED' : 'BUST', view.insured ? COLORS.gold : COLORS.red],
  }[view.outcome] as [string, string];
  const playerWon = view.outcome === 'win' || view.outcome === 'natural';
  const dealerWon = view.outcome === 'lose' || view.outcome === 'bust';
  const pair = /pair \+[\d.]+×/.exec(c.result.detail)?.[0];
  // Small tags for the special rewards this hand used.
  const tags = [
    view.doubled ? 'DOUBLE' : '',
    view.split ? 'SPLIT' : '',
    view.surrendered ? 'SURRENDER' : '',
    view.charlie ? 'CHARLIE' : '',
    view.insured ? 'INSURED' : '',
    pair ? pair.toUpperCase() : '',
  ].filter(Boolean);

  return {
    duration,
    draw(ctx, t, w, h) {
      const split = hands.s.length > 0;
      // The bottom strip is left to the seat dots; the rest is split between two mats, a headline pill and the net.
      const H = h - 28;
      const ch = Math.max(34, Math.min((H - 110) / 2 - 38, 112));
      const cw = ch / 1.4;
      const matH = ch + 38;
      const topY = 8;
      const playerTop = topY + matH + 42;
      const cardY = { d: topY + 8, p: playerTop + 8, s: playerTop + 8 };
      const geom = (who: Who) => {
        const count = hands[who].length;
        const maxW = who === 'd' || !split ? w - 40 : w * 0.42;
        let spread = cw * 0.78;
        if (count > 1 && (count - 1) * spread + cw > maxW) spread = Math.max(cw * 0.3, (maxW - cw) / (count - 1));
        const width = (count - 1) * spread + cw;
        const centre = who === 'd' || !split ? w / 2 : who === 'p' ? w * 0.27 : w * 0.73;
        return { spread, width, x0: centre - width / 2, centre };
      };

      // Felt mats; the side that won glows in the outcome colour, the other fades.
      const settledNow = t >= duration - 0.3 * c.speed;
      const mat = (y: number, x: number, mw: number, glow: string | null, dim: boolean) => {
        roundRect(ctx, x, y, mw, matH, 16);
        const g = ctx.createLinearGradient(0, y, 0, y + matH);
        g.addColorStop(0, '#0f5a44');
        g.addColorStop(1, '#093524');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.lineWidth = glow ? 3 : 1.5;
        ctx.strokeStyle = glow ?? 'rgba(255,255,255,0.16)';
        ctx.stroke();
        if (dim) {
          ctx.fillStyle = 'rgba(5,11,28,0.45)';
          ctx.fill();
        }
      };
      const dealerGlow = settledNow && dealerWon ? COLORS.red : null;
      const playerGlow = settledNow && playerWon ? label[1] : null;
      mat(topY, 8, w - 16, dealerGlow, settledNow && playerWon);
      if (split) {
        mat(playerTop, 8, w / 2 - 12, playerGlow, settledNow && dealerWon);
        mat(playerTop, w / 2 + 4, w / 2 - 12, playerGlow, settledNow && dealerWon);
      } else {
        mat(playerTop, 8, w - 16, playerGlow, settledNow && dealerWon);
      }
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      (split ? (['d', 'p', 's'] as Who[]) : (['d', 'p'] as Who[])).forEach((who) => {
        const g = geom(who);
        for (let i = 0; i < 2; i++) {
          roundRect(ctx, g.x0 + i * g.spread, cardY[who], cw, ch, 6);
          ctx.stroke();
        }
      });
      ctx.restore();

      const drawCard = (who: Who, i: number, k: number) => {
        const born = k * step;
        if (t < born) return;
        const g = geom(who);
        const e = easeOut((t - born) / (0.24 * c.speed));
        const tx = g.x0 + i * g.spread;
        const ty = cardY[who];
        // Slides in from the shoe at the top right, turning as it lands.
        const sx = w - cw * 0.8;
        const sy = -ch;
        const x = tx + (sx - tx) * (1 - e);
        const y = ty + (sy - ty) * (1 - e);
        const isHole = who === 'd' && i === 1;
        const faceUp = !isHole || (!holeHidden && t >= revealAt + FLIP / 2);
        const flipP = isHole && !holeHidden ? clamp01((t - revealAt) / FLIP) : 1;
        const sxScale = isHole && !holeHidden && flipP < 1 ? Math.max(0.05, Math.abs(1 - 2 * flipP)) : 1;
        ctx.save();
        ctx.globalAlpha = Math.min(1, e * 1.5);
        ctx.translate(x + cw / 2, y + ch / 2);
        ctx.rotate((1 - e) * 0.4);
        ctx.scale(sxScale, 1);
        ctx.translate(-cw / 2, -ch / 2);
        // Cards (with their drop shadow) are rendered once per face and size, then blitted.
        const SH = profile.canvasShadows ? 10 : 0;
        const qw = Math.round(cw * 2) / 2;
        const qh = Math.round(ch * 2) / 2;
        let key: string;
        let face: ((c: CanvasRenderingContext2D) => void) | null = null;
        if (!faceUp) {
          key = `back|${qw}|${qh}|${SH}`;
          face = (c) => drawCardBack(c, 0, 0, qw, qh);
        } else {
          const v = hands[who][i];
          const faceKey = who === 'p' ? i : who === 's' ? i + 30 : i + 9;
          const rank = v === 10 ? FACES[Math.floor(hash(c.seed, faceKey) * 4)] : RANK_LABEL[v];
          const suit = SUITS[Math.floor(hash(c.seed + 7, faceKey + 50) * 4)];
          const red = suit === '♥' || suit === '♦';
          key = `face|${qw}|${qh}|${SH}|${rank}|${suit}`;
          face = (c) => drawCardFace(c, 0, 0, qw, qh, rank, suit, red ? '#d3213f' : '#17122a');
        }
        const draw = face;
        const spr = sprite(key, qw, qh, SH, (c) => {
          if (SH) {
            c.shadowColor = 'rgba(0,0,0,0.55)';
            c.shadowBlur = 8;
          }
          draw(c);
        });
        if (spr) blit(ctx, spr, 0, 0, cw, ch, SH * (cw / qw));
        else draw(ctx);
        ctx.restore();
      };
      order.forEach((o, k) => drawCard(o.who, o.i, k));

      const shown = (who: Who) => {
        const n = order.filter((o, k) => o.who === who && t >= (k + 1) * step).length;
        const holeUp = !holeHidden && t >= revealAt + FLIP;
        const visible = who === 'd' && !holeUp ? Math.min(n, 1) : n;
        return visible === 0 ? 0 : handTotal(hands[who].slice(0, visible));
      };
      // Total badge in the strip under each hand's cards, so it never covers a card.
      const badge = (who: Who, name: string, total: number, final: boolean) => {
        if (total <= 0) return;
        const g = geom(who);
        const y = cardY[who] + ch + 15;
        const num = total > 21 ? 'BUST' : String(total);
        const tint = total > 21 ? COLORS.red : total === 21 ? COLORS.gold : COLORS.fg;
        ctx.save();
        ctx.font = '800 18px system-ui, sans-serif';
        const nw = ctx.measureText(num).width;
        ctx.font = '700 10px system-ui, sans-serif';
        const lw = ctx.measureText(name).width;
        const bw = nw + (name ? lw + 8 : 0) + 18;
        roundRect(ctx, g.centre - bw / 2, y - 12, bw, 24, 12);
        ctx.fillStyle = 'rgba(8,12,24,0.85)';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = final ? tint : 'rgba(255,255,255,0.2)';
        ctx.stroke();
        ctx.restore();
        let x = g.centre - bw / 2 + 9;
        if (name) {
          ctx.font = '700 10px system-ui, sans-serif';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = COLORS.muted;
          ctx.fillText(name, x, y + 1);
          x += lw + 8;
        }
        ctx.font = '800 18px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = tint;
        ctx.fillText(num, x, y + 1);
      };
      badge('d', w < 260 ? 'D' : 'DEALER', shown('d'), settledNow);
      badge('p', w < 260 ? 'Y' : split ? 'HAND 1' : 'YOU', shown('p'), settledNow);
      if (split) badge('s', w < 260 ? 'H2' : 'HAND 2', shown('s'), settledNow);

      if (settledNow) {
        const a = easeOut((t - (duration - 0.3 * c.speed)) / (0.3 * c.speed));
        ctx.save();
        ctx.globalAlpha = a;
        // Headline pill between the mats, with any reward tags folded in.
        const head = [label[0], ...tags].join(' · ');
        const hs = Math.max(11, Math.min(15, w * 0.045));
        ctx.font = `800 ${hs}px system-ui, sans-serif`;
        const hw = Math.min(w - 16, ctx.measureText(head).width + 24);
        const hy = topY + matH + 21;
        roundRect(ctx, w / 2 - hw / 2, hy - hs * 0.9, hw, hs * 1.8, hs * 0.9);
        ctx.fillStyle = 'rgba(8,12,24,0.92)';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = label[1];
        ctx.stroke();
        text(ctx, head, w / 2, hy + 1, hs, label[1], 800, hw - 16);
        // Net, large, below the player's mat and above the seat dots.
        const net = `${fmtSigned(c.result.net)}${c.result.capped ? ' · MAX' : ''}`;
        text(ctx, net, w / 2, playerTop + matH + (h - 28 - (playerTop + matH)) / 2 + 6, Math.max(16, Math.min(26, w * 0.1)), netColor(c.result.net), 800, w - 12);
        ctx.restore();
      }
    },
  };
}

export function createScene(view: PlayView, c: SceneCtx): Scene {
  switch (view.kind) {
    case 'coin':
      return coinScene(view, c);
    case 'slots':
      return slotsScene(view, c);
    case 'roulette':
      return rouletteScene(view, c);
    case 'blackjack':
      return blackjackScene(view, c);
  }
}
