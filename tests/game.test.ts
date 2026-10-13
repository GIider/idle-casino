import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/game';
import { createInitialState, normalizeState } from '../src/core/state';
import { exportSave, importSave, loadGame, saveGame } from '../src/core/save';
import { mulberry32 } from '../src/core/rng';
import { prestigeThreshold, minBet, upgradeCost, allUpgrades } from '../src/core/economy';

function game() {
  return new Game(createInitialState(0), mulberry32(1));
}

describe('Game', () => {
  it('plays a round and updates bankroll accounting', () => {
    const g = game();
    const before = g.state.money;
    const o = g.play('coinflip', 5)!;
    expect(g.state.money).toBe(before + o.net);
    expect(g.table('coinflip').plays).toBe(1);
    expect(g.table('coinflip').profit).toBe(o.net);
  });

  it('refuses locked tables and unaffordable bets', () => {
    const g = game();
    expect(g.play('slots')).toBeNull();
    g.state.money = 0;
    expect(g.play('coinflip', 5)).toBeNull();
  });

  it('buys upgrades with geometric cost and respects max level', () => {
    const g = game();
    g.state.money = 1e9;
    const def = g.def('coinflip');
    const luck = allUpgrades(def).find((u) => u.id === 'luck')!;
    const c0 = upgradeCost(def, luck, 0, 0);
    expect(g.buyUpgrade('coinflip', 'luck')).toBe(true);
    expect(g.state.money).toBe(1e9 - c0);
    for (let i = 0; i < 40; i++) g.buyUpgrade('coinflip', 'luck');
    expect(g.upgradeLevel('coinflip', 'luck')).toBe(luck.maxLevel);
  });

  it('unlocks tables for their price', () => {
    const g = game();
    expect(g.unlock('slots')).toBe(false);
    g.state.money = 10000;
    g.state.money = 2500;
    expect(g.unlock('slots')).toBe(true);
    expect(g.state.money).toBe(0);
  });

  it('auto-players play on tick', () => {
    const g = game();
    g.state.money = 10000;
    g.state.tables.coinflip.levels.auto = 4;
    g.tick(5);
    expect(g.table('coinflip').plays).toBe(20);
  });

  it('bails out a broke player', () => {
    const g = game();
    g.state.money = 0;
    g.tick(0.1);
    expect(g.state.money).toBeGreaterThan(0);
  });

  it('prestige resets upgrades and raises stakes', () => {
    const g = game();
    const def = g.def('coinflip');
    const ts = g.table('coinflip');
    ts.levels = { luck: 5, auto: 3 };
    expect(g.prestige('coinflip')).toBe(false);
    ts.profit = prestigeThreshold(def, 0);
    g.state.money = 12345;
    expect(g.prestige('coinflip')).toBe(true);
    expect(ts.prestige).toBe(1);
    expect(ts.levels).toEqual({});
    expect(ts.profit).toBe(0);
    expect(g.state.money).toBe(12345);
    expect(minBet(def, 1)).toBeGreaterThan(minBet(def, 0));
    expect(ts.bet).toBeGreaterThanOrEqual(minBet(def, 1));
  });

  it('applies offline progress with a cap', () => {
    const g = game();
    g.state.money = 1000;
    g.state.tables.coinflip.levels.auto = 5;
    const r = g.applyOffline(10 * 3600);
    expect(r.plays).toBe(Math.floor(5 * 1 * 8 * 3600 * 0.5));
    expect(g.state.money).toBeGreaterThan(0);
  });
});

describe('saves', () => {
  it('round-trips through storage and export', () => {
    const mem = new Map<string, string>();
    const store = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    };
    const s = createInitialState(0);
    s.money = 777;
    s.tables.slots.unlocked = true;
    s.tables.slots.levels.loaded = 3;
    expect(saveGame(s, store)).toBe(true);
    const loaded = loadGame(store)!;
    expect(loaded.money).toBe(777);
    expect(loaded.tables.slots.levels.loaded).toBe(3);
    expect(importSave(exportSave(s)).money).toBe(777);
  });

  it('rejects garbage and sanitizes odd values', () => {
    expect(() => importSave('nope')).toThrow();
    expect(() => normalizeState({ money: 'x' })).toThrow();
    const s = normalizeState({ money: 5.7, tables: { coinflip: { levels: { luck: -3, auto: 2.9 }, option: 'zz' } } });
    expect(s.money).toBe(5);
    expect(s.tables.coinflip.levels.luck).toBe(0);
    expect(s.tables.coinflip.levels.auto).toBe(2);
    expect(s.tables.slots.unlocked).toBe(false);
  });
});
