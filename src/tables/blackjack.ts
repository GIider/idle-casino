import type { Rng, TableDef } from '../core/types';

/** Infinite deck: returns 1 for an ace, 2-10 otherwise (face cards count 10). */
function draw(rng: Rng): number {
  const rank = Math.floor(rng() * 13) + 1;
  return rank > 10 ? 10 : rank;
}

function total(cards: number[]): number {
  let t = 0;
  let aces = 0;
  for (const c of cards) {
    if (c === 1) {
      t += 11;
      aces++;
    } else {
      t += c;
    }
  }
  while (t > 21 && aces > 0) {
    t -= 10;
    aces--;
  }
  return t;
}

function isNatural(cards: number[]): boolean {
  return cards.length === 2 && total(cards) === 21;
}

export const blackjack: TableDef = {
  id: 'blackjack',
  name: 'Blackjack',
  icon: '🃏',
  blurb: 'Beat the dealer to 21. Naturals pay 3:2. You stand on 17 unless you learn better.',
  unlockCost: 250000,
  baseMinBet: 100,
  baseMaxBet: 2000,
  baseMaxPayout: 10000,
  upgrades: [
    {
      id: 'sleeve',
      name: 'Card Sleeve',
      description: '+3% chance per level to start with an ace and a ten',
      baseCost: 150,
      growth: 1.8,
      maxLevel: 8,
    },
    {
      id: 'insure',
      name: 'Bust Insurance',
      description: '12% chance per level that a bust refunds half your bet',
      baseCost: 200,
      growth: 2,
      maxLevel: 5,
    },
    {
      id: 'strategy',
      name: 'Basic Strategy',
      description: 'Stand early when the dealer shows a weak card',
      baseCost: 300,
      growth: 4,
      maxLevel: 2,
    },
  ],
  play(rng, levels) {
    const sleeve = levels.sleeve ?? 0;
    const insure = levels.insure ?? 0;
    const strategy = levels.strategy ?? 0;

    const player = rng() < 0.03 * sleeve ? [1, 10] : [draw(rng), draw(rng)];
    const dealer = [draw(rng), draw(rng)];
    const upcard = dealer[0] === 1 ? 11 : dealer[0];

    const playerNatural = isNatural(player);
    const dealerNatural = isNatural(dealer);
    if (playerNatural && dealerNatural) return { mult: 1, detail: '🃏 Both natural — push' };
    if (playerNatural) return { mult: 2.5, detail: '🃏 Blackjack!' };
    if (dealerNatural) return { mult: 0, detail: '🃏 Dealer blackjack' };

    const standAt = (): number => {
      if (strategy >= 2 && upcard >= 2 && upcard <= 6) return 13;
      if (strategy >= 1 && upcard >= 4 && upcard <= 6) return 12;
      return 17;
    };
    while (total(player) < standAt()) player.push(draw(rng));

    const p = total(player);
    if (p > 21) {
      const saved = rng() < 0.12 * insure;
      return {
        mult: saved ? 0.5 : 0,
        detail: saved ? `🃏 Bust (${p}) — insured` : `🃏 Bust (${p})`,
      };
    }

    while (total(dealer) < 17) dealer.push(draw(rng));
    const d = total(dealer);
    const detail = `🃏 You ${p} · Dealer ${d}`;
    if (d > 21 || p > d) return { mult: 2, detail };
    if (p === d) return { mult: 1, detail };
    return { mult: 0, detail };
  },
};
