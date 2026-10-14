import { describe, expect, it } from 'vitest';
import { BOTS, runBot } from '../../src/sim/bots';

describe('balance: prestige keeps going', () => {
  it('the greedy bot keeps prestiging Coin Flip without hitting a wall', () => {
    const bot = BOTS.find((b) => b.id === 'greedy')!;
    const run = runBot(bot, { seed: 1, maxMinutes: 120, ignoreAscension: true });
    const times = run.events.filter((e) => e.kind === 'prestige' && e.label.startsWith('coinflip')).map((e) => e.t);
    console.log('coinflip prestige minutes:', times.map((t) => t.toFixed(1)).join(' '));
    // No wall: each prestige still takes under 2x as long as the one before it at the end of the run.
    const gap = (i: number) => times[i] - times[i - 1];
    expect(gap(times.length - 1)).toBeLessThan(2 * gap(times.length - 2));
    expect(times.length).toBeGreaterThanOrEqual(10);
  }, 600000);
});
