// Usage: npm run build-free: node scripts/perf-measure.mjs [out.md] [--quick]
// Starts `vite` and measures every screen x quality x mode x speed via the ?perf=1 overlay data (window.__perf).
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const out = process.argv[2] ?? 'perf-results/baseline.md';
const quick = process.argv.includes('--quick');
const PORT = 5199;
const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const base = `http://localhost:${PORT}/`;
for (let i = 0; i < 60; i++) {
  try { await fetch(base); break; } catch { await new Promise((r) => setTimeout(r, 500)); }
}

const SCREENS = ['coinflip', 'slots', 'roulette', 'blackjack', 'casino', 'achievements'];
const TABLE_TAB = { coinflip: 0, slots: 1, roulette: 2, blackjack: 3 };
const qualities = quick ? ['high'] : ['high', 'low', 'auto'];
const modes = quick ? ['dev'] : ['normal', 'dev'];
const speeds = quick ? ['max'] : ['base', 'max'];
const WARM = quick ? 1500 : 3000;
const RUN = quick ? 4000 : 12000;

const browser = await chromium.launch({ args: ['--enable-precise-memory-info'] });
const rows = [];
for (const mode of modes) for (const speed of speeds) for (const quality of qualities) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  const url = `${base}?perf=1&quality=${quality}${mode === 'dev' ? '&cardcounting=1' : ''}`;
  await page.goto(url);
  await page.waitForFunction(() => window.__game);
  if (speed === 'max') {
    await page.evaluate(() => {
      const g = window.__game;
      g.devUnlockAll();
      g.state.casino.levels.bulkbuy = 1;
      g.state.casino.levels.concierge = 0;
      for (const id of Object.keys(g.state.tables)) {
        g.state.tables[id].unlocked = true;
        g.state.tables[id].wallet = 1e30;
        g.buyCheapest(id);
        g.state.tables[id].wallet = 1e30;
      }
    });
  }
  for (const screen of SCREENS) {
    await page.evaluate((s) => {
      const tabs = [...document.querySelectorAll('.tab')];
      const want = { coinflip: 'Coin', slots: 'Slot', roulette: 'Roulette', blackjack: 'Blackjack', casino: 'Casino', achievements: 'Achievements' }[s];
      const t = tabs.find((el) => (el.title || '').startsWith(want));
      t?.click();
    }, screen);
    await page.waitForTimeout(WARM);
    const heap0 = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0);
    const samples = [];
    for (let t = 0; t < RUN; t += 1000) {
      await page.waitForTimeout(1000);
      samples.push(await page.evaluate(() => window.__perf));
    }
    const heap1 = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0);
    const ok = samples.filter(Boolean);
    const avg = (f) => ok.reduce((a, s) => a + f(s), 0) / Math.max(1, ok.length);
    const labels = new Set(ok.flatMap((s) => Object.keys(s.labels)));
    const cost = {};
    for (const l of labels) cost[l] = avg((s) => s.labels[l]?.msPerSec ?? 0);
    const total = Object.values(cost).reduce((a, b) => a + b, 0);
    rows.push({ mode, speed, quality, screen, fps: avg((s) => s.fps), p95: avg((s) => s.p95), long: avg((s) => s.long), total, cost, heapMB: (heap1 - heap0) / 1e6 });
    console.log(mode, speed, quality, screen, `fps ${rows.at(-1).fps.toFixed(0)} total ${total.toFixed(0)}ms/s`);
  }
  await ctx.close();
}
await browser.close();
vite.kill();

let md = '# Perf baseline\n\n| mode | speed | quality | screen | fps | p95 ms | long/s | ms/s total | heap Δ MB | top costs (ms/s) |\n|---|---|---|---|---|---|---|---|---|---|\n';
for (const r of rows) {
  const top = Object.entries(r.cost).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([l, v]) => `${l} ${v.toFixed(0)}`).join(', ');
  md += `| ${r.mode} | ${r.speed} | ${r.quality} | ${r.screen} | ${r.fps.toFixed(0)} | ${r.p95.toFixed(1)} | ${r.long.toFixed(1)} | ${r.total.toFixed(0)} | ${r.heapMB.toFixed(1)} | ${top} |\n`;
}
writeFileSync(out, md);
console.log('wrote', out);
