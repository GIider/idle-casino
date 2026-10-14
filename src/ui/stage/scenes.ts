import type { PlayView } from '../../core/types';
import { SYMBOLS } from '../../tables/slots';
import { colorOf } from '../../tables/roulette';
import { COLORS, clamp01, easeOut, hash, roundRect } from './canvas';
import { fmtSigned } from '../format';
import { profile } from '../quality';

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
  ctx.font = `${weight} ${size}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
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
  const duration = 1.1 * c.speed;
  const edge = Math.min(c.levels.edge ?? 0, 8);
  return {
    duration,
    draw(ctx, t, w, h) {
      const p = clamp01(t / duration);
      const angle = easeOut(p) * (view.heads ? 6 : 7) * Math.PI;
      const r = Math.min(h * 0.2, w * 0.3, 60);
      const cx = w / 2;
      const cy = h * 0.42 - Math.sin(p * Math.PI) * h * 0.2;
      const cos = Math.cos(angle);
      const sy = Math.max(0.06, Math.abs(cos));
      const heads = cos >= 0;
      const thick = 3 + edge * 0.8;

      // Shadow on the felt.
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(cx, h * 0.66, r * (0.9 - Math.sin(p * Math.PI) * 0.3), r * 0.18, 0, 0, Math.PI * 2);
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

      if (t >= duration) {
        // Settled: what it landed on (or the special payout), a free-try tag, and the net.
        const call = view.special === 'gold' ? 'GOLD COIN' : view.special === 'edge' ? 'EDGE!' : view.special === 'ride' ? 'RIDDEN' : view.heads ? 'HEADS' : 'TAILS';
        const caption = c.result.bonusPlay ? `${call} · FREE TRY` : call;
        drawResult(ctx, c.result, w, h, caption);
      }
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
        ctx.shadowBlur = win && profile.canvasShadows ? 18 : 0;
        ctx.lineWidth = win && !profile.canvasShadows ? 4 : 3;
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
      if (done) {
        const notes = /\(([^)]*)\)\s*$/.exec(c.result.detail)?.[1] ?? '';
        drawResult(ctx, c.result, w, h, notes);
      }
    },
  };
}

/** Faint grid of earlier spins around the live reels, newest nearest the centre; fills the stage. */
export function drawSlotsBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number, past: number[][]): void {
  if (past.length === 0) return;
  const cell = Math.min(w * 0.11, h * 0.26, 54);
  const pitchX = cell * 1.05;
  const blockW = pitchX * 3 + cell * 0.5;
  const rows = Math.floor(h / cell / 1.1);
  const blocks = Math.max(1, Math.floor(w / blockW));
  const half = Math.floor(rows / 2);
  const spots: { r: number; b: number; d: number }[] = [];
  for (let r = -half; r <= half; r++) {
    for (let b = -Math.floor(blocks / 2); b <= Math.floor(blocks / 2); b++) {
      // The centre block of the middle row is where the live reels sit.
      if (r === 0 && b === 0) continue;
      spots.push({ r, b, d: Math.abs(r) * 1.4 + Math.abs(b) });
    }
  }
  spots.sort((x, y) => x.d - y.d);
  const newest = past.length - 1;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${cell * 0.5}px system-ui, sans-serif`;
  spots.slice(0, past.length).forEach((spot, i) => {
    const reels = past[newest - i];
    ctx.globalAlpha = Math.max(0.1, 0.34 - i * 0.02);
    const cy = h / 2 + spot.r * cell * 1.1;
    const cx0 = w / 2 + spot.b * blockW;
    reels.forEach((sym, k) => ctx.fillText(SYMBOLS[sym], cx0 + (k - 1) * pitchX, cy));
  });
  ctx.restore();
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
      // Wide stages put the wheel left and the result panel right; narrow ones stack them.
      const wide = w >= 380;
      const R = wide ? Math.min(h * 0.44, w * 0.26) : Math.min(h * 0.34, w * 0.38);
      const cx = wide ? w * 0.3 : w / 2;
      const cy = wide ? h / 2 : h * 0.42;
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
      if (profile.canvasShadows) {
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 8;
      }
      ctx.fill();
      ctx.shadowBlur = 0;

      if (p >= 1) {
        const col = colorOf(view.pocket);
        const tint = col === 'red' ? COLORS.red : col === 'green' ? COLORS.green : COLORS.fg;
        text(ctx, String(view.pocket), cx, cy, R * 0.42, tint, 800);
        if (wide) {
          const px = w * 0.62;
          const pw = w - px - 12;
          const mid = px + pw / 2;
          text(ctx, String(view.pocket), mid, h * 0.26, Math.min(48, h * 0.24), tint, 800);
          text(ctx, col.toUpperCase(), mid, h * 0.26 + Math.min(30, h * 0.16), 12, COLORS.muted, 700);
          text(ctx, `${view.bets.length} bet${view.bets.length > 1 ? 's' : ''}: ${view.bets.join(' · ')}`, mid, h * 0.58, 12, COLORS.muted, 600, pw);
          drawResult(ctx, c.result, pw, h, '', mid, h * 0.76);
          if (c.result.rerolled) text(ctx, '↻ re-rolled', mid, h * 0.9, 12, COLORS.cyan, 700);
        } else {
          drawResult(ctx, c.result, w, h, `${col.toUpperCase()} · ${view.bets.join(' · ')}`);
        }
      } else if (wide) {
        text(ctx, 'Spinning…', w * 0.62 + (w - w * 0.62 - 12) / 2, h * 0.5, 14, COLORS.muted, 600);
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
  const duration = order.length * step + 0.55 * c.speed;
  const label = {
    natural: ['BLACKJACK!', COLORS.gold],
    win: ['YOU WIN', COLORS.green],
    push: ['PUSH', COLORS.muted],
    lose: ['DEALER WINS', COLORS.red],
    bust: [view.insured ? 'BUST · INSURED' : 'BUST', view.insured ? COLORS.gold : COLORS.red],
  }[view.outcome] as [string, string];
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
      // Card size is picked from the lane height so two hands plus their total badges fit; the hand is
      // squeezed (overlap) rather than shrunk when it has many cards.
      const ch = Math.max(34, Math.min(h * 0.25, 84));
      const cw = ch / 1.4;
      const geom = (who: Who) => {
        const count = hands[who].length;
        const maxW = who === 'd' || !split ? w - 28 : w * 0.44;
        let spread = cw * 0.64;
        if (count > 1 && (count - 1) * spread + cw > maxW) spread = Math.max(cw * 0.3, (maxW - cw) / (count - 1));
        const width = (count - 1) * spread + cw;
        const centre = who === 'd' || !split ? w / 2 : who === 'p' ? w * 0.27 : w * 0.73;
        return { spread, width, x0: centre - width / 2, centre };
      };
      const rowY = { d: h * 0.05, p: h * 0.55, s: h * 0.55 };
      const matH = ch + 30;

      // Felt mats the hands sit on, with empty card slots until the cards arrive.
      const mat = (y: number, x: number, mw: number) => {
        roundRect(ctx, x, y - 6, mw, matH, 14);
        const g = ctx.createLinearGradient(0, y - 6, 0, y - 6 + matH);
        g.addColorStop(0, '#0f4a3a');
        g.addColorStop(1, '#09301f');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(255,255,255,0.14)';
        ctx.stroke();
      };
      mat(rowY.d, 8, w - 16);
      if (split) {
        mat(rowY.p, 8, w / 2 - 12);
        mat(rowY.s, w / 2 + 4, w / 2 - 12);
      } else {
        mat(rowY.p, 8, w - 16);
      }
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      (split ? (['d', 'p', 's'] as Who[]) : (['d', 'p'] as Who[])).forEach((who) => {
        const g = geom(who);
        for (let i = 0; i < 2; i++) {
          roundRect(ctx, g.x0 + i * g.spread, rowY[who], cw, ch, 6);
          ctx.stroke();
        }
      });
      ctx.restore();

      const drawCard = (who: Who, i: number, k: number) => {
        if (t < k * step) return;
        const g = geom(who);
        const age = clamp01((t - k * step) / (0.22 * c.speed));
        const e = easeOut(age);
        const x = g.x0 + i * g.spread + (1 - e) * (w * 0.35);
        const y = rowY[who] - (1 - e) * ch * 0.6;
        const faceDown = who === 'd' && i === 1 && holeHidden;
        ctx.save();
        ctx.globalAlpha = e;
        if (profile.canvasShadows) {
          ctx.shadowColor = 'rgba(0,0,0,0.55)';
          ctx.shadowBlur = 8;
        }
        roundRect(ctx, x, y, cw, ch, 6);
        ctx.fillStyle = faceDown ? COLORS.pink : '#f8f4ff';
        ctx.fill();
        ctx.shadowBlur = 0;
        if (faceDown) {
          ctx.strokeStyle = '#fff4';
          ctx.lineWidth = 2;
          ctx.stroke();
        } else {
          const v = hands[who][i];
          const faceKey = who === 'p' ? i : who === 's' ? i + 30 : i + 9;
          const rank = v === 10 ? FACES[Math.floor(hash(c.seed, faceKey) * 4)] : RANK_LABEL[v];
          const suit = SUITS[Math.floor(hash(c.seed + 7, faceKey + 50) * 4)];
          const red = suit === '♥' || suit === '♦';
          const color = red ? '#d3213f' : '#17122a';
          // Overlapped cards only show their left strip, so the rank sits at the left edge.
          const showsAll = i === hands[who].length - 1 || g.spread >= cw * 0.9;
          const cx = showsAll ? x + cw / 2 : x + Math.min(cw / 2, g.spread / 2 + 1);
          text(ctx, rank, cx, y + ch * 0.36, cw * (rank.length > 1 ? 0.5 : 0.62), color, 800);
          text(ctx, suit, cx, y + ch * 0.74, cw * 0.46, color, 700);
        }
        ctx.restore();
      };
      order.forEach((o, k) => drawCard(o.who, o.i, k));

      const shown = (who: Who) => {
        const n = order.filter((o, k) => o.who === who && t >= (k + 1) * step).length;
        const visible = who === 'd' && holeHidden ? Math.min(n, 1) : n;
        return visible === 0 ? 0 : handTotal(hands[who].slice(0, visible));
      };
      // Total badge under each hand: big number, coloured by state.
      const badge = (who: Who, label: string, total: number, final: boolean) => {
        if (total <= 0) return;
        const g = geom(who);
        const y = rowY[who] + ch + 12;
        const num = total > 21 ? 'BUST' : String(total);
        const tint = total > 21 ? COLORS.red : total === 21 ? COLORS.gold : COLORS.fg;
        ctx.save();
        ctx.font = '800 20px system-ui, sans-serif';
        const nw = ctx.measureText(num).width;
        ctx.font = '700 10px system-ui, sans-serif';
        const lw = ctx.measureText(label).width;
        const bw = nw + (label ? lw + 8 : 0) + 18;
        roundRect(ctx, g.centre - bw / 2, y - 12, bw, 24, 12);
        ctx.fillStyle = 'rgba(8,12,24,0.78)';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = final ? tint : 'rgba(255,255,255,0.2)';
        ctx.stroke();
        ctx.restore();
        let x = g.centre - bw / 2 + 9;
        if (label) {
          ctx.font = '700 10px system-ui, sans-serif';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = COLORS.muted;
          ctx.fillText(label, x, y + 1);
          x += lw + 8;
        }
        ctx.font = '800 20px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = tint;
        ctx.fillText(num, x, y + 1);
      };
      const settled = t >= duration - 0.3 * c.speed;
      badge('d', w < 260 ? 'D' : 'DEALER', shown('d'), settled);
      badge('p', w < 260 ? 'Y' : split ? 'HAND 1' : 'YOU', shown('p'), settled);
      if (split) badge('s', w < 260 ? 'H2' : 'HAND 2', shown('s'), settled);

      if (settled) {
        const a = easeOut((t - (duration - 0.3 * c.speed)) / (0.3 * c.speed));
        ctx.save();
        ctx.globalAlpha = a;
        // Headline pill between the mats, with any reward tags folded in.
        const head = [label[0], ...tags].join(' · ');
        const hs = Math.max(11, Math.min(15, w * 0.045));
        ctx.font = `800 ${hs}px system-ui, sans-serif`;
        const hw = Math.min(w - 16, ctx.measureText(head).width + 24);
        const hy = rowY.d + matH - 2 + (rowY.p - (rowY.d + matH)) / 2 + 2;
        roundRect(ctx, w / 2 - hw / 2, hy - hs * 0.9, hw, hs * 1.8, hs * 0.9);
        ctx.fillStyle = 'rgba(8,12,24,0.88)';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = label[1];
        ctx.stroke();
        text(ctx, head, w / 2, hy + 1, hs, label[1], 800, hw - 16);
        // Net, large, under the player's mat.
        const net = `${fmtSigned(c.result.net)}${c.result.capped ? ' · MAX' : ''}`;
        text(ctx, net, w / 2, h - 14, Math.max(16, Math.min(26, w * 0.1)), netColor(c.result.net), 800, w - 12);
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
