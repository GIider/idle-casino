import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/game';
import { createInitialState } from '../src/core/state';
import { mulberry32 } from '../src/core/rng';
import { TABLES, TABLE_IDS } from '../src/tables';
import { allUpgrades, upgradeCost } from '../src/core/economy';

/** A greedy bot: always buys the cheapest affordable upgrade, unlocks tables, prestiges when possible. */
function runBot(minutes: number, log?: (s: string) => void) {
  const g = new Game(createInitialState(0), mulberry32(99));
  const dt = 0.1;
  const unlockedAt: Record<string, number> = {};
  const prestigeAt: string[] = [];
  for (let step = 0; step < minutes * 600; step++) {
    g.tick(dt);
    if (step % 10 !== 0) continue;
    const t = step / 600;
    // Like a human would: click by hand at tables nobody is playing for yet.
    for (const id of TABLE_IDS) {
      if (g.table(id).unlocked && (g.table(id).levels.auto ?? 0) === 0) for (let i = 0; i < 6; i++) g.play(id);
    }
    for (const id of TABLE_IDS) {
      if (!g.table(id).unlocked && g.unlock(id)) {
        unlockedAt[id] = t;
      }
      if (g.canPrestige(id) && g.prestige(id)) prestigeAt.push(`${id}@${t.toFixed(1)}m`);
    }
    // buy cheapest upgrade across unlocked tables, repeatedly
    for (let n = 0; n < 5; n++) {
      let best: { id: (typeof TABLE_IDS)[number]; up: string; cost: number } | null = null;
      for (const id of TABLE_IDS) {
        const ts = g.table(id);
        if (!ts.unlocked) continue;
        for (const u of allUpgrades(TABLES[id])) {
          const lvl = ts.levels[u.id] ?? 0;
          if (lvl >= u.maxLevel) continue;
          const cost = upgradeCost(TABLES[id], u, ts.prestige, lvl, g.bonus);
          if (!best || cost < best.cost) best = { id, up: u.id, cost };
        }
      }
      if (!best || best.cost > g.state.money * 0.6 || !g.buyUpgrade(best.id, best.up)) break;
    }
    if (log && step % 12000 === 0) {
      log(`${t.toFixed(0)}m money=${Math.floor(g.state.money)} ` + TABLE_IDS.map((id) => `${id}:p${g.table(id).prestige}`).join(' '));
    }
  }
  return { g, unlockedAt, prestigeAt };
}

describe('progression', () => {
  it('a greedy player progresses through the tables', () => {
    const lines: string[] = [];
    const { g, unlockedAt, prestigeAt } = runBot(45, (s) => lines.push(s));
    console.log(lines.join('\n'));
    console.log('unlocked', unlockedAt, 'prestiges', prestigeAt.slice(0, 12));
    expect(g.state.money).toBeGreaterThan(100);
    expect(unlockedAt.slots).toBeDefined();
  }, 120000);
});
