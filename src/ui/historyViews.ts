import type { BlackjackStats, CoinStats, PlayStats, RouletteStats, SlotsStats, TableId } from '../core/types';
import { SYMBOLS } from '../tables/slots';
import { colorOf } from '../tables/roulette';
import { COLORS, setupCanvas } from './stage/canvas';
import { h, setText } from './dom';
import { fmt } from './format';

/** A slim row of "label n" chips; zero counters are hidden so only rewards actually hit show up. */
function rewardStrip(items: [string, number][], empty: string): HTMLElement[] {
  const hit = items.filter(([, n]) => n > 0);
  if (hit.length === 0) return [h('span', { class: 'reward muted', text: empty })];
  return hit.map(([label, n]) => h('span', { class: 'reward' }, h('b', { text: fmt(n) }), ` ${label}`));
}

/** Slots-only: last spin up front, a stable per-symbol triples/pairs table, and a short ribbon of recent outcomes. */
export class SlotsCombosView {
  readonly root: HTMLElement;
  private strip: HTMLElement;
  private last: HTMLElement;
  private table: HTMLElement;
  private ribbon: HTMLElement;
  private key = '';

  constructor() {
    this.strip = h('div', { class: 'reward-strip' });
    this.last = h('div', { class: 'slots-last' });
    this.table = h('div', { class: 'slots-table' });
    this.ribbon = h('div', { class: 'slots-ribbon' });
    this.root = h(
      'div',
      { class: 'combo-view hidden' },
      this.strip,
      h('div', { class: 'slots-body' }, this.last, this.table),
      this.ribbon,
    );
  }

  update(stats: PlayStats, force = false): void {
    const s = stats.slots;
    const key = JSON.stringify([s.recent, s.tripleBy, s.pairBy, s.cascades, s.freeSpins, s.scatters]);
    if (!force && key === this.key) return;
    this.key = key;
    this.strip.replaceChildren(
      ...rewardStrip(
        [
          ['cascades', s.cascades],
          ['free spins', s.freeSpins],
          ['scatter 7s', s.scatters],
        ],
        'No bonus rewards hit yet',
      ),
    );
    const kindOf = (r: number[]) => (r[0] === r[1] && r[1] === r[2] ? 'triple' : r[0] === r[1] || r[1] === r[2] || r[0] === r[2] ? 'pair' : 'miss');
    const latest = s.recent[s.recent.length - 1];
    if (latest) {
      const kind = kindOf(latest);
      this.last.className = `slots-last ${kind}`;
      this.last.replaceChildren(
        h('small', { text: 'Last spin' }),
        h('div', { class: 'slots-last-reels', text: latest.map((r) => SYMBOLS[r]).join('') }),
        h('div', { class: 'slots-last-tag', text: kind === 'triple' ? 'Triple!' : kind === 'pair' ? 'Pair' : 'No match' }),
      );
    } else {
      this.last.className = 'slots-last';
      this.last.replaceChildren(h('small', { text: 'Last spin' }), h('div', { class: 'slots-last-tag', text: 'No spins yet' }));
    }
    // One row per symbol: how often it made a triple and a pair.
    const head = h('div', { class: 'slots-row head' }, h('span'), h('span', { text: 'Triple' }), h('span', { text: 'Pair' }));
    const rows = SYMBOLS.map((sym, i) =>
      h(
        'div',
        { class: `slots-row${s.tripleBy[i] > 0 ? ' hit' : ''}` },
        h('span', { class: 'slots-sym', text: sym }),
        h('span', { class: 'slots-n triple', text: fmt(s.tripleBy[i]) }),
        h('span', { class: 'slots-n pair', text: fmt(s.pairBy[i]) }),
      ),
    );
    this.table.replaceChildren(head, ...rows);
    // Ribbon: last 20 outcomes, oldest to newest (right), one colored block each.
    this.ribbon.replaceChildren(
      h('small', { text: 'Recent' }),
      ...s.recent.map((r) => h('span', { class: `blip ${kindOf(r)}`, title: r.map((x) => SYMBOLS[x]).join(' ') })),
    );
  }
}

const CARD_NAMES = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
const handText = (cards: number[]) => cards.map((c) => CARD_NAMES[c] ?? '?').join(' ');
const handTotal = (cards: number[]) => {
  let t = cards.reduce((a, c) => a + c, 0);
  if (cards.includes(1) && t + 10 <= 21) t += 10;
  return t;
};

/** Blackjack-only: reward counters plus the last few hands as compact chips, newest first. */
export class BlackjackHandsView {
  readonly root: HTMLElement;
  private strip: HTMLElement;
  private list: HTMLElement;
  private key = '';

  constructor() {
    this.strip = h('div', { class: 'reward-strip' });
    this.list = h('div', { class: 'combo-list bj-list' });
    this.root = h('div', { class: 'combo-view hidden' }, this.strip, this.list);
  }

  update(stats: PlayStats, force = false): void {
    const s = stats.blackjack;
    const key = JSON.stringify([s.recent, s.natural, s.doubled, s.split, s.surrendered, s.charlie, s.insured]);
    if (!force && key === this.key) return;
    this.key = key;
    this.strip.replaceChildren(
      ...rewardStrip(
        [
          ['naturals', s.natural],
          ['charlies', s.charlie],
          ['doubles', s.doubled],
          ['splits', s.split],
          ['surrenders', s.surrendered],
          ['insured', s.insured],
        ],
        'No rewards hit yet',
      ),
    );
    this.list.replaceChildren();
    if (s.recent.length === 0) {
      this.list.append(h('div', { class: 'history-info', text: 'No hands yet' }));
      return;
    }
    for (const hand of s.recent.slice().reverse()) {
      const total = (cards: number[]) => String(handTotal(cards));
      const player = hand.split ? `${total(hand.player)}|${total(hand.split)}` : total(hand.player);
      const badges = [hand.doubled ? '×2' : '', hand.split ? '⑂' : '', hand.surrendered ? '⚑' : ''].filter(Boolean).join('');
      const title = `${BJ_NAMES[hand.outcome]}: ${handText(hand.player)} vs ${handText(hand.dealer)}`;
      this.list.append(
        h(
          'div',
          { class: `combo bj-${hand.outcome}`, title },
          h('span', { class: 'bj-hand' }, h('b', { text: player }), h('span', { class: 'bj-vs', text: ' v ' }), h('span', { text: total(hand.dealer) })),
          h('span', { class: 'combo-tag', text: badges }),
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
    const key = `${JSON.stringify(stats[this.statsKey()])}|${this.canvas.clientWidth}x${this.canvas.clientHeight}`;
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
    return `Heads ${pct(c.heads, n)} · Tails ${pct(c.tails, n)}`;
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

const COIN_SPECIAL_LABELS = ['G', 'E', 'R'];

function drawCoin(ctx: Ctx, w: number, ht: number, c: CoinStats): void {
  ctx.clearRect(0, 0, w, ht);
  const n = c.heads + c.tails;
  const pad = 8;
  const barY = 6;
  const barH = 20;
  const bw = w - pad * 2;
  const headsW = n > 0 ? (c.heads / n) * bw : bw / 2;
  ctx.fillStyle = COLORS.gold;
  ctx.fillRect(pad, barY, headsW, barH);
  ctx.fillStyle = COLORS.pink;
  ctx.fillRect(pad + headsW, barY, bw - headsW, barH);
  ctx.strokeStyle = COLORS.fg;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w / 2, barY - 3);
  ctx.lineTo(w / 2, barY + barH + 3);
  ctx.stroke();
  ctx.fillStyle = COLORS.bg;
  ctx.font = '600 12px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(`H ${c.heads}`, pad + 6, barY + barH / 2);
  ctx.textAlign = 'right';
  ctx.fillText(`T ${c.tails}`, w - pad - 6, barY + barH / 2);
  ctx.textAlign = 'left';

  const top = barY + barH + 10;
  const availH = ht - top - 4;
  // Reward panel on the right: counts for each special payout plus the streaks.
  const panelW = Math.min(124, Math.max(96, w * 0.34));
  const panelX = w - pad - panelW;
  const rows: [string, string, number | string, string | null][] = [
    ['G', 'Gold coin', c.gold, COLORS.gold],
    ['E', 'Edge', c.edge, COLORS.cyan],
    ['R', 'Ridden', c.ride, COLORS.green],
  ];
  const lineH = Math.min(30, availH / 5);
  ctx.textBaseline = 'middle';
  rows.forEach(([letter, label, count, color], i) => {
    const cy = top + lineH * i + lineH / 2;
    ctx.beginPath();
    ctx.arc(panelX + 8, cy, 8, 0, Math.PI * 2);
    ctx.fillStyle = color ?? COLORS.muted;
    ctx.fill();
    ctx.fillStyle = COLORS.bg;
    ctx.font = '700 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(letter, panelX + 8, cy + 1);
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.muted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(label, panelX + 22, cy);
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.fg;
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText(fmt(Number(count)), panelX + panelW, cy);
    ctx.textAlign = 'left';
  });
  const run = c.streak === 0 ? '–' : `${Math.abs(c.streak)}× ${c.streak > 0 ? 'H' : 'T'}`;
  const sy = top + lineH * 3 + lineH / 2;
  ctx.fillStyle = COLORS.muted;
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('Streak', panelX, sy);
  ctx.fillText('Longest', panelX, sy + lineH);
  ctx.textAlign = 'right';
  ctx.fillStyle = COLORS.fg;
  ctx.font = '600 12px system-ui, sans-serif';
  ctx.fillText(run, panelX + panelW, sy);
  ctx.fillText(String(c.longest), panelX + panelW, sy + lineH);
  ctx.textAlign = 'left';

  // Bead plate: fill the area left of the panel, picking the row count that gives the biggest beads.
  const areaW = panelX - pad - 10;
  const total = Math.max(1, c.recent.length);
  let rowsN = 1;
  let cell = 0;
  for (let r = 1; r <= 8; r++) {
    const size = Math.min(availH / r, areaW / Math.ceil(Math.max(total, 60) / r), 36);
    if (size > cell) {
      cell = size;
      rowsN = r;
    }
  }
  const gridH = cell * rowsN;
  const gy = top + Math.max(0, (availH - gridH) / 2);
  c.recent.forEach((v, i) => {
    const col = Math.floor(i / rowsN);
    const row = i % rowsN;
    const cx = pad + col * cell + cell / 2;
    const cy = gy + row * cell + cell / 2;
    if (cx + cell / 2 > panelX - 6) return;
    ctx.beginPath();
    ctx.arc(cx, cy, cell / 2 - 1.5, 0, Math.PI * 2);
    ctx.fillStyle = v === 3 ? COLORS.cyan : v === 4 ? COLORS.green : v ? COLORS.gold : COLORS.pink;
    ctx.fill();
    if (v >= 2) {
      ctx.strokeStyle = COLORS.fg;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = COLORS.bg;
      ctx.font = `700 ${Math.max(8, cell * 0.5)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(COIN_SPECIAL_LABELS[v - 2], cx, cy + 1);
      ctx.textAlign = 'left';
    }
  });
  if (c.recent.length === 0) {
    ctx.fillStyle = COLORS.muted;
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText('Flip some coins to see the beads', pad, top + 14);
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
  const total = r.pockets.reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...r.pockets);
  const pad = 6;
  const n = r.pockets.length;
  const cw = (w - pad * 2) / n;
  const top = 16; // room for the caption and the hottest bar's count
  const labelH = 14; // pocket numbers under the bars
  const chipsH = 26;
  const chartH = Math.max(20, ht - top - labelH - chipsH);
  const base = top + chartH;
  const hot = total > 0 ? r.pockets.indexOf(max) : -1;

  ctx.font = '10px system-ui, sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.muted;
  ctx.fillText(total > 0 ? `Hits per number · ${fmt(total)} spins` : 'Hits per number', pad, 10);

  r.pockets.forEach((count, i) => {
    const x = pad + i * cw;
    ctx.fillStyle = POCKET_COLORS[colorOf(i)];
    ctx.globalAlpha = 0.18;
    ctx.fillRect(x + 0.5, top, cw - 1, chartH);
    ctx.globalAlpha = i === hot ? 1 : 0.8;
    const bh = (count / max) * chartH;
    ctx.fillRect(x + 0.5, base - bh, cw - 1, bh);
  });
  ctx.globalAlpha = 1;

  // Even share: where every bar would sit if the wheel were perfectly flat.
  if (total > 0) {
    const avgY = base - (total / n / max) * chartH;
    ctx.strokeStyle = COLORS.fg;
    ctx.globalAlpha = 0.7;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(pad, avgY);
    ctx.lineTo(w - pad, avgY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.muted;
    ctx.fillText('even share', w - pad, Math.max(avgY - 3, top + 9));
  }

  // Count on the hottest bar.
  if (hot >= 0) {
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.fg;
    ctx.font = '600 10px system-ui, sans-serif';
    const hx = Math.min(w - pad - 8, Math.max(pad + 8, pad + hot * cw + cw / 2));
    ctx.fillText(`${max}×`, hx, top - 3);
  }

  // Pocket numbers: all of them when they fit, otherwise every few.
  const step = cw >= 15 ? 1 : cw >= 9 ? 2 : 3;
  ctx.font = `${cw >= 15 ? 10 : 9}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  for (let i = 0; i < n; i++) {
    if (i % step !== 0 && i !== hot) continue;
    ctx.fillStyle = i === hot ? COLORS.fg : COLORS.muted;
    ctx.fillText(String(i), pad + i * cw + cw / 2, base + 11);
  }

  // Last pockets as chips along the bottom.
  const chip = Math.min(20, (w - pad * 2) / Math.max(1, r.recent.length));
  ctx.font = `${Math.max(8, chip * 0.55)}px system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  r.recent.forEach((p, i) => {
    const cx = pad + i * chip + chip / 2;
    ctx.fillStyle = POCKET_COLORS[colorOf(p)];
    ctx.beginPath();
    ctx.arc(cx, ht - 12, chip / 2 - 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.bg;
    ctx.fillText(String(p), cx, ht - 11);
  });
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
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
  const extras: [string, number][] = [
    ['Charlie', b.charlie],
    ['Double', b.doubled],
    ['Split', b.split],
    ['Surrender', b.surrendered],
    ['Insured', b.insured],
  ];
  let rx = pad;
  const ry = y + barH + 42;
  ctx.fillStyle = COLORS.fg;
  for (const [label, n] of extras) {
    if (n <= 0) continue;
    const text = `${label} ${fmt(n)}`;
    ctx.fillText(text, rx, ry);
    rx += ctx.measureText(text).width + 14;
    if (rx > w - pad) break;
  }
}
