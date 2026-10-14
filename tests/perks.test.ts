import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/core/rng';
import { TABLES } from '../src/tables';
import { maxPayout, nextStreak, streakCap } from '../src/core/economy';
import type { PlayResult, PlayView } from '../src/core/types';

/** Replays a fixed list of rng values, then repeats the last one. */
const script = (values: number[]) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
};

type Round = PlayResult;
/** First round (over a seeded stream) for which `want` holds. */
function find(table: keyof typeof TABLES, levels: Record<string, number>, want: (r: Round) => boolean): Round {
  const rng = mulberry32(42);
  for (let i = 0; i < 100000; i++) {
    const r = TABLES[table].play(rng, levels);
    if (want(r)) return r;
  }
  throw new Error('no such round');
}
const bj = (r: Round) => r.view as Extract<PlayView, { kind: 'blackjack' }>;

describe('coin flip perks', () => {
  const coin = TABLES.coinflip;
  it('Let It Ride re-flips a win for double or nothing', () => {
    const r = coin.play(script([0.1, 0.1, 0.1, 0.9]), { perk_headsCollector: 2 });
    expect(r.mult).toBe(4);
    const lost = coin.play(script([0.1, 0.1, 0.9]), { perk_headsCollector: 2 });
    expect(lost.mult).toBe(0);
  });
  it('Edge Landing pays on a rim landing', () => {
    expect(coin.play(script([0.001]), { perk_coldComfort: 1 }).mult).toBe(5);
    expect(coin.play(script([0.5]), {}).mult).toBe(2);
  });
  it('Pity Flip grants a bonus play on tails', () => {
    expect(coin.play(script([0.9, 0.1]), { perk_tailsCollector: 3 }).bonusPlay).toBe(true);
    expect(coin.play(script([0.1]), { perk_tailsCollector: 3 }).bonusPlay).toBeUndefined();
  });
  it('Heat Wave raises the streak cap and softens losses; Raised Ceiling lifts the payout cap', () => {
    expect(streakCap({})).toBe(10);
    expect(streakCap({ perk_hotHand: 2 })).toBe(20);
    expect(nextStreak(10, -1, { perk_hotHand: 2 })).toBe(0);
    expect(maxPayout(coin, 0, { perk_ceilingBreaker: 1 })).toBe(maxPayout(coin, 0) * 1.5);
  });
});

describe('slots perks', () => {
  it('Wild Diamond completes a line of a low symbol', () => {
    const wildLine = (r: Round) => {
      const reels = (r.view as Extract<PlayView, { kind: 'slots' }>).reels;
      return reels.includes(5) && reels.filter((x) => x === 0).length === 2;
    };
    expect(find('slots', { perk_diamondMine: 1 }, wildLine).mult).toBe(5);
    expect(find('slots', {}, wildLine).mult).toBe(1);
  });
  it('Scatter Sevens pays for sevens anywhere', () => {
    const sevens = (r: Round) => {
      const reels = (r.view as Extract<PlayView, { kind: 'slots' }>).reels;
      return reels.filter((x) => x === 4).length === 1 && new Set(reels).size === 3;
    };
    expect(find('slots', { perk_sevenHeaven: 3 }, sevens).mult).toBe(0.5);
  });
});

describe('roulette perks', () => {
  it('Green Machine turns zero into a win', () => {
    const zero = (r: Round) => (r.view as Extract<PlayView, { kind: 'roulette' }>).pocket === 0;
    expect(find('roulette', { perk_zeroHero: 2 }, zero).mult).toBe(3);
    expect(find('roulette', {}, zero).mult).toBe(0);
  });
  it('Black Bleed makes the colour bet win on listed black pockets', () => {
    const two = (r: Round) => (r.view as Extract<PlayView, { kind: 'roulette' }>).pocket === 2;
    expect(find('roulette', { perk_colourRun: 1 }, two).mult).toBe(2);
    expect(find('roulette', {}, two).mult).toBe(0);
  });
});

describe('blackjack perks', () => {
  it('Free Double Down triples a winning doubled hand', () => {
    const r = find('blackjack', { perk_winCards2: 3 }, (x) => !!bj(x).doubled && bj(x).outcome === 'win');
    expect(r.mult).toBe(3);
    expect(bj(find('blackjack', { perk_winCards2: 3 }, (x) => !!bj(x).doubled && bj(x).outcome === 'lose')).outcome).toBe('lose');
  });
  it('Free Split plays a second hand on the house', () => {
    const r = find('blackjack', { perk_winCards3: 3 }, (x) => !!bj(x).split && bj(x).outcome === 'win' && x.mult >= 4);
    expect(r.mult).toBe(4);
  });
  it('Charlie wins a long non-bust hand outright', () => {
    const r = find('blackjack', { perk_winCards4: 3 }, (x) => bj(x).player.length === 5 && bj(x).outcome === 'win');
    expect(r.mult).toBe(2);
  });
  it('Surrender folds a hopeless hand for half the bet', () => {
    const r = find('blackjack', { perk_winStreak: 3 }, (x) => !!bj(x).surrendered);
    expect(r.mult).toBe(0.5);
  });
  it('Even Money keeps a dealer natural from beating you', () => {
    const natural = (x: Round) => bj(x).dealer.length === 2 && bj(x).outcome === 'lose' && x.mult === 0 && /Dealer blackjack/.test(x.detail);
    find('blackjack', {}, natural);
    const r = find('blackjack', { perk_loseCards2: 3 }, (x) => /even money/.test(x.detail));
    expect(r.mult).toBe(1.25);
  });
  it('Card Counter never busts and Dealer Tilt hands the dealer more cards', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 3000; i++) expect(bj(TABLES.blackjack.play(rng, { perk_collect_blackjack: 1 })).outcome).not.toBe('bust');
    const dealerCards = (levels: Record<string, number>) => {
      const r = mulberry32(9);
      let n = 0;
      for (let i = 0; i < 4000; i++) n += bj(TABLES.blackjack.play(r, levels)).dealer.length;
      return n;
    };
    expect(dealerCards({ perk_loseCards6: 3 })).toBeGreaterThan(dealerCards({}));
  });
});
