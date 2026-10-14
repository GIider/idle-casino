import { BOTS, TARGET_MINUTES, median, runBot, type RunResult } from './bots';
import type { SimRequest, SimResponse } from './worker';
import { ACHIEVEMENTS } from '../core/achievements';
import { fmt } from '../ui/format';

const TABLE_NAMES = ['coinflip', 'slots', 'roulette', 'blackjack'] as const;
const TABLE_COLORS = ['#e6b422', '#5fb0f0', '#e8675a', '#6fcf7f'];
const BOT_COLORS = ['#e6b422', '#5fb0f0', '#e8675a', '#6fcf7f', '#c58af0', '#f09a5f', '#4fd1c5', '#d4d4d4', '#ff7ab8'];
const botColor = (id: string) => BOT_COLORS[BOTS.findIndex((b) => b.id === id) % BOT_COLORS.length];
const botLabel = (id: string) => BOTS.find((b) => b.id === id)?.label ?? id;
const limitFor = (id: string) => (id === 'greedy' || id === 'optimal' ? TARGET_MINUTES.greedy : TARGET_MINUTES.worst);

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const results = new Map<string, RunResult[]>();
const enabled = new Set(BOTS.filter((b) => b.id !== 'never-prestige').map((b) => b.id));
let runCap = 120;

// ---- controls ---------------------------------------------------------------------------------
const chips = $('chips');
function renderChips(): void {
  chips.innerHTML = '';
  for (const bot of BOTS) {
    const el = document.createElement('span');
    el.className = 'chip' + (enabled.has(bot.id) ? '' : ' off');
    el.title = bot.label;
    el.innerHTML = `<i style="background:${botColor(bot.id)}"></i>${bot.id}`;
    el.onclick = () => {
      if (enabled.has(bot.id)) enabled.delete(bot.id);
      else enabled.add(bot.id);
      renderChips();
      drawAll();
    };
    chips.append(el);
  }
  for (const [label, fn] of [['All', () => BOTS.forEach((b) => enabled.add(b.id))], ['None', () => enabled.clear()]] as const) {
    const b = document.createElement('button');
    b.className = 'ghost';
    b.textContent = label;
    b.onclick = () => { fn(); renderChips(); drawAll(); };
    chips.append(b);
  }
}
renderChips();

const shopMode = () => $<HTMLInputElement>('shop').checked;
const runBtn = $<HTMLButtonElement>('run');
const exportBtn = $<HTMLButtonElement>('export');
const statusEl = $('status');
const barEl = $('bar');
const botPick = $<HTMLSelectElement>('botPick');
for (const b of BOTS) botPick.add(new Option(`${b.id} — ${b.label}`, b.id));
const achTable = $<HTMLSelectElement>('achTable');
achTable.add(new Option('All tables', ''));
for (const t of TABLE_NAMES) achTable.add(new Option(t, t));
for (const el of [botPick, achTable, $('achSort'), $('bands')]) el.onchange = drawAll;

// ---- running ----------------------------------------------------------------------------------
runBtn.onclick = () => {
  const bots = BOTS.filter((b) => enabled.has(b.id));
  if (bots.length === 0) { statusEl.textContent = 'Select at least one bot'; return; }
  const seedCount = Math.min(20, Math.max(1, Number($<HTMLInputElement>('seeds').value) | 0));
  runCap = Math.max(10, Number($<HTMLInputElement>('cap').value) || 120);
  const queue: SimRequest[] = bots.flatMap((b) =>
    Array.from({ length: seedCount }, (_, i) => ({ bot: b.id, seed: i + 1, options: { maxMinutes: runCap, untilShopComplete: shopMode() } })),
  );
  const total = queue.length;
  let done = 0;
  results.clear();
  runBtn.disabled = true;
  exportBtn.disabled = true;
  const poolSize = Math.min(navigator.hardwareConcurrency || 4, 8, total);
  let live = poolSize;
  const t0 = performance.now();
  const finish = () => {
    runBtn.disabled = false;
    exportBtn.disabled = false;
    statusEl.textContent = `Done: ${total} runs in ${((performance.now() - t0) / 1000).toFixed(1)}s`;
    drawAll();
  };
  for (let i = 0; i < poolSize; i++) {
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    const next = () => {
      const job = queue.shift();
      if (job) w.postMessage(job);
      else {
        w.terminate();
        if (--live === 0) finish();
      }
    };
    w.onmessage = (e: MessageEvent<SimResponse>) => {
      const { bot, result } = e.data;
      if (!results.has(bot)) results.set(bot, []);
      results.get(bot)!.push(result);
      done++;
      statusEl.textContent = `${done}/${total} runs`;
      barEl.style.width = `${(done / total) * 100}%`;
      next();
    };
    next();
  }
};

exportBtn.onclick = () => {
  const slim = Object.fromEntries([...results].map(([k, v]) => [k, v.map((r) => ({ ...r, samples: undefined }))]));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(slim, null, 1)], { type: 'application/json' }));
  a.download = 'sim-results.json';
  a.click();
};

// ---- chart helper -----------------------------------------------------------------------------
interface Line {
  id: string;
  color: string;
  mid: [number, number][];
  lo?: [number, number][];
  hi?: [number, number][];
}
interface ChartOpts {
  canvas: HTMLCanvasElement;
  tip: HTMLElement;
  xMax: number;
  yMin: number;
  yMax: number;
  yStep: number;
  yFmt?: (v: number) => string;
  lines: Line[];
  /** Extra markers drawn after the lines. */
  decorate?: (ctx: CanvasRenderingContext2D, x: (t: number) => number, y: (v: number) => number) => void;
  /** Tooltip body for the hovered minute. */
  tooltip: (t: number, idx: number) => string;
}

const PAD = { l: 40, r: 10, t: 8, b: 22 };

function drawChart(o: ChartOpts, hoverX: number | null): void {
  const { canvas } = o;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const x = (t: number) => PAD.l + (t / o.xMax) * (w - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (Math.max(o.yMin, Math.min(o.yMax, v)) - o.yMin) / (o.yMax - o.yMin)) * (h - PAD.t - PAD.b);
  ctx.font = '11px system-ui';
  ctx.lineWidth = 1;
  const xStep = o.xMax > 90 ? 20 : 10;
  for (let m = 0; m <= o.xMax; m += xStep) {
    ctx.strokeStyle = '#3a312b'; ctx.beginPath(); ctx.moveTo(x(m), PAD.t); ctx.lineTo(x(m), h - PAD.b); ctx.stroke();
    ctx.fillStyle = '#a39889'; ctx.fillText(`${m}m`, x(m) - 8, h - 6);
  }
  for (let v = Math.ceil(o.yMin / o.yStep) * o.yStep; v <= o.yMax; v += o.yStep) {
    ctx.strokeStyle = '#3a312b'; ctx.beginPath(); ctx.moveTo(PAD.l, y(v)); ctx.lineTo(w - PAD.r, y(v)); ctx.stroke();
    ctx.fillStyle = '#a39889'; ctx.fillText(o.yFmt ? o.yFmt(v) : String(v), 4, y(v) + 4);
  }
  for (const line of o.lines) {
    if (line.lo && line.hi) {
      ctx.fillStyle = line.color + '26';
      ctx.beginPath();
      line.hi.forEach(([t, v], i) => (i ? ctx.lineTo(x(t), y(v)) : ctx.moveTo(x(t), y(v))));
      for (let i = line.lo.length - 1; i >= 0; i--) ctx.lineTo(x(line.lo[i][0]), y(line.lo[i][1]));
      ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = line.color; ctx.lineWidth = 1.7;
    ctx.beginPath();
    line.mid.forEach(([t, v], i) => (i ? ctx.lineTo(x(t), y(v)) : ctx.moveTo(x(t), y(v))));
    ctx.stroke();
    ctx.lineWidth = 1;
  }
  o.decorate?.(ctx, x, y);
  if (hoverX !== null) {
    ctx.strokeStyle = '#eee6dc66'; ctx.beginPath(); ctx.moveTo(hoverX, PAD.t); ctx.lineTo(hoverX, h - PAD.b); ctx.stroke();
  }
}

/** Draws a chart and wires its hover tooltip (re-wired on every redraw so handlers see the current data). */
function chart(o: ChartOpts, sampleCount: number): void {
  const render = (hx: number | null) => drawChart(o, hx);
  render(null);
  const { canvas, tip } = o;
  canvas.onmouseleave = () => { tip.style.display = 'none'; render(null); };
  canvas.onmousemove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const plotW = rect.width - PAD.l - PAD.r;
    const t = Math.max(0, Math.min(o.xMax, ((px - PAD.l) / plotW) * o.xMax));
    const idx = Math.max(0, Math.min(sampleCount - 1, Math.round((t / o.xMax) * (sampleCount - 1))));
    render(px);
    tip.innerHTML = o.tooltip(t, idx);
    tip.style.display = 'block';
    const tw = tip.offsetWidth;
    tip.style.left = `${px + 14 + tw > rect.width ? px - tw - 14 : px + 14}px`;
    tip.style.top = `${Math.max(0, e.clientY - rect.top - 10)}px`;
  };
}


// ---- panels -----------------------------------------------------------------------------------
function activeBots(): string[] {
  return BOTS.filter((b) => results.has(b.id) && enabled.has(b.id)).map((b) => b.id);
}

/** Median / min / max across seeds, per sample index (runs of equal length share the sampling grid). */
function aggregate(runs: RunResult[], pick: (s: RunResult['samples'][number]) => number) {
  const len = Math.min(...runs.map((r) => r.samples.length));
  const mid: [number, number][] = [], lo: [number, number][] = [], hi: [number, number][] = [];
  for (let i = 0; i < len; i++) {
    const vals = runs.map((r) => pick(r.samples[i]));
    const t = runs[0].samples[i].t;
    mid.push([t, median(vals)]); lo.push([t, Math.min(...vals)]); hi.push([t, Math.max(...vals)]);
  }
  return { mid, lo, hi };
}

function drawProgress(): void {
  const ids = activeBots();
  const canvas = $<HTMLCanvasElement>('progress');
  const showBands = $<HTMLInputElement>('bands').checked;
  const lines: Line[] = ids.map((id) => {
    const a = aggregate(results.get(id)!, (s) => s.progress);
    // Stop each line where the median reaches the threshold; what happens after is not interesting here.
    const cut = a.mid.findIndex(([, v]) => v >= 0);
    const n = cut < 0 ? a.mid.length : cut + 1;
    return { id, color: botColor(id), mid: a.mid.slice(0, n), lo: showBands ? a.lo.slice(0, n) : undefined, hi: showBands ? a.hi.slice(0, n) : undefined };
  });
  $('legend').innerHTML =
    lines.map((l) => `<span><i style="background:${l.color}"></i>${l.id}</span>`).join('') +
    `<span class="ok">┆ ${TARGET_MINUTES.greedy} min target</span><span class="bad">┆ ${TARGET_MINUTES.worst} min limit</span>`;
  const n = lines[0]?.mid.length ?? 0;
  chart(
    {
      canvas, tip: $('tip-progress'), xMax: runCap, yMin: -9, yMax: 0.5, yStep: 1, lines,
      decorate: (ctx, x, y) => {
        ctx.setLineDash([4, 4]);
        for (const [m, c] of [[TARGET_MINUTES.greedy, '#6fcf7f'], [TARGET_MINUTES.worst, '#e8675a']] as const) {
          if (m > runCap) continue;
          ctx.strokeStyle = c; ctx.beginPath(); ctx.moveTo(x(m), PAD.t); ctx.lineTo(x(m), canvas.clientHeight - PAD.b); ctx.stroke();
        }
        ctx.strokeStyle = '#eee6dc55'; ctx.beginPath(); ctx.moveTo(PAD.l, y(0)); ctx.lineTo(canvas.clientWidth - PAD.r, y(0)); ctx.stroke();
        ctx.setLineDash([]);
      },
      tooltip: (t, i) =>
        `<b>${t.toFixed(1)} min</b>` +
        lines.filter((l) => i < l.mid.length)
          .map((l) => {
            const [, v] = l.mid[i];
            const run = results.get(l.id)!;
            const at = Math.min(i, run[0].samples.length - 1);
            const spread = run.map((r) => r.samples[at].progress);
            const lo = Math.min(...spread), hi = Math.max(...spread);
            const pct = v >= 0 ? '≥ 100%' : `${(10 ** v * 100).toPrecision(2)}%`;
            return `<div><i style="background:${l.color}"></i>${l.id}: ${v.toFixed(2)} (${pct} of threshold) <span class="muted">[${lo.toFixed(1)} … ${hi.toFixed(1)}]</span></div>`;
          })
          .join(''),
    },
    Math.max(n, 2),
  );
}

function drawSummary(): void {
  const ids = activeBots();
  if (ids.length === 0) { $('summary').innerHTML = '<div class="empty">Run the simulation to see results.</div>'; return; }
  const rows = ids.map((id) => {
    const runs = results.get(id)!;
    const t = runs.map((r) => r.ascendedAt ?? Infinity).sort((a, c) => a - c);
    const med = median(t);
    const limit = limitFor(id);
    const cls = id === 'never-prestige' ? 'muted' : med <= limit ? 'ok' : 'bad';
    const reached = runs.filter((r) => r.ascendedAt !== null).length;
    const f = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : '–');
    const shopRuns = runs.map((r) => r.shopCompleteAt ?? Infinity);
    const shopMed = median(shopRuns);
    const shopCell = shopMode()
      ? `<td class="${shopMed <= TARGET_MINUTES.shop ? 'ok' : 'bad'}" title="median ascensions: ${f(median(runs.map((r) => r.ascensionsToComplete ?? Infinity)))}">${f(shopMed)} (${runs.filter((r) => r.shopCompleteAt !== null).length}/${runs.length})</td>`
      : '';
    const unlock = (tb: 'slots' | 'roulette' | 'blackjack') => {
      const xs = runs.map((r) => r.unlockedAt[tb]).filter((v): v is number => v !== undefined);
      return xs.length ? f(median(xs)) : '–';
    };
    return `<tr title="${botLabel(id)}; limit ${limit} min"><td><i class="chip" style="padding:0;border:0"><i style="background:${botColor(id)}"></i></i> ${id}</td>
      <td>${reached}/${runs.length}</td><td>${f(t[0])}</td><td class="${cls}">${f(med)}</td><td>${f(t[t.length - 1])}</td>
      ${shopCell}<td class="muted">${unlock('slots')} / ${unlock('roulette')} / ${unlock('blackjack')}</td></tr>`;
  });
  $('summary').innerHTML = `<div class="scroll"><table><thead><tr><th>Bot</th><th>Ascended</th><th>Min</th><th>Median</th><th>Max</th>${shopMode() ? '<th>Shop complete</th>' : ''}<th>Unlocks S / R / B</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}

function drawDetail(): void {
  const runs = results.get(botPick.value);
  const wallets = $<HTMLCanvasElement>('wallets');
  const events = $<HTMLCanvasElement>('events');
  if (!runs || runs.length === 0) {
    for (const c of [wallets, events]) { c.getContext('2d')?.clearRect(0, 0, c.width, c.height); c.onmousemove = null; }
    $('walletLegend').innerHTML = '<span>Run the simulation, then pick a bot above.</span>';
    return;
  }
  const r = runs.slice().sort((a, b) => a.seed - b.seed)[0];
  const lines: Line[] = TABLE_NAMES.map((t, i) => ({
    id: t, color: TABLE_COLORS[i],
    mid: r.samples.map((s) => [s.t, s.wallets[t] > 0 ? Math.log10(s.wallets[t]) : 0] as [number, number]),
  }));
  $('walletLegend').innerHTML = lines.map((l) => `<span><i style="background:${l.color}"></i>${l.id}</span>`).join('');
  chart(
    {
      canvas: wallets, tip: $('tip-wallets'), xMax: runCap, yMin: 0, yMax: Math.max(12, Math.ceil(Math.max(...lines.flatMap((l) => l.mid.map((p) => p[1]))) / 2) * 2), yStep: 2,
      yFmt: (v) => `1e${v}`, lines,
      tooltip: (_t, i) => {
        const s = r.samples[Math.min(i, r.samples.length - 1)];
        return `<b>${s.t.toFixed(1)} min</b>` + TABLE_NAMES.map((tb, k) => `<div><i style="background:${TABLE_COLORS[k]}"></i>${tb}: ${s.wallets[tb] > 0 ? fmt(s.wallets[tb]) : 'locked'} · prestige ${s.prestige[tb]}</div>`).join('');
      },
    },
    r.samples.length,
  );
  drawEvents(r);
}

function drawEvents(r: RunResult): void {
  const canvas = $<HTMLCanvasElement>('events');
  const tip = $('tip-events');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const L = 70, R = 10;
  const x = (t: number) => L + (t / runCap) * (w - L - R);
  const laneH = (h - 24) / TABLE_NAMES.length;
  const tableOf = new Map(ACHIEVEMENTS.map((a) => [a.id, a.table as string]));
  interface Mark { px: number; py: number; text: string }
  const marks: Mark[] = [];
  ctx.font = '11px system-ui';
  TABLE_NAMES.forEach((tb, i) => {
    const cy = 12 + i * laneH + laneH / 2;
    ctx.fillStyle = '#a39889'; ctx.fillText(tb, 4, cy + 4);
    ctx.strokeStyle = '#3a312b'; ctx.beginPath(); ctx.moveTo(L, cy); ctx.lineTo(w - R, cy); ctx.stroke();
    for (const e of r.events) {
      const px = x(e.t);
      if (e.kind === 'prestige' && e.label.startsWith(tb)) {
        ctx.strokeStyle = TABLE_COLORS[i]; ctx.beginPath(); ctx.moveTo(px, cy - 9); ctx.lineTo(px, cy + 9); ctx.stroke();
        marks.push({ px, py: cy, text: `${e.t.toFixed(1)} min — prestige ${e.label}` });
      } else if (e.kind === 'unlock' && e.label === tb) {
        ctx.fillStyle = '#fff'; ctx.fillText('▲', px - 4, cy + 4);
        marks.push({ px, py: cy, text: `${e.t.toFixed(1)} min — ${tb} unlocked` });
      } else if (e.kind === 'achievement' && tableOf.get(e.label.replace(/ T\d$/, '')) === tb) {
        ctx.fillStyle = TABLE_COLORS[i]; ctx.fillRect(px - 2, cy + 10, 4, 4);
        marks.push({ px, py: cy + 12, text: `${e.t.toFixed(1)} min — achievement ${e.label}` });
      }
    }
  });
  const asc = r.events.find((e) => e.kind === 'ascend');
  if (asc) {
    ctx.fillStyle = '#ffd24a'; ctx.fillText('★', x(asc.t) - 5, h - 6);
    marks.push({ px: x(asc.t), py: h - 10, text: `${asc.t.toFixed(1)} min — ascension threshold reached` });
  }
  for (let m = 0; m <= runCap; m += runCap > 90 ? 20 : 10) { ctx.fillStyle = '#a39889'; ctx.fillText(`${m}m`, x(m) - 8, h - 6); }
  canvas.onmouseleave = () => { tip.style.display = 'none'; };
  canvas.onmousemove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    let best: Mark | null = null, bd = 10;
    for (const m of marks) {
      const d = Math.hypot(m.px - mx, (m.py - my) * 0.6);
      if (d < bd) { bd = d; best = m; }
    }
    if (!best) { tip.style.display = 'none'; return; }
    tip.textContent = best.text;
    tip.style.display = 'block';
    const tw = tip.offsetWidth;
    tip.style.left = `${mx + 14 + tw > rect.width ? mx - tw - 14 : mx + 14}px`;
    tip.style.top = `${Math.max(0, my - 10)}px`;
  };
}

function drawAchievements(): void {
  const host = $('ach');
  const ids = activeBots();
  if (ids.length === 0) { host.innerHTML = '<div class="empty">Run the simulation to see results.</div>'; return; }
  const tableFilter = $<HTMLSelectElement>('achTable').value;
  const sort = $<HTMLSelectElement>('achSort').value;
  const defs = ACHIEVEMENTS.filter((a) => !tableFilter || a.table === tableFilter);
  const cell = (id: string, achId: string) => {
    const runs = results.get(id)!;
    const xs = runs.map((r) => r.achievementAt[achId]?.[0] ?? Infinity);
    const reached = xs.filter(Number.isFinite) as number[];
    const med = median(xs);
    return { med, reached: reached.length, total: runs.length, min: reached.length ? Math.min(...reached) : null, max: reached.length ? Math.max(...reached) : null };
  };
  const first = (a: (typeof ACHIEVEMENTS)[number]) => Math.min(...ids.map((id) => cell(id, a.id).med));
  const rows = defs.slice().sort((a, b) => (sort === 'name' ? a.id.localeCompare(b.id) : first(a) - first(b)));
  const head = `<thead><tr><th>Achievement</th>${ids.map((id) => `<th title="${botLabel(id)}"><i style="background:${botColor(id)};display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px"></i>${id}</th>`).join('')}</tr></thead>`;
  let lastTable = '';
  const body = rows
    .map((a) => {
      const sep = sort === 'name' && a.table !== lastTable ? `<tr class="group"><td colspan="${ids.length + 1}">${a.table}</td></tr>` : '';
      lastTable = a.table;
      const cells = ids
        .map((id) => {
          const c = cell(id, a.id);
          const tip = `${c.reached}/${c.total} seeds reached` + (c.min !== null ? `; min ${c.min.toFixed(1)}, max ${c.max!.toFixed(1)} min` : '');
          return `<td><span title="${tip}">${Number.isFinite(c.med) ? c.med.toFixed(0) : '–'}</span></td>`;
        })
        .join('');
      return `${sep}<tr><td title="${a.goal}">${a.id}<span class="tag">${a.table}</span></td>${cells}</tr>`;
    })
    .join('');
  host.innerHTML = `<table>${head}<tbody>${body}</tbody></table>`;
}

function drawAll(): void {
  drawSummary();
  drawProgress();
  drawDetail();
  drawAchievements();
}

window.addEventListener('resize', drawAll);
drawAll();

// `?autorun` (optionally `&seeds=3&cap=90`) starts a run on load, handy for sharing a link or screenshots.
const params = new URLSearchParams(location.search);
if (params.has('autorun')) {
  if (params.has('seeds')) $<HTMLInputElement>('seeds').value = params.get('seeds')!;
  if (params.has('cap')) $<HTMLInputElement>('cap').value = params.get('cap')!;
  if (params.has('sync')) {
    // Inline on the main thread so the page is fully drawn at load (used for headless screenshots).
    runCap = Math.max(10, Number($<HTMLInputElement>('cap').value) || 120);
    const n = Math.max(1, Number($<HTMLInputElement>('seeds').value) | 0);
    for (const b of BOTS.filter((x) => enabled.has(x.id))) {
      results.set(b.id, Array.from({ length: n }, (_, i) => runBot(b, { seed: i + 1, maxMinutes: runCap, ignoreAscension: true, untilShopComplete: shopMode() })));
    }
    exportBtn.disabled = false;
    statusEl.textContent = 'Done (inline run)';
    drawAll();
  } else runBtn.click();
}
