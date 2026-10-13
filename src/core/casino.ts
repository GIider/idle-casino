import type { CasinoState } from './types';

export interface CasinoUpgradeDef {
  id: string;
  name: string;
  description: string;
  /** Cost of level 1 in chips. */
  baseCost: number;
  growth: number;
  maxLevel: number;
}

export const CASINO_UPGRADES: CasinoUpgradeDef[] = [
  {
    id: 'startCash',
    name: 'Trust Fund',
    description: 'Start every ascension with +250 Pennies per level',
    baseCost: 1,
    growth: 1.5,
    maxLevel: 20,
  },
  {
    id: 'payout',
    name: 'House Edge Trimmed',
    description: '+10% winnings on every table, per level',
    baseCost: 2,
    growth: 1.7,
    maxLevel: 20,
  },
  {
    id: 'luck',
    name: 'Rabbit\'s Foot',
    description: '+1% chance per level to re-roll a losing round on every table',
    baseCost: 3,
    growth: 1.7,
    maxLevel: 15,
  },
  {
    id: 'speed',
    name: 'Espresso Machine',
    description: 'Auto-players everywhere act 10% faster, per level',
    baseCost: 2,
    growth: 1.6,
    maxLevel: 15,
  },
  {
    id: 'upgradeDiscount',
    name: 'Contractor Discount',
    description: 'Table upgrades are 4% cheaper, per level',
    baseCost: 4,
    growth: 1.8,
    maxLevel: 10,
  },
  {
    id: 'prestigeDiscount',
    name: 'VIP Fast Track',
    description: 'Table prestige needs 5% less profit, per level',
    baseCost: 5,
    growth: 1.9,
    maxLevel: 10,
  },
  {
    id: 'offline',
    name: 'Night Shift',
    description: 'Offline earnings are 5% more efficient and last 1 hour longer, per level',
    baseCost: 3,
    growth: 1.7,
    maxLevel: 10,
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
  const lv = (id: string) => casino.levels[id] ?? 0;
  return {
    payout: 1 + 0.1 * lv('payout'),
    luck: 0.01 * lv('luck'),
    speed: 1 + 0.1 * lv('speed'),
    upgradeCost: 1 - 0.04 * lv('upgradeDiscount'),
    prestigeCost: 1 - 0.05 * lv('prestigeDiscount'),
    offlineEfficiency: 0.05 * lv('offline'),
    offlineHours: lv('offline'),
    startCash: 250 * lv('startCash'),
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
