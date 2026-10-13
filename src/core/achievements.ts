import type { AchievementProgress, GameState, PlayView, TableId } from './types';
import { COLLECTION_BONUS_PER_TIER, COLLECTION_PERK_KEY, type Outcome } from './economy';
import { RED_POCKETS } from '../tables/roulette';

export const RARITIES = ['Rare', 'Epic', 'Legendary'] as const;

export interface AchievementDef {
  id: string;
  table: TableId;
  name: string;
  /** What the player has to do, e.g. "Flip heads". */
  goal: string;
  /** `collect` is earned by upgrade purchases, not rounds: tier 1 = every upgrade owned, tier 2 = every upgrade maxed. */
  kind: 'grind' | 'streak' | 'collect';
  /** Grind: cumulative counts. Streak: run lengths. Both ascend, one per rarity tier. Collect: one entry per tier. */
  targets: number[];
  /** Grind: how much this round adds to the count (0 = nothing). Streak: 1 if the round extends the run. */
  score(view: PlayView, outcome: Outcome): number;
  perk: { name: string; describe(tier: number): string };
}

/** Key under which an achievement's perk level appears in a table's `levels`. */
export function perkKey(id: string): string {
  // The collection perk is applied by the shared payout formula, so every table uses one key.
  if (ACHIEVEMENTS.find((a) => a.id === id)?.kind === 'collect') return COLLECTION_PERK_KEY;
  return `perk_${id}`;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const byTier = <T>(values: T[], tier: number): T => values[Math.min(values.length, Math.max(1, tier)) - 1];

export const COIN_HEADS_CHANCE = [0.005, 0.01, 0.015];
export const DOUBLE_HEADER_CHANCE = [0.03, 0.06, 0.1];
export const CONSOLATION_REFUND = [0.1, 0.2, 0.3];
export const POLISHED_TRIPLE_BONUS = [1.04, 1.07, 1.1];
export const SWEET_PAIR_MULT = [1.1, 1.18, 1.25];
export const NEAR_MISS_REFUND = [0.1, 0.2, 0.3];
export const HOT_SEVENTEEN_MULT = [37, 38.5, 40];
export const LA_PARTAGE_REFUND = [0.2, 0.35, 0.5];
export const COLOUR_MEMORY_MULT = [2.1, 2.2, 2.3];
export const MARKED_DECK_MULT = [2.7, 2.85, 3];
export const SECOND_THOUGHTS_CHANCE = [0.05, 0.1, 0.15];
export const GENTLEMAN_PUSH_MULT = [1.1, 1.2, 1.3];

/** Blackjack card-count perks: extra profit on N-card wins, and a refund on N-card losses to the dealer. */
export const CARD_WIN_BONUS = [0.05, 0.1, 0.15];
export const CARD_LOSS_REFUND = [0.05, 0.1, 0.15];
export const CARD_COUNTS = [2, 3, 4, 5, 6] as const;
/** Grind targets by player card count: shorter hands happen far more often than 5- or 6-card hands. */
const CARD_WIN_TARGETS: Record<number, number[]> = {
  2: [10000, 100000, 1000000],
  3: [7500, 75000, 750000],
  4: [2500, 25000, 250000],
  5: [500, 5000, 50000],
  6: [60, 600, 6000],
};
const CARD_LOSS_TARGETS: Record<number, number[]> = {
  2: [6500, 65000, 650000],
  3: [3500, 35000, 350000],
  4: [1000, 10000, 100000],
  5: [200, 2000, 20000],
  6: [30, 300, 3000],
};

/** Blackjack hands won (or lost to the dealer) with exactly `cards` cards in the player's hand. */
const cardCount = (cards: number, won: boolean): AchievementDef => ({
  id: `${won ? 'winCards' : 'loseCards'}${cards}`,
  table: 'blackjack',
  name: won ? `${cards}-Card Winner` : `${cards}-Card Loser`,
  goal: won ? `Win with ${cards} cards` : `Lose to the dealer with ${cards} cards`,
  kind: 'grind',
  targets: won ? CARD_WIN_TARGETS[cards] : CARD_LOSS_TARGETS[cards],
  score: (v) => {
    if (v.kind !== 'blackjack' || v.player.length !== cards) return 0;
    return won ? (v.outcome === 'win' || v.outcome === 'natural' ? 1 : 0) : v.outcome === 'lose' ? 1 : 0;
  },
  perk: won
    ? { name: `${cards}-Card Charm`, describe: (t) => `${cards}-card wins pay +${pct(byTier(CARD_WIN_BONUS, t))} profit` }
    : { name: `${cards}-Card Cushion`, describe: (t) => `${cards}-card losses to the dealer refund ${pct(byTier(CARD_LOSS_REFUND, t))} of your bet` },
});

const collection = (table: TableId, name: string): AchievementDef => ({
  id: `collect_${table}`,
  table,
  name,
  goal: 'Own every upgrade on this table, then max them all',
  kind: 'collect',
  targets: [1, 2],
  score: () => 0,
  perk: {
    name: 'Loyalty Bonus',
    describe: (t) => `+${Math.round(COLLECTION_BONUS_PER_TIER * Math.min(2, Math.max(1, t)) * 100)}% winnings on this table`,
  },
});

export const ACHIEVEMENTS: AchievementDef[] = [
  collection('coinflip', 'Fully Loaded Coin'),
  collection('slots', 'Fully Loaded Reels'),
  collection('roulette', 'Fully Loaded Wheel'),
  collection('blackjack', 'Fully Loaded Shoe'),
  {
    id: 'headsCollector',
    table: 'coinflip',
    name: 'Heads Collector',
    goal: 'Flip heads',
    kind: 'grind',
    targets: [10000, 100000, 1000000],
    score: (v) => (v.kind === 'coin' && v.heads ? 1 : 0),
    perk: { name: 'Lucky Penny', describe: (t) => `+${(byTier(COIN_HEADS_CHANCE, t) * 100).toFixed(1)}% heads chance` },
  },
  {
    id: 'hotHand',
    table: 'coinflip',
    name: 'Hot Hand',
    goal: 'Flip heads in a row',
    kind: 'streak',
    targets: [20, 38, 54],
    score: (v) => (v.kind === 'coin' && v.heads ? 1 : 0),
    perk: {
      name: 'Double Header',
      describe: (t) => `${pct(byTier(DOUBLE_HEADER_CHANCE, t))} of wins pay 3× instead of 2×`,
    },
  },
  {
    id: 'coldComfort',
    table: 'coinflip',
    name: 'Cold Comfort',
    goal: 'Flip tails in a row',
    kind: 'streak',
    targets: [7, 9, 12],
    score: (v) => (v.kind === 'coin' && !v.heads ? 1 : 0),
    perk: {
      name: 'Consolation Prize',
      describe: (t) => `Tails refund ${pct(byTier(CONSOLATION_REFUND, t))} of your bet`,
    },
  },
  {
    id: 'tripleCrown',
    table: 'slots',
    name: 'Triple Crown',
    goal: 'Land three of a kind',
    kind: 'grind',
    targets: [5000, 50000, 500000],
    score: (v) => (v.kind === 'slots' && v.reels[0] === v.reels[1] && v.reels[1] === v.reels[2] ? 1 : 0),
    perk: { name: 'Polished Reels', describe: (t) => `Three of a kind pays +${pct(byTier(POLISHED_TRIPLE_BONUS, t) - 1)}` },
  },
  {
    id: 'cherrySeason',
    table: 'slots',
    name: 'Cherry Season',
    goal: 'See cherries on the reels',
    kind: 'grind',
    targets: [20000, 200000, 2000000],
    score: (v) => (v.kind === 'slots' ? v.reels.filter((r) => r === 0).length : 0),
    perk: { name: 'Sweet Pair', describe: (t) => `Two cherries pay ${byTier(SWEET_PAIR_MULT, t)}× instead of 1×` },
  },
  {
    id: 'hotStreak',
    table: 'slots',
    name: 'Hot Streak',
    goal: 'Get paid at least your stake in a row',
    kind: 'streak',
    targets: [14, 30, 46],
    score: (v, o) => (v.kind === 'slots' && o.payout >= o.bet ? 1 : 0),
    perk: {
      name: 'Near Miss',
      describe: (t) => `A non-cherry pair refunds ${pct(byTier(NEAR_MISS_REFUND, t))} of your bet`,
    },
  },
  {
    id: 'zeroHero',
    table: 'roulette',
    name: 'Zero Hero',
    goal: 'Watch the ball land on zero',
    kind: 'grind',
    targets: [1000, 10000, 100000],
    score: (v) => (v.kind === 'roulette' && v.pocket === 0 ? 1 : 0),
    perk: { name: 'La Partage', describe: (t) => `Zero returns ${pct(byTier(LA_PARTAGE_REFUND, t))} of your bet on colour and dozen bets` },
  },
  {
    id: 'luckySeventeen',
    table: 'roulette',
    name: 'Lucky Seventeen',
    goal: 'Hit 17',
    kind: 'grind',
    targets: [750, 7500, 75000],
    score: (v) => (v.kind === 'roulette' && v.pocket === 17 ? 1 : 0),
    perk: { name: 'Hot Seventeen', describe: (t) => `Number bets pay ${byTier(HOT_SEVENTEEN_MULT, t)}× instead of 36×` },
  },
  {
    id: 'colourRun',
    table: 'roulette',
    name: 'Red Run',
    goal: 'Spin red in a row',
    kind: 'streak',
    targets: [9, 18, 28],
    score: (v) => (v.kind === 'roulette' && RED_POCKETS.has(v.pocket) ? 1 : 0),
    perk: {
      name: 'Colour Memory',
      describe: (t) => `Red bets pay ${byTier(COLOUR_MEMORY_MULT, t).toFixed(1)}× instead of 2×`,
    },
  },
  {
    id: 'naturalBorn',
    table: 'blackjack',
    name: 'Natural Born',
    goal: 'Be dealt a natural',
    kind: 'grind',
    targets: [3000, 30000, 300000],
    score: (v) => (v.kind === 'blackjack' && v.outcome === 'natural' ? 1 : 0),
    perk: { name: 'Marked Deck', describe: (t) => `Naturals pay ${byTier(MARKED_DECK_MULT, t)}× instead of 2.5×` },
  },
  {
    id: 'bustOut',
    table: 'blackjack',
    name: 'Bust Out',
    goal: 'Bust',
    kind: 'grind',
    targets: [2500, 25000, 250000],
    score: (v) => (v.kind === 'blackjack' && v.outcome === 'bust' ? 1 : 0),
    perk: {
      name: 'Second Thoughts',
      describe: (t) => `${pct(byTier(SECOND_THOUGHTS_CHANCE, t))} chance a busting card is re-drawn once`,
    },
  },
  {
    id: 'winStreak',
    table: 'blackjack',
    name: 'Winning Run',
    goal: 'Win hands in a row',
    kind: 'streak',
    targets: [9, 22, 36],
    score: (v) => (v.kind === 'blackjack' && (v.outcome === 'win' || v.outcome === 'natural') ? 1 : 0),
    perk: {
      name: "Gentleman's Agreement",
      describe: (t) => `Pushes pay ${byTier(GENTLEMAN_PUSH_MULT, t).toFixed(1)}× your bet`,
    },
  },
  ...CARD_COUNTS.map((n) => cardCount(n, true)),
  ...CARD_COUNTS.map((n) => cardCount(n, false)),
];

export function achievementsFor(table: TableId): AchievementDef[] {
  return ACHIEVEMENTS.filter((a) => a.table === table);
}

export function maxTier(def: AchievementDef): number {
  return def.targets.length;
}

export function newProgress(): AchievementProgress {
  return { count: 0, run: 0, best: 0, tier: 0 };
}

export function newAchievements(): Record<string, AchievementProgress> {
  const out: Record<string, AchievementProgress> = {};
  for (const a of ACHIEVEMENTS) out[a.id] = newProgress();
  return out;
}

function tierFor(def: AchievementDef, progress: AchievementProgress): number {
  // Collection tiers are only ever earned by `observeUpgrades`; they stick once reached.
  if (def.kind === 'collect') return progress.tier;
  const value = def.kind === 'grind' ? progress.count : progress.best;
  let tier = 0;
  for (const t of def.targets) if (value >= t) tier++;
  return tier;
}

/** Feeds one round into the table's achievements. Returns those that gained a tier. */
export function observeRound(
  achievements: Record<string, AchievementProgress>,
  table: TableId,
  outcome: Outcome,
): { def: AchievementDef; tier: number }[] {
  const view = outcome.view;
  const gained: { def: AchievementDef; tier: number }[] = [];
  if (!view) return gained;
  for (const def of achievementsFor(table)) {
    if (def.kind === 'collect') continue;
    const p = (achievements[def.id] ??= newProgress());
    const score = def.score(view, outcome);
    if (def.kind === 'grind') {
      p.count += score;
    } else {
      p.run = score > 0 ? p.run + 1 : 0;
      p.best = Math.max(p.best, p.run);
    }
    const tier = tierFor(def, p);
    if (tier > p.tier) {
      p.tier = tier;
      gained.push({ def, tier });
    }
  }
  return gained;
}

/**
 * Feeds a table's current upgrade levels into its collection achievement. Tiers are permanent: they
 * survive the upgrades being reset by prestige. `count`/`best` keep the most upgrades ever owned/maxed at once.
 */
export function observeUpgrades(
  achievements: Record<string, AchievementProgress>,
  table: TableId,
  upgrades: { id: string; maxLevel: number }[],
  levels: Record<string, number>,
): { def: AchievementDef; tier: number }[] {
  const gained: { def: AchievementDef; tier: number }[] = [];
  if (upgrades.length === 0) return gained;
  const owned = upgrades.filter((u) => (levels[u.id] ?? 0) >= 1).length;
  const maxed = upgrades.filter((u) => (levels[u.id] ?? 0) >= u.maxLevel).length;
  for (const def of achievementsFor(table)) {
    if (def.kind !== 'collect') continue;
    const p = (achievements[def.id] ??= newProgress());
    p.count = Math.max(p.count, owned);
    p.best = Math.max(p.best, maxed);
    let tier = p.tier;
    if (owned === upgrades.length) tier = Math.max(tier, 1);
    if (maxed === upgrades.length) tier = Math.max(tier, 2);
    if (tier > p.tier) {
      p.tier = tier;
      gained.push({ def, tier });
    }
  }
  return gained;
}

/** The perk levels earned on a table, keyed the way `TableDef.play` reads them. */
export function perkLevels(achievements: Record<string, AchievementProgress>, table: TableId): Record<string, number> {
  const out: Record<string, number> = {};
  for (const def of achievementsFor(table)) {
    const tier = achievements[def.id]?.tier ?? 0;
    if (tier > 0) out[perkKey(def.id)] = tier;
  }
  return out;
}

export function unlockedCount(achievements: Record<string, AchievementProgress>): number {
  return ACHIEVEMENTS.filter((a) => (achievements[a.id]?.tier ?? 0) > 0).length;
}

/** Seeds grind counts from lifetime play stats, so saves from before achievements aren't starting at zero. */
export function backfillAchievements(state: GameState): Record<string, AchievementProgress> {
  const out = newAchievements();
  const s = (id: TableId) => state.tables[id].history.stats;
  const seed: Record<string, number> = {
    headsCollector: s('coinflip').coin.heads,
    tripleCrown: s('slots').slots.triples,
    cherrySeason: s('slots').slots.symbols[0] ?? 0,
    zeroHero: s('roulette').roulette.pockets[0] ?? 0,
    luckySeventeen: s('roulette').roulette.pockets[17] ?? 0,
    naturalBorn: s('blackjack').blackjack.natural,
    bustOut: s('blackjack').blackjack.bust,
  };
  for (const def of ACHIEVEMENTS) {
    const p = out[def.id];
    if (def.kind === 'grind') p.count = seed[def.id] ?? 0;
    p.tier = tierFor(def, p);
  }
  return out;
}

/** Validates untrusted achievement data: unknown ids are dropped, numbers clamped. */
export function normalizeAchievements(raw: unknown): Record<string, AchievementProgress> {
  const out = newAchievements();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, any>;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
  for (const def of ACHIEVEMENTS) {
    const src = r[def.id];
    if (!src || typeof src !== 'object') continue;
    const p = out[def.id];
    p.count = n(src.count);
    p.best = n(src.best);
    p.run = Math.min(n(src.run), p.best);
    const saved = Math.min(n(src.tier), maxTier(def));
    if (def.kind === 'collect') p.tier = saved;
    else if (def.kind === 'grind' && saved > 0 && p.count < def.targets[0]) {
      // Earned under the old single-tier target: keep the full perk the player already had.
      p.tier = maxTier(def);
    } else {
      // Targets can be raised between versions; a tier that was earned is never taken back.
      p.tier = Math.max(saved, tierFor(def, p));
    }
  }
  return out;
}
