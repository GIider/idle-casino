export type Rng = () => number;

export type TableId = 'coinflip' | 'slots' | 'roulette' | 'blackjack';
export type AutoStrategy = 'min' | 'pct' | 'max';

export interface TableState {
  unlocked: boolean;
  prestige: number;
  /** Upgrade levels by upgrade id (includes the common upgrades luck/payout/auto/speed). */
  levels: Record<string, number>;
  bet: number;
  option: string;
  autoStrategy: AutoStrategy;
  /** Net profit since the last prestige of this table. */
  profit: number;
  lifetimeProfit: number;
  plays: number;
}

export interface GameState {
  version: number;
  money: number;
  tables: Record<TableId, TableState>;
  created: number;
  lastSaved: number;
}

/** Raw result of one game round. `mult` is gross return divided by the bet. */
export interface PlayResult {
  mult: number;
  detail: string;
}

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
