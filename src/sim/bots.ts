import { Game } from '../core/game';
import { createInitialState } from '../core/state';
import { mulberry32 } from '../core/rng';
import { FINAL_TABLE, TABLES, TABLE_IDS } from '../tables';
import { allUpgrades, prestigeThreshold, upgradeCost } from '../core/economy';
import { CASINO_UPGRADES } from '../core/casino';
import { ACHIEVEMENTS } from '../core/achievements';
import type { TableId } from '../core/types';
import type { Rng } from '../core/types';

/** Static ranking of upgrades by how much they help (lower = better); used by value-aware and junk-first bots. */
export const VALUE_ORDER = [
  'autobet',
  'speed',
  'payout',
  'edge',
  'loaded',
  'luck',
  'strategy',
  'sleeve',
  'dealer',
  'zero',
  'bet_dozen',
  'streak',
  'insure',
  'cashback',
  'bet_number',
  'magnet',
];
/** Upgrades a poor player might buy "because they are cheap" or sound fun. */
const JUNK = ['cashback', 'insure', 'magnet', 'streak', 'zero', 'bet_number', 'bet_dozen'];

export type BuyStyle = 'cheapest' | 'value' | 'random' | 'expensive' | 'junk' | 'none';
export type PrestigeStyle = 'asap' | 'never' | 'not-final' | 'slow';

export interface BotPolicy {
  id: string;
  label: string;
  buy: BuyStyle;
  prestige: PrestigeStyle;
  /** Seconds of game time between the bot's actions (models how attentive the player is). */
  checkEverySec: number;
  /** Fraction of the wallet a purchase may use. */
  spendFraction: number;
}

export const BOTS: BotPolicy[] = [
  { id: 'greedy', label: 'Greedy (cheapest, prestige ASAP)', buy: 'cheapest', prestige: 'asap', checkEverySec: 1, spendFraction: 0.6 },
  { id: 'optimal', label: 'Optimal-ish (best value first, prestige ASAP)', buy: 'value', prestige: 'asap', checkEverySec: 1, spendFraction: 0.6 },
  { id: 'random', label: 'Random buyer', buy: 'random', prestige: 'asap', checkEverySec: 1, spendFraction: 0.6 },
  { id: 'expensive', label: 'Expensive first', buy: 'expensive', prestige: 'asap', checkEverySec: 1, spendFraction: 0.6 },
  { id: 'junk', label: 'Junk first', buy: 'junk', prestige: 'asap', checkEverySec: 1, spendFraction: 0.6 },
  { id: 'slow-prestige', label: 'Slow to prestige (waits for 2× the threshold)', buy: 'cheapest', prestige: 'slow', checkEverySec: 1, spendFraction: 0.6 },
  { id: 'never-prestige', label: 'Never prestige (informational)', buy: 'cheapest', prestige: 'never', checkEverySec: 1, spendFraction: 0.6 },
  { id: 'lazy', label: 'Lazy (acts every minute)', buy: 'cheapest', prestige: 'asap', checkEverySec: 60, spendFraction: 0.6 },
  { id: 'hoarder', label: 'Hoarder (buys only with ~230% wallet slack)', buy: 'cheapest', prestige: 'asap', checkEverySec: 1, spendFraction: 0.3 },
];

export interface SimEvent {
  /** Game time in minutes. */
  t: number;
  kind: 'unlock' | 'prestige' | 'ascend' | 'achievement';
  label: string;
}

export interface SimSample {
  /** Game time in minutes. */
  t: number;
  wallets: Record<TableId, number>;
  prestige: Record<TableId, number>;
  /** log10(final table wallet / ascension threshold); >= 0 means ascendable. */
  progress: number;
}

export interface RunOptions {
  seed?: number;
  maxMinutes?: number;
  sampleSec?: number;
  /** Upgrades the bot never buys, as `table:id` or a bare upgrade id (every table). */
  skipUpgrades?: string[];
  /** Achievement ids whose perks are held locked (absent). */
  lockedAchievements?: string[];
  /** Achievement ids whose perks are unlocked from the start. */
  grantedAchievements?: string[];
  /** Keep playing past the ascension threshold (for achievement timing). */
  ignoreAscension?: boolean;
  /** Ascend whenever possible and spend the chips on the shop, stopping once every casino upgrade is maxed. */
  untilShopComplete?: boolean;
  rng?: Rng;
}

export interface RunResult {
  bot: string;
  seed: number;
  /** Minutes until the ascension threshold was met, or null if not reached within the cap. */
  ascendedAt: number | null;
  /** Minutes until every casino shop upgrade was maxed (needs `untilShopComplete`), or null. */
  shopCompleteAt: number | null;
  /** Ascensions it took to max the shop, or null. */
  ascensionsToComplete: number | null;
  /** Final log10 progress toward ascension. */
  progress: number;
  /** Minutes at which each table unlocked. */
  unlockedAt: Partial<Record<TableId, number>>;
  /** Achievement id -> minutes at which the achievement unlocked (a single entry). */
  achievementAt: Record<string, number[]>;
  events: SimEvent[];
  samples: SimSample[];
}

/** Reference thresholds from the balance targets. */
export const TARGET_MINUTES = { greedy: 60, worst: 90, shop: 240 };

export function runBot(policy: BotPolicy, opts: RunOptions = {}): RunResult {
  const { seed = 1, maxMinutes = 150, sampleSec = 10, skipUpgrades = [], lockedAchievements = [], grantedAchievements = [] } = opts;
  const rng = mulberry32(seed * 7919 + 13);
  const pick = opts.rng ?? mulberry32(seed + 101);
  const g = new Game(createInitialState(0), rng);
  const dt = 0.1;
  const checkEvery = Math.max(1, Math.round(policy.checkEverySec / dt));
  const sampleEvery = Math.max(1, Math.round(sampleSec / dt));
  const total = Math.round((maxMinutes * 60) / dt);
  const skip = new Set(skipUpgrades);
  const locked = new Set(lockedAchievements);
  const events: SimEvent[] = [];
  const samples: SimSample[] = [];
  const unlockedAt: RunResult['unlockedAt'] = {};
  const achievementAt: RunResult['achievementAt'] = {};
  const seenAt = new Set<string>(grantedAchievements);
  let ascendedAt: number | null = null;
  let shopCompleteAt: number | null = null;
  let ascensionsToComplete: number | null = null;

  const holdPerks = () => {
    for (const id of locked) {
      const p = g.state.achievements[id];
      if (p) {
        p.unlocked = false;
        p.count = 0;
        p.best = 0;
        p.run = 0;
      }
    }
  };
  for (const id of grantedAchievements) {
    const def = ACHIEVEMENTS.find((a) => a.id === id);
    if (def && g.state.achievements[id]) g.state.achievements[id].unlocked = true;
  }
  const progress = () => Math.log10(Math.max(1, g.ascensionMoney()) / 5e9 / 5 ** g.state.casino.ascensions);

  for (let step = 0; step <= total; step++) {
    if (step > 0) g.tick(dt);
    if (locked.size) holdPerks();
    const t = (step * dt) / 60;
    if (step % sampleEvery === 0) {
      const wallets = {} as Record<TableId, number>;
      const prestige = {} as Record<TableId, number>;
      for (const id of TABLE_IDS) {
        wallets[id] = g.table(id).unlocked ? g.table(id).wallet : 0;
        prestige[id] = g.table(id).prestige;
      }
      samples.push({ t, wallets, prestige, progress: progress() });
    }
    if (step % checkEvery !== 0) continue;

    // Achievements unlocked since the last check.
    for (const [id, p] of Object.entries(g.state.achievements)) {
      if (p.unlocked && !seenAt.has(id)) {
        seenAt.add(id);
        achievementAt[id] = [t];
        events.push({ t, kind: 'achievement', label: id });
      }
    }
    for (const id of TABLE_IDS) {
      if (!g.table(id).unlocked && g.unlock(id)) {
        unlockedAt[id] = t;
        events.push({ t, kind: 'unlock', label: id });
      }
      const mayPrestige =
        policy.prestige === 'asap' ||
        (policy.prestige === 'not-final' && id !== FINAL_TABLE) ||
        // 'slow' waits until it has double the needed profit: a player who is slow to notice the button.
        (policy.prestige === 'slow' && g.table(id).profit >= 2 * prestigeThreshold(TABLES[id], g.table(id).prestige, g.bonus));
      if (mayPrestige && g.canPrestige(id) && g.prestige(id)) {
        events.push({ t, kind: 'prestige', label: `${id} → p${g.table(id).prestige}` });
      }
    }
    if (g.canAscend() && opts.untilShopComplete) {
      if (ascendedAt === null) ascendedAt = t;
      g.ascend();
      events.push({ t, kind: 'ascend', label: `ascend #${g.state.casino.ascensions}` });
      // Cheapest first, repeatedly, so prerequisites open up as chips allow.
      for (let bought = true; bought; ) {
        bought = false;
        const open = CASINO_UPGRADES.filter((u) => g.casinoLevel(u.id) < u.maxLevel)
          .map((u) => ({ u, q: g.quoteCasinoUpgrade(u.id) }))
          .filter((x) => x.q.count > 0)
          .sort((a, b) => a.q.cost - b.q.cost);
        if (open.length && g.buyCasinoUpgrade(open[0].u.id)) bought = true;
      }
      if (CASINO_UPGRADES.every((u) => g.casinoLevel(u.id) >= u.maxLevel)) {
        shopCompleteAt = t;
        ascensionsToComplete = g.state.casino.ascensions;
        break;
      }
      continue;
    }
    if (g.canAscend() && ascendedAt === null) {
      ascendedAt = t;
      events.push({ t, kind: 'ascend', label: 'ascend' });
      if (!opts.ignoreAscension) break;
    }
    if (policy.buy === 'none') continue;
    for (const id of TABLE_IDS) {
      const ts = g.table(id);
      if (!ts.unlocked) continue;
      for (let n = 0; n < 5; n++) {
        const options: { up: string; cost: number }[] = [];
        for (const u of allUpgrades(TABLES[id])) {
          if (skip.has(`${id}:${u.id}`) || skip.has(u.id)) continue;
          const lvl = ts.levels[u.id] ?? 0;
          if (lvl >= u.maxLevel) continue;
          const cost = upgradeCost(TABLES[id], u, ts.prestige, lvl, g.bonus);
          if (cost <= ts.wallet * policy.spendFraction) options.push({ up: u.id, cost });
        }
        if (options.length === 0) break;
        const rank = (up: string) => {
          const i = VALUE_ORDER.indexOf(up);
          return i < 0 ? VALUE_ORDER.length : i;
        };
        let choice = options[0];
        switch (policy.buy) {
          case 'cheapest':
            choice = options.reduce((a, b) => (b.cost < a.cost ? b : a));
            break;
          case 'expensive':
            choice = options.reduce((a, b) => (b.cost > a.cost ? b : a));
            break;
          case 'random':
            choice = options[Math.floor(pick() * options.length)];
            break;
          case 'value':
            choice = options.reduce((a, b) => (rank(b.up) < rank(a.up) || (rank(b.up) === rank(a.up) && b.cost < a.cost) ? b : a));
            break;
          case 'junk': {
            const junk = options.filter((o) => JUNK.includes(o.up));
            const pool = junk.length ? junk : options;
            choice = pool.reduce((a, b) => (b.cost < a.cost ? b : a));
            break;
          }
        }
        if (!g.buyUpgrade(id, choice.up)) break;
      }
    }
  }
  return { bot: policy.id, seed, ascendedAt, shopCompleteAt, ascensionsToComplete, progress: progress(), unlockedAt, achievementAt, events, samples };
}

export interface BotSummary {
  bot: string;
  runs: number;
  reached: number;
  min: number | null;
  median: number | null;
  max: number | null;
  /** Median log10 progress at the cap (useful when nothing ascended). */
  medianProgress: number;
}

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  if (s.length === 0) return NaN;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Summarises runs; a run that never ascended counts as Infinity for the median/max. */
export function summarize(bot: string, runs: RunResult[]): BotSummary {
  const times = runs.map((r) => r.ascendedAt ?? Infinity);
  const sorted = [...times].sort((a, b) => a - b);
  const fin = (x: number) => (Number.isFinite(x) ? x : null);
  return {
    bot,
    runs: runs.length,
    reached: runs.filter((r) => r.ascendedAt !== null).length,
    min: fin(sorted[0]),
    median: fin(median(times)),
    max: fin(sorted[sorted.length - 1]),
    medianProgress: median(runs.map((r) => r.progress)),
  };
}

export function runSeeds(policy: BotPolicy, seeds: number[], opts: RunOptions = {}): RunResult[] {
  return seeds.map((seed) => runBot(policy, { ...opts, seed }));
}

/** Minutes-equivalent score of a run: time to ascend, or the cap plus a penalty for how far short it fell. */
export function score(r: RunResult, cap: number): number {
  return r.ascendedAt ?? cap + Math.max(0, -r.progress) * 10;
}

export function medianScore(runs: RunResult[], cap: number): number {
  return median(runs.map((r) => score(r, cap)));
}

export interface MarginalRow {
  id: string;
  /** Median score with the item present (normal play). */
  base: number;
  /** Median score with the item removed / granted. */
  alt: number;
  /** alt - base in minutes: positive means the item saves that much time. */
  minutesSaved: number;
}

/** For each upgrade id, the time it saves the bot: the run without it minus the normal run. */
export function upgradeMarginals(policy: BotPolicy, seeds: number[], ids: string[], cap = 150): MarginalRow[] {
  const base = medianScore(runSeeds(policy, seeds, { maxMinutes: cap }), cap);
  return ids.map((id) => {
    const alt = medianScore(runSeeds(policy, seeds, { maxMinutes: cap, skipUpgrades: [id] }), cap);
    return { id, base, alt, minutesSaved: alt - base };
  });
}

/** Minutes an achievement's perk saves: the run with it locked out minus the run with it unlocked from the start. */
export function perkMarginals(policy: BotPolicy, seeds: number[], ids: string[], cap = 150): MarginalRow[] {
  return ids.map((id) => {
    const locked = medianScore(runSeeds(policy, seeds, { maxMinutes: cap, lockedAchievements: [id] }), cap);
    const granted = medianScore(runSeeds(policy, seeds, { maxMinutes: cap, grantedAchievements: [id] }), cap);
    return { id, base: granted, alt: locked, minutesSaved: locked - granted };
  });
}
