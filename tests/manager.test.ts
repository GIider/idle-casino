import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/game';
import { createInitialState, normalizeState } from '../src/core/state';
import { mulberry32 } from '../src/core/rng';
import { TABLES } from '../src/tables';
import { allUpgrades, cashbackFraction, nextStreak, resolvePlay, streakMultiplier, upgradeCost } from '../src/core/economy';
import { casinoBonus, ascensionMultiplier, ASCENSION_WINNINGS_BONUS, managerInterval } from '../src/core/casino';
import { ACHIEVEMENTS, observeRound } from '../src/core/achievements';
import type { PlayView } from '../src/core/types';
import type { Outcome } from '../src/core/economy';

const newGame = () => new Game(createInitialState(0), mulberry32(3));

describe('Bulk Orders', () => {
  it('gates Buy cheapest behind the shop upgrade', () => {
    const g = newGame();
    g.table('coinflip').wallet = 1e6;
    expect(g.canBuyCheapest('coinflip')).toBe(false);
    expect(g.buyCheapest('coinflip')).toBe(0);
    g.state.casino.levels.bulkbuy = 1;
    expect(g.canBuyCheapest('coinflip')).toBe(true);
    expect(g.buyCheapest('coinflip')).toBeGreaterThan(0);
  });
});

describe('Floor Manager', () => {
  it('does nothing without the shop upgrade', () => {
    const g = newGame();
    g.table('coinflip').wallet = 1e6;
    g.tick(60);
    expect(g.table('coinflip').levels).toEqual({});
  });

  it('buys the cheapest affordable upgrade on its interval and keeps a bet reserve', () => {
    const g = newGame();
    g.state.casino.levels.manager = 1;
    const ts = g.table('coinflip');
    ts.wallet = 1e6;
    expect(managerInterval(1)).toBe(10);
    expect(managerInterval(1, 1)).toBe(5);
    expect(managerInterval(1, 2)).toBe(2);
    g.tick(9);
    expect(Object.keys(ts.levels)).toHaveLength(0);
    g.tick(1.5);
    const bought = Object.keys(ts.levels);
    expect(bought).toHaveLength(1);
    const cheapest = allUpgrades(TABLES.coinflip).reduce((a, b) =>
      upgradeCost(TABLES.coinflip, a, 0, 0) <= upgradeCost(TABLES.coinflip, b, 0, 0) ? a : b,
    );
    expect(bought[0]).toBe(cheapest.id);
    // Wallet too small to keep the reserve: nothing is bought.
    const poor = newGame();
    poor.state.casino.levels.manager = 1;
    poor.table('coinflip').wallet = 22;
    expect(poor.autoBuy('coinflip')).toBe(false);
  });

  it('buys core upgrades before niche ones even when a niche upgrade is cheaper', () => {
    const g = newGame();
    g.state.casino.levels.manager = 1;
    g.table('blackjack').unlocked = true;
    const ts = g.table('blackjack');
    ts.wallet = 1e9;
    // Pretend every core upgrade is maxed except luck, which costs more than a niche upgrade here.
    for (const u of allUpgrades(TABLES.blackjack)) ts.levels[u.id] = u.maxLevel;
    ts.levels.luck = 0;
    ts.levels.sleeve = 0;
    expect(upgradeCost(TABLES.blackjack, allUpgrades(TABLES.blackjack).find((u) => u.id === 'luck')!, 0, 0)).toBeGreaterThan(0);
    g.autoBuy('blackjack');
    expect(ts.levels.luck).toBe(1);
    expect(ts.levels.sleeve).toBe(0);
  });

  it('auto-prestiges only with Concierge when enabled', () => {
    const g = newGame();
    const ts = g.table('coinflip');
    for (const u of allUpgrades(TABLES.coinflip)) ts.levels[u.id] = u.maxLevel;
    ts.wallet = 1e9;
    ts.profit = 1e12;
    g.state.casino.levels.manager = 1;
    g.setAutoPrestige(true);
    expect(g.state.casino.autoPrestige).toBe(false);
    g.tick(5);
    expect(ts.prestige).toBe(0);
    g.state.casino.levels.concierge = 1;
    g.state.casino.levels.overtime = 2;
    g.setAutoPrestige(true);
    g.tick(3);
    expect(ts.prestige).toBe(1);
  });

  it('normalizes saved manager settings', () => {
    const g = newGame();
    g.state.casino.autoPrestige = true;
    const raw = JSON.parse(JSON.stringify(g.state));
    const back = normalizeState(raw);
    expect(back.casino.autoPrestige).toBe(true);
  });
});

describe('ascension multiplier', () => {
  it('compounds per ascension without any shop purchase', () => {
    const g = newGame();
    expect(g.bonus.payout).toBe(1);
    g.state.casino.ascensions = 3;
    expect(g.bonus.payout).toBeCloseTo(ASCENSION_WINNINGS_BONUS ** 3);
    expect(casinoBonus(g.state.casino).payout).toBeCloseTo(ascensionMultiplier(3));
  });
});

describe('mechanic upgrades', () => {
  it('hot streak stacks to a cap and resets on a loss', () => {
    expect(streakMultiplier({ streak: 2 }, 4)).toBeCloseTo(1.24);
    expect(streakMultiplier({ streak: 2 }, 50)).toBeCloseTo(1.6);
    expect(streakMultiplier({}, 5)).toBe(1);
    expect(nextStreak(3, 10)).toBe(4);
    expect(nextStreak(3, 0)).toBe(3);
    expect(nextStreak(3, -1)).toBe(0);
  });

  it('cashback refunds part of a loss but never makes it a win', () => {
    const def = TABLES.coinflip;
    expect(cashbackFraction({ cashback: 2 })).toBeCloseTo(0.12);
    // A rigged rng that always lands tails.
    const tails = () => 0.99;
    const plain = resolvePlay(def, {}, 0, 100, tails);
    const back = resolvePlay(def, { cashback: 8 }, 0, 100, tails);
    expect(plain.net).toBe(-100);
    expect(back.net).toBe(-52);
  });

  it('second dealer plays extra rounds without exceeding the bound', () => {
    const g = newGame();
    g.table('coinflip').wallet = 1e9;
    g.table('coinflip').levels.dealer = 6;
    g.tick(1);
    expect(g.table('coinflip').plays).toBeGreaterThanOrEqual(1);
    expect(g.table('coinflip').plays).toBeLessThanOrEqual(11);
  });
});

describe('blackjack card-count achievements', () => {
  const view = (n: number, outcome: 'win' | 'natural' | 'lose' | 'bust' | 'push'): PlayView => ({
    kind: 'blackjack',
    player: Array.from({ length: n }, () => 2),
    dealer: [10, 7],
    outcome,
    insured: false,
  });
  const out = (v: PlayView): Outcome => ({ bet: 1, payout: 0, net: 0, detail: '', view: v, rerolled: false, capped: false });

  it('counts wins and dealer losses by player card count', () => {
    const ach: Record<string, { count: number; run: number; best: number; tier: number }> = {};
    for (const a of ACHIEVEMENTS) ach[a.id] = { count: 0, run: 0, best: 0, tier: 0 };
    observeRound(ach, 'blackjack', out(view(2, 'natural')));
    observeRound(ach, 'blackjack', out(view(3, 'win')));
    observeRound(ach, 'blackjack', out(view(3, 'lose')));
    observeRound(ach, 'blackjack', out(view(4, 'bust')));
    observeRound(ach, 'blackjack', out(view(2, 'push')));
    expect(ach.winCards2.count).toBe(1);
    expect(ach.winCards3.count).toBe(1);
    expect(ach.loseCards3.count).toBe(1);
    expect(ach.loseCards4.count).toBe(0);
    expect(ach.winCards4.count).toBe(0);
  });
});

describe('manager purchase log', () => {
  it('logs manager buys but not manual or offline purchases', () => {
    const g = newGame();
    const ts = g.state.tables.coinflip;
    ts.wallet = 1e9;
    g.buyUpgrade('coinflip', allUpgrades(TABLES.coinflip)[0].id);
    expect(g.managerLog).toHaveLength(0);
    expect(g.autoBuy('coinflip')).toBe(true);
    expect(g.managerLog).toHaveLength(1);
    expect(g.managerLog[0].text).toContain('Floor Manager bought');
    for (let i = 0; i < 40; i++) g.autoBuy('coinflip');
    expect(g.managerLog.length).toBeLessThanOrEqual(20);
  });
});
