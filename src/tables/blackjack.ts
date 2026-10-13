import type { PlayResult, PlayView, Rng, TableDef } from '../core/types';
import {
  BURN_CHANCE,
  BURN_TRIES,
  CHARLIE_CARDS,
  CHARLIE_MULT,
  DOUBLE_FLOOR,
  EVEN_MONEY,
  MULLIGAN_CHANCE,
  PAIR_BONUS,
  PEEK_CHANCE,
  SECOND_HAND_CHANCE,
  SURRENDER_FLOOR,
  TEN_WEIGHT,
  TILT_HITS_BELOW,
  splitAllowed,
} from '../core/achievements';

type BlackjackOutcome = 'natural' | 'bust' | 'win' | 'push' | 'lose';

/** Infinite deck: returns 1 for an ace, 2-10 otherwise (face cards count 10). `tenWeight` is 4 in a fair shoe. */
function draw(rng: Rng, tenWeight = 4): number {
  const r = Math.floor(rng() * (9 + tenWeight));
  return r < 9 ? r + 1 : 10;
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
    let result = playRound(rng, levels);
    // Second Hand: a lost hand may be redealt for free.
    const again = levels.perk_loseCards5 ? SECOND_HAND_CHANCE[levels.perk_loseCards5 - 1] : 0;
    if (result.mult < 1 && again > 0 && rng() < again) {
      const redeal = playRound(rng, levels);
      result = { ...redeal, detail: `🔁 ${redeal.detail}` };
    }
    return result;
  },
};

function playRound(rng: Rng, levels: Record<string, number>): PlayResult {
  const sleeve = levels.sleeve ?? 0;
  const insure = levels.insure ?? 0;
  const strategy = levels.strategy ?? 0;
  const counter = levels.perk_collect_blackjack ?? 0;

  // Rich Shoe skews the player's draws toward tens; the dealer draws from the fair shoe.
  const tenWeight = levels.perk_naturalBorn ? TEN_WEIGHT[levels.perk_naturalBorn - 1] : 4;
  const drawPlayer = () => draw(rng, tenWeight);

  const player = rng() < 0.03 * sleeve ? [1, 10] : [drawPlayer(), drawPlayer()];
  const dealer = [draw(rng), draw(rng)];
  const upcard = dealer[0] === 1 ? 11 : dealer[0];
  // Perfect Pairs: a side bet on the first two cards, paid whatever the hand does.
  const pairBonus = levels.perk_winCards6 && player[0] === player[1] ? PAIR_BONUS[levels.perk_winCards6 - 1] : 0;

  const view = (outcome: BlackjackOutcome, insured = false): PlayView => ({
    kind: 'blackjack',
    player: [...player],
    dealer: [...dealer],
    outcome,
    insured,
  });
  const done = (result: PlayResult): PlayResult =>
    pairBonus > 0
      ? { ...result, mult: result.mult + pairBonus, detail: `${result.detail} · pair +${pairBonus}×` }
      : result;

  const playerNatural = isNatural(player);
  const dealerNatural = isNatural(dealer);
  if (playerNatural && dealerNatural) return done({ mult: 1, detail: '🃏 Both natural — push', view: view('push') });
  if (playerNatural) return done({ mult: 2.5, detail: '🃏 Blackjack!', view: view('natural') });
  if (dealerNatural) {
    // Even Money: the dealer's natural no longer beats you outright.
    const even = levels.perk_loseCards2 ? EVEN_MONEY[levels.perk_loseCards2 - 1] : 0;
    if (even > 0) return done({ mult: even, detail: '🃏 Dealer blackjack — even money', view: view('push') });
    return done({ mult: 0, detail: '🃏 Dealer blackjack', view: view('lose') });
  }

  // Surrender: fold a hopeless hard hand against a ten or ace for half the stake.
  const surrender = levels.perk_winStreak ?? 0;
  if (surrender > 0 && upcard >= 10 && !player.includes(1)) {
    const t = total(player);
    if (t >= SURRENDER_FLOOR[surrender - 1] && t <= 16) {
      const v = view('lose');
      return done({ mult: 0.5, detail: `🃏 Surrendered ${t}`, view: { ...v, surrendered: true } as PlayView });
    }
  }

  // Hole-Card Peek: knowing the dealer already stands on 17+, you keep hitting until you can beat it.
  const peekChance = levels.perk_winCards5 ? PEEK_CHANCE[levels.perk_winCards5 - 1] : 0;
  const dealerStart = total(dealer);
  const peeked = peekChance > 0 && dealerStart >= 17 && dealerStart <= 20 && rng() < peekChance ? dealerStart : 0;

  const standAt = (): number => {
    if (strategy >= 2 && upcard >= 2 && upcard <= 6) return 13;
    if (strategy >= 1 && upcard >= 4 && upcard <= 6) return 12;
    return 17;
  };
  const wantsCard = (cards: number[]): boolean => (peeked > 0 ? total(cards) < peeked : total(cards) < standAt());
  /** Takes one card; Card Counter refuses to hit into a known bust. */
  const hit = (cards: number[]): boolean => {
    let next = drawPlayer();
    if (counter > 0 && total([...cards, next]) > 21) {
      if (counter < 2) return false;
      next = drawPlayer();
      if (total([...cards, next]) > 21) return false;
    }
    cards.push(next);
    return true;
  };
  const playHand = (cards: number[]): void => {
    while (wantsCard(cards) && hit(cards));
  };
  const dealerPlay = (p: number): number => {
    // Dealer Tilt: the dealer keeps hitting past 17.
    const below = levels.perk_loseCards6 ? TILT_HITS_BELOW[levels.perk_loseCards6 - 1] : 17;
    const run = () => {
      while (total(dealer) < below) dealer.push(draw(rng));
    };
    run();
    const mulligan = levels.perk_loseCards3 ? MULLIGAN_CHANCE[levels.perk_loseCards3 - 1] : 0;
    const d = total(dealer);
    if (mulligan > 0 && dealer.length > 2 && d <= 21 && p <= 21 && p < d && rng() < mulligan) {
      // Dealer Mulligan: the card that beat you is burned.
      dealer.pop();
      run();
    }
    return total(dealer);
  };
  const settle = (p: number, d: number): number => (d > 21 || p > d ? 2 : p === d ? 1 : 0);

  // Free Double Down: one card, double the profit, no extra risk.
  const dd = levels.perk_winCards2 ?? 0;
  if (dd > 0) {
    const t = total(player);
    if (t >= DOUBLE_FLOOR[dd - 1] && t <= 11) {
      player.push(drawPlayer());
      const p = total(player);
      const d = dealerPlay(p);
      const m = settle(p, d);
      const win = m === 2;
      const v = view(win ? 'win' : m === 1 ? 'push' : 'lose');
      return done({
        mult: win ? 3 : m,
        detail: `🃏 Double down: You ${p} · Dealer ${d}`,
        view: { ...v, doubled: true } as PlayView,
      });
    }
  }

  // Free Split: a pair becomes two hands and the second plays on the house.
  const split = levels.perk_winCards3 ?? 0;
  if (split > 0 && player[0] === player[1] && splitAllowed(player[0], split)) {
    const second = [player[1], drawPlayer()];
    player.pop();
    player.push(drawPlayer());
    playHand(player);
    playHand(second);
    const pa = total(player);
    const pb = total(second);
    const live = [pa, pb].filter((x) => x <= 21);
    const d = live.length > 0 ? dealerPlay(Math.min(...live)) : total(dealer);
    const handMult = (p: number): number => {
      if (p > 21) return rng() < 0.12 * insure ? 0.5 : 0;
      return settle(p, d);
    };
    const mult = handMult(pa) + handMult(pb);
    const outcome: BlackjackOutcome = live.length === 0 ? 'bust' : mult > 1 ? 'win' : mult === 1 ? 'push' : 'lose';
    return done({
      mult,
      detail: `🃏 Split: ${pa > 21 ? 'bust' : pa} & ${pb > 21 ? 'bust' : pb} · Dealer ${d}`,
      view: { ...view(outcome), split: [...second] } as PlayView,
    });
  }

  playHand(player);
  let p = total(player);
  // Burn Card: a busting card is discarded and drawn again.
  let tries = levels.perk_bustOut ? BURN_TRIES[levels.perk_bustOut - 1] : 0;
  while (p > 21 && tries-- > 0) {
    if (rng() < BURN_CHANCE[(levels.perk_bustOut ?? 1) - 1]) {
      player.pop();
      player.push(drawPlayer());
      p = total(player);
    }
  }
  if (p > 21) {
    const saved = rng() < 0.12 * insure;
    return done({
      mult: saved ? 0.5 : 0,
      detail: saved ? `🃏 Bust (${p}) — insured` : `🃏 Bust (${p})`,
      view: view('bust', saved),
    });
  }

  // Charlie: enough cards without busting wins on the spot.
  const charlie = levels.perk_winCards4 ? CHARLIE_CARDS[levels.perk_winCards4 - 1] : 0;
  if (charlie > 0 && player.length >= charlie) {
    return done({ mult: CHARLIE_MULT, detail: `🃏 Charlie! ${player.length} cards, ${p}`, view: view('win') });
  }

  const d = dealerPlay(p);
  const detail = `🃏 You ${p} · Dealer ${d}`;
  const m = settle(p, d);
  return done({ mult: m, detail, view: view(m === 2 ? 'win' : m === 1 ? 'push' : 'lose') });
}
