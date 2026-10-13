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
  it('streaks advance tiers at thresholds and reset on a miss', () => {
    const s = createInitialState(0);
    const [t1, t2] = ACHIEVEMENTS.find((a) => a.id === 'hotHand')!.targets;
    for (let i = 0; i < t1 - 1; i++) observeRound(s.achievements, 'coinflip', heads(true));
    expect(s.achievements.hotHand.tier).toBe(0);
    const gained = observeRound(s.achievements, 'coinflip', heads(true));
    expect(gained.map((g) => g.def.id)).toEqual(['hotHand']);
    expect(s.achievements.hotHand.tier).toBe(1);
    observeRound(s.achievements, 'coinflip', heads(false));
    expect(s.achievements.hotHand.run).toBe(0);
    expect(s.achievements.hotHand.best).toBe(t1);
    expect(s.achievements.coldComfort.run).toBe(1);
    for (let i = 0; i < t2; i++) observeRound(s.achievements, 'coinflip', heads(true));
    expect(s.achievements.hotHand.tier).toBe(2);
  });

  it('grind achievements unlock exactly at the target', () => {
    const s = createInitialState(0);
    const [target] = ACHIEVEMENTS.find((a) => a.id === 'headsCollector')!.targets;
    s.achievements.headsCollector.count = target - 1;
    expect(s.achievements.headsCollector.tier).toBe(0);
    observeRound(s.achievements, 'coinflip', heads(true));
    expect(s.achievements.headsCollector.tier).toBe(1);
    expect(perkLevels(s.achievements, 'coinflip')[perkKey('headsCollector')]).toBe(1);
    expect(perkLevels(s.achievements, 'slots')).toEqual({});
  });

  it('perks reach play() and survive prestige and save round trips', () => {
    const g = new Game(createInitialState(0), mulberry32(3));
    g.state.achievements.hotHand.best = 15;
    g.state.achievements.hotHand.tier = 3;
    expect(g.levelsFor('coinflip').perk_hotHand).toBe(3);
    g.table('coinflip').wallet = 1e12;
    g.table('coinflip').profit = 1e12;
    expect(g.prestige('coinflip')).toBe(true);
    expect(g.levelsFor('coinflip').perk_hotHand).toBe(3);
    const back = importSave(exportSave(g.state));
    expect(back.achievements.hotHand).toMatchObject({ best: 15, tier: 3 });
  });

  it('notifies on unlock while playing', () => {
    const g = new Game(createInitialState(0), mulberry32(1));
    g.state.achievements.headsCollector.count = ACHIEVEMENTS.find((a) => a.id === 'headsCollector')!.targets[0] - 1;
    g.table('coinflip').wallet = 1e6;
    for (let i = 0; i < 50 && !g.notice?.text.includes('Let It Ride'); i++) g.play('coinflip');
    expect(g.notice?.text).toContain('Let It Ride');
  });

  it('normalizes junk and backfills old saves from play stats', () => {
    const a = normalizeAchievements({ hotHand: { best: 'x', tier: 99 }, bogus: { count: 5 } });
    expect(a.hotHand.tier).toBe(3);
    expect(a.bogus).toBeUndefined();
    const s = createInitialState(0);
    s.tables.coinflip.history.stats.coin.heads = 15000;
    s.tables.blackjack.history.stats.blackjack.natural = 3;
    const raw: any = JSON.parse(JSON.stringify(s));
    delete raw.achievements;
    const loaded = normalizeState(raw);
    expect(loaded.achievements.headsCollector.tier).toBe(1);
    expect(loaded.achievements.naturalBorn.count).toBe(3);
    expect(backfillAchievements(s).headsCollector.count).toBe(15000);
  });

  it('has a perk for every achievement and bounded balance at max tier', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    for (const id of TABLE_IDS) {
      const def = TABLES[id];
      const maxed: Record<string, number> = {};
      for (const a of ACHIEVEMENTS.filter((x) => x.table === id)) maxed[perkKey(a.id)] = a.targets.length;
      const bet = def.baseMinBet * 10;
      const base = estimateNetPerPlay(def, {}, 0, bet, mulberry32(5), 20000) / bet;
      const perked = estimateNetPerPlay(def, maxed, 0, bet, mulberry32(5), 20000) / bet;
      expect(perked).toBeGreaterThanOrEqual(base - 0.02);
      expect(perked - base, id).toBeLessThan(1.25);
    }
  });

  it('collection achievement: tier 1 for owning every upgrade, tier 2 for maxing them, permanent', () => {
    const g = new Game(createInitialState(0), mulberry32(2));
    g.table('coinflip').wallet = 1e15;
    const ups = allUpgrades(TABLES.coinflip);
    for (const u of ups.slice(0, -1)) g.buyUpgrade('coinflip', u.id);
    expect(g.state.achievements.collect_coinflip.tier).toBe(0);
    expect(g.state.achievements.collect_coinflip.count).toBe(ups.length - 1);
    g.buyUpgrade('coinflip', ups[ups.length - 1].id);
    expect(g.state.achievements.collect_coinflip.tier).toBe(1);
    expect(g.notice?.text).toContain('Fully Loaded Coin');
    expect(g.levelsFor('coinflip').perk_collect_coinflip).toBe(1);
    // Other tables are unaffected.
    expect(g.levelsFor('slots').perk_collect_slots).toBeUndefined();

    for (const u of ups) while (g.upgradeLevel('coinflip', u.id) < u.maxLevel) g.buyUpgrade('coinflip', u.id);
    expect(g.state.achievements.collect_coinflip.tier).toBe(2);

    g.table('coinflip').profit = 1e15;
    expect(g.prestige('coinflip')).toBe(true);
    expect(g.table('coinflip').levels).toEqual({});
    expect(g.state.achievements.collect_coinflip.tier).toBe(2);
    expect(g.levelsFor('coinflip').perk_collect_coinflip).toBe(2);
  });

  it('earned tiers survive raised targets, and old single-tier grinds keep the full perk', () => {
    const streak = normalizeAchievements({ hotHand: { best: 6, tier: 1 } });
    expect(streak.hotHand.tier).toBe(1);
    const old = normalizeAchievements({ headsCollector: { count: 1000, tier: 1 }, zeroHero: { count: 3, tier: 0 } });
    expect(old.headsCollector.tier).toBe(3);
    expect(old.zeroHero.tier).toBe(0);
    // A new-rules save at tier 1 has met the first target and stays at tier 1.
    const fresh = normalizeAchievements({ headsCollector: { count: 10000, tier: 1 } });
    expect(fresh.headsCollector.tier).toBe(1);
  });

  it('every achievement has ascending targets and a perk table that covers all tiers', () => {
    for (const a of ACHIEVEMENTS.filter((x) => x.kind !== 'collect')) {
      expect(a.targets.length).toBe(3);
      expect([...a.targets].sort((x, y) => x - y)).toEqual(a.targets);
      for (let t = 1; t <= 3; t++) expect(a.perk.describe(t)).not.toContain('undefined');
    }
  });

  it('collection tiers backfill from owned upgrades and are sanitized on load', () => {
    const s = createInitialState(0);
    for (const u of allUpgrades(TABLES.slots)) s.tables.slots.levels[u.id] = u.maxLevel;
    const raw: any = JSON.parse(JSON.stringify(s));
    delete raw.achievements;
    expect(normalizeState(raw).achievements.collect_slots.tier).toBe(2);
    const junk = normalizeAchievements({ collect_coinflip: { tier: 99 } });
    expect(junk.collect_coinflip.tier).toBe(2);
  });
});
