export type Rng = () => number;

export type TableId = 'coinflip' | 'slots' | 'roulette' | 'blackjack';

export interface TableState {
  unlocked: boolean;
  prestige: number;
  /** Upgrade levels by upgrade id (includes the common upgrades luck/payout/auto/speed). */
  levels: Record<string, number>;
  bet: number;
  option: string;
  /** Net profit since the last prestige of this table. */
  profit: number;
  lifetimeProfit: number;
  plays: number;
  /** Sampled lifetime-profit series for the history chart. */
  history: History;
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
/** Bankroll series; `rounds` is a global play counter that never resets, used as the x axis. */
export interface BankrollHistory extends Series {
  rounds: number;
  /** Cumulative net winnings from plays at each table, kept across prestige and ascension. */
  net: Record<TableId, number>;
  /** `net` sampled over `rounds`, one series per table, for the contribution view. */
  contrib: Record<TableId, Series>;
}

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
}

export interface GameState {
  version: number;
  money: number;
  tables: Record<TableId, TableState>;
  /** Casino-wide bankroll over time. `points` are [rounds, money]; `marks` are rounds at which the casino was ascended. */
  bankroll: BankrollHistory;
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
}

export type PlayView =
  | { kind: 'coin'; heads: boolean }
  | { kind: 'slots'; reels: number[] }
  | { kind: 'roulette'; pocket: number; option: string }
  | { kind: 'blackjack'; player: number[]; dealer: number[]; outcome: 'natural' | 'bust' | 'win' | 'push' | 'lose'; insured: boolean };

export interface UpgradeDef {
  id: string;
  name: string;
  description: string;
  /** Cost of level 1, expressed in multiples of the table's current minimum bet. */
  baseCost: number;
  growth: number;
  maxLevel: number;
}

export interface TableOption {
  id: string;
  name: string;
}

export interface TableDef {
  id: TableId;
  name: string;
  icon: string;
  blurb: string;
  unlockCost: number;
  baseMinBet: number;
  baseMaxBet: number;
  /** Maximum profit a single play can pay out. */
  baseMaxPayout: number;
  upgrades: UpgradeDef[];
  options?: TableOption[];
  play(rng: Rng, levels: Record<string, number>, option: string): PlayResult;
}
