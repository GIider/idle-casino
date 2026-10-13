import { BOTS, TARGET_MINUTES, median, type RunResult } from './bots';
import type { SimRequest, SimResponse } from './worker';

const TABLE_NAMES = ['coinflip', 'slots', 'roulette', 'blackjack'] as const;
const PALETTE = ['#e6b422', '#5fb0f0', '#e8675a', '#6fcf7f', '#c58af0', '#f09a5f', '#4fd1c5', '#d4d4d4', '#ff7ab8'];
const colorOf = (i: number) => PALETTE[i % PALETTE.length];

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const results = new Map<string, RunResult[]>();

// ---- controls ---------------------------------------------------------------------------------
const controls = $('controls');
const botBoxes = new Map<string, HTMLInputElement>();
for (const bot of BOTS) {
  const label = document.createElement('label');
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = bot.id !== 'never-prestige';
  botBoxes.set(bot.id, box);
  label.append(box, bot.label);
  controls.append(label);
}
const num = (label: string, value: number) => {
  const l = document.createElement('label');
  const i = document.createElement('input');
  i.type = 'number';
  i.value = String(value);
  l.append(label, i);
  controls.append(l);
  return i;
};
const seedsInput = num('seeds', 5);
const capInput = num('max minutes', 120);
const runBtn = document.createElement('button');
runBtn.textContent = 'Run';
const status = document.createElement('span');
status.className = 'muted';
controls.append(runBtn, status);
const exportBtn = document.createElement('button');
exportBtn.textContent = 'Export JSON';
controls.append(exportBtn);

const botPick = $<HTMLSelectElement>('botPick');
for (const bot of BOTS) botPick.add(new Option(bot.id, bot.id));
botPick.onchange = drawDetail;

// ---- running ----------------------------------------------------------------------------------
runBtn.onclick = () => {
  const bots = BOTS.filter((b) => botBoxes.get(b.id)!.checked);
  const seeds = Array.from({ length: Math.max(1, Number(seedsInput.value) | 0) }, (_, i) => i + 1);
  const cap = Math.max(10, Number(capInput.value) || 120);
  results.clear();
  const queue: SimRequest[] = bots.flatMap((b) => seeds.map((seed) => ({ bot: b.id, seed, options: { maxMinutes: cap } })));
  const total = queue.length;
  let done = 0;
  runBtn.disabled = true;
  const poolSize = Math.min(navigator.hardwareConcurrency || 4, 8, total);
  let live = poolSize;
  const spawn = () => {
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    const next = () => {
      const job = queue.shift();
      if (job) w.postMessage(job);
      else {
        w.terminate();
        if (--live === 0) runBtn.disabled = false;
      }
    };
    w.onmessage = (e: MessageEvent<SimResponse>) => {
      const { bot, result } = e.data;
      (results.get(bot) ?? results.set(bot, []).get(bot)!).push(result);
      status.textContent = `${++done}/${total} runs`;
      drawAll();
      next();
    };
    next();
  };
  for (let i = 0; i < poolSize; i++) spawn();
};

exportBtn.onclick = () => {
  const slim = Object.fromEntries([...results].map(([k, v]) => [k, v.map((r) => ({ ...r, samples: undefined }))]));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(slim, null, 1)], { type: 'application/json' }));
  a.download = 'sim-results.json';
  a.click();
};

// ---- drawing ----------------------------------------------------------------------------------
interface Series {
  label: string;
  color: string;
  mid: [number, number][];
  lo?: [number, number][];
  hi?: [number, number][];
}

function setup(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; w: number; h: number } {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

function lineChart(canvas: HTMLCanvasElement, series: Series[], xMax: number, yMin: number, yMax: number, marks: number[] = []): void {
  const { ctx, w, h } = setup(canvas);
  const L = 44, R = 8, T = 8, B = 22;
  const x = (v: number) => L + (v / xMax) * (w - L - R);
  const y = (v: number) => T + (1 - (v - yMin) / (yMax - yMin)) * (h - T - B);
  ctx.font = '11px system-ui';
  ctx.fillStyle = '#a39889';
  ctx.strokeStyle = '#3a312b';
  ctx.lineWidth = 1;
  for (let m = 0; m <= xMax; m += xMax > 90 ? 20 : 10) {
    ctx.beginPath(); ctx.moveTo(x(m), T); ctx.lineTo(x(m), h - B); ctx.stroke();
    ctx.fillText(`${m}m`, x(m) - 8, h - 6);
  }
  const yStep = Math.max(1, Math.round((yMax - yMin) / 6));
  for (let v = Math.ceil(yMin / yStep) * yStep; v <= yMax; v += yStep) {
    ctx.beginPath(); ctx.moveTo(L, y(v)); ctx.lineTo(w - R, y(v)); ctx.stroke();
    ctx.fillText(String(v), 4, y(v) + 4);
  }
  for (const [m, color] of [[TARGET_MINUTES.greedy, '#6fcf7f'], [TARGET_MINUTES.worst, '#e8675a']] as const) {
    if (m > xMax) continue;
    ctx.strokeStyle = color; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(x(m), T); ctx.lineTo(x(m), h - B); ctx.stroke();
    ctx.setLineDash([]);
  }
  void marks;
  const path = (pts: [number, number][]) => {
    ctx.beginPath();
    pts.forEach(([px, py], i) => (i ? ctx.lineTo(x(px), y(Math.max(yMin, Math.min(yMax, py)))) : ctx.moveTo(x(px), y(Math.max(yMin, Math.min(yMax, py))))));
  };
  for (const s of series) {
    if (s.lo && s.hi) {
      ctx.fillStyle = s.color + '28';
      ctx.beginPath();
      s.hi.forEach(([px, py], i) => (i ? ctx.lineTo(x(px), y(Math.min(yMax, py))) : ctx.moveTo(x(px), y(Math.min(yMax, py)))));
      [...s.lo].reverse().forEach(([px, py]) => ctx.lineTo(x(px), y(Math.max(yMin, py))));
      ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = s.color; ctx.lineWidth = 1.6;
    path(s.mid); ctx.stroke();
  }
}

/** Median/min/max across seeds at each sample index; runs that ended early (ascended) hold their last value. */
function aggregate(runs: RunResult[], pick: (s: RunResult['samples'][number]) => number): { mid: [number, number][]; lo: [number, number][]; hi: [number, number][] } {
  const len = Math.max(...runs.map((r) => r.samples.length));
  const mid: [number, number][] = [], lo: [number, number][] = [], hi: [number, number][] = [];
  for (let i = 0; i < len; i++) {
    const vals = runs.map((r) => pick(r.samples[Math.min(i, r.samples.length - 1)]));
    const t = (runs.find((r) => r.samples[i])?.samples[i].t) ?? 0;
    mid.push([t, median(vals)]);
    lo.push([t, Math.min(...vals)]);
    hi.push([t, Math.max(...vals)]);
  }
  return { mid, lo, hi };
}

function drawAll(): void {
  const ids = BOTS.filter((b) => results.has(b.id)).map((b) => b.id);
  const cap = Math.max(10, Number(capInput.value) || 120);
  const series: Series[] = ids.map((id) => ({ label: id, color: colorOf(BOTS.findIndex((b) => b.id === id)), ...aggregate(results.get(id)!, (s) => s.progress) }));
  lineChart($('progress') as HTMLCanvasElement, series, cap, -9, 1);
  $('legend').innerHTML = series.map((s) => `<span><i style="background:${s.color}"></i>${s.label}</span>`).join('') + '<span class="ok">┆ 60 min target</span><span class="bad">┆ 90 min limit</span>';
  drawSummary();
  drawDetail();
}

function drawSummary(): void {
  const rows = BOTS.filter((b) => results.has(b.id)).map((b) => {
    const runs = results.get(b.id)!;
    const t = runs.map((r) => r.ascendedAt ?? Infinity).sort((a, c) => a - c);
    const med = median(t);
    const f = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : 'never');
    const limit = b.id === 'greedy' || b.id === 'optimal' ? TARGET_MINUTES.greedy : TARGET_MINUTES.worst;
    const cls = b.id === 'never-prestige' ? 'muted' : med <= limit ? 'ok' : 'bad';
    return `<tr><td>${b.id}</td><td>${runs.length}</td><td>${f(t[0])}</td><td class="${cls}">${f(med)}</td><td>${f(t[t.length - 1])}</td></tr>`;
  });
  $('summary').innerHTML = `<table><tr><th>bot</th><th>runs</th><th>min</th><th>median</th><th>max</th></tr>${rows.join('')}</table>`;
}

function drawDetail(): void {
  const runs = results.get(botPick.value);
  const wallets = $('wallets') as HTMLCanvasElement;
  const events = $('events') as HTMLCanvasElement;
  if (!runs || runs.length === 0) {
    setup(wallets); setup(events);
    return;
  }
  const r = runs[0];
  const cap = Math.max(10, Number(capInput.value) || 120);
  const series: Series[] = TABLE_NAMES.map((t, i) => ({
    label: t,
    color: PALETTE[i],
    mid: r.samples.map((s) => [s.t, s.wallets[t] > 0 ? Math.log10(s.wallets[t]) : -1] as [number, number]),
  }));
  lineChart(wallets, series, cap, 0, 14);
  $('walletLegend').innerHTML = series.map((s) => `<span><i style="background:${s.color}"></i>${s.label}</span>`).join('');

  const { ctx, w, h } = setup(events);
  const L = 70, R = 8;
  const x = (t: number) => L + (t / cap) * (w - L - R);
  ctx.font = '11px system-ui';
  TABLE_NAMES.forEach((t, i) => {
    const y = 14 + i * 30;
    ctx.fillStyle = '#a39889';
    ctx.fillText(t, 4, y + 4);
    ctx.strokeStyle = '#3a312b';
    ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(w - R, y); ctx.stroke();
    for (const e of r.events) {
      if (e.kind === 'prestige' && e.label.startsWith(t)) {
        ctx.strokeStyle = PALETTE[i]; ctx.beginPath(); ctx.moveTo(x(e.t), y - 8); ctx.lineTo(x(e.t), y + 8); ctx.stroke();
      } else if (e.kind === 'unlock' && e.label === t) {
        ctx.fillStyle = '#fff'; ctx.fillText('▲', x(e.t) - 4, y + 4);
      } else if (e.kind === 'achievement' && e.label.length && achievementTable(e.label) === t) {
        ctx.fillStyle = PALETTE[i]; ctx.fillRect(x(e.t) - 1, y + 10, 2, 4);
      }
    }
  });
  const asc = r.events.find((e) => e.kind === 'ascend');
  if (asc) { ctx.fillStyle = '#ffd24a'; ctx.fillText('★', x(asc.t) - 5, h - 4); }
  void h;
}

import { ACHIEVEMENTS } from '../core/achievements';
const tableOfAchievement = new Map(ACHIEVEMENTS.map((a) => [a.id, a.table]));
function achievementTable(label: string): string | undefined {
  return tableOfAchievement.get(label.replace(/ T\d$/, ''));
}

window.addEventListener('resize', drawAll);
drawAll();
