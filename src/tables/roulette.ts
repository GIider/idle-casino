import type { TableDef } from '../core/types';
import { COLOUR_MEMORY_MULT, HOT_SEVENTEEN_MULT, LA_PARTAGE_REFUND } from '../core/achievements';

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
    let pocket = Math.floor(rng() * 37);
    if (pocket === 0 && rng() < 0.2 * (levels.zero ?? 0)) {
      pocket = Math.floor(rng() * 37);
    }
    const detail = `🎡 ${pocket} ${colorOf(pocket)}`;
    // Red is always on the felt; each bought bet takes an equal share of the stake.
    const bets = ['color'];
    if (levels.bet_dozen) bets.push('dozen');
    if (levels.bet_number) bets.push('number');
    const view = { kind: 'roulette' as const, pocket, bets };
    // La Partage: zero returns half the stake on the safer bets.
    const partage = pocket === 0 && levels.perk_zeroHero ? LA_PARTAGE_REFUND[levels.perk_zeroHero - 1] : 0;
    const returns = bets.map((bet) => {
      switch (bet) {
        case 'dozen':
          return pocket >= 1 && pocket <= 12 ? 3 : partage;
        case 'number': {
          const hit = Math.abs(pocket - LUCKY_NUMBER) <= (levels.magnet ?? 0);
          return hit ? (levels.perk_luckySeventeen ? HOT_SEVENTEEN_MULT[levels.perk_luckySeventeen - 1] : 36) : 0;
        }
        default: {
          const red = levels.perk_colourRun ? COLOUR_MEMORY_MULT[levels.perk_colourRun - 1] : 2;
          return colorOf(pocket) === 'red' ? red : partage;
        }
      }
    });
    return { mult: returns.reduce((sum, m) => sum + m, 0) / bets.length, detail, view };
  },
};
