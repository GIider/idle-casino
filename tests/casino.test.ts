import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/game';
import { SAVE_VERSION, START_MONEY, createInitialState, normalizeState } from '../src/core/state';
import { mulberry32 } from '../src/core/rng';
import { TABLES } from '../src/tables';
import {
  AUTO_BET_FRACTIONS,
  UPGRADE_PRESTIGE_GROWTH,
  allUpgrades,
  autoBetFraction,
  chooseAutoBet,
  upgradeCost,
} from '../src/core/economy';
import { ascensionReward, ascensionThreshold } from '../src/core/casino';
import { exportSave, importSave } from '../src/core/save';
import { newHistory, normalizeHistory, recordView } from '../src/core/history';

const newGame = () => new Game(createInitialState(0), mulberry32(5));

describe('auto bet upgrade', () => {
  it('starts at the minimum bet and never reaches 100%', () => {
    const g = newGame();
    g.table('coinflip').wallet = 10000;
    const ts = g.table('coinflip');
    expect(chooseAutoBet(TABLES.coinflip, ts)).toBe(1);
    expect(Math.max(...AUTO_BET_FRACTIONS)).toBeLessThan(1);
    ts.levels.autobet = 4;
    expect(autoBetFraction(ts.levels)).toBe(AUTO_BET_FRACTIONS[4]);
    // Clamped to the table's max bet.
    ts.wallet = 1e6;
    expect(chooseAutoBet(TABLES.coinflip, ts)).toBe(25);
    ts.levels.autobet = 999;
    expect(autoBetFraction(ts.levels)).toBe(AUTO_BET_FRACTIONS[AUTO_BET_FRACTIONS.length - 1]);
  });

  it('is a buyable common upgrade', () => {
    const g = newGame();
    g.table('coinflip').wallet = 1000;
    expect(allUpgrades(TABLES.coinflip).some((u) => u.id === 'autobet')).toBe(true);
    expect(g.buyUpgrade('coinflip', 'autobet')).toBe(true);
    expect(g.upgradeLevel('coinflip', 'autobet')).toBe(1);
  });
});

describe('prestige upgrade cost', () => {
  it('multiplies by UPGRADE_PRESTIGE_GROWTH per prestige level', () => {
    const upg = allUpgrades(TABLES.coinflip)[0];
    const c0 = upgradeCost(TABLES.coinflip, upg, 0, 0);
    const c2 = upgradeCost(TABLES.coinflip, upg, 2, 0);
    expect(c2 / c0).toBeCloseTo(UPGRADE_PRESTIGE_GROWTH ** 2, 0);
  });
});

describe('game-specific history stats', () => {
  it('tallies coin flips with streaks and a bounded recent list', () => {
    const h = newHistory();
    for (const heads of [true, true, true, false, true]) recordView(h, { kind: 'coin', heads });
    expect(h.stats.coin).toMatchObject({ heads: 4, tails: 1, streak: 1, longest: 3 });
    for (let i = 0; i < 200; i++) recordView(h, { kind: 'coin', heads: i % 2 === 0 });
    expect(h.stats.coin.recent.length).toBe(60);
  });

  it('tallies slots, roulette and blackjack', () => {
    const h = newHistory();
    recordView(h, { kind: 'slots', reels: [1, 1, 1] });
    recordView(h, { kind: 'slots', reels: [0, 0, 3] });
    recordView(h, { kind: 'roulette', pocket: 17, bets: ['color'] });
    recordView(h, { kind: 'blackjack', player: [], dealer: [], outcome: 'bust', insured: false });
    expect(h.stats.slots).toMatchObject({ rounds: 2, triples: 1, pairs: 1 });
    expect(h.stats.slots.symbols[1]).toBe(3);
    expect(h.stats.roulette.pockets[17]).toBe(1);
    expect(h.stats.blackjack.bust).toBe(1);
  });

  it('records through Game.play and survives garbage in saves', () => {
    const g = newGame();
    for (let i = 0; i < 20; i++) g.play('coinflip');
    const c = g.table('coinflip').history.stats.coin;
    expect(c.heads + c.tails).toBe(20);
    const bad = normalizeHistory({ points: [[1, 1]], stats: { coin: { heads: -5, recent: [7, 'x', 1] }, slots: { symbols: 'no' } } }, 1, 1);
    expect(bad.stats.coin.heads).toBe(0);
    expect(bad.stats.coin.recent).toEqual([1]);
    expect(bad.stats.slots.symbols.length).toBe(6);
  });
});

describe('ascension', () => {
  it('requires the threshold and pays at least one chip', () => {
    const g = newGame();
    expect(g.canAscend()).toBe(false);
    expect(g.ascend()).toBe(false);
    expect(ascensionReward(ascensionThreshold(0) - 1, 0)).toBe(0);
    g.table('coinflip').wallet = 1e15;
    expect(g.canAscend()).toBe(false);
    g.table('blackjack').wallet = ascensionThreshold(0);
    expect(g.ascendReward()).toBe(1);
    expect(ascensionReward(ascensionThreshold(0) * 100, 0)).toBe(7);
  });

  it('resets tables and money but keeps chips, shop levels and raises the bar', () => {
    const g = newGame();
    g.state.tables.coinflip.prestige = 3;
    g.state.tables.coinflip.levels.speed = 5;
    g.state.tables.slots.unlocked = true;
    for (let i = 0; i < 5; i++) g.play('coinflip');
    g.table('blackjack').wallet = ascensionThreshold(0) * 10;
    expect(g.ascend()).toBe(true);
    expect(g.table('coinflip').wallet).toBe(START_MONEY);
    expect(g.table('blackjack').wallet).toBe(0);
    expect(g.table('coinflip').prestige).toBe(0);
    expect(g.table('coinflip').levels).toEqual({});
    expect(g.table('coinflip').plays).toBe(0);
    expect(g.table('coinflip').history.points).toEqual([[0, 0]]);
    expect(g.table('slots').unlocked).toBe(false);
    expect(g.state.casino.chips).toBe(4);
    expect(g.state.casino.ascensions).toBe(1);
    expect(g.canAscend()).toBe(false);
  });

  it('shop upgrades cost chips', () => {
    const g = newGame();
    expect(g.buyCasinoUpgrade('manager')).toBe(false);
    g.state.casino.chips = 100;
    expect(g.buyCasinoUpgrade('manager')).toBe(true);
    expect(g.buyCasinoUpgrade('nope')).toBe(false);
    expect(g.state.casino.chips).toBe(99);
    expect(g.casinoLevel('manager')).toBe(1);
  });

  it('gated upgrades need their prerequisite', () => {
    const g = newGame();
    g.state.casino.chips = 100;
    expect(g.buyCasinoUpgrade('overtime')).toBe(false);
    expect(g.buyCasinoUpgrade('manager')).toBe(true);
    expect(g.buyCasinoUpgrade('overtime')).toBe(true);
  });

  it('migrates pre-rebalance shop levels and refunds removed items', () => {
    const raw = JSON.parse(JSON.stringify(newGame().state));
    raw.casino = { chips: 2, totalChips: 50, ascensions: 1, levels: { manager: 4, luck: 2, payout: 3, startCash: 1, policy: 1 }, autoPrestige: true };
    const s = normalizeState(raw);
    const lv = s.casino.levels;
    expect([lv.manager, lv.overtime, lv.concierge, lv.payout, lv.policy]).toEqual([1, 2, 1, undefined, undefined]);
    // luck 2 = 3 + 6, startCash 1 = 1, policy 1 = 5, payout 3 = 2 + 4 + 6 chips, plus the 2 on hand
    expect(s.casino.chips).toBe(2 + 9 + 1 + 5 + 12);
    expect(normalizeState(JSON.parse(JSON.stringify(s))).casino.chips).toBe(s.casino.chips);
  });

  it('round-trips and sanitizes casino state in saves', () => {
    const g = newGame();
    g.state.casino = { chips: 7, totalChips: 12, ascensions: 2, levels: { manager: 1, overtime: 9999 }, autoPrestige: false };
    const loaded = importSave(exportSave(g.state));
    expect(loaded.casino.chips).toBe(7);
    expect(loaded.casino.ascensions).toBe(2);
    expect(loaded.casino.levels.manager).toBe(1);
    expect(loaded.casino.levels.overtime).toBe(2);
    const junk = normalizeState({ version: SAVE_VERSION, tables: {}, casino: { chips: 'x', levels: 3 } });
    expect(junk.casino).toEqual({ chips: 0, totalChips: 0, ascensions: 0, levels: {}, autoPrestige: false });
    expect(normalizeState({ version: SAVE_VERSION, tables: {} }).casino.ascensions).toBe(0);
  });
});
