import type { History, TableId } from '../core/types';
import { GameHistoryView, SlotsCombosView, VIEW_LABELS } from './historyViews';
import { COLORS, setupCanvas } from './stage/canvas';
import { h, setText, toggleClass } from './dom';
import { fmt, fmtSigned } from './format';
import { RANGES, visiblePoints, type Range } from './chartRange';

type Mode = 'profit' | 'game' | 'combos';

/** Net income (currency/sec) over a table's plays, from the sampled `History.rate` series. */
export class HistoryChart {
  readonly root: HTMLElement;
  private canvas: HTMLCanvasElement;
  private info: HTMLElement;
  private range: Range = 'all';
  private hover: number | null = null;
  private key = '';
  private data: [number, number][] = [];
  private marks: number[] = [];
  private btns: Record<Range, HTMLButtonElement>;
  private step = 1;
  private gameView: GameHistoryView;
  private combosView: SlotsCombosView | null;
  private tabs: Record<Mode, HTMLButtonElement | undefined>;
  private rangeBox: HTMLElement;
  private mode: Mode = 'profit';
  private history: History | null = null;

  constructor(id: TableId) {
    this.gameView = new GameHistoryView(id);
    this.tabs = {
      profit: h('button', { class: 'btn small', text: 'Income', onclick: () => this.setMode('profit') }),
      game: h('button', { class: 'btn small', text: VIEW_LABELS[id], onclick: () => this.setMode('game') }),
      combos:
        id === 'slots'
          ? h('button', { class: 'btn small', text: 'Combos', onclick: () => this.setMode('combos') })
          : undefined,
    };
    this.combosView = id === 'slots' ? new SlotsCombosView() : null;
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
    this.rangeBox = h('div', { class: 'history-range' }, ...RANGES.map((r) => this.btns[r.id]));
    this.root = h(
      'div',
      { class: 'card history' },
      h(
        'div',
        { class: 'history-head' },
        h('h3', { text: 'History' }),
        h('div', { class: 'history-range' }, ...([this.tabs.profit, this.tabs.game, this.tabs.combos].filter(Boolean) as HTMLElement[])),
      ),
      h('div', { class: 'history-profit' }, h('div', { class: 'history-sub' }, this.rangeBox), this.canvas, this.info),
      this.gameView.root,
      ...(this.combosView ? [this.combosView.root] : []),
    );
    this.syncButtons();
  }

  private setMode(mode: Mode): void {
    this.mode = mode;
    this.key = '';
    toggleClass(this.root.querySelector('.history-profit') as HTMLElement, 'hidden', mode !== 'profit');
    toggleClass(this.gameView.root, 'hidden', mode !== 'game');
    this.syncButtons();
    if (this.combosView) toggleClass(this.combosView.root, 'hidden', mode !== 'combos');
    if (mode === 'combos' && this.history && this.combosView) this.combosView.update(this.history.stats.slots, true);
    else if (mode === 'game' && this.history) this.gameView.update(this.history.stats, true);
    else this.draw();
  }

  private setRange(r: Range): void {
    this.range = r;
    this.key = '';
    this.syncButtons();
    this.draw();
  }

  private syncButtons(): void {
    for (const r of RANGES) toggleClass(this.btns[r.id], 'active', this.range === r.id);
    for (const m of ['profit', 'game', 'combos'] as const) {
      const t = this.tabs[m];
      if (t) toggleClass(t, 'active', this.mode === m);
    }
  }

  update(history: History, plays: number): void {
    this.history = history;
    if (this.mode === 'game') {
      this.gameView.update(history.stats);
      return;
    }
    if (this.mode === 'combos') {
      this.combosView?.update(history.stats.slots);
      return;
    }
    const series = history.rate.points;
    const last = series[series.length - 1];
    const key = `${last?.[0]}|${last?.[1]}|${series.length}|${plays}|${this.range}|${this.canvas.clientWidth}`;
    if (key === this.key) return;
    this.key = key;
    this.data = series.slice();
    this.marks = history.marks;
    this.step = history.rate.step;
    this.draw();
  }

  private visible(): [number, number][] {
    return visiblePoints(this.data, this.range, this.step);
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
    let lo = Math.min(0, ...pts.map((p) => p[1]));
    let hi = Math.max(0, ...pts.map((p) => p[1]));
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
