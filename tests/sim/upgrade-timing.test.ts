import { describe, expect, it } from 'vitest';
import { BOTS, median, runSeeds, upgradeTimeline, type RunResult } from '../../src/sim/bots';
import { TABLE_IDS } from '../../src/tables';
import { CORE_UPGRADES } from '../../src/core/economy';

const SEEDS = [1, 2, 3];
/** Minutes after a table opens within which its core upgrades must be payable (all currencies) by the greedy bot. */
const CORE_WINDOW = 12;
const REPORT = !!(globalThis as any).process?.env?.SIM_REPORT;
const fmt = (x: number | null) => (x === null ? '    -' : x.toFixed(1).padStart(5));

/** When each upgrade becomes buyable and maxed, per strategy (time to first ascension caps what can be observed). */
describe('balance: upgrade availability', () => {
  const runs = new Map<string, RunResult[]>();
  it('runs every strategy', () => {
    for (const bot of BOTS) {
      if (bot.id === 'never-prestige') continue;
      runs.set(bot.id, runSeeds(bot, SEEDS, { maxMinutes: 150 }));
    }
  }, 900000);

  it.skipIf(!REPORT)('prints the timeline', () => {
    const out: string[] = [];
    for (const [id, rs] of runs) {
      out.push(`\n== ${id} ==  (minutes; afford = next level payable in all currencies, bottleneck = short currency)`);
      out.push('upgrade                 afford first  maxed maxAny  bottleneck');
      for (const r of upgradeTimeline(rs)) {
        out.push(`${(r.table + ':' + r.upgrade).padEnd(23)} ${fmt(r.affordable)} ${fmt(r.first)} ${fmt(r.maxed)} ${fmt(r.maxedAny)}  ${r.bottleneck}`);
      }
    }
    console.log(out.join('\n'));
  });

  it('every upgrade is buyable before the greedy bot ascends, and the core ones soon after their table opens', () => {
    const greedy = runs.get('greedy')!;
    const rows = upgradeTimeline(greedy);
    const finish = Math.max(...greedy.map((r) => r.ascendedAt ?? 150));
    for (const r of rows) {
      expect(r.affordable, `${r.table}:${r.upgrade} affordable`).not.toBeNull();
      expect(r.affordable!, `${r.table}:${r.upgrade} affordable`).toBeLessThanOrEqual(finish);
      if (!CORE_UPGRADES.includes(r.upgrade)) continue;
      const unlocked = median(greedy.map((x) => x.unlockedAt[r.table] ?? 0));
      expect(r.affordable! - unlocked, `${r.table}:${r.upgrade} minutes after unlock`).toBeLessThanOrEqual(CORE_WINDOW);
    }
  });

  it('cross-table prices matter: some upgrade at every later table is held up by an earlier currency', () => {
    const rows = upgradeTimeline(runs.get('greedy')!);
    for (const t of TABLE_IDS.slice(1)) {
      const tied = rows.filter((r) => r.table === t && r.bottleneck !== '-' && r.bottleneck !== 'own');
      expect(tied.length, t).toBeGreaterThan(0);
    }
  });
});
