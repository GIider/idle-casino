import type { History, TableId } from '../core/types';
import { BlackjackHandsView, GameHistoryView, SlotsCombosView, VIEW_LABELS } from './historyViews';
import { COLORS, setupCanvas } from './stage/canvas';
import { h, setText, toggleClass } from './dom';
import { fmt, fmtSigned } from './format';
import { RANGES, visiblePoints, type Range } from './chartRange';
import { perfBegin, perfEnd } from './perf';

type Mode = 'game' | 'combos';

/**
 * Two cards shown together: net income (currency/sec) from the sampled `History.rate` series, and the
 * game's unique outcomes (coin beads, slot combos, wheel hits, blackjack hands/deals).
 */
export class HistoryChart {
  readonly root: HTMLElement;
  private canvas: HTMLCanvasElement;
  private info: HTMLElement;
  private range: Range = 'm10';
  private hover: number | null = null;
  private key = '';
  private data: [number, number][] = [];
  private marks: number[] = [];
  private btns: Record<Range, HTMLButtonElement>;
  private gameView: GameHistoryView;
  private combosView: SlotsCombosView | BlackjackHandsView | null;
  private tabs: Partial<Record<Mode, HTMLButtonElement>>;
  private mode: Mode;
  private history: History | null = null;

  constructor(id: TableId) {
    this.gameView = new GameHistoryView(id);
    this.combosView = id === 'slots' ? new SlotsCombosView() : id === 'blackjack' ? new BlackjackHandsView() : null;
    // Slots and blackjack each have one combined view; coin and roulette use the canvas game view.
    this.mode = this.combosView ? 'combos' : 'game';
    this.tabs = {};
    if (!this.combosView) this.tabs.game = h('button', { class: 'btn small', text: VIEW_LABELS[id], onclick: () => this.setMode('game') });
    this.canvas = h('canvas', { class: 'history-canvas' });
    this.info = h('div', { class: 'history-info', text: ' ' });
    this.btns = {} as Record<Range, HTMLButtonElement>;
    for (const r of RANGES) {
      this.btns[r.id] = h('button', { class: 'btn small', text: r.label, onclick: () => this.setRange(r.id) });
    }
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', 'Income per second history');
    const move = (e: PointerEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      this.hover = rect.width > 0 ? (e.clientX - rect.left) / rect.width : null;
      this.key = '';
      this.draw();
    };
    this.canvas.addEventListener('pointermove', move);
    this.canvas.addEventListener('pointerdown', move);
    this.canvas.addEventListener('pointerleave', () => {
      this.hover = null;
      this.key = '';
      this.draw();
    });
    const tabButtons = Object.values(this.tabs) as HTMLElement[];
    const uniqueTitle = id === 'slots' ? 'Combos' : id === 'blackjack' ? 'Hands' : VIEW_LABELS[id];
    const income = h(
      'div',
      { class: 'card history history-income' },
      h(
        'div',
        { class: 'history-head' },
        h('h3', { text: 'Income' }),
        h('div', { class: 'history-range' }, ...RANGES.map((r) => this.btns[r.id])),
      ),
      h('div', { class: 'history-profit' }, this.canvas, this.info),
    );
    const unique = h(
      'div',
      { class: 'card history history-unique' },
      h(
        'div',
        { class: 'history-head' },
        h('h3', { text: uniqueTitle }),
        tabButtons.length > 1 ? h('div', { class: 'history-range' }, ...tabButtons) : h('span'),
      ),
      this.gameView.root,
      ...(this.combosView ? [this.combosView.root] : []),
    );
    this.root = h('div', { class: 'history-pair activity' }, income, unique);
    this.setMode(this.mode);
  }

  private setMode(mode: Mode): void {
    this.mode = mode;
    toggleClass(this.gameView.root, 'hidden', mode !== 'game');
    if (this.combosView) toggleClass(this.combosView.root, 'hidden', mode !== 'combos');
    this.syncButtons();
    if (!this.history) return;
    if (mode === 'combos') this.combosView?.update(this.history.stats, true);
    else this.gameView.update(this.history.stats, true);
  }

  private setRange(r: Range): void {
    this.range = r;
    this.key = '';
    this.syncButtons();
    this.draw();
  }

  private syncButtons(): void {
    for (const r of RANGES) toggleClass(this.btns[r.id], 'active', this.range === r.id);
    for (const m of ['game', 'combos'] as const) {
      const t = this.tabs[m];
      if (t) toggleClass(t, 'active', this.mode === m);
    }
  }

  private viewKey = '';
  private lastRefresh = 0;
  /** Income and outcome cards repaint at most this often (ms); plays arrive far faster at high speed. */
  private static readonly REFRESH_MS = 250;

  update(history: History, plays: number): void {
    this.history = history;
    const now = performance.now();
    if (this.key !== '' && now - this.lastRefresh < HistoryChart.REFRESH_MS) return;
    this.lastRefresh = now;
    const t0 = perfBegin();
    this.refresh(history, plays);
    perfEnd('history', t0);
  }

  private refresh(history: History, plays: number): void {
    // Stats only change when a round is played, so skip the (stringify-keyed) view diff otherwise.
    const viewKey = `${plays}|${this.mode}|${this.canvas.clientWidth}x${this.canvas.clientHeight}`;
    if (viewKey !== this.viewKey) {
      this.viewKey = viewKey;
      if (this.mode === 'combos') this.combosView?.update(history.stats);
      else this.gameView.update(history.stats);
    }
    const series = history.rate.points;
    const last = series[series.length - 1];
    const key = `${last?.[0]}|${last?.[1]}|${series.length}|${plays}|${this.range}|${this.canvas.clientWidth}x${this.canvas.clientHeight}`;
    if (key === this.key) return;
    this.key = key;
    this.data = series.slice();
    this.marks = history.marks;
    this.draw();
  }

  private visible(): [number, number][] {
    return visiblePoints(this.data, this.range);
  }

  private draw(): void {
    const s = setupCanvas(this.canvas);
    const pts = this.visible();
    if (pts.length === 0) return;
    const first = pts[0];
    const end = pts[pts.length - 1];
    const net = end[1];
    setText(this.info, this.hoverText(pts) ?? `${fmt(end[0])} plays · ${fmtSigned(net)}/sec`);
    if (!s) return;
    const { ctx, w, h: ht } = s;
    ctx.clearRect(0, 0, w, ht);

    const padX = 8;
    const padY = 14;
    let lo = 0;
    let hi = 0;
    for (const p of pts) {
      if (p[1] < lo) lo = p[1];
      if (p[1] > hi) hi = p[1];
    }
    if (hi === lo) hi = lo + 1;
    const span = hi - lo;
    lo -= span * 0.05;
    hi += span * 0.05;
    const x0 = first[0];
    const xs = Math.max(1, end[0] - x0);
    const X = (p: number) => padX + ((p - x0) / xs) * (w - padX * 2);
    const Y = (v: number) => padY + (1 - (v - lo) / (hi - lo)) * (ht - padY * 2);
    const zero = Y(0);

    // Zero line.
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, zero);
    ctx.lineTo(w, zero);
    ctx.stroke();

    // Prestige marks.
    ctx.strokeStyle = COLORS.gold;
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
    const area = (color: string, clipTop: number, clipH: number) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, clipTop, w, clipH);
      ctx.clip();
      path();
      ctx.lineTo(X(end[0]), zero);
      ctx.lineTo(X(first[0]), zero);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();
    };
    area('rgba(61,255,143,0.25)', 0, zero);
    area('rgba(255,77,109,0.25)', zero, ht - zero);

    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = net >= 0 ? COLORS.green : COLORS.red;
    path();
    ctx.stroke();

    if (this.hover !== null) {
      const hx = padX + Math.max(0, Math.min(1, (this.hover * w - padX) / (w - padX * 2))) * (w - padX * 2);
      ctx.strokeStyle = COLORS.cyan;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hx, 0);
      ctx.lineTo(hx, ht);
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
    return `play ${fmt(best[0])} · ${fmtSigned(best[1])}/sec`;
  }
}
