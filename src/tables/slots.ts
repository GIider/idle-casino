import type { TableDef } from '../core/types';
import { pickWeighted } from '../core/rng';
import { NEAR_MISS_REFUND, POLISHED_TRIPLE_BONUS, SWEET_PAIR_MULT } from '../core/achievements';

export const SYMBOLS = ['🍒', '🍋', '🔔', '🍀', '7️⃣', '💎'];
/** Payout multiplier for three of a kind. */
const TRIPLE_PAYOUT = [5, 8, 15, 30, 80, 200];
const BASE_WEIGHTS = [40, 30, 15, 10, 4, 1];

export function slotWeights(cherries: number): number[] {
  return [BASE_WEIGHTS[0] + 0.8 * cherries, ...BASE_WEIGHTS.slice(1)];
}

export const slots: TableDef = {
  id: 'slots',
  name: 'Slots',
  icon: '🎰',
  blurb: 'Three reels, rare symbols, big numbers. Two cherries return your stake.',
  currency: { name: 'Tokens', icon: '🎟️' },
  unlockCost: 1500,
  baseMinBet: 5,
  baseMaxBet: 100,
  baseMaxPayout: 5000,
  baseWinBonus: 0.27,
  upgrades: [
    {
      id: 'loaded',
      name: 'Cherry Picker',
      description: 'Stacks the reels with cherries, making pairs and triples more likely',
      baseCost: 40,
      growth: 1.8,
      maxLevel: 10,
    },
  ],
  play(rng, levels) {
    const weights = slotWeights(levels.loaded ?? 0);
    const reels = [0, 1, 2].map(() => pickWeighted(rng, weights));
    const detail = reels.map((r) => SYMBOLS[r]).join(' ');
    if (reels[0] === reels[1] && reels[1] === reels[2]) {
      const polish = levels.perk_tripleCrown ? POLISHED_TRIPLE_BONUS : 1;
      return { mult: TRIPLE_PAYOUT[reels[0]] * polish, detail, view: { kind: 'slots', reels } };
    }
    const cherries = reels.filter((r) => r === 0).length;
    if (cherries === 2) {
      return { mult: levels.perk_cherrySeason ? SWEET_PAIR_MULT : 1, detail, view: { kind: 'slots', reels } };
    }
    const pair = reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2];
    const nearMiss = pair && levels.perk_hotStreak ? NEAR_MISS_REFUND[levels.perk_hotStreak - 1] : 0;
    return { mult: nearMiss, detail, view: { kind: 'slots', reels } };
  },
};
