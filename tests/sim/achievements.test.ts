import { describe, it } from 'vitest';
import { BOTS, median, runSeeds } from '../../src/sim/bots';
import { ACHIEVEMENTS, maxTier } from '../../src/core/achievements';

/** Prints when each achievement tier is reached by the greedy bot (no assertions: this is the tuning report). */
describe.skipIf(!(globalThis as any).process?.env?.SIM_REPORT)('balance: achievement unlock times', () => {
  it('reports minutes to each tier', () => {
    const cap = 150;
    const runs = runSeeds(BOTS.find((b) => b.id === 'greedy')!, [1, 2, 3], { maxMinutes: cap, ignoreAscension: true });
    const rows = ACHIEVEMENTS.map((a) => {
      const tiers = Array.from({ length: maxTier(a) }, (_, i) => {
        const xs = runs.map((r) => r.achievementAt[a.id]?.[i] ?? Infinity);
        return median(xs);
      });
      return { id: a.id, tiers };
    });
    const f = (x: number) => (Number.isFinite(x) ? x.toFixed(0).padStart(4) : '   -');
    rows.sort((a, b) => (a.tiers[0] ?? 0) - (b.tiers[0] ?? 0));
    console.log(`achievement tiers (median min, '-' = not within ${cap})\n` + rows.map((r) => `${r.id.padEnd(22)} ${r.tiers.map(f).join(' ')}`).join('\n'));
  }, 600000);
});
