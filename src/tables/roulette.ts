import type { TableDef } from '../core/types';

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const LUCKY_NUMBER = 17;

function colorOf(n: number): string {
  if (n === 0) return 'green';
  return RED.has(n) ? 'red' : 'black';
}

export const roulette: TableDef = {
  id: 'roulette',
  name: 'Roulette',
  icon: '🎡',
  blurb: 'European wheel with a single zero. Bet safe on red, the first dozen, or go all in on 17.',
  unlockCost: 25000,
  baseMinBet: 25,
  baseMaxBet: 500,
  baseMaxPayout: 20000,
  options: [
    { id: 'color', name: 'Red (pays 2×)' },
    { id: 'dozen', name: 'First dozen (pays 3×)' },
    { id: 'number', name: 'Number 17 (pays 36×)' },
  ],
  upgrades: [
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
  play(rng, levels, option) {
    let pocket = Math.floor(rng() * 37);
    if (pocket === 0 && rng() < 0.2 * (levels.zero ?? 0)) {
      pocket = Math.floor(rng() * 37);
    }
    const detail = `🎡 ${pocket} ${colorOf(pocket)}`;
    switch (option) {
      case 'dozen':
        return { mult: pocket >= 1 && pocket <= 12 ? 3 : 0, detail };
      case 'number':
        return {
          mult: Math.abs(pocket - LUCKY_NUMBER) <= (levels.magnet ?? 0) ? 36 : 0,
          detail,
        };
      default:
        return { mult: colorOf(pocket) === 'red' ? 2 : 0, detail };
    }
  },
};
