import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/game';
import { SAVE_VERSION, createInitialState, normalizeState } from '../src/core/state';
import { exportSave, importSave, loadGame, saveGame } from '../src/core/save';
import { mulberry32 } from '../src/core/rng';
import { STARTER_BETS, prestigeWallet } from '../src/core/state';
import { prestigeThreshold, minBet, upgradeCost, allUpgrades } from '../src/core/economy';
import { TABLES, TABLE_IDS } from '../src/tables';

function game() {
  return new Game(createInitialState(0), mulberry32(1));
}

describe('Game', () => {
  it('plays a round and updates bankroll accounting', () => {
    const g = game();
    const before = g.table('coinflip').wallet;
    const o = g.play('coinflip')!;
    expect(g.table('coinflip').wallet).toBe(before + o.net);
    expect(g.table('coinflip').plays).toBe(1);
    expect(g.table('coinflip').profit).toBe(o.net);
  });

  it('refuses locked tables and unaffordable bets', () => {
    const g = game();
    expect(g.play('slots')).toBeNull();
    g.table('coinflip').wallet = 0;
    expect(g.play('coinflip')).toBeNull();
  });

  it('buys upgrades with geometric cost and respects max level', () => {
    const g = game();
    g.table('coinflip').wallet = 1e9;
    const def = g.def('coinflip');
    const luck = allUpgrades(def).find((u) => u.id === 'luck')!;
    const c0 = upgradeCost(def, luck, 0, 0);
    expect(g.buyUpgrade('coinflip', 'luck')).toBe(true);
    expect(g.table('coinflip').wallet).toBe(1e9 - c0);
    for (let i = 0; i < 40; i++) g.buyUpgrade('coinflip', 'luck');
    expect(g.upgradeLevel('coinflip', 'luck')).toBe(luck.maxLevel);
  });

  it('unlocks a table with the previous table\'s currency and gives it a starter wallet', () => {
    const g = game();
    const cost = g.def('slots').unlockCost;
    expect(g.unlock('slots')).toBe(false);
    g.table('coinflip').wallet = cost - 1;
    expect(g.canUnlock('slots')).toBe(false);
    g.table('coinflip').wallet = cost + 7;
    expect(g.unlock('slots')).toBe(true);
    expect(g.table('coinflip').wallet).toBe(7);
    expect(g.table('slots').wallet).toBe(g.def('slots').baseMinBet * STARTER_BETS);
  });

  it('only the previous table can pay for an unlock', () => {
    const g = game();
    g.table('coinflip').wallet = 1e12;
    g.table('slots').wallet = 0;
    // Roulette is paid in Tokens, and Slots isn't even open yet.
    expect(g.canUnlock('roulette')).toBe(false);
    expect(g.unlock('roulette')).toBe(false);
    g.unlock('slots');
    g.table('slots').wallet = g.def('roulette').unlockCost;
    expect(g.unlock('roulette')).toBe(true);
    expect(g.table('coinflip').wallet).toBeGreaterThan(1e11);
  });

  it('prestige at one table boosts winnings at the next', () => {
    const g = game();
    expect(g.bonusFor('slots').payout).toBe(1);
    g.table('coinflip').prestige = 5;
    expect(g.bonusFor('slots').payout).toBeCloseTo(1.2);
    expect(g.bonusFor('coinflip').payout).toBe(1);
    expect(g.bonusFor('roulette').payout).toBe(1);
  });

  it('keeps each table\'s money separate', () => {
    const g = game();
    g.table('coinflip').wallet = 1e12;
    g.unlock('slots');
    const slotsWallet = g.table('slots').wallet;
    // Coin Flip's riches can't fund a Slots upgrade or stake.
    g.table('slots').wallet = 0;
    expect(g.buyUpgrade('slots', 'luck')).toBe(false);
    expect(g.play('slots')).toBeNull();
    expect(g.table('coinflip').wallet).toBe(1e12 - g.def('slots').unlockCost);
    g.table('slots').wallet = slotsWallet;
    const before = g.table('coinflip').wallet;
    g.table('slots').levels.speed = 2;
    g.tick(3);
    expect(g.table('slots').plays).toBeGreaterThan(0);
    expect(g.table('coinflip').wallet).toBe(before + g.sessionNet.coinflip);
  });

  it('an unlocked table plays on tick with no purchases, faster with speed', () => {
    const g = game();
    g.table('coinflip').wallet = 10000;
    g.tick(5);
    expect(g.table('coinflip').plays).toBe(5);
    g.state.tables.coinflip.levels.speed = 2;
    g.tick(5);
    expect(g.table('coinflip').plays).toBe(5 + 10);
  });

  it('bails out a broke table without touching the others', () => {
    const g = game();
    g.table('coinflip').wallet = 0;
    g.tick(0.1);
    expect(g.table('coinflip').wallet).toBeGreaterThan(0);
    expect(g.table('slots').wallet).toBe(0);
  });

  it('prestige resets upgrades and raises stakes', () => {
    const g = game();
    const def = g.def('coinflip');
    const ts = g.table('coinflip');
    ts.levels = { luck: 5, speed: 3 };
    expect(g.prestige('coinflip')).toBe(false);
    ts.profit = prestigeThreshold(def, 0);
    g.table('coinflip').wallet = 12345;
    expect(g.prestige('coinflip')).toBe(true);
    expect(g.table('coinflip').wallet).toBe(prestigeWallet(def, 1));
    expect(g.table('coinflip').wallet).toBeGreaterThanOrEqual(minBet(def, 1) * 10);
    expect(ts.prestige).toBe(1);
    expect(ts.levels).toEqual({});
    expect(ts.profit).toBe(0);
    expect(minBet(def, 1)).toBeGreaterThan(minBet(def, 0));
  });

  it('applies offline progress with a cap', () => {
    const g = game();
    g.table('coinflip').wallet = 1000;
    g.state.tables.coinflip.levels.speed = 2;
    const r = g.applyOffline(10 * 3600);
    expect(r.plays).toBe(Math.floor(2 * 8 * 3600 * 0.5));
    expect(g.table('coinflip').wallet).toBeGreaterThan(0);
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
    s.tables.coinflip.wallet = 777;
    s.tables.slots.wallet = 55;
    s.tables.slots.unlocked = true;
    s.tables.slots.levels.loaded = 3;
    expect(saveGame(s, store)).toBe(true);
    const loaded = loadGame(store)!;
    expect(loaded.tables.coinflip.wallet).toBe(777);
    expect(loaded.tables.slots.wallet).toBe(55);
    expect(loaded.tables.slots.levels.loaded).toBe(3);
    expect(importSave(exportSave(s)).tables.coinflip.wallet).toBe(777);
  });

  it('rejects garbage and sanitizes odd values', () => {
    expect(() => importSave('nope')).toThrow();
    expect(() => normalizeState({ money: 'x' })).toThrow();
    const s = normalizeState({
      version: SAVE_VERSION,
      tables: { coinflip: { wallet: 5.7, levels: { luck: -3, auto: 2.9, speed: 999 } } },
    });
    expect(s.tables.coinflip.wallet).toBe(5);
    expect(s.tables.coinflip.levels.luck).toBeUndefined();
    expect(s.tables.coinflip.levels.auto).toBeUndefined();
    expect(s.tables.coinflip.levels.speed).toBe(20);
    expect(s.tables.slots.unlocked).toBe(false);
  });

  it('refuses saves from before per-table wallets', () => {
    const old = { version: 2, money: 5000, tables: { coinflip: { levels: {} } } };
    expect(() => normalizeState(old)).toThrow(/older version/);
    expect(loadGame({ getItem: () => JSON.stringify(old), setItem() {}, removeItem() {} })).toBeNull();
  });
});

describe('dev unlock', () => {
  it('unlocks every table and maxes upgrades without touching meta progress', () => {
    const g = game();
    g.devUnlockAll();
    for (const id of TABLE_IDS) {
      const ts = g.table(id);
      expect(ts.unlocked).toBe(true);
      expect(ts.wallet).toBeGreaterThan(0);
      for (const u of allUpgrades(TABLES[id])) expect(ts.levels[u.id]).toBe(u.maxLevel);
      expect(ts.prestige).toBe(0);
    }
    expect(g.state.casino.chips).toBe(0);
    expect(g.state.casino.ascensions).toBe(0);
  });
});
