import type { TableId } from '../../core/types';
import type { LastPlay } from '../../core/game';
import { COLORS, prefersReducedMotion, roundRect, setupCanvas } from './canvas';
import { Fx } from './fx';
import { createScene, type Scene } from './scenes';

const MAX_SEATS = 16;

/** Canvas presentation of a table. Never mutates game state. */
export class Stage {
  readonly canvas: HTMLCanvasElement;
  private scene: Scene | null = null;
  private startedAt = 0;
  private fx = new Fx();
  private raf = 0;
  private last = 0;
  private seats = 0;
  private pulses: number[] = [];
  private observer: ResizeObserver | null = null;
  private idleIcon: string;
  private seenSeq = -1;
  private dirty = true;

  constructor(icon: string, id: TableId) {
    this.idleIcon = icon;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'stage-canvas';
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', `${id} table`);
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(() => this.request());
      this.observer.observe(this.canvas);
    }
  }

  setPlayers(n: number): void {
    const seats = Math.min(MAX_SEATS, n);
    if (seats !== this.seats) {
      this.seats = seats;
      this.pulses.length = seats;
      for (let i = 0; i < seats; i++) this.pulses[i] ??= 0;
      this.request();
    }
  }

  /** Called when the panel becomes visible, or on any update; cheap if nothing changed. */
  resume(): void {
    if (this.dirty && this.raf === 0) this.request();
  }

  show(play: LastPlay, levels: Record<string, number>): void {
    if (play.seq === this.seenSeq) return;
    this.seenSeq = play.seq;
    const o = play.outcome;
    this.canvas.setAttribute('aria-label', o.detail);
    const now = performance.now();
    const running = this.scene !== null && (now - this.startedAt) / 1000 < this.scene.duration;

    if (play.auto) {
      const seat = Math.floor(Math.random() * Math.max(1, this.seats));
      if (this.seats > 0) this.pulses[seat] = 1;
      if (running) {
        // Don't restart the scene for every auto-play; toss a chip instead.
        const w = this.canvas.clientWidth || 300;
        const h = this.canvas.clientHeight || 160;
        const sx = this.seats > 0 ? w * (0.1 + (0.8 * (seat + 0.5)) / this.seats) : w / 2;
        this.fx.chip(sx, h * 0.92, o.net > 0 ? COLORS.gold : o.net < 0 ? COLORS.red : COLORS.muted);
        this.request();
        return;
      }
    }

    if (o.view) {
      this.scene = createScene(o.view, { levels, net: o.net, seed: play.seq, speed: play.auto ? 0.6 : 1 });
      this.startedAt = now;
      if (prefersReducedMotion()) this.startedAt = now - this.scene.duration * 1000;
    }
    const w = this.canvas.clientWidth || 300;
    const h = this.canvas.clientHeight || 160;
    const delay = this.scene ? this.scene.duration : 0;
    // Effects fire when the round settles; schedule them via a pending flag.
    this.pending = { at: this.startedAt + delay * 1000, w, h, o };
    this.request();
  }

  private pending: { at: number; w: number; h: number; o: LastPlay['outcome'] } | null = null;

  private request(): void {
    if (this.raf !== 0) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private busy(now: number): boolean {
    if (this.pending || this.fx.alive || this.pulses.some((p) => p > 0)) return true;
    return this.scene !== null && (now - this.startedAt) / 1000 < this.scene.duration;
  }

  private frame = (now: number): void => {
    this.raf = 0;
    if (!this.canvas.isConnected) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.render(performance.now(), dt)) {
      // Hidden or no 2D context: skip effects and wait for resume()/resize.
      this.pending = null;
      this.dirty = true;
      return;
    }
    this.dirty = false;
    if (this.busy(performance.now())) this.raf = requestAnimationFrame(this.frame);
  };

  private render(now: number, dt: number): boolean {
    const s = setupCanvas(this.canvas);
    if (!s) return false;
    const { ctx, w, h } = s;

    const g = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, Math.max(w, h) * 0.7);
    g.addColorStop(0, COLORS.feltLight);
    g.addColorStop(1, COLORS.bg);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    if (this.scene) {
      const t = Math.min((now - this.startedAt) / 1000, this.scene.duration);
      this.scene.draw(ctx, t, w, h);
    } else {
      ctx.font = `${Math.min(h * 0.4, 72)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = 0.5;
      ctx.fillText(this.idleIcon, w / 2, h / 2);
      ctx.globalAlpha = 1;
    }

    if (this.pending && now >= this.pending.at) {
      const { o } = this.pending;
      this.pending = null;
      if (o.net > 0) {
        const ratio = o.net / Math.max(1, o.bet);
        this.fx.burst(w / 2, h / 2, Math.min(60, Math.round(10 + ratio * 6)));
        this.fx.float(w / 2, h * 0.3, o.capped ? 'MAX PAYOUT!' : 'WIN', COLORS.gold);
      } else if (o.net < 0) {
        this.fx.float(w / 2, h * 0.3, 'LOSS', COLORS.red);
      }
      if (o.rerolled) this.fx.float(w / 2, h * 0.88, '↻ re-rolled', COLORS.cyan);
    }

    this.drawSeats(ctx, w, h, dt);
    this.fx.step(dt);
    this.fx.draw(ctx);
    return true;
  }

  private drawSeats(ctx: CanvasRenderingContext2D, w: number, h: number, dt: number): void {
    const n = this.seats;
    if (n === 0) return;
    const r = 5;
    for (let i = 0; i < n; i++) {
      const x = w * (0.1 + (0.8 * (i + 0.5)) / n);
      const y = h - 12;
      const p = this.pulses[i] ?? 0;
      roundRect(ctx, x - r, y - r, r * 2, r * 2, r);
      ctx.fillStyle = p > 0 ? COLORS.cyan : COLORS.line;
      ctx.globalAlpha = 0.5 + 0.5 * p;
      ctx.fill();
      ctx.globalAlpha = 1;
      this.pulses[i] = Math.max(0, p - dt * 3);
    }
  }

  destroy(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.observer?.disconnect();
  }
}
