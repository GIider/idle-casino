import type { PlayResult, Rng, TableDef } from '../core/types';
import { pickWeighted } from '../core/rng';
import {
  BIASED_WHEEL,
  BLACK_BLEED,
  BLEED_POCKETS,
  DOUBLE_SPIN_CHANCE,
  DOZEN_CREEP,
  GREEN_MACHINE_MULT,
  HOUSE_CHIP,
} from '../core/achievements';

export const RED_POCKETS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const LUCKY_NUMBER = 17;

export function colorOf(n: number): string {
  if (n === 0) return 'green';
  return RED_POCKETS.has(n) ? 'red' : 'black';
}

export const roulette: TableDef = {
  id: 'roulette',
  name: 'Roulette',
  icon: '🎡',
  blurb: 'European wheel with a single zero. Starts on red; add the first dozen and number 17 to spread every stake across more bets.',
  currency: { name: 'Plaques', icon: '🔶' },
  unlockCost: 7500,
  baseMinBet: 25,
  baseMaxBet: 500,
  baseMaxPayout: 20000,
  baseWinBonus: 0.15,
  upgrades: [
    {
      id: 'bet_dozen',
      name: 'Dozen Bet',
      description: 'Also bet on the first dozen (pays 3×); the stake is split across every bet you own',
      baseCost: 300,
      growth: 1,
      maxLevel: 1,
    },
    {
      id: 'bet_number',
      name: 'Lucky 17 Bet',
      description: 'Also bet on number 17 (pays 36×); the stake is split across every bet you own',
      baseCost: 1500,
      growth: 1,
      maxLevel: 1,
    },
    {
      id: 'zero',
      name: 'Sticky Zero',
      description: '20% chance per level that the ball is re-spun when it lands on zero',
      baseCost: 100,
      growth: 2.2,
      maxLevel: 4,
    },
    {
      id: 'magnet',
      name: 'Magnetic Ball',
      description: 'Number bets also win on pockets next to 17 (+1 pocket each side per level)',
      baseCost: 400,
      growth: 4,
      maxLevel: 2,
    },
  ],
  play(rng, levels) {
    const doubleChance = levels.perk_wheelSpinner ? DOUBLE_SPIN_CHANCE[levels.perk_wheelSpinner - 1] : 0;
    const first = spinOnce(rng, levels);
    // Double Spin: the wheel rolls again and both spins pay on the same stake.
    if (doubleChance > 0 && rng() < doubleChance) {
      const second = spinOnce(rng, levels);
      return {
        mult: first.mult + second.mult,
        detail: `${first.detail} + ${second.detail} (double spin)`,
        view: first.view,
      };
    }
    return first;
  },
};

/** Draws a pocket: uniform, unless the Biased Wheel capstone favours 16-18. */
function drawPocket(rng: Rng, levels: Record<string, number>): number {
  const bias = levels.perk_collect_roulette ? BIASED_WHEEL[levels.perk_collect_roulette - 1] : 1;
  if (bias === 1) return Math.floor(rng() * 37);
  const weights = Array.from({ length: 37 }, (_, n) => (Math.abs(n - LUCKY_NUMBER) <= 1 ? bias : 1));
  return pickWeighted(rng, weights);
}

function spinOnce(rng: Rng, levels: Record<string, number>): PlayResult {
  let pocket = drawPocket(rng, levels);
  if (pocket === 0 && rng() < 0.2 * (levels.zero ?? 0)) {
    pocket = drawPocket(rng, levels);
  }
  const detail = `🎡 ${pocket} ${colorOf(pocket)}`;
  // Red is always on the felt; each bought bet takes an equal share of the stake.
  const bets = ['color'];
  if (levels.bet_dozen) bets.push('dozen');
  if (levels.bet_number) bets.push('number');
  const view = { kind: 'roulette' as const, pocket, bets };
  // Green Machine: zero is a win on every bet.
  const green = pocket === 0 && levels.perk_zeroHero ? GREEN_MACHINE_MULT[levels.perk_zeroHero - 1] : 0;
  const magnetHit = Math.abs(pocket - LUCKY_NUMBER) <= (levels.magnet ?? 0);
  const bleed = levels.perk_colourRun ? BLEED_POCKETS.slice(0, BLACK_BLEED[levels.perk_colourRun - 1]) : [];
  const dozenTop = 12 + (levels.perk_dozenDigger ? DOZEN_CREEP[levels.perk_dozenDigger - 1] : 0);
  const returns = bets.map((bet) => {
    switch (bet) {
      case 'dozen':
        return green || (pocket >= 1 && pocket <= dozenTop ? 3 : 0);
      case 'number':
        return green || (magnetHit ? 36 : 0);
      default:
        return green || (colorOf(pocket) === 'red' || bleed.includes(pocket) ? 2 : 0);
    }
  });
  let mult = returns.reduce((sum, m) => sum + m, 0) / bets.length;
  // House Chip: a free chip on 17 that doesn't take a share of the stake.
  if (levels.perk_luckySeventeen && magnetHit) mult += HOUSE_CHIP[levels.perk_luckySeventeen - 1] * 36;
  return { mult, detail, view };
}
