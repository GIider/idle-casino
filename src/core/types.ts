export type Rng = () => number;

export type TableId = 'coinflip' | 'slots' | 'roulette' | 'blackjack';

export interface TableState {
  unlocked: boolean;
  /** This table's own currency: it is the stake, pays for the table's upgrades and unlocks the next table. */
  wallet: number;
  prestige: number;
  /** Upgrade levels by upgrade id (includes the common upgrades luck/payout/speed/autobet). */
  levels: Record<string, number>;
  /** Net profit since the last prestige of this table. */
  profit: number;
  lifetimeProfit: number;
  plays: number;
  /** Sampled lifetime-profit series for the history chart. */
  history: History;
  /** Consecutive won rounds (feeds the Hot Streak upgrade); reset by a loss, prestige and ascension. */
  streak: number;
  /** Highest wallet reached since the last ascension; prestiging or spending never lowers it. Ascension progress reads it. */
  peakWallet: number;
  /** Share (0..1) of the previous table's wallet this table may stake from; unused by the first table. */
  feedShare: number;
}

/** A bounded, down-sampled series of [x, value] points with vertical event marks at given x positions. */
export interface Series {
  /** Minimum x distance between samples; doubles each time the series is compacted. */
  step: number;
  points: [number, number][];
  marks: number[];
}

/** `points` are [playCount, lifetimeProfit]; `marks` are play counts at which the table was prestiged. */
export interface History extends Series {
  /** Income series for the table chart: [playCount, net currency per second over the last sample window]. */
  rate: Series;
  /** Seconds this table has spent playing (live ticks plus offline time), the denominator for `rate`. */
  clock: number;
  /** [clock, lifetimeProfit] at the previous `rate` sample. */
  rateFrom: [number, number];
  /** Per-game outcome tallies for the game-specific history views. */
  stats: PlayStats;
}

export interface CoinStats {
  heads: number;
  tails: number;
  /** Signed run length: positive = current heads streak, negative = tails streak. */
  streak: number;
  longest: number;
  /** Rounds decided by a gold coin, an edge landing, a ridden win. */
  gold: number;
  edge: number;
  ride: number;
  /** Most recent flips, oldest first (0 = tails, 1 = heads, 2 = gold coin, 3 = edge landing, 4 = ridden win). */
  recent: number[];
}

export interface SlotsStats {
  /** Reel symbol appearances, indexed by symbol. */
  symbols: number[];
  /** Rounds with all three reels matching. */
  triples: number;
  /** Rounds with exactly two matching reels. */
  pairs: number;
  rounds: number;
  /** Triples and pairs by matching symbol. */
  tripleBy: number[];
  pairBy: number[];
  /** Rounds that chained a cascade, earned free spins, or paid scatter sevens. */
  cascades: number;
  freeSpins: number;
  scatters: number;
  /** The last few spins' reels, oldest first. */
  recent: number[][];
}

export interface RouletteStats {
  /** Hit counts per pocket 0-36. */
  pockets: number[];
  /** Most recent pockets, oldest first. */
  recent: number[];
}

export interface BlackjackStats {
  natural: number;
  win: number;
  push: number;
  lose: number;
  bust: number;
  /** Hands won by a double, a split, a surrender, a Charlie, or saved by insurance. */
  doubled: number;
  split: number;
  surrendered: number;
  charlie: number;
  insured: number;
  /** The last few hands, oldest first. */
  recent: BlackjackHand[];
}

export interface BlackjackHand {
  player: number[];
  dealer: number[];
  outcome: 'natural' | 'bust' | 'win' | 'push' | 'lose';
  /** Second hand of a free split. */
  split?: number[];
  doubled?: boolean;
  surrendered?: boolean;
}

export interface PlayStats {
  coin: CoinStats;
  slots: SlotsStats;
  roulette: RouletteStats;
  blackjack: BlackjackStats;
}

/** Lifetime progress on one achievement. Survives table prestige and casino ascension. */
export interface AchievementProgress {
  /** Grind achievements: running total. */
  count: number;
  /** Streak achievements: current run. */
  run: number;
  /** Streak achievements: longest run. */
  best: number;
  /** Goal met: the achievement's perk is active. Permanent. */
  unlocked: boolean;
  /** The player has noticed the unlock (hovered it on the achievements page). Unlocks start unseen. */
  seen: boolean;
}

/** Casino-wide meta progression, kept across ascensions. */
export interface CasinoState {
  /** Spendable chips. */
  chips: number;
  /** Chips earned over all ascensions. */
  totalChips: number;
  ascensions: number;
  levels: Record<string, number>;
}

export interface GameState {
  version: number;
  tables: Record<TableId, TableState>;
  casino: CasinoState;
  achievements: Record<string, AchievementProgress>;
  created: number;
  lastSaved: number;
}

/** Raw result of one game round. `mult` is gross return divided by the bet. */
export interface PlayResult {
  mult: number;
  detail: string;
  /** Structured description of the round, for rendering. */
  view?: PlayView;
  /** The round earned a free follow-up play (Pity Flip). */
  bonusPlay?: boolean;
}

export type PlayView =
  | { kind: 'coin'; heads: boolean; /** Special payout that decided the flip. */ special?: 'gold' | 'edge' | 'ride' }
  | { kind: 'slots'; reels: number[]; cascade?: boolean; freeSpins?: boolean; scatter?: boolean }
  | { kind: 'roulette'; pocket: number; bets: string[] }
  | { kind: 'blackjack'; player: number[]; dealer: number[]; outcome: 'natural' | 'bust' | 'win' | 'push' | 'lose'; insured: boolean; /** The second hand of a free split. */ split?: number[]; doubled?: boolean; surrendered?: boolean; charlie?: boolean };

export interface UpgradeDef {
  id: string;
  name: string;
  description: string;
  /** Cost of level 1, expressed in multiples of the table's current minimum bet. */
  baseCost: number;
  growth: number;
  maxLevel: number;
}

export interface TableDef {
  id: TableId;
  name: string;
  icon: string;
  blurb: string;
  /** The table's own currency. */
  currency: { name: string; icon: string };
  /**
   * Units of the previous table's currency one unit of bet costs. Winnings are paid out in this table's own
   * currency. Absent on the first table, which stakes and wins its own currency.
   */
  stakeCost?: number;
  /** Price to unlock, paid in the previous table's currency (0 = available from the start). */
  unlockCost: number;
  baseMinBet: number;
  baseMaxBet: number;
  /** Maximum profit a single play can pay out. */
  baseMaxPayout: number;
  /** Built-in winnings bonus (0.1 = +10%): lets a table grow on its own wallet before any upgrades. */
  baseWinBonus: number;
  upgrades: UpgradeDef[];
  play(rng: Rng, levels: Record<string, number>): PlayResult;
}
