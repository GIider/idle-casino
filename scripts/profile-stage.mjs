// Usage: node scripts/profile-stage.mjs <tab title prefix> [seconds]: CPU profile of one screen at max speed (dev mode).
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const screen = process.argv[2] ?? 'Blackjack';
const secs = Number(process.argv[3] ?? 5);
const vite = spawn('npx', ['vite', '--port', '5198', '--strictPort'], { stdio: 'ignore' });
for (let i = 0; i < 60; i++) { try { await fetch('http://localhost:5198/'); break; } catch { await new Promise((r) => setTimeout(r, 500)); } }
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto('http://localhost:5198/?perf=1&quality=high&cardcounting=1');
await page.waitForFunction(() => window.__game);
await page.evaluate(() => { const g = window.__game; g.devUnlockAll(); g.state.casino.levels.bulkbuy = 1; g.state.casino.levels.concierge = 0; for (const id of Object.keys(g.state.tables)) { g.state.tables[id].wallet = 1e30; g.buyCheapest(id); g.state.tables[id].wallet = 1e30; } });
await page.evaluate((s) => [...document.querySelectorAll('.tab')].find((e) => (e.title || '').startsWith(s))?.click(), screen);
await page.waitForTimeout(2000);
const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.start');
await page.waitForTimeout(secs * 1000);
const { profile } = await cdp.send('Profiler.stop');
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map();
const dt = profile.timeDeltas;
profile.samples.forEach((id, i) => self.set(id, (self.get(id) ?? 0) + dt[i]));
const agg = new Map();
for (const [id, t] of self) { const f = byId.get(id).callFrame; const k = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber}`; agg.set(k, (agg.get(k) ?? 0) + t); }
const total = [...agg.values()].reduce((a, c) => a + c, 0);
for (const [k, t] of [...agg].sort((a, c) => c[1] - a[1]).slice(0, 18)) console.log(`${(t / 1000).toFixed(0).padStart(6)}ms ${(100 * t / total).toFixed(1).padStart(5)}%  ${k}`);
await b.close(); vite.kill();
