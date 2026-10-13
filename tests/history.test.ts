import { describe, expect, it } from 'vitest';
import { MAX_HISTORY_POINTS, compact, newHistory, normalizeHistory, recordSample } from '../src/core/history';
import { Game } from '../src/core/game';
import { createInitialState, normalizeState } from '../src/core/state';
import { exportSave, importSave } from '../src/core/save';
import { mulberry32 } from '../src/core/rng';
import { TABLES, TABLE_IDS } from '../src/tables';

describe('history series', () => {
  it('stays bounded and keeps first and last points', () => {
    const h = newHistory();
    for (let i = 1; i <= 5000; i++) recordSample(h, i, i * 2);
    expect(h.points.length).toBeLessThanOrEqual(MAX_HISTORY_POINTS);
    expect(h.points[0]).toEqual([0, 0]);
    const last = h.points[h.points.length - 1];
    expect(last[0]).toBeGreaterThan(4000);
    expect(last[1]).toBe(last[0] * 2);
    expect(h.step).toBeGreaterThan(1);
  });

  it('compact keeps the newest point', () => {
    const h = newHistory();
    h.points = [[0, 0], [1, 1], [2, 2]];
    compact(h);
    expect(h.points[h.points.length - 1]).toEqual([2, 2]);
  });

  it('seeds old saves and rejects junk', () => {
    expect(normalizeHistory(undefined, 10, 55).points).toEqual([[10, 55]]);
    expect(normalizeHistory({ points: [['x', 1], [3, NaN], [5, 2]] }, 0, 0).points).toEqual([[5, 2]]);
    const s = createInitialState(0);
    const raw: any = JSON.parse(JSON.stringify(s));
    delete raw.tables.coinflip.history;
    expect(normalizeState(raw).tables.coinflip.history.points.length).toBeGreaterThan(0);
  });
});

describe('game integration', () => {
  it('records plays, prestige marks and survives export/import', () => {
    const state = createInitialState(0);
    state.tables.coinflip.wallet = 1e9;
    const g = new Game(state, mulberry32(5));
    for (let i = 0; i < 30; i++) g.play('coinflip');
    const ts = g.table('coinflip');
    expect(ts.history.points[ts.history.points.length - 1]).toEqual([30, ts.lifetimeProfit]);
    ts.profit = 1e9;
    expect(g.prestige('coinflip')).toBe(true);
    expect(ts.history.marks).toEqual([30]);
    const back = importSave(exportSave(g.state));
    expect(back.tables.coinflip.history).toEqual(ts.history);
  });
});

describe('play views', () => {
  it('describe the round consistently', () => {
    const rng = mulberry32(11);
    for (const id of TABLE_IDS) {
      const def = TABLES[id];
      for (let i = 0; i < 300; i++) {
        const r = def.play(rng, {});
        expect(r.view).toBeDefined();
        const v = r.view!;
        if (v.kind === 'coin') expect(r.detail.includes('Heads')).toBe(v.heads);
        if (v.kind === 'slots') {
          expect(v.reels).toHaveLength(3);
          if (v.reels[0] === v.reels[1] && v.reels[1] === v.reels[2]) expect(r.mult).toBeGreaterThan(1);
        }
        if (v.kind === 'roulette') expect(r.detail).toContain(String(v.pocket));
        if (v.kind === 'blackjack') {
          expect(v.player.length).toBeGreaterThanOrEqual(2);
          if (v.outcome === 'win' || v.outcome === 'natural') expect(r.mult).toBeGreaterThan(1);
          if (v.outcome === 'lose') expect(r.mult).toBe(0);
        }
      }
    }
  });
});

describe('income series', () => {
  it('samples currency per second over time and survives export/import', () => {
    const state = createInitialState(0);
    state.tables.coinflip.wallet = 1e6;
    const g = new Game(state, mulberry32(5));
    for (let i = 0; i < 300; i++) g.tick(0.1);
    const ts = g.table('coinflip');
    const pts = ts.history.rate.points;
    expect(pts.length).toBeGreaterThan(3);
    expect(ts.history.clock).toBeCloseTo(30, 5);
    // 1 play/sec at a 1-coin bet: income per second can't exceed the payout cap per play.
    for (const [, v] of pts) expect(Math.abs(v)).toBeLessThanOrEqual(250);
    expect(importSave(exportSave(g.state)).tables.coinflip.history.rate).toEqual(ts.history.rate);
  });
});
