import type { TableDef } from '../core/types';
import {
  EDGE_CHANCE,
  EDGE_MULT,
  GOLD_COIN_CHANCE,
  GOLD_COIN_MULT,
  PITY_CHANCE,
  RIDE_CHANCE,
  RIDE_LINKS,
} from '../core/achievements';

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
      description: '+1.8% chance for heads to land',
      baseCost: 80,
      growth: 1.9,
      maxLevel: 8,
    },
  ],
  play(rng, levels) {
    const chance = 0.55 + 0.018 * (levels.edge ?? 0);
    const gold = levels.perk_collect_coinflip ? GOLD_COIN_CHANCE[levels.perk_collect_coinflip - 1] : 0;
    // Gold Coin (capstone): a rare jackpot flip.
    if (gold > 0 && rng() < gold) {
      return { mult: GOLD_COIN_MULT, detail: '🪙 Gold coin!', view: { kind: 'coin', heads: true, special: 'gold' } };
    }
    // Edge Landing: the coin stands on its rim.
    const edge = levels.perk_coldComfort ? EDGE_CHANCE[levels.perk_coldComfort - 1] : 0;
    if (edge > 0 && rng() < edge) {
      return { mult: EDGE_MULT, detail: '🪙 Landed on its edge!', view: { kind: 'coin', heads: true, special: 'edge' } };
    }
    let heads = rng() < chance;
    let mult = heads ? 2 : 0;
    let rode = 0;
    // Let It Ride: a win may be flipped again, doubling the winnings or losing them.
    const links = levels.perk_headsCollector ? RIDE_LINKS[levels.perk_headsCollector - 1] : 0;
    for (let i = 0; i < links && heads && rng() < RIDE_CHANCE; i++) {
      rode++;
      heads = rng() < chance;
      mult = heads ? mult * 2 : 0;
    }
    const view = { kind: 'coin' as const, heads, ...(heads && rode > 0 ? { special: 'ride' as const } : {}) };
    const ride = rode > 0 ? (heads ? ` — rode ${rode}× to ${mult}×!` : ' — lost the ride') : '';
    // Pity Flip: tails may earn a free play.
    const pity = levels.perk_tailsCollector ? PITY_CHANCE[levels.perk_tailsCollector - 1] : 0;
    const bonusPlay = !heads && pity > 0 && rng() < pity;
    return { mult, detail: `🪙 ${heads ? 'Heads' : 'Tails'}${ride}`, view, bonusPlay: bonusPlay || undefined };
  },
};
