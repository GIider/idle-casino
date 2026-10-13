import type { BankrollHistory, TableId } from '../core/types';
import { TABLES, TABLE_IDS } from '../tables';
import { COLORS, setupCanvas } from './stage/canvas';
import { h, setText, toggleClass } from './dom';
import { fmt } from './format';

type Range = 'recent' | 'all';
const RECENT_ROUNDS = 200;

type View = 'bankroll' | 'games';
const GAME_COLORS: Record<TableId, string> = {
  coinflip: COLORS.gold,
  slots: COLORS.pink,
  roulette: COLORS.green,
  blackjack: COLORS.cyan,
};
const signed = (n: number) => `${n < 0 ? '−' : '+'}${fmt(Math.abs(n))}`;

/** Casino value (every wallet in min-bet units) over time, with a gold line at each ascension. */
export class BankrollChart {
  readonly root: HTMLElement;
  private canvas: HTMLCanvasElement;
  private info: HTMLElement;
  private range: Range = 'all';
  private log = true;
  private hover: number | null = null;
  private key = '';
  private data: [number, number][] = [];
  private marks: number[] = [];
  private view: View = 'bankroll';
  private contrib: Record<TableId, [number, number][]> | null = null;
  private viewBtns: Record<View, HTMLButtonElement>;
  private legend: HTMLElement;
  private btns: Record<Range | 'scale', HTMLButtonElement>;

  constructor() {
    this.canvas = h('canvas', { class: 'history-canvas' });
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', 'Bankroll history');
    this.info = h('div', { class: 'history-info', text: ' ' });
    this.viewBtns = {
      bankroll: h('button', { class: 'btn small', text: 'Casino value', onclick: () => this.setView('bankroll') }),
      games: h('button', { class: 'btn small', text: 'By game', onclick: () => this.setView('games') }),
    };
    this.legend = h(
      'div',
      { class: 'history-legend' },
      ...TABLE_IDS.map((id) => {
        const dot = h('span', { class: 'legend-dot', text: '●' });
        dot.style.color = GAME_COLORS[id];
        return h('span', { class: 'legend-item' }, dot, ` ${TABLES[id].icon} ${TABLES[id].name}`);
      }),
    );
    this.btns = {
      recent: h('button', { class: 'btn small', text: `Last ${RECENT_ROUNDS}`, onclick: () => this.setRange('recent') }),
      all: h('button', { class: 'btn small', text: 'All', onclick: () => this.setRange('all') }),
      scale: h('button', { class: 'btn small', onclick: () => this.toggleScale() }),
    };
    const move = (e: PointerEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      this.hover = rect.width > 0 ? (e.clientX - rect.left) / rect.width : null;
      this.redraw();
    };
    this.canvas.addEventListener('pointermove', move);
    this.canvas.addEventListener('pointerdown', move);
    this.canvas.addEventListener('pointerleave', () => {
      this.hover = null;
      this.redraw();
    });
    this.root = h(
      'div',
      { class: 'card history' },
      h(
        'div',
        { class: 'history-head' },
        h('h3', { text: 'Bankroll history' }),
        h('div', { class: 'history-range' }, this.viewBtns.bankroll, this.viewBtns.games),
      ),
      h('div', { class: 'history-sub' }, h('div', { class: 'history-range' }, this.btns.scale, this.btns.recent, this.btns.all)),
      this.canvas,
      this.legend,
      this.info,
    );
    this.syncButtons();
  }

  private setView(v: View): void {
    this.view = v;
    this.redraw();
  }

  private setRange(r: Range): void {
    this.range = r;
    this.redraw();
  }

  private toggleScale(): void {
    this.log = !this.log;
    this.redraw();
  }

  private redraw(): void {
    this.key = '';
    this.syncButtons();
    this.draw();
  }

  private syncButtons(): void {
    for (const r of ['recent', 'all'] as const) toggleClass(this.btns[r], 'active', this.range === r);
    setText(this.btns.scale, this.log ? 'Log' : 'Linear');
    for (const v of ['bankroll', 'games'] as const) toggleClass(this.viewBtns[v], 'active', this.view === v);
    // Contributions can be negative, so that view is always linear.
    toggleClass(this.btns.scale, 'hidden', this.view === 'games');
    toggleClass(this.legend, 'hidden', this.view !== 'games');
  }

  update(bankroll: BankrollHistory, money: number): void {
    const key = `${bankroll.rounds}|${money}|${bankroll.points.length}|${bankroll.marks.length}|${this.canvas.clientWidth}|${TABLE_IDS.map((id) => bankroll.net[id]).join(',')}`;
    if (key === this.key) return;
    this.key = key;
    const pts = bankroll.points.slice();
    const last = pts[pts.length - 1];
    if (!last || last[0] < bankroll.rounds) pts.push([bankroll.rounds, money]);
    else pts[pts.length - 1] = [last[0], money];
    this.data = pts;
    this.marks = bankroll.marks;
    const contrib = {} as Record<TableId, [number, number][]>;
    for (const id of TABLE_IDS) {
      // Each table pays in its own currency, so compare them in that table's minimum bets.
      const unit = TABLES[id].baseMinBet;
      const series = bankroll.contrib[id].points.map((p): [number, number] => [p[0], p[1] / unit]);
      const tail = series[series.length - 1];
      const net = bankroll.net[id] / unit;
      if (!tail || tail[0] < bankroll.rounds) series.push([bankroll.rounds, net]);
      else series[series.length - 1] = [tail[0], net];
      contrib[id] = series;
    }
    this.contrib = contrib;
    this.draw();
  }

  private visible(): [number, number][] {
    if (this.range === 'all' || this.data.length === 0) return this.data;
    const end = this.data[this.data.length - 1][0];
    const out = this.data.filter((p) => p[0] >= end - RECENT_ROUNDS);
    const idx = this.data.length - out.length - 1;
    if (idx >= 0) out.unshift(this.data[idx]);
    return out.length >= 2 ? out : this.data.slice(-2);
  }

  private draw(): void {
    if (this.view === 'games') {
      this.drawGames();
      return;
    }
    const pts = this.visible();
    if (pts.length === 0) return;
    const end = pts[pts.length - 1];
    setText(this.info, this.hoverText(pts) ?? `round ${fmt(end[0])} · casino value ${fmt(end[1])} min bets`);
    const s = setupCanvas(this.canvas);
    if (!s) return;
    const { ctx, w, h: ht } = s;
    ctx.clearRect(0, 0, w, ht);

    const padX = 8;
    const padY = 14;
    const tf = (v: number) => (this.log ? Math.log10(Math.max(1, v) + 1) : v);
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of pts) {
      lo = Math.min(lo, tf(p[1]));
      hi = Math.max(hi, tf(p[1]));
    }
    if (!this.log) lo = Math.min(lo, 0);
    if (hi <= lo) hi = lo + 1;
    const x0 = pts[0][0];
    const xs = Math.max(1, end[0] - x0);
    const X = (p: number) => padX + ((p - x0) / xs) * (w - padX * 2);
    const Y = (v: number) => padY + (1 - (tf(v) - lo) / (hi - lo)) * (ht - padY * 2);

    ctx.strokeStyle = COLORS.gold;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    for (const m of this.marks) {
      if (m < x0 || m > end[0]) continue;
      ctx.beginPath();
      ctx.moveTo(X(m), 0);
      ctx.lineTo(X(m), ht);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    const path = () => {
      ctx.beginPath();
      pts.forEach((p, i) => (i === 0 ? ctx.moveTo(X(p[0]), Y(p[1])) : ctx.lineTo(X(p[0]), Y(p[1]))));
    };
    path();
    ctx.lineTo(X(end[0]), ht);
    ctx.lineTo(X(x0), ht);
    ctx.closePath();
    ctx.fillStyle = 'rgba(39,232,255,0.18)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = COLORS.cyan;
    path();
    ctx.stroke();

    if (this.hover !== null) {
      const f = Math.max(0, Math.min(1, this.hover));
      ctx.strokeStyle = COLORS.fg;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padX + f * (w - padX * 2), 0);
      ctx.lineTo(padX + f * (w - padX * 2), ht);
      ctx.stroke();
    }
  }

  /** x range shared by every table's series, windowed by the "last N rounds" button. */
  private gameWindow(): [number, number] {
    const all = TABLE_IDS.flatMap((id) => this.contrib?.[id] ?? []);
    if (all.length === 0) return [0, 1];
    const end = Math.max(...all.map((p) => p[0]));
    const start = this.range === 'recent' ? Math.max(0, end - RECENT_ROUNDS) : Math.min(...all.map((p) => p[0]));
    return [start, Math.max(start + 1, end)];
  }

  /** Value of a table's series at round `x`, interpolated between its samples. */
  private valueAt(id: TableId, x: number): number {
    const pts = this.contrib?.[id] ?? [];
    if (pts.length === 0) return 0;
    if (x <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      if (x <= pts[i][0]) {
        const [x0, y0] = pts[i - 1];
        const [x1, y1] = pts[i];
        return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
      }
    }
    return pts[pts.length - 1][1];
  }

  private gameInfo(x: number | null): string {
    const [, end] = this.gameWindow();
    const at = x ?? end;
    const vals = TABLE_IDS.map((id) => ({ id, v: this.valueAt(id, at) }));
    const gain = vals.reduce((a, b) => a + Math.max(0, b.v), 0);
    const parts = vals.map(({ id, v }) => {
      const share = v > 0 && gain > 0 ? ` (${Math.round((v / gain) * 100)}%)` : '';
      return `${TABLES[id].icon} ${signed(v)}${share}`;
    });
    return `${x === null ? 'now' : `round ${fmt(Math.round(at))}`} · ${parts.join(' · ')}`;
  }

  /** One line per table: cumulative net winnings from plays, plus a bar of each table's share of the profit. */
  private drawGames(): void {
    const [x0, x1] = this.gameWindow();
    const hoverX = this.hover === null ? null : x0 + Math.max(0, Math.min(1, this.hover)) * (x1 - x0);
    setText(this.info, this.gameInfo(hoverX));
    const s = setupCanvas(this.canvas);
    if (!s || !this.contrib) return;
    const { ctx, w, h: ht } = s;
    ctx.clearRect(0, 0, w, ht);

    const padX = 8;
    const barH = 10;
    const top = barH + 14;
    const bottom = 10;
    let lo = 0;
    let hi = 0;
    for (const id of TABLE_IDS) {
      for (const p of this.contrib[id]) {
        if (p[0] < x0 || p[0] > x1) continue;
        lo = Math.min(lo, p[1]);
        hi = Math.max(hi, p[1]);
      }
      lo = Math.min(lo, this.valueAt(id, x0));
      hi = Math.max(hi, this.valueAt(id, x0));
    }
    if (hi <= lo) hi = lo + 1;
    const X = (p: number) => padX + ((p - x0) / (x1 - x0)) * (w - padX * 2);
    const Y = (v: number) => top + (1 - (v - lo) / (hi - lo)) * (ht - top - bottom);

    // Share bar: each table's slice of the casino's profitable tables.
    const ends = TABLE_IDS.map((id) => ({ id, v: Math.max(0, this.valueAt(id, hoverX ?? x1)) }));
    const gain = ends.reduce((a, b) => a + b.v, 0);
    ctx.fillStyle = COLORS.line;
    ctx.fillRect(padX, 4, w - padX * 2, barH);
    if (gain > 0) {
      let bx = padX;
      for (const { id, v } of ends) {
        const bw = (v / gain) * (w - padX * 2);
        ctx.fillStyle = GAME_COLORS[id];
        ctx.fillRect(bx, 4, bw, barH);
        bx += bw;
      }
    }

    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, Y(0));
    ctx.lineTo(w, Y(0));
    ctx.stroke();
    ctx.strokeStyle = COLORS.gold;
    for (const m of this.marks) {
      if (m < x0 || m > x1) continue;
      ctx.beginPath();
      ctx.moveTo(X(m), top - 4);
      ctx.lineTo(X(m), ht);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    for (const id of TABLE_IDS) {
      const pts = this.contrib[id].filter((p) => p[0] >= x0 && p[0] <= x1);
      ctx.strokeStyle = GAME_COLORS[id];
      ctx.beginPath();
      ctx.moveTo(X(x0), Y(this.valueAt(id, x0)));
      for (const p of pts) ctx.lineTo(X(p[0]), Y(p[1]));
      ctx.lineTo(X(x1), Y(this.valueAt(id, x1)));
      ctx.stroke();
    }

    if (hoverX !== null) {
      ctx.strokeStyle = COLORS.fg;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(X(hoverX), top - 4);
      ctx.lineTo(X(hoverX), ht);
      ctx.stroke();
    }
  }

  private hoverText(pts: [number, number][]): string | null {
    if (this.hover === null || pts.length === 0) return null;
    const x0 = pts[0][0];
    const xs = Math.max(1, pts[pts.length - 1][0] - x0);
    const target = x0 + Math.max(0, Math.min(1, this.hover)) * xs;
    let best = pts[0];
    for (const p of pts) if (Math.abs(p[0] - target) < Math.abs(best[0] - target)) best = p;
    return `round ${fmt(best[0])} · casino value ${fmt(best[1])} min bets`;
  }
}
