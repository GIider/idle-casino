import { describe, it } from 'vitest';
import { BOTS, perkMarginals } from '../../src/sim/bots';
import { ACHIEVEMENTS } from '../../src/core/achievements';

/** Prints how many minutes each achievement perk saves the greedy bot unlocked (tuning report, no assertions). */
describe.skipIf(!(globalThis as any).process?.env?.SIM_REPORT)('balance: achievement perk value', () => {
  it('reports minutes saved per perk', () => {
    const rows = perkMarginals(BOTS.find((b) => b.id === 'greedy')!, [1, 2, 3, 4], ACHIEVEMENTS.map((a) => a.id), 150);
    rows.sort((a, b) => b.minutesSaved - a.minutesSaved);
    console.log(rows.map((r) => `${r.id.padEnd(22)} ${r.minutesSaved >= 0 ? '+' : ''}${r.minutesSaved.toFixed(1)} min (locked ${r.alt.toFixed(0)} / max ${r.base.toFixed(0)})`).join('\n'));
  }, 1800000);
});
