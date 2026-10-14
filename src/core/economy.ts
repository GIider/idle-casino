import type { PlayView, Rng, TableDef, TableId, TableState, UpgradeDef } from './types';
import { TABLES, TABLE_IDS } from '../tables';
import { NO_BONUS, type CasinoBonus } from './casino';
import { CARD_SHARP_LUCK, DOUBLE_LUCK_FRACTION, HEAT_WAVE_CAP, RAISED_CEILING } from './achievements';

export const COMMON_UPGRADES: UpgradeDef[] = [
  {
    id: 'luck',
    name: 'Lucky Charm',
    description: '+3% chance per level to re-roll a losing round',
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
    id: 'speed',
    name: 'Faster Dealer',
    description: '+0.5 plays per second per level',
    baseCost: 20,
    growth: 1.4,
    maxLevel: 20,
  },
  {
    id: 'streak',
    name: 'Hot Streak',
    description: 'Every win in a row adds +3% per level to winnings (stacks up to 10 wins, a loss resets it)',
    baseCost: 60,
    growth: 1.9,
    maxLevel: 5,
  },
  {
    id: 'cashback',
    name: 'Cashback',
    description: 'Lost rounds refund +6% of your bet per level',
    baseCost: 50,
    growth: 1.6,
    maxLevel: 8,
  },
  {
    id: 'dealer',
    name: 'Second Dealer',
    description: '+5% chance per level that a play triggers an immediate bonus play at the same stake',
    baseCost: 120,
    growth: 2.1,
    maxLevel: 6,
  },
  {
    id: 'autobet',
    name: 'Bigger Bets',
    description: "Wager a larger share of the currency this table stakes on every play (the previous table's, up to the Stakes slider)",
    baseCost: 4,
    growth: 1.7,
    maxLevel: 7,
  },
];

/** Share of the table's stake budget the table bets, by `autobet` level (clamped to the table's min/max bet). */
export const AUTO_BET_FRACTIONS = [0, 0.02, 0.05, 0.1, 0.15, 0.25, 0.35, 0.5];

/** Winnings bonus a table gets per prestige level of the table before it in the chain. */
export const CROSS_PRESTIGE_BONUS = 0.04;
export const MIN_BET_GROWTH = 3;
export const MAX_BET_GROWTH = 5;
export const MAX_PAYOUT_GROWTH = 5;
/** Upgrade prices grow this much per table prestige (steeper than the max bet). */
export const UPGRADE_PRESTIGE_GROWTH = 3;
export const PRESTIGE_THRESHOLD_GROWTH = 8;
/** Earlier tables are cheap to run and feed every later table, so their prestige targets climb faster. */
export const PRESTIGE_THRESHOLD_GROWTH_BY_TABLE: Record<string, number> = { coinflip: 12, slots: 10, roulette: 9, blackjack: 8 };
export const PRESTIGE_PAYOUT_BONUS = 0.3;
export const AUTO_BASE_RATE = 1;
/** Hot Streak: winnings bonus per level per consecutive win, and the streak length that stops counting. */
export const STREAK_BONUS_PER_LEVEL = 0.03;
export const STREAK_CAP = 10;
/** Cashback: share of a lost bet refunded, per level. */
export const CASHBACK_PER_LEVEL = 0.06;
/** Second Dealer: chance per level of a bonus play, and the longest chain of bonus plays after one play. */
export const DEALER_CHANCE_PER_LEVEL = 0.05;
export const MAX_BONUS_PLAYS = 10;
/** Extra plays/sec (as a multiple of the base rate) per `speed` level. */
export const SPEED_PER_LEVEL = 0.5;
export const MAX_AUTO_PLAYS_PER_TICK = 300;
export const OFFLINE_CAP_SECONDS = 8 * 3600;
export const OFFLINE_EFFICIENCY = 0.5;
export const BAILOUT_BETS = 10;

/**
 * Upgrades that clearly pay for themselves (measured by the balance sim); the Floor Manager buys these before
 * niche ones so cheap situational upgrades don't drain the wallet that funds bet size and speed.
 */
export const CORE_UPGRADES = ['autobet', 'speed', 'payout', 'edge', 'loaded', 'dealer', 'streak', 'luck'];

const upgradeCache = new Map<string, UpgradeDef[]>();

/** The common upgrades (with this table's cross-table price components) followed by the table's own. */
export function allUpgrades(def: TableDef): UpgradeDef[] {
  let list = upgradeCache.get(def.id);
  if (!list) {
    const common = COMMON_UPGRADES.map((u) => (def.commonTies?.[u.id] ? { ...u, ties: def.commonTies[u.id] } : u));
    list = [...common, ...def.upgrades];
    upgradeCache.set(def.id, list);
  }
  return list;
}

export function minBet(def: TableDef, prestige: number): number {
  return def.baseMinBet * MIN_BET_GROWTH ** prestige;
}

export function maxBet(def: TableDef, prestige: number): number {
  return def.baseMaxBet * MAX_BET_GROWTH ** prestige;
}

export function maxPayout(def: TableDef, prestige: number, levels: Record<string, number> = {}): number {
  const ceiling = levels.perk_ceilingBreaker ? 1 + RAISED_CEILING : 1;
  return def.baseMaxPayout * MAX_PAYOUT_GROWTH ** prestige * ceiling;
}

export function upgradeCost(
  def: TableDef,
  upg: UpgradeDef,
  prestige: number,
  level: number,
  bonus: CasinoBonus = NO_BONUS,
): number {
  const base = upg.baseCost * def.baseMinBet * UPGRADE_PRESTIGE_GROWTH ** prestige * upg.growth ** level;
  return Math.ceil(base * bonus.upgradeCost);
}

/** Units of `from`'s currency that are worth one unit of `own`'s currency (the product of the stake costs in between). */
export function exchangeRate(own: TableId, from: TableId): number {
  let rate = 1;
  for (let i = TABLE_IDS.indexOf(from) + 1; i <= TABLE_IDS.indexOf(own); i++) rate *= TABLES[TABLE_IDS[i]].stakeCost ?? 1;
  return rate;
}

/** Each table further back multiplies a cross-table price (in that table's units) by this: reaching far back is exponentially dearer. */
export const TIE_DISTANCE_GROWTH = 5;

/**
 * Within one upgrade's price, a currency from further back is asked for at least this many times the amount of the
 * nearer one. Further currencies are cheaper to produce, so asking for less of them (as the min-bet units alone would)
 * makes them the easy part of the bill. Raw amounts ordered this way are also ordered in value (`exchangeRate` < 1).
 */
export const TIE_FURTHER_MIN_RATIO = 1.5;

export type Prestiges = Partial<Record<TableId, number>>;

export interface UpgradePrice {
  /** Price in the table's own currency. */
  own: number;
  /** Extra prices in earlier tables' currencies (only the components that apply at this level). */
  ties: { from: TableId; amount: number }[];
}

/** Full price of one upgrade level: the own-currency cost plus every cross-table component. */
export function upgradePrice(
  def: TableDef,
  upg: UpgradeDef,
  prestiges: Prestiges,
  level: number,
  bonus: CasinoBonus = NO_BONUS,
): UpgradePrice {
  const own = upgradeCost(def, upg, prestiges[def.id] ?? 0, level, bonus);
  const ties: UpgradePrice['ties'] = [];
  for (const tie of upg.ties ?? []) {
    if (level < (tie.fromLevel ?? 0) || tie.share <= 0) continue;
    const scale = tie.scale ?? 'self';
    const source = TABLES[tie.from];
    // Priced in the source table's minimum bets: at its current minimum bet ('source'), its starting one ('self' and 'flat').
    const unit = source.baseMinBet * (scale === 'source' ? MIN_BET_GROWTH ** (prestiges[tie.from] ?? 0) : 1);
    const mine = scale === 'self' ? UPGRADE_PRESTIGE_GROWTH ** (prestiges[def.id] ?? 0) : 1;
    const distance = TABLE_IDS.indexOf(def.id) - TABLE_IDS.indexOf(tie.from);
    const far = TIE_DISTANCE_GROWTH ** Math.max(0, distance - 1);
    const base = tie.share * upg.baseCost * unit * mine * far * (tie.growth ?? upg.growth) ** level;
    ties.push({ from: tie.from, amount: Math.max(1, Math.ceil(base * bonus.upgradeCost)) });
  }
  // Nearest currency first; each further one is asked for at least TIE_FURTHER_MIN_RATIO times the previous amount.
  const order = (t: { from: TableId }) => TABLE_IDS.indexOf(t.from);
  const byNear = [...ties].sort((a, b) => order(b) - order(a));
  for (let i = 1; i < byNear.length; i++) {
    byNear[i].amount = Math.max(byNear[i].amount, Math.ceil(byNear[i - 1].amount * TIE_FURTHER_MIN_RATIO));
  }
  return { own, ties };
}

/** A price as one number in the table's own currency, for ranking "cheapest" across components. */
export function priceInOwn(def: TableDef, price: UpgradePrice): number {
  let total = price.own;
  for (const t of price.ties) total += t.amount / exchangeRate(def.id, t.from);
  return total;
}

/** How many levels one click buys: at most `cap` levels, spending at most `fraction` of the wallet. */
export interface BuyMode {
  cap: number;
  fraction: number;
}

export const SINGLE_BUY: BuyMode = { cap: 1, fraction: 1 };

/** Most levels (up to `cap` and `maxLevel`) whose summed cost fits in `budget`, plus that total cost. */
export function bulkPurchase(
  costAt: (level: number) => number,
  level: number,
  maxLevel: number,
  budget: number,
  cap: number,
): { count: number; cost: number } {
  let count = 0;
  let cost = 0;
  while (count < cap && level + count < maxLevel) {
    const next = costAt(level + count);
    if (cost + next > budget) break;
    cost += next;
    count++;
  }
  return { count, cost };
}

export function prestigeThreshold(def: TableDef, prestige: number, bonus: CasinoBonus = NO_BONUS): number {
  return Math.ceil(def.baseMinBet * 20000 * (PRESTIGE_THRESHOLD_GROWTH_BY_TABLE[def.id] ?? PRESTIGE_THRESHOLD_GROWTH) ** prestige * bonus.prestigeCost);
}

export function luckChance(levels: Record<string, number>, bonus: CasinoBonus = NO_BONUS): number {
  // Card Sharp (blackjack perk) amplifies Lucky Charm itself.
  const sharp = levels.perk_loseCards4 ? CARD_SHARP_LUCK : 1;
  return Math.min(0.95, (0.03 * (levels.luck ?? 0) + bonus.luck) * sharp);
}

/** Longest win streak that still adds winnings; Heat Wave (coin flip perk) raises it. */
export function streakCap(levels: Record<string, number>): number {
  return STREAK_CAP + (levels.perk_hotHand ? HEAT_WAVE_CAP : 0);
}

/** Winnings multiplier from the Hot Streak upgrade at the given win streak. */
export function streakMultiplier(levels: Record<string, number>, streak: number): number {
  return 1 + STREAK_BONUS_PER_LEVEL * (levels.streak ?? 0) * Math.min(streakCap(levels), Math.max(0, streak));
}

export function cashbackFraction(levels: Record<string, number>): number {
  return Math.min(0.9, CASHBACK_PER_LEVEL * (levels.cashback ?? 0));
}

export function dealerChance(levels: Record<string, number>): number {
  return Math.min(0.9, DEALER_CHANCE_PER_LEVEL * (levels.dealer ?? 0));
}

export function payoutMultiplier(
  levels: Record<string, number>,
  prestige: number,
  bonus: CasinoBonus = NO_BONUS,
  baseWinBonus = 0,
  streak = 0,
): number {
  return (
    (1 + baseWinBonus) *
    (1 + 0.08 * (levels.payout ?? 0)) *
    (1 + PRESTIGE_PAYOUT_BONUS * prestige) *
    bonus.payout *
    streakMultiplier(levels, streak)
  );
}

/** Plays per second a table runs on its own; every unlocked table plays from the start. */
export function autoPlaysPerSecond(levels: Record<string, number>, bonus: CasinoBonus = NO_BONUS): number {
  return AUTO_BASE_RATE * (1 + SPEED_PER_LEVEL * (levels.speed ?? 0)) * bonus.speed;
}

/** Plays per second including the expected extra plays from Second Dealer (what display and offline use). */
export function effectivePlaysPerSecond(levels: Record<string, number>, bonus: CasinoBonus = NO_BONUS): number {
  return autoPlaysPerSecond(levels, bonus) / (1 - dealerChance(levels));
}

export function autoBetFraction(levels: Record<string, number>): number {
  const level = Math.min(AUTO_BET_FRACTIONS.length - 1, Math.max(0, levels.autobet ?? 0));
  return AUTO_BET_FRACTIONS[level];
}

/** The wallet-share bet at a given `autobet` level, clamped to the table's min/max bet (ignores whether the wallet can cover it). */
export function betAtLevel(def: TableDef, prestige: number, wallet: number, autobetLevel: number): number {
  return Math.floor(Math.min(maxBet(def, prestige), Math.max(minBet(def, prestige), wallet * autoBetFraction({ autobet: autobetLevel }))));
}

/**
 * The bet a table places out of `budget` (in the table's own bet units: its own wallet for the first table,
 * the fed share of the previous table's wallet otherwise), or 0 if the budget can't cover the minimum.
 */
export function chooseAutoBet(def: TableDef, ts: TableState, budget: number = ts.wallet): number {
  const lo = minBet(def, ts.prestige);
  let bet = betAtLevel(def, ts.prestige, budget, ts.levels.autobet ?? 0);
  bet = Math.min(bet, Math.floor(budget));
  return bet < lo ? 0 : bet;
}

export interface Outcome {
  bet: number;
  payout: number;
  net: number;
  detail: string;
  view?: PlayView;
  rerolled: boolean;
  capped: boolean;
  /** The table asked for a free follow-up play (Pity Flip). */
  bonusPlay?: boolean;
}

/**
 * Win streak after a round with the given net result: wins extend it, losses reset it, pushes keep it.
 * Heat Wave (levels) raises the cap.
 */
export function nextStreak(streak: number, net: number, levels: Record<string, number> = {}): number {
  if (net > 0) return Math.min(streakCap(levels), streak + 1);
  if (net < 0) return 0;
  return streak;
}

/** Plays one round: applies the luck re-roll, payout upgrades and the payout cap. */
export function resolvePlay(
  def: TableDef,
  levels: Record<string, number>,
  prestige: number,
  bet: number,
  rng: Rng,
  bonus: CasinoBonus = NO_BONUS,
  streak = 0,
): Outcome {
  let result = def.play(rng, levels);
  let rerolled = false;
  const luck = luckChance(levels, bonus);
  if (result.mult < 1 && rng() < luck) {
    result = def.play(rng, levels);
    rerolled = true;
    // Double Luck: a second re-roll at a fraction of the chance.
    const second = levels.perk_secondWind ? luck * DOUBLE_LUCK_FRACTION : 0;
    if (result.mult < 1 && second > 0 && rng() < second) result = def.play(rng, levels);
  }

  let payout: number;
  let capped = false;
  if (result.mult > 1) {
    let profit = (result.mult - 1) * bet * payoutMultiplier(levels, prestige, bonus, def.baseWinBonus, streak);
    const cap = maxPayout(def, prestige, levels);
    if (profit > cap) {
      profit = cap;
      capped = true;
    }
    payout = bet + Math.floor(profit);
  } else {
    payout = Math.floor(bet * result.mult);
    // Cashback only softens losses: it never turns a round into a win.
    if (payout < bet) payout = Math.min(bet, payout + Math.floor(bet * cashbackFraction(levels)));
  }

  return {
    bet,
    payout,
    net: payout - bet,
    detail: rerolled ? `↻ ${result.detail}` : result.detail,
    view: result.view,
    rerolled,
    capped,
    bonusPlay: result.bonusPlay,
  };
}

/** Monte Carlo estimate of the average net result per play at the given bet. */
export function estimateNetPerPlay(
  def: TableDef,
  levels: Record<string, number>,
  prestige: number,
  bet: number,
  rng: Rng,
  samples = 2000,
  bonus: CasinoBonus = NO_BONUS,
): number {
  let sum = 0;
  let streak = 0;
  for (let i = 0; i < samples; i++) {
    const net = resolvePlay(def, levels, prestige, bet, rng, bonus, streak).net;
    sum += net;
    streak = nextStreak(streak, net, levels);
  }
  return sum / samples;
}
