import type { CoinStats, PlayStats, RouletteStats, SlotsStats, TableId } from '../core/types';
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
    const key = JSON.stringify([s.recent, s.symbols, s.tripleBy, s.pairBy, s.cascades, s.freeSpins, s.scatters]);
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
    // One row per symbol: share of all reel stops, plus how often it made a triple and a pair.
    const seenTotal = s.symbols.reduce((a, b) => a + b, 0);
    const head = h('div', { class: 'slots-row head' }, h('span'), h('span', { text: 'Seen' }), h('span', { text: 'Triple' }), h('span', { text: 'Pair' }));
    const rows = SYMBOLS.map((sym, i) =>
      h(
        'div',
        { class: `slots-row${s.tripleBy[i] > 0 ? ' hit' : ''}` },
        h('span', { class: 'slots-sym', text: sym }),
        h('span', { class: 'slots-n seen', text: pct(s.symbols[i], seenTotal) }),
        h('span', { class: 'slots-n triple', text: fmt(s.tripleBy[i]) }),
        h('span', { class: 'slots-n pair', text: fmt(s.pairBy[i]) }),
      ),
    );
    this.table.replaceChildren(head, ...rows);
    // Ribbon: last 20 outcomes, oldest to newest (right), one colored block each.
    this.ribbon.replaceChildren(
      h('small', { text: 'Recent' }),
      ...s.recent.map((r) => h('span', { class: `blip ${kindOf(r)}`, title: r.map((x) => SYMBOLS[x]).join(' ') })),
      h(
        'span',
        { class: 'blip-legend' },
        h('span', { class: 'legend-item' }, h('i', { class: 'blip triple' }), 'Triple'),
        h('span', { class: 'legend-item' }, h('i', { class: 'blip pair' }), 'Pair'),
        h('span', { class: 'legend-item' }, h('i', { class: 'blip' }), 'None'),
      ),
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

/** Blackjack-only, replacing the old Hands/Deals pair: last hand, outcome table, reward counters, recent-hand ribbon. */
export class BlackjackHandsView {
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
    this.root = h('div', { class: 'combo-view hidden' }, this.strip, h('div', { class: 'slots-body' }, this.last, this.table), this.ribbon);
  }

  update(stats: PlayStats, force = false): void {
    const s = stats.blackjack;
    const key = JSON.stringify(s);
    if (!force && key === this.key) return;
    this.key = key;
    this.strip.replaceChildren(
      ...rewardStrip(
        [
          ['charlies', s.charlie],
          ['doubles', s.doubled],
          ['splits', s.split],
          ['surrenders', s.surrendered],
          ['insured', s.insured],
        ],
        'No bonus rewards hit yet',
      ),
    );
    const total = BJ_KEYS.reduce((a, k) => a + s[k], 0);
    const hand = s.recent[s.recent.length - 1];
    if (hand) {
      const tot = (cards: number[]) => String(handTotal(cards));
      const badges = [hand.doubled ? 'Double' : '', hand.split ? 'Split' : '', hand.surrendered ? 'Surrender' : ''].filter(Boolean).join(' · ');
      this.last.className = `slots-last bj-${hand.outcome}`;
      this.last.replaceChildren(
        h('small', { text: 'Last hand' }),
        h('div', { class: 'bj-last-line' }, h('b', { text: hand.split ? `${tot(hand.player)} | ${tot(hand.split)}` : tot(hand.player) }), h('span', { class: 'bj-vs', text: ' vs ' }), h('span', { text: tot(hand.dealer) })),
        h('div', { class: 'bj-last-cards', text: `${handText(hand.player)}${hand.split ? ` | ${handText(hand.split)}` : ''}  ·  ${handText(hand.dealer)}` }),
        h('div', { class: 'slots-last-tag', text: BJ_NAMES[hand.outcome] + (badges ? ` · ${badges}` : '') }),
      );
    } else {
      this.last.className = 'slots-last';
      this.last.replaceChildren(h('small', { text: 'Last hand' }), h('div', { class: 'slots-last-tag', text: 'No hands yet' }));
    }
    // One row per outcome: count and share of all hands, with a bar behind it.
    const rows = BJ_KEYS.map((k) => {
      const share = total > 0 ? s[k] / total : 0;
      const row = h(
        'div',
        { class: `slots-row bj-row bj-${k}` },
        h('span', { class: 'bj-row-name', text: BJ_NAMES[k] }),
        h('span', { class: 'slots-n', text: fmt(s[k]) }),
        h('span', { class: 'slots-n seen', text: pct(s[k], total) }),
      );
      row.style.setProperty('--share', `${(share * 100).toFixed(1)}%`);
      return row;
    });
    this.table.replaceChildren(...rows);
    this.ribbon.replaceChildren(
      h('small', { text: 'Recent' }),
      ...s.recent.map((r) => h('span', { class: `blip bj-${r.outcome}`, title: `${BJ_NAMES[r.outcome]}: ${handText(r.player)} vs ${handText(r.dealer)}` })),
    );
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
  let rowsN = 1;
  let cell = 0;
  for (let r = 1; r <= 8; r++) {
    const size = Math.min(availH / r, areaW / Math.ceil(60 / r), 36);
    if (size > cell) {
      cell = size;
      rowsN = r;
    }
  }
  const gridH = cell * rowsN;
  const gy = top + Math.max(0, (availH - gridH) / 2);
  // Use every column that fits: show the newest beads that fill the whole area.
  const cols = Math.max(1, Math.floor(areaW / cell));
  const shown = c.recent.slice(-cols * rowsN);
  shown.forEach((v, i) => {
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
