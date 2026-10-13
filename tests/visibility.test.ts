import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/game';
import { createInitialState } from '../src/core/state';
import { mulberry32 } from '../src/core/rng';

const fresh = () => new Game(createInitialState(0), mulberry32(1));

describe('feature visibility', () => {
  it('shows only the next table and hides the casino at the start', () => {
    const g = fresh();
    expect(g.tableVisible('coinflip')).toBe(true);
    expect(g.tableVisible('slots')).toBe(true);
    expect(g.tableVisible('roulette')).toBe(false);
    expect(g.tableVisible('blackjack')).toBe(false);
    expect(g.casinoVisible()).toBe(false);
  });

  it('reveals the following table once one is unlocked', () => {
    const g = fresh();
    g.state.tables.slots.unlocked = true;
    expect(g.tableVisible('roulette')).toBe(true);
    expect(g.tableVisible('blackjack')).toBe(false);
  });

  it('reveals the casino once ascension is available', () => {
    const g = fresh();
    g.state.tables.blackjack.unlocked = true;
    expect(g.casinoVisible()).toBe(false);
    g.state.tables.blackjack.peakWallet = 1e15;
    expect(g.canAscend()).toBe(true);
    expect(g.casinoVisible()).toBe(true);
  });

  it('keeps the casino visible after ascending', () => {
    const g = fresh();
    g.state.casino.ascensions = 1;
    expect(g.casinoVisible()).toBe(true);
  });
});
