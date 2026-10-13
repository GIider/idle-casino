import type { AutoStrategy, Rng, TableDef, TableState, UpgradeDef } from './types';

export const COMMON_UPGRADES: UpgradeDef[] = [
  {
    id: 'luck',
    name: 'Lucky Charm',
    description: '+2.5% chance per level to re-roll a losing round',
    baseCost: 25,
    growth: 1.7,
    maxLevel: 20,
  },
  {
    id: 'payout',
    name: 'High Roller Perks',
    description: '+8% per level on all winnings',
    baseCost: 40,
    growth: 1.8,
    maxLevel: 20,
  },
  {
    id: 'auto',
    name: 'Hire Auto-Player',
    description: 'Another player sits down and plays on their own',
    baseCost: 20,
    growth: 1.45,
    maxLevel: 25,
  },
  {
    id: 'speed',
    name: 'Caffeine Drip',
    description: 'Auto-players act 25% faster',
    baseCost: 40,
    growth: 1.9,
    maxLevel: 12,
  },
];

export const MIN_BET_GROWTH = 3;
export const MAX_BET_GROWTH = 5;
export const MAX_PAYOUT_GROWTH = 5;
export const PRESTIGE_THRESHOLD_GROWTH = 10;
export const PRESTIGE_PAYOUT_BONUS = 0.1;
export const AUTO_BASE_RATE = 1;
export const MAX_AUTO_PLAYS_PER_TICK = 300;
export const OFFLINE_CAP_SECONDS = 8 * 3600;
export const OFFLINE_EFFICIENCY = 0.5;
export const BAILOUT_BETS = 10;

export function allUpgrades(def: TableDef): UpgradeDef[] {
  return [...COMMON_UPGRADES, ...def.upgrades];
}

export function minBet(def: TableDef, prestige: number): number {
  return def.baseMinBet * MIN_BET_GROWTH ** prestige;
}

export function maxBet(def: TableDef, prestige: number): number {
  return def.baseMaxBet * MAX_BET_GROWTH ** prestige;
}

export function maxPayout(def: TableDef, prestige: number): number {
  return def.baseMaxPayout * MAX_PAYOUT_GROWTH ** prestige;
}

export function upgradeCost(def: TableDef, upg: UpgradeDef, prestige: number, level: number): number {
  return Math.ceil(upg.baseCost * def.baseMinBet * MAX_BET_GROWTH ** prestige * upg.growth ** level);
}

export function prestigeThreshold(def: TableDef, prestige: number): number {
  return def.baseMinBet * 2500 * PRESTIGE_THRESHOLD_GROWTH ** prestige;
}

export function luckChance(levels: Record<string, number>): number {
  return 0.025 * (levels.luck ?? 0);
}

export function payoutMultiplier(levels: Record<string, number>, prestige: number): number {
  return (1 + 0.08 * (levels.payout ?? 0)) * (1 + PRESTIGE_PAYOUT_BONUS * prestige);
}

export function autoPlaysPerSecond(levels: Record<string, number>): number {
  return (levels.auto ?? 0) * AUTO_BASE_RATE * 1.25 ** (levels.speed ?? 0);
}

export function clampBet(def: TableDef, prestige: number, bet: number): number {
  const lo = minBet(def, prestige);
  const hi = maxBet(def, prestige);
  if (!Number.isFinite(bet)) return lo;
  return Math.min(hi, Math.max(lo, Math.floor(bet)));
}

/** The bet an auto-player places, or 0 if the bankroll can't cover the minimum. */
export function chooseAutoBet(def: TableDef, ts: TableState, money: number): number {
  const strategy: AutoStrategy = ts.autoStrategy;
  const lo = minBet(def, ts.prestige);
  const hi = maxBet(def, ts.prestige);
  let bet = strategy === 'min' ? lo : strategy === 'max' ? hi : money * 0.05;
  bet = Math.floor(Math.min(hi, Math.max(lo, bet)));
  bet = Math.min(bet, Math.floor(money));
  return bet < lo ? 0 : bet;
}

export interface Outcome {
  bet: number;
  payout: number;
  net: number;
  detail: string;
  rerolled: boolean;
  capped: boolean;
}

/** Plays one round: applies the luck re-roll, payout upgrades and the payout cap. */
export function resolvePlay(
  def: TableDef,
  levels: Record<string, number>,
  prestige: number,
  option: string,
  bet: number,
  rng: Rng,
): Outcome {
  let result = def.play(rng, levels, option);
  let rerolled = false;
  if (result.mult < 1 && rng() < luckChance(levels)) {
    result = def.play(rng, levels, option);
    rerolled = true;
  }

  let payout: number;
  let capped = false;
  if (result.mult > 1) {
    let profit = (result.mult - 1) * bet * payoutMultiplier(levels, prestige);
    const cap = maxPayout(def, prestige);
    if (profit > cap) {
      profit = cap;
      capped = true;
    }
    payout = bet + Math.floor(profit);
  } else {
    payout = Math.floor(bet * result.mult);
  }

  return {
    bet,
    payout,
    net: payout - bet,
    detail: rerolled ? `↻ ${result.detail}` : result.detail,
    rerolled,
    capped,
  };
}

/** Monte Carlo estimate of the average net result per play at the given bet. */
export function estimateNetPerPlay(
  def: TableDef,
  levels: Record<string, number>,
  prestige: number,
  option: string,
  bet: number,
  rng: Rng,
  samples = 2000,
): number {
  let sum = 0;
  for (let i = 0; i < samples; i++) {
    sum += resolvePlay(def, levels, prestige, option, bet, rng).net;
  }
  return sum / samples;
}
