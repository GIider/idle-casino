import type { AchievementProgress, GameState, PlayView, TableId } from './types';
import type { Outcome } from './economy';
import { RED_POCKETS } from '../tables/roulette';

export interface AchievementDef {
  id: string;
  table: TableId;
  name: string;
  /** What the player has to do, e.g. "Flip heads". */
  goal: string;
  /** `collect` is earned by upgrade purchases, not rounds: every upgrade on the table owned at least once. */
  kind: 'grind' | 'streak' | 'collect';
  /** Grind: cumulative count. Streak: run length. Collect: unused (0). */
  target: number;
  /** Grind: how much this round adds to the count (0 = nothing). Streak: 1 if the round extends the run. */
  score(view: PlayView, outcome: Outcome): number;
  perk: { name: string; describe(): string };
}

/** Key under which an achievement's perk level appears in a table's `levels` (`perk_<id>`). */
export function perkKey(id: string): string {
  return `perk_${id}`;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);

// ---- Coin flip -------------------------------------------------------------------------------
/** Let It Ride: chance per link that a win is re-flipped for double, and the longest chain. */
export const RIDE_CHANCE = 0.25;
export const RIDE_LINKS: number = 2;
/** Heat Wave: extra wins the Hot Streak upgrade counts on this table. */
export const HEAT_WAVE_CAP: number = 10;
/** Edge Landing: chance the coin lands on its rim, and what that pays. */
export const EDGE_CHANCE: number = 0.01;
export const EDGE_MULT = 5;
/** Pity Flip: chance that tails earns a free bonus play. */
export const PITY_CHANCE: number = 0.2;
/** Raised Ceiling: extra max payout. */
export const RAISED_CEILING: number = 0.5;
/** Double Luck: second Lucky Charm re-roll, as a fraction of the normal chance. */
export const DOUBLE_LUCK_FRACTION: number = 0.75;
/** Gold Coin capstone: chance per flip of a 25x payout. */
export const GOLD_COIN_CHANCE: number = 0.004;
export const GOLD_COIN_MULT = 25;

// ---- Slots -----------------------------------------------------------------------------------
/** Cascade: free chained spins after a three of a kind. */
export const CASCADE_SPINS: number = 2;
/** Hold & Respin: chance a spin holds its cherries and respins the other reels. */
export const HOLD_CHANCE: number = 0.1;
/** Free Spins: spins awarded by a 2x+ win. */
export const FREE_SPINS: number = 1;
/** Wild Diamond: highest symbol index a 💎 can stand in for (0 🍒, 1 🍋, 3 🍀, 4 7️⃣). */
export const WILD_REACH: number = 3;
/** Scatter Sevens: stake multiples paid per 7️⃣ anywhere on the reels. */
export const SCATTER_PAY: number = 0.5;
/** Jackpot Seed capstone: bonus on 💎💎💎. */
export const JACKPOT_SEED: number = 25;

// ---- Roulette --------------------------------------------------------------------------------
/** Green Machine: what zero pays on every bet. */
export const GREEN_MACHINE_MULT: number = 3;
/** House Chip: free chip on 17, as a share of the stake. */
export const HOUSE_CHIP: number = 0.1;
/** Black Bleed: black pockets the colour bet also wins on (it pays 2x there). */
export const BLACK_BLEED: number = 2;
export const BLEED_POCKETS = [2, 4, 6, 8, 10, 11];
/** Dozen Creep: extra pockets (13, 14, ...) the dozen bet covers. */
export const DOZEN_CREEP: number = 4;
/** Double Spin: chance that a spin rolls twice and both pay. */
export const DOUBLE_SPIN_CHANCE: number = 0.1;
/** Biased Wheel capstone: weight of 16, 17 and 18 (others are 1). */
export const BIASED_WHEEL: number = 3;

// ---- Blackjack -------------------------------------------------------------------------------
/** Rich Shoe: weight of ten-value cards in your draws (the other nine ranks weigh 1; the fair shoe has 4). */
export const TEN_WEIGHT: number = 6;
/** Burn Card: chance per attempt that a busting card is burned and redrawn, and attempts. */
export const BURN_CHANCE: number = 0.5;
export const BURN_TRIES: number = 1;
/** Surrender: lowest hard total you fold on against a dealer ten or ace (up to 16). */
export const SURRENDER_FLOOR: number = 14;
/** Free Double Down: lowest two-card total you double on (up to 11). */
export const DOUBLE_FLOOR: number = 10;
/** Free Split: which pair values may be split (pairs up to 8). */
export const splitAllowed = (value: number): boolean => value <= 8;
/** Charlie: cards a non-bust hand needs to win automatically, and what it pays. */
export const CHARLIE_CARDS: number = 6;
export const CHARLIE_MULT = 2;
/** Hole-Card Peek: chance you see the dealer's hole card. */
export const PEEK_CHANCE: number = 0.5;
/** Perfect Pairs: side-bet bonus (in stakes) for a pair in your first two cards. */
export const PAIR_BONUS: number = 0.6;
/** Even Money: what a dealer natural returns. */
export const EVEN_MONEY: number = 1.25;
/** Dealer Mulligan: chance the dealer's last card is burned and redrawn after beating you. */
export const MULLIGAN_CHANCE: number = 0.2;
/** Card Sharp: Lucky Charm multiplier on this table. */
export const CARD_SHARP_LUCK: number = 2;
/** Second Hand: chance a lost hand is redealt for free. */
export const SECOND_HAND_CHANCE: number = 0.1;
/** Dealer Tilt: the dealer keeps hitting below this total. */
export const TILT_HITS_BELOW: number = 18;
export const CARD_COUNTS = [2, 3, 4, 5, 6] as const;
/** Grind targets by player card count: shorter hands happen far more often than 5- or 6-card hands. */
const CARD_WIN_TARGETS: Record<number, number> = {
  2: 10000,
  3: 3000,
  4: 600,
  5: 100,
  6: 15,
};
const CARD_LOSS_TARGETS: Record<number, number> = {
  2: 3000,
  3: 800,
  4: 250,
  5: 50,
  6: 3,
};

const CARD_WIN_PERKS: Record<number, AchievementDef['perk']> = {
  2: {
    name: 'Free Double Down',
    describe: () =>
      `Two-card ${DOUBLE_FLOOR === 11 ? '11' : `${DOUBLE_FLOOR}–11`} doubles the profit of a win; a loss costs nothing extra`,
  },
  3: {
    name: 'Free Split',
    describe: () =>
      `Pairs up to 8 split into two hands; the second is on the house`,
  },
  4: {
    name: 'Charlie',
    describe: () => `A non-bust hand of ${CHARLIE_CARDS} cards wins automatically at ${CHARLIE_MULT}×`,
  },
  5: {
    name: 'Hole-Card Peek',
    describe: () => `${pct(PEEK_CHANCE)} of hands you see the dealer's hole card and play to beat it`,
  },
  6: {
    name: 'Perfect Pairs',
    describe: () => `A pair in your first two cards pays a ${PAIR_BONUS}× side bet, whatever the hand does`,
  },
};
const CARD_LOSS_PERKS: Record<number, AchievementDef['perk']> = {
  2: {
    name: 'Even Money',
    describe: () => `A dealer natural returns ${EVEN_MONEY}× your bet instead of beating you`,
  },
  3: {
    name: 'Dealer Mulligan',
    describe: () => `${pct(MULLIGAN_CHANCE)} chance the dealer's last card is burned and redrawn after beating you`,
  },
  4: { name: 'Card Sharp', describe: () => `Lucky Charm is ${CARD_SHARP_LUCK}× stronger at this table` },
  5: {
    name: 'Second Hand',
    describe: () => `${pct(SECOND_HAND_CHANCE)} chance a lost hand is redealt for free`,
  },
  6: {
    name: 'Dealer Tilt',
    describe: () => `The dealer keeps hitting until ${TILT_HITS_BELOW} instead of 17`,
  },
};

/** Blackjack hands won (or lost to the dealer) with exactly `cards` cards in the player's hand. */
const cardCount = (cards: number, won: boolean): AchievementDef => ({
  id: `${won ? 'winCards' : 'loseCards'}${cards}`,
  table: 'blackjack',
  name: won ? `${cards}-Card Winner` : `${cards}-Card Loser`,
  goal: won ? `Win with ${cards} cards` : `Lose to the dealer with ${cards} cards`,
  kind: 'grind',
  target: won ? CARD_WIN_TARGETS[cards] : CARD_LOSS_TARGETS[cards],
  score: (v) => {
    if (v.kind !== 'blackjack' || v.player.length !== cards) return 0;
    return won ? (v.outcome === 'win' || v.outcome === 'natural' ? 1 : 0) : v.outcome === 'lose' ? 1 : 0;
  },
  perk: won ? CARD_WIN_PERKS[cards] : CARD_LOSS_PERKS[cards],
});

/** Capstone for owning every upgrade on a table: one unique rule change per table. */
const collection = (table: TableId, name: string, perk: AchievementDef['perk']): AchievementDef => ({
  id: `collect_${table}`,
  table,
  name,
  goal: 'Own every upgrade on this table',
  kind: 'collect',
  target: 0,
  score: () => 0,
  perk,
});

export const ACHIEVEMENTS: AchievementDef[] = [
  collection('coinflip', 'Fully Loaded Coin', {
    name: 'Gold Coin',
    describe: () => `Every flip has a ${(GOLD_COIN_CHANCE * 100).toFixed(1)}% chance to pay ${GOLD_COIN_MULT}×`,
  }),
  collection('slots', 'Fully Loaded Reels', {
    name: 'Jackpot Seed',
    describe: () => `💎💎💎 adds a ${JACKPOT_SEED}× jackpot on top of the line payout`,
  }),
  collection('roulette', 'Fully Loaded Wheel', {
    name: 'Biased Wheel',
    describe: () => `16, 17 and 18 are ${BIASED_WHEEL}× as likely to land`,
  }),
  collection('blackjack', 'Fully Loaded Shoe', {
    name: 'Card Counter',
    describe: () =>
      'You see the next two cards: a busting card is skipped, and you stand if the one after busts too',
  }),

  // Coin flip
  {
    id: 'headsCollector',
    table: 'coinflip',
    name: 'Heads Collector',
    goal: 'Flip heads',
    kind: 'grind',
    target: 10000,
    score: (v) => (v.kind === 'coin' && v.heads ? 1 : 0),
    perk: {
      name: 'Let It Ride',
      describe: () =>
        `After a win, ${pct(RIDE_CHANCE)} to flip the winnings again for double or nothing, up to ${times(RIDE_LINKS)}`,
    },
  },
  {
    id: 'hotHand',
    table: 'coinflip',
    name: 'Hot Hand',
    goal: 'Flip heads in a row',
    kind: 'streak',
    target: 24,
    score: (v) => (v.kind === 'coin' && v.heads ? 1 : 0),
    perk: {
      name: 'Heat Wave',
      describe: () =>
        `Hot Streak counts ${10 + HEAT_WAVE_CAP} wins on this table`,
    },
  },
  {
    id: 'coldComfort',
    table: 'coinflip',
    name: 'Cold Comfort',
    goal: 'Flip tails in a row',
    kind: 'streak',
    target: 7,
    score: (v) => (v.kind === 'coin' && !v.heads ? 1 : 0),
    perk: {
      name: 'Edge Landing',
      describe: () => `${pct(EDGE_CHANCE)} of flips land on the rim and pay ${EDGE_MULT}×`,
    },
  },
  {
    id: 'tailsCollector',
    table: 'coinflip',
    name: 'Tails Collector',
    goal: 'Flip tails',
    kind: 'grind',
    target: 8000,
    score: (v) => (v.kind === 'coin' && !v.heads ? 1 : 0),
    perk: { name: 'Pity Flip', describe: () => `${pct(PITY_CHANCE)} of tails earn a free bonus play` },
  },
  {
    id: 'ceilingBreaker',
    table: 'coinflip',
    name: 'Ceiling Breaker',
    goal: 'Hit the maximum payout',
    kind: 'grind',
    target: 500,
    score: (_v, o) => (o.capped ? 1 : 0),
    perk: { name: 'Raised Ceiling', describe: () => `+${pct(RAISED_CEILING)} maximum payout on this table` },
  },
  {
    id: 'secondWind',
    table: 'coinflip',
    name: 'Second Wind',
    goal: 'Win a round after a Lucky Charm re-roll',
    kind: 'grind',
    target: 500,
    score: (_v, o) => (o.rerolled && o.net > 0 ? 1 : 0),
    perk: {
      name: 'Double Luck',
      describe: () => `A failed re-roll can be re-rolled again at ${pct(DOUBLE_LUCK_FRACTION)} of Lucky Charm's chance`,
    },
  },

  // Slots
  {
    id: 'tripleCrown',
    table: 'slots',
    name: 'Triple Crown',
    goal: 'Land three of a kind',
    kind: 'grind',
    target: 5000,
    score: (v) => (v.kind === 'slots' && v.reels[0] === v.reels[1] && v.reels[1] === v.reels[2] ? 1 : 0),
    perk: {
      name: 'Cascade',
      describe: () => `Three of a kind spins again for free, chaining up to ${CASCADE_SPINS} more spins`,
    },
  },
  {
    id: 'cherrySeason',
    table: 'slots',
    name: 'Cherry Season',
    goal: 'See cherries on the reels',
    kind: 'grind',
    target: 20000,
    score: (v) => (v.kind === 'slots' ? v.reels.filter((r) => r === 0).length : 0),
    perk: {
      name: 'Hold & Respin',
      describe: () => `${pct(HOLD_CHANCE)} of spins hold their cherries and respin the other reels`,
    },
  },
  {
    id: 'hotStreak',
    table: 'slots',
    name: 'Hot Streak',
    goal: 'Get paid at least your stake in a row',
    kind: 'streak',
    target: 14,
    score: (v, o) => (v.kind === 'slots' && o.payout >= o.bet ? 1 : 0),
    perk: {
      name: 'Free Spins',
      describe: () => `A 2×+ win awards ${FREE_SPINS} free spin${FREE_SPINS > 1 ? 's' : ''} that pay in full`,
    },
  },
  {
    id: 'diamondMine',
    table: 'slots',
    name: 'Diamond Mine',
    goal: 'See diamonds on the reels',
    kind: 'grind',
    target: 500,
    score: (v) => (v.kind === 'slots' ? v.reels.filter((r) => r === 5).length : 0),
    perk: {
      name: 'Wild Diamond',
      describe: () =>
        `💎 completes a line as a wild for 🍒 🍋 🔔 and 🍀`,
    },
  },
  {
    id: 'sevenHeaven',
    table: 'slots',
    name: 'Seven Heaven',
    goal: 'See sevens on the reels',
    kind: 'grind',
    target: 2000,
    score: (v) => (v.kind === 'slots' ? v.reels.filter((r) => r === 4).length : 0),
    perk: {
      name: 'Scatter Sevens',
      describe: () => `Every 7️⃣ anywhere on the reels pays ${SCATTER_PAY}× your stake`,
    },
  },

  // Roulette
  {
    id: 'zeroHero',
    table: 'roulette',
    name: 'Zero Hero',
    goal: 'Watch the ball land on zero',
    kind: 'grind',
    target: 150,
    score: (v) => (v.kind === 'roulette' && v.pocket === 0 ? 1 : 0),
    perk: { name: 'Green Machine', describe: () => `Zero is a win: it pays every bet ${GREEN_MACHINE_MULT}×` },
  },
  {
    id: 'luckySeventeen',
    table: 'roulette',
    name: 'Lucky Seventeen',
    goal: 'Hit 17',
    kind: 'grind',
    target: 750,
    score: (v) => (v.kind === 'roulette' && v.pocket === 17 ? 1 : 0),
    perk: {
      name: 'House Chip',
      describe: () => `A free chip worth ${pct(HOUSE_CHIP)} of your stake sits on 17 and doesn't dilute your other bets`,
    },
  },
  {
    id: 'colourRun',
    table: 'roulette',
    name: 'Red Run',
    goal: 'Spin red in a row',
    kind: 'streak',
    target: 9,
    score: (v) => (v.kind === 'roulette' && RED_POCKETS.has(v.pocket) ? 1 : 0),
    perk: {
      name: 'Black Bleed',
      describe: () => `The colour bet also wins on black ${BLEED_POCKETS.slice(0, BLACK_BLEED).join(', ')}`,
    },
  },
  {
    id: 'dozenDigger',
    table: 'roulette',
    name: 'Dozen Digger',
    goal: 'Hit a number from 1 to 12',
    kind: 'grind',
    target: 8000,
    score: (v) => (v.kind === 'roulette' && v.pocket >= 1 && v.pocket <= 12 ? 1 : 0),
    perk: {
      name: 'Dozen Creep',
      describe: () => `The dozen bet also covers 13–${12 + DOZEN_CREEP}`,
    },
  },
  {
    id: 'wheelSpinner',
    table: 'roulette',
    name: 'Wheel Spinner',
    goal: 'Spin the wheel',
    kind: 'grind',
    target: 25000,
    score: (v) => (v.kind === 'roulette' ? 1 : 0),
    perk: {
      name: 'Double Spin',
      describe: () => `${pct(DOUBLE_SPIN_CHANCE)} of spins roll twice and both pay`,
    },
  },

  // Blackjack
  {
    id: 'naturalBorn',
    table: 'blackjack',
    name: 'Natural Born',
    goal: 'Be dealt a natural',
    kind: 'grind',
    target: 3000,
    score: (v) => (v.kind === 'blackjack' && v.outcome === 'natural' ? 1 : 0),
    perk: {
      name: 'Rich Shoe',
      describe: () => `Your draws are weighted toward tens (${TEN_WEIGHT} in ${9 + TEN_WEIGHT} instead of 4 in 13)`,
    },
  },
  {
    id: 'bustOut',
    table: 'blackjack',
    name: 'Bust Out',
    goal: 'Bust',
    kind: 'grind',
    target: 150,
    score: (v) => (v.kind === 'blackjack' && v.outcome === 'bust' ? 1 : 0),
    perk: {
      name: 'Burn Card',
      describe: () =>
        `A busting card is burned and redrawn (${pct(BURN_CHANCE)}, up to ${times(BURN_TRIES)})`,
    },
  },
  {
    id: 'winStreak',
    table: 'blackjack',
    name: 'Winning Run',
    goal: 'Win hands in a row',
    kind: 'streak',
    target: 9,
    score: (v) => (v.kind === 'blackjack' && (v.outcome === 'win' || v.outcome === 'natural') ? 1 : 0),
    perk: {
      name: 'Surrender',
      describe: () =>
        `A hard ${SURRENDER_FLOOR}–16 against a dealer ten or ace folds for half your bet back`,
    },
  },
  ...CARD_COUNTS.map((n) => cardCount(n, true)),
  ...CARD_COUNTS.map((n) => cardCount(n, false)),
];

export function achievementsFor(table: TableId): AchievementDef[] {
  return ACHIEVEMENTS.filter((a) => a.table === table);
}

export function newProgress(): AchievementProgress {
  return { count: 0, run: 0, best: 0, unlocked: false, seen: true };
}

export function newAchievements(): Record<string, AchievementProgress> {
  const out: Record<string, AchievementProgress> = {};
  for (const a of ACHIEVEMENTS) out[a.id] = newProgress();
  return out;
}

/** Grind and streak goals are met by `count` / `best`. Collection goals are only ever met by `observeUpgrades`. */
function reached(def: AchievementDef, progress: AchievementProgress): boolean {
  if (def.kind === 'collect') return progress.unlocked;
  return (def.kind === 'grind' ? progress.count : progress.best) >= def.target;
}

/** Feeds one round into the table's achievements. Returns those that unlocked. */
export function observeRound(
  achievements: Record<string, AchievementProgress>,
  table: TableId,
  outcome: Outcome,
): AchievementDef[] {
  const view = outcome.view;
  const gained: AchievementDef[] = [];
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
    if (!p.unlocked && reached(def, p)) {
      p.unlocked = true;
      p.seen = false;
      gained.push(def);
    }
  }
  return gained;
}

/**
 * Feeds a table's current upgrade levels into its collection achievement. Unlocking is permanent: it
 * survives the upgrades being reset by prestige. `count`/`best` keep the most upgrades ever owned/maxed at once.
 */
export function observeUpgrades(
  achievements: Record<string, AchievementProgress>,
  table: TableId,
  upgrades: { id: string; maxLevel: number }[],
  levels: Record<string, number>,
): AchievementDef[] {
  const gained: AchievementDef[] = [];
  if (upgrades.length === 0) return gained;
  const owned = upgrades.filter((u) => (levels[u.id] ?? 0) >= 1).length;
  const maxed = upgrades.filter((u) => (levels[u.id] ?? 0) >= u.maxLevel).length;
  for (const def of achievementsFor(table)) {
    if (def.kind !== 'collect') continue;
    const p = (achievements[def.id] ??= newProgress());
    p.count = Math.max(p.count, owned);
    p.best = Math.max(p.best, maxed);
    if (!p.unlocked && owned === upgrades.length) {
      p.unlocked = true;
      p.seen = false;
      gained.push(def);
    }
  }
  return gained;
}

/** Achievements unlocked but not yet noticed by the player. */
export function unseenCount(achievements: Record<string, AchievementProgress>): number {
  return Object.values(achievements).filter((p) => p.unlocked && !p.seen).length;
}

/** The perks unlocked on a table, keyed the way `TableDef.play` reads them (level 1 = unlocked). */
export function perkLevels(achievements: Record<string, AchievementProgress>, table: TableId): Record<string, number> {
  const out: Record<string, number> = {};
  for (const def of achievementsFor(table)) {
    if (achievements[def.id]?.unlocked) out[perkKey(def.id)] = 1;
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
    p.unlocked = reached(def, p);
  }
  return out;
}

/**
 * Validates untrusted achievement data: unknown ids are dropped, numbers clamped. Saves from the tiered
 * era (`tier` 0-3) unlock on any earned tier, so no perk a player already had is taken back.
 */
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
    // Targets can be raised or lowered between versions; an unlock that was earned is never taken back.
    p.unlocked = src.unlocked === true || n(src.tier) > 0 || reached(def, p);
    // Saves from before this flag existed count as seen, so loading one doesn't flag everything as new.
    p.seen = src.seen !== false;
  }
  return out;
}
