import type { AchievementProgress, GameState, PlayView, TableId } from './types';
import type { Outcome } from './economy';
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

/** Key under which an achievement's perk level appears in a table's `levels` (`perk_<id>`). */
export function perkKey(id: string): string {
  return `perk_${id}`;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const byTier = <T>(values: T[], tier: number): T => values[Math.min(values.length, Math.max(1, tier)) - 1];
const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);

// ---- Coin flip -------------------------------------------------------------------------------
/** Let It Ride: chance per link that a win is re-flipped for double, and the longest chain by tier. */
export const RIDE_CHANCE = 0.25;
export const RIDE_LINKS = [1, 2, 3];
/** Heat Wave: extra wins the Hot Streak upgrade counts on this table. */
export const HEAT_WAVE_CAP = [5, 10, 15];
/** Edge Landing: chance the coin lands on its rim, and what that pays. */
export const EDGE_CHANCE = [0.005, 0.01, 0.015];
export const EDGE_MULT = 5;
/** Pity Flip: chance that tails earns a free bonus play. */
export const PITY_CHANCE = [0.1, 0.2, 0.3];
/** Raised Ceiling: extra max payout. */
export const RAISED_CEILING = [0.25, 0.5, 1];
/** Double Luck: second Lucky Charm re-roll, as a fraction of the normal chance. */
export const DOUBLE_LUCK_FRACTION = [0.5, 0.75, 1];
/** Gold Coin capstone: chance per flip of a 25x payout, by tier. */
export const GOLD_COIN_CHANCE = [0.002, 0.004];
export const GOLD_COIN_MULT = 25;

// ---- Slots -----------------------------------------------------------------------------------
/** Cascade: free chained spins after a three of a kind. */
export const CASCADE_SPINS = [1, 2, 3];
/** Hold & Respin: chance a spin holds its cherries and respins the other reels. */
export const HOLD_CHANCE = [0.05, 0.1, 0.15];
/** Free Spins: spins awarded by a 2x+ win. */
export const FREE_SPINS = [1, 1, 2];
/** Wild Diamond: highest symbol index a 💎 can stand in for, by tier (0 🍒, 1 🍋, 3 🍀, 4 7️⃣). */
export const WILD_REACH = [1, 3, 4];
/** Scatter Sevens: stake multiples paid per 7️⃣ anywhere on the reels. */
export const SCATTER_PAY = [0.25, 0.5, 1];
/** Jackpot Seed capstone: bonus on 💎💎💎, by tier. */
export const JACKPOT_SEED = [10, 25];

// ---- Roulette --------------------------------------------------------------------------------
/** Green Machine: what zero pays on every bet. */
export const GREEN_MACHINE_MULT = [2, 3, 5];
/** House Chip: free chip on 17, as a share of the stake. */
export const HOUSE_CHIP = [0.05, 0.1, 0.2];
/** Black Bleed: black pockets the colour bet also wins on (it pays 2x there). */
export const BLACK_BLEED = [1, 2, 3];
export const BLEED_POCKETS = [2, 4, 6, 8, 10, 11];
/** Dozen Creep: extra pockets (13, 14, ...) the dozen bet covers. */
export const DOZEN_CREEP = [2, 4, 6];
/** Double Spin: chance that a spin rolls twice and both pay. */
export const DOUBLE_SPIN_CHANCE = [0.05, 0.1, 0.15];
/** Biased Wheel capstone: weight of 16, 17 and 18, by tier (others are 1). */
export const BIASED_WHEEL = [2, 3];

// ---- Blackjack -------------------------------------------------------------------------------
/** Rich Shoe: weight of ten-value cards in your draws (the other nine ranks weigh 1; the fair shoe has 4). */
export const TEN_WEIGHT = [5, 6, 7];
/** Burn Card: chance per attempt that a busting card is burned and redrawn, and attempts by tier. */
export const BURN_CHANCE = [0.3, 0.5, 0.7];
export const BURN_TRIES = [1, 1, 1];
/** Surrender: lowest hard total you fold on against a dealer ten or ace (up to 16). */
export const SURRENDER_FLOOR = [15, 14, 12];
/** Free Double Down: lowest two-card total you double on (up to 11). */
export const DOUBLE_FLOOR = [11, 10, 10];
/** Free Split: which pair values may be split. */
export const splitAllowed = (value: number, tier: number): boolean =>
  tier >= 3 || (tier === 2 ? value <= 8 : value === 1 || value === 8);
/** Charlie: cards a non-bust hand needs to win automatically, and what it pays. */
export const CHARLIE_CARDS = [6, 6, 5];
export const CHARLIE_MULT = 2;
/** Hole-Card Peek: chance you see the dealer's hole card. */
export const PEEK_CHANCE = [0.25, 0.5, 0.75];
/** Perfect Pairs: side-bet bonus (in stakes) for a pair in your first two cards. */
export const PAIR_BONUS = [0.4, 0.6, 0.8];
/** Even Money: what a dealer natural returns. */
export const EVEN_MONEY = [1, 1.25, 1.5];
/** Dealer Mulligan: chance the dealer's last card is burned and redrawn after beating you. */
export const MULLIGAN_CHANCE = [0.1, 0.2, 0.3];
/** Card Sharp: Lucky Charm multiplier on this table. */
export const CARD_SHARP_LUCK = [1.5, 2, 3];
/** Second Hand: chance a lost hand is redealt for free. */
export const SECOND_HAND_CHANCE = [0.05, 0.1, 0.15];
/** Dealer Tilt: the dealer keeps hitting below this total. */
export const TILT_HITS_BELOW = [18, 18, 19];
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

const CARD_WIN_PERKS: Record<number, { name: string; describe(t: number): string }> = {
  2: {
    name: 'Free Double Down',
    describe: (t) =>
      `Two-card ${byTier(DOUBLE_FLOOR, t) === 11 ? '11' : `${byTier(DOUBLE_FLOOR, t)}–11`} doubles the profit of a win; a loss costs nothing extra`,
  },
  3: {
    name: 'Free Split',
    describe: (t) =>
      `${t >= 3 ? 'Any pair' : t === 2 ? 'Pairs up to 8' : 'Aces and 8s'} split into two hands; the second is on the house`,
  },
  4: {
    name: 'Charlie',
    describe: (t) => `A non-bust hand of ${byTier(CHARLIE_CARDS, t)} cards wins automatically at ${CHARLIE_MULT}×`,
  },
  5: {
    name: 'Hole-Card Peek',
    describe: (t) => `${pct(byTier(PEEK_CHANCE, t))} of hands you see the dealer's hole card and play to beat it`,
  },
  6: {
    name: 'Perfect Pairs',
    describe: (t) => `A pair in your first two cards pays a ${byTier(PAIR_BONUS, t)}× side bet, whatever the hand does`,
  },
};
const CARD_LOSS_PERKS: Record<number, { name: string; describe(t: number): string }> = {
  2: {
    name: 'Even Money',
    describe: (t) => `A dealer natural returns ${byTier(EVEN_MONEY, t)}× your bet instead of beating you`,
  },
  3: {
    name: 'Dealer Mulligan',
    describe: (t) => `${pct(byTier(MULLIGAN_CHANCE, t))} chance the dealer's last card is burned and redrawn after beating you`,
  },
  4: { name: 'Card Sharp', describe: (t) => `Lucky Charm is ${byTier(CARD_SHARP_LUCK, t)}× stronger at this table` },
  5: {
    name: 'Second Hand',
    describe: (t) => `${pct(byTier(SECOND_HAND_CHANCE, t))} chance a lost hand is redealt for free`,
  },
  6: {
    name: 'Dealer Tilt',
    describe: (t) => `The dealer keeps hitting until ${byTier(TILT_HITS_BELOW, t)} instead of 17`,
  },
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
  perk: won ? CARD_WIN_PERKS[cards] : CARD_LOSS_PERKS[cards],
});

/** Capstone for owning, then maxing, every upgrade on a table: one unique rule change per table. */
const collection = (table: TableId, name: string, perk: AchievementDef['perk']): AchievementDef => ({
  id: `collect_${table}`,
  table,
  name,
  goal: 'Own every upgrade on this table, then max them all',
  kind: 'collect',
  targets: [1, 2],
  score: () => 0,
  perk,
});

export const ACHIEVEMENTS: AchievementDef[] = [
  collection('coinflip', 'Fully Loaded Coin', {
    name: 'Gold Coin',
    describe: (t) => `Every flip has a ${(byTier(GOLD_COIN_CHANCE, t) * 100).toFixed(1)}% chance to pay ${GOLD_COIN_MULT}×`,
  }),
  collection('slots', 'Fully Loaded Reels', {
    name: 'Jackpot Seed',
    describe: (t) => `💎💎💎 adds a ${byTier(JACKPOT_SEED, t)}× jackpot on top of the line payout`,
  }),
  collection('roulette', 'Fully Loaded Wheel', {
    name: 'Biased Wheel',
    describe: (t) => `16, 17 and 18 are ${byTier(BIASED_WHEEL, t)}× as likely to land`,
  }),
  collection('blackjack', 'Fully Loaded Shoe', {
    name: 'Card Counter',
    describe: (t) =>
      t >= 2
        ? 'You see the next two cards: a busting card is skipped, and you stand if the one after busts too'
        : 'You see the next card: you stand rather than hit into a bust',
  }),

  // Coin flip
  {
    id: 'headsCollector',
    table: 'coinflip',
    name: 'Heads Collector',
    goal: 'Flip heads',
    kind: 'grind',
    targets: [10000, 100000, 1000000],
    score: (v) => (v.kind === 'coin' && v.heads ? 1 : 0),
    perk: {
      name: 'Let It Ride',
      describe: (t) =>
        `After a win, ${pct(RIDE_CHANCE)} to flip the winnings again for double or nothing, up to ${times(byTier(RIDE_LINKS, t))}`,
    },
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
      name: 'Heat Wave',
      describe: (t) =>
        `Hot Streak counts ${10 + byTier(HEAT_WAVE_CAP, t)} wins on this table${t >= 3 ? ', and a loss only halves your streak' : ''}`,
    },
  },
  {
    id: 'coldComfort',
    table: 'coinflip',
    name: 'Cold Comfort',
    goal: 'Flip tails in a row',
    kind: 'streak',
    targets: [8, 10, 13],
    score: (v) => (v.kind === 'coin' && !v.heads ? 1 : 0),
    perk: {
      name: 'Edge Landing',
      describe: (t) => `${pct(byTier(EDGE_CHANCE, t))} of flips land on the rim and pay ${EDGE_MULT}×`,
    },
  },
  {
    id: 'tailsCollector',
    table: 'coinflip',
    name: 'Tails Collector',
    goal: 'Flip tails',
    kind: 'grind',
    targets: [8000, 80000, 800000],
    score: (v) => (v.kind === 'coin' && !v.heads ? 1 : 0),
    perk: { name: 'Pity Flip', describe: (t) => `${pct(byTier(PITY_CHANCE, t))} of tails earn a free bonus play` },
  },
  {
    id: 'ceilingBreaker',
    table: 'coinflip',
    name: 'Ceiling Breaker',
    goal: 'Hit the maximum payout',
    kind: 'grind',
    targets: [100, 1000, 10000],
    score: (_v, o) => (o.capped ? 1 : 0),
    perk: { name: 'Raised Ceiling', describe: (t) => `+${pct(byTier(RAISED_CEILING, t))} maximum payout on this table` },
  },
  {
    id: 'secondWind',
    table: 'coinflip',
    name: 'Second Wind',
    goal: 'Win a round after a Lucky Charm re-roll',
    kind: 'grind',
    targets: [500, 5000, 50000],
    score: (_v, o) => (o.rerolled && o.net > 0 ? 1 : 0),
    perk: {
      name: 'Double Luck',
      describe: (t) => `A failed re-roll can be re-rolled again at ${pct(byTier(DOUBLE_LUCK_FRACTION, t))} of Lucky Charm's chance`,
    },
  },

  // Slots
  {
    id: 'tripleCrown',
    table: 'slots',
    name: 'Triple Crown',
    goal: 'Land three of a kind',
    kind: 'grind',
    targets: [5000, 50000, 500000],
    score: (v) => (v.kind === 'slots' && v.reels[0] === v.reels[1] && v.reels[1] === v.reels[2] ? 1 : 0),
    perk: {
      name: 'Cascade',
      describe: (t) => `Three of a kind spins again for free, chaining up to ${byTier(CASCADE_SPINS, t)} more spin${t > 1 ? 's' : ''}`,
    },
  },
  {
    id: 'cherrySeason',
    table: 'slots',
    name: 'Cherry Season',
    goal: 'See cherries on the reels',
    kind: 'grind',
    targets: [20000, 200000, 2000000],
    score: (v) => (v.kind === 'slots' ? v.reels.filter((r) => r === 0).length : 0),
    perk: {
      name: 'Hold & Respin',
      describe: (t) => `${pct(byTier(HOLD_CHANCE, t))} of spins hold their cherries and respin the other reels`,
    },
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
      name: 'Free Spins',
      describe: (t) => `A 2×+ win awards ${byTier(FREE_SPINS, t)} free spin${byTier(FREE_SPINS, t) > 1 ? 's' : ''} that pay in full`,
    },
  },
  {
    id: 'diamondMine',
    table: 'slots',
    name: 'Diamond Mine',
    goal: 'See diamonds on the reels',
    kind: 'grind',
    targets: [500, 5000, 50000],
    score: (v) => (v.kind === 'slots' ? v.reels.filter((r) => r === 5).length : 0),
    perk: {
      name: 'Wild Diamond',
      describe: (t) =>
        `💎 completes a line as a wild for ${t >= 3 ? 'every symbol' : t === 2 ? '🍒 🍋 🔔 and 🍀' : '🍒 and 🍋'}`,
    },
  },
  {
    id: 'sevenHeaven',
    table: 'slots',
    name: 'Seven Heaven',
    goal: 'See sevens on the reels',
    kind: 'grind',
    targets: [2000, 20000, 200000],
    score: (v) => (v.kind === 'slots' ? v.reels.filter((r) => r === 4).length : 0),
    perk: {
      name: 'Scatter Sevens',
      describe: (t) => `Every 7️⃣ anywhere on the reels pays ${byTier(SCATTER_PAY, t)}× your stake`,
    },
  },

  // Roulette
  {
    id: 'zeroHero',
    table: 'roulette',
    name: 'Zero Hero',
    goal: 'Watch the ball land on zero',
    kind: 'grind',
    targets: [1000, 10000, 100000],
    score: (v) => (v.kind === 'roulette' && v.pocket === 0 ? 1 : 0),
    perk: { name: 'Green Machine', describe: (t) => `Zero is a win: it pays every bet ${byTier(GREEN_MACHINE_MULT, t)}×` },
  },
  {
    id: 'luckySeventeen',
    table: 'roulette',
    name: 'Lucky Seventeen',
    goal: 'Hit 17',
    kind: 'grind',
    targets: [750, 7500, 75000],
    score: (v) => (v.kind === 'roulette' && v.pocket === 17 ? 1 : 0),
    perk: {
      name: 'House Chip',
      describe: (t) => `A free chip worth ${pct(byTier(HOUSE_CHIP, t))} of your stake sits on 17 and doesn't dilute your other bets`,
    },
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
      name: 'Black Bleed',
      describe: (t) => `The colour bet also wins on black ${BLEED_POCKETS.slice(0, byTier(BLACK_BLEED, t)).join(', ')}`,
    },
  },
  {
    id: 'dozenDigger',
    table: 'roulette',
    name: 'Dozen Digger',
    goal: 'Hit a number from 1 to 12',
    kind: 'grind',
    targets: [8000, 80000, 800000],
    score: (v) => (v.kind === 'roulette' && v.pocket >= 1 && v.pocket <= 12 ? 1 : 0),
    perk: {
      name: 'Dozen Creep',
      describe: (t) => `The dozen bet also covers 13–${12 + byTier(DOZEN_CREEP, t)}`,
    },
  },
  {
    id: 'wheelSpinner',
    table: 'roulette',
    name: 'Wheel Spinner',
    goal: 'Spin the wheel',
    kind: 'grind',
    targets: [25000, 250000, 2500000],
    score: (v) => (v.kind === 'roulette' ? 1 : 0),
    perk: {
      name: 'Double Spin',
      describe: (t) => `${pct(byTier(DOUBLE_SPIN_CHANCE, t))} of spins roll twice and both pay`,
    },
  },

  // Blackjack
  {
    id: 'naturalBorn',
    table: 'blackjack',
    name: 'Natural Born',
    goal: 'Be dealt a natural',
    kind: 'grind',
    targets: [3000, 30000, 300000],
    score: (v) => (v.kind === 'blackjack' && v.outcome === 'natural' ? 1 : 0),
    perk: {
      name: 'Rich Shoe',
      describe: (t) => `Your draws are weighted toward tens (${byTier(TEN_WEIGHT, t)} in ${9 + byTier(TEN_WEIGHT, t)} instead of 4 in 13)`,
    },
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
      name: 'Burn Card',
      describe: (t) =>
        `A busting card is burned and redrawn (${pct(byTier(BURN_CHANCE, t))}, up to ${times(byTier(BURN_TRIES, t))})`,
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
      name: 'Surrender',
      describe: (t) =>
        `A hard ${byTier(SURRENDER_FLOOR, t)}–16 against a dealer ten or ace folds for half your bet back`,
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

/** Seeds grind counts from lifetime play stats, so saves from before achievements aren't starting at zero. */
export function backfillAchievements(state: GameState): Record<string, AchievementProgress> {
  const out = newAchievements();
  const s = (id: TableId) => state.tables[id].history.stats;
  const seed: Record<string, number> = {
    headsCollector: s('coinflip').coin.heads,
    tripleCrown: s('slots').slots.triples,
    cherrySeason: s('slots').slots.symbols[0] ?? 0,
    sevenHeaven: s('slots').slots.symbols[4] ?? 0,
    diamondMine: s('slots').slots.symbols[5] ?? 0,
    tailsCollector: s('coinflip').coin.tails,
    dozenDigger: s('roulette').roulette.pockets.slice(1, 13).reduce((a, b) => a + b, 0),
    wheelSpinner: s('roulette').roulette.pockets.reduce((a, b) => a + b, 0),
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
