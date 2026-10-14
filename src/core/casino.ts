import type { CasinoState } from './types';

export interface CasinoUpgradeDef {
  id: string;
  name: string;
  description: string;
  /** Cost of level 1 in chips. */
  baseCost: number;
  growth: number;
  maxLevel: number;
  /** Another shop upgrade that must be owned (at this level) before this one can be bought. */
  requires?: { id: string; level: number };
}

export const CASINO_UPGRADES: CasinoUpgradeDef[] = [
  {
    id: 'manager',
    name: 'Floor Manager',
    description: 'Buys the cheapest affordable table upgrade for you every 10s',
    baseCost: 1,
    growth: 1,
    maxLevel: 1,
  },
  {
    id: 'overtime',
    name: 'Overtime Shifts',
    description: 'The Floor Manager buys every 5s (Lv1), then every 2s (Lv2)',
    baseCost: 1,
    growth: 1,
    maxLevel: 2,
    requires: { id: 'manager', level: 1 },
  },
  {
    id: 'concierge',
    name: 'Concierge',
    description: 'The Floor Manager prestiges a table as soon as it can (switchable)',
    baseCost: 2,
    growth: 1,
    maxLevel: 1,
    requires: { id: 'manager', level: 1 },
  },
  {
    id: 'bulkbuy',
    name: 'Bulk Orders',
    description: 'Adds a "Buy cheapest" button to every table: keeps buying the cheapest affordable upgrade until the wallet runs out',
    baseCost: 1,
    growth: 1,
    maxLevel: 1,
  },
];

/** Casino-wide modifiers derived from shop levels; the identity is `NO_BONUS`. */
export interface CasinoBonus {
  payout: number;
  luck: number;
  speed: number;
  upgradeCost: number;
  prestigeCost: number;
  offlineEfficiency: number;
  offlineHours: number;
  startCash: number;
}

/** Winnings multiplier every ascension adds permanently (compounding), on top of any shop purchases. */
export const ASCENSION_WINNINGS_BONUS = 1.5;

/** Seconds between Floor Manager purchases by Overtime Shifts level (index 0 = no overtime). */
export const MANAGER_INTERVALS = [10, 5, 2];
/** The manager only buys if the wallet still covers this many minimum bets afterwards. */
export const MANAGER_RESERVE_BETS = 20;

export function ascensionMultiplier(ascensions: number): number {
  return ASCENSION_WINNINGS_BONUS ** Math.max(0, ascensions);
}

/** Seconds between auto-purchases, or 0 if there is no manager. */
export function managerInterval(managerLevel: number, overtimeLevel = 0): number {
  if (managerLevel <= 0) return 0;
  return MANAGER_INTERVALS[Math.min(Math.max(0, overtimeLevel), MANAGER_INTERVALS.length - 1)];
}

export const NO_BONUS: CasinoBonus = {
  payout: 1,
  luck: 0,
  speed: 1,
  upgradeCost: 1,
  prestigeCost: 1,
  offlineEfficiency: 0,
  offlineHours: 0,
  startCash: 0,
};

/** Wallet needed in the final table's currency to ascend (Markers). */
export const ASCEND_BASE_THRESHOLD = 5e8;
export const ASCEND_THRESHOLD_GROWTH = 5;

export function casinoBonus(casino: CasinoState): CasinoBonus {
  return {
    ...NO_BONUS,
    payout: ascensionMultiplier(casino.ascensions),
  };
}

export function casinoUpgradeCost(upg: CasinoUpgradeDef, level: number): number {
  return Math.ceil(upg.baseCost * upg.growth ** level);
}

/** Final-table wallet needed to ascend; each ascension raises the bar. */
export function ascensionThreshold(ascensions: number): number {
  return ASCEND_BASE_THRESHOLD * ASCEND_THRESHOLD_GROWTH ** ascensions;
}

export function canAscendWith(money: number, ascensions: number): boolean {
  return money >= ascensionThreshold(ascensions);
}

/** Chips earned for ascending with `money`: 1 at the threshold, +3 per decade above it. */
export function ascensionReward(money: number, ascensions: number): number {
  const threshold = ascensionThreshold(ascensions);
  if (money < threshold) return 0;
  return 1 + Math.floor(3 * Math.log10(money / threshold));
}

/** Shop items removed in the rebalance, with their old cost curves, so old saves can be refunded. */
export const LEGACY_UPGRADES: Record<string, { baseCost: number; growth: number }> = {
  luck: { baseCost: 3, growth: 1.7 },
  speed: { baseCost: 2, growth: 1.6 },
  upgradeDiscount: { baseCost: 4, growth: 1.8 },
  prestigeDiscount: { baseCost: 5, growth: 1.9 },
  startCash: { baseCost: 1, growth: 1.5 },
  policy: { baseCost: 5, growth: 1 },
  payout: { baseCost: 2, growth: 1.7 },
  seed: { baseCost: 2, growth: 1.6 },
  offline: { baseCost: 3, growth: 1.7 },
};

/** Chips spent on levels `from` (inclusive) up to `to` (exclusive) of a cost curve. */
export function curveCost(curve: { baseCost: number; growth: number }, from: number, to: number): number {
  let total = 0;
  for (let l = from; l < to; l++) total += Math.ceil(curve.baseCost * curve.growth ** l);
  return total;
}
