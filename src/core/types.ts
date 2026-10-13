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
  /** Most recent flips, oldest first (1 = heads). */
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
  /** Rarity tier reached (0 = locked); also the level of the achievement's perk. */
  tier: number;
}

/** Casino-wide meta progression, kept across ascensions. */
export interface CasinoState {
  /** Spendable chips. */
  chips: number;
  /** Chips earned over all ascensions. */
  totalChips: number;
  ascensions: number;
  levels: Record<string, number>;
  /** Floor Manager (level 4): prestige a table automatically as soon as it can. */
  autoPrestige: boolean;
  /** Upgrades the Floor Manager must not buy, keyed `table:upgradeId`. */
  autoOff: string[];
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
  | { kind: 'coin'; heads: boolean }
  | { kind: 'slots'; reels: number[] }
  | { kind: 'roulette'; pocket: number; bets: string[] }
  | { kind: 'blackjack'; player: number[]; dealer: number[]; outcome: 'natural' | 'bust' | 'win' | 'push' | 'lose'; insured: boolean; /** The second hand of a free split. */ split?: number[]; doubled?: boolean; surrendered?: boolean };

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
