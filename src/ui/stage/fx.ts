import { COLORS } from './canvas';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  text?: string;
}

/** Chips, sparks and floating labels. Pure presentation. */
export class Fx {
  private ps: Particle[] = [];

  get alive(): boolean {
    return this.ps.length > 0;
  }

  burst(x: number, y: number, count: number, color = COLORS.gold): void {
    for (let i = 0; i < count && this.ps.length < (document.documentElement.dataset.quality === 'low' ? 60 : 200); i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 60 + Math.random() * 180;
      this.ps.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 90,
        life: 0,
        max: 0.7 + Math.random() * 0.6,
        size: 3 + Math.random() * 3,
        color: Math.random() < 0.3 ? COLORS.cyan : color,
      });
    }
  }

  float(x: number, y: number, text: string, color: string): void {
    if (this.ps.length >= 200) this.ps.shift();
    this.ps.push({ x, y, vx: 0, vy: -45, life: 0, max: 1.2, size: 16, color, text });
  }

  /** A single chip tossed from `x` towards the middle; used for auto-play ticks. */
  chip(x: number, y: number, color: string): void {
    if (this.ps.length >= 200) return;
    this.ps.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 40,
      vy: -110 - Math.random() * 50,
      life: 0,
      max: 0.6,
      size: 4,
      color,
    });
  }

  step(dt: number): void {
    for (const p of this.ps) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (!p.text) p.vy += 420 * dt;
    }
    this.ps = this.ps.filter((p) => p.life < p.max);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.ps) {
      ctx.globalAlpha = Math.max(0, 1 - p.life / p.max);
      ctx.fillStyle = p.color;
      if (p.text) {
        ctx.font = `800 ${p.size}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(p.text, p.x, p.y);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}
