import type { PlayView, Rng, TableDef } from '../core/types';
import { GENTLEMAN_PUSH_MULT, MARKED_DECK_MULT, SECOND_THOUGHTS_CHANCE } from '../core/achievements';

type BlackjackOutcome = 'natural' | 'bust' | 'win' | 'push' | 'lose';

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
  currency: { name: 'Markers', icon: '♠️' },
  unlockCost: 37500,
  baseMinBet: 100,
  baseMaxBet: 2000,
  baseMaxPayout: 10000,
  baseWinBonus: 0.27,
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
    const view = (outcome: BlackjackOutcome, insured = false): PlayView => ({
      kind: 'blackjack',
      player: [...player],
      dealer: [...dealer],
      outcome,
      insured,
    });
    if (playerNatural && dealerNatural) return { mult: 1, detail: '🃏 Both natural — push', view: view('push') };
    if (playerNatural) return { mult: levels.perk_naturalBorn ? MARKED_DECK_MULT : 2.5, detail: '🃏 Blackjack!', view: view('natural') };
    if (dealerNatural) return { mult: 0, detail: '🃏 Dealer blackjack', view: view('lose') };

    const standAt = (): number => {
      if (strategy >= 2 && upcard >= 2 && upcard <= 6) return 13;
      if (strategy >= 1 && upcard >= 4 && upcard <= 6) return 12;
      return 17;
    };
    while (total(player) < standAt()) player.push(draw(rng));

    let p = total(player);
    if (p > 21 && levels.perk_bustOut && rng() < SECOND_THOUGHTS_CHANCE) {
      // Second Thoughts: the busting card is discarded and drawn again.
      player.pop();
      player.push(draw(rng));
      p = total(player);
    }
    if (p > 21) {
      const saved = rng() < 0.12 * insure;
      return {
        mult: saved ? 0.5 : 0,
        detail: saved ? `🃏 Bust (${p}) — insured` : `🃏 Bust (${p})`,
        view: view('bust', saved),
      };
    }

    while (total(dealer) < 17) dealer.push(draw(rng));
    const d = total(dealer);
    const detail = `🃏 You ${p} · Dealer ${d}`;
    if (d > 21 || p > d) return { mult: 2, detail, view: view('win') };
    if (p === d) {
      const push = levels.perk_winStreak ? GENTLEMAN_PUSH_MULT[levels.perk_winStreak - 1] : 1;
      return { mult: push, detail, view: view('push') };
    }
    return { mult: 0, detail, view: view('lose') };
  },
};
