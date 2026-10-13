import type { TableDef } from '../core/types';
import { COIN_HEADS_CHANCE, CONSOLATION_REFUND, DOUBLE_HEADER_CHANCE } from '../core/achievements';

export const coinflip: TableDef = {
  id: 'coinflip',
  name: 'Coin Flip',
  icon: '🪙',
  blurb: 'Call heads. Double or nothing. The friendliest table in the house.',
  currency: { name: 'Pennies', icon: '🪙' },
  unlockCost: 0,
  baseMinBet: 1,
  baseMaxBet: 25,
  baseMaxPayout: 250,
  baseWinBonus: 0,
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
    const luckyPenny = levels.perk_headsCollector ? COIN_HEADS_CHANCE : 0;
    const chance = 0.55 + 0.012 * (levels.edge ?? 0) + luckyPenny;
    const win = rng() < chance;
    const view = { kind: 'coin' as const, heads: win };
    if (win) {
      // Double Header: some wins pay 3x.
      const header = levels.perk_hotHand ? DOUBLE_HEADER_CHANCE[levels.perk_hotHand - 1] : 0;
      const triple = header > 0 && rng() < header;
      return { mult: triple ? 3 : 2, detail: triple ? '🪙 Heads — double header!' : '🪙 Heads', view };
    }
    // Consolation Prize: tails give part of the stake back.
    const refund = levels.perk_coldComfort ? CONSOLATION_REFUND[levels.perk_coldComfort - 1] : 0;
    return { mult: refund, detail: '🪙 Tails', view };
  },
};
