import { describe, expect, it } from 'vitest';
import { BOTS, median, runSeeds } from '../../src/sim/bots';
import { ACHIEVEMENTS } from '../../src/core/achievements';

/** The greedy bot finishes the shop (the whole game) in about 100 minutes; every achievement has to land before that. */
/** Cold Comfort (tails in a row) is only reachable before Lucky Charm re-rolls the tails away, so it lands in the first minutes. */
const EARLIEST = 2;
const LATEST = 100;

describe('balance: achievement unlock times', () => {
  it('every achievement unlocks within the game, not before it has had a chance to matter', () => {
    const runs = runSeeds(BOTS.find((b) => b.id === 'greedy')!, [1, 2, 3], { maxMinutes: 150, ignoreAscension: true });
    const rows = ACHIEVEMENTS.map((a) => ({
      id: a.id,
      at: median(runs.map((r) => r.achievementAt[a.id]?.[0] ?? Infinity)),
    })).sort((a, b) => a.at - b.at);
    if ((globalThis as any).process?.env?.SIM_REPORT) {
      console.log('achievement unlocks (median min, - = not within 150)\n' + rows.map((r) => `${r.id.padEnd(22)} ${Number.isFinite(r.at) ? r.at.toFixed(0).padStart(4) : '   -'}`).join('\n'));
    }
    for (const r of rows) {
      expect(r.at, `${r.id} unlock minute`).toBeGreaterThanOrEqual(EARLIEST);
      expect(r.at, `${r.id} unlock minute`).toBeLessThanOrEqual(LATEST);
    }
  }, 600000);
});
