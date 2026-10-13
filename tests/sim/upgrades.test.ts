import { describe, it } from 'vitest';
import { BOTS, upgradeMarginals } from '../../src/sim/bots';
import { COMMON_UPGRADES } from '../../src/core/economy';
import { TABLES, TABLE_IDS } from '../../src/tables';

/** Prints how many minutes each upgrade saves the greedy bot (no assertions: this is the tuning report). */
describe.skipIf(!(globalThis as any).process?.env?.SIM_REPORT)('balance: upgrade marginal value', () => {
  it('reports minutes saved per upgrade', () => {
    const ids = [...COMMON_UPGRADES.map((u) => u.id)];
    for (const t of TABLE_IDS) for (const u of TABLES[t].upgrades) if (!ids.includes(u.id)) ids.push(u.id);
    const rows = upgradeMarginals(BOTS.find((b) => b.id === 'greedy')!, [1, 2, 3, 4, 5, 6], ids, 150);
    rows.sort((a, b) => b.minutesSaved - a.minutesSaved);
    console.log(
      `baseline ${rows[0].base.toFixed(1)} min\n` +
        rows.map((r) => `${r.id.padEnd(12)} ${r.minutesSaved >= 0 ? '+' : ''}${r.minutesSaved.toFixed(1)} min saved`).join('\n'),
    );
  }, 900000);
});
