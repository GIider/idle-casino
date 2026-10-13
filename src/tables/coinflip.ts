import type { TableDef } from '../core/types';

export const coinflip: TableDef = {
  id: 'coinflip',
  name: 'Coin Flip',
  icon: '🪙',
  blurb: 'Call heads. Double or nothing. The friendliest table in the house.',
  unlockCost: 0,
  baseMinBet: 1,
  baseMaxBet: 25,
  baseMaxPayout: 250,
  upgrades: [
    {
      id: 'edge',
      name: 'Weighted Coin',
      description: '+1.2% chance for heads to land',
      baseCost: 80,
      growth: 1.9,
      maxLevel: 8,
    },
  ],
  play(rng, levels) {
    const chance = 0.55 + 0.012 * (levels.edge ?? 0);
    const win = rng() < chance;
    return { mult: win ? 2 : 0, detail: win ? '🪙 Heads' : '🪙 Tails' };
  },
};
