import { describe, expect, it } from 'vitest';
import { TABLES, TABLE_IDS } from '../src/tables';
import { mulberry32 } from '../src/core/rng';
import { resolvePlay } from '../src/core/economy';

function rtp(id: keyof typeof TABLES, levels: Record<string, number> = {}, option = '', n = 200000) {
  const def = TABLES[id];
  const rng = mulberry32(42);
  let ret = 0;
  for (let i = 0; i < n; i++) ret += def.play(rng, levels, option || (def.options?.[0].id ?? '')).mult;
  return ret / n;
}

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
    for (const opt of ['color', 'dozen', 'number']) {
      const r = rtp('roulette', {}, opt);
      expect(r).toBeGreaterThan(0.9);
      expect(r).toBeLessThan(1.0);
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
        const o = resolvePlay(def, { luck: 10, payout: 20 }, 0, def.options?.[0].id ?? '', def.baseMaxBet, rng);
        expect(o.payout).toBeGreaterThanOrEqual(0);
        expect(o.payout - o.bet).toBeLessThanOrEqual(def.baseMaxPayout);
      }
    }
  });
});
