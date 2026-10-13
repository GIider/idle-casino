import { describe, expect, it } from 'vitest';
import { MAX_HISTORY_POINTS, compact, newHistory, normalizeHistory, recordSample } from '../src/core/history';
import { Game } from '../src/core/game';
import { casinoValue, createInitialState, normalizeState } from '../src/core/state';
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
        const opt = def.options?.[i % def.options.length].id ?? '';
        const r = def.play(rng, {}, opt);
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

describe('bankroll history', () => {
  it('samples plays, stays bounded and round-trips through export/import', () => {
    const game = new Game(createInitialState(0), mulberry32(5));
    for (let i = 0; i < 3000; i++) game.play('coinflip');
    const b = game.state.bankroll;
    expect(b.rounds).toBe(3000);
    expect(b.points.length).toBeLessThanOrEqual(MAX_HISTORY_POINTS);
    expect(b.points[0]).toEqual([0, 100]);
    const copy = importSave(exportSave(game.state));
    expect(copy.bankroll.rounds).toBe(3000);
    expect(copy.bankroll.points).toEqual(b.points);
  });

  it('keeps the series across ascension and marks it', () => {
    const game = new Game(createInitialState(0), mulberry32(5));
    for (let i = 0; i < 20; i++) game.play('coinflip');
    game.state.tables.blackjack.wallet = 1e12;
    const before = game.state.bankroll.points.length;
    expect(game.ascend()).toBe(true);
    const b = game.state.bankroll;
    expect(b.marks).toEqual([20]);
    expect(b.points.length).toBeGreaterThanOrEqual(before);
    expect(b.points[b.points.length - 1][1]).toBe(casinoValue(game.state.tables));
  });

  it('seeds old saves and rejects junk', () => {
    const raw: any = JSON.parse(JSON.stringify(createInitialState(0)));
    delete raw.bankroll;
    raw.tables.coinflip.wallet = 777;
    expect(normalizeState(raw).bankroll.points).toEqual([[0, 777]]);
    raw.bankroll = { points: [['x', 1], [2, NaN], [-1, 5], [4, 9]], rounds: 'nope' };
    const b = normalizeState(raw).bankroll;
    expect(b.points).toEqual([[4, 9]]);
    expect(b.rounds).toBe(4);
  });
});

describe('per-game bankroll contribution', () => {
  it('credits each table with its own net winnings and keeps them across ascension', () => {
    const game = new Game(createInitialState(0), mulberry32(8));
    game.state.tables.slots.unlocked = true;
    game.state.tables.coinflip.wallet = 1e6;
    game.state.tables.slots.wallet = 1e6;
    let coin = 0;
    let slots = 0;
    for (let i = 0; i < 40; i++) coin += game.play('coinflip', 1)!.net;
    for (let i = 0; i < 40; i++) slots += game.play('slots', 5)!.net;
    const b = game.state.bankroll;
    expect(b.net.coinflip).toBe(coin);
    expect(b.net.slots).toBe(slots);
    expect(b.net.roulette).toBe(0);
    const last = (id: 'coinflip' | 'slots') => b.contrib[id].points[b.contrib[id].points.length - 1];
    expect(last('coinflip')).toEqual([80, coin]);
    expect(last('slots')).toEqual([80, slots]);

    game.state.tables.blackjack.wallet = 1e12;
    expect(game.ascend()).toBe(true);
    expect(game.state.bankroll.net.coinflip).toBe(coin);
    expect(game.state.tables.coinflip.lifetimeProfit).toBe(0);
  });

  it('counts offline winnings and round-trips through a save', () => {
    const game = new Game(createInitialState(0), mulberry32(8));
    game.state.tables.coinflip.levels.auto = 5;
    const report = game.applyOffline(3600);
    expect(game.state.bankroll.net.coinflip).toBe(report.net);
    const copy = importSave(exportSave(game.state));
    expect(copy.bankroll.net.coinflip).toBe(report.net);
    expect(copy.bankroll.contrib.coinflip.points).toEqual(game.state.bankroll.contrib.coinflip.points);
  });

  it('seeds old saves from table profit and rejects junk', () => {
    const s = createInitialState(0);
    s.tables.slots.lifetimeProfit = 1234;
    s.bankroll.rounds = 50;
    const raw: any = JSON.parse(JSON.stringify(s));
    delete raw.bankroll.net;
    delete raw.bankroll.contrib;
    const loaded = normalizeState(raw);
    expect(loaded.bankroll.net.slots).toBe(1234);
    expect(loaded.bankroll.contrib.slots.points).toEqual([[loaded.bankroll.rounds, 1234]]);
    raw.bankroll.net = { coinflip: 'x', slots: NaN };
    raw.bankroll.contrib = { coinflip: { points: [['a', 1]] }, slots: 7 };
    const junk = normalizeState(raw);
    expect(junk.bankroll.net.coinflip).toBe(0);
    expect(junk.bankroll.net.slots).toBe(1234);
  });
});

