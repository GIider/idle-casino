import type { TableId } from '../../core/types';
import type { LastPlay } from '../../core/game';
import { COLORS, prefersReducedMotion, roundRect, setupCanvas } from './canvas';
import { Fx } from './fx';
import { createScene, drawSlotsBackdrop, type Scene } from './scenes';
import { probeFrame } from '../quality';

const MAX_SEATS = 16;
/** How long a settled result stays up before the lane may show the next round (ms). */
const HOLD_MS = 1300;

/** One animation in flight: a lane holds its latest round and stays on the settled frame until replaced. */
interface Flight {
  scene: Scene;
  start: number;
  o: LastPlay['outcome'];
  fired: boolean;
}

/** Most coins shown at once on the coin table (one lane per concurrent flip). */
const MAX_LANES = 6;
/** Blackjack hands and roulette wheels are wide, so fewer fit side by side. */
const MAX_BLACKJACK_LANES = 3;

/** Canvas presentation of a table. Never mutates game state. */
export class Stage {
  readonly canvas: HTMLCanvasElement;
  private lanes: (Flight | null)[] = [null];
  private nextLane = 0;
  /** Latest round waiting for each lane to finish showing its result (rounds keep simulating regardless). */
  private queues: ({ play: LastPlay; levels: Record<string, number> } | null)[] = [null];
  private fx = new Fx();
  private raf = 0;
  private last = 0;
  private seats = 0;
  private pulses: number[] = [];
  private observer: ResizeObserver | null = null;
  private idleIcon: string;
  private seenSeq = -1;
  private dirty = true;
  private bg: HTMLCanvasElement | null = null;
  private id: TableId;
  private recentSlots: number[][] = [];
  /** `recentSlots` without the newest spin, as the backdrop draws it. */
  private backdropSlots: number[][] = [];

  constructor(icon: string, id: TableId) {
    this.idleIcon = icon;
    this.id = id;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'stage-canvas';
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', `${id} table`);
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(() => this.request());
      this.observer.observe(this.canvas);
    }
  }

  /** Past slot spins (oldest first) drawn faintly behind the reels. */
  setRecentSpins(recent: number[][]): void {
    const changed = recent.length !== this.recentSlots.length || recent[recent.length - 1] !== this.recentSlots[this.recentSlots.length - 1];
    this.recentSlots = recent;
    this.backdropSlots = recent.slice(0, -1);
    if (changed && this.id === 'slots') this.request();
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

  /** The coin table throws one coin per concurrent player (speed upgrades); everything else shows one animation. */
  private laneCount(): number {
    if (this.id === 'coinflip') return Math.max(1, Math.min(MAX_LANES, this.seats));
    if (this.id === 'blackjack' || this.id === 'roulette') return Math.max(1, Math.min(MAX_BLACKJACK_LANES, this.seats));
    return 1;
  }

  /** Called when the panel becomes visible, or on any update; cheap if nothing changed. */
  resume(): void {
    if (this.dirty && this.raf === 0) this.request();
  }

  /** True while a lane is animating or holding its settled result. */
  private occupied(f: Flight | null, now: number): boolean {
    return f !== null && now - f.start < f.scene.duration * 1000 + HOLD_MS;
  }

  private start(lane: number, play: LastPlay, levels: Record<string, number>, now: number): void {
    const o = play.outcome;
    if (!o.view) return;
    const scene = createScene(o.view, { levels, net: o.net, seed: play.seq, speed: 0.6, result: o });
    const start = prefersReducedMotion() ? now - scene.duration * 1000 : now;
    this.lanes[lane] = { scene, start, o, fired: false };
  }

  show(play: LastPlay, levels: Record<string, number>): void {
    if (play.seq === this.seenSeq) return;
    this.seenSeq = play.seq;
    const o = play.outcome;
    this.canvas.setAttribute('aria-label', o.detail);
    const now = performance.now();
    const n = this.laneCount();
    this.fitLanes(n);

    const seat = Math.floor(Math.random() * Math.max(1, this.seats));
    if (this.seats > 0) this.pulses[seat] = 1;

    // Use the next free lane (round-robin); if every lane is still showing a result, queue the latest round
    // for the lane that frees up first and toss a chip so the player sees play continuing.
    let lane = -1;
    for (let k = 0; k < n; k++) {
      const i = (this.nextLane + k) % n;
      if (!this.occupied(this.lanes[i], now)) {
        lane = i;
        break;
      }
    }
    if (lane >= 0) {
      this.nextLane = lane + 1;
      this.start(lane, play, levels, now);
    } else {
      const w = this.canvas.clientWidth || 300;
      const h = this.canvas.clientHeight || 160;
      const sx = this.seats > 0 ? w * (0.1 + (0.8 * (seat + 0.5)) / this.seats) : w / 2;
      this.fx.chip(sx, h * 0.92, o.net > 0 ? COLORS.gold : o.net < 0 ? COLORS.red : COLORS.muted);
      let soonest = 0;
      for (let i = 1; i < n; i++) {
        const a = this.lanes[i];
        const b = this.lanes[soonest];
        if (a && b && a.start + a.scene.duration * 1000 < b.start + b.scene.duration * 1000) soonest = i;
      }
      this.queues[soonest] = { play, levels };
    }
    this.request();
  }

  private fitLanes(n: number): void {
    while (this.lanes.length < n) this.lanes.push(null);
    this.lanes.length = n;
    while (this.queues.length < n) this.queues.push(null);
    this.queues.length = n;
  }

  private request(): void {
    if (this.raf !== 0) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private busy(now: number): boolean {
    if (this.fx.alive || this.pulses.some((p) => p > 0) || this.queues.some((q) => q !== null)) return true;
    return this.lanes.some((f) => f !== null && (!f.fired || this.occupied(f, now)));
  }

  private frame = (now: number): void => {
    this.raf = 0;
    if (!this.canvas.isConnected) return;
    probeFrame(now - this.last);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.render(performance.now(), dt)) {
      // Hidden or no 2D context: skip effects and wait for resume()/resize.
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

    ctx.drawImage(this.background(w, h, this.canvas.width / w), 0, 0, w, h);
    if (this.id === 'slots') drawSlotsBackdrop(ctx, w, h, this.backdropSlots);

    const n = this.laneCount();
    this.fitLanes(n);
    const laneW = w / n;
    this.queues.forEach((q, i) => {
      if (q && !this.occupied(this.lanes[i], now)) {
        this.queues[i] = null;
        this.start(i, q.play, q.levels, now);
      }
    });
    this.lanes.forEach((f, i) => {
      const x = i * laneW;
      if (!f) {
        ctx.font = `${Math.min(h * 0.4, laneW * 0.5, 72)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = 0.5;
        ctx.fillText(this.idleIcon, x + laneW / 2, h / 2);
        ctx.globalAlpha = 1;
        return;
      }
      const t = Math.min((now - f.start) / 1000, f.scene.duration);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, 0, laneW, h);
      ctx.clip();
      ctx.translate(x, 0);
      f.scene.draw(ctx, t, laneW, h);
      ctx.restore();
      if (n > 1 && i > 0) {
        ctx.strokeStyle = COLORS.line;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.moveTo(x, h * 0.1);
        ctx.lineTo(x, h * 0.9);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      // Effects fire when the round settles.
      if (!f.fired && t >= f.scene.duration) {
        f.fired = true;
        const o = f.o;
        const cx = x + laneW / 2;
        if (o.net > 0) {
          const ratio = o.net / Math.max(1, o.bet);
          this.fx.burst(cx, h / 2, Math.min(60, Math.round(10 + ratio * 6) / Math.sqrt(n)));
          if (o.capped) this.fx.float(cx, h * 0.3, 'MAX PAYOUT!', COLORS.gold);
        }
        if (o.rerolled) this.fx.float(cx, h * 0.88, '↻ re-rolled', COLORS.cyan);
      }
    });

    this.drawSeats(ctx, w, h, dt);
    this.fx.step(dt);
    this.fx.draw(ctx);
    return true;
  }

  /** Static felt gradient, rendered once per size instead of every frame. */
  private background(w: number, h: number, scale: number): HTMLCanvasElement {
    const bw = Math.round(w * scale);
    const bh = Math.round(h * scale);
    if (!this.bg || this.bg.width !== bw || this.bg.height !== bh) {
      const c = document.createElement('canvas');
      c.width = bw;
      c.height = bh;
      const x = c.getContext('2d');
      if (x) {
        const g = x.createRadialGradient(bw / 2, bh / 2, 10, bw / 2, bh / 2, Math.max(bw, bh) * 0.7);
        g.addColorStop(0, COLORS.feltLight);
        g.addColorStop(1, COLORS.bg);
        x.fillStyle = g;
        x.fillRect(0, 0, bw, bh);
      }
      this.bg = c;
    }
    return this.bg;
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
