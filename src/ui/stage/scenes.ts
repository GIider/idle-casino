import type { PlayView } from '../../core/types';
import { SYMBOLS } from '../../tables/slots';
import { colorOf } from '../../tables/roulette';
import { COLORS, clamp01, easeOut, hash, roundRect } from './canvas';

export interface SceneCtx {
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

function text(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  size: number,
  color: string,
  weight = 700,
): void {
  ctx.font = `${weight} ${size}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

function coinScene(view: Extract<PlayView, { kind: 'coin' }>, c: SceneCtx): Scene {
  const duration = 1.1 * c.speed;
  const edge = Math.min(c.levels.edge ?? 0, 8);
  return {
    duration,
    draw(ctx, t, w, h) {
      const p = clamp01(t / duration);
      const angle = easeOut(p) * (view.heads ? 6 : 7) * Math.PI;
      const r = Math.min(h * 0.26, 64);
      const cx = w / 2;
      const cy = h * 0.55 - Math.sin(p * Math.PI) * h * 0.28;
      const cos = Math.cos(angle);
      const sy = Math.max(0.06, Math.abs(cos));
      const heads = cos >= 0;
      const thick = 3 + edge * 0.8;

      // Shadow on the felt.
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(cx, h * 0.8, r * (0.9 - Math.sin(p * Math.PI) * 0.3), r * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, sy);
      ctx.fillStyle = '#a07a12';
      ctx.beginPath();
      ctx.arc(0, thick / sy, r, 0, Math.PI * 2);
      ctx.fill();
      const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
      g.addColorStop(0, heads ? '#fff2a8' : '#e8e8f4');
      g.addColorStop(1, heads ? COLORS.gold : '#9a9ab8');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = heads ? '#b8901a' : '#6e6e90';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, sy);
      text(ctx, heads ? '♛' : '✦', 0, 0, r * 1.0, heads ? '#8a6410' : '#55557a', 800);
      ctx.restore();
    },
  };
}

function slotsScene(view: Extract<PlayView, { kind: 'slots' }>, c: SceneCtx): Scene {
  const stops = [0.6, 0.9, 1.2].map((s) => s * c.speed);
  const duration = stops[2] + 0.35;
  const n = SYMBOLS.length;
  // Cherry Picker visibly loads the strip: extra cherries pass by while spinning.
  const loaded = Math.min(c.levels.loaded ?? 0, 10);
  return {
    duration,
    draw(ctx, t, w, h) {
      const cell = Math.min(w * 0.2, h * 0.5, 92);
      const gap = cell * 0.18;
      const total = cell * 3 + gap * 2;
      const x0 = w / 2 - total / 2;
      const y0 = h / 2 - cell / 2;
      const done = t >= stops[2];
      const win = done && c.net > 0;
      for (let i = 0; i < 3; i++) {
        const x = x0 + i * (cell + gap);
        ctx.save();
        roundRect(ctx, x, y0, cell, cell, 12);
        ctx.fillStyle = '#0d0820';
        ctx.fill();
        ctx.shadowColor = win ? COLORS.gold : 'transparent';
        ctx.shadowBlur = win ? 18 : 0;
        ctx.lineWidth = 3;
        ctx.strokeStyle = win ? COLORS.gold : COLORS.line;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.clip();
        const spinning = t < stops[i];
        const fs = cell * 0.55;
        if (spinning) {
          const pos = t * 16 + i * 3;
          const f = pos - Math.floor(pos);
          for (let row = -1; row <= 1; row++) {
            let idx = (Math.floor(pos) + row + 3 * n) % n;
            if (loaded > 0 && hash(Math.floor(pos) + row, i) < loaded * 0.05) idx = 0;
            ctx.globalAlpha = 0.55;
            text(ctx, SYMBOLS[idx], x + cell / 2, y0 + cell / 2 + (row + f) * cell * 0.9, fs, COLORS.fg);
          }
          ctx.globalAlpha = 1;
        } else {
          const settle = clamp01((t - stops[i]) / 0.15);
          const bounce = (1 - settle) * -cell * 0.25;
          text(ctx, SYMBOLS[view.reels[i]], x + cell / 2, y0 + cell / 2 + bounce, fs, COLORS.fg);
        }
        ctx.restore();
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
  const duration = 2.6 * c.speed;
  const slice = (Math.PI * 2) / WHEEL.length;
  const target = WHEEL.indexOf(view.pocket);
  const magnet = view.bets.includes('number') ? (c.levels.magnet ?? 0) : 0;
  return {
    duration,
    draw(ctx, t, w, h) {
      const p = clamp01(t / duration);
      const R = Math.min(h * 0.44, w * 0.4);
      const cx = w / 2;
      const cy = h / 2;
      const rot = easeOut(p) * 2.2;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      for (let i = 0; i < WHEEL.length; i++) {
        const n = WHEEL[i];
        const a0 = i * slice - Math.PI / 2 - slice / 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, R, a0, a0 + slice);
        ctx.closePath();
        const col = colorOf(n);
        ctx.fillStyle = col === 'green' ? '#12924a' : col === 'red' ? '#c4203f' : '#14101f';
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = COLORS.line;
        ctx.stroke();
        if (magnet > 0 && Math.abs(n - 17) <= magnet) {
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = COLORS.cyan;
          ctx.beginPath();
          ctx.arc(0, 0, R * 0.99, a0 + 0.01, a0 + slice - 0.01);
          ctx.stroke();
        }
        if (R > 60) {
          ctx.save();
          ctx.rotate(a0 + slice / 2 + Math.PI / 2);
          text(ctx, String(n), 0, -R * 0.84, Math.max(8, R * 0.1), COLORS.fg, 600);
          ctx.restore();
        }
      }
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.62, 0, Math.PI * 2);
      ctx.fillStyle = '#1a1030';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = COLORS.gold;
      ctx.stroke();
      ctx.restore();

      // Ball: spirals inwards, counter to the wheel, then rides the winning pocket.
      const ease = easeOut(p);
      const angleOnWheel = target * slice;
      const orbit = (1 - ease) * -Math.PI * 2 * 5;
      const a = rot + angleOnWheel - Math.PI / 2 + orbit;
      const rad = R * (0.97 - 0.17 * ease) - Math.sin(clamp01(p * 6)) * 0;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, Math.max(3, R * 0.045), 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.shadowColor = '#fff';
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;

      if (p >= 1) {
        const col = colorOf(view.pocket);
        text(ctx, String(view.pocket), cx, cy, R * 0.42, col === 'red' ? COLORS.red : col === 'green' ? COLORS.green : COLORS.fg, 800);
      }
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

function blackjackScene(view: Extract<PlayView, { kind: 'blackjack' }>, c: SceneCtx): Scene {
  const step = 0.2 * c.speed;
  // Deal order: player, dealer, player, dealer, then remaining player hits, then dealer hits.
  const order: { who: 'p' | 'd'; i: number }[] = [
    { who: 'p', i: 0 },
    { who: 'd', i: 0 },
    { who: 'p', i: 1 },
    { who: 'd', i: 1 },
  ];
  for (let i = 2; i < view.player.length; i++) order.push({ who: 'p', i });
  for (let i = 2; i < view.dealer.length; i++) order.push({ who: 'd', i });
  const holeHidden = view.outcome === 'bust' && view.dealer.length === 2;
  const duration = order.length * step + 0.55 * c.speed;
  const label = {
    natural: ['BLACKJACK!', COLORS.gold],
    win: ['YOU WIN', COLORS.green],
    push: ['PUSH', COLORS.muted],
    lose: ['DEALER WINS', COLORS.red],
    bust: [view.insured ? 'BUST · INSURED' : 'BUST', view.insured ? COLORS.gold : COLORS.red],
  }[view.outcome] as [string, string];

  return {
    duration,
    draw(ctx, t, w, h) {
      const cw = Math.min(w * 0.11, h * 0.26, 58);
      const ch = cw * 1.4;
      const spread = cw * 0.72;
      const rows = { d: h * 0.1, p: h * 0.58 };
      const drawCard = (who: 'p' | 'd', i: number, k: number) => {
        const cards = who === 'p' ? view.player : view.dealer;
        const count = cards.length;
        const baseX = w / 2 - ((count - 1) * spread + cw) / 2 + i * spread;
        const age = clamp01((t - k * step) / (0.22 * c.speed));
        if (t < k * step) return;
        const e = easeOut(age);
        const x = baseX + (1 - e) * (w * 0.4);
        const y = rows[who] - (1 - e) * ch * 0.8;
        const faceDown = who === 'd' && i === 1 && holeHidden;
        ctx.save();
        ctx.globalAlpha = e;
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 8;
        roundRect(ctx, x, y, cw, ch, 6);
        ctx.fillStyle = faceDown ? COLORS.pink : '#f6f1ff';
        ctx.fill();
        ctx.shadowBlur = 0;
        if (faceDown) {
          ctx.strokeStyle = '#fff3';
          ctx.lineWidth = 2;
          roundRect(ctx, x + 4, y + 4, cw - 8, ch - 8, 4);
          ctx.stroke();
        } else {
          const v = cards[i];
          const label = v === 10 ? FACES[Math.floor(hash(c.seed, who === 'p' ? i : i + 9) * 4)] : RANK_LABEL[v];
          const suit = SUITS[Math.floor(hash(c.seed + 7, (who === 'p' ? 0 : 20) + i) * 4)];
          const red = suit === '♥' || suit === '♦';
          const color = red ? '#d3213f' : '#17122a';
          text(ctx, label, x + cw / 2, y + ch * 0.36, cw * 0.46, color, 800);
          text(ctx, suit, x + cw / 2, y + ch * 0.72, cw * 0.4, color, 700);
        }
        ctx.restore();
      };
      order.forEach((o, k) => drawCard(o.who, o.i, k));

      const shown = (who: 'p' | 'd') => {
        const cards = who === 'p' ? view.player : view.dealer;
        const idxs = order.map((o, k) => ({ o, k })).filter(({ o, k }) => o.who === who && t >= (k + 1) * step);
        let n = idxs.length;
        if (who === 'd' && holeHidden) n = Math.min(n, 1);
        return n === 0 ? 0 : handTotal(cards.slice(0, n));
      };
      const pt = shown('p');
      const dt = shown('d');
      if (dt > 0) text(ctx, `Dealer ${dt}`, w * 0.14, rows.d + ch / 2, 13, COLORS.muted, 600);
      if (pt > 0) text(ctx, `You ${pt}`, w * 0.14, rows.p + ch / 2, 13, COLORS.fg, 600);

      if (t >= duration - 0.3 * c.speed) {
        const a = easeOut((t - (duration - 0.3 * c.speed)) / (0.3 * c.speed));
        ctx.save();
        ctx.globalAlpha = a;
        text(ctx, label[0], w / 2, h * 0.5 + 2, Math.min(26, w * 0.06), label[1], 800);
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
