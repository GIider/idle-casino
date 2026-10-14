import { describe, expect, it } from 'vitest';
import { betAtLevel, maxBet, minBet } from '../src/core/economy';
import { TABLES } from '../src/tables';

describe('betAtLevel', () => {
  const def = TABLES.coinflip;
  it('is clamped to min/max bet and never decreases with level', () => {
    let prev = 0;
    for (let l = 0; l <= 7; l++) {
      const b = betAtLevel(def, 0, 1e9, l);
      expect(b).toBeGreaterThanOrEqual(Math.floor(minBet(def, 0)));
      expect(b).toBeLessThanOrEqual(maxBet(def, 0));
      expect(b).toBeGreaterThanOrEqual(prev);
      prev = b;
    }
  });
  it('falls back to the minimum bet on an empty wallet', () => {
    expect(betAtLevel(def, 0, 0, 3)).toBe(Math.floor(minBet(def, 0)));
  });
});
