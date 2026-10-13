import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/game';
import { createInitialState } from '../src/core/state';
import { mulberry32 } from '../src/core/rng';
import { allUpgrades, bulkPurchase, upgradeCost } from '../src/core/economy';

const game = () => new Game(createInitialState(0), mulberry32(1));

describe('bulkPurchase', () => {
  const cost = (l: number) => 10 * 2 ** l; // 10, 20, 40, 80
  it('buys while affordable, exact budget included', () => {
    expect(bulkPurchase(cost, 0, 10, 70, Infinity)).toEqual({ count: 3, cost: 70 });
    expect(bulkPurchase(cost, 0, 10, 69, Infinity)).toEqual({ count: 2, cost: 30 });
  });
  it('buys nothing when too poor', () => {
    expect(bulkPurchase(cost, 0, 10, 9, Infinity)).toEqual({ count: 0, cost: 0 });
  });
  it('respects cap and max level', () => {
    expect(bulkPurchase(cost, 0, 10, 1e9, 4).count).toBe(4);
    expect(bulkPurchase(cost, 2, 5, 1e9, Infinity).count).toBe(3);
  });
});

describe('bulk buying', () => {
  it('Max charges the sum of the per-level costs', () => {
    const g = game();
    g.table('coinflip').wallet = 5000;
    const def = g.def('coinflip');
    const luck = allUpgrades(def).find((u) => u.id === 'luck')!;
    const q = g.quoteUpgrade('coinflip', 'luck', { cap: Infinity, fraction: 1 });
    let sum = 0;
    for (let l = 0; l < q.count; l++) sum += upgradeCost(def, luck, 0, l);
    expect(q.count).toBeGreaterThan(1);
    expect(q.cost).toBe(sum);
    expect(g.buyUpgrade('coinflip', 'luck', { cap: Infinity, fraction: 1 })).toBe(true);
    expect(g.upgradeLevel('coinflip', 'luck')).toBe(q.count);
    expect(g.table('coinflip').wallet).toBe(5000 - sum);
  });

  it('50% never spends more than half the wallet', () => {
    const g = game();
    g.table('coinflip').wallet = 5000;
    g.buyUpgrade('coinflip', 'luck', { cap: Infinity, fraction: 0.5 });
    expect(g.table('coinflip').wallet).toBeGreaterThanOrEqual(2500);
    expect(g.upgradeLevel('coinflip', 'luck')).toBeGreaterThan(0);
  });

  it('casino shop respects requirements', () => {
    const g = game();
    g.state.casino.chips = 1000;
    const q = g.quoteCasinoUpgrade('overtime', { cap: Infinity, fraction: 1 });
    expect(q.locked).toBe(true);
    expect(g.buyCasinoUpgrade('overtime', { cap: Infinity, fraction: 1 })).toBe(false);
  });
});
