import type { BlackjackStats, CoinStats, PlayStats, RouletteStats, SlotsStats, TableId } from '../core/types';
import { SYMBOLS } from '../tables/slots';
import { colorOf } from '../tables/roulette';
import { COLORS, setupCanvas } from './stage/canvas';
import { h, setText } from './dom';
import { fmt } from './format';

/** Slots-only: the last few spins as rows of three symbols, newest first. */
export class SlotsCombosView {
  readonly root: HTMLElement;
  private key = '';

  constructor() {
    this.root = h('div', { class: 'combo-list hidden' });
  }

  update(stats: PlayStats, force = false): void {
    const s = stats.slots;
    const key = JSON.stringify(s.recent);
    if (!force && key === this.key) return;
    this.key = key;
    this.root.replaceChildren();
    if (s.recent.length === 0) {
      this.root.append(h('div', { class: 'history-info', text: 'No spins yet' }));
      return;
    }
    for (const reels of s.recent.slice().reverse()) {
      const [a, b, c] = reels;
      const kind = a === b && b === c ? 'triple' : a === b || b === c || a === c ? 'pair' : '';
      this.root.append(
        h(
          'div',
          { class: `combo ${kind}` },
          h('span', { class: 'combo-reels', text: reels.map((r) => SYMBOLS[r]).join(' ') }),
          h('span', { class: 'combo-tag', text: kind === 'triple' ? 'Triple' : kind === 'pair' ? 'Pair' : '' }),
        ),
      );
    }
  }
}

const CARD_NAMES = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
const handText = (cards: number[]) => cards.map((c) => CARD_NAMES[c] ?? '?').join(' ');
const handTotal = (cards: number[]) => {
  let t = cards.reduce((a, c) => a + c, 0);
  if (cards.includes(1) && t + 10 <= 21) t += 10;
  return t;
};

/** Blackjack-only: the last few hands, player vs dealer, newest first. */
export class BlackjackHandsView {
  readonly root: HTMLElement;
  private key = '';

  constructor() {
    this.root = h('div', { class: 'combo-list hidden' });
  }

  update(stats: PlayStats, force = false): void {
    const s = stats.blackjack;
    const key = JSON.stringify(s.recent);
    if (!force && key === this.key) return;
    this.key = key;
    this.root.replaceChildren();
    if (s.recent.length === 0) {
      this.root.append(h('div', { class: 'history-info', text: 'No hands yet' }));
      return;
    }
    for (const hand of s.recent.slice().reverse()) {
      const mine = (cards: number[]) => `${handText(cards)} (${handTotal(cards)})`;
      const player = hand.split ? `${mine(hand.player)} | ${mine(hand.split)}` : mine(hand.player);
      const tags = [BJ_NAMES[hand.outcome], hand.doubled ? 'Double' : '', hand.split ? 'Split' : '', hand.surrendered ? 'Surrender' : '']
        .filter(Boolean)
        .join(' · ');
      this.root.append(
        h(
          'div',
          { class: `combo bj-${hand.outcome}` },
          h('span', { class: 'bj-hand' }, h('b', { text: player }), h('span', { class: 'bj-vs', text: ' vs ' }), h('span', { text: mine(hand.dealer) })),
          h('span', { class: 'combo-tag', text: tags }),
        ),
      );
    }
  }
}

export const VIEW_LABELS: Record<TableId, string> = {
  coinflip: 'Flips',
  slots: 'Reels',
  roulette: 'Wheel',
  blackjack: 'Hands',
};

const POCKET_COLORS: Record<string, string> = { red: COLORS.red, black: '#6b5a99', green: COLORS.green };
const BJ_KEYS = ['natural', 'win', 'push', 'lose', 'bust'] as const;
const BJ_COLORS: Record<(typeof BJ_KEYS)[number], string> = {
  natural: COLORS.gold,
  win: COLORS.green,
  push: COLORS.cyan,
  lose: COLORS.red,
  bust: COLORS.pink,
};
const BJ_NAMES: Record<(typeof BJ_KEYS)[number], string> = {
  natural: 'Natural',
  win: 'Win',
  push: 'Push',
  lose: 'Lose',
  bust: 'Bust',
};

const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : '–');

/** A game-specific outcome view (coin streaks, symbol frequencies, ...) drawn from `History.stats`. */
export class GameHistoryView {
  readonly root: HTMLElement;
  private canvas: HTMLCanvasElement;
  private info: HTMLElement;
  private key = '';

  constructor(private id: TableId) {
    this.canvas = h('canvas', { class: 'history-canvas stats-canvas' });
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', `${VIEW_LABELS[id]} outcome history`);
    this.info = h('div', { class: 'history-info', text: ' ' });
    this.root = h('div', { class: 'history-view hidden' }, this.canvas, this.info);
  }

  /** Redraws if the stats changed since last time. `force` also redraws when the view was just shown. */
  update(stats: PlayStats, force = false): void {
    const key = `${JSON.stringify(stats[this.statsKey()])}|${this.canvas.clientWidth}`;
    if (!force && key === this.key) return;
    this.key = key;
    const s = setupCanvas(this.canvas);
    switch (this.id) {
      case 'coinflip':
        setText(this.info, this.coinInfo(stats.coin));
        if (s) drawCoin(s.ctx, s.w, s.h, stats.coin);
        break;
      case 'slots':
        setText(this.info, this.slotsInfo(stats.slots));
        if (s) drawSlots(s.ctx, s.w, s.h, stats.slots);
        break;
      case 'roulette':
        setText(this.info, this.rouletteInfo(stats.roulette));
        if (s) drawRoulette(s.ctx, s.w, s.h, stats.roulette);
        break;
      case 'blackjack':
        setText(this.info, this.blackjackInfo(stats.blackjack));
        if (s) drawBlackjack(s.ctx, s.w, s.h, stats.blackjack);
        break;
    }
  }

  invalidate(): void {
    this.key = '';
  }

  private statsKey(): keyof PlayStats {
    return this.id === 'coinflip' ? 'coin' : this.id;
  }

  private coinInfo(c: CoinStats): string {
    const n = c.heads + c.tails;
    if (n === 0) return 'No flips yet';
    const run = c.streak === 0 ? '' : ` · now ${Math.abs(c.streak)}× ${c.streak > 0 ? 'heads' : 'tails'}`;
    return `Heads ${pct(c.heads, n)} · Tails ${pct(c.tails, n)} · longest run ${c.longest}${run}`;
  }

  private slotsInfo(s: SlotsStats): string {
    if (s.rounds === 0) return 'No spins yet';
    return `${fmt(s.rounds)} spins · triples ${pct(s.triples, s.rounds)} · pairs ${pct(s.pairs, s.rounds)}`;
  }

  private rouletteInfo(r: RouletteStats): string {
    const total = r.pockets.reduce((a, b) => a + b, 0);
    if (total === 0) return 'No spins yet';
    const sums = { red: 0, black: 0, green: 0 } as Record<string, number>;
    let hot = 0;
    r.pockets.forEach((n, i) => {
      sums[colorOf(i)] += n;
      if (n > r.pockets[hot]) hot = i;
    });
    return `Red ${pct(sums.red, total)} · Black ${pct(sums.black, total)} · Zero ${pct(sums.green, total)} · hottest ${hot} (${r.pockets[hot]}×)`;
  }

  private blackjackInfo(b: BlackjackStats): string {
    const total = BJ_KEYS.reduce((a, k) => a + b[k], 0);
    if (total === 0) return 'No hands yet';
    return BJ_KEYS.map((k) => `${BJ_NAMES[k]} ${pct(b[k], total)}`).join(' · ');
  }
}

type Ctx = CanvasRenderingContext2D;

function drawCoin(ctx: Ctx, w: number, ht: number, c: CoinStats): void {
  ctx.clearRect(0, 0, w, ht);
  const n = c.heads + c.tails;
  const pad = 8;
  const barY = 8;
  const barH = 22;
  const bw = w - pad * 2;
  const headsW = n > 0 ? (c.heads / n) * bw : bw / 2;
  ctx.fillStyle = COLORS.gold;
  ctx.fillRect(pad, barY, headsW, barH);
  ctx.fillStyle = COLORS.pink;
  ctx.fillRect(pad + headsW, barY, bw - headsW, barH);
  ctx.strokeStyle = COLORS.fg;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w / 2, barY - 4);
  ctx.lineTo(w / 2, barY + barH + 4);
  ctx.stroke();
  ctx.fillStyle = COLORS.bg;
  ctx.font = '600 12px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(`H ${c.heads}`, pad + 6, barY + barH / 2);
  ctx.textAlign = 'right';
  ctx.fillText(`T ${c.tails}`, w - pad - 6, barY + barH / 2);
  ctx.textAlign = 'left';

  // Bead plate: recent flips fill columns of 6 top-to-bottom, like a baccarat road.
  const rows = 6;
  const top = barY + barH + 14;
  const cell = Math.min((ht - top - 6) / rows, 22);
  const left = pad;
  c.recent.forEach((v, i) => {
    const col = Math.floor(i / rows);
    const row = i % rows;
    const cx = left + col * cell + cell / 2;
    const cy = top + row * cell + cell / 2;
    if (cx + cell / 2 > w) return;
    ctx.beginPath();
    ctx.arc(cx, cy, cell / 2 - 2, 0, Math.PI * 2);
    ctx.fillStyle = v ? COLORS.gold : COLORS.pink;
    ctx.fill();
  });
  if (c.recent.length === 0) {
    ctx.fillStyle = COLORS.muted;
    ctx.fillText('Flip some coins to see the beads', pad, top + 20);
  }
}

function drawSlots(ctx: Ctx, w: number, ht: number, s: SlotsStats): void {
  ctx.clearRect(0, 0, w, ht);
  const total = s.symbols.reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...s.symbols);
  const pad = 8;
  const slot = (w - pad * 2) / s.symbols.length;
  const labelH = 24;
  const chartH = ht - labelH - 18;
  s.symbols.forEach((n, i) => {
    const x = pad + i * slot + slot * 0.15;
    const bh = (n / max) * chartH;
    ctx.fillStyle = i >= 4 ? COLORS.gold : COLORS.cyan;
    ctx.fillRect(x, 14 + chartH - bh, slot * 0.7, bh);
    ctx.fillStyle = COLORS.muted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(total > 0 ? pct(n, total) : '–', x + slot * 0.35, 11);
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillText(SYMBOLS[i], x + slot * 0.35, ht - 6);
  });
  ctx.textAlign = 'left';
}

function drawRoulette(ctx: Ctx, w: number, ht: number, r: RouletteStats): void {
  ctx.clearRect(0, 0, w, ht);
  const max = Math.max(1, ...r.pockets);
  const pad = 6;
  const cw = (w - pad * 2) / r.pockets.length;
  const chartH = ht - 46;
  r.pockets.forEach((n, i) => {
    const x = pad + i * cw;
    ctx.fillStyle = POCKET_COLORS[colorOf(i)];
    ctx.globalAlpha = 0.25;
    ctx.fillRect(x + 0.5, 6, cw - 1, chartH);
    ctx.globalAlpha = 1;
    const bh = (n / max) * chartH;
    ctx.fillRect(x + 0.5, 6 + chartH - bh, cw - 1, bh);
  });
  // Last pockets as chips along the bottom.
  const chip = Math.min(20, (w - pad * 2) / Math.max(1, r.recent.length));
  ctx.font = `${Math.max(8, chip * 0.55)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  r.recent.forEach((p, i) => {
    const cx = pad + i * chip + chip / 2;
    ctx.fillStyle = POCKET_COLORS[colorOf(p)];
    ctx.beginPath();
    ctx.arc(cx, ht - 16, chip / 2 - 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.bg;
    ctx.fillText(String(p), cx, ht - 15);
  });
  ctx.textAlign = 'left';
}

function drawBlackjack(ctx: Ctx, w: number, ht: number, b: BlackjackStats): void {
  ctx.clearRect(0, 0, w, ht);
  const total = BJ_KEYS.reduce((a, k) => a + b[k], 0);
  const pad = 8;
  const bw = w - pad * 2;
  const y = 20;
  const barH = 34;
  if (total === 0) {
    ctx.fillStyle = COLORS.line;
    ctx.fillRect(pad, y, bw, barH);
    return;
  }
  let x = pad;
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  for (const k of BJ_KEYS) {
    const seg = (b[k] / total) * bw;
    if (seg <= 0) continue;
    ctx.fillStyle = BJ_COLORS[k];
    ctx.fillRect(x, y, seg, barH);
    if (seg > 34) {
      ctx.fillStyle = COLORS.bg;
      ctx.fillText(BJ_NAMES[k], x + 4, y + barH / 2);
    }
    x += seg;
  }
  // Win rate marker vs a reference 50% line.
  ctx.strokeStyle = COLORS.fg;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(w / 2, y - 8);
  ctx.lineTo(w / 2, y + barH + 8);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = COLORS.muted;
  ctx.fillText(`${fmt(total)} hands`, pad, y + barH + 20);
}
