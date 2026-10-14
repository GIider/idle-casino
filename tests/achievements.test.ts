import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/game';
import { createInitialState, normalizeState } from '../src/core/state';
import { exportSave, importSave } from '../src/core/save';
import { mulberry32 } from '../src/core/rng';
import { allUpgrades, estimateNetPerPlay } from '../src/core/economy';
import { ACHIEVEMENTS, backfillAchievements, normalizeAchievements, observeRound, perkKey, perkLevels } from '../src/core/achievements';
import { TABLES, TABLE_IDS } from '../src/tables';
import type { PlayView } from '../src/core/types';
import type { Outcome } from '../src/core/economy';

const outcome = (view: PlayView, bet = 10, payout = 0): Outcome => ({
  bet,
  payout,
  net: payout - bet,
  detail: '',
  view,
  rerolled: false,
  capped: false,
});
const heads = (h: boolean): Outcome => outcome({ kind: 'coin', heads: h });

describe('achievements', () => {
  const target = (id: string) => ACHIEVEMENTS.find((a) => a.id === id)!.target;

  it('streaks unlock at the threshold and reset on a miss', () => {
    const s = createInitialState(0);
    const t = target('hotHand');
    for (let i = 0; i < t - 1; i++) observeRound(s.achievements, 'coinflip', heads(true));
    expect(s.achievements.hotHand.unlocked).toBe(false);
    const gained = observeRound(s.achievements, 'coinflip', heads(true));
    expect(gained.map((g) => g.id)).toEqual(['hotHand']);
    expect(s.achievements.hotHand.unlocked).toBe(true);
    observeRound(s.achievements, 'coinflip', heads(false));
    expect(s.achievements.hotHand.run).toBe(0);
    expect(s.achievements.hotHand.best).toBe(t);
    expect(s.achievements.coldComfort.run).toBe(1);
    // Already unlocked: further runs don't announce it again.
    for (let i = 0; i < t; i++) expect(observeRound(s.achievements, 'coinflip', heads(true))).toEqual([]);
  });

  it('grind achievements unlock exactly at the target', () => {
    const s = createInitialState(0);
    s.achievements.headsCollector.count = target('headsCollector') - 1;
    expect(s.achievements.headsCollector.unlocked).toBe(false);
    observeRound(s.achievements, 'coinflip', heads(true));
    expect(s.achievements.headsCollector.unlocked).toBe(true);
    expect(perkLevels(s.achievements, 'coinflip')[perkKey('headsCollector')]).toBe(1);
    expect(perkLevels(s.achievements, 'slots')).toEqual({});
  });

  it('perks reach play() and survive prestige and save round trips', () => {
    const g = new Game(createInitialState(0), mulberry32(3));
    g.state.achievements.hotHand.best = 15;
    g.state.achievements.hotHand.unlocked = true;
    expect(g.levelsFor('coinflip').perk_hotHand).toBe(1);
    g.table('coinflip').wallet = 1e12;
    g.table('coinflip').profit = 1e12;
    expect(g.prestige('coinflip')).toBe(true);
    expect(g.levelsFor('coinflip').perk_hotHand).toBe(1);
    const back = importSave(exportSave(g.state));
    expect(back.achievements.hotHand).toMatchObject({ best: 15, unlocked: true });
  });

  it('notifies on unlock while playing', () => {
    const g = new Game(createInitialState(0), mulberry32(1));
    g.state.achievements.headsCollector.count = target('headsCollector') - 1;
    g.table('coinflip').wallet = 1e6;
    for (let i = 0; i < 50 && !g.notice?.text.includes('Let It Ride'); i++) g.play('coinflip');
    expect(g.notice?.text).toContain('Let It Ride');
  });

  it('normalizes junk and backfills old saves from play stats', () => {
    const a = normalizeAchievements({ hotHand: { best: 'x', tier: 99 }, bogus: { count: 5 } });
    expect(a.hotHand.unlocked).toBe(true);
    expect(a.bogus).toBeUndefined();
    const s = createInitialState(0);
    s.tables.coinflip.history.stats.coin.heads = target('headsCollector') + 5000;
    s.tables.blackjack.history.stats.blackjack.natural = 3;
    const raw: any = JSON.parse(JSON.stringify(s));
    delete raw.achievements;
    const loaded = normalizeState(raw);
    expect(loaded.achievements.headsCollector.unlocked).toBe(true);
    expect(loaded.achievements.naturalBorn.count).toBe(3);
    expect(loaded.achievements.naturalBorn.unlocked).toBe(false);
    expect(backfillAchievements(s).headsCollector.count).toBe(target('headsCollector') + 5000);
  });

  it('has a perk for every achievement and bounded balance with all unlocked', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    for (const id of TABLE_IDS) {
      const def = TABLES[id];
      const maxed: Record<string, number> = {};
      for (const a of ACHIEVEMENTS.filter((x) => x.table === id)) maxed[perkKey(a.id)] = 1;
      const bet = def.baseMinBet * 10;
      const base = estimateNetPerPlay(def, {}, 0, bet, mulberry32(5), 20000) / bet;
      const perked = estimateNetPerPlay(def, maxed, 0, bet, mulberry32(5), 20000) / bet;
      expect(perked).toBeGreaterThanOrEqual(base - 0.02);
      expect(perked - base, id).toBeLessThan(1.25);
    }
  });

  it('collection achievement: unlocks once every upgrade is owned, permanently', () => {
    const g = new Game(createInitialState(0), mulberry32(2));
    g.table('coinflip').wallet = 1e15;
    const ups = allUpgrades(TABLES.coinflip);
    for (const u of ups.slice(0, -1)) g.buyUpgrade('coinflip', u.id);
    expect(g.state.achievements.collect_coinflip.unlocked).toBe(false);
    expect(g.state.achievements.collect_coinflip.count).toBe(ups.length - 1);
    // Other tables are unaffected.
    expect(g.levelsFor('slots').perk_collect_slots).toBeUndefined();

    g.buyUpgrade('coinflip', ups[ups.length - 1].id);
    expect(g.state.achievements.collect_coinflip.unlocked).toBe(true);
    expect(g.notice?.text).toContain('Gold Coin');

    g.table('coinflip').profit = 1e15;
    expect(g.prestige('coinflip')).toBe(true);
    expect(g.table('coinflip').levels).toEqual({});
    expect(g.levelsFor('coinflip').perk_collect_coinflip).toBe(1);
  });

  it('old tiered saves keep every perk they had', () => {
    const streak = normalizeAchievements({ hotHand: { best: 6, tier: 1 } });
    expect(streak.hotHand.unlocked).toBe(true);
    const old = normalizeAchievements({ headsCollector: { count: 1000, tier: 1 }, zeroHero: { count: 3, tier: 0 } });
    expect(old.headsCollector.unlocked).toBe(true);
    expect(old.zeroHero.unlocked).toBe(false);
    expect(normalizeAchievements({ collect_coinflip: { tier: 1 } }).collect_coinflip.unlocked).toBe(true);
    expect(normalizeAchievements({ collect_coinflip: { tier: 99 } }).collect_coinflip.unlocked).toBe(true);
  });

  it('every achievement has a positive target and a perk description', () => {
    for (const a of ACHIEVEMENTS.filter((x) => x.kind !== 'collect')) {
      expect(a.target).toBeGreaterThan(0);
      expect(a.perk.describe()).not.toContain('undefined');
    }
  });

  it('collection unlocks backfill from maxed upgrades', () => {
    const s = createInitialState(0);
    for (const u of allUpgrades(TABLES.slots)) s.tables.slots.levels[u.id] = u.maxLevel;
    const raw: any = JSON.parse(JSON.stringify(s));
    delete raw.achievements;
    expect(normalizeState(raw).achievements.collect_slots.unlocked).toBe(true);
  });
});
