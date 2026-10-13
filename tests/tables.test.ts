import { describe, expect, it } from 'vitest';
import { TABLES, TABLE_IDS } from '../src/tables';
import { mulberry32 } from '../src/core/rng';
import { resolvePlay } from '../src/core/economy';

function rtp(id: keyof typeof TABLES, levels: Record<string, number> = {}, n = 200000) {
  const def = TABLES[id];
  const rng = mulberry32(42);
  let ret = 0;
  for (let i = 0; i < n; i++) ret += def.play(rng, levels).mult;
  return ret / n;
}

describe('self-sustaining tables', () => {
  it('every table is profitable on its own wallet before any upgrades', () => {
    for (const id of TABLE_IDS) {
      const def = TABLES[id];
      const bet = def.baseMinBet * 10;
      const rng = mulberry32(7);
      let net = 0;
      const n = 40000;
      for (let i = 0; i < n; i++) net += resolvePlay(def, {}, 0, bet, rng).net;
      expect(net / n / bet, id).toBeGreaterThan(0.02);
    }
  });
});

describe('base return to player', () => {
  it('coin flip is a slight player edge', () => {
    expect(rtp('coinflip')).toBeGreaterThan(1.08);
    expect(rtp('coinflip')).toBeLessThan(1.12);
  });
  it('slots have a house edge', () => {
    const r = rtp('slots');
    expect(r).toBeGreaterThan(0.85);
    expect(r).toBeLessThan(0.97);
  });
  it('roulette bets have a house edge', () => {
    for (const levels of [{} as Record<string, number>, { bet_dozen: 1 }, { bet_number: 1 }, { bet_dozen: 1, bet_number: 1 }]) {
      const r = rtp('roulette', levels);
      expect(r, JSON.stringify(levels)).toBeGreaterThan(0.9);
      expect(r, JSON.stringify(levels)).toBeLessThan(1.0);
    }
  });
  it('blackjack has a house edge', () => {
    const r = rtp('blackjack');
    expect(r).toBeGreaterThan(0.88);
    expect(r).toBeLessThan(0.99);
  });
});

describe('upgrades help the player', () => {
  it('table specific upgrades raise return', () => {
    expect(rtp('coinflip', { edge: 5 })).toBeGreaterThan(rtp('coinflip'));
    expect(rtp('slots', { loaded: 8 })).toBeGreaterThan(rtp('slots'));
    expect(rtp('roulette', { zero: 4 })).toBeGreaterThan(rtp('roulette'));
    expect(rtp('blackjack', { sleeve: 5 })).toBeGreaterThan(rtp('blackjack'));
    expect(rtp('blackjack', { strategy: 2 })).toBeGreaterThan(rtp('blackjack') - 0.001);
  });
});

describe('resolvePlay', () => {
  it('never pays out more than the cap and never negative', () => {
    for (const id of TABLE_IDS) {
      const def = TABLES[id];
      const rng = mulberry32(7);
      for (let i = 0; i < 5000; i++) {
        const o = resolvePlay(def, { luck: 10, payout: 20 }, 0, def.baseMaxBet, rng);
        expect(o.payout).toBeGreaterThanOrEqual(0);
        expect(o.payout - o.bet).toBeLessThanOrEqual(def.baseMaxPayout);
      }
    }
  });
});
